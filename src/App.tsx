import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { AlertTriangle, ArrowRight, BellRing, CheckCircle2, Scissors, X } from 'lucide-react';
import {
  auth,
  db,
  handleFirestoreError,
  isSuperAdminEmail,
  makeConversationId,
  makeLikeId,
  OperationType,
  tsToMillis,
} from './firebase';
import {
  ActivityLog,
  AppNotification,
  AppView,
  BarberService,
  BarberStory,
  BlockedUserRecord,
  Booking,
  CommunityMessage,
  ContentReport,
  Conversation,
  Friendship,
  GalleryItem,
  LikeRecord,
  LikeTargetType,
  MemberLiveStatus,
  PlatformAnnouncement,
  ProfilePost,
  Review,
  RoleDefinition,
  StaffGuideline,
  StaffMessage,
  StoreConfig,
  StoryReaction,
  SupportTicket,
  TypingStatus,
  UserProfile,
  VerificationRequest,
} from './types';
import { playNotificationChime } from './utils/audio';
import { isBarberMember, isStaffMember, setDynamicRoleDefinitions } from './utils/roles';
import {
  MAX_TEXT_LENGTHS,
  sanitizeMediaUrl,
  sanitizePlainText,
} from './utils/security';
import {
  generateUniqueNumericId,
  isActiveSpecialId,
  isValidUsername,
} from './utils/username';
import { awardAureliusCoins } from './utils/gamification';
import { claimDailyLoginReward } from './utils/store';
import {
  acceptFriendRequest,
  rejectOrRemoveFriendship,
  sendFriendRequest,
} from './utils/friends';
import { ReportContentModal, ReportRequestPayload } from './components/ReportContentModal';
import { PrivacyAndPolicyModal } from './components/PrivacyAndPolicyModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthScreen } from './components/AuthScreen';
import { OnboardingTour } from './components/OnboardingTour';
import { NavigationChrome, BannedScreen } from './components/NavigationChrome';
import { GalleryView } from './components/GalleryView';
import { StoriesView } from './components/StoriesView';
import { LeaderboardView } from './components/LeaderboardView';
import { CommunityChatView, ChatRoomMode } from './components/CommunityChatView';
import { BarberMapView } from './components/BarberMapView';
import { ProfileView } from './components/ProfileView';
import { PrivateChatAndBookingsView } from './components/PrivateChatAndBookingsView';
import { StoreView } from './components/StoreView';
import { AdminDashboardView } from './components/AdminDashboardView';
import { TicketsView } from './components/TicketsView';
import { StaffRoomView } from './components/StaffRoomView';
import { AboutAndUpdatesView } from './components/AboutAndUpdatesView';
import { JoinTeamView } from './components/JoinTeamView';
import { OfflineIndicator } from './components/PWAControls';
import { CountryPickerModal, CountryFlag } from './components/CountryPickerModal';
import {
  clearCountryScopedCaches,
  detectSuggestedCountryCode,
  getCountryByCode,
  getSavedCountryCode,
  isValidCountryCode,
  matchesActiveCountry,
  saveCountryCodeLocal,
} from './utils/countries';

const toMillis = tsToMillis;

interface NavSnapshot {
  view: AppView;
  chatRoomMode: ChatRoomMode;
  chatCountryCode: string;
  conversationId: string | null;
  profileUid: string | null;
  ticketId: string | null;
}

function isSameNavSnapshot(a: NavSnapshot, b: NavSnapshot): boolean {
  return (
    a.view === b.view &&
    (a.view !== 'community' ||
      (a.chatRoomMode === b.chatRoomMode &&
        a.chatCountryCode === b.chatCountryCode)) &&
    (a.view !== 'messages' || a.conversationId === b.conversationId) &&
    (a.view !== 'profile' || a.profileUid === b.profileUid) &&
    (a.view !== 'tickets' || a.ticketId === b.ticketId)
  );
}

const MainApp: React.FC = () => {
  const [authReady, setAuthReady] = useState(false);
  const [fbUser, setFbUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  // Google Maps quota / billing notice listener (GHP demo key flow)
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  // Navigation & UI state (Default landing view: Global Community Chat)
  const [activeView, setActiveView] = useState<AppView>('community');
  const [chatRoomMode, setChatRoomMode] = useState<ChatRoomMode>('global');
  const [chatCountryCode, setChatCountryCode] = useState<string | null>(null);
  const [profileTargetUid, setProfileTargetUid] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [navHistory, setNavHistory] = useState<NavSnapshot[]>([]);
  const [focusCommunityMsgId, setFocusCommunityMsgId] = useState<string | null>(null);
  const [focusStoryId, setFocusStoryId] = useState<string | null>(null);
  const [focusBookingId, setFocusBookingId] = useState<string | null>(null);
  const [bookingTriggerBarber, setBookingTriggerBarber] = useState<{
    barber: UserProfile;
    service?: BarberService;
  } | null>(null);
  const [showTour, setShowTour] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [liveToast, setLiveToast] = useState<AppNotification | null>(null);
  const suggestedCountryCode = useMemo(() => detectSuggestedCountryCode(), []);
  const [activeCountryCode, setActiveCountryCode] = useState<string | null>(() =>
    getSavedCountryCode()
  );
  const [countrySwitcherOpen, setCountrySwitcherOpen] = useState(false);
  const [countrySwitchToast, setCountrySwitchToast] = useState<string | null>(null);

  // Live Firestore collections
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [likes, setLikes] = useState<LikeRecord[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [communityMessages, setCommunityMessages] = useState<CommunityMessage[]>([]);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [verificationRequests, setVerificationRequests] = useState<VerificationRequest[]>([]);
  const [staffMessages, setStaffMessages] = useState<StaffMessage[]>([]);
  const [staffGuidelines, setStaffGuidelines] = useState<StaffGuideline[]>([]);
  const [stories, setStories] = useState<BarberStory[]>([]);
  const [storyReactions, setStoryReactions] = useState<StoryReaction[]>([]);
  const [announcements, setAnnouncements] = useState<PlatformAnnouncement[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [typingStatuses, setTypingStatuses] = useState<TypingStatus[]>([]);
  const [roleDefinitions, setRoleDefinitions] = useState<RoleDefinition[]>([]);
  const [storeConfig, setStoreConfig] = useState<StoreConfig | null>(null);
  const [storeConfigReady, setStoreConfigReady] = useState(false);
  const [usersReady, setUsersReady] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserRecord[]>([]);
  const [contentReports, setContentReports] = useState<ContentReport[]>([]);
  const [reportPayload, setReportPayload] = useState<ReportRequestPayload | null>(null);
  const [privacyModalState, setPrivacyModalState] = useState<{
    open: boolean;
    tab: 'privacy' | 'delete';
  }>({ open: false, tab: 'privacy' });

  const seenNotifIdsRef = useRef<Set<string>>(new Set());
  const notifInitializedRef = useRef(false);
  const dailyRewardCheckedRef = useRef<string | null>(null);
  const expiredSpecialIdHandledRef = useRef<string | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  const manualStatusOverrideRef = useRef<MemberLiveStatus | null>(null);

  // Exclusive Super Admin check strictly bound to hossambassmaji53@gmail.com
  const isSuperAdmin = Boolean(
    fbUser?.emailVerified && isSuperAdminEmail(fbUser.email)
  );

  useEffect(() => {
    const onQuota = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  // Bootstrap user profile & private PII record on verified auth
  const ensureUserProfile = useCallback(async (user: User) => {
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);
    const isAdminEmail = isSuperAdminEmail(user.email);
    const localCountry = getSavedCountryCode();
    manualStatusOverrideRef.current = null;

    if (!snap.exists()) {
      const displayName =
        sanitizePlainText(
          user.displayName || (isAdminEmail ? 'المؤسس' : 'عضو جديد'),
          MAX_TEXT_LENGTHS.displayName,
          { multiline: false }
        ) || (isAdminEmail ? 'المؤسس' : 'عضو جديد');

      await setDoc(userRef, {
        uid: user.uid,
        displayName,
        username: generateUniqueNumericId(user.uid),
        photoURL: sanitizeMediaUrl(user.photoURL) || '',
        role: isAdminEmail ? 'admin' : 'customer',
        roles: [isAdminEmail ? 'admin' : 'customer'],
        ...(localCountry ? { countryCode: localCountry } : {}),
        availability: 'available',
        liveStatus: 'online',
        points: 0,
        completedBookingsCount: 0,
        isOnline: true,
        lastActiveAt: serverTimestamp(),
        isMuted: false,
        isKicked: false,
        isBanned: false,
        isPublicProfile: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existing = snap.data() as UserProfile & { email?: unknown };
      const missingUsernamePatch = !isValidUsername(existing.username)
        ? { username: generateUniqueNumericId(user.uid) }
        : {};
      const missingCountryPatch =
        !isValidCountryCode(existing.countryCode) && localCountry
          ? { countryCode: localCountry }
          : {};
      const legacyCleanupPatch: Record<string, unknown> = {};
      if ('email' in existing) {
        legacyCleanupPatch.email = deleteField();
      }
      if (!existing.createdAt) {
        legacyCleanupPatch.createdAt = serverTimestamp();
      }
      if (
        typeof existing.displayName !== 'string' ||
        existing.displayName.trim().length === 0
      ) {
        legacyCleanupPatch.displayName =
          sanitizePlainText(
            user.displayName || (isAdminEmail ? 'المؤسس' : 'عضو جديد'),
            MAX_TEXT_LENGTHS.displayName,
            { multiline: false }
          ) || (isAdminEmail ? 'المؤسس' : 'عضو جديد');
      }
      if (!existing.availability) {
        legacyCleanupPatch.availability = 'available';
      }
      if (
        typeof existing.points !== 'number' ||
        !Number.isInteger(existing.points) ||
        existing.points < 0
      ) {
        legacyCleanupPatch.points = Math.max(0, Math.round(Number(existing.points) || 0));
      }
      if (typeof existing.isMuted !== 'boolean') {
        legacyCleanupPatch.isMuted = false;
      }
      if (typeof existing.isKicked !== 'boolean') {
        legacyCleanupPatch.isKicked = false;
      }
      if (typeof existing.isBanned !== 'boolean') {
        legacyCleanupPatch.isBanned = false;
      }
      if (existing.isPublicProfile !== true) {
        legacyCleanupPatch.isPublicProfile = true;
      }
      if (!Array.isArray(existing.roles) || existing.roles.length === 0) {
        legacyCleanupPatch.roles = [existing.role || (isAdminEmail ? 'admin' : 'customer')];
      }
      if (existing.photoURL && !sanitizeMediaUrl(existing.photoURL)) {
        legacyCleanupPatch.photoURL = sanitizeMediaUrl(user.photoURL) || '';
      }
      if (existing.coverURL && !sanitizeMediaUrl(existing.coverURL)) {
        legacyCleanupPatch.coverURL = '';
      }

      if (isAdminEmail && existing.role !== 'admin') {
        await updateDoc(userRef, {
          role: 'admin',
          roles: ['admin'],
          ...missingUsernamePatch,
          ...missingCountryPatch,
          ...legacyCleanupPatch,
          liveStatus: 'online',
          isOnline: true,
          lastActiveAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else if (!existing.isBanned) {
        await updateDoc(userRef, {
          ...missingUsernamePatch,
          ...missingCountryPatch,
          ...legacyCleanupPatch,
          liveStatus: 'online',
          isOnline: true,
          lastActiveAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else if (
        Object.keys(missingUsernamePatch).length > 0 ||
        Object.keys(missingCountryPatch).length > 0 ||
        Object.keys(legacyCleanupPatch).length > 0
      ) {
        await updateDoc(userRef, {
          ...missingUsernamePatch,
          ...missingCountryPatch,
          ...legacyCleanupPatch,
          updatedAt: serverTimestamp(),
        });
      }
    }

    if (user.email) {
      const privRef = doc(db, 'users', user.uid, 'private', 'info');
      const privSnap = await getDoc(privRef);
      if (!privSnap.exists()) {
        await setDoc(privRef, {
          uid: user.uid,
          email: user.email.slice(0, 160),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFbUser(user);
      if (!user) {
        setCurrentUser(null);
        setUsers([]);
        setGallery([]);
        setLikes([]);
        setSupportTickets([]);
        setCommunityMessages([]);
        setPosts([]);
        setConversations([]);
        setBookings([]);
        setReviews([]);
        setNotifications([]);
        setActivityLogs([]);
        setVerificationRequests([]);
        setStaffMessages([]);
        setStaffGuidelines([]);
        setStories([]);
  setAnnouncements([]);
        setFriendships([]);
        setTypingStatuses([]);
        setRoleDefinitions([]);
        setDynamicRoleDefinitions([]);
        setStoreConfig(null);
        setStoreConfigReady(false);
        setUsersReady(false);
        setBlockedUsers([]);
        setContentReports([]);
        setReportPayload(null);
        setPrivacyModalState({ open: false, tab: 'privacy' });
        dailyRewardCheckedRef.current = null;
        expiredSpecialIdHandledRef.current = null;
        notifInitializedRef.current = false;
        seenNotifIdsRef.current.clear();
        setNavHistory([]);
        navHistoryRef.current = [];
        setActiveView('community');
        setActiveConversationId(null);
        setProfileTargetUid(null);
        setActiveTicketId(null);
        setChatRoomMode('global');
        setChatCountryCode(null);
        setAuthReady(true);
        return;
      }

      if (user.emailVerified) {
        try {
          await ensureUserProfile(user);
          const tourKey = `aurelius_barber_tour_v3_seen_${user.uid}`;
          if (!localStorage.getItem(tourKey)) {
            setShowTour(true);
          }
        } catch (err) {
          console.error('Failed to bootstrap profile:', err);
        }
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, [ensureUserProfile]);

  const handleVerifiedRefresh = async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    const refreshed = auth.currentUser;
    setFbUser({ ...refreshed } as User);
    if (refreshed.emailVerified) {
      await ensureUserProfile(refreshed);
      const tourKey = `aurelius_barber_tour_v3_seen_${refreshed.uid}`;
      if (!localStorage.getItem(tourKey)) {
        setShowTour(true);
      }
    }
  };

  // Central manual live status switcher (online / cutting / offline)
  const handleChangeLiveStatus = useCallback(
    async (status: MemberLiveStatus) => {
      if (!fbUser || !fbUser.emailVerified || !currentUser || currentUser.isBanned) {
        return;
      }
      manualStatusOverrideRef.current = status;
      const updates: Record<string, unknown> = {
        liveStatus: status,
        isOnline: status !== 'offline',
        lastActiveAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (isBarberMember(currentUser)) {
        updates.availability = status === 'online' ? 'available' : 'busy';
      }
      try {
        await updateDoc(doc(db, 'users', currentUser.uid), updates);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
      }
    },
    [fbUser, currentUser]
  );

  // Real-time auto-online / auto-offline presence tracking (30s heartbeat + close/hide sync)
  useEffect(() => {
    if (!fbUser || !fbUser.emailVerified || !currentUser || currentUser.isBanned) {
      return;
    }

    const userRef = doc(db, 'users', fbUser.uid);
    let lastOnlineWriteAt = 0;

    const setPresence = (online: boolean, force = false) => {
      if (manualStatusOverrideRef.current === 'offline' && online) {
        return;
      }
      const now = Date.now();
      if (online && !force && now - lastOnlineWriteAt < 10 * 1000) {
        return;
      }
      if (online) {
        lastOnlineWriteAt = now;
      }
      const activeStatus: MemberLiveStatus =
        manualStatusOverrideRef.current === 'cutting' ? 'cutting' : 'online';
      updateDoc(userRef, {
        isOnline: online,
        liveStatus: online ? activeStatus : 'offline',
        lastActiveAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    };

    const isVisibleAndConnected = () =>
      document.visibilityState === 'visible' &&
      (typeof navigator === 'undefined' || navigator.onLine !== false);

    if (manualStatusOverrideRef.current !== 'offline') {
      setPresence(isVisibleAndConnected(), true);
    }

    const heartbeat = window.setInterval(() => {
      if (isVisibleAndConnected() && manualStatusOverrideRef.current !== 'offline') {
        setPresence(true, true);
      }
    }, 30 * 1000);

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setPresence(false, true);
      } else if (isVisibleAndConnected()) {
        setPresence(true, true);
      }
    };

    const handleFocus = () => {
      if (isVisibleAndConnected()) {
        setPresence(true, false);
      }
    };

    const handleOnline = () => {
      if (document.visibilityState === 'visible') {
        setPresence(true, true);
      }
    };

    const handleOffline = () => {
      setPresence(false, true);
    };

    const handlePageHide = () => {
      setPresence(false, true);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);

    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
    };
  }, [fbUser?.uid, fbUser?.emailVerified, currentUser?.uid, currentUser?.isBanned]);

  const handleSignOut = useCallback(async () => {
    manualStatusOverrideRef.current = 'offline';
    if (fbUser && fbUser.emailVerified) {
      try {
        await updateDoc(doc(db, 'users', fbUser.uid), {
          liveStatus: 'offline',
          isOnline: false,
          lastActiveAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Proceed with sign out even if offline update fails
      }
    }
    await signOut(auth);
  }, [fbUser]);

  // Listen to own profile first (keep points anchored to confirmed server values so pending writes never flicker)
  useEffect(() => {
    if (!fbUser || !fbUser.emailVerified) return;
    const unsub = onSnapshot(
      doc(db, 'users', fbUser.uid),
      (snap) => {
        if (snap.exists()) {
          const next = snap.data({ serverTimestamps: 'estimate' }) as UserProfile;
          setCurrentUser((prev) => {
            if (snap.metadata.hasPendingWrites && prev) {
              return {
                ...next,
                points: prev.points,
                lastDailyClaimDate: prev.lastDailyClaimDate,
              };
            }
            return next;
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${fbUser.uid}`)
    );
    return () => unsub();
  }, [fbUser?.uid, fbUser?.emailVerified]);

  // Listen to real-time collections once verified & not banned
  useEffect(() => {
    if (!fbUser || !fbUser.emailVerified || !currentUser || currentUser.isBanned) {
      return;
    }

    const uid = fbUser.uid;
    const isStaff = isStaffMember(currentUser, isSuperAdmin);
    const unsubs: (() => void)[] = [];

    // 1. Public users
    unsubs.push(
      onSnapshot(
        query(collection(db, 'users'), where('isPublicProfile', '==', true)),
        (snap) => {
          const list = snap.docs
            .map((d) => d.data({ serverTimestamps: 'estimate' }) as UserProfile)
            .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ar'));
          setUsers(list);
          setUsersReady(true);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'users')
      )
    );

    // 2. Gallery items
    unsubs.push(
      onSnapshot(
        query(collection(db, 'gallery'), where('visibility', '==', 'public')),
        (snap) => {
          const list = snap.docs
            .map((d) => d.data({ serverTimestamps: 'estimate' }) as GalleryItem)
            .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
          setGallery(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'gallery')
      )
    );

    // 3. Dual Likes (Profile & Gallery)
    unsubs.push(
      onSnapshot(
        query(collection(db, 'likes'), where('targetType', 'in', ['profile', 'gallery'])),
        (snap) => {
          setLikes(snap.docs.map((d) => d.data({ serverTimestamps: 'estimate' }) as LikeRecord));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'likes')
      )
    );

    // 4. Confidential Support Tickets (Staff see all, Users see own only)
    unsubs.push(
      onSnapshot(
        isStaff
          ? collection(db, 'supportTickets')
          : query(collection(db, 'supportTickets'), where('userId', '==', uid)),
        (snap) => {
          const list = snap.docs
            .map((d) => d.data({ serverTimestamps: 'estimate' }) as SupportTicket)
            .sort(
              (a, b) =>
                (toMillis(b.lastMessageAt) || toMillis(b.createdAt)) -
                (toMillis(a.lastMessageAt) || toMillis(a.createdAt))
            );
          setSupportTickets(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'supportTickets')
      )
    );

    // 5. Community chat messages
    unsubs.push(
      onSnapshot(
        query(collection(db, 'communityMessages'), where('visibility', '==', 'public')),
        (snap) => {
          const list = snap.docs
            .map((d) => d.data({ serverTimestamps: 'estimate' }) as CommunityMessage)
            .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
          setCommunityMessages(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'communityMessages')
      )
    );

    // 6. Profile posts
    unsubs.push(
      onSnapshot(
        query(collection(db, 'posts'), where('visibility', '==', 'public')),
        (snap) => {
          const list = snap.docs
            .map((d) => d.data({ serverTimestamps: 'estimate' }) as ProfilePost)
            .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
          setPosts(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'posts')
      )
    );

    // 7. Reviews
    unsubs.push(
      onSnapshot(
        query(collection(db, 'reviews'), where('visibility', '==', 'public')),
        (snap) => {
          const list = snap.docs
            .map((d) => d.data({ serverTimestamps: 'estimate' }) as Review)
            .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
          setReviews(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'reviews')
      )
    );

    // 8. Conversations
    let convsP1: Conversation[] = [];
    let convsP2: Conversation[] = [];
    const mergeConversations = () => {
      const merged = new Map<string, Conversation>();
      [...convsP1, ...convsP2].forEach((c) => merged.set(c.id, c));
      const sorted = Array.from(merged.values()).sort(
        (a, b) =>
          (toMillis(b.lastMessageAt) || toMillis(b.updatedAt)) -
          (toMillis(a.lastMessageAt) || toMillis(a.updatedAt))
      );
      setConversations(sorted);
    };

    unsubs.push(
      onSnapshot(
        query(collection(db, 'conversations'), where('participant1Id', '==', uid)),
        (snap) => {
          convsP1 = snap.docs.map((d) => d.data({ serverTimestamps: 'estimate' }) as Conversation);
          mergeConversations();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'conversations/p1')
      )
    );
    unsubs.push(
      onSnapshot(
        query(collection(db, 'conversations'), where('participant2Id', '==', uid)),
        (snap) => {
          convsP2 = snap.docs.map((d) => d.data({ serverTimestamps: 'estimate' }) as Conversation);
          mergeConversations();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'conversations/p2')
      )
    );

    // 9. Bookings
    let booksCust: Booking[] = [];
    let booksBarb: Booking[] = [];
    const mergeBookings = () => {
      const merged = new Map<string, Booking>();
      [...booksCust, ...booksBarb].forEach((b) => merged.set(b.id, b));
      const sorted = Array.from(merged.values()).sort(
        (a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)
      );
      setBookings(sorted);
    };

    unsubs.push(
      onSnapshot(
        query(collection(db, 'bookings'), where('customerId', '==', uid)),
        (snap) => {
          booksCust = snap.docs.map((d) => d.data({ serverTimestamps: 'estimate' }) as Booking);
          mergeBookings();
      },
        (err) => handleFirestoreError(err, OperationType.LIST, 'bookings/customer')
      )
    );
    unsubs.push(
      onSnapshot(
        query(collection(db, 'bookings'), where('barberId', '==', uid)),
        (snap) => {
          booksBarb = snap.docs.map((d) => d.data({ serverTimestamps: 'estimate' }) as Booking);
          mergeBookings();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'bookings/barber')
      )
    );

    // 10. Live Notifications + Custom Sound Trigger
    unsubs.push(
      onSnapshot(
        query(collection(db, 'notifications'), where('recipientId', '==', uid)),
        (snap) => {
          const list = snap.docs
            .map((d) => d.data({ serverTimestamps: 'estimate' }) as AppNotification)
            .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

          if (!notifInitializedRef.current) {
            list.forEach((n) => seenNotifIdsRef.current.add(n.id));
            notifInitializedRef.current = true;
          } else {
            const newUnread = list.filter(
              (n) => !n.read && !seenNotifIdsRef.current.has(n.id)
            );
            newUnread.forEach((n) => seenNotifIdsRef.current.add(n.id));
            if (newUnread.length > 0) {
              const latest = newUnread[0];
              if (soundEnabledRef.current) {
                playNotificationChime(
                  latest.type.startsWith('booking') ||
                    latest.type === 'verification_request' ||
                    latest.type.startsWith('ticket')
                    ? 'booking'
                    : 'message'
                );
              }
              setLiveToast(latest);
            }
          }
          setNotifications(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
      )
    );

    // 11. Barber Verification Requests
    unsubs.push(
      onSnapshot(
        isSuperAdmin
          ? collection(db, 'verificationRequests')
          : query(collection(db, 'verificationRequests'), where('userId', '==', uid)),
        (snap) => {
          const list = snap.docs
            .map((d) => d.data({ serverTimestamps: 'estimate' }) as VerificationRequest)
            .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
          setVerificationRequests(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'verificationRequests')
      )
    );

    // 12. Activity Logs (Full Administrative Activity Monitor for Super Admin & Moderators)
    if (isStaff) {
      unsubs.push(
        onSnapshot(
          collection(db, 'activityLogs'),
          (snap) => {
            const list = snap.docs
              .map((d) => d.data({ serverTimestamps: 'estimate' }) as ActivityLog)
              .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
            setActivityLogs(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'activityLogs')
        )
      );

      // 13. Confidential Staff Room Chat & Moderator Guidelines
      unsubs.push(
        onSnapshot(
          collection(db, 'staffMessages'),
          (snap) => {
            const list = snap.docs
              .map((d) => d.data({ serverTimestamps: 'estimate' }) as StaffMessage)
              .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
            setStaffMessages(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'staffMessages')
        )
      );

      unsubs.push(
        onSnapshot(
          collection(db, 'staffGuidelines'),
          (snap) => {
            const list = snap.docs
              .map((d) => d.data({ serverTimestamps: 'estimate' }) as StaffGuideline)
              .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
            setStaffGuidelines(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'staffGuidelines')
        )
      );
    } else {
      setActivityLogs([]);
      setStaffMessages([]);
      setStaffGuidelines([]);
    }

    // 14. Aurelius Stories (24h expiring updates)
    unsubs.push(
      onSnapshot(
        query(collection(db, 'stories'), where('visibility', '==', 'public')),
        (snap) => {
          const list = snap.docs
            .map((d) => d.data({ serverTimestamps: 'estimate' }) as BarberStory)
            .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
          setStories(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'stories')
      )
    );

    // 16. Platform Announcements (Coming Soon / Dev Log)
    unsubs.push(
      onSnapshot(
        query(collection(db, 'platformAnnouncements'), where('visibility', '==', 'public')),
        (snap) => {
          const list = snap.docs
            .map((d) => d.data({ serverTimestamps: 'estimate' }) as PlatformAnnouncement)
            .sort((a, b) => {
              if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
              return toMillis(b.createdAt) - toMillis(a.createdAt);
            });
          setAnnouncements(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'platformAnnouncements')
      )
    );

    // 17. Friendships (Requests & Accepted Friends)
    let friendsU1: Friendship[] = [];
    let friendsU2: Friendship[] = [];
    const mergeFriendships = () => {
      const merged = new Map<string, Friendship>();
      [...friendsU1, ...friendsU2].forEach((f) => merged.set(f.id, f));
      const sorted = Array.from(merged.values()).sort(
        (a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt)
      );
      setFriendships(sorted);
    };
    unsubs.push(
      onSnapshot(
        query(collection(db, 'friendships'), where('user1Id', '==', uid)),
        (snap) => {
          friendsU1 = snap.docs.map((d) => d.data({ serverTimestamps: 'estimate' }) as Friendship);
          mergeFriendships();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'friendships/u1')
      )
    );
    unsubs.push(
      onSnapshot(
        query(collection(db, 'friendships'), where('user2Id', '==', uid)),
        (snap) => {
          friendsU2 = snap.docs.map((d) => d.data({ serverTimestamps: 'estimate' }) as Friendship);
          mergeFriendships();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'friendships/u2')
      )
    );

    // 19. Real-time Community Room Typing Indicators
    unsubs.push(
      onSnapshot(
        query(collection(db, 'typingStatuses'), where('scope', 'in', ['global', 'local'])),
        (snap) => {
          setTypingStatuses(
            snap.docs.map((d) => d.data({ serverTimestamps: 'estimate' }) as TypingStatus)
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'typingStatuses')
      )
    );

    // 20. Dynamic Role Definitions
    unsubs.push(
      onSnapshot(
        collection(db, 'roleDefinitions'),
        (snap) => {
          const list = snap.docs
            .map((d) => d.data({ serverTimestamps: 'estimate' }) as RoleDefinition)
            .sort((a, b) => (a.hierarchyOrder || 50) - (b.hierarchyOrder || 50));
          setDynamicRoleDefinitions(list);
          setRoleDefinitions(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'roleDefinitions')
      )
    );

    // 21. Store Config
    unsubs.push(
      onSnapshot(
        doc(db, 'storeConfig', 'current'),
        (snap) => {
          setStoreConfig(
            snap.exists() ? (snap.data({ serverTimestamps: 'estimate' }) as StoreConfig) : null
          );
          setStoreConfigReady(true);
        },
        (err) => handleFirestoreError(err, OperationType.GET, 'storeConfig/current')
      )
    );

    // 22. Blocked Users (Owner private list)
    unsubs.push(
      onSnapshot(
        collection(db, 'users', uid, 'blockedUsers'),
        (snap) => {
          const list = snap.docs
            .map((d) => d.data({ serverTimestamps: 'estimate' }) as BlockedUserRecord)
            .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
          setBlockedUsers(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/blockedUsers`)
      )
    );

    // 23. Content Moderation Reports (Staff see all; members see own submitted reports)
    unsubs.push(
      onSnapshot(
        isStaff
          ? collection(db, 'contentReports')
          : query(collection(db, 'contentReports'), where('reporterId', '==', uid)),
        (snap) => {
          const list = snap.docs
            .map((d) => d.data({ serverTimestamps: 'estimate' }) as ContentReport)
            .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
          setContentReports(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'contentReports')
      )
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [fbUser?.uid, fbUser?.emailVerified, isSuperAdmin, currentUser?.isBanned, currentUser?.role, currentUser?.roles?.join(',')]);

  const activeStoryIdsKey = useMemo(
    () =>
      Array.from(new Set(stories.map((s) => s.id).filter(Boolean)))
        .sort()
        .join(','),
    [stories]
  );

  // 14b. Aurelius Story Quick Reactions (strictly scoped by active story IDs)
  useEffect(() => {
    if (!fbUser || !fbUser.emailVerified || !currentUser || currentUser.isBanned || !activeStoryIdsKey) {
      setStoryReactions([]);
      return;
    }

    const storyIds = activeStoryIdsKey.split(',').filter(Boolean);
    const chunks: string[][] = [];
    for (let i = 0; i < storyIds.length; i += 30) {
      chunks.push(storyIds.slice(i, i + 30));
    }

    const chunkMap = new Map<number, StoryReaction[]>();
    const syncMerged = () => {
      const merged = new Map<string, StoryReaction>();
      chunkMap.forEach((items) => {
        items.forEach((item) => merged.set(item.id, item));
      });
      setStoryReactions(Array.from(merged.values()));
    };

    const unsubs = chunks.map((chunk, idx) =>
      onSnapshot(
        query(collection(db, 'storyReactions'), where('storyId', 'in', chunk)),
        (snap) => {
          chunkMap.set(
            idx,
            snap.docs.map((d) => d.data({ serverTimestamps: 'estimate' }) as StoryReaction)
          );
          syncMerged();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'storyReactions')
      )
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [fbUser?.uid, fbUser?.emailVerified, currentUser?.uid, currentUser?.isBanned, activeStoryIdsKey]);

  useEffect(() => {
    if (!liveToast) return;
    const t = setTimeout(() => setLiveToast(null), 5500);
    return () => clearTimeout(t);
  }, [liveToast]);

  useEffect(() => {
    if (!countrySwitchToast) return;
    const t = setTimeout(() => setCountrySwitchToast(null), 4800);
    return () => clearTimeout(t);
  }, [countrySwitchToast]);

  // Keep local selected country synced with signed-in user's Firestore profile
  useEffect(() => {
    if (!currentUser) return;
    if (!activeCountryCode && isValidCountryCode(currentUser.countryCode)) {
      const saved = currentUser.countryCode.toUpperCase();
      saveCountryCodeLocal(saved);
      setActiveCountryCode(saved);
    } else if (
      activeCountryCode &&
      isValidCountryCode(activeCountryCode) &&
      !isValidCountryCode(currentUser.countryCode) &&
      !currentUser.isBanned
    ) {
      updateDoc(doc(db, 'users', currentUser.uid), {
        countryCode: activeCountryCode,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
  }, [currentUser, activeCountryCode]);

  // Auto-claim daily login reward via atomic transaction once storeConfig is loaded
  useEffect(() => {
    if (!fbUser?.emailVerified || !currentUser || currentUser.isBanned || !storeConfigReady) {
      return;
    }
    const claimCheckKey = `${currentUser.uid}:${currentUser.lastDailyClaimDate || ''}`;
    if (dailyRewardCheckedRef.current === claimCheckKey) return;
    dailyRewardCheckedRef.current = claimCheckKey;

    void claimDailyLoginReward(currentUser, storeConfig)
      .then((res) => {
        if (res.claimed && res.amount > 0) {
          setLiveToast({
            id: `daily_${Date.now()}`,
            recipientId: currentUser.uid,
            senderId: 'system',
            senderName: 'أوريليوس باربر',
            type: 'credit_grant',
            title: 'مكافأة الدخول اليومي',
            body: `تمت إضافة +${res.amount} كريدت إلى رصيدك!`,
            targetView: 'store',
            targetId: currentUser.uid,
            read: false,
            createdAt: null,
          });
        }
      })
      .catch(() => {});
  }, [
    fbUser?.emailVerified,
    currentUser?.uid,
    currentUser?.isBanned,
    currentUser?.lastDailyClaimDate,
    storeConfig,
    storeConfigReady,
  ]);

  // Expire timed Special IDs when expired
  useEffect(() => {
    if (!fbUser?.emailVerified || !currentUser || currentUser.isBanned) return;
    if (currentUser.isSpecialId && !isActiveSpecialId(currentUser, Date.now())) {
      const expireKey = `${currentUser.uid}:${currentUser.username || ''}`;
      if (expiredSpecialIdHandledRef.current !== expireKey) {
        expiredSpecialIdHandledRef.current = expireKey;
                        const takenHandles = new Set(
          users
            .filter((u) => u.uid !== currentUser.uid && u.username)
            .map((u) => u.username!.toLowerCase())
        );
        const baseCandidate = currentUser.baseUsername;
        const restoredUsername =
          isValidUsername(baseCandidate) &&
          !takenHandles.has(baseCandidate!.toLowerCase())
            ? baseCandidate!
            : generateUniqueNumericId(currentUser.uid, takenHandles);

        void updateDoc(doc(db, 'users', currentUser.uid), {
          username: restoredUsername,
          isSpecialId: false,
          specialIdLabel: '',
          specialIdExpiresAt: null,
          specialIdGrantedBy: '',
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    }
  }, [fbUser?.emailVerified, currentUser, users]);

  const resolvedCountryCode = activeCountryCode || suggestedCountryCode;
  const resolvedChatCountry = chatCountryCode || resolvedCountryCode;

  const currentNavSnap: NavSnapshot = useMemo(
    () => ({
      view: activeView,
      chatRoomMode,
      chatCountryCode: resolvedChatCountry,
      conversationId: activeConversationId,
      profileUid: profileTargetUid,
      ticketId: activeTicketId,
    }),
    [
      activeView,
      chatRoomMode,
      resolvedChatCountry,
      activeConversationId,
      profileTargetUid,
      activeTicketId,
    ]
  );

  const currentSnapRef = useRef<NavSnapshot>(currentNavSnap);
  currentSnapRef.current = currentNavSnap;
  const navHistoryRef = useRef<NavSnapshot[]>(navHistory);
  navHistoryRef.current = navHistory;
  const historySeqRef = useRef(0);
  const ignorePopstateCountRef = useRef(0);

  useEffect(() => {
    try {
      const currentState = window.history.state;
      if (!currentState || !currentState.aureliusNav) {
        window.history.replaceState({ aureliusNav: true, seq: 0 }, '');
        historySeqRef.current = 0;
      } else if (typeof currentState.seq === 'number') {
        historySeqRef.current = currentState.seq;
      }
    } catch {
      // Ignore if history API is restricted
    }
  }, []);

  const applyNavSnapshot = useCallback((snap: NavSnapshot) => {
    setActiveView(snap.view);
    setChatRoomMode(snap.chatRoomMode);
    setChatCountryCode(snap.chatCountryCode);
    setActiveConversationId(snap.conversationId);
    setProfileTargetUid(snap.profileUid);
    setActiveTicketId(snap.ticketId);
    if (snap.view !== 'community' && !(snap.view === 'messages' && snap.conversationId)) {
      mainRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, []);

  const navigateTo = useCallback(
    (next: Partial<NavSnapshot>) => {
      const cur = currentSnapRef.current;
      const targetView = next.view ?? cur.view;
      const targetSnap: NavSnapshot = {
        view: targetView,
        chatRoomMode: next.chatRoomMode ?? cur.chatRoomMode,
        chatCountryCode: next.chatCountryCode ?? cur.chatCountryCode,
        conversationId:
          next.conversationId !== undefined
            ? next.conversationId
            : targetView === 'messages'
              ? cur.conversationId
              : null,
        profileUid:
          next.profileUid !== undefined
            ? next.profileUid
            : targetView === 'profile'
              ? cur.profileUid
              : null,
        ticketId:
          next.ticketId !== undefined
            ? next.ticketId
            : targetView === 'tickets'
              ? cur.ticketId
              : null,
      };

      if (isSameNavSnapshot(cur, targetSnap)) {
        if (targetView !== 'community' && !(targetView === 'messages' && targetSnap.conversationId)) {
          mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        }
        return;
      }

      const prevTop = navHistoryRef.current[navHistoryRef.current.length - 1];
      const updatedStack =
        prevTop && isSameNavSnapshot(prevTop, cur)
          ? navHistoryRef.current
          : [...navHistoryRef.current, cur].slice(-40);
      navHistoryRef.current = updatedStack;
      setNavHistory(updatedStack);

      try {
        const nextSeq = historySeqRef.current + 1;
        historySeqRef.current = nextSeq;
        window.history.pushState({ aureliusNav: true, seq: nextSeq }, '');
      } catch {
        // Ignore if history API is restricted
      }

      applyNavSnapshot(targetSnap);
    },
    [applyNavSnapshot]
  );

  const handleSmartBack = useCallback(
    (fromPopstate = false) => {
      const cur = currentSnapRef.current;
      let nextStack = [...navHistoryRef.current];
      let prev: NavSnapshot | undefined;

      while (nextStack.length > 0) {
        const candidate = nextStack.pop();
        if (candidate && !isSameNavSnapshot(candidate, cur)) {
          prev = candidate;
          break;
        }
      }

      navHistoryRef.current = nextStack;
      setNavHistory(nextStack);

      if (prev) {
        applyNavSnapshot(prev);

        if (!fromPopstate && historySeqRef.current > 0) {
          ignorePopstateCountRef.current += 1;
          historySeqRef.current = Math.max(0, historySeqRef.current - 1);
          try {
            window.history.back();
          } catch {
            ignorePopstateCountRef.current = Math.max(
              0,
              ignorePopstateCountRef.current - 1
            );
          }
        }
        return;
      }

      if (cur.view !== 'community' || cur.chatRoomMode !== 'global') {
        applyNavSnapshot({
          view: 'community',
          chatRoomMode: 'global',
          chatCountryCode: resolvedCountryCode,
          conversationId: null,
          profileUid: null,
          ticketId: null,
        });
      }
    },
    [applyNavSnapshot, resolvedCountryCode]
  );

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      if (ignorePopstateCountRef.current > 0) {
        ignorePopstateCountRef.current -= 1;
        return;
      }
      // Ignore hash-only or external browser popstate events that are not part of app navigation
      if (!event.state?.aureliusNav) {
        return;
      }
      const nextSeq = typeof event.state.seq === 'number' ? event.state.seq : 0;
      if (nextSeq >= historySeqRef.current) {
        historySeqRef.current = nextSeq;
        return;
      }
      historySeqRef.current = nextSeq;
      handleSmartBack(true);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [handleSmartBack]);

  const getSnapshotLabel = useCallback((snap: NavSnapshot): string => {
    switch (snap.view) {
      case 'gallery':
        return 'المعرض';
      case 'community':
        return snap.chatRoomMode === 'global'
          ? 'الدردشة العامة'
          : `دردشة ${getCountryByCode(snap.chatCountryCode)?.nameAr || snap.chatCountryCode}`;
      case 'messages':
        return snap.conversationId ? 'المحادثة الخاصة' : 'الخاص';
      case 'stories':
        return 'الستوريات';
      case 'appointments':
        return 'المواعيد';
      case 'store':
        return 'المتجر والكريدت';
      case 'map':
        return 'الخريطة';
      case 'join_team':
        return 'انضم إلينا';
      case 'about':
        return 'الرتب والقوانين';
      case 'tickets':
        return 'تكتات الدعم';
      case 'staff_room':
        return 'غرفة الإشراف';
      case 'admin':
        return 'لوحة الإدارة';
      case 'profile':
        return snap.profileUid && currentUser && snap.profileUid === currentUser.uid
          ? 'ملفي الشخصي'
          : 'الملف الشخصي';
      case 'leaderboard':
        return 'المتصدرين';
      default:
        return 'الرئيسية';
    }
  }, [currentUser]);

  const effectivePreviousSnap = useMemo(() => {
    for (let i = navHistory.length - 1; i >= 0; i--) {
      if (!isSameNavSnapshot(navHistory[i], currentNavSnap)) {
        return navHistory[i];
      }
    }
    return null;
  }, [navHistory, currentNavSnap]);

  const canGoBack =
    Boolean(effectivePreviousSnap) ||
    activeView !== 'community' ||
    (activeView === 'community' && chatRoomMode !== 'global');
  const backLabel = useMemo(() => {
    if (effectivePreviousSnap) {
      return getSnapshotLabel(effectivePreviousSnap);
    }
    return activeView !== 'community' || chatRoomMode !== 'global'
      ? 'الدردشة العامة'
      : undefined;
  }, [effectivePreviousSnap, activeView, chatRoomMode, getSnapshotLabel]);

  const handleSelectCountry = useCallback(
    async (newCode: string, isSwitch: boolean) => {
      const normalized = newCode.toUpperCase();
      saveCountryCodeLocal(normalized);
      clearCountryScopedCaches();
      setActiveCountryCode(normalized);
      if (isSwitch) {
        setChatRoomMode('local');
      }
      setChatCountryCode(normalized);
      setFocusCommunityMsgId(null);
      setFocusStoryId(null);
      setBookingTriggerBarber(null);

      if (currentUser && !currentUser.isBanned) {
        try {
          await updateDoc(doc(db, 'users', currentUser.uid), {
            countryCode: normalized,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
        }
      }

      if (isSwitch) {
        setCountrySwitcherOpen(false);
        const countryMeta = getCountryByCode(normalized);
        setCountrySwitchToast(
          `تم الانتقال إلى مجتمع ${countryMeta?.nameAr || normalized} بنجاح`
        );
      }
    },
    [currentUser]
  );

  const handleOpenProfile = useCallback(
    (uid: string) => {
      navigateTo({ view: 'profile', profileUid: uid });
    },
    [navigateTo]
  );

  const handleToggleLike = useCallback(
    async (targetType: LikeTargetType, targetId: string) => {
      if (!currentUser) return;
      const likeId = makeLikeId(targetType, targetId, currentUser.uid);
      const existing = likes.find((l) => l.id === likeId);
      try {
        if (existing) {
          await deleteDoc(doc(db, 'likes', likeId));
        } else {
          await setDoc(doc(db, 'likes', likeId), {
            id: likeId,
            targetType,
            targetId,
            userId: currentUser.uid,
            createdAt: serverTimestamp(),
          });
          if (targetType === 'gallery') {
            void awardAureliusCoins(currentUser.uid, currentUser.points, 3);
          }
        }
      } catch (err) {
        handleFirestoreError(
          err,
          existing ? OperationType.DELETE : OperationType.CREATE,
          `likes/${likeId}`
        );
      }
    },
    [currentUser, likes]
  );

  const blockedUserIds = useMemo(
    () => blockedUsers.map((b) => b.blockedUserId),
    [blockedUsers]
  );

  const handleBlockUser = useCallback(
    async (targetUid: string, targetName: string, targetPhoto?: string) => {
      if (!currentUser || !targetUid || targetUid === currentUser.uid) return;
      const targetProfile = users.find((u) => u.uid === targetUid);
      if (targetProfile?.role === 'admin') return;

      const cleanName =
        sanitizePlainText(targetName, MAX_TEXT_LENGTHS.displayName, {
          multiline: false,
        }) || 'عضو';
      const cleanPhoto = sanitizeMediaUrl(targetPhoto);
      try {
        await setDoc(doc(db, 'users', currentUser.uid, 'blockedUsers', targetUid), {
          id: targetUid,
          blockerId: currentUser.uid,
          blockedUserId: targetUid,
          blockedUserName: cleanName,
          ...(cleanPhoto ? { blockedUserPhoto: cleanPhoto } : {}),
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.CREATE,
          `users/${currentUser.uid}/blockedUsers/${targetUid}`
        );
      }
    },
    [currentUser, users]
  );

  const handleUnblockUser = useCallback(
    async (targetUid: string) => {
      if (!currentUser || !targetUid) return;
    try {
        await deleteDoc(doc(db, 'users', currentUser.uid, 'blockedUsers', targetUid));
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.DELETE,
          `users/${currentUser.uid}/blockedUsers/${targetUid}`
        );
      }
    },
    [currentUser]
  );

  const handleSafeSendFriendRequest = useCallback(
    async (target: UserProfile) => {
      if (!currentUser) return;
      if (blockedUserIds.includes(target.uid)) {
        throw new Error('لقد قمت بحظر هذا المستخدم. قم بإلغاء الحظر أولاً من الإعدادات.');
      }
      await sendFriendRequest(currentUser, target);
    },
    [currentUser, blockedUserIds]
  );

  const handleStartPrivateChat = useCallback(
    async (targetUser: UserProfile) => {
      if (!currentUser || targetUser.uid === currentUser.uid) return;
      if (blockedUserIds.includes(targetUser.uid)) {
        return;
      }
      const convId = makeConversationId(currentUser.uid, targetUser.uid);
      const existing = conversations.find((c) => c.id === convId);

      if (!existing) {
        const sortedIds = [currentUser.uid, targetUser.uid].sort();
        const u1 = sortedIds[0] === currentUser.uid ? currentUser : targetUser;
        const u2 = sortedIds[1] === currentUser.uid ? currentUser : targetUser;

        try {
          await setDoc(doc(db, 'conversations', convId), {
            id: convId,
            participant1Id: u1.uid,
            participant2Id: u2.uid,
            participant1Name: u1.displayName,
            participant2Name: u2.displayName,
            participant1Photo: u1.photoURL || '',
            participant2Photo: u2.photoURL || '',
            lastMessage: '',
            lastMessageAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `conversations/${convId}`);
        }
      }

      navigateTo({ view: 'messages', conversationId: convId });
    },
    [currentUser, conversations, blockedUserIds, navigateTo]
  );

  const handleBookBarber = useCallback(
    (barber: UserProfile, preselectedService?: BarberService) => {
      if (!currentUser || barber.uid === currentUser.uid) return;
      if (blockedUserIds.includes(barber.uid)) return;
      if (!isBarberMember(barber)) return;
      setBookingTriggerBarber({ barber, service: preselectedService });
      navigateTo({ view: 'messages', conversationId: currentSnapRef.current.conversationId });
    },
    [currentUser, blockedUserIds, navigateTo]
  );

  const handleNotificationClick = useCallback(
    async (n: AppNotification) => {
      if (!n.read) {
        try {
          await updateDoc(doc(db, 'notifications', n.id), { read: true });
        } catch (err) {
          console.error('Failed to mark notification read:', err);
        }
      }

      if (n.targetView === 'private_chat') {
        navigateTo({ view: 'messages', conversationId: n.targetId || null });
      } else if (n.targetView === 'appointments') {
        if (n.targetId) setFocusBookingId(n.targetId);
        navigateTo({ view: 'appointments' });
      } else if (n.targetView === 'community') {
        if (n.targetId) setFocusCommunityMsgId(n.targetId);
        navigateTo({ view: 'community' });
      } else if (n.targetView === 'profile') {
        navigateTo({ view: 'profile', profileUid: n.targetId || currentUser?.uid || null });
      } else if (n.targetView === 'tickets') {
        navigateTo({ view: 'tickets', ticketId: n.targetId || null });
      } else if (n.targetView === 'stories') {
        if (n.targetId) setFocusStoryId(n.targetId);
        navigateTo({ view: 'stories' });
      } else if (n.targetView === 'leaderboard') {
        navigateTo({ view: 'leaderboard' });
      } else if (n.targetView === 'about') {
        navigateTo({ view: 'about' });
      } else if (n.targetView === 'store') {
        navigateTo({ view: 'store' });
      } else if (
        n.targetView === 'staff_room' &&
        isStaffMember(currentUser, isSuperAdmin)
      ) {
        navigateTo({ view: 'staff_room' });
      } else if (n.targetView === 'admin' && isSuperAdmin) {
        navigateTo({ view: 'admin' });
      }
    },
    [isSuperAdmin, currentUser, navigateTo]
  );

  // Guard protected views if user rank changes in real time
  useEffect(() => {
    if (!currentUser) return;
    const isStaff = isStaffMember(currentUser, isSuperAdmin);
    if ((activeView === 'staff_room' && !isStaff) || (activeView === 'admin' && !isSuperAdmin)) {
      const cleaned = navHistoryRef.current.filter((s) => {
        if (s.view === 'admin' && !isSuperAdmin) return false;
        if (s.view === 'staff_room' && !isStaff) return false;
        return true;
      });
      navHistoryRef.current = cleaned;
      setNavHistory(cleaned);
      applyNavSnapshot({
        view: 'community',
        chatRoomMode: 'global',
        chatCountryCode: resolvedCountryCode,
        conversationId: null,
        profileUid: null,
        ticketId: null,
      });
    }
  }, [activeView, isSuperAdmin, currentUser, applyNavSnapshot, resolvedCountryCode]);

  const handleMarkAllRead = useCallback(async () => {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    try {
      const batch = writeBatch(db);
      unread.forEach((n) => {
        batch.update(doc(db, 'notifications', n.id), { read: true });
      });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'notifications/batch');
    }
  }, [notifications]);

  const handleCompleteTour = () => {
    if (fbUser) {
      localStorage.setItem(`aurelius_barber_tour_v3_seen_${fbUser.uid}`, '1');
    }
    setShowTour(false);
  };

  const pendingBookingsCount = useMemo(() => {
    if (!currentUser) return 0;
    return bookings.filter(
      (b) =>
        (b.barberId === currentUser.uid && b.status === 'pending') ||
        (b.customerId === currentUser.uid && b.status === 'rescheduled')
    ).length;
  }, [bookings, currentUser]);

  const pendingVerificationCount = useMemo(() => {
    if (!isSuperAdmin) return 0;
    return verificationRequests.filter((r) => r.status === 'pending').length;
  }, [isSuperAdmin, verificationRequests]);

  const openTicketsCount = useMemo(() => {
    if (!currentUser) return 0;
    const isStaff = isStaffMember(currentUser, isSuperAdmin);
    if (isStaff) {
      return supportTickets.filter((t) => t.status === 'open').length;
    }
    return supportTickets.filter(
      (t) => t.userId === currentUser.uid && t.status !== 'closed'
    ).length;
  }, [supportTickets, isSuperAdmin, currentUser]);

  const activeStoriesCount = useMemo(() => {
    const now = Date.now();
    return stories.filter((s) => {
      if (toMillis(s.expiresAt) <= now) return false;
      const author = users.find((u) => u.uid === s.barberId);
      if (author?.isBanned) return false;
      return matchesActiveCountry(
        s.countryCode,
        author?.countryCode,
        resolvedCountryCode
      );
    }).length;
  }, [stories, users, resolvedCountryCode]);

  const viewedProfileUser = useMemo(() => {
    if (!currentUser) return null;
    if (!profileTargetUid || profileTargetUid === currentUser.uid) {
      return currentUser;
    }
    return users.find((u) => u.uid === profileTargetUid) || currentUser;
  }, [currentUser, users, profileTargetUid]);

  if (!authReady) {
    return (
      <div
        dir="rtl"
        className="min-h-screen bg-[#0B0B0E] text-[#F5F2EB] flex flex-col items-center justify-center gap-5 p-6 text-center"
      >
        <div className="w-16 h-16 rounded-2xl bg-[#D4A853] text-[#0B0B0E] flex items-center justify-center shadow-lg">
          <Scissors className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold text-[#F5F2EB] tracking-tight">أوريليوس باربر</h1>
          <p className="font-serif-accent text-xs text-[#D4A853]">Aurelius Barber</p>
        </div>
        <div className="flex items-center gap-2.5 text-xs text-[#A6A196]">
          <div className="w-4 h-4 rounded-full border-2 border-[#D4A853] border-t-transparent animate-spin" />
          <span>جاري تحميل منصة أوريليوس باربر...</span>
        </div>
      </div>
    );
  }

  // First-time Welcome Country Selection (before Auth if no saved country, or after profile loads without saved country)
  if (!activeCountryCode && (!fbUser || !fbUser.emailVerified || currentUser)) {
    return (
      <div dir="rtl" className="min-h-screen bg-[#0B0B0E] text-[#F5F2EB]">
        <OfflineIndicator />
        <CountryPickerModal
          open
          mode="welcome"
          suggestedCode={suggestedCountryCode}
          onSelectCountry={(code) => handleSelectCountry(code, false)}
        />
      </div>
    );
  }

  if (!fbUser || !fbUser.emailVerified) {
    return (
      <AuthScreen
        unverifiedUser={fbUser && !fbUser.emailVerified ? fbUser : null}
        onVerifiedRefresh={handleVerifiedRefresh}
      />
    );
  }

  if (!currentUser) {
    return (
      <div
        dir="rtl"
        className="min-h-screen bg-[#0B0B0E] text-[#F5F2EB] flex flex-col items-center justify-center gap-5 p-6 text-center"
      >
        <div className="w-16 h-16 rounded-2xl bg-[#D4A853] text-[#0B0B0E] flex items-center justify-center shadow-lg">
          <Scissors className="w-8 h-8" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold text-[#F5F2EB] tracking-tight">أوريليوس باربر</h1>
          <p className="font-serif-accent text-xs text-[#D4A853]">Aurelius Barber</p>
        </div>
        <div className="flex items-center gap-2.5 text-xs text-[#A6A196]">
          <div className="w-4 h-4 rounded-full border-2 border-[#D4A853] border-t-transparent animate-spin" />
          <span>جاري تهيئة ملفك الشخصي في أوريليوس باربر...</span>
        </div>
      </div>
    );
  }

  if (currentUser.isBanned && !isSuperAdmin) {
    return (
      <BannedScreen
        reason={currentUser.banReason}
        onSignOut={handleSignOut}
      />
    );
  }

  const hasActiveDMThread =
    activeView === 'messages' &&
    Boolean(
      activeConversationId &&
        conversations.some((c) => c.id === activeConversationId)
    );
  const isFullHeightChat = activeView === 'community' || hasActiveDMThread;

  return (
    <div
      dir="rtl"
      className="h-[100dvh] w-full max-w-[100vw] flex flex-col overflow-hidden bg-[#0B0B0E] text-[#F5F2EB]"
    >
      <OfflineIndicator />

      {/* Google Maps GHP Quota Exceeded Banner (Required by Maps Integration) */}
      {mapsQuotaExceeded && (
        <div className="shrink-0 bg-amber-500/15 border-b border-amber-500/40 px-4 py-2.5 text-xs text-amber-200 flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            وصل مفتاح العرض التجريبي لخرائط Google إلى الحد اليومي. يمكنك تفعيل مفتاح مشروعك عبر{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-bold text-[#D4A853]"
            >
              وثائق Google Maps API
            </a>
            .
          </span>
        </div>
      )}

      <NavigationChrome
        currentUser={currentUser}
        isSuperAdmin={isSuperAdmin}
        activeView={activeView}
        activeCountryCode={resolvedCountryCode}
        onOpenCountrySwitcher={() => setCountrySwitcherOpen(true)}
        onGoHome={() =>
          navigateTo({
            view: 'community',
            chatRoomMode: 'global',
            chatCountryCode: resolvedCountryCode,
          })
        }
        onChangeView={(view) => {
          if (view === 'messages') {
            navigateTo({ view: 'messages', conversationId: null });
          } else if (view === 'community') {
            navigateTo({
              view: 'community',
              chatRoomMode,
              chatCountryCode: resolvedChatCountry,
            });
          } else {
            navigateTo({ view });
          }
        }}
        onOpenOwnProfile={() => handleOpenProfile(currentUser.uid)}
        notifications={notifications}
        onNotificationClick={handleNotificationClick}
        onMarkAllRead={handleMarkAllRead}
        friendships={friendships}
        onAcceptFriendRequest={(f) => acceptFriendRequest(f, currentUser)}
        onRejectFriendRequest={(fId) => rejectOrRemoveFriendship(fId)}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((v) => !v)}
        onOpenTour={() => setShowTour(true)}
        onSignOut={handleSignOut}
        pendingBookingsCount={pendingBookingsCount}
        pendingVerificationCount={pendingVerificationCount}
        openTicketsCount={openTicketsCount}
        activeStoriesCount={activeStoriesCount}
        onChangeLiveStatus={handleChangeLiveStatus}
        onOpenPrivacy={(tab = 'privacy') => setPrivacyModalState({ open: true, tab })}
      />

      {/* Instant Country Switcher Modal */}
      {countrySwitcherOpen && (
        <CountryPickerModal
          open
          mode="switcher"
          currentCode={resolvedCountryCode}
          suggestedCode={suggestedCountryCode}
          onClose={() => setCountrySwitcherOpen(false)}
          onSelectCountry={(code) => handleSelectCountry(code, true)}
        />
      )}

      {/* Country Switch Confirmation Banner */}
      {countrySwitchToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[65] w-[calc(100%-2rem)] max-w-md bg-[#181822] border border-emerald-500/50 rounded-2xl px-4 py-3 shadow-2xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold text-emerald-300">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <CountryFlag code={resolvedCountryCode} size="sm" />
            <span>{countrySwitchToast}</span>
        </div>
          <button
            type="button"
            onClick={() => setCountrySwitchToast(null)}
            className="text-[#8B857B] hover:text-white cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Live Incoming Notification Toast */}
      {liveToast && (
        <div className="fixed bottom-4 sm:bottom-6 left-4 right-4 sm:right-auto sm:w-88 z-50 bg-[#181820] border border-[#D4A853]/60 rounded-2xl p-4 shadow-2xl flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#D4A853]/15 text-[#D4A853] flex items-center justify-center shrink-0">
            <BellRing className="w-4 h-4" />
          </div>
          <button
            type="button"
            onClick={() => {
              const target = liveToast;
              setLiveToast(null);
              handleNotificationClick(target);
            }}
            className="flex-1 text-right space-y-0.5 cursor-pointer"
          >
            <div className="text-xs font-bold text-[#F5F2EB]">{liveToast.title}</div>
            <div className="text-[11px] text-[#A6A196] line-clamp-2">{liveToast.body}</div>
          </button>
          <button
            type="button"
            onClick={() => setLiveToast(null)}
            className="text-[#8B857B] hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {showTour && (
        <OnboardingTour
          userName={currentUser.displayName}
          roleDefinitions={roleDefinitions}
          onComplete={handleCompleteTour}
        />
      )}

      <main
        ref={mainRef}
        className={
          isFullHeightChat
            ? 'flex-1 min-h-0 w-full flex flex-col overflow-hidden'
            : 'flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden'
        }
      >
        <div
          className={
            isFullHeightChat
              ? 'flex-1 min-h-0 w-full flex flex-col overflow-hidden'
              : 'max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 pb-10'
          }
        >
        {!isFullHeightChat && activeView !== 'messages' && canGoBack && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => handleSmartBack(false)}
              aria-label={backLabel ? `العودة إلى ${backLabel}` : 'رجوع'}
              className="min-h-[40px] max-w-full px-3.5 py-1.5 rounded-xl bg-[#141419] hover:bg-[#1C1C24] border border-[#27272F] hover:border-[#D4A853]/50 text-xs font-bold text-[#F5F2EB] inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              <ArrowRight className="w-4 h-4 text-[#D4A853] shrink-0" />
              <span className="shrink-0">رجوع</span>
              {backLabel && (
                <span className="text-[#9C968B] font-medium truncate">
                  · إلى {backLabel}
                </span>
              )}
            </button>
          </div>
        )}

        {activeView === 'gallery' && (
          <GalleryView
            currentUser={currentUser}
            isSuperAdmin={isSuperAdmin}
            users={users}
            gallery={gallery}
            reviews={reviews}
            likes={likes}
            announcements={announcements}
            verificationRequests={verificationRequests}
            roleDefinitions={roleDefinitions}
            activeCountryCode={resolvedCountryCode}
            onOpenProfile={handleOpenProfile}
            onBookBarber={(barber) => handleBookBarber(barber)}
            onToggleLike={handleToggleLike}
            blockedUserIds={blockedUserIds}
            onBlockUser={handleBlockUser}
            onOpenReport={setReportPayload}
          />
        )}

        {activeView === 'stories' && (
          <StoriesView
            currentUser={currentUser}
            isSuperAdmin={isSuperAdmin}
            users={users}
            stories={stories}
            storyReactions={storyReactions}
            conversations={conversations}
            activeCountryCode={resolvedCountryCode}
            focusStoryId={focusStoryId}
            onClearFocusStory={() => setFocusStoryId(null)}
            onOpenProfile={handleOpenProfile}
            onBookBarber={(barber) => handleBookBarber(barber)}
            onOpenConversation={(convId) => {
              navigateTo({ view: 'messages', conversationId: convId });
            }}
            blockedUserIds={blockedUserIds}
            onBlockUser={handleBlockUser}
            onOpenReport={setReportPayload}
          />
        )}

        {activeView === 'leaderboard' && (
          <LeaderboardView
            currentUser={currentUser}
            users={users}
            gallery={gallery}
            likes={likes}
            reviews={reviews}
            stories={stories}
            onOpenProfile={handleOpenProfile}
            onBookBarber={(barber) => handleBookBarber(barber)}
          />
        )}

        {activeView === 'community' && (
          <CommunityChatView
            currentUser={currentUser}
            isSuperAdmin={isSuperAdmin}
            users={users}
            usersReady={usersReady}
            messages={communityMessages}
            typingStatuses={typingStatuses}
            friendships={friendships}
            activeCountryCode={resolvedCountryCode}
            roomMode={chatRoomMode}
            inspectedCountryCode={resolvedChatCountry}
            onChangeChatRoom={(nextMode, nextCode) =>
              navigateTo({
                view: 'community',
                chatRoomMode: nextMode,
                chatCountryCode: nextCode || resolvedCountryCode,
              })
            }
            onSyncChatRoomSilently={(nextMode, nextCode) => {
              setChatRoomMode(nextMode);
              if (nextCode) setChatCountryCode(nextCode);
            }}
            onOpenPrivateMessages={() =>
              navigateTo({ view: 'messages', conversationId: null })
            }
            privateConversationsCount={conversations.length}
            canGoBack={canGoBack}
            backLabel={backLabel}
            onBack={() => handleSmartBack(false)}
            focusMessageId={focusCommunityMsgId}
            onClearFocusMessage={() => setFocusCommunityMsgId(null)}
            onOpenProfile={handleOpenProfile}
            onStartPrivateChat={handleStartPrivateChat}
            onSendFriendRequest={handleSafeSendFriendRequest}
            onAcceptFriendRequest={(f) => acceptFriendRequest(f, currentUser)}
            onRejectOrRemoveFriend={(fId) => rejectOrRemoveFriendship(fId)}
            onOpenTickets={() => navigateTo({ view: 'tickets' })}
            onChangeLiveStatus={handleChangeLiveStatus}
            blockedUserIds={blockedUserIds}
            onBlockUser={handleBlockUser}
            onOpenReport={setReportPayload}
          />
        )}

        {activeView === 'map' && (
          <BarberMapView
            users={users}
            reviews={reviews}
            activeCountryCode={resolvedCountryCode}
            currentUser={currentUser}
            onOpenProfile={handleOpenProfile}
            onBookBarber={(barber) => handleBookBarber(barber)}
            onStartPrivateChat={handleStartPrivateChat}
          />
        )}

        {(activeView === 'messages' || activeView === 'appointments') && (
          <PrivateChatAndBookingsView
            mode={activeView}
            currentUser={currentUser}
            users={users}
            conversations={conversations}
            bookings={bookings}
            friendships={friendships}
            activeConversationId={activeConversationId}
            onSelectConversation={(convId) => {
              if (convId) {
                navigateTo({ view: 'messages', conversationId: convId });
              } else {
                const top = navHistoryRef.current[navHistoryRef.current.length - 1];
                if (top && top.view === 'messages' && !top.conversationId) {
                  handleSmartBack(false);
                } else {
                  navigateTo({ view: 'messages', conversationId: null });
                }
              }
            }}
            onStartPrivateChat={handleStartPrivateChat}
            onAcceptFriendRequest={(f) => acceptFriendRequest(f, currentUser)}
            onRejectOrRemoveFriend={(fId) => rejectOrRemoveFriendship(fId)}
            bookingTriggerBarber={bookingTriggerBarber}
            onClearBookingTrigger={() => setBookingTriggerBarber(null)}
            focusBookingId={focusBookingId}
            onClearFocusBooking={() => setFocusBookingId(null)}
            onBack={() => handleSmartBack(false)}
            backLabel={backLabel}
            onOpenProfile={handleOpenProfile}
            blockedUserIds={blockedUserIds}
            onBlockUser={handleBlockUser}
            onUnblockUser={handleUnblockUser}
            onOpenReport={setReportPayload}
          />
        )}

        {activeView === 'tickets' && (
          <TicketsView
            currentUser={currentUser}
            isSuperAdmin={isSuperAdmin}
            users={users}
            tickets={supportTickets}
            selectedTicketId={activeTicketId}
            onSelectTicket={setActiveTicketId}
            onOpenProfile={handleOpenProfile}
          />
        )}

        {activeView === 'profile' && viewedProfileUser && (
          <ProfileView
            key={viewedProfileUser.uid}
            profileUser={viewedProfileUser}
            currentUser={currentUser}
            isSuperAdmin={isSuperAdmin}
            users={users}
            posts={posts}
            reviews={reviews}
            gallery={gallery}
            likes={likes}
            friendships={friendships}
            verificationRequests={verificationRequests}
            activeCountryCode={resolvedCountryCode}
            onOpenCountrySwitcher={() => setCountrySwitcherOpen(true)}
            onStartPrivateChat={handleStartPrivateChat}
            onBookBarber={handleBookBarber}
            onToggleLike={handleToggleLike}
            onSendFriendRequest={handleSafeSendFriendRequest}
            onAcceptFriendRequest={(f) => acceptFriendRequest(f, currentUser)}
            onRejectOrRemoveFriend={(fId) => rejectOrRemoveFriendship(fId)}
            blockedUsers={blockedUsers}
            onBlockUser={handleBlockUser}
            onUnblockUser={handleUnblockUser}
            onOpenReport={setReportPayload}
            onChangeLiveStatus={handleChangeLiveStatus}
            onOpenPrivacy={(tab = 'privacy') => setPrivacyModalState({ open: true, tab })}
          />
        )}

        {activeView === 'join_team' && (
          <JoinTeamView
            currentUser={currentUser}
            isSuperAdmin={isSuperAdmin}
            users={users}
            verificationRequests={verificationRequests}
            activeCountryCode={resolvedCountryCode}
            onOpenOwnProfile={() => handleOpenProfile(currentUser.uid)}
            onNavigateView={(view) => navigateTo({ view })}
          />
        )}

        {activeView === 'about' && (
          <AboutAndUpdatesView
            currentUser={currentUser}
            isSuperAdmin={isSuperAdmin}
            users={users}
            announcements={announcements}
            roleDefinitions={roleDefinitions}
            onNavigateView={(view) => navigateTo({ view })}
            onOpenPrivacy={(tab = 'privacy') => setPrivacyModalState({ open: true, tab })}
          />
        )}

        {activeView === 'staff_room' &&
          isStaffMember(currentUser, isSuperAdmin) && (
            <StaffRoomView
              currentUser={currentUser}
              isSuperAdmin={isSuperAdmin}
              users={users}
              staffMessages={staffMessages}
              staffGuidelines={staffGuidelines}
              tickets={supportTickets}
              contentReports={contentReports}
              activityLogs={activityLogs}
              communityMessages={communityMessages}
              selectedTicketId={activeTicketId}
              onSelectTicket={setActiveTicketId}
              onOpenProfile={handleOpenProfile}
              onOpenCommunityRoom={(roomType, countryCode) => {
                navigateTo({
                  view: 'community',
                  chatRoomMode: roomType,
                  chatCountryCode: countryCode || resolvedCountryCode,
                });
              }}
            />
          )}

        {activeView === 'store' && (
          <StoreView
            currentUser={currentUser}
            isSuperAdmin={isSuperAdmin}
            users={users}
            storeConfig={storeConfig}
          />
        )}

        {activeView === 'admin' && isSuperAdmin && (
          <AdminDashboardView
            currentUser={currentUser}
            isSuperAdmin={isSuperAdmin}
            users={users}
            gallery={gallery}
            communityMessages={communityMessages}
            posts={posts}
            activityLogs={activityLogs}
            verificationRequests={verificationRequests}
            storeConfig={storeConfig}
            roleDefinitions={roleDefinitions}
            onOpenProfile={handleOpenProfile}
          />
        )}
        </div>
      </main>

      <ReportContentModal
        open={Boolean(reportPayload)}
        payload={reportPayload}
        currentUser={currentUser}
        users={users}
        onClose={() => setReportPayload(null)}
        onBlockUser={handleBlockUser}
      />

      <PrivacyAndPolicyModal
        open={privacyModalState.open}
        initialTab={privacyModalState.tab}
        currentUser={currentUser}
        onClose={() => setPrivacyModalState((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
