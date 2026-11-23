import React, { useEffect, useMemo, useState } from 'react';
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  Camera,
  Edit3,
  MessageCircle,
  CalendarClock,
  Star,
  Plus,
  Trash2,
  Send,
  Image as ImageIcon,
  Check,
  X,
  Scissors,
  Clock,
  Heart,
  BadgeCheck,
  CheckCircle2,
  Columns2,
  Upload,
  User as UserIcon,
  Briefcase,
  Shield,
  Coins,
  Copy,
  AtSign,
  Globe,
  Settings,
  UserPlus,
  UserCheck,
  UserX,
  Sparkles,
  EyeOff,
  KeyRound,
  Palette,
  Frame,
  Save,
  Flag,
  Ban,
  Lock,
  Calendar,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Ticket,
} from 'lucide-react';
import { db, createSafeId, handleFirestoreError, OperationType, formatLastSeen } from '../firebase';
import {
  AvatarFrameKey,
  BarberService,
  BlockedUserRecord,
  ChatTitleKey,
  FriendRequestPolicy,
  Friendship,
  GalleryCategory,
  GalleryItem,
  GeoLocation,
  LikeRecord,
  LikeTargetType,
  MemberLiveStatus,
  NameColorKey,
  ProfilePost,
  Review,
  UserProfile,
  UserRole,
  VerificationRequest,
} from '../types';
import { compressImageToDataUrl } from '../utils/image';
import {
  getCommunityLevel,
  getEffectiveLiveStatus,
} from '../utils/gamification';
import {
  formatFullDateTime,
  formatGregorianDate,
  formatMessageTime,
  useNowTick,
} from '../utils/time';
import {
  getUserHandle,
  isActiveSpecialId,
  isNumericUserId,
  isReservedSpecialNumber,
  isValidUsername,
  normalizeNumericIdInput,
  normalizeUsernameInput,
} from '../utils/username';
import {
  canSendFriendRequest,
  makeFriendshipId,
} from '../utils/friends';
import {
  Avatar,
  MultiRoleSelector,
  RoleBadgesList,
  RoleTag,
  VipSilverStar,
  canPublishToGallery,
  formatRolesArabicSummary,
  getEffectiveNameColorClass,
  getUserRoles,
  hasRole,
  isBarberMember,
  isStaffMember,
  normalizeUserRoles,
} from './Avatar';
import { assignMemberRoles } from '../utils/roleAssignment';
import {
  AVATAR_FRAME_PRESETS,
  CHAT_TITLE_PRESETS,
  NAME_COLOR_PRESETS,
  adminAdjustMemberCredits,
  adminGrantMemberPerk,
  adminUpdateMemberId,
  formatRemainingDuration,
  getActiveAvatarFrame,
  getActiveChatTitle,
  getActiveCreditPass,
  getActiveNameColor,
} from '../utils/store';
import { LocationPickerMap } from './BarberMapView';
import { ConfirmModal } from './ConfirmModal';
import { BeforeAfterCompare } from './BeforeAfterCompare';
import { VerificationRequestModal } from './VerificationRequestModal';
import { CountryFlag } from './CountryPickerModal';
import { DigitalMemberPass } from './DigitalMemberPass';
import { getCountryByCode } from '../utils/countries';
import {
  checkActionRateLimit,
  isSafeMediaUrl,
  MAX_TEXT_LENGTHS,
  sanitizePlainText,
} from '../utils/security';
import { ReportRequestPayload } from './ReportContentModal';

interface ProfileViewProps {
  profileUser: UserProfile;
  currentUser: UserProfile;
  isSuperAdmin: boolean;
  users: UserProfile[];
  posts: ProfilePost[];
  reviews: Review[];
  gallery: GalleryItem[];
  likes: LikeRecord[];
  friendships?: Friendship[];
  verificationRequests: VerificationRequest[];
  activeCountryCode: string;
  onOpenCountrySwitcher: () => void;
  onStartPrivateChat: (target: UserProfile) => void;
  onBookBarber: (barber: UserProfile, preselectedService?: BarberService) => void;
  onToggleLike: (targetType: LikeTargetType, targetId: string) => Promise<void>;
  onSendFriendRequest?: (target: UserProfile) => Promise<void> | void;
  onAcceptFriendRequest?: (friendship: Friendship) => Promise<void> | void;
  onRejectOrRemoveFriend?: (friendshipId: string) => Promise<void> | void;
  blockedUsers?: BlockedUserRecord[];
  onBlockUser?: (targetUid: string, targetName: string, targetPhoto?: string) => Promise<void> | void;
  onUnblockUser?: (targetUid: string) => Promise<void> | void;
  onOpenReport?: (payload: ReportRequestPayload) => void;
  onChangeLiveStatus?: (status: MemberLiveStatus) => Promise<void> | void;
  onOpenPrivacy?: (tab?: 'privacy' | 'delete') => void;
}

const PORTFOLIO_CATEGORIES: { key: GalleryCategory; label: string }[] = [
  { key: 'fade', label: 'تدرج حديث' },
  { key: 'beard', label: 'تنسيق لحية' },
  { key: 'classic', label: 'كلاسيكي' },
  { key: 'styling', label: 'تصفيف وعناية' },
  { key: 'vip', label: 'جلسات VIP' },
];

export const ProfileView: React.FC<ProfileViewProps> = ({
  profileUser,
  currentUser,
  isSuperAdmin,
  users,
  posts,
  reviews,
  gallery,
  likes,
  friendships = [],
  verificationRequests,
  activeCountryCode,
  onOpenCountrySwitcher,
  onStartPrivateChat,
  onBookBarber,
  onToggleLike,
  onSendFriendRequest,
  onAcceptFriendRequest,
  onRejectOrRemoveFriend,
  blockedUsers = [],
  onBlockUser,
  onUnblockUser,
  onOpenReport,
  onChangeLiveStatus,
  onOpenPrivacy,
}) => {
  const isOwnProfile = profileUser.uid === currentUser.uid;
  const isProfileBlocked = useMemo(
    () => !isOwnProfile && blockedUsers.some((b) => b.blockedUserId === profileUser.uid),
    [blockedUsers, isOwnProfile, profileUser.uid]
  );
  const isAdminOrMod = isStaffMember(currentUser, isSuperAdmin);
  const nowTick = useNowTick(20000);
  const profileRoles = useMemo(() => getUserRoles(profileUser), [profileUser]);
  const primaryProfileRole = profileRoles[0];
  // Super Admin never appears as a barber unless explicitly holding a barber role; any barber tier gets barber sections
  const isBarber = isBarberMember(profileUser);
  // Public gallery / portfolio publishing is exclusive to VIP Barber (Silver) & Super Admin
  const canPublishPortfolio = isOwnProfile && canPublishToGallery(currentUser, isSuperAdmin);

  // Organized Mobile-First Profile Tabs & Collapsible Sections
  const [profileTab, setProfileTab] = useState<'posts' | 'identity' | 'services' | 'portfolio'>(() =>
    isBarberMember(profileUser) ? 'services' : 'posts'
  );
  const [reviewsExpanded, setReviewsExpanded] = useState(false);

  useEffect(() => {
    setProfileTab(isBarber ? 'services' : 'posts');
    setReviewsExpanded(false);
    setAdminManageModalOpen(false);
  }, [profileUser.uid, isBarber]);

  // Direct Super Admin multi-role management inside Modal
  const [draftRoles, setDraftRoles] = useState<UserRole[]>(profileRoles);
  const [updatingRank, setUpdatingRank] = useState(false);
  const [rankFeedback, setRankFeedback] = useState<string | null>(null);

  useEffect(() => {
    setDraftRoles(profileRoles);
  }, [profileUser.uid, profileRoles.join(',')]);

  // Edit Profile state
  const profileHandle = useMemo(() => getUserHandle(profileUser, nowTick), [profileUser, nowTick]);
  const isSpecialActive = useMemo(() => isActiveSpecialId(profileUser, nowTick), [profileUser, nowTick]);
  const activeProfileColor = useMemo(() => getActiveNameColor(profileUser, nowTick), [profileUser, nowTick]);
  const activeProfileFrame = useMemo(() => getActiveAvatarFrame(profileUser, nowTick), [profileUser, nowTick]);
  const activeChatTitle = useMemo(() => getActiveChatTitle(profileUser, nowTick), [profileUser, nowTick]);
  const activeCreditPass = useMemo(() => getActiveCreditPass(profileUser, nowTick), [profileUser, nowTick]);
  const joinDateText = useMemo(
    () => (profileUser.createdAt ? formatGregorianDate(profileUser.createdAt) : 'عضو قديم'),
    [profileUser.createdAt]
  );

  // Founder Tabbed Member Management Modal state
  const [adminManageModalOpen, setAdminManageModalOpen] = useState(false);
  const [adminManageTab, setAdminManageTab] = useState<'ranks' | 'perks' | 'credits' | 'id'>('ranks');
  const [adminHandleDraft, setAdminHandleDraft] = useState(profileHandle);
  const [adminSpecialFlag, setAdminSpecialFlag] = useState(Boolean(profileUser.isSpecialId));
  const [adminSpecialLabel, setAdminSpecialLabel] = useState(profileUser.specialIdLabel || 'آيدي مميز');
  const [adminIdDurationMode, setAdminIdDurationMode] = useState<'permanent' | 'timed'>(
    profileUser.specialIdExpiresAt ? 'timed' : 'permanent'
  );
  const [adminIdDays, setAdminIdDays] = useState('30');
  const [adminCreditMode, setAdminCreditMode] = useState<'add' | 'deduct' | 'set'>('add');
  const [adminCreditAmount, setAdminCreditAmount] = useState('100');
  const [adminCreditReason, setAdminCreditReason] = useState('');
  const [adminPerkColor, setAdminPerkColor] = useState<NameColorKey>(
    (getActiveNameColor(profileUser) as NameColorKey) || 'gold_royal'
  );
  const [adminPerkFrame, setAdminPerkFrame] = useState<AvatarFrameKey>(
    (getActiveAvatarFrame(profileUser) as AvatarFrameKey) || 'gold_crown'
  );
  const [adminPerkChatTitle, setAdminPerkChatTitle] = useState<ChatTitleKey>(
    (getActiveChatTitle(profileUser) as ChatTitleKey) || 'community_star'
  );
  const [adminPerkDaysMode, setAdminPerkDaysMode] = useState<'permanent' | 'timed'>('permanent');
  const [adminPerkDays, setAdminPerkDays] = useState('14');
  const [adminToolsBusy, setAdminToolsBusy] = useState(false);
  const [adminToolsFeedback, setAdminToolsFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setAdminHandleDraft(profileHandle);
    setAdminSpecialFlag(Boolean(profileUser.isSpecialId));
    setAdminSpecialLabel(profileUser.specialIdLabel || 'آيدي مميز');
    setAdminIdDurationMode(profileUser.specialIdExpiresAt ? 'timed' : 'permanent');
  }, [profileUser.uid, profileHandle, profileUser.isSpecialId, profileUser.specialIdLabel, profileUser.specialIdExpiresAt]);

  const [copiedHandle, setCopiedHandle] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [draftName, setDraftName] = useState(profileUser.displayName);
  const [draftUsername, setDraftUsername] = useState(profileHandle);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [draftBio, setDraftBio] = useState(profileUser.bio || '');
    const [draftSalonName, setDraftSalonName] = useState(profileUser.salonName || '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Settings & Privacy modal state (Own Profile ⚙️)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [draftFriendPolicy, setDraftFriendPolicy] = useState<FriendRequestPolicy>(
    currentUser.friendRequestPolicy || 'everyone'
  );
  const [draftHideOnline, setDraftHideOnline] = useState<boolean>(
    Boolean(currentUser.hideOnlineStatus)
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);

  // Friendships action state
  const [friendBusy, setFriendBusy] = useState(false);
  const [friendFeedback, setFriendFeedback] = useState<string | null>(null);

  // Verification Request modal state
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [verifySuccessMsg, setVerifySuccessMsg] = useState<string | null>(null);

  // New Service state
  const [showAddService, setShowAddService] = useState(false);
  const [srvName, setSrvName] = useState('');
  const [srvPrice, setSrvPrice] = useState('50');
  const [srvDuration, setSrvDuration] = useState('30');
  const [srvDesc, setSrvDesc] = useState('');

  // Posts state
  const [postText, setPostText] = useState('');
  const [postImage, setPostImage] = useState('');
  const [posting, setPosting] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingPostText, setEditingPostText] = useState('');
  const [confirmDeletePost, setConfirmDeletePost] = useState<ProfilePost | null>(null);
  const [confirmDeleteService, setConfirmDeleteService] = useState<BarberService | null>(null);

  // Barber Portfolio Work Add/Edit/Delete/Lightbox
  const [workModalOpen, setWorkModalOpen] = useState(false);
  const [editingWork, setEditingWork] = useState<GalleryItem | null>(null);
  const [workTitle, setWorkTitle] = useState('');
  const [workDesc, setWorkDesc] = useState('');
  const [workCategory, setWorkCategory] = useState<GalleryCategory>('fade');
  const [workAfterImg, setWorkAfterImg] = useState('');
  const [workIsBeforeAfter, setWorkIsBeforeAfter] = useState(true);
  const [workBeforeImg, setWorkBeforeImg] = useState('');
  const [workSubmitting, setWorkSubmitting] = useState(false);
  const [workError, setWorkError] = useState<string | null>(null);
  const [lightboxWork, setLightboxWork] = useState<GalleryItem | null>(null);
  const [confirmDeleteWork, setConfirmDeleteWork] = useState<GalleryItem | null>(null);

  const userPosts = useMemo(
    () => posts.filter((p) => p.authorId === profileUser.uid),
    [posts, profileUser.uid]
  );

  const barberReviews = useMemo(
    () => reviews.filter((r) => r.barberId === profileUser.uid),
    [reviews, profileUser.uid]
  );

  const barberWorks = useMemo(
    () => gallery.filter((g) => g.barberId === profileUser.uid),
    [gallery, profileUser.uid]
  );

  const myLatestRequest = useMemo(() => {
    const mine = verificationRequests.filter((r) => r.userId === currentUser.uid);
    return mine[0] || null;
  }, [verificationRequests, currentUser.uid]);

  const profileLikeInfo = useMemo(() => {
    const profileLikes = likes.filter(
      (l) => l.targetType === 'profile' && l.targetId === profileUser.uid
    );
    return {
      count: profileLikes.length,
      likedByMe: profileLikes.some((l) => l.userId === currentUser.uid),
    };
  }, [likes, profileUser.uid, currentUser.uid]);

  const totalWorksLikesCount = useMemo(() => {
    const workIds = new Set(barberWorks.map((w) => w.id));
    return likes.filter((l) => l.targetType === 'gallery' && workIds.has(l.targetId)).length;
  }, [likes, barberWorks]);

  const getWorkLikes = (itemId: string) => {
    const list = likes.filter((l) => l.targetType === 'gallery' && l.targetId === itemId);
    return {
      count: list.length,
      likedByMe: list.some((l) => l.userId === currentUser.uid),
    };
  };

  const ratingStats = useMemo(() => {
    if (barberReviews.length === 0) return { avg: 0, count: 0 };
    const sum = barberReviews.reduce((acc, r) => acc + r.rating, 0);
    return { avg: sum / barberReviews.length, count: barberReviews.length };
  }, [barberReviews]);

  const handlePhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'photoURL' | 'coverURL'
  ) => {
    const file = e.target.files?.[0];
    if (!file || !isOwnProfile) return;
    try {
      const dataUrl = await compressImageToDataUrl(
        file,
        field === 'coverURL' ? 1100 : 480,
        field === 'coverURL' ? 520 : 480,
        0.76
      );
      await updateDoc(doc(db, 'users', currentUser.uid), {
        [field]: dataUrl,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  const activeFriendship = useMemo(() => {
    if (isOwnProfile) return null;
    const fId = makeFriendshipId(currentUser.uid, profileUser.uid);
    return friendships.find((f) => f.id === fId) || null;
  }, [friendships, isOwnProfile, currentUser.uid, profileUser.uid]);

  const friendEligibility = useMemo(
    () => canSendFriendRequest(currentUser, profileUser),
    [currentUser, profileUser]
  );

  useEffect(() => {
    setFriendFeedback(null);
  }, [profileUser.uid]);

  const handleSavePrivacySettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwnProfile) return;
    setSavingSettings(true);
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        friendRequestPolicy: draftFriendPolicy,
        hideOnlineStatus: draftHideOnline,
        isOnline: draftHideOnline ? false : currentUser.liveStatus !== 'offline',
        updatedAt: serverTimestamp(),
      });
      setSettingsSuccess('تم حفظ إعدادات الخصوصية بنجاح.');
      window.setTimeout(() => {
        setSettingsSuccess(null);
        setSettingsModalOpen(false);
      }, 900);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleFriendAction = async (
    action: () => Promise<void> | void
  ) => {
    setFriendFeedback(null);
    setFriendBusy(true);
    try {
      await action();
    } catch (err) {
      setFriendFeedback(
        err instanceof Error ? err.message : 'تعذر تنفيذ طلب الصداقة حالياً.'
      );
    } finally {
      setFriendBusy(false);
    }
  };

  const handleSaveProfileInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = sanitizePlainText(draftName, MAX_TEXT_LENGTHS.displayName);
    if (!cleanName) return;
    const cleanedHandle = normalizeUsernameInput(draftUsername);
    const isUnchanged = cleanedHandle === profileHandle.toLowerCase();

    if (!isUnchanged) {
      if (!isNumericUserId(cleanedHandle) || cleanedHandle.length < 5) {
        if (!(isSuperAdmin || isSpecialActive) || !isValidUsername(cleanedHandle)) {
          setUsernameError('المعرف يجب أن يتكون من أرقام إنجليزية فقط (5 إلى 12 خانة للأعضاء).');
          return;
        }
      }
      if (
        !isSuperAdmin &&
        !isSpecialActive &&
        isReservedSpecialNumber(cleanedHandle)
      ) {
        setUsernameError('هذا الرقم ضمن الأرقام المميزة المحجوزة للإدارة (VIP IDs)، اختر رقماً عشوائياً آخر.');
        return;
      }
    }

    const isTaken = users.some(
      (u) => u.uid !== currentUser.uid && getUserHandle(u, nowTick).toLowerCase() === cleanedHandle
    );
    if (isTaken) {
      setUsernameError('هذا الرقم مستخدم بالفعل لعضو آخر، يرجى اختيار رقم فريد.');
      return;
    }

    setUsernameError(null);
    setSavingProfile(true);
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        displayName: cleanName,
        username: cleanedHandle,
        bio: sanitizePlainText(draftBio, MAX_TEXT_LENGTHS.bio),
        salonName: sanitizePlainText(draftSalonName, MAX_TEXT_LENGTHS.salonName),
        updatedAt: serverTimestamp(),
      });
      setEditingProfile(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangeLiveStatus = async (status: MemberLiveStatus) => {
    if (!isOwnProfile) return;
    if (onChangeLiveStatus) {
      await onChangeLiveStatus(status);
      return;
    }
    try {
      const updates: Record<string, unknown> = {
        liveStatus: status,
        isOnline: status !== 'offline',
        lastActiveAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (isBarber) {
        updates.availability = status === 'online' ? 'available' : 'busy';
      }
      await updateDoc(doc(db, 'users', currentUser.uid), updates);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSrvName = sanitizePlainText(srvName, MAX_TEXT_LENGTHS.serviceName);
    if (!isOwnProfile || !cleanSrvName) return;
    const currentServices = profileUser.services || [];
    if (currentServices.length >= 20) return;

    const newService: BarberService = {
      id: createSafeId('srv'),
      name: cleanSrvName,
      price: Math.max(0, Number(srvPrice) || 0),
      durationMinutes: Math.min(480, Math.max(5, Number(srvDuration) || 30)),
      description: sanitizePlainText(srvDesc, MAX_TEXT_LENGTHS.serviceDescription),
    };

    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        services: [...currentServices, newService],
        updatedAt: serverTimestamp(),
      });
      setSrvName('');
      setSrvPrice('50');
      setSrvDuration('30');
      setSrvDesc('');
      setShowAddService(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  const handleRemoveService = async (serviceId: string) => {
    if (!isOwnProfile) return;
    const updated = (profileUser.services || []).filter((s) => s.id !== serviceId);
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        services: updated,
        updatedAt: serverTimestamp(),
      });
      setConfirmDeleteService(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
        }
  };

  const handleSaveLocation = async (loc: GeoLocation, addressLabel: string) => {
    if (!isOwnProfile) return;
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        location: loc,
        addressLabel: sanitizePlainText(addressLabel, MAX_TEXT_LENGTHS.addressLabel),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  const handlePostImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImageToDataUrl(file, 960, 960, 0.76);
    if (isSafeMediaUrl(compressed)) {
      setPostImage(compressed);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPost = sanitizePlainText(postText, MAX_TEXT_LENGTHS.postText);
    if (!isOwnProfile || !cleanPost) return;
    const rate = checkActionRateLimit(`profile_post_${currentUser.uid}`, {
      cooldownMs: 6000,
      maxInWindow: 6,
      windowMs: 300000,
    });
    if (!rate.allowed) {
      setFriendFeedback(rate.message || 'يرجى التمهل قبل نشر منشور جديد.');
      return;
    }
    const safeImg = postImage && isSafeMediaUrl(postImage) ? postImage : '';
    setPosting(true);
    try {
      const postId = createSafeId('post');
      await setDoc(doc(db, 'posts', postId), {
        id: postId,
        authorId: currentUser.uid,
        authorName: sanitizePlainText(currentUser.displayName, MAX_TEXT_LENGTHS.displayName) || currentUser.displayName,
        authorPhoto: currentUser.photoURL || '',
        authorRole: currentUser.role,
        text: cleanPost,
        imageUrl: safeImg,
        visibility: 'public',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setPostText('');
      setPostImage('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'posts');
    } finally {
      setPosting(false);
    }
  };

  const handleSavePostEdit = async (post: ProfilePost) => {
    const cleanEdit = sanitizePlainText(editingPostText, MAX_TEXT_LENGTHS.postText);
    if (!cleanEdit) return;
    try {
      await updateDoc(doc(db, 'posts', post.id), {
        text: cleanEdit,
        updatedAt: serverTimestamp(),
      });
      setEditingPostId(null);
      setEditingPostText('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `posts/${post.id}`);
    }
  };

  const handleDeletePost = async (postId: string) => {
    try {
      await deleteDoc(doc(db, 'posts', postId));
      setConfirmDeletePost(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `posts/${postId}`);
    }
  };

  // Portfolio Work Handlers
  const openCreateWorkModal = () => {
    setEditingWork(null);
    setWorkTitle('');
    setWorkDesc('');
    setWorkCategory('fade');
    setWorkAfterImg('');
    setWorkIsBeforeAfter(true);
    setWorkBeforeImg('');
    setWorkError(null);
    setWorkModalOpen(true);
  };

  const openEditWorkModal = (item: GalleryItem) => {
    setEditingWork(item);
    setWorkTitle(item.title);
    setWorkDesc(item.description || '');
    setWorkCategory(item.category);
    setWorkAfterImg(item.imageUrl);
    setWorkIsBeforeAfter(Boolean(item.isBeforeAfter && item.beforeImageUrl));
    setWorkBeforeImg(item.beforeImageUrl || '');
    setWorkError(null);
    setWorkModalOpen(true);
  };

  const handleWorkFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'before' | 'after'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWorkError(null);
    try {
      let dataUrl = await compressImageToDataUrl(file, 720, 720, 0.72);
      if (dataUrl.length > 395000) {
        dataUrl = await compressImageToDataUrl(file, 580, 580, 0.62);
      }
      if (target === 'before') setWorkBeforeImg(dataUrl);
      else setWorkAfterImg(dataUrl);
    } catch (err) {
      setWorkError(err instanceof Error ? err.message : 'تعذر تحميل الصورة.');
    }
  };

  const handleSaveWork = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = sanitizePlainText(workTitle, MAX_TEXT_LENGTHS.galleryTitle);
    const cleanDesc = sanitizePlainText(workDesc, MAX_TEXT_LENGTHS.galleryDescription);
    const cleanAfter = workAfterImg.trim();
    const cleanBefore = workBeforeImg.trim();

    if (!cleanTitle) {
      setWorkError('يرجى إدخال عنوان عمل صالح.');
      return;
    }
    if (!cleanAfter || !isSafeMediaUrl(cleanAfter)) {
      setWorkError(
        workIsBeforeAfter
          ? 'يرجى اختيار صورة نتيجة صالحة (بعد).'
          : 'يرجى اختيار صورة عمل صالحة.'
      );
      return;
    }
    if (workIsBeforeAfter && (!cleanBefore || !isSafeMediaUrl(cleanBefore))) {
      setWorkError('يرجى اختيار صورة "قبل" صالحة لإتمام عرض قبل وبعد.');
      return;
    }

    if (!editingWork) {
      const rate = checkActionRateLimit(`profile_gallery_create_${currentUser.uid}`, {
        cooldownMs: 8000,
        maxInWindow: 6,
        windowMs: 300000,
      });
      if (!rate.allowed) {
        setWorkError(rate.message || 'يرجى الانتظار قليلاً قبل نشر عمل جديد.');
        return;
      }
    }

    setWorkSubmitting(true);
    setWorkError(null);
    try {
      if (editingWork) {
        await updateDoc(doc(db, 'gallery', editingWork.id), {
          title: cleanTitle,
          description: cleanDesc,
          category: workCategory,
          imageUrl: cleanAfter,
          isBeforeAfter: workIsBeforeAfter,
          beforeImageUrl: workIsBeforeAfter ? cleanBefore : '',
          updatedAt: serverTimestamp(),
        });
      } else {
        const newId = createSafeId('gal');
        await setDoc(doc(db, 'gallery', newId), {
          id: newId,
          barberId: currentUser.uid,
          barberName: sanitizePlainText(currentUser.displayName, MAX_TEXT_LENGTHS.displayName) || currentUser.displayName,
          barberPhoto: currentUser.photoURL || '',
          title: cleanTitle,
          description: cleanDesc,
          category: workCategory,
          imageUrl: cleanAfter,
          isBeforeAfter: workIsBeforeAfter,
          beforeImageUrl: workIsBeforeAfter ? cleanBefore : '',
          countryCode: activeCountryCode,
          visibility: 'public',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      setWorkModalOpen(false);
    } catch (err) {
      handleFirestoreError(
        err,
        editingWork ? OperationType.UPDATE : OperationType.CREATE,
        'gallery'
      );
    } finally {
      setWorkSubmitting(false);
    }
  };

  const handleDeleteWork = async (item: GalleryItem) => {
    try {
      await deleteDoc(doc(db, 'gallery', item.id));
      setConfirmDeleteWork(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `gallery/${item.id}`);
    }
  };

  const handleAdminSaveMemberId = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) return;
    const clean = normalizeUsernameInput(adminHandleDraft);
    if (!isValidUsername(clean)) {
      setAdminToolsFeedback({ type: 'err', text: 'يرجى إدخال معرف صالح (أرقام أو أحرف إنجليزية صغيرة).' });
      return;
    }
    const taken = users.some(
      (u) => u.uid !== profileUser.uid && getUserHandle(u, nowTick).toLowerCase() === clean
    );
    if (taken) {
      setAdminToolsFeedback({ type: 'err', text: 'هذا المعرف مستخدم بالفعل لعضو آخر.' });
      return;
    }
    setAdminToolsBusy(true);
    setAdminToolsFeedback(null);
    try {
      await adminUpdateMemberId({
        actor: currentUser,
        target: profileUser,
        newHandle: clean,
        isSpecialId: adminSpecialFlag,
        specialIdLabel: sanitizePlainText(adminSpecialLabel, 40) || 'آيدي مميز',
        durationDays:
          adminSpecialFlag && adminIdDurationMode === 'timed'
            ? Math.max(1, Number(adminIdDays) || 30)
            : null,
      });
      setAdminToolsFeedback({ type: 'ok', text: `تم تحديث معرف العضو إلى @${clean} بنجاح.` });
    } catch {
      setAdminToolsFeedback({ type: 'err', text: 'تعذر تحديث المعرف الآن.' });
    } finally {
      setAdminToolsBusy(false);
    }
  };

  const handleAdminAdjustProfileCredits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) return;
    const amt = Math.max(0, Number(adminCreditAmount) || 0);
    setAdminToolsBusy(true);
    setAdminToolsFeedback(null);
    try {
      const next = await adminAdjustMemberCredits({
        actor: currentUser,
        target: profileUser,
        mode: adminCreditMode,
        amount: amt,
        reason: sanitizePlainText(adminCreditReason, MAX_TEXT_LENGTHS.moderationReason) || undefined,
      });
      setAdminCreditReason('');
      setAdminToolsFeedback({ type: 'ok', text: `تم تحديث الرصيد إلى ${next} كريدت بنجاح.` });
    } catch {
      setAdminToolsFeedback({ type: 'err', text: 'تعذر تعديل الكريدت.' });
    } finally {
      setAdminToolsBusy(false);
    }
  };

  const handleAdminGrantProfilePerk = async (
    perkType: 'name_color' | 'avatar_frame' | 'chat_title',
    value: string | null
  ) => {
    if (!isSuperAdmin) return;
    setAdminToolsBusy(true);
    setAdminToolsFeedback(null);
    try {
      await adminGrantMemberPerk({
        actor: currentUser,
    target: profileUser,
        perkType,
        value,
        durationDays:
          value && adminPerkDaysMode === 'timed' ? Math.max(1, Number(adminPerkDays) || 14) : null,
      });
      setAdminToolsFeedback({
        type: 'ok',
        text: value ? 'تم منح الميزة مجاناً من المؤسس.' : 'تم إزالة الميزة بنجاح.',
      });
    } catch {
      setAdminToolsFeedback({ type: 'err', text: 'تعذر تحديث الميزة.' });
    } finally {
      setAdminToolsBusy(false);
    }
  };

  const handleAdminSaveProfileRanks = async (targetRoles: UserRole[]) => {
    if (!isSuperAdmin || isOwnProfile || hasRole(profileUser, 'admin')) return;
    const normalized = normalizeUserRoles(targetRoles);
    setUpdatingRank(true);
    setRankFeedback(null);
    try {
      const saved = await assignMemberRoles(
        currentUser,
        profileUser,
        normalized,
        'من الملف الشخصي'
      );
      if (saved) {
        setDraftRoles(saved);
        setRankFeedback(`تم حفظ الرتب بنجاح: ${formatRolesArabicSummary(saved)}`);
      }
    } finally {
      setUpdatingRank(false);
    }
  };

  const profileCoins = profileUser.points || 0;
  const profileLevelInfo = getCommunityLevel(profileCoins);
  const secondaryRoles = profileRoles.slice(1);
  const extrasCount =
    secondaryRoles.length +
    (isSpecialActive ? 1 : 0) +
    (activeProfileColor ? 1 : 0) +
    (activeProfileFrame ? 1 : 0) +
    (activeChatTitle ? 1 : 0) +
    (activeCreditPass ? 1 : 0);

  const openAdminManageModal = () => {
    setAdminToolsFeedback(null);
    setRankFeedback(null);
    setAdminManageTab(
      !isOwnProfile && !hasRole(profileUser, 'admin') ? 'ranks' : 'perks'
    );
    setAdminManageModalOpen(true);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Compact Mobile-First Cover + Profile Header */}
      <section className="bg-[#141419] border border-[#27272F] rounded-3xl overflow-hidden">
        <div className="relative h-36 sm:h-52 bg-[#1C1C24]">
          <img
            src={
              profileUser.coverURL ||
              './src/assets/images/barber_hero_salon_1794853787883.jpg'
            }
            alt="صورة الغلاف"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
          <div
            className={`absolute inset-0 bg-gradient-to-t ${
              primaryProfileRole === 'admin'
                ? 'from-[#141419] via-[#D4A853]/12 to-transparent'
                : primaryProfileRole === 'moderator'
                  ? 'from-[#141419] via-indigo-500/12 to-transparent'
                  : primaryProfileRole === 'vip_barber'
                    ? 'from-[#141419] via-slate-300/15 to-transparent'
                    : primaryProfileRole === 'barber_verified'
                      ? 'from-[#141419] via-emerald-500/10 to-transparent'
                      : 'from-[#141419] via-[#141419]/30 to-transparent'
            }`}
          />

          {isOwnProfile && (
            <label className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-black/70 hover:bg-black text-[11px] font-semibold text-white cursor-pointer transition-colors">
              <Camera className="w-3.5 h-3.5 text-[#D4A853]" />
              <span>تغيير الغلاف</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handlePhotoUpload(e, 'coverURL')}
                className="hidden"
              />
            </label>
          )}
        </div>

        <div className="px-4 sm:px-6 pb-5 -mt-11 relative z-10 space-y-4">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="flex items-end gap-3.5 min-w-0">
              <div className="relative w-24 h-24 shrink-0">
                <Avatar
                  src={profileUser.photoURL}
                  name={profileUser.displayName}
                  size="xl"
                  role={primaryProfileRole}
                  roles={profileRoles}
                  avatarFrame={profileUser.avatarFrame}
                  avatarFrameExpiresAt={profileUser.avatarFrameExpiresAt}
                  className="ring-4 ring-[#141419]"
                />
                {isOwnProfile && (
                  <label
                    title="تغيير الصورة الشخصية"
                    className="absolute bottom-0 left-0 w-7 h-7 rounded-full bg-[#D4A853] text-[#0B0B0E] flex items-center justify-center shadow-lg cursor-pointer hover:bg-[#E0B96B]"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handlePhotoUpload(e, 'photoURL')}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              <div className="min-w-0 space-y-1.5 pb-0.5">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <h1 className={`text-lg sm:text-2xl font-extrabold truncate max-w-full ${getEffectiveNameColorClass(profileUser)}`}>
                    {profileUser.displayName}
                  </h1>
                  <VipSilverStar roles={profileRoles} size="md" />
                  <RoleTag role={primaryProfileRole} size="sm" />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(`@${profileHandle}`).catch(() => {});
                      setCopiedHandle(true);
                      window.setTimeout(() => setCopiedHandle(false), 1800);
                    }}
                    title="نسخ المعرف الرقمي"
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11px] font-mono-num cursor-pointer transition-colors whitespace-nowrap ${
                      isSpecialActive
                        ? 'bg-[#D4A853]/18 hover:bg-[#D4A853]/28 border-[#D4A853]/65 text-[#FCE08B] font-extrabold'
                        : 'bg-[#1A1A22] hover:bg-[#23232D] border-[#2C2C36] text-[#D4A853]'
                    }`}
                  >
                    <span dir="ltr">@{profileHandle}</span>
                    {copiedHandle ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3 opacity-75" />
                    )}
                  </button>
                </div>

                {/* Single Concise Summary Line: Presence · Country · Join Date · Level */}
                {(() => {
                  const liveMeta = getEffectiveLiveStatus(
                    profileUser,
                    isOwnProfile && profileUser.liveStatus !== 'offline',
                    nowTick
                  );
                  return (
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] sm:text-xs text-[#A6A196]">
                      <span
                        title={
                          profileUser.lastActiveAt
                            ? formatFullDateTime(profileUser.lastActiveAt)
                            : liveMeta.label
                        }
                        className={`inline-flex items-center gap-1 font-bold ${liveMeta.textClass}`}
                      >
                        <span className={`w-2 h-2 rounded-full ${liveMeta.dotClass}`} />
                        {liveMeta.status === 'offline'
                          ? `أوفلاين · ${formatLastSeen(profileUser.lastActiveAt, nowTick)}`
                          : liveMeta.label}
                      </span>

                      {(profileUser.countryCode || isOwnProfile) && (
                        <>
                          <span aria-hidden="true">·</span>
                          <CountryFlag
                            code={
                              profileUser.countryCode ||
                              (isOwnProfile ? activeCountryCode : undefined)
                            }
                            showName
                            size="xs"
                            className="text-[#F5F2EB] font-semibold"
                          />
                        </>
                      )}

                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-[#D4A853]" />
                        <span>انضم {joinDateText}</span>
                      </span>

                      <span aria-hidden="true">·</span>
                      <span className={`font-bold ${profileLevelInfo.textColorClass}`}>
                        مستوى {profileLevelInfo.level}
                      </span>
                    </div>
                  );
                })()}

                {/* Barber-Only Compact Salon & Rating Row */}
                {isBarber && (
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-[#A6A196]">
                    {profileUser.salonName && (
                      <span className="font-semibold text-[#F5F2EB]">{profileUser.salonName}</span>
                    )}
                    {profileUser.salonName && <span aria-hidden="true">·</span>}
                    <span className="inline-flex items-center gap-1 text-[#D4A853] font-mono-num">
                      <Star className="w-3 h-3 fill-[#D4A853]" />
                      {ratingStats.count > 0
                        ? `${ratingStats.avg.toFixed(1)} (${ratingStats.count})`
                        : 'بدون تقييم'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 text-rose-400 font-mono-num">
                      <Heart className="w-3 h-3 fill-rose-400" />
                      {profileLikeInfo.count}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Streamlined Primary Actions Row */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {isOwnProfile ? (
                <>
                  {(() => {
                    const currentStatus = getEffectiveLiveStatus(profileUser, true, nowTick).status;
                    return (
                      <div className="inline-flex items-center gap-0.5 p-1 bg-[#1A1A22] border border-[#2C2C35] rounded-xl">
                        {(
                          [
                            { key: 'online', label: 'أونلاين', activeClass: 'bg-emerald-500 text-[#0B0B0E]' },
                            { key: 'cutting', label: 'مشغول', activeClass: 'bg-amber-500 text-[#0B0B0E]' },
                            { key: 'offline', label: 'أوفلاين', activeClass: 'bg-[#5E5A54] text-white' },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => handleChangeLiveStatus(opt.key)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                              currentStatus === opt.key
                                ? opt.activeClass
                                : 'text-[#9C968B] hover:text-white'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    );
                  })()}

                  <button
                    type="button"
                    onClick={() => {
                      setDraftName(profileUser.displayName);
                      setDraftUsername(profileHandle);
                      setUsernameError(null);
                      setDraftBio(profileUser.bio || '');
                      setDraftSalonName(profileUser.salonName || '');
                      setEditingProfile((v) => !v);
                    }}
                    className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1D1D25] hover:bg-[#262630] border border-[#2E2E3A] text-xs font-semibold text-[#F5F2EB] cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-[#D4A853]" />
                    <span>تعديل</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDraftFriendPolicy(currentUser.friendRequestPolicy || 'everyone');
                      setDraftHideOnline(Boolean(currentUser.hideOnlineStatus));
                      setSettingsSuccess(null);
                      setSettingsModalOpen(true);
    }}
                    title="الإعدادات والخصوصية"
                    className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1D1D25] hover:bg-[#262630] border border-[#2E2E3A] text-xs font-semibold text-[#F5F2EB] cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5 text-[#D4A853]" />
                    <span>الإعدادات</span>
                  </button>

                  {!isSuperAdmin && !isBarberMember(currentUser) && (
                    myLatestRequest?.status === 'pending' ? (
                      <span className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/12 border border-amber-500/35 text-amber-300 text-[11px] font-semibold">
                        <Clock className="w-3.5 h-3.5" />
                        <span>التوثيق قيد المراجعة</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setVerifyModalOpen(true)}
                        className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-bold cursor-pointer"
                      >
                        <BadgeCheck className="w-3.5 h-3.5" />
                        <span>{myLatestRequest?.status === 'rejected' ? 'إعادة التوثيق' : 'توثيق كحلاق'}</span>
                      </button>
                    )
                  )}

                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={openAdminManageModal}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#D4A853]/18 hover:bg-[#D4A853]/28 border border-[#D4A853]/55 text-xs font-extrabold text-[#FCE08B] cursor-pointer transition-colors"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 text-[#D4A853]" />
                      <span>إدارة العضو</span>
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={isProfileBlocked}
                    onClick={() => onStartPrivateChat(profileUser)}
                    className={`min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-semibold ${
                      isProfileBlocked
                        ? 'bg-[#17171E] border-[#292935] text-[#7B766E] cursor-not-allowed'
                        : 'bg-[#1D1D25] hover:bg-[#262630] border-[#2E2E3A] text-[#F5F2EB] cursor-pointer'
                    }`}
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-[#D4A853]" />
                    <span>مراسلة</span>
                  </button>

                  {isBarber && !isProfileBlocked && (
                    <button
                      type="button"
                      onClick={() => onBookBarber(profileUser)}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-extrabold cursor-pointer"
                    >
                      <CalendarClock className="w-3.5 h-3.5" />
                      <span>حجز</span>
                    </button>
                  )}

                  {!activeFriendship ? (
                    <button
                      type="button"
                      disabled={friendBusy || !friendEligibility.allowed}
                      title={friendEligibility.reason || 'إضافة صديق'}
                      onClick={() => {
                        if (onSendFriendRequest) {
                          void handleFriendAction(() => onSendFriendRequest(profileUser));
                        }
                      }}
                      className={`min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors ${
                        friendEligibility.allowed
                          ? 'bg-[#1D1D25] hover:bg-[#D4A853] hover:text-[#0B0B0E] border-[#D4A853]/40 text-[#F5D67B] cursor-pointer'
                          : 'bg-[#17171E] border-[#292935] text-[#7B766E] cursor-not-allowed'
                      }`}
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{friendEligibility.allowed ? 'إضافة صديق' : 'مقيّد'}</span>
                    </button>
                  ) : activeFriendship.status === 'pending' &&
                    activeFriendship.requesterId === currentUser.uid ? (
                    <button
                      type="button"
                      disabled={friendBusy}
                      onClick={() => {
                        if (onRejectOrRemoveFriend) {
                          void handleFriendAction(() =>
                            onRejectOrRemoveFriend(activeFriendship.id)
                          );
                        }
                      }}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/12 hover:bg-red-500/15 border border-amber-500/35 text-xs font-bold text-amber-200 hover:text-red-300 cursor-pointer"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>إلغاء الطلب</span>
                    </button>
                  ) : activeFriendship.status === 'pending' ? (
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        disabled={friendBusy}
                        onClick={() => {
                          if (onAcceptFriendRequest) {
                            void handleFriendAction(() =>
                              onAcceptFriendRequest(activeFriendship)
                            );
                          }
                        }}
                        className="min-h-[38px] inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#0B0B0E] text-xs font-bold cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>قبول</span>
                      </button>
                      <button
                        type="button"
                        disabled={friendBusy}
                        onClick={() => {
                          if (onRejectOrRemoveFriend) {
                            void handleFriendAction(() =>
                              onRejectOrRemoveFriend(activeFriendship.id)
                            );
                          }
                        }}
                        title="رفض"
                        className="min-h-[38px] inline-flex items-center justify-center px-2.5 py-1.5 rounded-xl bg-[#1D1D25] hover:bg-red-500/20 border border-[#2E2E3A] text-xs text-[#C8C2B8] hover:text-red-300 cursor-pointer"
                      >
                        <UserX className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={friendBusy}
                      onClick={() => {
                        if (onRejectOrRemoveFriend) {
                          void handleFriendAction(() =>
                            onRejectOrRemoveFriend(activeFriendship.id)
                          );
                        }
                      }}
                      title="إزالة الصداقة"
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-red-500/15 border border-emerald-500/40 text-xs font-bold text-emerald-300 hover:text-red-300 cursor-pointer"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>أصدقاء</span>
                    </button>
                  )}

                  {isBarber && (
                    <button
                      type="button"
                      onClick={() => onToggleLike('profile', profileUser.uid)}
                      title="إعجاب بالبروفايل"
                      className={`min-h-[38px] inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                        profileLikeInfo.likedByMe
                          ? 'bg-rose-500/15 border-rose-500/45 text-rose-300'
                          : 'bg-[#1D1D25] hover:bg-[#262630] border-[#2E2E3A] text-[#F5F2EB]'
                      }`}
                    >
                      <Heart
                        className={`w-3.5 h-3.5 ${
                          profileLikeInfo.likedByMe ? 'fill-rose-400 text-rose-400' : 'text-rose-400'
                        }`}
                      />
                      <span className="font-mono-num">{profileLikeInfo.count}</span>
                    </button>
                  )}

                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={openAdminManageModal}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#D4A853]/18 hover:bg-[#D4A853]/28 border border-[#D4A853]/55 text-xs font-extrabold text-[#FCE08B] cursor-pointer transition-colors"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 text-[#D4A853]" />
                      <span>إدارة العضو</span>
                    </button>
                  )}

                  {onOpenReport && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenReport({
                          targetType: 'profile',
                          targetId: profileUser.uid,
                          targetOwnerId: profileUser.uid,
                          targetOwnerName: profileUser.displayName,
                          targetPreview: profileUser.bio || profileUser.displayName,
                        })
                      }
                      title="إبلاغ عن الحساب"
                      className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 cursor-pointer"
                    >
                      <Flag className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {!hasRole(profileUser, 'admin') && (isProfileBlocked ? onUnblockUser : onBlockUser) && (
                    <button
                      type="button"
                      disabled={friendBusy}
                      onClick={() => {
                        if (isProfileBlocked && onUnblockUser) {
                          void handleFriendAction(() => onUnblockUser(profileUser.uid));
                        } else if (onBlockUser) {
                          void handleFriendAction(() =>
                            onBlockUser(
                              profileUser.uid,
                              profileUser.displayName,
                              profileUser.photoURL
                            )
                          );
                        }
                      }}
                      title={isProfileBlocked ? 'إلغاء الحظر' : 'حظر المستخدم'}
                      className={`min-h-[38px] px-2.5 py-1.5 rounded-xl border cursor-pointer transition-colors ${
                        isProfileBlocked
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          : 'bg-red-500/10 hover:bg-red-500/20 border-red-500/30 text-red-300'
                      }`}
                    >
                      <Ban className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {profileUser.bio && (
            <p className="text-xs sm:text-sm text-[#C8C2B8] max-w-2xl leading-relaxed border-t border-[#22222C] pt-3">
              {profileUser.bio}
            </p>
          )}
        </div>

        {friendFeedback && (
          <div className="mx-4 sm:mx-6 mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
            {friendFeedback}
          </div>
        )}

        {/* Verification Feedback Messages in Own Profile */}
        {isOwnProfile && verifySuccessMsg && (
          <div className="mx-6 mb-5 flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{verifySuccessMsg}</span>
          </div>
        )}

        {/* Inline Edit Profile Form */}
        {isOwnProfile && editingProfile && (
          <form
            onSubmit={handleSaveProfileInfo}
            className="mx-6 mb-6 p-5 bg-[#1A1A22] border border-[#2C2C35] rounded-2xl space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#C8C2B8]">الاسم الظاهر</label>
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="w-full bg-[#121217] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2 text-xs text-[#F5F2EB] outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#C8C2B8]">
                  المعرف الرقمي الفريد (ID للمنشن @)
                </label>
                <div dir="ltr" className="relative flex items-center">
                  <AtSign className="w-3.5 h-3.5 text-[#D4A853] absolute left-3 pointer-events-none" />
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    maxLength={12}
                    value={draftUsername}
                    onChange={(e) => {
                      setDraftUsername(normalizeNumericIdInput(e.target.value));
                      setUsernameError(null);
                    }}
                    placeholder="482915"
                              className="w-full bg-[#121217] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl pl-8 pr-3.5 py-2 text-xs font-mono-num text-[#F5F2EB] outline-none"
                  />
                </div>
                <p className="text-[10px] text-[#8B857B]">
                  أرقام إنجليزية فقط (5–12 رقم، والأرقام المميزة من إدارة المنصة)
                </p>
              </div>
              {isBarber && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#C8C2B8]">اسم الصالون</label>
                  <input
                    type="text"
                    maxLength={100}
                    value={draftSalonName}
                    onChange={(e) => setDraftSalonName(e.target.value)}
                    placeholder="مثال: صالون المقص الذهبي"
                    className="w-full bg-[#121217] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2 text-xs text-[#F5F2EB] outline-none"
                  />
                </div>
              )}
            </div>
            {usernameError && (
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                {usernameError}
              </div>
            )}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#C8C2B8]">النبذة التعريفية</label>
              <textarea
                rows={2}
                maxLength={400}
                value={draftBio}
                onChange={(e) => setDraftBio(e.target.value)}
                placeholder="اكتب نبذة قصيرة عنك أو عن خبرتك..."
                className="w-full bg-[#121217] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2 text-xs text-[#F5F2EB] outline-none resize-none"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[#121217] border border-[#2C2C35]">
              <div className="flex items-center gap-2.5 text-xs">
                <Globe className="w-4 h-4 text-[#D4A853]" />
                <span className="text-[#9C968B]">البلد النشط حالياً:</span>
                <CountryFlag code={activeCountryCode} showName size="sm" className="font-bold text-[#F5F2EB]" />
                <span className="text-[11px] text-[#7E786E] font-mono-num">
                  ({getCountryByCode(activeCountryCode)?.nameEn || activeCountryCode})
                </span>
              </div>
              <button
                type="button"
                onClick={onOpenCountrySwitcher}
                className="px-3.5 py-1.5 rounded-lg bg-[#D4A853]/15 hover:bg-[#D4A853] border border-[#D4A853]/40 text-xs font-bold text-[#F5D67B] hover:text-[#0B0B0E] transition-colors cursor-pointer"
              >
                تغيير البلد / Change Country
              </button>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingProfile(false)}
                className="px-4 py-2 rounded-xl bg-[#252530] text-xs font-semibold text-[#F5F2EB] cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={savingProfile}
                className="px-4 py-2 rounded-xl bg-[#D4A853] text-[#0B0B0E] text-xs font-bold cursor-pointer"
              >
                {savingProfile ? 'جاري الحفظ...' : 'حفظ التغييرات'}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Mobile-First Organized Profile Navigation Tabs */}
      <nav
        aria-label="أقسام الملف الشخصي"
        className="flex items-center gap-1.5 p-1.5 bg-[#141419] border border-[#27272F] rounded-2xl overflow-x-auto no-scrollbar"
      >
        {isBarber && (
          <>
            <button
              type="button"
              onClick={() => setProfileTab('services')}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                profileTab === 'services'
                  ? 'bg-[#D4A853] text-[#0B0B0E]'
                  : 'text-[#A6A196] hover:text-[#F5F2EB] hover:bg-[#1B1B23]'
              }`}
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>الخدمات والموقع</span>
            </button>
            <button
              type="button"
              onClick={() => setProfileTab('portfolio')}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                profileTab === 'portfolio'
                  ? 'bg-[#D4A853] text-[#0B0B0E]'
                  : 'text-[#A6A196] hover:text-[#F5F2EB] hover:bg-[#1B1B23]'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>الأعمال ({barberWorks.length})</span>
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => setProfileTab('posts')}
          className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
            profileTab === 'posts'
              ? 'bg-[#D4A853] text-[#0B0B0E]'
              : 'text-[#A6A196] hover:text-[#F5F2EB] hover:bg-[#1B1B23]'
          }`}
        >
          <UserIcon className="w-3.5 h-3.5" />
          <span>المنشورات ({userPosts.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setProfileTab('identity')}
          className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
            profileTab === 'identity'
              ? 'bg-[#D4A853] text-[#0B0B0E]'
              : 'text-[#A6A196] hover:text-[#F5F2EB] hover:bg-[#1B1B23]'
          }`}
        >
          <Ticket className="w-3.5 h-3.5" />
          <span>الهوية والمزايا{extrasCount > 0 ? ` (${extrasCount})` : ''}</span>
        </button>
      </nav>

      {/* TAB 1: Digital Identity, Level Progress & Additional Perks */}
      {profileTab === 'identity' && (
        <div className="space-y-4">
          {/* Credits & Level Progress Card */}
          <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-bold text-[#D4A853] font-mono-num tabular-nums">
                <Coins className="w-4 h-4" />
                {profileCoins} كريدت أوريليوس
              </span>
              <span className={`font-extrabold ${profileLevelInfo.textColorClass}`}>
                المستوى {profileLevelInfo.level}: {profileLevelInfo.title}
              </span>
            </div>
            {profileLevelInfo.nextLevelPoints !== null && (
              <div className="space-y-1">
                <div className="w-full h-2 rounded-full bg-[#24242E] overflow-hidden">
                  <div
                    className="h-full bg-[#D4A853] transition-all"
                    style={{ width: `${profileLevelInfo.progressPercent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono-num text-[#8B857B]">
                  <span>التقدم نحو المستوى التالي</span>
                  <span>{profileCoins} / {profileLevelInfo.nextLevelPoints}</span>
                </div>
              </div>
            )}

            {extrasCount > 0 && (
              <div className="pt-3 border-t border-[#22222C] space-y-2.5">
                {secondaryRoles.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold text-[#9C968B]">الرتب الإضافية</div>
                    <RoleBadgesList roles={secondaryRoles} size="sm" />
                  </div>
                )}
                {(isSpecialActive ||
                  activeProfileColor ||
                  activeProfileFrame ||
                  activeChatTitle ||
                  activeCreditPass) && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold text-[#9C968B]">المزايا والزينة المفعلة</div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isSpecialActive && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#D4A853]/15 border border-[#D4A853]/40 text-[11px] font-bold text-[#F5D67B]">
                          <Sparkles className="w-3 h-3" />
                          <span>{profileUser.specialIdLabel || 'آيدي مميز'}</span>
                          {profileUser.specialIdExpiresAt && (
                            <span className="text-[10px] font-mono-num opacity-80">
                              · {formatRemainingDuration(profileUser.specialIdExpiresAt, nowTick)}
                            </span>
                          )}
                        </span>
                      )}
                      {activeProfileColor && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/12 border border-sky-400/35 text-[11px] font-bold text-sky-200">
                          <Palette className="w-3 h-3" />
                          <span>{NAME_COLOR_PRESETS[activeProfileColor]?.labelAr}</span>
                        </span>
                      )}
                      {activeProfileFrame && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-500/12 border border-violet-400/35 text-[11px] font-bold text-violet-200">
                          <Frame className="w-3 h-3" />
                          <span>{AVATAR_FRAME_PRESETS[activeProfileFrame]?.labelAr}</span>
                        </span>
                      )}
                      {activeChatTitle && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/12 border border-amber-400/35 text-[11px] font-bold text-amber-200">
                          <span>لقب: {CHAT_TITLE_PRESETS[activeChatTitle]?.labelAr}</span>
                        </span>
                      )}
                      {activeCreditPass && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/12 border border-sky-400/35 text-[11px] font-bold text-sky-200">
                          <span>بطاقة متجر مؤقتة</span>
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DigitalMemberPass
            profileUser={profileUser}
            profileHandle={profileHandle}
            isOwnProfile={isOwnProfile}
            ratingStats={ratingStats}
            latestVerificationStatus={isOwnProfile ? myLatestRequest?.status : undefined}
            activeCountryCode={activeCountryCode}
            nowTick={nowTick}
          />
        </div>
      )}

      {/* TAB 2: Barber Works Portfolio (Before/After + Dual Likes) */}
      {isBarber && profileTab === 'portfolio' && (
        <div className="space-y-5">
          {/* Portfolio Header Bar */}
          <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base sm:text-lg font-bold text-[#F5F2EB] flex items-center gap-2">
                <Scissors className="w-4 h-4 text-[#D4A853]" />
                <span>ملف أعمال {profileUser.displayName} (قبل وبعد)</span>
              </h2>
              <p className="text-xs text-[#9C968B]">
                اسحب شريط المقارنة لعرض التحول قبل وبعد الحلاقة، مع إجمالي إعجابات الأعمال ({totalWorksLikesCount}).
              </p>
            </div>

            {canPublishPortfolio && (
              <button
                type="button"
                onClick={openCreateWorkModal}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-bold cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة عمل (قبل وبعد)</span>
              </button>
            )}
          </div>

          {isOwnProfile &&
            hasRole(currentUser, 'barber_verified') &&
            !hasRole(currentUser, 'vip_barber') &&
            !isSuperAdmin && (
            <div className="p-4 rounded-2xl bg-slate-200/[0.06] border border-slate-300/30 text-slate-200 text-xs flex items-center gap-2.5">
              <Star className="w-4 h-4 fill-[#E2E8F0] text-white shrink-0" />
              <span>
                صلاحية النشر في المعرض العام وملف الأعمال حصرية لحملة رتبة <strong>«حلاق VIP / خبير»</strong> بالتعيين اليدوي من المؤسس.
              </span>
            </div>
          )}

          {barberWorks.length === 0 ? (
            <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-10 text-center space-y-2.5">
              <ImageIcon className="w-8 h-8 text-[#D4A853] mx-auto opacity-60" />
              <div className="text-sm font-bold text-[#F5F2EB]">
                لا توجد أعمال منشورة في ملف الحلاق بعد
              </div>
              <p className="text-xs text-[#9C968B]">
                {isOwnProfile
                  ? 'أضف أول عمل لك مع إمكانية إرفاق صورة قبل وبعد لإبراز نتائج قصاتك.'
                  : 'سيظهر هنا أرشيف قصات الحلاق وتحولات قبل وبعد فور نشرها.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {barberWorks.map((work) => {
                const canManage = isOwnProfile || isSuperAdmin;
                const hasBA = Boolean(work.isBeforeAfter && work.beforeImageUrl);
                const wLike = getWorkLikes(work.id);
        const catLabel =
                  PORTFOLIO_CATEGORIES.find((c) => c.key === work.category)?.label ||
                  work.category;

                return (
                  <article
                    key={work.id}
                    className="bg-[#141419] border border-[#27272F] rounded-2xl overflow-hidden flex flex-col justify-between"
                  >
                    {hasBA && work.beforeImageUrl ? (
                      <BeforeAfterCompare
                        beforeUrl={work.beforeImageUrl}
                        afterUrl={work.imageUrl}
                        title={work.title}
                      />
                    ) : (
                      <div
                        onClick={() => setLightboxWork(work)}
                        className="relative aspect-[4/3] bg-[#1A1A22] overflow-hidden cursor-pointer"
                      >
                        <img
                          src={work.imageUrl}
                          alt={work.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover hover:scale-[1.03] transition-transform duration-300"
                        />
                      </div>
                    )}

                    <div className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setLightboxWork(work)}
                          className="text-right cursor-pointer"
                        >
                          <div className="text-[11px] font-medium text-[#D4A853]">
                            {catLabel}
                            {hasBA ? ' · قبل وبعد' : ''}
                          </div>
                          <h3 className="text-sm font-bold text-[#F5F2EB] hover:text-[#D4A853]">
                            {work.title}
                          </h3>
                        </button>

                        <button
                          type="button"
                          onClick={() => onToggleLike('gallery', work.id)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold shrink-0 cursor-pointer transition-colors ${
                            wLike.likedByMe
                              ? 'bg-rose-500/15 text-rose-400'
                              : 'bg-[#1A1A22] text-[#A6A196] hover:text-rose-400'
                          }`}
                        >
                          <Heart
                            className={`w-3.5 h-3.5 ${wLike.likedByMe ? 'fill-rose-400' : ''}`}
                          />
                          <span className="font-mono-num">{wLike.count}</span>
                        </button>
                      </div>

                      {work.description && (
                        <p className="text-xs text-[#A6A196] leading-relaxed line-clamp-2">
                          {work.description}
                        </p>
                      )}

                      {canManage && (
                        <div className="flex items-center justify-end gap-1 pt-2 border-t border-[#22222A]">
                          <button
                            type="button"
                            onClick={() => openEditWorkModal(work)}
                            title="تعديل"
                            className="p-1.5 rounded-lg text-[#9C968B] hover:text-[#D4A853] hover:bg-[#1E1E26] cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteWork(work)}
                            title="حذف"
                            className="p-1.5 rounded-lg text-[#9C968B] hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Barber Services, Salon Map & Collapsible Reviews */}
      {isBarber && profileTab === 'services' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Services & Prices */}
          <div className="lg:col-span-6 bg-[#141419] border border-[#27272F] rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scissors className="w-4 h-4 text-[#D4A853]" />
                <h2 className="text-sm sm:text-base font-bold text-[#F5F2EB]">قائمة الخدمات والأسعار</h2>
              </div>
              {isOwnProfile && (
                <button
                  type="button"
                  onClick={() => setShowAddService((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#D4A853] hover:underline cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة خدمة</span>
                </button>
              )}
            </div>

            {isOwnProfile && showAddService && (
              <form
                onSubmit={handleAddService}
                className="p-4 bg-[#1A1A22] border border-[#2C2C35] rounded-xl space-y-3"
              >
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={srvName}
                  onChange={(e) => setSrvName(e.target.value)}
                  placeholder="اسم الخدمة (مثال: حلاقة وتدريج + لحية)"
                  className="w-full bg-[#121217] border border-[#2C2C35] rounded-xl px-3 py-2 text-xs text-[#F5F2EB] outline-none"
                />
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-[#9C968B] mb-1">السعر (ر.س / $)</label>
                    <input
                      type="number"
                      required
                      min={0}
                      max={10000}
                      value={srvPrice}
                      onChange={(e) => setSrvPrice(e.target.value)}
                      className="w-full bg-[#121217] border border-[#2C2C35] rounded-xl px-3 py-2 text-xs font-mono-num text-[#F5F2EB] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#9C968B] mb-1">المدة (دقيقة)</label>
                    <input
                      type="number"
                      required
                      min={5}
                      max={240}
                      value={srvDuration}
                      onChange={(e) => setSrvDuration(e.target.value)}
                      className="w-full bg-[#121217] border border-[#2C2C35] rounded-xl px-3 py-2 text-xs font-mono-num text-[#F5F2EB] outline-none"
                    />
                  </div>
                </div>
                <input
                  type="text"
                  maxLength={180}
                  value={srvDesc}
                  onChange={(e) => setSrvDesc(e.target.value)}
                  placeholder="تفاصيل إضافية (اختياري)"
                  className="w-full bg-[#121217] border border-[#2C2C35] rounded-xl px-3 py-2 text-xs text-[#F5F2EB] outline-none"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddService(false)}
                    className="px-3 py-1.5 rounded-lg text-xs text-[#9C968B] cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-[#D4A853] text-[#0B0B0E] text-xs font-bold cursor-pointer"
                  >
                    حفظ الخدمة
                  </button>
                </div>
              </form>
            )}

            {(profileUser.services || []).length === 0 ? (
              <p className="text-xs text-[#8B857B]">لم يضف الحلاق قائمة خدماته بعد.</p>
            ) : (
              <div className="divide-y divide-[#22222A]">
                {(profileUser.services || []).map((srv) => (
                  <div
                    key={srv.id}
                    className="py-3 flex items-center justify-between gap-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-sm font-bold text-[#F5F2EB]">{srv.name}</div>
                      <div className="flex items-center gap-2 text-xs text-[#9C968B] font-mono-num">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {srv.durationMinutes} د
                        </span>
                        {srv.description && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-sans truncate">{srv.description}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono-num text-sm font-bold text-[#D4A853]">
                        {srv.price} ر.س
                      </span>
                      {isOwnProfile ? (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteService(srv)}
                          className="p-1.5 text-[#8B857B] hover:text-red-400 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onBookBarber(profileUser, srv)}
                          className="px-2.5 py-1.5 rounded-lg bg-[#D4A853]/15 hover:bg-[#D4A853] text-[#D4A853] hover:text-[#0B0B0E] text-xs font-bold transition-colors cursor-pointer"
                        >
                          حجز
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-6 space-y-4">
            {/* Map Location */}
            <LocationPickerMap
              location={profileUser.location}
              addressLabel={profileUser.addressLabel}
              editable={isOwnProfile}
              onSaveLocation={handleSaveLocation}
            />

            {/* Collapsible Customer Reviews */}
            <div className="bg-[#141419] border border-[#27272F] rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => setReviewsExpanded((v) => !v)}
                className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-right hover:bg-[#191922] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 fill-[#D4A853] text-[#D4A853]" />
                  <h3 className="text-sm sm:text-base font-bold text-[#F5F2EB]">
                    تقييمات الزبائن ({ratingStats.count})
                  </h3>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono-num text-[#D4A853]">
                  <span>{ratingStats.count > 0 ? `${ratingStats.avg.toFixed(1)}★` : '0 تقييم'}</span>
                  {reviewsExpanded ? (
                    <ChevronUp className="w-4 h-4 text-[#9C968B]" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#9C968B]" />
                  )}
                </div>
              </button>

              {reviewsExpanded && (
                <div className="px-4 sm:px-5 pb-4 sm:pb-5 border-t border-[#22222A] pt-3">
                  {barberReviews.length === 0 ? (
                    <p className="text-xs text-[#8B857B]">
                      تظهر هنا تقييمات الزبائن بالنجوم بعد إتمام المواعيد.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {barberReviews.map((rev) => (
                        <div
                          key={rev.id}
                          className="p-3 rounded-xl bg-[#1A1A22] border border-[#262630] space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar src={rev.customerPhoto} name={rev.customerName} size="xs" />
                              <span className="text-xs font-bold text-[#F5F2EB] truncate">
                                {rev.customerName}
                              </span>
                              {rev.createdAt && (
                                <span
                    title={formatFullDateTime(rev.createdAt)}
                                  className="text-[10px] font-mono-num text-[#8B857B] shrink-0"
                                >
                                  · {formatMessageTime(rev.createdAt, nowTick)}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-0.5 text-[#D4A853] shrink-0">
                              {[1, 2, 3, 4, 5].map((n) => (
                                <Star
                                  key={n}
                                  className={`w-3 h-3 ${
                                    n <= rev.rating ? 'fill-[#D4A853]' : 'text-[#3A3A46]'
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                          <p className="text-xs text-[#C8C2B8] leading-relaxed">{rev.comment}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Personal Posts Timeline */}
      {profileTab === 'posts' && (
        <div className="space-y-4">
          {isOwnProfile && (
            <form
              onSubmit={handleCreatePost}
              className="bg-[#141419] border border-[#27272F] rounded-2xl p-4 sm:p-5 space-y-3"
            >
              <div className="flex items-start gap-3">
                <Avatar
                  src={currentUser.photoURL}
                  name={currentUser.displayName}
                  size="sm"
                  role={getUserRoles(currentUser)[0]}
                  roles={getUserRoles(currentUser)}
                  avatarFrame={currentUser.avatarFrame}
                  avatarFrameExpiresAt={currentUser.avatarFrameExpiresAt}
                />
                <textarea
                  rows={2}
                  maxLength={1200}
                  value={postText}
                  onChange={(e) => setPostText(e.target.value)}
                  placeholder="شارك منشوراً شخصياً أو تحديثاً مع متابعيك..."
                  className="flex-1 bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl p-3 text-xs sm:text-sm text-[#F5F2EB] placeholder:text-[#6B665E] outline-none resize-none"
                />
              </div>

              {postImage && (
                <div className="relative rounded-xl overflow-hidden border border-[#2C2C35]">
                  <img src={postImage} alt="معاينة المنشور" className="w-full max-h-64 object-cover" />
                  <button
                    type="button"
                    onClick={() => setPostImage('')}
                    className="absolute top-2 left-2 p-1.5 rounded-full bg-black/75 text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1A1A22] hover:bg-[#23232D] border border-[#2C2C35] text-xs font-semibold text-[#C8C2B8] cursor-pointer">
                  <ImageIcon className="w-4 h-4 text-[#D4A853]" />
                  <span>إرفاق صورة</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePostImageSelect}
                    className="hidden"
                  />
                </label>

                <button
                  type="submit"
                  disabled={posting || !postText.trim()}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{posting ? 'جاري النشر...' : 'نشر'}</span>
                </button>
              </div>
            </form>
          )}

          {userPosts.length === 0 ? (
            <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-10 text-center text-sm text-[#8B857B]">
              لا توجد منشورات في هذا الملف الشخصي حتى الآن.
            </div>
          ) : (
            <div className="space-y-4">
              {userPosts.map((post) => {
                const canDelete = isOwnProfile || isAdminOrMod;
                return (
                  <article
                    key={post.id}
                    className="bg-[#141419] border border-[#27272F] rounded-2xl p-4 sm:p-5 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar
                          src={profileUser.photoURL || post.authorPhoto}
                          name={profileUser.displayName}
                          size="sm"
                          role={primaryProfileRole}
                          roles={profileRoles}
                          avatarFrame={profileUser.avatarFrame}
                          avatarFrameExpiresAt={profileUser.avatarFrameExpiresAt}
                        />
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <div
                            className={`text-sm font-bold truncate ${getEffectiveNameColorClass(
                              profileUser
                            )}`}
                          >
                            {profileUser.displayName}
                          </div>
                          <VipSilverStar roles={profileRoles} size="xs" />
                          <RoleTag role={primaryProfileRole} size="xs" />
                          {post.createdAt && (
                            <span
                              title={formatFullDateTime(post.createdAt)}
                              className="text-[11px] font-mono-num text-[#8B857B]"
                            >
                              · {formatMessageTime(post.createdAt, nowTick)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {isOwnProfile && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPostId(post.id);
                              setEditingPostText(post.text);
                            }}
                            title="تعديل المنشور"
                            className="p-2 rounded-lg text-[#9C968B] hover:text-[#D4A853] cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setConfirmDeletePost(post)}
                            title="حذف المنشور"
                            className="p-2 rounded-lg text-[#9C968B] hover:text-red-400 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {editingPostId === post.id ? (
                      <div className="space-y-2">
                        <textarea
                          rows={3}
                          maxLength={1200}
                          value={editingPostText}
                          onChange={(e) => setEditingPostText(e.target.value)}
                          className="w-full bg-[#1A1A22] border border-[#D4A853] rounded-xl p-3 text-sm text-[#F5F2EB] outline-none"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingPostId(null)}
                            className="px-3 py-1.5 rounded-lg bg-[#1E1E26] text-xs text-[#9C968B] cursor-pointer"
                          >
                            إلغاء
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSavePostEdit(post)}
                            className="px-3 py-1.5 rounded-lg bg-[#D4A853] text-[#0B0B0E] text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>حفظ</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-[#E6E1D8] leading-relaxed whitespace-pre-wrap">
                        {post.text}
                      </p>
                    )}

                    {post.imageUrl && (
                      <img
                        src={post.imageUrl}
                        alt="صورة المنشور"
                        referrerPolicy="no-referrer"
                        className="w-full max-h-96 object-cover rounded-xl border border-[#262630]"
                      />
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Portfolio Work Modal (Before & After Support) */}
      {workModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-[#141419] border border-[#2C2C35] rounded-2xl p-6 space-y-5 shadow-2xl my-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#F5F2EB] flex items-center gap-2">
                <Scissors className="w-4 h-4 text-[#D4A853]" />
                <span>{editingWork ? 'تعديل العمل' : 'إضافة عمل لملف الأعمال'}</span>
              </h2>
              <button
                type="button"
                onClick={() => setWorkModalOpen(false)}
                className="p-1.5 rounded-lg text-[#9C968B] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {workError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                {workError}
              </div>
            )}

            <form onSubmit={handleSaveWork} className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#1A1A22] border border-[#2C2C35]">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#F5F2EB]">
                  <Columns2 className="w-4 h-4 text-[#D4A853]" />
                  <span>عرض بميزة «قبل وبعد»</span>
                </div>
                <button
                  type="button"
                  onClick={() => setWorkIsBeforeAfter((v) => !v)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                    workIsBeforeAfter
                      ? 'bg-[#D4A853] text-[#0B0B0E]'
                      : 'bg-[#252530] text-[#9C968B]'
                  }`}
                >
                  {workIsBeforeAfter ? 'مفعّلة' : 'صورة واحدة'}
                </button>
              </div>

              <div className={`grid gap-3 ${workIsBeforeAfter ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                {workIsBeforeAfter && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-[#C8C2B8]">صورة «قبل»</label>
                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-[#2C2C36] hover:border-[#D4A853] rounded-xl p-3 cursor-pointer bg-[#1A1A22] min-h-[136px]">
                      {workBeforeImg ? (
                        <img
                          src={workBeforeImg}
                          alt="قبل"
                          className="w-full h-32 object-cover rounded-lg"
                        />
                      ) : (
                        <div className="text-center space-y-1 py-3">
                          <Upload className="w-5 h-5 text-[#D4A853] mx-auto" />
                          <div className="text-xs font-semibold text-[#F5F2EB]">اختر صورة قبل</div>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleWorkFileSelect(e, 'before')}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#C8C2B8]">
                    {workIsBeforeAfter ? 'صورة النتيجة «بعد»' : 'صورة العمل'}
                  </label>
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-[#2C2C36] hover:border-[#D4A853] rounded-xl p-3 cursor-pointer bg-[#1A1A22] min-h-[136px]">
                    {workAfterImg ? (
                      <img
                        src={workAfterImg}
                        alt="بعد"
                        className="w-full h-32 object-cover rounded-lg"
                      />
                    ) : (
                      <div className="text-center space-y-1 py-3">
                        <Upload className="w-5 h-5 text-[#D4A853] mx-auto" />
                        <div className="text-xs font-semibold text-[#F5F2EB]">
                          {workIsBeforeAfter ? 'اختر صورة بعد' : 'اختر صورة العمل'}
                        </div>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleWorkFileSelect(e, 'after')}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#C8C2B8]">عنوان العمل</label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={workTitle}
                    onChange={(e) => setWorkTitle(e.target.value)}
                    placeholder="مثال: تحول تدرج + لحية ملكية"
                    className="w-full bg-[#1A1A22] border border-[#2C2C35] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F2EB] outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#C8C2B8]">التصنيف</label>
                  <select
                    value={workCategory}
                    onChange={(e) => setWorkCategory(e.target.value as GalleryCategory)}
                    className="w-full bg-[#1A1A22] border border-[#2C2C35] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F2EB] outline-none"
                  >
                    {PORTFOLIO_CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <textarea
                rows={2}
                maxLength={500}
                value={workDesc}
                onChange={(e) => setWorkDesc(e.target.value)}
                placeholder="تفاصيل العمل أو القصة..."
                className="w-full bg-[#1A1A22] border border-[#2C2C35] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F2EB] outline-none resize-none"
              />

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setWorkModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#1C1C24] text-xs font-semibold text-[#A6A196] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={workSubmitting}
                  className="px-5 py-2 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-bold cursor-pointer disabled:opacity-60"
                >
                  {workSubmitting ? 'جاري الحفظ...' : editingWork ? 'حفظ التعديلات' : 'نشر العمل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Portfolio Work Lightbox Modal */}
      {lightboxWork && (
        <div
          onClick={() => setLightboxWork(null)}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl bg-[#141419] border border-[#2C2C35] rounded-2xl overflow-hidden shadow-2xl"
          >
            <div className="relative bg-black">
              {lightboxWork.isBeforeAfter && lightboxWork.beforeImageUrl ? (
                <BeforeAfterCompare
                  beforeUrl={lightboxWork.beforeImageUrl}
                  afterUrl={lightboxWork.imageUrl}
                  title={lightboxWork.title}
                  aspectClass="aspect-[16/10]"
                />
              ) : (
                <img
                  src={lightboxWork.imageUrl}
                  alt={lightboxWork.title}
                  referrerPolicy="no-referrer"
                  className="w-full max-h-[68vh] object-contain mx-auto"
                />
              )}
              <button
                type="button"
                onClick={() => setLightboxWork(null)}
                className="absolute top-3 left-3 z-30 p-2 rounded-full bg-black/70 text-white hover:bg-black cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-[#F5F2EB]">{lightboxWork.title}</h3>
                {lightboxWork.description && (
                  <p className="text-xs text-[#A6A196] mt-1">{lightboxWork.description}</p>
                )}
              </div>
              {(() => {
                const l = getWorkLikes(lightboxWork.id);
                return (
                  <button
                    type="button"
                    onClick={() => onToggleLike('gallery', lightboxWork.id)}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                      l.likedByMe
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                        : 'bg-[#1D1D25] text-[#F5F2EB] border border-[#2E2E3A]'
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${l.likedByMe ? 'fill-rose-400' : ''}`} />
                    <span className="font-mono-num">{l.count}</span>
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Barber Verification Modal */}
      <VerificationRequestModal
        open={verifyModalOpen}
        currentUser={currentUser}
        users={users}
        activeCountryCode={activeCountryCode}
        onClose={() => setVerifyModalOpen(false)}
        onSuccess={() =>
          setVerifySuccessMsg('تم إرسال طلب التوثيق إلى المؤسس والإدارة بنجاح.')
        }
      />

      {/* Delete Post Confirmation Modal */}
      <ConfirmModal
        open={Boolean(confirmDeletePost)}
        title="هل أنت متأكد من حذف المنشور؟"
        message="سيتم حذف هذا المنشور نهائياً من الملف الشخصي ولا يمكن استرجاعه."
        confirmLabel="نعم، حذف المنشور"
        onCancel={() => setConfirmDeletePost(null)}
        onConfirm={() => {
          if (confirmDeletePost) {
            return handleDeletePost(confirmDeletePost.id);
          }
        }}
      />

      {/* Delete Service Confirmation Modal */}
      <ConfirmModal
        open={Boolean(confirmDeleteService)}
        title="هل أنت متأكد من حذف الخدمة؟"
        message={
          confirmDeleteService
            ? `سيتم إزالة خدمة "${confirmDeleteService.name}" من قائمة خدماتك.`
            : ''
        }
        confirmLabel="نعم، حذف الخدمة"
        onCancel={() => setConfirmDeleteService(null)}
        onConfirm={() => {
          if (confirmDeleteService) {
            return handleRemoveService(confirmDeleteService.id);
          }
        }}
      />

      {/* Settings & Privacy Modal (Own Profile ⚙️) */}
      {isOwnProfile && settingsModalOpen && (
        <div
          onClick={() => setSettingsModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#141419] border border-[#2C2C35] rounded-2xl p-6 space-y-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-[#D4A853]" />
                <h3 className="text-base font-bold text-[#F5F2EB]">الإعدادات والخصوصية</h3>
              </div>
              <button
                type="button"
                onClick={() => setSettingsModalOpen(false)}
                className="p-1 text-[#9C968B] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {settingsSuccess && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-xs text-emerald-300">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{settingsSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSavePrivacySettings} className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-bold text-[#F5F2EB]">
                  من يمكنه إرسال طلب صداقة لك؟
                </label>
                <div className="space-y-1.5">
                  {(
                    [
                      {
                        value: 'everyone',
                        title: 'الجميع',
                        desc: 'أي عضو أو حلاق في المنصة يمكنه إرسال طلب صداقة',
                      },
                      {
                        value: 'barbers_only',
                        title: 'الحلاقون الموثقون فقط',
                        desc: 'السماح للحلاقين الموثقين وVIP بإرسال الطلبات فقط',
                      },
                      {
                        value: 'nobody',
                        title: 'لا أحد (مغلق)',
                        desc: 'تعطيل استقبال طلبات الصداقة الجديدة',
                      },
                    ] as Array<{ value: FriendRequestPolicy; title: string; desc: string }>
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDraftFriendPolicy(opt.value)}
                      className={`w-full p-3 rounded-xl border text-right transition-colors cursor-pointer ${
                        draftFriendPolicy === opt.value
                          ? 'bg-[#D4A853]/15 border-[#D4A853] text-[#F5F2EB]'
                          : 'bg-[#1A1A22] border-[#2A2A35] text-[#C8C2B8] hover:border-[#3D3D4E]'
                      }`}
                    >
                      <div className="text-xs font-bold">{opt.title}</div>
                      <div className="text-[11px] text-[#9C968B] mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDraftHideOnline((v) => !v)}
                className={`w-full p-3.5 rounded-xl border flex items-center justify-between gap-3 text-right transition-colors cursor-pointer ${
                  draftHideOnline
                    ? 'bg-[#D4A853]/12 border-[#D4A853]/65 text-[#F5F2EB]'
                    : 'bg-[#1A1A22] border-[#2A2A35] text-[#C8C2B8]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <EyeOff className="w-4 h-4 text-[#D4A853] shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold">إخفاء حالة الاتصال عن الآخرين</div>
                    <div className="text-[11px] text-[#9C968B]">
                      عند التفعيل ستظهر للجميع بحالة أوفلاين
                    </div>
                  </div>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 ${
                    draftHideOnline
                      ? 'bg-[#D4A853] text-[#0B0B0E]'
                      : 'bg-[#262632] text-[#9C968B]'
                  }`}
                >
                  {draftHideOnline ? 'مفعل' : 'معطل'}
                        </span>
              </button>

              <div className="p-3.5 rounded-xl bg-[#1A1A22] border border-[#2A2A35] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <Globe className="w-4 h-4 text-[#D4A853]" />
                  <CountryFlag code={activeCountryCode} showName size="sm" />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSettingsModalOpen(false);
                    onOpenCountrySwitcher();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#252532] hover:bg-[#D4A853] hover:text-[#0B0B0E] text-xs font-bold text-[#D4A853] transition-colors cursor-pointer"
                >
                  تغيير البلد
                </button>
              </div>

              {/* Blocked Users Management */}
              <div className="p-3.5 rounded-xl bg-[#1A1A22] border border-[#2A2A35] space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#F5F2EB]">
                    <Ban className="w-4 h-4 text-red-400" />
                    <span>قائمة المحظورين ({blockedUsers.length})</span>
                  </div>
                </div>
                {blockedUsers.length === 0 ? (
                  <p className="text-[11px] text-[#8B857B]">
                    لا يوجد مستخدمون محظورون حالياً.
                  </p>
                ) : (
                  <div className="max-h-36 overflow-y-auto divide-y divide-[#252532] space-y-1">
                    {blockedUsers.map((b) => (
                      <div
                        key={b.blockedUserId}
                        className="pt-1.5 first:pt-0 flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="truncate font-semibold text-[#E6E1D8]">
                          {b.blockedUserName}
                        </span>
                        {onUnblockUser && (
                          <button
                            type="button"
                            onClick={() => onUnblockUser(b.blockedUserId)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-[11px] font-bold shrink-0 cursor-pointer"
                          >
                            إلغاء الحظر
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Legal, Privacy & Account Deletion Links */}
              {onOpenPrivacy && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsModalOpen(false);
                      onOpenPrivacy('privacy');
                    }}
                    className="flex-1 min-w-[140px] px-3 py-2.5 rounded-xl bg-[#1A1A22] hover:bg-[#23232E] border border-[#2A2A35] text-xs font-semibold text-[#D4A853] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>سياسة الخصوصية</span>
                  </button>
                  {!isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setSettingsModalOpen(false);
                        onOpenPrivacy('delete');
                      }}
                      className="flex-1 min-w-[140px] px-3 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/35 text-xs font-bold text-red-300 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف الحساب والبيانات</span>
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#22222A]">
                <button
                  type="button"
                  onClick={() => setSettingsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#1E1E26] text-xs text-[#F5F2EB] cursor-pointer"
                >
                  إغلاق
                </button>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-5 py-2 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-bold cursor-pointer disabled:opacity-60"
                >
                  {savingSettings ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Founder Tabbed Member Management Modal ("إدارة العضو") */}
      {isSuperAdmin && adminManageModalOpen && (
        <div
          onClick={() => setAdminManageModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[90vh] bg-[#141419] border border-[#D4A853]/40 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-[#262632] flex items-center justify-between gap-3 shrink-0 bg-[#17171F]">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar
                  src={profileUser.photoURL}
                  name={profileUser.displayName}
                  size="sm"
                  role={primaryProfileRole}
                  roles={profileRoles}
                  avatarFrame={profileUser.avatarFrame}
                  avatarFrameExpiresAt={profileUser.avatarFrameExpiresAt}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm sm:text-base font-extrabold text-[#F5F2EB] truncate">
                      إدارة العضو: {profileUser.displayName}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-mono-num text-[#9C968B]">
                    <span dir="ltr" className="text-[#D4A853]">@{profileHandle}</span>
                    <span>·</span>
                    <span className="text-emerald-300 font-bold">{profileCoins} كريدت</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAdminManageModalOpen(false)}
                className="p-2 rounded-xl text-[#9C968B] hover:text-white hover:bg-[#23232E] cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 4 Clear Management Tabs */}
            <div className="px-4 py-2.5 border-b border-[#22222C] bg-[#121217] flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
              {(
                [
                  { key: 'ranks', label: 'الرتب والصلاحيات', icon: Shield },
                  { key: 'perks', label: 'الإطارات والألوان', icon: Palette },
                  { key: 'credits', label: 'الكريدت', icon: Coins },
                  { key: 'id', label: 'الأيدي (ID)', icon: KeyRound },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                const active = adminManageTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setAdminManageTab(tab.key);
                      setAdminToolsFeedback(null);
                      setRankFeedback(null);
                    }}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-[#D4A853] text-[#0B0B0E]'
                        : 'bg-[#1A1A22] text-[#9C968B] hover:text-[#F5F2EB]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
              {rankFeedback && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/12 border border-emerald-500/35 text-emerald-200 text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{rankFeedback}</span>
                </div>
              )}

              {adminToolsFeedback && (
                <div
                  className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                    adminToolsFeedback.type === 'ok'
                      ? 'bg-emerald-500/12 border-emerald-500/35 text-emerald-200'
                      : 'bg-red-500/12 border-red-500/35 text-red-200'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{adminToolsFeedback.text}</span>
                </div>
              )}

              {/* Tab 1: Ranks & Permissions */}
              {adminManageTab === 'ranks' && (
                <div className="space-y-4">
                  {isOwnProfile || hasRole(profileUser, 'admin') ? (
                    <div className="p-4 rounded-2xl bg-[#D4A853]/10 border border-[#D4A853]/35 text-xs text-[#F8DF8E] leading-relaxed">
                      حساب المؤسس يحمل أعلى رتبة سيادية دائمة في المنصة ولا يمكن تعديلها أو تخفيضها.
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#F5F2EB]">
                          تحديد رتب العضو المتعددة:
                        </span>
                        {!hasRole(profileUser, 'vip_barber') && (
                          <button
                            type="button"
                            disabled={updatingRank}
                            onClick={() =>
                              handleAdminSaveProfileRanks([...profileRoles, 'vip_barber'])
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-l from-slate-100 to-slate-300 text-[#0B0B0E] text-[11px] font-extrabold cursor-pointer disabled:opacity-60"
                          >
                            <Star className="w-3.5 h-3.5 fill-[#0B0B0E]" />
                            <span>إضافة VIP Barber</span>
                          </button>
                        )}
                      </div>

                      <MultiRoleSelector
                        selectedRoles={draftRoles}
                        onChange={setDraftRoles}
                        disabled={updatingRank}
                      />

                      <button
                        type="button"
                        disabled={updatingRank}
                        onClick={() => handleAdminSaveProfileRanks(draftRoles)}
                        className="w-full min-h-[42px] px-4 py-2.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-extrabold cursor-pointer disabled:opacity-60"
                      >
                        {updatingRank ? 'جاري حفظ الرتب...' : 'حفظ الرتب والصلاحيات'}
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Tab 2: Frames, Name Colors & Chat Titles */}
              {adminManageTab === 'perks' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-[#1A1A22] border border-[#282836]">
                    <span className="text-xs font-bold text-[#F5F2EB]">مدة المنحة المجانية:</span>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={adminPerkDaysMode}
                        onChange={(e) =>
                          setAdminPerkDaysMode(e.target.value as 'permanent' | 'timed')
                        }
                        className="bg-[#121217] border border-[#2C2C38] rounded-lg px-2.5 py-1.5 text-xs text-[#F5F2EB] outline-none"
                      >
                        <option value="permanent">دائم</option>
                        <option value="timed">مؤقت بالأيام</option>
                      </select>
                      {adminPerkDaysMode === 'timed' && (
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={adminPerkDays}
                          onChange={(e) => setAdminPerkDays(e.target.value)}
                          className="w-16 bg-[#121217] border border-[#2C2C38] rounded-lg px-2 py-1.5 text-xs font-mono-num text-[#F5F2EB] outline-none"
                        />
                      )}
                    </div>
                  </div>

                  {/* Avatar Frame Preview + Selector */}
                  <div className="p-3.5 rounded-2xl bg-[#1A1A22] border border-[#282836] space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="text-xs font-bold text-[#F5F2EB] flex items-center gap-1.5">
                          <Frame className="w-3.5 h-3.5 text-violet-300" />
                      <span>إطار الصورة</span>
                        </div>
                        <div className="text-[11px] text-[#9C968B]">
                          معاينة فورية للإطار قبل المنح
                        </div>
                      </div>
                      <Avatar
                        src={profileUser.photoURL}
                        name={profileUser.displayName}
                        size="md"
                        role={primaryProfileRole}
                        roles={profileRoles}
                        forcePreviewFrame={adminPerkFrame}
                      />
                    </div>
                    <select
                      value={adminPerkFrame}
                      onChange={(e) => setAdminPerkFrame(e.target.value as AvatarFrameKey)}
                      className="w-full bg-[#121217] border border-[#2C2C38] rounded-xl px-3 py-2 text-xs text-[#F5F2EB] outline-none"
                    >
                      {(Object.keys(AVATAR_FRAME_PRESETS) as AvatarFrameKey[]).map((k) => (
                        <option key={k} value={k}>
                          {AVATAR_FRAME_PRESETS[k].labelAr}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={adminToolsBusy}
                        onClick={() => handleAdminGrantProfilePerk('avatar_frame', adminPerkFrame)}
                        className="flex-1 min-h-[38px] rounded-xl bg-violet-500 hover:bg-violet-400 text-white text-xs font-bold cursor-pointer disabled:opacity-60"
                      >
                        منح الإطار
                      </button>
                      {activeProfileFrame && (
                        <button
                          type="button"
                          disabled={adminToolsBusy}
                          onClick={() => handleAdminGrantProfilePerk('avatar_frame', null)}
                          className="min-h-[38px] px-3.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-300 text-xs font-bold cursor-pointer"
                        >
                          إزالة
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Name Color */}
                  <div className="p-3.5 rounded-2xl bg-[#1A1A22] border border-[#282836] space-y-2.5">
                    <div className="text-xs font-bold text-[#F5F2EB] flex items-center gap-1.5">
                      <Palette className="w-3.5 h-3.5 text-[#D4A853]" />
                      <span>لون الاسم المتوهج</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={adminPerkColor}
                        onChange={(e) => setAdminPerkColor(e.target.value as NameColorKey)}
                        className="flex-1 bg-[#121217] border border-[#2C2C38] rounded-xl px-3 py-2 text-xs text-[#F5F2EB] outline-none"
                      >
                        {(Object.keys(NAME_COLOR_PRESETS) as NameColorKey[]).map((k) => (
                          <option key={k} value={k}>
                            {NAME_COLOR_PRESETS[k].labelAr}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={adminToolsBusy}
                        onClick={() => handleAdminGrantProfilePerk('name_color', adminPerkColor)}
                        className="min-h-[38px] px-3.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-bold cursor-pointer"
                      >
                        منح
                      </button>
                      {activeProfileColor && (
                        <button
                          type="button"
                          disabled={adminToolsBusy}
                          onClick={() => handleAdminGrantProfilePerk('name_color', null)}
                          className="min-h-[38px] px-3 rounded-xl bg-red-500/15 text-red-300 text-xs font-bold cursor-pointer"
                        >
                          إزالة
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Chat Title */}
                  <div className="p-3.5 rounded-2xl bg-[#1A1A22] border border-[#282836] space-y-2.5">
                    <div className="text-xs font-bold text-[#F5F2EB] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      <span>لقب الدردشة المميز</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={adminPerkChatTitle}
                        onChange={(e) => setAdminPerkChatTitle(e.target.value as ChatTitleKey)}
                        className="flex-1 bg-[#121217] border border-[#2C2C38] rounded-xl px-3 py-2 text-xs text-[#F5F2EB] outline-none"
                      >
                        {(Object.keys(CHAT_TITLE_PRESETS) as ChatTitleKey[]).map((k) => (
                          <option key={k} value={k}>
                            {CHAT_TITLE_PRESETS[k].labelAr}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={adminToolsBusy}
                        onClick={() => handleAdminGrantProfilePerk('chat_title', adminPerkChatTitle)}
                        className="min-h-[38px] px-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#0B0B0E] text-xs font-bold cursor-pointer"
                      >
                        منح
                      </button>
                      {activeChatTitle && (
                        <button
                          type="button"
                          disabled={adminToolsBusy}
                          onClick={() => handleAdminGrantProfilePerk('chat_title', null)}
                          className="min-h-[38px] px-3 rounded-xl bg-red-500/15 text-red-300 text-xs font-bold cursor-pointer"
                        >
                          إزالة
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: Credits */}
              {adminManageTab === 'credits' && (
                <form onSubmit={handleAdminAdjustProfileCredits} className="space-y-3.5">
                  <div className="p-3.5 rounded-2xl bg-[#1A1A22] border border-[#282836] flex items-center justify-between">
                    <span className="text-xs text-[#9C968B]">رصيد الكريدت الحالي</span>
                    <span className="text-base font-extrabold font-mono-num text-[#D4A853]">
                      {profileCoins} كريدت
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { key: 'add', label: 'منح +' },
                        { key: 'deduct', label: 'خصم -' },
                        { key: 'set', label: 'تعيين =' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setAdminCreditMode(m.key)}
                        className={`min-h-[38px] rounded-xl text-xs font-bold cursor-pointer ${
                          adminCreditMode === m.key
                            ? 'bg-[#D4A853] text-[#0B0B0E]'
                            : 'bg-[#1A1A22] text-[#9C968B] hover:text-white border border-[#282836]'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {[50, 100, 250, 500].map((presetAmt) => (
                      <button
                        key={presetAmt}
                        type="button"
                        onClick={() => setAdminCreditAmount(String(presetAmt))}
                        className="px-2.5 py-1 rounded-lg bg-[#1A1A22] hover:bg-[#242430] border border-[#2C2C38] text-[11px] font-mono-num font-bold text-[#F5D67B] cursor-pointer"
                      >
                        {presetAmt}
                      </button>
                    ))}
                  </div>

                  <input
                    type="number"
                    min={0}
                    max={1000000}
                    value={adminCreditAmount}
                    onChange={(e) => setAdminCreditAmount(e.target.value)}
                    placeholder="الكمية"
                    className="w-full bg-[#121217] border border-[#2C2C38] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-xs font-mono-num text-[#F5F2EB] outline-none"
                  />
                  <input
                    type="text"
                    maxLength={120}
                    value={adminCreditReason}
                    onChange={(e) => setAdminCreditReason(e.target.value)}
                    placeholder="سبب التعديل (اختياري)"
                    className="w-full bg-[#121217] border border-[#2C2C38] focus:border-[#D4A853] rounded-xl px-3.5 py-2 text-xs text-[#F5F2EB] outline-none"
                  />
                  <button
                    type="submit"
                    disabled={adminToolsBusy}
                    className="w-full min-h-[42px] py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#0B0B0E] text-xs font-extrabold cursor-pointer disabled:opacity-60"
                  >
                    تنفيذ تعديل الكريدت
                  </button>
                </form>
              )}

              {/* Tab 4: Member Handle / Special ID */}
              {adminManageTab === 'id' && (
                <form onSubmit={handleAdminSaveMemberId} className="space-y-3.5">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-[#F5F2EB]">
                      المعرف / الآيدي (@)
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      maxLength={24}
                      value={adminHandleDraft}
                      onChange={(e) => setAdminHandleDraft(normalizeUsernameInput(e.target.value))}
                      placeholder="77 أو vip_1"
                      className="w-full bg-[#121217] border border-[#2C2C38] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-xs font-mono-num text-[#F5F2EB] outline-none"
                    />
                  </div>

                  <label className="flex items-center gap-2 p-3 rounded-xl bg-[#1A1A22] border border-[#282836] text-xs font-bold text-[#E5DEC9] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={adminSpecialFlag}
                      onChange={(e) => setAdminSpecialFlag(e.target.checked)}
                      className="accent-[#D4A853]"
                    />
                    <span>تمييز كآيدي VIP</span>
                  </label>

                  {adminSpecialFlag && (
                    <div className="space-y-2.5 p-3.5 rounded-xl bg-[#1A1A22] border border-[#282836]">
                      <input
                        type="text"
                        maxLength={32}
                        value={adminSpecialLabel}
                        onChange={(e) => setAdminSpecialLabel(e.target.value)}
                        placeholder="شارة التميز (مثل: آيدي مميز)"
                        className="w-full bg-[#121217] border border-[#2C2C38] rounded-xl px-3 py-2 text-xs text-[#F5F2EB] outline-none"
                      />
                      <div className="flex items-center gap-2">
                        <select
                          value={adminIdDurationMode}
                          onChange={(e) =>
                            setAdminIdDurationMode(e.target.value as 'permanent' | 'timed')
                          }
                          className="flex-1 bg-[#121217] border border-[#2C2C38] rounded-xl px-3 py-2 text-xs text-[#F5F2EB] outline-none"
                        >
                          <option value="permanent">دائم</option>
                          <option value="timed">مؤقت بالأيام</option>
                        </select>
                        {adminIdDurationMode === 'timed' && (
                          <input
                            type="number"
                            min={1}
                            max={365}
                            value={adminIdDays}
                            onChange={(e) => setAdminIdDays(e.target.value)}
                            className="w-20 bg-[#121217] border border-[#2C2C38] rounded-xl px-3 py-2 text-xs font-mono-num text-[#F5F2EB] outline-none"
                          />
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={adminToolsBusy}
                    className="w-full min-h-[42px] py-2.5 px-4 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    <Save className="w-4 h-4" />
                    <span>حفظ الآيدي</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Portfolio Work Confirmation Modal */}
      <ConfirmModal
        open={Boolean(confirmDeleteWork)}
        title="هل أنت متأكد من الحذف؟"
        message={
          confirmDeleteWork
            ? `سيتم حذف "${confirmDeleteWork.title}" من ملف الأعمال والمعرض نهائياً.`
            : ''
        }
        confirmLabel="نعم، حذف العمل"
        onCancel={() => setConfirmDeleteWork(null)}
        onConfirm={() => {
          if (confirmDeleteWork) {
            return handleDeleteWork(confirmDeleteWork);
          }
        }}
      />
    </div>
  );
};
                  
