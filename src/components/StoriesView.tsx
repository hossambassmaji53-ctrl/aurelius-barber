import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Columns2,
  Film,
  Image as ImageIcon,
  MessageCircle,
  Plus,
  Send,
  SmilePlus,
  Sparkles,
  Trash2,
  Upload,
  User as UserIcon,
  X,
  Flag,
  Ban,
} from 'lucide-react';
import {
  db,
  createSafeId,
  handleFirestoreError,
  makeConversationId,
  OperationType,
} from '../firebase';
import {
  BarberStory,
  Conversation,
  StoryMediaType,
  StoryReaction,
  UserProfile,
} from '../types';
import { compressImageToDataUrl } from '../utils/image';
import {
  awardAureliusCoins,
  getEffectiveLiveStatus,
  tsToMillis,
} from '../utils/gamification';
import { formatFullDateTime, formatMessageTime } from '../utils/time';
import {
  Avatar,
  RoleBadgesList,
  VipSilverStar,
  canPublishStories,
  getPrimaryRole,
  getRoleNameColor,
  getUserRoles,
  isBarberMember,
  isStaffMember,
} from './Avatar';
import { BeforeAfterCompare } from './BeforeAfterCompare';
import { ConfirmModal } from './ConfirmModal';
import { CountryFlag } from './CountryPickerModal';
import { getCountryByCode, matchesActiveCountry } from '../utils/countries';
import {
  checkActionRateLimit,
  isSafeMediaUrl,
  MAX_TEXT_LENGTHS,
  sanitizePlainText,
} from '../utils/security';
import { ReportRequestPayload } from './ReportContentModal';

const LEGACY_REACTION_MAP: Record<string, string> = {
  heart: '❤️',
  fire: '🔥',
  clap: '👏',
  scissors: '✂️',
  gem: '💎',
};

const QUICK_DEFAULT_EMOJIS = ['❤️', '🔥', '✂️'];

const CURATED_PICKER_EMOJIS = [
  '❤️', '🔥', '👏', '✂️', '💎', '👑',
  '💈', '😍', '🤩', '😎', '🙌', '💯',
  '👌', '✨', '💪', '⚡', '🏆', '🤝',
  '😂', '😮', '🫶', '🙏', '🌟', '💥',
];

function resolveReactionEmoji(raw: string): string {
  return LEGACY_REACTION_MAP[raw] || raw;
}

function toEmojiKey(emoji: string): string {
  const cleaned = emoji.trim().slice(0, 16);
  const parts = Array.from(cleaned).map((ch) =>
    (ch.codePointAt(0) || 0).toString(16).toLowerCase()
  );
  const joined = parts.join('_').replace(/[^a-z0-9_]/g, '');
  return (joined || 'emoji').slice(0, 64);
}

interface StoriesViewProps {
  currentUser: UserProfile;
  isSuperAdmin: boolean;
  users: UserProfile[];
  stories: BarberStory[];
  storyReactions: StoryReaction[];
  conversations: Conversation[];
  activeCountryCode: string;
  focusStoryId?: string | null;
  onClearFocusStory?: () => void;
  onOpenProfile: (uid: string) => void;
  onBookBarber: (barber: UserProfile) => void;
  onOpenConversation: (conversationId: string) => void;
  blockedUserIds?: string[];
  onBlockUser?: (targetUid: string, targetName: string, targetPhoto?: string) => Promise<void> | void;
  onOpenReport?: (payload: ReportRequestPayload) => void;
}

interface StoryAuthorGroup {
  barberId: string;
  barberName: string;
  barberPhoto?: string;
  salonName?: string;
  barberProfile?: UserProfile;
  stories: BarberStory[];
  latestAt: number;
}

export const StoriesView: React.FC<StoriesViewProps> = ({
  currentUser,
  isSuperAdmin,
  users,
  stories,
  storyReactions,
  conversations,
  activeCountryCode,
  focusStoryId,
  onClearFocusStory,
  onOpenProfile,
  onBookBarber,
  onOpenConversation,
  blockedUserIds = [],
  onBlockUser,
  onOpenReport,
}) => {
  const blockedSet = useMemo(() => new Set(blockedUserIds), [blockedUserIds]);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [createOpen, setCreateOpen] = useState(false);
  const [mediaType, setMediaType] = useState<StoryMediaType>('image');
  const [mediaUrl, setMediaUrl] = useState('');
  const [beforeMediaUrl, setBeforeMediaUrl] = useState('');
  const [videoUrlInput, setVideoUrlInput] = useState('');
  const [caption, setCaption] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Story Viewer state
  const [activeGroupIdx, setActiveGroupIdx] = useState<number | null>(null);
  const [activeStoryIdx, setActiveStoryIdx] = useState(0);
  const [confirmDeleteStory, setConfirmDeleteStory] = useState<BarberStory | null>(null);

  // Quick Reply & Reaction Feedback
  const [replyText, setReplyText] = useState('');
  const [isReplyFocused, setIsReplyFocused] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [replyFeedback, setReplyFeedback] = useState<{
    storyId: string;
    convId: string;
    authorName: string;
  } | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [showReactorsList, setShowReactorsList] = useState(false);
  const [emojiPickerTarget, setEmojiPickerTarget] = useState<string | null>(null);
  const [customEmojiInput, setCustomEmojiInput] = useState('');
  const replyInputRef = useRef<HTMLInputElement | null>(null);

  const canPostStory = canPublishStories(currentUser, isSuperAdmin);
  const isStaff = isStaffMember(currentUser, isSuperAdmin);

  const activeCountryMeta = useMemo(
    () => getCountryByCode(activeCountryCode),
    [activeCountryCode]
  );

  // Refresh every 60 seconds so expired 24h stories hide automatically
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const activeStories = useMemo(() => {
    return stories
      .filter((s) => {
        if (blockedSet.has(s.barberId)) return false;
        if (tsToMillis(s.expiresAt) <= nowTick) return false;
        const author = users.find((u) => u.uid === s.barberId);
        if (author?.isBanned) return false;
        const authorCountry =
          author?.uid === currentUser.uid ? activeCountryCode : author?.countryCode;
        return matchesActiveCountry(s.countryCode, authorCountry, activeCountryCode);
      })
      .sort((a, b) => tsToMillis(b.createdAt) - tsToMillis(a.createdAt));
  }, [stories, blockedSet, users, nowTick, activeCountryCode, currentUser.uid]);

  const storyGroups = useMemo<StoryAuthorGroup[]>(() => {
    const byAuthor = new Map<string, StoryAuthorGroup>();
    activeStories.forEach((story) => {
      const profile = users.find((u) => u.uid === story.barberId);
      const existing = byAuthor.get(story.barberId);
      const createdMs = tsToMillis(story.createdAt);
      if (existing) {
        existing.stories.push(story);
        if (createdMs > existing.latestAt) existing.latestAt = createdMs;
      } else {
        byAuthor.set(story.barberId, {
          barberId: story.barberId,
          barberName: profile?.displayName || story.barberName,
          barberPhoto: profile?.photoURL || story.barberPhoto,
          salonName: profile?.salonName || story.salonName,
          barberProfile: profile,
          stories: [story],
          latestAt: createdMs,
        });
      }
    });

    const list = Array.from(byAuthor.values()).map((g) => ({
      ...g,
      stories: [...g.stories].sort(
        (a, b) => tsToMillis(a.createdAt) - tsToMillis(b.createdAt)
      ),
    }));

    return list.sort((a, b) => b.latestAt - a.latestAt);
  }, [activeStories, users]);

  const reactionsByStoryId = useMemo(() => {
    const map = new Map<string, StoryReaction[]>();
    storyReactions.forEach((r) => {
      const arr = map.get(r.storyId) || [];
      arr.push(r);
      map.set(r.storyId, arr);
    });
    return map;
  }, [storyReactions]);

  // Open focused story when navigating from notification
  useEffect(() => {
    if (!focusStoryId || storyGroups.length === 0) return;
    for (let gIdx = 0; gIdx < storyGroups.length; gIdx++) {
      const sIdx = storyGroups[gIdx].stories.findIndex((s) => s.id === focusStoryId);
      if (sIdx !== -1) {
        setActiveGroupIdx(gIdx);
        setActiveStoryIdx(sIdx);
        onClearFocusStory?.();
        return;
      }
    }
    onClearFocusStory?.();
  }, [focusStoryId, storyGroups, onClearFocusStory]);

  const currentGroup =
    activeGroupIdx !== null ? storyGroups[activeGroupIdx] || null : null;
  const currentStory = currentGroup ? currentGroup.stories[activeStoryIdx] || null : null;

  // Reset inline reply state when switching stories
  useEffect(() => {
    setReplyText('');
    setReplyError(null);
    setShowReactorsList(false);
    setEmojiPickerTarget(null);
    setCustomEmojiInput('');
    if (currentStory && replyFeedback && replyFeedback.storyId !== currentStory.id) {
      setReplyFeedback(null);
    }
  }, [currentStory?.id]);

  // Auto-advance timer (pauses while typing, picking emoji, viewing reactions, or confirming delete)
  useEffect(() => {
    if (
      !currentGroup ||
      !currentStory ||
      currentStory.mediaType === 'video' ||
      isReplyFocused ||
      replyText.trim().length > 0 ||
      showReactorsList ||
      Boolean(emojiPickerTarget) ||
      Boolean(confirmDeleteStory)
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (activeStoryIdx < currentGroup.stories.length - 1) {
        setActiveStoryIdx((i) => i + 1);
      } else if (activeGroupIdx !== null && activeGroupIdx < storyGroups.length - 1) {
        setActiveGroupIdx((g) => (g !== null ? g + 1 : null));
        setActiveStoryIdx(0);
      } else {
        setActiveGroupIdx(null);
      }
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [
    currentGroup,
    currentStory,
    activeStoryIdx,
    activeGroupIdx,
    storyGroups.length,
    isReplyFocused,
    replyText,
    showReactorsList,
    emojiPickerTarget,
    confirmDeleteStory,
  ]);
    const openStoryInViewer = (storyId: string, focusReplyInput = false) => {
    for (let gIdx = 0; gIdx < storyGroups.length; gIdx++) {
      const sIdx = storyGroups[gIdx].stories.findIndex((s) => s.id === storyId);
      if (sIdx !== -1) {
        setActiveGroupIdx(gIdx);
        setActiveStoryIdx(sIdx);
        if (focusReplyInput) {
          window.setTimeout(() => replyInputRef.current?.focus(), 120);
        }
        return;
      }
    }
  };

  const openGroup = (idx: number) => {
    setActiveGroupIdx(idx);
    setActiveStoryIdx(0);
  };

  const goNextStory = () => {
    if (!currentGroup || activeGroupIdx === null) return;
    if (activeStoryIdx < currentGroup.stories.length - 1) {
      setActiveStoryIdx((i) => i + 1);
    } else if (activeGroupIdx < storyGroups.length - 1) {
      setActiveGroupIdx(activeGroupIdx + 1);
      setActiveStoryIdx(0);
    } else {
      setActiveGroupIdx(null);
    }
  };

  const goPrevStory = () => {
    if (!currentGroup || activeGroupIdx === null) return;
    if (activeStoryIdx > 0) {
      setActiveStoryIdx((i) => i - 1);
    } else if (activeGroupIdx > 0) {
      const prevGroup = storyGroups[activeGroupIdx - 1];
      setActiveGroupIdx(activeGroupIdx - 1);
      setActiveStoryIdx(Math.max(0, prevGroup.stories.length - 1));
    }
  };

  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'main' | 'before'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormError(null);
    try {
      let dataUrl = await compressImageToDataUrl(file, 640, 880, 0.72);
      if (dataUrl.length > 330000) {
        dataUrl = await compressImageToDataUrl(file, 500, 700, 0.62);
      }
      if (target === 'before') setBeforeMediaUrl(dataUrl);
      else setMediaUrl(dataUrl);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'تعذر تحميل الصورة.');
    }
  };

  const handleVideoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormError(null);
    if (!file.type.startsWith('video/')) {
      setFormError('يرجى اختيار ملف فيديو صالح (MP4 أو WebM).');
      return;
    }
    if (file.size > 540 * 1024) {
      setFormError(
        'حجم الفيديو يجب أن يكون أقل من 540 كيلوبايت (مقطع قصير)، أو يمكنك لصق رابط فيديو مباشر.'
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setMediaUrl(reader.result);
        setVideoUrlInput('');
      }
    };
    reader.onerror = () => setFormError('تعذر قراءة ملف الفيديو.');
    reader.readAsDataURL(file);
  };

  const handlePublishStory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPostStory) return;
    setFormError(null);

    const finalMediaUrl =
      mediaType === 'video' ? videoUrlInput.trim() || mediaUrl.trim() : mediaUrl.trim();
    const cleanCaption = sanitizePlainText(caption, MAX_TEXT_LENGTHS.storyCaption);

    if (!finalMediaUrl || !isSafeMediaUrl(finalMediaUrl, mediaType === 'video')) {
      setFormError(
        mediaType === 'video'
          ? 'يرجى رفع مقطع فيديو قصير أو إدخال رابط فيديو آمن.'
          : mediaType === 'before_after'
            ? 'يرجى اختيار صورة نتيجة صالحة «بعد».'
            : 'يرجى اختيار صورة صالحة للستوري.'
      );
      return;
    }

    if (
      mediaType === 'video' &&
      videoUrlInput.trim() &&
      !/^https:\/\//i.test(videoUrlInput.trim())
    ) {
      setFormError('يجب أن يبدأ رابط الفيديو الآمن بـ https://');
      return;
    }

    if (
      mediaType === 'before_after' &&
      (!beforeMediaUrl.trim() || !isSafeMediaUrl(beforeMediaUrl.trim()))
    ) {
      setFormError('يرجى اختيار صورة «قبل» صالحة لإتمام ستوري قبل وبعد.');
      return;
    }

    const rate = checkActionRateLimit(`story_create_${currentUser.uid}`, {
      cooldownMs: 8000,
      maxInWindow: 6,
      windowMs: 300000,
    });
    if (!rate.allowed) {
      setFormError(rate.message || 'يرجى التمهل قليلاً قبل نشر ستوري جديد.');
      return;
    }

    setSubmitting(true);
    try {
      const storyId = createSafeId('str');
      const expiresAt = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);
      await setDoc(doc(db, 'stories', storyId), {
        id: storyId,
        barberId: currentUser.uid,
        barberName: sanitizePlainText(currentUser.displayName, MAX_TEXT_LENGTHS.displayName) || currentUser.displayName,
        barberPhoto: currentUser.photoURL || '',
        salonName: sanitizePlainText(currentUser.salonName || '', MAX_TEXT_LENGTHS.salonName),
        mediaType,
        mediaUrl: finalMediaUrl,
        beforeMediaUrl: mediaType === 'before_after' ? beforeMediaUrl.trim() : '',
        caption: cleanCaption,
        countryCode: activeCountryCode,
        visibility: 'public',
        expiresAt,
        createdAt: serverTimestamp(),
      });

      await awardAureliusCoins(currentUser.uid, currentUser.points, 10);
      setCreateOpen(false);
      setMediaUrl('');
      setBeforeMediaUrl('');
      setVideoUrlInput('');
      setCaption('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'stories');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteStory = async (story: BarberStory) => {
    try {
      await deleteDoc(doc(db, 'stories', story.id));
      setConfirmDeleteStory(null);
      setActiveGroupIdx(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `stories/${story.id}`);
    }
  };

  const handleToggleReaction = async (story: BarberStory, rawEmoji: string) => {
    const emoji = resolveReactionEmoji(rawEmoji.trim()).slice(0, 16);
    if (!emoji) return;
    const emojiKey = toEmojiKey(emoji);
    const listForStory = reactionsByStoryId.get(story.id) || [];
    const existingSame = listForStory.find(
      (r) =>
        r.userId === currentUser.uid &&
        resolveReactionEmoji(r.reaction) === emoji
    );

    if (existingSame) {
      try {
        await deleteDoc(doc(db, 'storyReactions', existingSame.id));
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.DELETE,
          `storyReactions/${existingSame.id}`
        );
      }
      return;
    }

    const reactionId = `${story.id}_${currentUser.uid}_${emojiKey}`;
    try {
      await setDoc(doc(db, 'storyReactions', reactionId), {
        id: reactionId,
        storyId: story.id,
        storyAuthorId: story.barberId,
        userId: currentUser.uid,
        userName: currentUser.displayName,
        userPhoto: currentUser.photoURL || '',
        reaction: emoji,
        emojiKey,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (story.barberId !== currentUser.uid) {
        const notifId = createSafeId('ntf');
        await setDoc(doc(db, 'notifications', notifId), {
          id: notifId,
          recipientId: story.barberId,
          senderId: currentUser.uid,
          senderName: currentUser.displayName,
          type: 'story_reaction',
          title: `تفاعل ${currentUser.displayName} على الستوري`,
          body: `تفاعل بـ ${emoji}${
            story.caption ? ` على: "${story.caption.slice(0, 60)}"` : ''
          }`.slice(0, 280),
          targetView: 'stories',
          targetId: story.id,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.CREATE,
        `storyReactions/${reactionId}`
      );
    }
  };

  const handleDeleteSingleReaction = async (reaction: StoryReaction) => {
    try {
      await deleteDoc(doc(db, 'storyReactions', reaction.id));
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.DELETE,
        `storyReactions/${reaction.id}`
      );
    }
  };

  const handleDeleteEmojiGroupFromStory = async (
    story: BarberStory,
    emoji: string
  ) => {
    const canModerate = isStaff || story.barberId === currentUser.uid;
    if (!canModerate) return;
    const listForStory = reactionsByStoryId.get(story.id) || [];
    const matching = listForStory.filter(
      (r) => resolveReactionEmoji(r.reaction) === emoji
    );
    try {
      await Promise.all(
        matching.map((r) => deleteDoc(doc(db, 'storyReactions', r.id)))
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `storyReactions/${story.id}`);
    }
  };

  const handleSendDirectReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentStory) return;
    if (currentStory.barberId === currentUser.uid) return;
    const clean = sanitizePlainText(replyText, MAX_TEXT_LENGTHS.chatMessage);
    if (!clean) return;
    const rate = checkActionRateLimit(`story_reply_${currentUser.uid}`, {
      cooldownMs: 1500,
      maxInWindow: 10,
      windowMs: 60000,
    });
    if (!rate.allowed) {
      setReplyError(rate.message || 'يرجى الانتظار قليلاً قبل إرسال رد آخر.');
      return;
    }

    setSendingReply(true);
    setReplyError(null);

    try {
      const targetAuthorId = currentStory.barberId;
      const targetAuthor = users.find((u) => u.uid === targetAuthorId);
      const targetAuthorName =
        targetAuthor?.displayName || currentStory.barberName || 'عضو';
      const targetAuthorPhoto = targetAuthor?.photoURL || currentStory.barberPhoto || '';

      const convId = makeConversationId(currentUser.uid, targetAuthorId);
      const existingConv = conversations.find((c) => c.id === convId);

      const storyPrefix = currentStory.caption?.trim()
        ? `رد على الستوري («${sanitizePlainText(currentStory.caption, 45)}»): `
        : 'رد على الستوري: ';
      const fullMessageText = `${storyPrefix}${clean}`.slice(0, MAX_TEXT_LENGTHS.chatMessage);
      const preview = fullMessageText.slice(0, 280);

      if (!existingConv) {
        const sortedIds = [currentUser.uid, targetAuthorId].sort();
        const isCurrentP1 = sortedIds[0] === currentUser.uid;
        await setDoc(doc(db, 'conversations', convId), {
          id: convId,
          participant1Id: sortedIds[0],
          participant2Id: sortedIds[1],
          participant1Name: isCurrentP1 ? currentUser.displayName : targetAuthorName,
          participant2Name: isCurrentP1 ? targetAuthorName : currentUser.displayName,
          participant1Photo: isCurrentP1
            ? currentUser.photoURL || ''
            : targetAuthorPhoto,
          participant2Photo: isCurrentP1
            ? targetAuthorPhoto
            : currentUser.photoURL || '',
          lastMessage: preview,
          lastMessageAt: serverTimestamp(),
        createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, 'conversations', convId), {
          lastMessage: preview,
          lastMessageAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      const sortedIds = [currentUser.uid, targetAuthorId].sort();
      const msgId = createSafeId('pmsg');
      await setDoc(doc(db, 'conversations', convId, 'messages', msgId), {
        id: msgId,
        conversationId: convId,
        participant1Id: sortedIds[0],
        participant2Id: sortedIds[1],
        senderId: currentUser.uid,
        senderName: sanitizePlainText(currentUser.displayName, MAX_TEXT_LENGTHS.displayName) || currentUser.displayName,
        text: fullMessageText,
        createdAt: serverTimestamp(),
      });

      const notifId = createSafeId('ntf');
      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        recipientId: targetAuthorId,
        senderId: currentUser.uid,
        senderName: currentUser.displayName,
        type: 'story_reply',
        title: `رد مباشر على الستوري من ${currentUser.displayName}`,
        body: clean.slice(0, 220),
        targetView: 'private_chat',
        targetId: convId,
        read: false,
        createdAt: serverTimestamp(),
      });

      setReplyText('');
      setIsReplyFocused(false);
      setReplyFeedback({
        storyId: currentStory.id,
        convId,
        authorName: targetAuthorName,
      });
    } catch (err) {
      setReplyError('تعذر إرسال الرد حالياً، يرجى المحاولة مرة أخرى.');
      console.error('Failed to send direct story reply:', err);
    } finally {
      setSendingReply(false);
    }
  };

  const formatRemainingTime = (expiresAt: any) => {
    const diffMs = Math.max(0, tsToMillis(expiresAt) - nowTick);
    const hours = Math.floor(diffMs / (60 * 60 * 1000));
    if (hours >= 1) return `متبقي ${hours} س`;
    const mins = Math.max(1, Math.floor(diffMs / (60 * 1000)));
    return `متبقي ${mins} د`;
  };

  const getStoryReactionSummary = (storyId: string) => {
    const list = reactionsByStoryId.get(storyId) || [];
    const groupedMap = new Map<
      string,
      { emoji: string; count: number; reactedByMe: boolean }
    >();

    list.forEach((r) => {
      const emoji = resolveReactionEmoji(r.reaction);
      const prev = groupedMap.get(emoji) || {
        emoji,
        count: 0,
        reactedByMe: false,
      };
      prev.count += 1;
      if (r.userId === currentUser.uid) {
        prev.reactedByMe = true;
      }
      groupedMap.set(emoji, prev);
    });

    const groups = Array.from(groupedMap.values()).sort(
      (a, b) => b.count - a.count
    );
    return { list, groups, total: list.length };
  };

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <section className="bg-[#141419] border border-[#27272F] rounded-3xl p-5 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-[#D4A853]">
            <Film className="w-4 h-4" />
            <span>ستوريات أوريليوس · 24 ساعة</span>
            <span aria-hidden="true">·</span>
            <CountryFlag code={activeCountryCode} showName size="xs" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F5F2EB] tracking-tight">
            ستوريات أوريليوس (Aurelius Stories)
          </h1>
          <p className="text-xs sm:text-sm text-[#A6A196] leading-relaxed max-w-2xl">
            لقطات حية وأعمال قبل وبعد تختفي تلقائياً خلال 24 ساعة. تفاعل بسرعة أو أرسل رداً
            مباشراً لصاحب الستوري في المحادثة الخاصة.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="px-3.5 py-2 rounded-xl bg-[#1A1A22] border border-[#282834] text-xs font-mono-num text-[#D6D1C7]">
            <span className="font-bold text-[#D4A853]">{activeStories.length}</span> ستوري نشط
            <span className="mx-1.5 text-[#525260]">·</span>
            <span className="font-bold text-[#F5F2EB]">{storyGroups.length}</span> ناشر
          </div>

          {canPostStory && (
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setCreateOpen(true);
              }}
              className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] font-bold text-xs sm:text-sm transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>+ إضافة ستوري</span>
            </button>
          )}
        </div>
      </section>

      {/* Creators Ring Strip (Quick Continuous Viewer Jump) */}
      {storyGroups.length > 0 && (
        <section className="bg-[#141419] border border-[#27272F] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-[#C8C2B8]">الناشرون النشطون الآن</h2>
            <span className="text-[11px] text-[#8B857B]">
              اضغط للمشاهدة المتواصلة
            </span>
          </div>
          <div className="flex items-center gap-4 overflow-x-auto pb-1">
            {storyGroups.map((group, idx) => {
              const roles = group.barberProfile
                ? getUserRoles(group.barberProfile)
                : (['customer'] as const);
              const primaryRole = getPrimaryRole({
                role: roles[0],
                roles: [...roles],
              });
              const liveMeta = getEffectiveLiveStatus(
                group.barberProfile,
                group.barberId === currentUser.uid &&
                  group.barberProfile?.liveStatus !== 'offline',
                nowTick
              );
              return (
                <button
                  key={group.barberId}
                  type="button"
                  onClick={() => openGroup(idx)}
                  className="flex flex-col items-center gap-1.5 shrink-0 max-w-[84px] group cursor-pointer"
                >
                  <div className="relative p-[2.5px] rounded-full bg-gradient-to-tr from-[#D4A853] via-[#F8FAFC] to-[#B8892E]">
                    <div className="p-[2px] rounded-full bg-[#141419]">
                      <Avatar
                        src={group.barberPhoto}
                        name={group.barberName}
                        size="lg"
                        role={primaryRole}
                        roles={[...roles]}
                        className="w-14 h-14"
                      />
                    </div>
                    <span
                      title={liveMeta.label}
                      className={`absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full ring-2 ring-[#141419] ${liveMeta.dotClass}`}
                    />
                  </div>
                  <span
                    className={`text-[11px] font-bold truncate w-full text-center ${getRoleNameColor(
                      primaryRole
                    )}`}
                  >
                    {group.barberName}
                  </span>
                  <span className="text-[10px] font-mono-num text-[#8B857B]">
                    {group.stories.length} ستوري
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Active 24h Stories Grid OR Empty State */}
      {activeStories.length === 0 ? (
        <div className="bg-[#141419] border border-[#27272F] rounded-3xl p-10 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-[#D4A853]/15 text-[#D4A853] flex items-center justify-center mx-auto">
            <Sparkles className="w-7 h-7" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h2 className="text-lg font-bold text-[#F5F2EB]">
              لا توجد ستوريات نشطة في {activeCountryMeta?.nameAr || 'هذا البلد'} حالياً
            </h2>
            <p className="text-xs sm:text-sm text-[#9C968B] leading-relaxed">
              {canPostStory
                ? 'أنت مصرح بنشر الستوريات! شارك لقطة سريعة أو نتيجة قبل وبعد لتظهر لمدة 24 ساعة (+10 عملة أوريليوس).'
                : 'تختفي الستوريات تلقائياً بعد مرور 24 ساعة على نشرها. ترقب تحديثات الناشرين المصرح لهم قريباً.'}
            </p>
          </div>
          {canPostStory && (
            <button
              type="button"
              onClick={() => {
                setFormError(null);
                setCreateOpen(true);
              }}
              className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] font-bold text-xs sm:text-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ إضافة أول ستوري</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {activeStories.map((story) => {
            const authorProfile = users.find((u) => u.uid === story.barberId);
            const authorRoles = authorProfile
              ? getUserRoles(authorProfile)
              : (['customer'] as const);
            const primaryRole = getPrimaryRole({
              role: authorRoles[0],
              roles: [...authorRoles],
            });
            const liveMeta = getEffectiveLiveStatus(
              authorProfile,
              story.barberId === currentUser.uid &&
                authorProfile?.liveStatus !== 'offline',
              nowTick
            );
            const summary = getStoryReactionSummary(story.id);
            const canDelete = isStaff || story.barberId === currentUser.uid;
            const authorIsBarber = authorProfile
              ? isBarberMember(authorProfile)
              : false;

            return (
              <article
                key={story.id}
                className="bg-[#141419] border border-[#27272F] rounded-2xl overflow-hidden flex flex-col"
              >
                {/* Card Author Header */}
                <div className="p-3.5 border-b border-[#22222A] flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenProfile(story.barberId)}
                    className="flex items-center gap-2.5 min-w-0 text-right cursor-pointer"
                  >
                    <div className="relative shrink-0">
                      <Avatar
                        src={authorProfile?.photoURL || story.barberPhoto}
                        name={authorProfile?.displayName || story.barberName}
                        size="sm"
                        role={primaryRole}
                        roles={[...authorRoles]}
                      />
                      <span
                        title={liveMeta.label}
                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-[#141419] ${liveMeta.dotClass}`}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span
                          className={`text-xs font-bold truncate ${getRoleNameColor(
                            primaryRole
                          )}`}
                        >
                          {authorProfile?.displayName || story.barberName}
                        </span>
                        <CountryFlag
                          code={
                            authorProfile?.countryCode ||
                            story.countryCode ||
                            activeCountryCode
                          }
                          size="xs"
                        />
                        <VipSilverStar roles={[...authorRoles]} size="xs" />
                        <RoleBadgesList roles={[...authorRoles]} size="xs" compact />
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-[#8B857B] mt-0.5">
                        {(authorProfile?.salonName || story.salonName) && (
                          <>
                            <span className="truncate text-[#C8C2B8]">
                              {authorProfile?.salonName || story.salonName}
                            </span>
                            <span aria-hidden="true">·</span>
                          </>
                        )}
                        {formatMessageTime(story.createdAt, nowTick) && (
                          <span
                            title={formatFullDateTime(story.createdAt)}
                            className="font-mono-num"
                          >
                            {formatMessageTime(story.createdAt, nowTick)}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#1A1A22] border border-[#282834] text-[10px] font-mono-num text-[#D4A853]">
                      <Clock className="w-3 h-3" />
                      {formatRemainingTime(story.expiresAt)}
                    </span>
                    {story.barberId !== currentUser.uid && onOpenReport && (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenReport({
                   targetType: 'story',
                            targetId: story.id,
                            targetOwnerId: story.barberId,
                            targetOwnerName: story.barberName,
                            targetPreview: story.caption || 'ستوري منشور',
                          })
                        }
                        title="إبلاغ عن الستوري"
                        aria-label="إبلاغ عن الستوري"
                        className="p-1.5 rounded-lg bg-[#1A1A22] hover:bg-amber-500/15 text-[#8B857B] hover:text-amber-300 cursor-pointer transition-colors"
                      >
                        <Flag className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {story.barberId !== currentUser.uid && onBlockUser && (
                      <button
                        type="button"
                        onClick={() =>
                          onBlockUser(story.barberId, story.barberName, story.barberPhoto)
                        }
                        title="حظر الناشر"
                        aria-label="حظر الناشر"
                        className="p-1.5 rounded-lg bg-[#1A1A22] hover:bg-red-500/15 text-[#8B857B] hover:text-red-400 cursor-pointer transition-colors"
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteStory(story)}
                        title="حذف الستوري"
                        aria-label="حذف الستوري"
                        className="p-1.5 rounded-lg bg-[#1A1A22] hover:bg-red-500/15 text-[#8B857B] hover:text-red-400 cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Story Media Preview */}
                <button
                  type="button"
                  onClick={() => openStoryInViewer(story.id)}
                  className="relative aspect-[4/5] bg-black overflow-hidden group cursor-pointer text-right"
                >
                  {story.mediaType === 'video' ? (
                    <video
                      src={story.mediaUrl}
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img
                      src={story.mediaUrl}
                      alt={story.caption || story.barberName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    />
                  )}

                  <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />

                  <div className="absolute top-3 right-3 flex items-center gap-1.5">
                    {story.mediaType === 'before_after' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-black/70 border border-[#D4A853]/45 text-[10px] font-bold text-[#F5D67B]">
                        <Columns2 className="w-3 h-3" />
                        <span>قبل وبعد</span>
                      </span>
                    )}
                    {story.mediaType === 'video' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-black/70 border border-white/25 text-[10px] font-bold text-white">
                        <Film className="w-3 h-3 text-[#D4A853]" />
                        <span>فيديو</span>
                      </span>
                    )}
                  </div>

                  {story.caption && (
                    <div className="absolute inset-x-3 bottom-3 text-xs font-semibold text-white line-clamp-2 drop-shadow">
                      {story.caption}
                    </div>
                  )}
                </button>

                {/* Quick Custom Emoji Reactions + Picker + Direct Reply Footer */}
                <div className="p-3.5 space-y-3 bg-[#141419] flex-1 flex flex-col justify-between relative">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(summary.groups.length > 0
                      ? summary.groups
                      : QUICK_DEFAULT_EMOJIS.map((emoji) => ({
                          emoji,
                          count: 0,
                          reactedByMe: false,
                        }))
                    ).map((grp) => (
                      <div
                        key={grp.emoji}
                        className={`inline-flex items-center rounded-xl border transition-colors ${
                          grp.reactedByMe
                            ? 'bg-[#D4A853]/20 border-[#D4A853]/70 text-[#F5D67B]'
                            : 'bg-[#191921] border-[#262632] text-[#C8C2B8] hover:border-[#3A3A48]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleReaction(story, grp.emoji)}
                          title={`تفاعل بـ ${grp.emoji}`}
                          className="min-h-[34px] px-2.5 py-1 inline-flex items-center gap-1 text-xs cursor-pointer"
                        >
                          <span className="text-sm leading-none">{grp.emoji}</span>
                          {grp.count > 0 && (
                            <span className="text-[11px] font-mono-num font-bold">
                              {grp.count}
                            </span>
                          )}
                        </button>
                        {grp.count > 0 && canDelete && (
                          <button
                            type="button"
                            onClick={() =>
                              handleDeleteEmojiGroupFromStory(story, grp.emoji)
                            }
                            title={`حذف إيموجي ${grp.emoji} من الستوري`}
                            aria-label={`حذف تفاعل ${grp.emoji}`}
                            className="pl-1.5 pr-1 py-1 text-[#8B857B] hover:text-red-400 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() =>
                        setEmojiPickerTarget((prev) =>
                          prev === `card_${story.id}` ? null : `card_${story.id}`
                        )
                      }
                      title="اختر أو أضف إيموجي خاص"
                      className="min-h-[34px] px-2.5 py-1 rounded-xl bg-[#1A1A22] hover:bg-[#24242F] border border-dashed border-[#D4A853]/45 text-xs font-bold text-[#D4A853] inline-flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <SmilePlus className="w-3.5 h-3.5" />
                      <span>+</span>
                    </button>
                  </div>

                  {emojiPickerTarget === `card_${story.id}` && (
                    <div className="p-2.5 rounded-xl bg-[#191922] border border-[#D4A853]/45 space-y-2 shadow-xl">
                      <div className="flex items-center justify-between text-[11px] font-bold text-[#D4A853]">
                        <span>اختر أو اكتب أي إيموجي</span>
                        <button
                          type="button"
                          onClick={() => setEmojiPickerTarget(null)}
                          className="text-[#9C968B] hover:text-white cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-6 gap-1">
                        {CURATED_PICKER_EMOJIS.map((em) => (
                          <button
                            key={em}
                            type="button"
                            onClick={() => {
                              void handleToggleReaction(story, em);
                              setEmojiPickerTarget(null);
                            }}
                            className="h-8 rounded-lg bg-[#121218] hover:bg-[#D4A853]/20 text-base flex items-center justify-center cursor-pointer transition-colors"
                          >
                            {em}
                          </button>
                        ))}
                      </div>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!customEmojiInput.trim()) return;
                          void handleToggleReaction(story, customEmojiInput);
                          setCustomEmojiInput('');
                          setEmojiPickerTarget(null);
                        }}
                        className="flex items-center gap-1.5"
                      >
                        <input
                          type="text"
                          maxLength={12}
                          value={customEmojiInput}
                          onChange={(e) => setCustomEmojiInput(e.target.value)}
                          placeholder="أو الصق إيموجي من كيبوردك..."
                          className="flex-1 bg-[#121218] border border-[#2C2C38] focus:border-[#D4A853] rounded-lg px-2.5 py-1.5 text-xs text-[#F5F2EB] outline-none"
                        />
                        <button
                          type="submit"
                          disabled={!customEmojiInput.trim()}
                          className="px-2.5 py-1.5 rounded-lg bg-[#D4A853] text-[#0B0B0E] text-[11px] font-bold cursor-pointer disabled:opacity-50"
                        >
                          إضافة
                        </button>
                      </form>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    {story.barberId !== currentUser.uid ? (
                      <button
                        type="button"
                        onClick={() => openStoryInViewer(story.id, true)}
                        className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-[#1A1A22] hover:bg-[#23232E] border border-[#2C2C38] text-xs font-bold text-[#F5F2EB] inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-[#D4A853]" />
                        <span>رد مباشر على الستوري</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openStoryInViewer(story.id)}
                        className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-[#1A1A22] hover:bg-[#23232E] border border-[#2C2C38] text-xs font-bold text-[#D4A853] inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Film className="w-3.5 h-3.5" />
                        <span>
                          عرض الستوري ({summary.total} تفاعل)
                        </span>
                      </button>
                    )}

                    {authorIsBarber &&
                      authorProfile &&
                      story.barberId !== currentUser.uid && (
                        <button
                          type="button"
                          onClick={() => onBookBarber(authorProfile)}
                          className="min-h-[40px] px-3 py-2 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors shrink-0"
                        >
                          <CalendarClock className="w-3.5 h-3.5" />
                          <span>حجز</span>
                        </button>
                      )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Create Story Modal (Strictly for Authorized Publishers & Super Admin) */}
      {createOpen && canPostStory && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-[#141419] border border-[#2C2C35] rounded-2xl p-6 space-y-5 shadow-2xl my-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Film className="w-4 h-4 text-[#D4A853]" />
                <h3 className="text-base font-bold text-[#F5F2EB]">
                  نشر ستوري سريع (24 ساعة)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="p-1 text-[#9C968B] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                {formError}
              </div>
            )}

            <form onSubmit={handlePublishStory} className="space-y-4">
              {/* Story Type Selector */}
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#1A1A22] border border-[#272732] rounded-xl">
                {[
                  { key: 'image' as const, label: 'صورة', icon: ImageIcon },
                  { key: 'before_after' as const, label: 'قبل وبعد', icon: Columns2 },
                  { key: 'video' as const, label: 'فيديو قصير', icon: Film },
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => {
                        setMediaType(tab.key);
                        setMediaUrl('');
                        setBeforeMediaUrl('');
                        setVideoUrlInput('');
                        setFormError(null);
                      }}
                      className={`py-2 px-2 rounded-lg text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        mediaType === tab.key
                          ? 'bg-[#D4A853] text-[#0B0B0E]'
                          : 'text-[#A6A196] hover:text-white'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {mediaType === 'video' ? (
                <div className="space-y-3">
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-[#2C2C36] hover:border-[#D4A853] rounded-xl p-4 cursor-pointer bg-[#1A1A22] min-h-[140px]">
                    {mediaUrl && mediaUrl.startsWith('data:video/') ? (
                      <video
                        src={mediaUrl}
                        controls
                        className="w-full max-h-48 rounded-lg bg-black"
                      />
                    ) : (
                      <div className="text-center space-y-1.5 py-2">
                        <Upload className="w-5 h-5 text-[#D4A853] mx-auto" />
                        <div className="text-xs font-semibold text-[#F5F2EB]">
                          رفع مقطع فيديو قصير (حتى 540 كيلوبايت)
                        </div>
                        <div className="text-[11px] text-[#8B857B]">MP4 أو WebM</div>
                      </div>
        )}
                    <input
                      type="file"
                      accept="video/mp4,video/webm,video/*"
                      onChange={handleVideoFileUpload}
                      className="hidden"
                    />
                  </label>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-[#C8C2B8]">
                      أو رابط فيديو مباشر (MP4 / WebM)
                    </label>
                    <input
                      type="url"
                      dir="ltr"
                      value={videoUrlInput}
                      onChange={(e) => {
                        setVideoUrlInput(e.target.value);
                        if (e.target.value) setMediaUrl('');
                      }}
                      placeholder="https://example.com/clip.mp4"
                      className="w-full bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-xs text-left text-[#F5F2EB] outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div
                  className={`grid gap-3 ${
                    mediaType === 'before_after' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
                  }`}
                >
                  {mediaType === 'before_after' && (
                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-[#2C2C36] hover:border-[#D4A853] rounded-xl p-3 cursor-pointer bg-[#1A1A22] min-h-[150px]">
                      {beforeMediaUrl ? (
                        <img
                          src={beforeMediaUrl}
                          alt="صورة قبل"
                          className="w-full h-36 object-cover rounded-lg"
                        />
                      ) : (
                        <div className="text-center space-y-1 py-4">
                          <Upload className="w-5 h-5 text-[#D4A853] mx-auto" />
                          <div className="text-xs font-semibold text-[#F5F2EB]">صورة «قبل»</div>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageUpload(e, 'before')}
                        className="hidden"
                      />
                    </label>
                  )}

                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-[#2C2C36] hover:border-[#D4A853] rounded-xl p-3 cursor-pointer bg-[#1A1A22] min-h-[150px]">
                    {mediaUrl ? (
                      <img
                        src={mediaUrl}
                        alt="معاينة الستوري"
                        className="w-full h-36 object-cover rounded-lg"
                      />
                    ) : (
                      <div className="text-center space-y-1 py-4">
                        <Upload className="w-5 h-5 text-[#D4A853] mx-auto" />
                        <div className="text-xs font-semibold text-[#F5F2EB]">
                          {mediaType === 'before_after' ? 'صورة النتيجة «بعد»' : 'اختر صورة الستوري'}
                        </div>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, 'main')}
                      className="hidden"
                    />
                  </label>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#C8C2B8]">
                  تعليق سريع (اختياري)
                </label>
                <input
                  type="text"
                  maxLength={200}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="مثال: لمسة تدرج حديث قبل إغلاق الصالون..."
                  className="w-full bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F2EB] outline-none"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-[#D4A853]">
                  +10 عملة أوريليوس عند النشر
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateOpen(false)}
                    className="px-4 py-2 rounded-xl bg-[#1C1C24] text-xs font-semibold text-[#A6A196] hover:text-white cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-bold cursor-pointer disabled:opacity-60"
                  >
                    {submitting ? 'جاري النشر...' : 'نشر الستوري (24 ساعة)'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Full-Screen Story Viewer with Quick Reactions & Direct Reply */}
      {currentGroup && currentStory && (() => {
        const summary = getStoryReactionSummary(currentStory.id);
        const isOwnStory = currentStory.barberId === currentUser.uid;
        const viewerRoles = currentGroup.barberProfile
          ? getUserRoles(currentGroup.barberProfile)
          : (['customer'] as const);
        const viewerPrimaryRole = getPrimaryRole({
          role: viewerRoles[0],
          roles: [...viewerRoles],
        });

        return (
          <div
            onClick={() => setActiveGroupIdx(null)}
            className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-2 sm:p-6"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md h-[92vh] max-h-[820px] bg-[#0F0F14] border border-[#2C2C35] rounded-3xl overflow-hidden shadow-2xl flex flex-col"
            >
              {/* Top Progress Segments & Author Info */}
              <div className="absolute inset-x-0 top-0 z-20 p-4 bg-gradient-to-b from-black/90 via-black/55 to-transparent space-y-3">
                <div className="flex items-center gap-1.5">
                  {currentGroup.stories.map((s, idx) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setActiveStoryIdx(idx)}
                      aria-label={`الستوري ${idx + 1}`}
                      className="flex-1 h-1 rounded-full bg-white/25 overflow-hidden cursor-pointer"
                    >
                      <div
                        className={`h-full rounded-full transition-all ${
                          idx <= activeStoryIdx ? 'bg-[#D4A853] w-full' : 'w-0'
                        }`}
                      />
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const id = currentGroup.barberId;
                      setActiveGroupIdx(null);
                      onOpenProfile(id);
                    }}
                    className="flex items-center gap-2.5 min-w-0 text-right cursor-pointer"
                  >
                    <Avatar
                      src={currentGroup.barberPhoto}
                      name={currentGroup.barberName}
                      size="sm"
                      role={viewerPrimaryRole}
                      roles={[...viewerRoles]}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white truncate">
                          {currentGroup.barberName}
                        </span>
                        <CountryFlag
                          code={
                            currentGroup.barberProfile?.countryCode ||
                            currentStory.countryCode ||
                            activeCountryCode
                          }
                          size="xs"
                        />
                        <VipSilverStar roles={[...viewerRoles]} size="xs" />
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-[#D6D1C7]">
                        {currentGroup.salonName && (
                          <>
                            <span className="truncate">{currentGroup.salonName}</span>
                            <span>·</span>
                          </>
                        )}
                        {formatMessageTime(currentStory.createdAt, nowTick) && (
                          <>
                            <span className="font-mono-num">
                              {formatMessageTime(currentStory.createdAt, nowTick)}
                            </span>
                            <span>·</span>
                          </>
                        )}
                        <span className="inline-flex items-center gap-1 text-[#D4A853]">
                          <Clock className="w-2.5 h-2.5" />
                          {formatRemainingTime(currentStory.expiresAt)}
                        </span>
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isOwnStory && onOpenReport && (
                      <button
                        type="button"
                        onClick={() => {
                          const target = currentStory;
                          setActiveGroupIdx(null);
                          onOpenReport({
                            targetType: 'story',
                            targetId: target.id,
                            targetOwnerId: target.barberId,
                            targetOwnerName: target.barberName,
                            targetPreview: target.caption || 'ستوري منشور',
                          });
                        }}
                        title="إبلاغ عن الستوري"
                        className="p-2 rounded-full bg-black/55 text-amber-300 hover:bg-amber-500/20 cursor-pointer"
                      >
                        <Flag className="w-4 h-4" />
                      </button>
                    )}
                    {!isOwnStory && onBlockUser && (
                      <button
                        type="button"
                        onClick={async () => {
                          const target = currentStory;
                          setActiveGroupIdx(null);
                          await onBlockUser(target.barberId, target.barberName, target.barberPhoto);
                        }}
                        title="حظر الناشر"
                        className="p-2 rounded-full bg-black/55 text-red-300 hover:bg-red-500/20 cursor-pointer"
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    )}
                    {(isStaff || isOwnStory) && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteStory(currentStory)}
                        title="حذف الستوري"
                        className="p-2 rounded-full bg-black/55 text-red-300 hover:bg-red-500/20 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setActiveGroupIdx(null)}
                      aria-label="إغلاق"
                      className="p-2 rounded-full bg-black/55 text-white hover:bg-black/80 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Media Content */}
              <div className="flex-1 min-h-0 bg-black flex items-center justify-center relative overflow-hidden">
                {currentStory.mediaType === 'before_after' &&
                currentStory.beforeMediaUrl ? (
                  <div className="w-full px-2">
                    <BeforeAfterCompare
                      beforeUrl={currentStory.beforeMediaUrl}
                      afterUrl={currentStory.mediaUrl}
                      title={currentStory.caption || 'قبل وبعد'}
                      aspectClass="aspect-[3/4]"
                    />
                  </div>
                ) : currentStory.mediaType === 'video' ? (
                  <video
                    key={currentStory.id}
                    src={currentStory.mediaUrl}
                    controls
                    autoPlay
                    playsInline
                    onEnded={goNextStory}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <img
                    src={currentStory.mediaUrl}
                    alt={currentStory.caption || currentGroup.barberName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                  />
                )}

                {/* Navigation Arrows */}
                <button
                  type="button"
                  onClick={goPrevStory}
                  aria-label="الستوري السابق"
                  className="absolute right-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/55 hover:bg-black/80 text-white cursor-pointer"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={goNextStory}
                  aria-label="الستوري التالي"
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/55 hover:bg-black/80 text-white cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>

                {/* Reactions Breakdown Drawer Overlay */}
                {showReactorsList && (
                  <div className="absolute inset-x-3 bottom-3 z-30 max-h-52 overflow-y-auto bg-[#141419]/95 border border-[#2C2C38] rounded-2xl p-3 space-y-2 shadow-2xl">
                        <div className="flex items-center justify-between text-xs font-bold text-[#F5F2EB]">
                      <span>التفاعلات ({summary.total})</span>
                      <button
                        type="button"
                        onClick={() => setShowReactorsList(false)}
                        className="text-[#9C968B] hover:text-white cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {summary.list.length === 0 ? (
                      <div className="text-[11px] text-[#8B857B] py-2 text-center">
                        لا توجد تفاعلات بعد.
                      </div>
                    ) : (
                      <div className="divide-y divide-[#22222A]">
                        {summary.list.map((r) => {
                          const emoji = resolveReactionEmoji(r.reaction);
                          const canDeleteReaction =
                            isStaff ||
                            isOwnStory ||
                            r.userId === currentUser.uid;
                          return (
                            <div
                              key={r.id}
                              className="py-1.5 flex items-center justify-between gap-2 text-xs"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveGroupIdx(null);
                                  onOpenProfile(r.userId);
                                }}
                                className="flex items-center gap-2 min-w-0 text-right cursor-pointer"
                              >
                                <Avatar
                                  src={r.userPhoto}
                                  name={r.userName}
                                  size="xs"
                                />
                                <span className="truncate font-semibold text-[#F5F2EB]">
                                  {r.userName}
                                </span>
                              </button>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-base">{emoji}</span>
                                {canDeleteReaction && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSingleReaction(r)}
                                    title="حذف هذا التفاعل"
                                    className="p-1 rounded-lg text-[#8B857B] hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Bottom Caption + Quick Reactions + Direct Reply + Profile/Booking CTAs */}
              <div className="shrink-0 p-3.5 bg-gradient-to-t from-[#0B0B0E] via-[#121217] to-[#121217]/95 border-t border-[#22222A] space-y-2.5">
                {currentStory.caption && (
                  <p className="text-xs text-[#F5F2EB] leading-relaxed text-center">
                    {currentStory.caption}
                  </p>
                )}

                {emojiPickerTarget === `viewer_${currentStory.id}` && (
                  <div className="p-2.5 rounded-xl bg-[#181822] border border-[#D4A853]/45 space-y-2 shadow-xl">
                    <div className="flex items-center justify-between text-[11px] font-bold text-[#D4A853]">
                      <span>اختر إيموجي أو اكتب من كيبوردك</span>
                      <button
                        type="button"
                        onClick={() => setEmojiPickerTarget(null)}
                        className="text-[#9C968B] hover:text-white cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-6 gap-1">
                      {CURATED_PICKER_EMOJIS.map((em) => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => {
                            void handleToggleReaction(currentStory, em);
                            setEmojiPickerTarget(null);
                          }}
                          className="h-8 rounded-lg bg-[#111116] hover:bg-[#D4A853]/20 text-base flex items-center justify-center cursor-pointer"
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!customEmojiInput.trim()) return;
                        void handleToggleReaction(currentStory, customEmojiInput);
                        setCustomEmojiInput('');
                        setEmojiPickerTarget(null);
                      }}
                      className="flex items-center gap-1.5"
                    >
                      <input
                        type="text"
                        maxLength={12}
                        value={customEmojiInput}
                        onChange={(e) => setCustomEmojiInput(e.target.value)}
                        placeholder="أدخل أي إيموجي..."
                        className="flex-1 bg-[#111116] border border-[#2C2C38] focus:border-[#D4A853] rounded-lg px-2.5 py-1.5 text-xs text-[#F5F2EB] outline-none"
                      />
                      <button
                        type="submit"
                        disabled={!customEmojiInput.trim()}
                        className="px-3 py-1.5 rounded-lg bg-[#D4A853] text-[#0B0B0E] text-[11px] font-bold cursor-pointer disabled:opacity-50"
                      >
                        إرسال
                      </button>
                    </form>
                  </div>
                )}

                {/* Quick Reactions Bar (Grouped Emoji Pills + Custom Picker + Reactors List) */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {(summary.groups.length > 0
                    ? summary.groups
                    : QUICK_DEFAULT_EMOJIS.map((emoji) => ({
                        emoji,
                        count: 0,
                        reactedByMe: false,
                      }))
                  ).map((grp) => (
                    <div
                      key={grp.emoji}
                      className={`inline-flex items-center rounded-xl border transition-colors ${
                        grp.reactedByMe
                          ? 'bg-[#D4A853]/25 border-[#D4A853] text-[#F5D67B]'
                          : 'bg-[#181820] border-[#2A2A36] text-[#D6D1C7] hover:border-[#3E3E4E]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleReaction(currentStory, grp.emoji)}
                        className="min-h-[36px] px-2.5 py-1 inline-flex items-center gap-1 text-xs cursor-pointer"
                      >
                        <span className="text-base leading-none">{grp.emoji}</span>
                        {grp.count > 0 && (
                          <span className="text-[11px] font-mono-num font-bold">
                            {grp.count}
                          </span>
                        )}
                      </button>
                      {grp.count > 0 && (isStaff || isOwnStory) && (
                        <button
                          type="button"
                          onClick={() =>
                            handleDeleteEmojiGroupFromStory(currentStory, grp.emoji)
                          }
                          title={`حذف إيموجي ${grp.emoji}`}
                          aria-label={`حذف إيموجي ${grp.emoji}`}
                          className="pl-1.5 pr-1 py-1 text-[#8B857B] hover:text-red-400 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() =>
                      setEmojiPickerTarget((prev) =>
                        prev === `viewer_${currentStory.id}`
                          ? null
                          : `viewer_${currentStory.id}`
                      )
                    }
                    title="إضافة إيموجي مخصص"
                    className="min-h-[36px] px-2.5 rounded-xl bg-[#181820] hover:bg-[#232330] border border-dashed border-[#D4A853]/50 text-xs font-bold text-[#D4A853] inline-flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <SmilePlus className="w-4 h-4" />
                    <span>+</span>
                  </button>

                  {summary.total > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowReactorsList((v) => !v)}
                      title="عرض المتفاعلين وحذف التفاعلات"
                      className="min-h-[36px] px-2.5 rounded-xl bg-[#181820] border border-[#2A2A36] text-[11px] font-mono-num font-bold text-[#D4A853] hover:border-[#D4A853]/50 cursor-pointer shrink-0 mr-auto"
                    >
                      المتفاعلون ({summary.total})
                    </button>
                  )}
                </div>

                {/* Direct Reply Feedback Banner */}
                {replyFeedback && replyFeedback.storyId === currentStory.id && (
                  <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-between gap-2 text-xs text-emerald-200">
                    <span className="flex items-center gap-1.5 min-w-0 truncate">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="truncate">
                        تم إرسال ردك لـ {replyFeedback.authorName}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const convId = replyFeedback.convId;
                        setActiveGroupIdx(null);
                        onOpenConversation(convId);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500 text-[#0B0B0E] font-bold text-[11px] cursor-pointer shrink-0"
                    >
                      فتح المحادثة
                    </button>
                  </div>
                )}

                {replyError && (
                  <div className="text-[11px] text-red-300 text-center">
                    {replyError}
                  </div>
                )}

                {/* Direct Reply Composer (on other users' stories) */}
                {!isOwnStory ? (
                  <form
                    onSubmit={handleSendDirectReply}
                    className="flex items-center gap-2"
                  >
                    <input
                      ref={replyInputRef}
                      type="text"
                      maxLength={400}
                      value={replyText}
                      onFocus={() => setIsReplyFocused(true)}
                      onBlur={() => setIsReplyFocused(false)}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder={`أرسل رداً مباشراً إلى ${currentGroup.barberName}...`}
                      className="flex-1 min-h-[42px] bg-[#181820] border border-[#2C2C38] focus:border-[#D4A853] rounded-xl px-3.5 text-xs text-[#F5F2EB] placeholder:text-[#7E786E] outline-none"
                    />
                    <button
                      type="submit"
                      disabled={sendingReply || !replyText.trim()}
                      aria-label="إرسال الرد"
                      className="min-w-[42px] min-h-[42px] rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] disabled:opacity-45 text-[#0B0B0E] flex items-center justify-center cursor-pointer transition-colors shrink-0"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowReactorsList((v) => !v)}
                    className="w-full min-h-[40px] py-2 px-3 rounded-xl bg-[#181820] hover:bg-[#22222C] border border-[#2B2B38] text-xs font-semibold text-[#D4A853] cursor-pointer"
                  >
                    عرض المتفاعلين على ستوريّك ({summary.total})
                  </button>
                )}

                {/* Profile & Booking Quick CTAs */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const id = currentGroup.barberId;
                      setActiveGroupIdx(null);
                      onOpenProfile(id);
                    }}
                    className="flex-1 min-h-[40px] py-2 px-3 rounded-xl bg-[#1D1D25] hover:bg-[#272732] text-xs font-semibold text-[#F5F2EB] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <UserIcon className="w-3.5 h-3.5 text-[#D4A853]" />
                    <span>زيارة الملف</span>
                  </button>
                  {currentGroup.barberProfile &&
                    !isOwnStory &&
                    isBarberMember(currentGroup.barberProfile) && (
                      <button
                        type="button"
                        onClick={() => {
                          const barber = currentGroup.barberProfile!;
                          setActiveGroupIdx(null);
                          onBookBarber(barber);
                        }}
                        className="flex-1 min-h-[40px] py-2 px-3 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <CalendarClock className="w-3.5 h-3.5" />
                        <span>حجز موعد</span>
                      </button>
                    )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <ConfirmModal
        open={Boolean(confirmDeleteStory)}
        title="هل أنت متأكد من حذف الستوري؟"
        message="سيتم إزالة هذا الستوري نهائياً من ستوريات أوريليوس."
        confirmLabel="نعم، حذف الستوري"
        onCancel={() => setConfirmDeleteStory(null)}
        onConfirm={() => {
          if (confirmDeleteStory) {
            return handleDeleteStory(confirmDeleteStory);
          }
        }}
      />
    </div>
  );
};
                      
