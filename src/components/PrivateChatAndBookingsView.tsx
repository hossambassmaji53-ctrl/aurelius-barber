import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import {
  ArrowRight,
  Send,
  CalendarClock,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Star,
  MessageCircle,
  Edit3,
  ChevronLeft,
  X,
  BadgeCheck,
  Ban,
  BellRing,
  Loader2,
  StickyNote,
  UserPlus,
  Users,
  Check,
  Flag,
} from 'lucide-react';
import {
  db,
  createSafeId,
  makeConversationId,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import {
  BarberService,
  Booking,
  BookingStatus,
  Conversation,
  ConversationTyping,
  Friendship,
  PrivateMessage,
  UserProfile,
} from '../types';
import {
  Avatar,
  RoleBadgesList,
  VipSilverStar,
  getEffectiveNameColorClass,
  getPrimaryRole,
  getUserRoles,
  isBarberMember,
} from './Avatar';
import { awardAureliusCoins, getEffectiveLiveStatus } from '../utils/gamification';
import { setDmTypingStatus } from '../utils/typing';
import {
  formatFullDateTime,
  formatLastSeen,
  formatMessageTime,
  tsToMillis,
  useNowTick,
} from '../utils/time';
import { ConfirmModal } from './ConfirmModal';
import {
  checkActionRateLimit,
  MAX_TEXT_LENGTHS,
  sanitizePlainText,
} from '../utils/security';
import { ReportRequestPayload } from './ReportContentModal';
import { hasRole } from './Avatar';

interface PrivateChatAndBookingsViewProps {
  mode: 'messages' | 'appointments';
  currentUser: UserProfile;
  users: UserProfile[];
  conversations: Conversation[];
  bookings: Booking[];
  friendships?: Friendship[];
  activeConversationId: string | null;
  onSelectConversation: (id: string | null) => void;
  onStartPrivateChat?: (targetUser: UserProfile) => void;
  onAcceptFriendRequest?: (friendship: Friendship) => Promise<void> | void;
  onRejectOrRemoveFriend?: (friendshipId: string) => Promise<void> | void;
  bookingTriggerBarber: { barber: UserProfile; service?: BarberService } | null;
  onClearBookingTrigger: () => void;
  focusBookingId?: string | null;
  onClearFocusBooking?: () => void;
  onBack?: () => void;
  backLabel?: string;
  onOpenProfile: (uid: string) => void;
  blockedUserIds?: string[];
  onBlockUser?: (targetUid: string, targetName: string, targetPhoto?: string) => Promise<void> | void;
  onUnblockUser?: (targetUid: string) => Promise<void> | void;
  onOpenReport?: (payload: ReportRequestPayload) => void;
}

const STATUS_LABELS: Record<
  BookingStatus,
  { text: string; color: string; shortText: string }
> = {
  pending: { text: 'قيد المراجعة', shortText: 'قيد المراجعة', color: 'text-amber-300' },
  confirmed: { text: 'مؤكد', shortText: 'مؤكد', color: 'text-emerald-400' },
  rescheduled: {
    text: 'تم تعديل الموعد',
    shortText: 'معدّل',
    color: 'text-sky-400',
  },
  rejected: { text: 'مرفوض', shortText: 'مرفوض', color: 'text-red-400' },
  completed: { text: 'مكتمل', shortText: 'مكتمل', color: 'text-[#D4A853]' },
  cancelled: { text: 'ملغي', shortText: 'ملغي', color: 'text-[#A6A196]' },
};

const BARBER_CORE_STATUS_OPTIONS: Array<{
  status: BookingStatus;
  label: string;
  activeClass: string;
  idleClass: string;
}> = [
  {
    status: 'pending',
    label: 'قيد المراجعة',
    activeClass: 'bg-amber-500 text-[#0B0B0E] border-amber-400',
    idleClass:
      'bg-[#13131A] hover:bg-amber-500/15 text-[#D6D1C7] hover:text-amber-300 border-[#2B2B36]',
  },
  {
    status: 'confirmed',
    label: 'مؤكد',
    activeClass: 'bg-emerald-500 text-[#0B0B0E] border-emerald-400',
    idleClass:
      'bg-[#13131A] hover:bg-emerald-500/15 text-[#D6D1C7] hover:text-emerald-300 border-[#2B2B36]',
  },
  {
    status: 'completed',
    label: 'مكتمل',
    activeClass: 'bg-[#D4A853] text-[#0B0B0E] border-[#E0B96B]',
    idleClass:
      'bg-[#13131A] hover:bg-[#D4A853]/15 text-[#D6D1C7] hover:text-[#D4A853] border-[#2B2B36]',
  },
  {
    status: 'cancelled',
    label: 'ملغي',
    activeClass: 'bg-[#8B857B] text-[#0B0B0E] border-[#A6A196]',
    idleClass:
      'bg-[#13131A] hover:bg-red-500/15 text-[#D6D1C7] hover:text-red-300 border-[#2B2B36]',
  },
];

type AppointmentFilterTab = 'all' | 'pending' | 'confirmed' | 'completed' | 'cancelled';
type AppointmentRoleScope = 'all' | 'incoming' | 'outgoing';

export const PrivateChatAndBookingsView: React.FC<PrivateChatAndBookingsViewProps> = ({
  mode,
  currentUser,
  users,
  conversations,
  bookings,
  friendships = [],
  activeConversationId,
  onSelectConversation,
  onStartPrivateChat,
  onAcceptFriendRequest,
  onRejectOrRemoveFriend,
  bookingTriggerBarber,
  onClearBookingTrigger,
  focusBookingId,
  onClearFocusBooking,
  onBack,
  backLabel,
  onOpenProfile,
  blockedUserIds = [],
  onBlockUser,
  onUnblockUser,
  onOpenReport,
}) => {
  const blockedSet = useMemo(() => new Set(blockedUserIds), [blockedUserIds]);
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [dmTypingDocs, setDmTypingDocs] = useState<ConversationTyping[]>([]);
  const [dmTypingNowTick, setDmTypingNowTick] = useState(() => Date.now());
  const [msgText, setMsgText] = useState('');
  const [sending, setSending] = useState(false);
  const [dmError, setDmError] = useState<string | null>(null);
  const [friendBusyId, setFriendBusyId] = useState<string | null>(null);

  // Booking form state
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [targetBarber, setTargetBarber] = useState<UserProfile | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [customServiceName, setCustomServiceName] = useState('');
  const [bookingDate, setBookingDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [bookingTime, setBookingTime] = useState('16:00');
  const [bookingNotes, setBookingNotes] = useState('');
  const [bookingSubmitting, setBookingSubmitting] = useState(false);

  // Barber booking status controls & appointments filters
  const [appointmentStatusFilter, setAppointmentStatusFilter] =
    useState<AppointmentFilterTab>('all');
  const [appointmentRoleScope, setAppointmentRoleScope] =
    useState<AppointmentRoleScope>('all');
  const [updatingBookingId, setUpdatingBookingId] = useState<string | null>(null);
  const [statusFeedback, setStatusFeedback] = useState<{
    bookingId: string;
    text: string;
  } | null>(null);
  const [noteEditorBookingId, setNoteEditorBookingId] = useState<string | null>(null);
  const [statusDraftNote, setStatusDraftNote] = useState('');
  const [highlightedBookingId, setHighlightedBookingId] = useState<string | null>(null);

  // Reschedule modal
  const [rescheduleBooking, setRescheduleBooking] = useState<Booking | null>(null);
  const [resDate, setResDate] = useState('');
  const [resTime, setResTime] = useState('');
  const [resNotes, setResNotes] = useState('');

  // Review modal
  const [reviewBooking, setReviewBooking] = useState<Booking | null>(null);
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // Delete conversation, message & booking confirm
  const [confirmDeleteConv, setConfirmDeleteConv] = useState<Conversation | null>(null);
  const [confirmDeleteMsg, setConfirmDeleteMsg] = useState<PrivateMessage | null>(null);
  const [confirmDeleteBooking, setConfirmDeleteBooking] = useState<Booking | null>(null);
  const nowTick = useNowTick(20000);

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const initialThreadScrollDoneRef = useRef<string | null>(null);
  const bookingCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dmLastTypingSentAtRef = useRef(0);
  const dmTypingIdleTimerRef = useRef<number | null>(null);
  const activeDmTypingConvRef = useRef<Conversation | null>(null);

  useEffect(() => {
    if (!statusFeedback) return;
    const t = window.setTimeout(() => setStatusFeedback(null), 4500);
    return () => window.clearTimeout(t);
  }, [statusFeedback]);

  useEffect(() => {
    if (mode !== 'appointments' || !focusBookingId) return;
    setAppointmentStatusFilter('all');
    setAppointmentRoleScope('all');
    setHighlightedBookingId(focusBookingId);

    const scrollTimer = window.setTimeout(() => {
      const targetEl = bookingCardRefs.current[focusBookingId];
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      onClearFocusBooking?.();
    }, 120);

    const clearTimer = window.setTimeout(() => {
      setHighlightedBookingId((prev) => (prev === focusBookingId ? null : prev));
    }, 4500);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [mode, focusBookingId, onClearFocusBooking]);

  // Open booking modal automatically when triggered from Barber Profile / Map
  useEffect(() => {
    if (bookingTriggerBarber) {
      const { barber, service } = bookingTriggerBarber;
      setTargetBarber(barber);
      const services = barber.services || [];
      if (service) {
        setSelectedServiceId(service.id);
      } else if (services.length > 0) {
        setSelectedServiceId(services[0].id);
      } else {
        setSelectedServiceId('custom');
        setCustomServiceName('حلاقة وتصفيف شامل');
      }
      setShowBookingModal(true);
      onClearBookingTrigger();
    }
  }, [bookingTriggerBarber, onClearBookingTrigger]);

  const sortedConversations = useMemo(
    () =>
      [...conversations].sort(
        (a, b) =>
          tsToMillis(b.lastMessageAt || b.updatedAt || b.createdAt) -
          tsToMillis(a.lastMessageAt || a.updatedAt || a.createdAt)
      ),
    [conversations]
  );

  const activeConv = useMemo(
    () => sortedConversations.find((c) => c.id === activeConversationId) || null,
    [sortedConversations, activeConversationId]
  );

  const getOtherParticipant = (conv: Conversation): UserProfile | undefined => {
    const otherId =
      conv.participant1Id === currentUser.uid
        ? conv.participant2Id
        : conv.participant1Id;
    return users.find((u) => u.uid === otherId);
  };

  // Listen to messages + real-time typing inside active conversation
  useEffect(() => {
    if (activeDmTypingConvRef.current && activeDmTypingConvRef.current.id !== activeConv?.id) {
  const prevConv = activeDmTypingConvRef.current;
      activeDmTypingConvRef.current = null;
      dmLastTypingSentAtRef.current = 0;
      void setDmTypingStatus(prevConv, currentUser, false);
    }
    if (dmTypingIdleTimerRef.current) {
      window.clearTimeout(dmTypingIdleTimerRef.current);
      dmTypingIdleTimerRef.current = null;
    }

    if (!activeConv) {
      setMessages([]);
      setDmTypingDocs([]);
      initialThreadScrollDoneRef.current = null;
      return;
    }
    const participantField =
      activeConv.participant1Id === currentUser.uid
        ? 'participant1Id'
        : 'participant2Id';
    const q = query(
      collection(db, 'conversations', activeConv.id, 'messages'),
      where('conversationId', '==', activeConv.id),
      where(participantField, '==', currentUser.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data({ serverTimestamps: 'estimate' }) as PrivateMessage)
          .sort((a, b) => tsToMillis(a.createdAt) - tsToMillis(b.createdAt));
        setMessages(list);
      },
      (err) => {
        handleFirestoreError(
          err,
          OperationType.LIST,
          `conversations/${activeConv.id}/messages`
        );
      }
    );

    const typingQ = query(
      collection(db, 'conversations', activeConv.id, 'typing'),
      where('conversationId', '==', activeConv.id),
      where(participantField, '==', currentUser.uid)
    );
    const unsubTyping = onSnapshot(
      typingQ,
      (snap) => {
        setDmTypingDocs(
          snap.docs.map(
            (d) => d.data({ serverTimestamps: 'estimate' }) as ConversationTyping
          )
        );
      },
      () => {
        // Non-blocking typing indicator
      }
    );

    return () => {
      unsub();
      unsubTyping();
    };
  }, [activeConv?.id, currentUser.uid]);

  useEffect(() => {
    return () => {
      if (dmTypingIdleTimerRef.current) {
        window.clearTimeout(dmTypingIdleTimerRef.current);
      }
      if (activeDmTypingConvRef.current) {
        void setDmTypingStatus(activeDmTypingConvRef.current, currentUser, false);
      }
    };
  }, []);

  useEffect(() => {
    const hasActiveTyping = dmTypingDocs.some(
      (t) => t.userId !== currentUser.uid && t.isTyping
    );
    if (!hasActiveTyping) return;
    setDmTypingNowTick(Date.now());
    const id = window.setInterval(() => setDmTypingNowTick(Date.now()), 2000);
    return () => window.clearInterval(id);
  }, [dmTypingDocs, currentUser.uid]);

  const stopDmTypingNow = () => {
    if (dmTypingIdleTimerRef.current) {
      window.clearTimeout(dmTypingIdleTimerRef.current);
      dmTypingIdleTimerRef.current = null;
    }
    if (activeDmTypingConvRef.current) {
      const target = activeDmTypingConvRef.current;
      activeDmTypingConvRef.current = null;
      dmLastTypingSentAtRef.current = 0;
      void setDmTypingStatus(target, currentUser, false);
    }
  };

  const handleDmComposerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setMsgText(val);
    if (!activeConv) return;
    if (!val.trim()) {
      stopDmTypingNow();
      return;
    }
    activeDmTypingConvRef.current = activeConv;
    const now = Date.now();
    if (now - dmLastTypingSentAtRef.current >= 2200) {
      dmLastTypingSentAtRef.current = now;
      void setDmTypingStatus(activeConv, currentUser, true);
    }
    if (dmTypingIdleTimerRef.current) {
      window.clearTimeout(dmTypingIdleTimerRef.current);
    }
    dmTypingIdleTimerRef.current = window.setTimeout(() => {
      stopDmTypingNow();
    }, 3200);
  };

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el || !activeConv) return;
    if (initialThreadScrollDoneRef.current !== activeConv.id) {
      initialThreadScrollDoneRef.current = activeConv.id;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
      return;
    }
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  }, [messages.length, activeConv?.id]);

  const activeConvBookings = useMemo(() => {
    if (!activeConv) return [];
    return bookings.filter((b) => b.conversationId === activeConv.id);
  }, [bookings, activeConv]);

  const handleSendPrivateMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConv) return;
    const recipientId =
      activeConv.participant1Id === currentUser.uid
        ? activeConv.participant2Id
        : activeConv.participant1Id;
    if (blockedSet.has(recipientId)) {
      setDmError('هذا المستخدم محظور حالياً. يرجى فك الحظر للمراسلة.');
      return;
    }
    const cleanText = sanitizePlainText(msgText, MAX_TEXT_LENGTHS.chatMessage);
    if (!cleanText) {
      setDmError('الرسالة فارغة أو تحتوي على أحرف غير صالحة.');
      return;
    }
    const rate = checkActionRateLimit(`dm_msg_${currentUser.uid}`, {
      cooldownMs: 900,
      maxInWindow: 15,
      windowMs: 60000,
    });
    if (!rate.allowed) {
      setDmError(rate.message || 'يرجى التمهل قبل إرسال رسالة أخرى.');
      return;
    }

    setDmError(null);
    setSending(true);
    stopDmTypingNow();
    try {
      const msgId = createSafeId('pmsg');
      await setDoc(doc(db, 'conversations', activeConv.id, 'messages', msgId), {
        id: msgId,
        conversationId: activeConv.id,
        participant1Id: activeConv.participant1Id,
        participant2Id: activeConv.participant2Id,
        senderId: currentUser.uid,
        senderName: sanitizePlainText(currentUser.displayName, MAX_TEXT_LENGTHS.displayName) || currentUser.displayName,
        text: cleanText,
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'conversations', activeConv.id), {
        lastMessage: cleanText.slice(0, 300),
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const notifId = createSafeId('ntf');
      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        recipientId,
        senderId: currentUser.uid,
        senderName: currentUser.displayName,
        type: 'message',
        title: `أرسل إليك ${currentUser.displayName} رسالة خاصة`,
        body: cleanText.slice(0, 140),
        targetView: 'private_chat',
        targetId: activeConv.id,
        read: false,
        createdAt: serverTimestamp(),
      });

      setMsgText('');
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.CREATE,
        `conversations/${activeConv.id}/messages`
      );
    } finally {
      setSending(false);
    }
  };

  const openBookingForOther = (barber: UserProfile) => {
    setTargetBarber(barber);
    const srvs = barber.services || [];
    if (srvs.length > 0) {
      setSelectedServiceId(srvs[0].id);
    } else {
      setSelectedServiceId('custom');
      setCustomServiceName('حلاقة وتصفيف');
    }
    setShowBookingModal(true);
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetBarber) return;
    setBookingSubmitting(true);
    try {
      const convId = makeConversationId(currentUser.uid, targetBarber.uid);
      const existingConv = conversations.find((c) => c.id === convId);
      const p1 = [currentUser.uid, targetBarber.uid].sort()[0];
      const p2 = [currentUser.uid, targetBarber.uid].sort()[1];
      const u1 = p1 === currentUser.uid ? currentUser : targetBarber;
      const u2 = p2 === currentUser.uid ? currentUser : targetBarber;

      const selectedSrv = (targetBarber.services || []).find(
        (s) => s.id === selectedServiceId
      );
      const srvName = selectedSrv
        ? selectedSrv.name
        : sanitizePlainText(customServiceName, MAX_TEXT_LENGTHS.serviceName) || 'حلاقة عامة';
      const srvPrice = selectedSrv ? selectedSrv.price : 50;
      const srvDuration = selectedSrv ? selectedSrv.durationMinutes : 30;
      const srvId = selectedSrv ? selectedSrv.id : 'custom';

      const summaryText = `طلب حجز موعد: ${srvName} يوم ${bookingDate} الساعة ${bookingTime}`;

      if (!existingConv) {
        await setDoc(doc(db, 'conversations', convId), {
          id: convId,
          participant1Id: u1.uid,
          participant2Id: u2.uid,
          participant1Name: u1.displayName,
          participant2Name: u2.displayName,
          participant1Photo: u1.photoURL || '',
          participant2Photo: u2.photoURL || '',
          lastMessage: summaryText,
          lastMessageAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, 'conversations', convId), {
          lastMessage: summaryText,
          lastMessageAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      const bookingId = createSafeId('book');
      await setDoc(doc(db, 'bookings', bookingId), {
        id: bookingId,
        conversationId: convId,
        customerId: currentUser.uid,
        customerName: sanitizePlainText(currentUser.displayName, MAX_TEXT_LENGTHS.displayName) || currentUser.displayName,
        customerPhoto: currentUser.photoURL || '',
        barberId: targetBarber.uid,
        barberName: targetBarber.displayName,
        barberPhoto: targetBarber.photoURL || '',
        serviceId: srvId,
        serviceName: srvName.slice(0, 100),
        servicePrice: srvPrice,
        serviceDuration: srvDuration,
        date: bookingDate,
        time: bookingTime,
        notes: sanitizePlainText(bookingNotes, MAX_TEXT_LENGTHS.bookingNotes),
        status: 'pending',
        reviewed: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const msgId = createSafeId('pmsg');
      await setDoc(doc(db, 'conversations', convId, 'messages', msgId), {
        id: msgId,
        conversationId: convId,
        participant1Id: u1.uid,
        participant2Id: u2.uid,
        senderId: currentUser.uid,
        senderName: currentUser.displayName,
        text: summaryText,
        bookingId,
        createdAt: serverTimestamp(),
      });

      const notifId = createSafeId('ntf');
      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        recipientId: targetBarber.uid,
        senderId: currentUser.uid,
        senderName: currentUser.displayName,
        type: 'booking_new',
        title: `طلب حجز جديد من ${currentUser.displayName}`,
        body: `${srvName} · ${bookingDate} الساعة ${bookingTime}`,
        targetView: 'private_chat',
        targetId: convId,
        read: false,
        createdAt: serverTimestamp(),
          });

      setShowBookingModal(false);
      setBookingNotes('');
      onSelectConversation(convId);
      await awardAureliusCoins(currentUser.uid, currentUser.points, 25);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'bookings');
    } finally {
      setBookingSubmitting(false);
    }
  };

  const handleBookingStatusChange = async (
    booking: Booking,
    newStatus: BookingStatus,
    extra?: { date?: string; time?: string; notes?: string }
  ) => {
    const hasScheduleOrNoteChange =
      extra?.date !== undefined ||
      extra?.time !== undefined ||
      extra?.notes !== undefined;
    if (booking.status === newStatus && !hasScheduleOrNoteChange) return;

    setUpdatingBookingId(booking.id);
    try {
      const effectiveDate = extra?.date || booking.date;
      const effectiveTime = extra?.time || booking.time;
      const cleanExtraNotes =
        extra?.notes !== undefined
          ? sanitizePlainText(extra.notes, MAX_TEXT_LENGTHS.bookingNotes)
          : undefined;

      await updateDoc(doc(db, 'bookings', booking.id), {
        status: newStatus,
        ...(extra?.date ? { date: extra.date } : {}),
        ...(extra?.time ? { time: extra.time } : {}),
        ...(cleanExtraNotes !== undefined ? { notes: cleanExtraNotes } : {}),
        updatedAt: serverTimestamp(),
      });

      const isActorBarber = currentUser.uid === booking.barberId;
      const recipientId = isActorBarber ? booking.customerId : booking.barberId;
      const statusText = STATUS_LABELS[newStatus].text;
      const noteValue =
        cleanExtraNotes !== undefined ? cleanExtraNotes : booking.notes || '';
      const noteSuffix = noteValue ? ` · ملاحظة: ${noteValue}` : '';

      const notifTitle = isActorBarber
        ? `تحديث حالة حجزك إلى: ${statusText}`.slice(0, 120)
        : `تحديث الحجز من ${currentUser.displayName}: ${statusText}`.slice(0, 120);
      const notifBody = (
        isActorBarber
          ? `${booking.serviceName} مع ${booking.barberName} · ${effectiveDate} الساعة ${effectiveTime}${noteSuffix}`
          : `${booking.serviceName} · ${effectiveDate} الساعة ${effectiveTime}${noteSuffix}`
      ).slice(0, 300);

      const notifId = createSafeId('ntf');
      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        recipientId,
        senderId: currentUser.uid,
        senderName: currentUser.displayName,
        type: 'booking_update',
        title: notifTitle,
        body: notifBody,
        targetView: 'appointments',
        targetId: booking.id,
        read: false,
        createdAt: serverTimestamp(),
      });

      // Keep linked DM conversation synced if it still exists (without sending a duplicate message chime)
      if (conversations.some((c) => c.id === booking.conversationId)) {
        try {
          const convMsgId = createSafeId('pmsg');
          const convSummary = `تحديث حالة الحجز (${booking.serviceName} · ${effectiveDate} ${effectiveTime}): ${statusText}${
            cleanExtraNotes ? ` — ${cleanExtraNotes}` : ''
          }`.slice(0, 1000);
          const p1 = [booking.customerId, booking.barberId].sort()[0];
          const p2 = [booking.customerId, booking.barberId].sort()[1];

          await setDoc(
            doc(db, 'conversations', booking.conversationId, 'messages', convMsgId),
            {
              id: convMsgId,
              conversationId: booking.conversationId,
              participant1Id: p1,
              participant2Id: p2,
              senderId: currentUser.uid,
              senderName: currentUser.displayName,
              text: convSummary,
              bookingId: booking.id,
              createdAt: serverTimestamp(),
            }
          );

          await updateDoc(doc(db, 'conversations', booking.conversationId), {
            lastMessage: convSummary.slice(0, 300),
            lastMessageAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch {
          // Non-fatal if conversation was removed by either participant
        }
      }

      if (newStatus === 'completed' && booking.status !== 'completed' && isActorBarber) {
        await awardAureliusCoins(currentUser.uid, currentUser.points, 40, {
          completedBookingsCount: (currentUser.completedBookingsCount || 0) + 1,
        });
      }

      setNoteEditorBookingId((prev) => (prev === booking.id ? null : prev));
      setStatusDraftNote('');
      setStatusFeedback({
        bookingId: booking.id,
        text: isActorBarber
          ? `تم تغيير الحالة إلى «${statusText}» وإرسال إشعار فوري للزبون`
          : `تم تحديث حالة الحجز إلى «${statusText}»`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `bookings/${booking.id}`);
    } finally {
      setUpdatingBookingId(null);
    }
  };

  const handleSaveReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleBooking) return;
    await handleBookingStatusChange(rescheduleBooking, 'rescheduled', {
      date: resDate,
      time: resTime,
      notes: sanitizePlainText(resNotes, MAX_TEXT_LENGTHS.bookingNotes),
    });
    setRescheduleBooking(null);
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanReview = sanitizePlainText(reviewComment, MAX_TEXT_LENGTHS.reviewComment);
    if (!reviewBooking || !cleanReview) return;
    setReviewSubmitting(true);
    try {
      const reviewId = createSafeId('rev');
      await setDoc(doc(db, 'reviews', reviewId), {
        id: reviewId,
        bookingId: reviewBooking.id,
        barberId: reviewBooking.barberId,
        customerId: currentUser.uid,
        customerName: sanitizePlainText(currentUser.displayName, MAX_TEXT_LENGTHS.displayName) || currentUser.displayName,
        customerPhoto: currentUser.photoURL || '',
        rating,
        comment: cleanReview,
        visibility: 'public',
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'bookings', reviewBooking.id), {
        reviewed: true,
        updatedAt: serverTimestamp(),
      });

      setReviewBooking(null);
      setReviewComment('');
      setRating(5);
      await awardAureliusCoins(currentUser.uid, currentUser.points, 20);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'reviews');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleDeleteConversationForBoth = async (conv: Conversation) => {
    try {
      const participantField =
        conv.participant1Id === currentUser.uid
          ? 'participant1Id'
          : 'participant2Id';
      const msgsSnap = await getDocs(
        query(
          collection(db, 'conversations', conv.id, 'messages'),
          where('conversationId', '==', conv.id),
          where(participantField, '==', currentUser.uid)
        )
      );
      const batch = writeBatch(db);
      msgsSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      await deleteDoc(doc(db, 'conversations', conv.id));
      if (activeConversationId === conv.id) {
        onSelectConversation(null);
      }
      setConfirmDeleteConv(null);
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.DELETE,
        `conversations/${conv.id}`
      );
    }
  };

  const handleDeletePrivateMessage = async (m: PrivateMessage) => {
    try {
      await deleteDoc(doc(db, 'conversations', m.conversationId, 'messages', m.id));
      setConfirmDeleteMsg(null);
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.DELETE,
        `conversations/${m.conversationId}/messages/${m.id}`
      );
    }
  };

  const handleDeleteBooking = async (booking: Booking) => {
    try {
      await deleteDoc(doc(db, 'bookings', booking.id));
      setConfirmDeleteBooking(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `bookings/${booking.id}`);
    }
  };

  const renderBookingStatusIcon = (status: BookingStatus) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-3.5 h-3.5 shrink-0" />;
      case 'confirmed':
        return <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />;
      case 'rescheduled':
        return <CalendarClock className="w-3.5 h-3.5 shrink-0" />;
      case 'completed':
        return <BadgeCheck className="w-3.5 h-3.5 shrink-0" />;
      case 'cancelled':
        return <Ban className="w-3.5 h-3.5 shrink-0" />;
      case 'rejected':
        return <XCircle className="w-3.5 h-3.5 shrink-0" />;
    }
  };

  const renderBookingCard = (booking: Booking) => {
    const isBarber = currentUser.uid === booking.barberId;
    const isCustomer = currentUser.uid === booking.customerId;
    const st = STATUS_LABELS[booking.status];
    const isUpdating = updatingBookingId === booking.id;
    const isHighlighted = highlightedBookingId === booking.id;
    const isEditingNote = noteEditorBookingId === booking.id;
    const cardFeedback =
      statusFeedback?.bookingId === booking.id ? statusFeedback.text : null;

    return (
      <div
        key={booking.id}
        ref={(el) => {
          bookingCardRefs.current[booking.id] = el;
        }}
        className={`bg-[#181821] border rounded-2xl p-4 sm:p-5 space-y-3.5 transition-colors ${
          isHighlighted
            ? 'border-[#D4A853] ring-1 ring-[#D4A853]/40'
            : 'border-[#2D2D38]'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-[#9C968B]">
              <span>{isBarber ? 'حجز وارد من زبون' : 'موعدك الشخصي'}</span>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() =>
                  onOpenProfile(isBarber ? booking.customerId : booking.barberId)
                }
                className="text-[#F5F2EB] hover:text-[#D4A853] font-semibold transition-colors cursor-pointer"
              >
                {isBarber ? booking.customerName : booking.barberName}
              </button>
            </div>
            <div className="text-base font-bold text-[#F5F2EB] mt-1">
              {booking.serviceName}
            </div>
          </div>

          <div
            className={`inline-flex items-center gap-1.5 text-xs font-bold whitespace-nowrap shrink-0 ${st.color}`}
          >
            {renderBookingStatusIcon(booking.status)}
            <span>{st.text}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#D6D1C7] font-mono-num tabular-nums">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <CalendarClock className="w-3.5 h-3.5 text-[#D4A853] shrink-0" />
            <span>{booking.date}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <Clock className="w-3.5 h-3.5 text-[#D4A853] shrink-0" />
            <span>{booking.time}</span>
          </span>
          <span className="text-[#D4A853] font-bold whitespace-nowrap shrink-0">{booking.servicePrice} ر.س</span>
        </div>

        {booking.notes && (
          <p className="text-xs text-[#A6A196] bg-[#121217] border border-[#24242E] rounded-xl p-2.5 leading-relaxed">
            {booking.notes}
          </p>
        )}

        {/* Barber Direct Status Control Panel */}
        {isBarber && !booking.reviewed && (
          <div className="pt-2 border-t border-[#252530] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[#A6A196] inline-flex items-center gap-1.5">
                <BellRing className="w-3.5 h-3.5 text-[#D4A853]" />
                <span>تغيير حالة الحجز (يصل إشعار فوري للزبون)</span>
              </span>
              {isUpdating && (
                <span className="inline-flex items-center gap-1 text-[11px] text-[#D4A853]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>جاري التحديث...</span>
                </span>
                          )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {BARBER_CORE_STATUS_OPTIONS.map((opt) => {
                const isActive = booking.status === opt.status;
                return (
                  <button
                    key={opt.status}
                    type="button"
                    disabled={isUpdating || isActive}
                    onClick={() =>
                      handleBookingStatusChange(
                        booking,
                        opt.status,
                        isEditingNote && statusDraftNote.trim()
                          ? { notes: statusDraftNote }
                          : undefined
                      )
                    }
                    className={`min-h-[40px] px-2.5 py-2 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
                      isActive
                        ? `${opt.activeClass} cursor-default`
                        : `${opt.idleClass} cursor-pointer`
                    } disabled:opacity-90`}
                  >
                    {renderBookingStatusIcon(opt.status)}
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>

            {isEditingNote && (
              <div className="flex items-center gap-2 pt-0.5">
                <input
                  type="text"
                  maxLength={400}
                  value={statusDraftNote}
                  onChange={(e) => setStatusDraftNote(e.target.value)}
                  placeholder="أضف ملاحظة للزبون تُرسل مع تغيير الحالة..."
                  className="flex-1 min-h-[38px] bg-[#121217] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3 py-1.5 text-xs text-[#F5F2EB] placeholder:text-[#6B665E] outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    setNoteEditorBookingId(null);
                    setStatusDraftNote('');
                  }}
                  className="min-h-[38px] px-2.5 rounded-xl bg-[#23232D] text-[#A6A196] hover:text-white text-xs cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            )}
          </div>
        )}

        {isBarber && booking.reviewed && (
          <div className="text-[11px] text-[#8B857B] pt-1 border-t border-[#252530]">
            تم إغلاق هذا الموعد وتثبيت حالته بعد تقييم الزبون.
          </div>
        )}

        {cardFeedback && (
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{cardFeedback}</span>
          </div>
        )}

        {/* Secondary & Customer Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {isBarber && !booking.reviewed && (
            <>
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => {
                  setRescheduleBooking(booking);
                  setResDate(booking.date);
                  setResTime(booking.time);
                  setResNotes(booking.notes || '');
                }}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500 text-sky-300 hover:text-[#0B0B0E] text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors disabled:opacity-60"
              >
                <Edit3 className="w-3.5 h-3.5 shrink-0" />
                <span>تعديل الموعد</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (isEditingNote) {
                    setNoteEditorBookingId(null);
                    setStatusDraftNote('');
                  } else {
                    setNoteEditorBookingId(booking.id);
                    setStatusDraftNote(booking.notes || '');
                  }
                }}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  isEditingNote
                    ? 'bg-[#D4A853]/15 border-[#D4A853]/50 text-[#D4A853]'
                    : 'bg-[#13131A] hover:bg-[#1E1E28] border-[#2B2B36] text-[#C8C2B8]'
                }`}
              >
                <StickyNote className="w-3.5 h-3.5 shrink-0" />
                <span>{isEditingNote ? 'إخفاء الملاحظة' : 'ملاحظة للزبون'}</span>
              </button>

              {booking.status !== 'rejected' && (
                <button
                  type="button"
                  disabled={isUpdating}
                  onClick={() =>
                    handleBookingStatusChange(
                      booking,
                      'rejected',
                      isEditingNote && statusDraftNote.trim()
                        ? { notes: statusDraftNote }
                        : undefined
                    )
                  }
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500 text-red-300 hover:text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors disabled:opacity-60"
                >
                  <XCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>رفض</span>
                </button>
              )}
            </>
          )}

          {isCustomer && booking.status === 'rescheduled' && (
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => handleBookingStatusChange(booking, 'confirmed')}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-500 text-[#0B0B0E] text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              موافقة على الموعد الجديد
            </button>
          )}

          {isCustomer &&
            (booking.status === 'pending' ||
              booking.status === 'confirmed' ||
              booking.status === 'rescheduled') && (
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => handleBookingStatusChange(booking, 'cancelled')}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#23232D] hover:bg-red-500/20 text-xs font-semibold text-[#A6A196] hover:text-red-300 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              >
                إلغاء الموعد
              </button>
            )}

          {isCustomer && booking.status === 'completed' && !booking.reviewed && (
            <button
              type="button"
              onClick={() => setReviewBooking(booking)}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Star className="w-3.5 h-3.5 fill-[#0B0B0E] shrink-0" />
              <span>تقييم الحلاق</span>
            </button>
          )}

          {booking.reviewed && (
            <span className="text-xs text-emerald-400 font-semibold whitespace-nowrap">تم إرسال التقييم</span>
          )}

          <button
            type="button"
            onClick={() => setConfirmDeleteBooking(booking)}
            title="حذف الحجز"
            className="mr-auto min-h-[38px] px-2.5 py-1.5 rounded-xl bg-[#23232D] hover:bg-red-500/20 text-xs font-semibold text-[#A6A196] hover:text-red-300 inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            <span>حذف</span>
          </button>
        </div>
      </div>
    );
  };

  const incomingBarberBookingsCount = useMemo(
    () => bookings.filter((b) => b.barberId === currentUser.uid).length,
    [bookings, currentUser.uid]
  );

  const outgoingCustomerBookingsCount = useMemo(
    () => bookings.filter((b) => b.customerId === currentUser.uid).length,
    [bookings, currentUser.uid]
  );

  const scopedBookings = useMemo(() => {
    if (appointmentRoleScope === 'incoming') {
      return bookings.filter((b) => b.barberId === currentUser.uid);
    }
    if (appointmentRoleScope === 'outgoing') {
      return bookings.filter((b) => b.customerId === currentUser.uid);
    }
    return bookings;
  }, [bookings, appointmentRoleScope, currentUser.uid]);

  const statusCounts = useMemo(
    () => ({
      all: scopedBookings.length,
      pending: scopedBookings.filter(
        (b) => b.status === 'pending' || b.status === 'rescheduled'
      ).length,
      confirmed: scopedBookings.filter((b) => b.status === 'confirmed').length,
      completed: scopedBookings.filter((b) => b.status === 'completed').length,
      cancelled: scopedBookings.filter(
        (b) => b.status === 'cancelled' || b.status === 'rejected'
      ).length,
    }),
    [scopedBookings]
  );

  const filteredBookings = useMemo(() => {
    switch (appointmentStatusFilter) {
      case 'pending':
        return scopedBookings.filter(
          (b) => b.status === 'pending' || b.status === 'rescheduled'
        );
      case 'confirmed':
        return scopedBookings.filter((b) => b.status === 'confirmed');
      case 'completed':
        return scopedBookings.filter((b) => b.status === 'completed');
      case 'cancelled':
        return scopedBookings.filter(
          (b) => b.status === 'cancelled' || b.status === 'rejected'
        );
      default:
        return scopedBookings;
    }
  }, [scopedBookings, appointmentStatusFilter]);

  const isFullHeightDMThread = mode === 'messages' && Boolean(activeConv);

  return (
    <div
      className={
        isFullHeightDMThread
          ? 'flex-1 min-h-0 w-full max-w-[100vw] h-full flex flex-col overflow-hidden'
          : 'space-y-6 min-w-0 max-w-full overflow-x-hidden'
      }
    >
      {mode === 'appointments' ? (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-[#F5F2EB]">سجل الحجوزات والمواعيد</h1>
              <p className="text-sm text-[#9C968B] mt-1">
                أدر حالات الحجوزات بسهولة (قيد المراجعة، مؤكد، مكتمل، ملغي) مع إشعار فوري للزبون عند كل تحديث.
              </p>
            </div>

            {incomingBarberBookingsCount > 0 && outgoingCustomerBookingsCount > 0 && (
              <div className="inline-flex items-center gap-1 p-1 bg-[#141419] border border-[#27272F] rounded-xl self-start">
                {(
                  [
                    { key: 'all', label: 'الكل' },
                    { key: 'incoming', label: `حجوزات زبائني (${incomingBarberBookingsCount})` },
                    { key: 'outgoing', label: `مواعيدي (${outgoingCustomerBookingsCount})` },
                  ] as Array<{ key: AppointmentRoleScope; label: string }>
                ).map((scope) => (
                  <button
                    key={scope.key}
                    type="button"
                    onClick={() => setAppointmentRoleScope(scope.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                      appointmentRoleScope === scope.key
                        ? 'bg-[#D4A853] text-[#0B0B0E]'
                        : 'text-[#A6A196] hover:text-[#F5F2EB]'
                    }`}
                  >
                    {scope.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {bookings.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-[#141419] border border-[#27272F] rounded-2xl">
              {(
                [
                  { key: 'all', label: 'الكل', count: statusCounts.all },
                  { key: 'pending', label: 'قيد المراجعة', count: statusCounts.pending },
                  { key: 'confirmed', label: 'مؤكد', count: statusCounts.confirmed },
                  { key: 'completed', label: 'مكتمل', count: statusCounts.completed },
                  { key: 'cancelled', label: 'ملغي ومرفوض', count: statusCounts.cancelled },
                ] as Array<{ key: AppointmentFilterTab; label: string; count: number }>
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setAppointmentStatusFilter(tab.key)}
                  className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                    appointmentStatusFilter === tab.key
                      ? 'bg-[#D4A853] text-[#0B0B0E]'
                      : 'text-[#A6A196] hover:text-[#F5F2EB] hover:bg-[#1C1C24]'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`font-mono-num text-[11px] ${
                      appointmentStatusFilter === tab.key
                        ? 'text-[#0B0B0E]/80'
                        : 'text-[#8B857B]'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          )}

          {bookings.length === 0 ? (
            <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-10 text-center space-y-2">
          <CalendarClock className="w-8 h-8 text-[#D4A853] mx-auto opacity-70" />
              <div className="text-base font-bold text-[#F5F2EB]">لا توجد مواعيد محجوزة حتى الآن</div>
              <p className="text-xs text-[#9C968B]">
                افتح ملف أي حلاق موثق أو حدد موقعاً من الخريطة لحجز موعدك الأول.
              </p>
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-10 text-center space-y-2">
              <CalendarClock className="w-8 h-8 text-[#D4A853] mx-auto opacity-60" />
              <div className="text-sm font-bold text-[#F5F2EB]">
                لا توجد حجوزات مطابقة لهذا التصنيف
              </div>
              <button
                type="button"
                onClick={() => setAppointmentStatusFilter('all')}
                className="text-xs font-bold text-[#D4A853] hover:underline cursor-pointer"
              >
                عرض جميع الحجوزات
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredBookings.map(renderBookingCard)}
            </div>
          )}
        </div>
      ) : !activeConv ? (
        /* Sequential Vertical Direct Messages Contact List */
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  aria-label={backLabel ? `العودة إلى ${backLabel}` : 'رجوع'}
                  title={backLabel ? `العودة إلى ${backLabel}` : 'رجوع'}
                  className="min-h-[40px] max-w-[210px] sm:max-w-none px-3 py-1.5 rounded-xl bg-[#16161E] hover:bg-[#22222D] border border-[#2B2B36] text-xs font-bold text-[#F5F2EB] inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                >
                  <ArrowRight className="w-4 h-4 text-[#D4A853] shrink-0" />
                  <span className="shrink-0">رجوع</span>
                  {backLabel && (
                    <span className="text-[#9C968B] font-medium truncate">
                      · إلى {backLabel}
                    </span>
                  )}
                </button>
              )}
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-[#F5F2EB] truncate">
                  المحادثات الخاصة
                </h1>
                <p className="text-xs sm:text-sm text-[#9C968B] mt-0.5 truncate">
                  اختر أي محادثة لفتح نافذة الرسائل بملء الشاشة
                </p>
              </div>
            </div>
            <span className="text-xs font-mono-num text-[#9C968B] shrink-0">
              {sortedConversations.length}{' '}
              {sortedConversations.length === 1 ? 'محادثة' : 'محادثات'}
            </span>
          </div>

          {/* Incoming Friend Requests + Accepted Friends Strip */}
          {(() => {
            const incomingReqs = friendships.filter(
              (f) => f.status === 'pending' && f.recipientId === currentUser.uid
            );
            const acceptedFriends = friendships.filter((f) => f.status === 'accepted');
            if (incomingReqs.length === 0 && acceptedFriends.length === 0) return null;

            return (
              <div className="space-y-3">
                {incomingReqs.length > 0 && (
                  <div className="bg-[#141419] border border-[#D4A853]/35 rounded-2xl p-4 space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-bold text-[#D4A853]">
                      <span className="inline-flex items-center gap-1.5">
                        <UserPlus className="w-4 h-4" />
                        <span>طلبات الصداقة الواردة</span>
                      </span>
                      <span className="font-mono-num">({incomingReqs.length})</span>
                    </div>
                    <div className="divide-y divide-[#22222A]">
                      {incomingReqs.map((req) => {
                        const sender = users.find((u) => u.uid === req.requesterId);
                        const senderRoles = sender ? getUserRoles(sender) : undefined;
                        const isBusy = friendBusyId === req.id;
                        return (
                          <div
                            key={req.id}
                            className="py-2.5 flex items-center justify-between gap-2.5"
                          >
                            <button
                              type="button"
                              onClick={() => onOpenProfile(req.requesterId)}
                              className="flex items-center gap-2.5 min-w-0 text-right cursor-pointer"
                            >
                              <Avatar
                                src={sender?.photoURL || req.requesterPhoto}
                                name={sender?.displayName || req.requesterName}
                                size="sm"
                                role={senderRoles?.[0]}
                                roles={senderRoles}
                                avatarFrame={sender?.avatarFrame}
                                avatarFrameExpiresAt={sender?.avatarFrameExpiresAt}
                              />
                              <div className="min-w-0">
                                <div
                                  className={`text-xs font-bold truncate ${getEffectiveNameColorClass(
                                    sender,
                                    senderRoles?.[0]
                                  )}`}
                                >
                                  {sender?.displayName || req.requesterName}
                                </div>
                                <div className="text-[11px] text-[#9C968B]">
                                  أرسل لك طلب صداقة
                                </div>
                              </div>
                            </button>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={async () => {
                                  if (!onAcceptFriendRequest) return;
                                  setFriendBusyId(req.id);
                                  try {
                                    await onAcceptFriendRequest(req);
                                  } finally {
                                    setFriendBusyId(null);
                                  }
                                }}
                                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#0B0B0E] text-xs font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>قبول</span>
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={async () => {
                                  if (!onRejectOrRemoveFriend) return;
                                  setFriendBusyId(req.id);
                                  try {
                                    await onRejectOrRemoveFriend(req.id);
                                  } finally {
                                    setFriendBusyId(null);
                                  }
                                }}
                                className="px-3 py-1.5 rounded-lg bg-[#1E1E28] hover:bg-red-500/20 border border-[#2E2E3A] text-xs font-semibold text-[#C8C2B8] hover:text-red-300 cursor-pointer disabled:opacity-60"
                              >
                                رفض
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {acceptedFriends.length > 0 && (
                  <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-3.5 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#C8C2B8]">
                      <Users className="w-3.5 h-3.5 text-[#D4A853]" />
                      <span>الأصدقاء ({acceptedFriends.length})</span>
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
                      {acceptedFriends.map((f) => {
                        const friendUid =
                          f.user1Id === currentUser.uid ? f.user2Id : f.user1Id;
                        const friendUser = users.find((u) => u.uid === friendUid);
                        const fallbackName =
                          f.requesterId === friendUid ? f.requesterName : f.recipientName;
                        const fallbackPhoto =
                          f.requesterId === friendUid ? f.requesterPhoto : f.recipientPhoto;
                        const friendLive = getEffectiveLiveStatus(friendUser, false, nowTick);
                        const friendRoles = friendUser ? getUserRoles(friendUser) : undefined;
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => {
                              if (friendUser && onStartPrivateChat) {
                                onStartPrivateChat(friendUser);
                              } else {
                                onSelectConversation(makeConversationId(currentUser.uid, friendUid));
                              }
                            }}
                            className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[#1A1A22] hover:bg-[#23232E] border border-[#2B2B36] shrink-0 cursor-pointer transition-colors"
                          >
                            <div className="relative">
                              <Avatar
                                src={friendUser?.photoURL || fallbackPhoto}
                                name={friendUser?.displayName || fallbackName}
                                size="xs"
                                role={friendRoles?.[0]}
                                roles={friendRoles}
                                avatarFrame={friendUser?.avatarFrame}
                                avatarFrameExpiresAt={friendUser?.avatarFrameExpiresAt}
                              />
                              <span
                                className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-[#1A1A22] ${friendLive.dotClass}`}
                              />
                            </div>
                            <span
                              className={`text-xs font-semibold whitespace-nowrap ${getEffectiveNameColorClass(
                                friendUser,
                                friendRoles?.[0]
                              )}`}
                            >
                              {friendUser?.displayName || fallbackName}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="bg-[#141419] border border-[#27272F] rounded-2xl overflow-hidden divide-y divide-[#22222A]">
            {sortedConversations.length === 0 ? (
              <div className="p-10 text-center space-y-2.5 text-[#8B857B]">
                <MessageCircle className="w-9 h-9 mx-auto opacity-45 text-[#D4A853]" />
                <div className="text-sm font-bold text-[#F5F2EB]">
                  لا توجد محادثات خاصة بعد
                </div>
                <p className="text-xs max-w-sm mx-auto leading-relaxed">
                  اضغط على اسم أي عضو في الدردشة العامة أو أي حلاق من المعرض لبدء محادثة خاصة فورية.
                </p>
              </div>
            ) : (
              sortedConversations.map((conv) => {
                const other = getOtherParticipant(conv);
                const otherName =
                  other?.displayName ||
                  (conv.participant1Id === currentUser.uid
                    ? conv.participant2Name
                    : conv.participant1Name);
                const otherPhoto =
                  other?.photoURL ||
                  (conv.participant1Id === currentUser.uid
                    ? conv.participant2Photo
                    : conv.participant1Photo);

                const otherRoles = other ? getUserRoles(other) : undefined;
                const otherPrimary = otherRoles?.[0];
                const otherLive = getEffectiveLiveStatus(other, false, nowTick);
                const lastTime = formatMessageTime(
                  conv.lastMessageAt || conv.updatedAt || conv.createdAt,
                  nowTick
                );

                return (
                  <div
                    key={conv.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectConversation(conv.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectConversation(conv.id);
                      }
                    }}
                    className="w-full min-h-[72px] px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-[#191921] active:bg-[#1E1E28] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div className="relative shrink-0">
                        <Avatar
                          src={otherPhoto}
                          name={otherName}
                          size="md"
                          role={otherPrimary}
                          roles={otherRoles}
                          avatarFrame={other?.avatarFrame}
                          avatarFrameExpiresAt={other?.avatarFrameExpiresAt}
                        />
                        <span
                          aria-hidden="true"
                          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-[#141419] ${otherLive.dotClass}`}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={`text-sm font-bold truncate ${getEffectiveNameColorClass(
                                other,
                                otherPrimary
                              )}`}
                            >
                              {otherName}
                            </span>
                            {otherRoles && <VipSilverStar roles={otherRoles} size="xs" />}
                            {otherRoles && (
                              <RoleBadgesList roles={otherRoles} size="xs" compact />
                            )}
                          </div>
                          {lastTime && (
                            <span
                              title={formatFullDateTime(
                                conv.lastMessageAt || conv.updatedAt || conv.createdAt
                              )}
                              className="text-[11px] font-mono-num tabular-nums whitespace-nowrap text-[#8B857B] shrink-0"
                            >
                              {lastTime}
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-[#A6A196] truncate mt-1">
                          {conv.lastMessage || 'اضغط لبدء المحادثة الخاصة'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteConv(conv);
                        }}
                        title="حذف المحادثة للطرفين"
                        aria-label={`حذف محادثة ${otherName}`}
                        className="min-w-[36px] min-h-[36px] rounded-xl text-[#7B766E] hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <ChevronLeft className="w-4 h-4 text-[#6B665E]" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* Full-Height Edge-to-Edge Active Direct Chat View */
        (() => {
          const other = getOtherParticipant(activeConv);
          const otherId =
            activeConv.participant1Id === currentUser.uid
              ? activeConv.participant2Id
              : activeConv.participant1Id;
          const otherName =
            other?.displayName ||
            (activeConv.participant1Id === currentUser.uid
              ? activeConv.participant2Name
              : activeConv.participant1Name);
          const otherPhoto =
            other?.photoURL ||
            (activeConv.participant1Id === currentUser.uid
              ? activeConv.participant2Photo
              : activeConv.participant1Photo);
          const otherRoles = other ? getUserRoles(other) : undefined;
          const otherPrimary = otherRoles?.[0];
          const otherIsBarber = other ? isBarberMember(other) : false;

          return (
            <div className="relative flex-1 min-h-0 w-full h-full flex flex-col bg-[#0D0D12] overflow-hidden">
              {/* Top Thread Header with Prominent Back Button */}
              <div className="shrink-0 px-3 sm:px-6 py-2.5 border-b border-[#22222B] bg-[#121218] flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={onBack || (() => onSelectConversation(null))}
                    aria-label={
                      backLabel
                        ? `العودة إلى ${backLabel}`
                        : 'العودة لقائمة المحادثات'
                    }
                    title={
                      backLabel
                        ? `العودة إلى ${backLabel}`
                        : 'العودة لقائمة المحادثات'
                    }
                    className="min-h-[40px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#1A1A22] hover:bg-[#24242F] border border-[#2C2C35] text-xs font-bold text-[#F5F2EB] inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                  >
                    <ArrowRight className="w-4 h-4 text-[#D4A853] shrink-0" />
                    <span className="hidden sm:inline shrink-0">رجوع</span>
                    {backLabel && (
                      <span className="hidden md:inline text-[#9C968B] font-medium truncate max-w-[150px]">
                        · إلى {backLabel}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenProfile(otherId)}
                    className="flex items-center gap-2.5 min-w-0 hover:opacity-90 cursor-pointer text-right"
                  >
                    <div className="relative shrink-0">
                      <Avatar
                        src={otherPhoto}
                        name={otherName}
                        size="sm"
                        role={otherPrimary}
                        roles={otherRoles}
                        avatarFrame={other?.avatarFrame}
                        avatarFrameExpiresAt={other?.avatarFrameExpiresAt}
                      />
                      {(() => {
                        const liveDot = getEffectiveLiveStatus(other, false, nowTick).dotClass;
                        return (
                          <span
                            aria-hidden="true"
                            className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-[#121218] ${liveDot}`}
                          />
                        );
                      })()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`text-sm font-bold truncate ${getEffectiveNameColorClass(
                            other,
                            otherPrimary
                          )}`}
                        >
                          {otherName}
                        </span>
                        {otherRoles && <VipSilverStar roles={otherRoles} size="xs" />}
                        {otherRoles && (
                          <span className="hidden sm:inline-flex">
                            <RoleBadgesList roles={otherRoles} size="xs" compact />
                          </span>
                        )}
                      </div>
                      {(() => {
                        const isOtherTypingNow = dmTypingDocs.some(
                          (t) =>
                            t.userId !== currentUser.uid &&
                            t.isTyping &&
                            dmTypingNowTick - tsToMillis(t.updatedAt) < 5500
                        );
                        if (isOtherTypingNow) {
                          return (
                            <div className="text-[11px] font-bold text-[#D4A853] truncate animate-pulse">
                              يكتب الآن...
                            </div>
                          );
                        }
                        const otherLive = getEffectiveLiveStatus(other, false, nowTick);
                        const statusDisplay =
                          otherLive.status === 'offline'
                            ? other?.lastActiveAt
                              ? `أوفلاين · آخر ظهور ${formatLastSeen(other.lastActiveAt, nowTick)}`
                              : 'أوفلاين'
                            : otherLive.label;
                        return (
                          <div
                            title={
                              other?.lastActiveAt
                                ? formatFullDateTime(other.lastActiveAt)
                                : otherLive.label
                            }
                            className={`text-[11px] font-semibold truncate ${otherLive.textClass}`}
                          >
                            {otherIsBarber ? `حلاق موثق · ${statusDisplay}` : statusDisplay}
                          </div>
                        );
                      })()}
                    </div>
                  </button>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  {otherIsBarber && other && !blockedSet.has(otherId) && (
                    <button
                      type="button"
                      onClick={() => openBookingForOther(other)}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-bold whitespace-nowrap cursor-pointer"
                    >
                      <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                      <span>حجز موعد</span>
                    </button>
                  )}
                  {onOpenReport && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenReport({
                          targetType: 'message',
                          targetId: activeConv.id,
                          targetOwnerId: otherId,
                          targetOwnerName: otherName,
                          targetPreview: activeConv.lastMessage || 'محادثة خاصة',
                        })
                      }
                      title="إبلاغ عن المحادثة"
                      aria-label="إبلاغ عن المحادثة"
                      className="min-h-[40px] p-2.5 rounded-xl bg-[#1A1A22] hover:bg-amber-500/20 border border-[#2C2C35] text-amber-300 cursor-pointer transition-colors"
                    >
                      <Flag className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {(!other || !hasRole(other, 'admin')) &&
                    (blockedSet.has(otherId) ? onUnblockUser : onBlockUser) && (
                      <button
                        type="button"
                        onClick={() => {
                          if (blockedSet.has(otherId)) {
                            void onUnblockUser?.(otherId);
                          } else {
                            void onBlockUser?.(otherId, otherName, otherPhoto);
                          }
                        }}
                        title={blockedSet.has(otherId) ? 'إلغاء الحظر' : 'حظر المستخدم'}
                        aria-label={blockedSet.has(otherId) ? 'إلغاء الحظر' : 'حظر المستخدم'}
                        className={`min-h-[40px] p-2.5 rounded-xl border cursor-pointer transition-colors ${
                          blockedSet.has(otherId)
                            ? 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/35 text-emerald-300'
                            : 'bg-[#1A1A22] hover:bg-red-500/20 border-[#2C2C35] text-red-300'
                        }`}
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    )}
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteConv(activeConv)}
                    title="حذف المحادثة للطرفين"
                    aria-label="حذف المحادثة للطرفين"
                    className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1A1A22] hover:bg-red-500/20 border border-[#2C2C35] text-xs font-semibold text-[#A6A196] hover:text-red-300 whitespace-nowrap cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden sm:inline">حذف للطرفين</span>
                  </button>
                </div>
              </div>

              {/* Scrollable Messages & Inline Bookings Stream */}
              <div
                ref={messagesContainerRef}
                className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-6 lg:px-10 py-4 space-y-2.5 scroll-smooth"
              >
                {activeConvBookings.length > 0 && (
                  <div className="space-y-2 pb-3 border-b border-[#22222A]">
                    <div className="text-xs font-bold text-[#D4A853]">
                      المواعيد المرتبطة بهذه المحادثة
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {activeConvBookings.map(renderBookingCard)}
                    </div>
                  </div>
                )}

                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-[#8B857B] space-y-2">
                    <MessageCircle className="w-8 h-8 opacity-40 text-[#D4A853]" />
                    <p className="text-sm">ابدأ المحادثة الخاصة مع {otherName} الآن</p>
                  </div>
                ) : (
                  messages.map((m) => {
                    const isOwn = m.senderId === currentUser.uid;
                    const msgTime = formatMessageTime(m.createdAt, nowTick);
                    return (
                      <div
                        key={m.id}
                        className={`flex items-end gap-1.5 group ${
                          isOwn ? 'justify-start' : 'justify-end'
                        }`}
                      >
                        <div
                          className={`max-w-[82%] sm:max-w-[70%] lg:max-w-[60%] space-y-1 ${
                            isOwn ? 'items-start' : 'items-end'
                          }`}
                        >
                          <div
                            className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words ${
                              isOwn
                                ? 'bg-[#282115] border border-[#D4A853]/35 text-[#F5F2EB]'
                                : 'bg-[#1A1A22] border border-[#282832] text-[#E6E1D8]'
                            }`}
                          >
                            {m.text}
                          </div>
                          {msgTime && (
                            <div
                              title={formatFullDateTime(m.createdAt)}
                              className={`text-[10px] font-mono-num tabular-nums whitespace-nowrap text-[#8B857B] px-1 ${
                                isOwn ? 'text-right' : 'text-left'
                              }`}
                            >
                              {msgTime}
                            </div>
                          )}
                        </div>
                        {isOwn && (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteMsg(m)}
                            title="حذف الرسالة"
                            className="p-1.5 mb-4 rounded-lg text-[#8B857B] hover:text-red-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Pinned Bottom Composer + Live Typing Indicator */}
              {(() => {
                const isOtherBlocked = blockedSet.has(otherId);
                const isOtherTypingNow = dmTypingDocs.some(
                  (t) =>
                    t.userId !== currentUser.uid &&
                    t.isTyping &&
                    dmTypingNowTick - tsToMillis(t.updatedAt) < 5500
                );
                if (isOtherBlocked) {
                  return (
                    <div className="shrink-0 p-3.5 sm:px-6 border-t border-[#22222B] bg-[#141419] flex flex-wrap items-center justify-between gap-2.5 text-xs">
                      <span className="text-red-300 font-semibold">
                        لقد قمت بحظر {otherName}. لا يمكن تبادل الرسائل أثناء الحظر.
                      </span>
                      {onUnblockUser && (
                        <button
                          type="button"
                          onClick={() => void onUnblockUser(otherId)}
                          className="px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 text-xs font-bold cursor-pointer"
                        >
                          إلغاء الحظر
                        </button>
                      )}
                    </div>
                  );
                }
                return (
                  <div className="shrink-0 border-t border-[#22222B] bg-[#121218]">
                    {dmError && (
                      <div className="px-4 sm:px-6 py-2 border-b border-red-500/30 bg-red-500/10 flex items-center justify-between gap-2 text-xs text-red-300">
                        <span>{dmError}</span>
                        <button
                          type="button"
                          onClick={() => setDmError(null)}
                          className="p-0.5 text-red-300 hover:text-white cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                        </button>
                      </div>
                    )}
                    {isOtherTypingNow && (
                      <div className="px-4 sm:px-6 py-1.5 border-b border-[#1E1E26] bg-[#14141B] flex items-center gap-2 text-[11px] text-[#D4A853]">
                        <span className="inline-flex items-center gap-1" aria-hidden="true">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#D4A853] animate-bounce" />
                          <span className="w-1.5 h-1.5 rounded-full bg-[#D4A853] animate-bounce [animation-delay:150ms]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-[#D4A853] animate-bounce [animation-delay:300ms]" />
                        </span>
                        <span className="font-semibold truncate">
                          {otherName} يكتب الآن...
                        </span>
                      </div>
                    )}
                    <form
                      onSubmit={handleSendPrivateMessage}
                      className="px-3 sm:px-6 py-2.5 flex items-center gap-2.5"
                    >
                      <input
                        type="text"
                        maxLength={1000}
                        value={msgText}
                        onChange={handleDmComposerChange}
                        onBlur={stopDmTypingNow}
                        placeholder="اكتب رسالة خاصة..."
                        className="flex-1 min-h-[42px] bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-4 py-2 text-sm text-[#F5F2EB] placeholder:text-[#6B665E] outline-none"
                      />
                      <button
                        type="submit"
                        disabled={sending || !msgText.trim()}
                        className="min-h-[42px] px-4 py-2 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] font-bold text-xs inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                      >
                        <span>إرسال</span>
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  </div>
                );
              })()}
            </div>
          );
        })()
      )}

      {/* Book Appointment Modal */}
      {showBookingModal && targetBarber && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#141419] border border-[#2C2C35] rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Avatar
                  src={targetBarber.photoURL}
                  name={targetBarber.displayName}
                  size="sm"
                  role={getPrimaryRole(targetBarber)}
                  roles={getUserRoles(targetBarber)}
                  avatarFrame={targetBarber.avatarFrame}
                  avatarFrameExpiresAt={targetBarber.avatarFrameExpiresAt}
                />
                <div>
                  <h3 className="text-base font-bold text-[#F5F2EB]">
                    حجز موعد مع {targetBarber.displayName}
                  </h3>
                  <p className="text-xs text-[#9C968B]">
                    {targetBarber.salonName || 'حلاق موثق'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBookingModal(false)}
                className="p-1 text-[#9C968B] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBooking} className="space-y-4">
              {(targetBarber.services || []).length > 0 ? (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#C8C2B8]">اختر الخدمة</label>
                  <select
                    value={selectedServiceId}
                    onChange={(e) => setSelectedServiceId(e.target.value)}
                    className="w-full bg-[#1A1A22] border border-[#2C2C35] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F2EB] outline-none"
                  >
                    {(targetBarber.services || []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {s.price} ر.س ({s.durationMinutes} دقيقة)
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#C8C2B8]">اسم الخدمة المطلوبة</label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={customServiceName}
                    onChange={(e) => setCustomServiceName(e.target.value)}
                    className="w-full bg-[#1A1A22] border border-[#2C2C35] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F2EB] outline-none"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#C8C2B8]">التاريخ</label>
                  <input
                    type="date"
                    required
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    className="w-full bg-[#1A1A22] border border-[#2C2C35] rounded-xl px-3 py-2.5 text-xs font-mono-num text-[#F5F2EB] outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#C8C2B8]">الوقت</label>
                  <input
                    type="time"
                    required
                    value={bookingTime}
                    onChange={(e) => setBookingTime(e.target.value)}
                    className="w-full bg-[#1A1A22] border border-[#2C2C35] rounded-xl px-3 py-2.5 text-xs font-mono-num text-[#F5F2EB] outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#C8C2B8]">ملاحظات إضافية</label>
                <textarea
                  rows={2}
                  maxLength={400}
                  value={bookingNotes}
                  onChange={(e) => setBookingNotes(e.target.value)}
                  placeholder="أي تفاصيل حول القصة أو الموعد..."
                  className="w-full bg-[#1A1A22] border border-[#2C2C35] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F2EB] outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowBookingModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#1E1E26] text-xs font-semibold text-[#F5F2EB] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={bookingSubmitting}
                  className="px-5 py-2 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-bold cursor-pointer disabled:opacity-60"
                >
                  {bookingSubmitting ? 'جاري الإرسال...' : 'إرسال طلب الحجز'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleBooking && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#141419] border border-[#2C2C35] rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-[#F5F2EB]">تعديل موعد الحجز</h3>
            <form onSubmit={handleSaveReschedule} className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <input
                  type="date"
                  required
                  value={resDate}
                  onChange={(e) => setResDate(e.target.value)}
                  className="bg-[#1A1A22] border border-[#2C2C35] rounded-xl px-3 py-2 text-xs font-mono-num text-[#F5F2EB]"
                />
                <input
                  type="time"
                  required
                  value={resTime}
                  onChange={(e) => setResTime(e.target.value)}
                  className="bg-[#1A1A22] border border-[#2C2C35] rounded-xl px-3 py-2 text-xs font-mono-num text-[#F5F2EB]"
                />
              </div>
              <textarea
                rows={2}
                maxLength={400}
                value={resNotes}
                onChange={(e) => setResNotes(e.target.value)}
                placeholder="سبب التعديل أو ملاحظة للزبون..."
                className="w-full bg-[#1A1A22] border border-[#2C2C35] rounded-xl px-3 py-2 text-xs text-[#F5F2EB] resize-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRescheduleBooking(null)}
                  className="px-4 py-2 rounded-xl bg-[#1E1E26] text-xs text-[#F5F2EB] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#D4A853] text-[#0B0B0E] text-xs font-bold cursor-pointer"
                >
                  حفظ التعديل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Star Review Modal */}
      {reviewBooking && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#141419] border border-[#2C2C35] rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-[#F5F2EB]">
              تقييم الحلاق: {reviewBooking.barberName}
            </h3>
            <form onSubmit={handleSubmitReview} className="space-y-4">
              <div className="flex items-center justify-center gap-2 py-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    className="p-1 cursor-pointer"
                  >
                    <Star
                      className={`w-7 h-7 transition-colors ${
                        n <= rating
                          ? 'fill-[#D4A853] text-[#D4A853]'
                          : 'text-[#3A3A46]'
                      }`}
                    />
                  </button>
                ))}
              </div>
              <textarea
                required
                rows={3}
                maxLength={500}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="اكتب رأيك بتجربة الحلاقة..."
                className="w-full bg-[#1A1A22] border border-[#2C2C35] rounded-xl p-3 text-xs text-[#F5F2EB] outline-none resize-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReviewBooking(null)}
                  className="px-4 py-2 rounded-xl bg-[#1E1E26] text-xs text-[#F5F2EB] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={reviewSubmitting}
                  className="px-4 py-2 rounded-xl bg-[#D4A853] text-[#0B0B0E] text-xs font-bold cursor-pointer"
                >
                  {reviewSubmitting ? 'جاري النشر...' : 'إرسال التقييم'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Conversation Modal */}
      <ConfirmModal
        open={Boolean(confirmDeleteConv)}
        title="هل أنت متأكد من حذف المحادثة؟"
        message="سيتم حذف جميع الرسائل في هذه المحادثة نهائياً لدى الطرفين ولا يمكن التراجع عن ذلك."
        confirmLabel="نعم، حذف للطرفين"
        onCancel={() => setConfirmDeleteConv(null)}
        onConfirm={() => {
          if (confirmDeleteConv) {
            return handleDeleteConversationForBoth(confirmDeleteConv);
          }
        }}
      />

      {/* Confirm Delete Private Message Modal */}
      <ConfirmModal
        open={Boolean(confirmDeleteMsg)}
        title="هل أنت متأكد من حذف الرسالة؟"
        message="سيتم حذف هذه الرسالة نهائياً من المحادثة."
        confirmLabel="نعم، حذف الرسالة"
        onCancel={() => setConfirmDeleteMsg(null)}
        onConfirm={() => {
          if (confirmDeleteMsg) {
            return handleDeletePrivateMessage(confirmDeleteMsg);
          }
        }}
      />

      {/* Confirm Delete Booking Modal */}
      <ConfirmModal
        open={Boolean(confirmDeleteBooking)}
        title="هل أنت متأكد من حذف هذا الحجز؟"
        message={
          confirmDeleteBooking
            ? `سيتم حذف حجز "${confirmDeleteBooking.serviceName}" بتاريخ ${confirmDeleteBooking.date} الساعة ${confirmDeleteBooking.time} نهائياً ولا يمكن التراجع عن ذلك.`
            : ''
        }
        confirmLabel="نعم، حذف الحجز"
        onCancel={() => setConfirmDeleteBooking(null)}
        onConfirm={() => {
          if (confirmDeleteBooking) {
            return handleDeleteBooking(confirmDeleteBooking);
          }
        }}
      />
    </div>
  );
};
         
