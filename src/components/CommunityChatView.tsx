import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  Send,
  Edit3,
  Trash2,
  VolumeX,
  UserX,
  Ban,
  Shield,
  Check,
  X,
  MessageSquare,
  AlertTriangle,
  LifeBuoy,
  Coins,
  Scissors,
  Users,
  Reply,
  AtSign,
  ArrowDown,
  CornerUpRight,
  Globe,
  Eye,
  EyeOff,
  ChevronDown,
  Search,
  ArrowRight,
  MessageCircle,
  UserPlus,
  UserCheck,
  Sparkles,
  User as UserIcon,
  Flag,
} from 'lucide-react';
import {
  db,
  createSafeId,
  formatLastSeen,
  handleFirestoreError,
  OperationType,
  tsToMillis,
} from '../firebase';
import {
  CommunityMessage,
  Friendship,
  MemberLiveStatus,
  TypingStatus,
  UserProfile,
  UserRole,
} from '../types';
import {
  Avatar,
  MultiRoleSelector,
  RoleBadgesList,
  VipSilverStar,
  getEffectiveNameColorClass,
  getPrimaryRole,
  getRoleMeta,
  getUserRoles,
  hasRole,
  isBarberMember,
  isStaffMember,
} from './Avatar';
import {
  canUserBan,
  canUserDeleteContent,
  canUserMuteKick,
  canActorModerateTarget,
  getRoleHierarchyOrder,
} from '../utils/roles';
import { assignMemberRoles } from '../utils/roleAssignment';
import {
  awardAureliusCoins,
  getCommunityLevel,
  getEffectiveLiveStatus,
} from '../utils/gamification';
import {
  formatFullDateTime,
  formatMessageTime,
  useNowTick,
} from '../utils/time';
import {
  extractMentionedUsers,
  getUserHandle,
  isActiveSpecialId,
  parseMessageTextSegments,
} from '../utils/username';
import { canSendFriendRequest, makeFriendshipId } from '../utils/friends';
import { setRoomTypingStatus } from '../utils/typing';
import {
  checkActionRateLimit,
  MAX_TEXT_LENGTHS,
  sanitizePlainText,
} from '../utils/security';
import { CHAT_TITLE_PRESETS, getActiveChatTitle } from '../utils/store';
import { ConfirmModal } from './ConfirmModal';
import { ReportRequestPayload } from './ReportContentModal';

import {
  COUNTRIES,
  getCountryByCode,
  matchesActiveCountry,
  normalizeCountryCode,
} from '../utils/countries';
import { CountryFlag } from './CountryPickerModal';

export type ChatRoomMode = 'local' | 'global';

interface CommunityChatViewProps {
  currentUser: UserProfile;
  isSuperAdmin: boolean;
  users: UserProfile[];
  usersReady?: boolean;
  messages: CommunityMessage[];
  typingStatuses?: TypingStatus[];
  friendships?: Friendship[];
  activeCountryCode: string;
  roomMode: ChatRoomMode;
  inspectedCountryCode: string;
  onChangeChatRoom: (nextMode: ChatRoomMode, nextCountryCode?: string) => void;
  onSyncChatRoomSilently?: (nextMode: ChatRoomMode, nextCountryCode?: string) => void;
  onOpenPrivateMessages: () => void;
  privateConversationsCount?: number;
  canGoBack?: boolean;
  backLabel?: string;
  onBack?: () => void;
  focusMessageId?: string | null;
  onClearFocusMessage?: () => void;
  onOpenProfile: (uid: string) => void;
  onStartPrivateChat: (targetUser: UserProfile) => void;
  onSendFriendRequest?: (target: UserProfile) => Promise<void> | void;
  onAcceptFriendRequest?: (friendship: Friendship) => Promise<void> | void;
  onRejectOrRemoveFriend?: (friendshipId: string) => Promise<void> | void;
  onOpenTickets: () => void;
  onChangeLiveStatus?: (status: MemberLiveStatus) => Promise<void> | void;
  blockedUserIds?: string[];
  onBlockUser?: (targetUid: string, targetName: string, targetPhoto?: string) => Promise<void> | void;
  onOpenReport?: (payload: ReportRequestPayload) => void;
}

type ModerationActionType = 'mute' | 'kick' | 'ban' | 'role';

interface ActiveMentionQuery {
  start: number;
  end: number;
  query: string;
}

function detectMentionAtCaret(value: string, caretPos: number): ActiveMentionQuery | null {
  const safeCaret = Math.max(0, Math.min(caretPos, value.length));
  const beforeCaret = value.slice(0, safeCaret);
  const match = beforeCaret.match(/(?:^|[\s،,.!?])@([^\s@]*)$/);
  if (!match) return null;
  const atIndex = beforeCaret.lastIndexOf('@');
  if (atIndex < 0) return null;
  return {
    start: atIndex,
    end: safeCaret,
    query: match[1] || '',
  };
}

interface CommunityMessageRowProps {
  msg: CommunityMessage;
  isOwn: boolean;
  isGroupedWithPrev: boolean;
  senderProfile?: UserProfile;
  senderDisplayName: string;
  senderHandle: string;
  senderRolesKey: string;
  senderRoles: UserRole[];
  displayRole: UserRole;
  senderCountryCode: string;
  senderPhoto: string;
  senderSpecialActive: boolean;
  senderNameColorClass: string;
  senderChatTitleKey?: string | null;
  senderAvatarFrame?: string;
  senderAvatarFrameExpiresAt?: any;
  senderLiveDotClass: string;
  statusTitle: string;
  msgTime: string;
  bubbleToneClass: string;
  isEditing: boolean;
  editingText: string;
  canReply: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canModTarget: boolean;
  allowMuteKick: boolean;
  allowBan: boolean;
  isSuperAdmin: boolean;
  handleToUserMap: Map<string, UserProfile>;
  myHandle: string;
  onOpenSender: (senderProfile: UserProfile | undefined, senderId: string) => void;
  onHandleClick: (senderProfile: UserProfile | undefined, senderId: string, isOwn: boolean) => void;
  onScrollToMessage: (msgId: string) => void;
  onStartReply: (msg: CommunityMessage) => void;
  onStartEdit: (msg: CommunityMessage) => void;
  onEditingTextChange: (val: string) => void;
  onSaveEdit: (msg: CommunityMessage) => void;
  onCancelEdit: () => void;
  onConfirmDelete: (msg: CommunityMessage) => void;
  onOpenModModal: (type: ModerationActionType, target: UserProfile) => void;
  onOpenProfile: (uid: string) => void;
  canReport?: boolean;
  onReportMessage?: (msg: CommunityMessage) => void;
}

const CommunityMessageRow: React.FC<CommunityMessageRowProps> = memo(
  ({
    msg,
    isOwn,
    isGroupedWithPrev,
    senderProfile,
    senderDisplayName,
    senderHandle,
    senderRoles,
    displayRole,
    senderCountryCode,
    senderPhoto,
    senderSpecialActive,
    senderNameColorClass,
    senderChatTitleKey,
    senderAvatarFrame,
    senderAvatarFrameExpiresAt,
    senderLiveDotClass,
    statusTitle,
    msgTime,
    bubbleToneClass,
    isEditing,
    editingText,
    canReply,
    canEdit,
    canDelete,
    canModTarget,
    allowMuteKick,
    allowBan,
    isSuperAdmin,
    handleToUserMap,
    myHandle,
    onOpenSender,
    onHandleClick,
    onScrollToMessage,
    onStartReply,
    onStartEdit,
    onEditingTextChange,
    onSaveEdit,
    onCancelEdit,
    onConfirmDelete,
    onOpenModModal,
    onOpenProfile,
    canReport,
    onReportMessage,
  }) => {
    const renderedSegments = useMemo(() => {
      const segments = parseMessageTextSegments(msg.text);
      return segments.map((seg, idx) => {
        if (seg.type !== 'mention' || !seg.handle) {
          return <React.Fragment key={idx}>{seg.value}</React.Fragment>;
        }
        const matchedUser = handleToUserMap.get(seg.handle.toLowerCase());
        const isMe = seg.handle.toLowerCase() === myHandle.toLowerCase();
        if (!matchedUser) {
          return (
            <span key={idx} dir="ltr" className="text-[#D4A853] font-semibold">
              {seg.value}
            </span>
          );
        }
        return (
          <button
            key={idx}
            type="button"
            dir="ltr"
            onClick={() => onOpenProfile(matchedUser.uid)}
            title={`فتح ملف ${matchedUser.displayName}`}
            className={`inline font-mono-num font-bold hover:underline cursor-pointer rounded px-1 py-0.25 transition-colors ${
              isMe
                ? 'bg-[#D4A853]/25 text-[#FCE08B]'
                : 'bg-[#D4A853]/12 text-[#D4A853] hover:bg-[#D4A853]/22'
            }`}
          >
            @{seg.handle}
          </button>
        );
      });
    }, [msg.text, handleToUserMap, myHandle, onOpenProfile]);

    return (
      <div
        data-msg-id={msg.id}
        className={`group flex items-start gap-2.5 ${
          isOwn ? 'flex-row-reverse' : 'flex-row'
        } ${isGroupedWithPrev ? 'mt-0.5' : 'pt-2'}`}
      >
        {!isGroupedWithPrev ? (
          <button
            type="button"
            onClick={() => onOpenSender(senderProfile, msg.senderId)}
            title={`${senderDisplayName} (@${senderHandle}) — ${statusTitle}`}
            className="relative shrink-0 mt-0.5 cursor-pointer hover:opacity-90 transition-opacity"
          >
            <Avatar
              src={senderPhoto}
              name={senderDisplayName}
              size="xs"
              role={displayRole}
              roles={senderRoles}
              avatarFrame={senderAvatarFrame}
              avatarFrameExpiresAt={senderAvatarFrameExpiresAt}
            />
            <span
              aria-hidden="true"
              className={`absolute -bottom-0.5 -left-0.5 w-2 h-2 rounded-full ring-2 ring-[#0D0D12] ${senderLiveDotClass}`}
            />
          </button>
        ) : (
          <div className="w-7 shrink-0" aria-hidden="true" />
        )}

        <div
          className={`min-w-0 max-w-[85%] sm:max-w-[75%] lg:max-w-[65%] flex flex-col ${
            isOwn ? 'items-end' : 'items-start'
          }`}
        >
          {!isGroupedWithPrev && (
            <div
              className={`flex items-center gap-1.5 flex-wrap mb-1 ${
                isOwn ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              <button
                type="button"
                onClick={() => onOpenSender(senderProfile, msg.senderId)}
                className={`text-xs font-bold hover:underline cursor-pointer ${senderNameColorClass}`}
              >
                {senderDisplayName}
              </button>
              {senderCountryCode && <CountryFlag code={senderCountryCode} size="xs" />}
              <button
                type="button"
                dir="ltr"
                onClick={() => onHandleClick(senderProfile, msg.senderId, isOwn)}
                title={isOwn ? 'المعرف الرقمي الخاص بك' : `إشارة إلى @${senderHandle}`}
                className={`inline-flex items-center gap-0.5 text-[10px] font-mono-num cursor-pointer transition-colors ${
                  senderSpecialActive
                    ? 'text-[#FCE08B] font-bold hover:text-white'
                    : 'text-[#9C968B] hover:text-[#D4A853]'
                }`}
              >
                {senderSpecialActive && <Sparkles className="w-2.5 h-2.5 text-[#FCE08B]" />}
                <span>@{senderHandle}</span>
              </button>
              <VipSilverStar roles={senderRoles} size="xs" />
              <RoleBadgesList roles={senderRoles} size="xs" compact />
              {senderChatTitleKey &&
                senderChatTitleKey in CHAT_TITLE_PRESETS && (
                  <span
                    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border text-[9px] font-bold leading-none whitespace-nowrap ${
                      CHAT_TITLE_PRESETS[senderChatTitleKey as keyof typeof CHAT_TITLE_PRESETS].pillClass
                    }`}
                  >
                    <Sparkles className="w-2.5 h-2.5 shrink-0" />
                    <span>
                      {CHAT_TITLE_PRESETS[senderChatTitleKey as keyof typeof CHAT_TITLE_PRESETS].labelAr}
                    </span>
                  </span>
                )}
              {msgTime && (
                <span
                  title={`${formatFullDateTime(msg.createdAt)} · ${statusTitle}`}
                  className="text-[10px] font-mono-num text-[#7B766E]"
                >
                  {msgTime}
                </span>
              )}
            </div>
          )}

          <div
            className={`flex items-end gap-1.5 max-w-full ${
              isOwn ? 'flex-row-reverse' : 'flex-row'
            }`}
          >
            {isEditing ? (
              <div className="flex items-center gap-2 bg-[#1D1D26] border border-[#D4A853] rounded-xl px-3 py-1.5">
                <input
                  type="text"
                  maxLength={1000}
                  value={editingText}
                  onChange={(e) => onEditingTextChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') onCancelEdit();
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onSaveEdit(msg);
                    }
                  }}
                  autoFocus
                  className="bg-transparent text-xs text-[#F5F2EB] outline-none min-w-[180px] flex-1"
                />
                <button
                  type="button"
                  onClick={() => onSaveEdit(msg)}
                  className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={onCancelEdit}
                  className="p-1 text-[#9C968B] hover:text-white rounded cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div
                className={`border rounded-xl px-3 py-1.5 text-[13px] leading-snug break-words transition-colors ${bubbleToneClass}`}
              >
                {msg.replyToId && (
                  <button
                    type="button"
                    onClick={() => onScrollToMessage(msg.replyToId!)}
                    title="الانتقال إلى الرسالة الأصلية"
                    className="w-full text-right mb-1.5 px-2 py-1 rounded-lg bg-black/25 hover:bg-black/40 border border-white/10 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <CornerUpRight className="w-3 h-3 text-[#D4A853] shrink-0" />
                    <span className="text-[11px] font-bold text-[#D4A853] shrink-0">
                      {msg.replyToSenderName || 'عضو'}
                    </span>
                    {msg.replyToSenderUsername && (
                      <span
                        dir="ltr"
                        className="text-[10px] font-mono-num text-[#9C968B] shrink-0"
                      >
                        @{msg.replyToSenderUsername}
                      </span>
                    )}
                    <span className="text-[11px] text-[#B6B0A4] truncate min-w-0">
                      {msg.replyToText || '...'}
                    </span>
                  </button>
                )}

                <div className="whitespace-pre-wrap">
                  {renderedSegments}
                  {(msg.edited || isGroupedWithPrev) && (
                    <span className="inline-flex items-center gap-1 mr-2 text-[9px] font-mono-num text-[#7B766E] align-baseline">
                      {msg.edited && <span>(معدّلة)</span>}
                      {isGroupedWithPrev && msgTime && <span>{msgTime}</span>}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-0.5 shrink-0 opacity-85 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
              {canReply && (
                <button
                  type="button"
                  onClick={() => onStartReply(msg)}
                  title="رد مباشر على الرسالة"
                  className="inline-flex items-center gap-1 px-1.5 py-1 rounded-lg bg-[#1A1A22] hover:bg-[#D4A853] hover:text-[#0B0B0E] text-[10px] font-bold text-[#B6B0A4] transition-colors cursor-pointer"
                >
                  <Reply className="w-3 h-3" />
                  <span className="hidden md:inline">رد</span>
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onStartEdit(msg)}
                  title="تعديل"
                  className="p-1 text-[#8B857B] hover:text-[#D4A853] cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => onConfirmDelete(msg)}
                  title="حذف الرسالة"
                  className="p-1 text-[#8B857B] hover:text-red-400 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              {canModTarget && senderProfile && (
                <>
                  {allowMuteKick && (
                    <>
                      <button
                        type="button"
                        onClick={() => onOpenModModal('mute', senderProfile)}
                        title="كتم المستخدم"
                        className="p-1 text-[#8B857B] hover:text-amber-400 cursor-pointer"
                      >
                        <VolumeX className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenModModal('kick', senderProfile)}
                        title="طرد المستخدم"
                        className="p-1 text-[#8B857B] hover:text-orange-400 cursor-pointer"
                      >
                        <UserX className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  {allowBan && (
                    <button
                      type="button"
                      onClick={() => onOpenModModal('ban', senderProfile)}
                      title="حظر نهائي"
                      className="p-1 text-[#8B857B] hover:text-red-500 cursor-pointer"
                    >
                      <Ban className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => onOpenModModal('role', senderProfile)}
                      title="منح / سحب رتبة"
                      className="p-1 text-[#8B857B] hover:text-sky-400 cursor-pointer"
                    >
                      <Shield className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              )}
              {canReport && onReportMessage && (
                <button
                  type="button"
                  onClick={() => onReportMessage(msg)}
                  title="إبلاغ عن الرسالة"
                  className="p-1 text-[#8B857B] hover:text-amber-400 cursor-pointer"
                >
                  <Flag className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.msg === next.msg &&
    prev.isOwn === next.isOwn &&
    prev.isGroupedWithPrev === next.isGroupedWithPrev &&
    prev.senderDisplayName === next.senderDisplayName &&
    prev.senderHandle === next.senderHandle &&
    prev.senderRolesKey === next.senderRolesKey &&
    prev.senderCountryCode === next.senderCountryCode &&
    prev.senderPhoto === next.senderPhoto &&
    prev.senderSpecialActive === next.senderSpecialActive &&
    prev.senderNameColorClass === next.senderNameColorClass &&
    prev.senderAvatarFrame === next.senderAvatarFrame &&
    prev.senderAvatarFrameExpiresAt === next.senderAvatarFrameExpiresAt &&
    prev.senderLiveDotClass === next.senderLiveDotClass &&
    prev.statusTitle === next.statusTitle &&
    prev.msgTime === next.msgTime &&
    prev.bubbleToneClass === next.bubbleToneClass &&
    prev.isEditing === next.isEditing &&
    (!next.isEditing || prev.editingText === next.editingText) &&
    prev.canReply === next.canReply &&
    prev.canEdit === next.canEdit &&
    prev.canDelete === next.canDelete &&
    prev.canModTarget === next.canModTarget &&
    prev.allowMuteKick === next.allowMuteKick &&
    prev.allowBan === next.allowBan &&
    prev.isSuperAdmin === next.isSuperAdmin &&
    prev.canReport === next.canReport &&
    prev.myHandle === next.myHandle &&
    prev.handleToUserMap === next.handleToUserMap
);

export const CommunityChatView: React.FC<CommunityChatViewProps> = ({
  currentUser,
  isSuperAdmin,
  users,
  usersReady = true,
  messages,
  typingStatuses = [],
  friendships = [],
  activeCountryCode,
  roomMode,
  inspectedCountryCode,
  onChangeChatRoom,
  onSyncChatRoomSilently,
  onOpenPrivateMessages,
  privateConversationsCount = 0,
  canGoBack = false,
  backLabel,
  onBack,
  focusMessageId = null,
  onClearFocusMessage,
  onOpenProfile,
  onStartPrivateChat,
  onSendFriendRequest,
  onAcceptFriendRequest,
  onRejectOrRemoveFriend,
  onOpenTickets,
  onChangeLiveStatus,
  blockedUserIds = [],
  onBlockUser,
  onOpenReport,
}) => {
  const isModOrAdmin = isStaffMember(currentUser, isSuperAdmin);
  const allowBan = canUserBan(currentUser, isSuperAdmin);
  const allowMuteKick = canUserMuteKick(currentUser, isSuperAdmin);
  const allowDelete = canUserDeleteContent(currentUser, isSuperAdmin);
  const blockedSet = useMemo(() => new Set(blockedUserIds), [blockedUserIds]);

  const [roomsMenuOpen, setRoomsMenuOpen] = useState(false);
  const [roomsSearch, setRoomsSearch] = useState('');
  const [isChatCollapsed, setIsChatCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem('aurelius_mod_chat_collapsed_v1') === '1';
    } catch {
      return false;
    }
  });

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<CommunityMessage | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [confirmDeleteMsg, setConfirmDeleteMsg] = useState<CommunityMessage | null>(null);
  const [modModal, setModModal] = useState<{
    type: ModerationActionType;
    target: UserProfile;
  } | null>(null);
  const [modReason, setModReason] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>(['customer']);
  const [modSubmitting, setModSubmitting] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);

  // Member Quick Action Modal (when tapping member avatar/name in chat)
  const [quickMember, setQuickMember] = useState<UserProfile | null>(null);
  const [quickMemberBusy, setQuickMemberBusy] = useState(false);
  const [quickMemberError, setQuickMemberError] = useState<string | null>(null);

  // Mention autocomplete & jump-to-message state
  const [mentionQuery, setMentionQuery] = useState<ActiveMentionQuery | null>(null);
  const [mentionSelectedIdx, setMentionSelectedIdx] = useState(0);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [unreadBelowCount, setUnreadBelowCount] = useState(0);

  const nowTick = useNowTick(20000);
  const [typingNowTick, setTypingNowTick] = useState(() => Date.now());

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const roomsDropdownRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);
  const prevMsgCountRef = useRef(0);
  const initialScrollDoneRef = useRef(false);
  const prevActiveCountryRef = useRef(activeCountryCode);
  const lastTypingSentAtRef = useRef(0);
  const typingIdleTimerRef = useRef<number | null>(null);
  const activeTypingRoomRef = useRef<{ roomKey: string; scope: 'global' | 'local' } | null>(null);

  const chatCollapsed = isModOrAdmin && isChatCollapsed;

  const toggleChatCollapse = () => {
    if (!isModOrAdmin) return;
    setIsChatCollapsed((prev) => {
      const next = !prev;
      if (next) {
        setMembersOpen(false);
      }
      try {
        window.localStorage.setItem('aurelius_mod_chat_collapsed_v1', next ? '1' : '0');
      } catch {
        // Ignore storage restrictions
      }
      return next;
    });
  };

  const myHandle = useMemo(() => getUserHandle(currentUser), [currentUser]);
  const isMySpecialActive = useMemo(() => isActiveSpecialId(currentUser), [currentUser]);
  const effectiveLocalCountry = isModOrAdmin ? inspectedCountryCode : activeCountryCode;
  const activeRoomKey = roomMode === 'global' ? 'global' : `local_${effectiveLocalCountry}`;
  const targetCountryMeta = useMemo(
    () => getCountryByCode(effectiveLocalCountry),
    [effectiveLocalCountry]
  );

  // Automatically route user to their selected country's Local Chat whenever activeCountryCode changes
  useEffect(() => {
    if (prevActiveCountryRef.current !== activeCountryCode) {
      prevActiveCountryRef.current = activeCountryCode;
      onSyncChatRoomSilently?.('local', activeCountryCode);
    }
  }, [activeCountryCode, onSyncChatRoomSilently]);

  // Fast local tick only while typing statuses are active in this room so stale indicators expire smoothly
  useEffect(() => {
    const hasPotentialTypists = typingStatuses.some(
      (t) => t.roomKey === activeRoomKey && t.userId !== currentUser.uid && t.isTyping
    );
    if (!hasPotentialTypists) return;
    setTypingNowTick(Date.now());
    const id = window.setInterval(() => setTypingNowTick(Date.now()), 2000);
    return () => window.clearInterval(id);
  }, [typingStatuses, activeRoomKey, currentUser.uid]);

  const activeTypists = useMemo(
    () =>
      typingStatuses.filter(
        (t) =>
          t.roomKey === activeRoomKey &&
          t.userId !== currentUser.uid &&
          !blockedSet.has(t.userId) &&
          t.isTyping &&
          typingNowTick - tsToMillis(t.updatedAt) < 5500
      ),
    [typingStatuses, activeRoomKey, currentUser.uid, blockedSet, typingNowTick]
  );

  // Reset scroll tracking, typing indicator, and transient reply/mention state when room changes
  useEffect(() => {
    if (activeTypingRoomRef.current) {
      const prev = activeTypingRoomRef.current;
      activeTypingRoomRef.current = null;
      lastTypingSentAtRef.current = 0;
      void setRoomTypingStatus(prev.roomKey, prev.scope, currentUser, false);
    }
    if (typingIdleTimerRef.current) {
      window.clearTimeout(typingIdleTimerRef.current);
      typingIdleTimerRef.current = null;
    }
    initialScrollDoneRef.current = false;
    prevMsgCountRef.current = 0;
    setReplyingTo(null);
    setMentionQuery(null);
    setUnreadBelowCount(0);
  }, [roomMode, effectiveLocalCountry]);

  useEffect(() => {
    return () => {
      if (typingIdleTimerRef.current) {
        window.clearTimeout(typingIdleTimerRef.current);
      }
      if (activeTypingRoomRef.current) {
        const prev = activeTypingRoomRef.current;
        void setRoomTypingStatus(prev.roomKey, prev.scope, currentUser, false);
      }
    };
  }, []);

  const userByIdMap = useMemo(() => {
    const map = new Map<string, UserProfile>();
    for (const u of users) {
      map.set(u.uid, u);
    }
    map.set(currentUser.uid, currentUser);
    return map;
  }, [users, currentUser]);

  const getMessageRoomScope = (msg: CommunityMessage): 'global' | 'local' => {
    if (msg.roomType === 'global') return 'global';
    if (msg.roomType === 'local') return 'local';
    const sender = userByIdMap.get(msg.senderId);
    const hasCountry =
      Boolean(normalizeCountryCode(msg.countryCode)) ||
      Boolean(normalizeCountryCode(sender?.countryCode));
    return hasCountry ? 'local' : 'global';
  };

  // Counts across Global Chat & all Country Local Chats (for dual switcher + moderator room explorer)
  const roomDirectoryStats = useMemo(() => {
    let globalMsgCount = 0;
    const countryMsgCounts = new Map<string, number>();
    const countryOnlineCounts = new Map<string, number>();
    let globalOnlineCount = 0;

    for (const u of users) {
      if (u.isBanned) continue;
      const liveMeta = getEffectiveLiveStatus(
        u,
        u.uid === currentUser.uid && currentUser.liveStatus !== 'offline',
        nowTick
      );
      if (liveMeta.status !== 'offline') {
        globalOnlineCount += 1;
        const cCode =
          u.uid === currentUser.uid
            ? activeCountryCode
            : normalizeCountryCode(u.countryCode);
        if (cCode) {
          countryOnlineCounts.set(cCode, (countryOnlineCounts.get(cCode) || 0) + 1);
        }
      }
    }

    for (const msg of messages) {
      if (getMessageRoomScope(msg) === 'global') {
        globalMsgCount += 1;
      } else {
        const sender = userByIdMap.get(msg.senderId);
        const cCode =
          normalizeCountryCode(msg.countryCode) ||
          normalizeCountryCode(
            sender?.uid === currentUser.uid ? activeCountryCode : sender?.countryCode
          );
        if (cCode) {
          countryMsgCounts.set(cCode, (countryMsgCounts.get(cCode) || 0) + 1);
        }
      }
    }

    return {
      globalMsgCount,
      globalOnlineCount,
      countryMsgCounts,
      countryOnlineCounts,
    };
  }, [messages, users, userByIdMap, currentUser.uid, currentUser.liveStatus, activeCountryCode, nowTick]);

  // Filter by selected room (Global vs Local Country), exclude blocked users, & order chronologically
  const sortedMessages = useMemo(
    () =>
      messages
        .filter((msg) => {
          if (blockedSet.has(msg.senderId)) return false;
          const scope = getMessageRoomScope(msg);
          if (roomMode === 'global') {
            return scope === 'global';
          }
          if (scope !== 'local') return false;
          const sender = userByIdMap.get(msg.senderId);
          const senderCountry =
            sender?.uid === currentUser.uid ? activeCountryCode : sender?.countryCode;
          return matchesActiveCountry(msg.countryCode, senderCountry, effectiveLocalCountry);
        })
        .sort((a, b) => tsToMillis(a.createdAt) - tsToMillis(b.createdAt)),
    [messages, blockedSet, userByIdMap, roomMode, effectiveLocalCountry, activeCountryCode, currentUser.uid]
  );

  const activeUsers = useMemo(
    () =>
      users.filter((u) => {
        if (u.isBanned) return false;
        if (roomMode === 'global') return true;
        const memberCountry =
          u.uid === currentUser.uid
            ? activeCountryCode
            : normalizeCountryCode(u.countryCode);
        return memberCountry === effectiveLocalCountry;
      }),
    [users, roomMode, effectiveLocalCountry, activeCountryCode, currentUser.uid]
  );

  const handleToUserMap = useMemo(() => {
    const map = new Map<string, UserProfile>();
    for (const u of users) {
      if (!u.isBanned) {
        map.set(getUserHandle(u).toLowerCase(), u);
      }
    }
    if (!currentUser.isBanned) {
      map.set(getUserHandle(currentUser).toLowerCase(), currentUser);
    }
    return map;
  }, [users, currentUser]);

  const findUser = (uid: string) => userByIdMap.get(uid);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    isNearBottomRef.current = true;
    setUnreadBelowCount(0);
  };

  const editingTextRef = useRef(editingText);
  editingTextRef.current = editingText;

  const scrollToMessage = useCallback((targetId: string) => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const targetEl = container.querySelector(
      `[data-msg-id="${CSS.escape(targetId)}"]`
    ) as HTMLElement | null;
    if (!targetEl) return;
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMsgId(targetId);
    window.setTimeout(() => {
      setHighlightedMsgId((cur) => (cur === targetId ? null : cur));
    }, 1800);
  }, []);

  // Smart container-scoped auto-scroll (initial jump + live incoming messages)
  useEffect(() => {
    if (chatCollapsed) return;
    const el = messagesContainerRef.current;
    if (!el) return;
                                  if (!initialScrollDoneRef.current && sortedMessages.length > 0) {
      initialScrollDoneRef.current = true;
      prevMsgCountRef.current = sortedMessages.length;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
        isNearBottomRef.current = true;
      });
      return;
    }

    const diff = sortedMessages.length - prevMsgCountRef.current;
    prevMsgCountRef.current = sortedMessages.length;

    if (diff > 0) {
      const latest = sortedMessages[sortedMessages.length - 1];
      const sentByMe = latest?.senderId === currentUser.uid;
      if (sentByMe || isNearBottomRef.current) {
        requestAnimationFrame(() => scrollToBottom('smooth'));
      } else {
        setUnreadBelowCount((c) => c + diff);
      }
    }
  }, [sortedMessages, currentUser.uid, chatCollapsed]);

  // Focus target message when clicked from a live notification (auto-switches room if needed)
  useEffect(() => {
    if (!focusMessageId) return;
    const targetMsg = messages.find((m) => m.id === focusMessageId);
    if (targetMsg) {
      const targetScope = getMessageRoomScope(targetMsg);
      if (targetScope === 'global') {
        onSyncChatRoomSilently?.('global');
      } else {
        const sender = userByIdMap.get(targetMsg.senderId);
        const msgCountry =
          normalizeCountryCode(targetMsg.countryCode) ||
          normalizeCountryCode(sender?.countryCode) ||
          activeCountryCode;
        if (isModOrAdmin) {
          onSyncChatRoomSilently?.('local', msgCountry);
        } else if (msgCountry === activeCountryCode) {
          onSyncChatRoomSilently?.('local', activeCountryCode);
        }
      }
      if (isModOrAdmin) {
        setIsChatCollapsed(false);
      }
    }
    const timer = window.setTimeout(() => {
      scrollToMessage(focusMessageId);
      onClearFocusMessage?.();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [focusMessageId, messages, userByIdMap, activeCountryCode, isModOrAdmin, onSyncChatRoomSilently, onClearFocusMessage]);

  // Close members dropdown or moderator rooms dropdown on Escape / outside click
  useEffect(() => {
    if (!membersOpen && !roomsMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMembersOpen(false);
        setRoomsMenuOpen(false);
      }
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (
        roomsMenuOpen &&
        roomsDropdownRef.current &&
        !roomsDropdownRef.current.contains(e.target as Node)
      ) {
        setRoomsMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [membersOpen, roomsMenuOpen]);

  const handleStreamScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distFromBottom < 100;
    isNearBottomRef.current = nearBottom;
    if (nearBottom && unreadBelowCount > 0) {
      setUnreadBelowCount(0);
    }
  };

  // Split active members into Online and Offline, sorted strictly by Rank
  const { onlineMembers, offlineMembers } = useMemo(() => {
    const sortByRankThenName = (a: UserProfile, b: UserProfile) => {
      const aRoles = getUserRoles(a);
      const bRoles = getUserRoles(b);
      const rankDiff = getRoleHierarchyOrder(aRoles[0]) - getRoleHierarchyOrder(bRoles[0]);
      if (rankDiff !== 0) return rankDiff;
      const secondDiff =
        (aRoles[1] ? getRoleHierarchyOrder(aRoles[1]) : 99) -
        (bRoles[1] ? getRoleHierarchyOrder(bRoles[1]) : 99);
      if (secondDiff !== 0) return secondDiff;
      return a.displayName.localeCompare(b.displayName, 'ar');
    };

    const online: UserProfile[] = [];
    const offline: UserProfile[] = [];

    activeUsers.forEach((member) => {
      const liveMeta = getEffectiveLiveStatus(
        member,
        member.uid === currentUser.uid && currentUser.liveStatus !== 'offline',
        nowTick
      );
      if (liveMeta.status !== 'offline') {
        online.push(member);
      } else {
        offline.push(member);
      }
    });

    online.sort(sortByRankThenName);
    offline.sort(sortByRankThenName);

    return { onlineMembers: online, offlineMembers: offline };
  }, [activeUsers, currentUser.uid, currentUser.liveStatus, nowTick]);

  // Candidates for @mention autocomplete
  const mentionSuggestions = useMemo(() => {
    if (!mentionQuery) return [];
    const q = mentionQuery.query.trim().toLowerCase();
    const candidates = [...onlineMembers, ...offlineMembers].filter(
      (u) => u.uid !== currentUser.uid
    );
    if (!q) return candidates.slice(0, 6);
    return candidates
      .filter((u) => {
        const handle = getUserHandle(u).toLowerCase();
        const name = u.displayName.toLowerCase();
        return handle.includes(q) || name.includes(q);
      })
      .slice(0, 6);
  }, [mentionQuery, onlineMembers, offlineMembers, currentUser.uid]);

  useEffect(() => {
    setMentionSelectedIdx(0);
  }, [mentionQuery?.query]);

  const applyMentionSelection = (targetUser: UserProfile) => {
    const handle = getUserHandle(targetUser);
    const active = mentionQuery;
    if (active) {
      const prefix = text.slice(0, active.start);
      const suffix = text.slice(active.end);
      const needsSpaceAfter = suffix.startsWith(' ') ? '' : ' ';
      const nextValue = `${prefix}@${handle}${needsSpaceAfter}${suffix}`;
      const nextCaret = prefix.length + 1 + handle.length + needsSpaceAfter.length;
      setText(nextValue.slice(0, 1000));
      setMentionQuery(null);
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.setSelectionRange(nextCaret, nextCaret);
        }
      });
    } else {
      insertMentionToken(targetUser);
    }
  };

  const insertMentionToken = useCallback((targetUser: UserProfile) => {
    const handle = getUserHandle(targetUser);
    setText((prev) => {
      const separator = prev.length > 0 && !prev.endsWith(' ') ? ' ' : '';
      return `${prev}${separator}@${handle} `.slice(0, 1000);
    });
    setMentionQuery(null);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  const handleOpenSender = useCallback(
    (senderProfile: UserProfile | undefined, senderId: string) => {
      if (senderProfile) {
        setQuickMemberError(null);
        setQuickMember(senderProfile);
      } else {
        onOpenProfile(senderId);
      }
    },
    [onOpenProfile]
  );

  const handleMsgHandleClick = useCallback(
    (senderProfile: UserProfile | undefined, senderId: string, isOwn: boolean) => {
      if (senderProfile && !isOwn) {
        insertMentionToken(senderProfile);
      } else {
        onOpenProfile(senderId);
      }
    },
    [insertMentionToken, onOpenProfile]
  );

  const handleOpenMentionPicker = () => {
    const input = inputRef.current;
    const pos = input?.selectionStart ?? text.length;
    const before = text.slice(0, pos);
    const after = text.slice(pos);
    const needsSpace = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
    const nextText = `${before}${needsSpace}@${after}`.slice(0, 1000);
    const nextCaret = before.length + needsSpace.length + 1;
    setText(nextText);
    setMentionQuery(detectMentionAtCaret(nextText, nextCaret));
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(nextCaret, nextCaret);
      }
    });
  };

  const stopTypingNow = () => {
    if (typingIdleTimerRef.current) {
      window.clearTimeout(typingIdleTimerRef.current);
      typingIdleTimerRef.current = null;
    }
    if (activeTypingRoomRef.current) {
      activeTypingRoomRef.current = null;
      lastTypingSentAtRef.current = 0;
      void setRoomTypingStatus(activeRoomKey, roomMode, currentUser, false);
    }
  };

  const handleComposerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = e.target.value;
    const pos = e.target.selectionStart ?? nextVal.length;
    setText(nextVal);
    setMentionQuery(detectMentionAtCaret(nextVal, pos));

    if (currentUser.isMuted || currentUser.isKicked || currentUser.isBanned) return;
    if (!nextVal.trim()) {
      stopTypingNow();
      return;
    }
    const now = Date.now();
    activeTypingRoomRef.current = { roomKey: activeRoomKey, scope: roomMode };
    if (now - lastTypingSentAtRef.current >= 2200) {
      lastTypingSentAtRef.current = now;
      void setRoomTypingStatus(activeRoomKey, roomMode, currentUser, true);
    }
    if (typingIdleTimerRef.current) {
      window.clearTimeout(typingIdleTimerRef.current);
    }
    typingIdleTimerRef.current = window.setTimeout(() => {
      stopTypingNow();
    }, 3200);
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (mentionSuggestions.length > 0 && mentionQuery) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionSelectedIdx((i) => (i + 1) % mentionSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionSelectedIdx(
          (i) => (i - 1 + mentionSuggestions.length) % mentionSuggestions.length
        );
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const chosen = mentionSuggestions[mentionSelectedIdx] || mentionSuggestions[0];
        if (chosen) applyMentionSelection(chosen);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === 'Escape' && replyingTo) {
      setReplyingTo(null);
    }
  };

  const handleStartReply = useCallback((msg: CommunityMessage) => {
    setReplyingTo(msg);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  const handleStartEdit = useCallback((msg: CommunityMessage) => {
    setEditingMsgId(msg.id);
    setEditingText(msg.text);
  }, []);
  const handleCancelEdit = useCallback(() => {
    setEditingMsgId(null);
  }, []);

  const handleSetMyLiveStatus = async (nextStatus: MemberLiveStatus) => {
    if (onChangeLiveStatus) {
      await onChangeLiveStatus(nextStatus);
      return;
    }
    try {
      const updates: Record<string, unknown> = {
        liveStatus: nextStatus,
        isOnline: nextStatus !== 'offline',
        lastActiveAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (isBarberMember(currentUser)) {
        updates.availability = nextStatus === 'cutting' ? 'busy' : 'available';
      }
      await updateDoc(doc(db, 'users', currentUser.uid), updates);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentUser.isMuted || currentUser.isKicked || currentUser.isBanned) return;
    const cleanText = sanitizePlainText(text, MAX_TEXT_LENGTHS.chatMessage);
    if (!cleanText) {
      setSendError('الرسالة فارغة أو تحتوي على أحرف غير صالحة.');
      return;
    }
    const rate = checkActionRateLimit(`community_msg_${currentUser.uid}`, {
      cooldownMs: 1200,
      maxInWindow: 12,
      windowMs: 60000,
    });
    if (!rate.allowed) {
      setSendError(rate.message || 'يرجى التمهل قليلاً قبل إرسال رسالة أخرى.');
      return;
    }

    setSendError(null);
    setSending(true);
    const activeReply = replyingTo;

    try {
      const msgId = createSafeId('cmsg');
      const mentionedUsers = extractMentionedUsers(
        cleanText,
        activeUsers,
        currentUser.uid
      );
      const mentionUids = mentionedUsers.map((u) => u.uid);

      const payload: Record<string, unknown> = {
        id: msgId,
        senderId: currentUser.uid,
        senderName: sanitizePlainText(currentUser.displayName, MAX_TEXT_LENGTHS.displayName) || currentUser.displayName,
        senderUsername: myHandle,
        senderPhoto: currentUser.photoURL || '',
        senderRole: getPrimaryRole(currentUser),
        text: cleanText,
        edited: false,
        roomType: roomMode,
        countryCode: roomMode === 'local' ? effectiveLocalCountry : activeCountryCode,
        visibility: 'public',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (mentionUids.length > 0) {
        payload.mentions = mentionUids;
      }

      if (activeReply) {
        const replySenderProfile = findUser(activeReply.senderId);
        const replyHandle =
          activeReply.senderUsername ||
          (replySenderProfile ? getUserHandle(replySenderProfile) : 'member');
        payload.replyToId = activeReply.id;
        payload.replyToSenderId = activeReply.senderId;
        payload.replyToSenderName = sanitizePlainText(
          replySenderProfile?.displayName || activeReply.senderName,
          80
        );
        payload.replyToSenderUsername = replyHandle.slice(0, 24);
        payload.replyToText = sanitizePlainText(activeReply.text, 200);
      }

      await setDoc(doc(db, 'communityMessages', msgId), payload);
      setText('');
      setMentionQuery(null);
      setReplyingTo(null);
      stopTypingNow();

      // Dispatch targeted notifications for Direct Replies and @Mentions (up to 5 unique recipients)
      const notifyTargets = new Map<string, { isReply: boolean }>();
      if (activeReply && activeReply.senderId !== currentUser.uid) {
        notifyTargets.set(activeReply.senderId, { isReply: true });
      }
      for (const mUser of mentionedUsers) {
        if (!notifyTargets.has(mUser.uid)) {
          notifyTargets.set(mUser.uid, { isReply: false });
        }
      }

      const roomNotifLabel =
        roomMode === 'global'
          ? 'الدردشة العامة العالمية'
          : `دردشة ${targetCountryMeta?.nameAr || effectiveLocalCountry}`;

      const notifEntries = Array.from(notifyTargets.entries()).slice(0, 5);
      await Promise.all([
        awardAureliusCoins(currentUser.uid, currentUser.points, 2),
        ...notifEntries.map(([recipientId, meta]) => {
          const notifId = createSafeId('ntf');
          return setDoc(doc(db, 'notifications', notifId), {
            id: notifId,
            recipientId,
            senderId: currentUser.uid,
            senderName: sanitizePlainText(currentUser.displayName, MAX_TEXT_LENGTHS.displayName) || currentUser.displayName,
            type: 'message',
            title: meta.isReply
              ? `رد مباشر من ${sanitizePlainText(currentUser.displayName, 40)}`
              : `إشارة (@${myHandle}) في ${roomNotifLabel}`,
            body: cleanText.slice(0, 140),
            targetView: 'community',
            targetId: msgId,
            read: false,
            createdAt: serverTimestamp(),
          }).catch(() => {});
        }),
      ]);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'communityMessages');
    } finally {
      setSending(false);
    }
  };

  const handleSaveEdit = useCallback(async (msg: CommunityMessage) => {
    const cleanText = sanitizePlainText(editingTextRef.current, MAX_TEXT_LENGTHS.chatMessage);
    if (!cleanText) return;
    try {
      await updateDoc(doc(db, 'communityMessages', msg.id), {
        text: cleanText,
        edited: true,
        updatedAt: serverTimestamp(),
      });
      setEditingMsgId(null);
      setEditingText('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `communityMessages/${msg.id}`);
    }
  }, []);

  const handleDeleteMessage = async (msgId: string) => {
    try {
      await deleteDoc(doc(db, 'communityMessages', msgId));
      setConfirmDeleteMsg(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `communityMessages/${msgId}`);
    }
  };

  const handleAcknowledgeKick = async () => {
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        isKicked: false,
        kickReason: '',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  const openModModal = useCallback((type: ModerationActionType, target: UserProfile) => {
    setModModal({ type, target });
    setModReason('');
    setSelectedRoles(hasRole(target, 'admin') ? ['customer'] : getUserRoles(target));
  }, []);

  const handleReportMessage = useCallback(
    (msg: CommunityMessage) => {
      onOpenReport?.({
        targetType: 'message',
        targetId: msg.id,
        targetOwnerId: msg.senderId,
        targetOwnerName: msg.senderName,
        targetPreview: msg.text.slice(0, 120),
      });
    },
    [onOpenReport]
  );

  const handleConfirmModeration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modModal) return;
    const { type, target } = modModal;
    if (!canActorModerateTarget(currentUser, target, isSuperAdmin)) {
      setModModal(null);
      return;
    }
    setModSubmitting(true);
    try {
      if (type === 'role' && isSuperAdmin) {
        await assignMemberRoles(
          currentUser,
          target,
          selectedRoles,
          'مباشرة من الدردشة العامة'
        );
        setModModal(null);
        return;
      }

      const userRef = doc(db, 'users', target.uid);
      const cleanReason =
        sanitizePlainText(modReason, MAX_TEXT_LENGTHS.moderationReason) ||
        'مخالفة قوانين الدردشة';
      let actionTitle = '';

      if (type === 'mute') {
        await updateDoc(userRef, {
          isMuted: true,
          muteReason: cleanReason,
          updatedAt: serverTimestamp(),
        });
        actionTitle = 'كتم مستخدم من الدردشة العامة';
      } else if (type === 'kick') {
        await updateDoc(userRef, {
          isKicked: true,
          kickReason: cleanReason,
          updatedAt: serverTimestamp(),
        });
        actionTitle = 'طرد مستخدم من الدردشة العامة';
      } else if (type === 'ban') {
        await updateDoc(userRef, {
          isBanned: true,
          banReason: cleanReason,
          updatedAt: serverTimestamp(),
        });
        actionTitle = 'حظر نهائي للمستخدم';
      }

      const logId = createSafeId('log');
      await setDoc(doc(db, 'activityLogs', logId), {
        id: logId,
        actorId: currentUser.uid,
        actorName: currentUser.displayName,
        action: actionTitle,
        targetUserId: target.uid,
        targetUserName: target.displayName,
        reason: cleanReason,
        createdAt: serverTimestamp(),
      });

      const notifId = createSafeId('ntf');
      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        recipientId: target.uid,
        senderId: currentUser.uid,
        senderName: currentUser.displayName,
        type: 'moderation',
        title: 'إجراء إشرافي',
        body: `${actionTitle}: ${cleanReason}`,
        targetView: 'community',
        targetId: target.uid,
        read: false,
        createdAt: serverTimestamp(),
      });

      setModModal(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${target.uid}`);
    } finally {
      setModSubmitting(false);
    }
  };

  const renderMessageTextWithMentions = (rawText: string) => {
    const segments = parseMessageTextSegments(rawText);
    return segments.map((seg, idx) => {
      if (seg.type !== 'mention' || !seg.handle) {
        return <React.Fragment key={idx}>{seg.value}</React.Fragment>;
      }
      const matchedUser = handleToUserMap.get(seg.handle.toLowerCase());
      const isMe = seg.handle.toLowerCase() === myHandle.toLowerCase();
      if (!matchedUser) {
        return (
          <span key={idx} dir="ltr" className="text-[#D4A853] font-semibold">
            {seg.value}
          </span>
        );
      }
      return (
        <button
          key={idx}
          type="button"
          dir="ltr"
          onClick={() => onOpenProfile(matchedUser.uid)}
          title={`فتح ملف ${matchedUser.displayName}`}
                       className={`inline font-mono-num font-bold hover:underline cursor-pointer rounded px-1 py-0.25 transition-colors ${
            isMe
              ? 'bg-[#D4A853]/25 text-[#FCE08B]'
              : 'bg-[#D4A853]/12 text-[#D4A853] hover:bg-[#D4A853]/22'
          }`}
        >
          @{seg.handle}
        </button>
      );
    });
  };

  const renderMemberRow = (member: UserProfile, isSelfOrActive: boolean) => {
    const memberRoles = getUserRoles(member);
    const primaryRole = memberRoles[0];
    const meta = getRoleMeta(primaryRole);
    const memberHandle = getUserHandle(member, nowTick);
    const liveMeta = getEffectiveLiveStatus(
      member,
      member.uid === currentUser.uid && isSelfOrActive,
      nowTick
    );
    const levelInfo = getCommunityLevel(member.points);

    return (
      <div
        key={member.uid}
        className={`flex items-center justify-between gap-2 p-2.5 rounded-xl hover:bg-[#1A1A22] transition-colors ${meta.rowAccentClass}`}
      >
        <button
          type="button"
          onClick={() => {
            setMembersOpen(false);
            onOpenProfile(member.uid);
          }}
          className="flex items-center gap-2.5 min-w-0 text-right cursor-pointer"
        >
          <div className="relative shrink-0">
            <Avatar
              src={member.photoURL}
              name={member.displayName}
              size="sm"
              role={primaryRole}
              roles={memberRoles}
              avatarFrame={member.avatarFrame}
              avatarFrameExpiresAt={member.avatarFrameExpiresAt}
            />
            <span
              aria-hidden="true"
              className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-[#141419] ${liveMeta.dotClass}`}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-xs font-bold truncate ${getEffectiveNameColorClass(member, primaryRole)}`}>
                {member.displayName}
              </span>
              <CountryFlag
                code={member.countryCode || activeCountryCode}
                size="xs"
              />
              <span dir="ltr" className="text-[10px] font-mono-num text-[#D4A853]/85">
                @{memberHandle}
              </span>
              <VipSilverStar roles={memberRoles} size="xs" />
              <RoleBadgesList roles={memberRoles} size="xs" compact />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap mt-1 text-[10px]">
              <span className={`font-semibold inline-flex items-center gap-1 ${liveMeta.textClass}`}>
                {liveMeta.status === 'cutting' && <Scissors className="w-2.5 h-2.5" />}
                {liveMeta.status === 'offline'
                  ? `أوفلاين · آخر ظهور ${formatLastSeen(member.lastActiveAt, nowTick)}`
                  : liveMeta.label}
              </span>
              <span aria-hidden="true" className="text-[#454552]">·</span>
              <span className={`font-semibold ${levelInfo.textColorClass}`}>
                {levelInfo.title}
              </span>
            </div>
          </div>
        </button>

        {member.uid !== currentUser.uid && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                setMembersOpen(false);
                insertMentionToken(member);
              }}
              title={`إشارة @${memberHandle} في الدردشة`}
              className="px-2 py-1.5 rounded-lg bg-[#1A1A22] hover:bg-[#D4A853]/20 text-[11px] font-mono-num font-bold text-[#D4A853] transition-colors cursor-pointer"
            >
              @
            </button>
            <button
              type="button"
              onClick={() => {
                setMembersOpen(false);
                onStartPrivateChat(member);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-[#1E1E26] hover:bg-[#D4A853] hover:text-[#0B0B0E] text-[11px] font-semibold text-[#D6D1C7] transition-colors cursor-pointer"
            >
              مراسلة
            </button>
          </div>
        )}
      </div>
    );
  };

  const sortedCountriesForStaff = useMemo(() => {
    const q = roomsSearch.trim().toLowerCase();
    return COUNTRIES.filter((c) => {
      if (!q) return true;
      return (
        c.nameAr.toLowerCase().includes(q) ||
        c.nameEn.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q)
      );
    }).sort((a, b) => {
      if (a.code === activeCountryCode) return -1;
      if (b.code === activeCountryCode) return 1;
      const aActivity =
        (roomDirectoryStats.countryMsgCounts.get(a.code) || 0) * 10 +
        (roomDirectoryStats.countryOnlineCounts.get(a.code) || 0);
      const bActivity =
        (roomDirectoryStats.countryMsgCounts.get(b.code) || 0) * 10 +
        (roomDirectoryStats.countryOnlineCounts.get(b.code) || 0);
      if (aActivity !== bActivity) return bActivity - aActivity;
      return a.nameAr.localeCompare(b.nameAr, 'ar');
    });
  }, [roomsSearch, activeCountryCode, roomDirectoryStats]);

  const localRoomCountForActiveCountry =
    roomDirectoryStats.countryMsgCounts.get(effectiveLocalCountry) || 0;
  const isInspectingForeignCountry =
    isModOrAdmin && roomMode === 'local' && effectiveLocalCountry !== activeCountryCode;

  return (
    <div className="relative flex-1 min-h-0 w-full max-w-[100vw] h-full flex flex-col bg-[#0D0D12] overflow-hidden">
      {/* Compact Top Chat Header with Smart Back, Moderator Collapse/Hide & Members Toggle */}
      <div className="relative z-40 shrink-0 px-3 sm:px-6 py-2.5 border-b border-[#22222B] bg-[#121218] flex items-center justify-between gap-2 max-w-full overflow-x-hidden">
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
          {canGoBack && onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={backLabel ? `العودة إلى ${backLabel}` : 'رجوع'}
              title={backLabel ? `العودة إلى ${backLabel}` : 'رجوع'}
              className="min-h-[38px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#1A1A22] hover:bg-[#24242F] border border-[#2C2C35] text-xs font-bold text-[#F5F2EB] inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
            >
              <ArrowRight className="w-4 h-4 text-[#D4A853] shrink-0" />
              <span className="hidden sm:inline shrink-0">رجوع</span>
              {backLabel && (
                <span className="hidden md:inline text-[#9C968B] font-medium truncate max-w-[140px]">
                  · إلى {backLabel}
                </span>
              )}
            </button>
          )}
          <div className="w-8 h-8 rounded-xl bg-[#D4A853]/12 text-[#D4A853] flex items-center justify-center shrink-0">
            {roomMode === 'global' ? (
              <Globe className="w-4 h-4" />
            ) : (
              <MessageSquare className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-sm sm:text-base font-bold text-[#F5F2EB] truncate">
                {roomMode === 'global'
                  ? 'الدردشة العامة (كل الدول)'
                  : `دردشة ${targetCountryMeta?.nameAr || effectiveLocalCountry}`}
              </h1>
              {roomMode === 'local' ? (
                <CountryFlag code={effectiveLocalCountry} size="xs" />
              ) : (
                <span className="text-[11px] font-semibold text-sky-300 whitespace-nowrap">
                  عالمية
                </span>
              )}
              <span dir="ltr" className="text-[11px] font-mono-num text-[#D4A853] inline-flex items-center gap-0.5 whitespace-nowrap">
                {isMySpecialActive && <Sparkles className="w-3 h-3 text-[#FCE08B]" />}
                @{myHandle}
              </span>
            </div>
            <p className="hidden sm:block text-[11px] text-[#9C968B] truncate">
              {roomMode === 'global'
                ? 'ساحة نقاش عالمية تجمع حلاقين وزبائن أوريليوس من جميع الدول'
                : `دردشة المجتمع المحلي في ${targetCountryMeta?.nameAr || effectiveLocalCountry} · اضغط «رد» أو اكتب @ للمنشن`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <span className="hidden md:inline text-xs font-mono-num text-[#8B857B] pl-1">
            {sortedMessages.length} رسالة
          </span>

          {/* Moderator & Admin Quick Collapse / Hide Chat Toggle */}
          {isModOrAdmin && (
            <button
              type="button"
              onClick={toggleChatCollapse}
              aria-pressed={chatCollapsed}
              title={
                chatCollapsed
                  ? 'إظهار واجهة الشات مجدداً'
                  : 'إخفاء / طي محتوى الدردشة لمنع ازدحام الشاشة'
              }
              className={`min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                chatCollapsed
                  ? 'bg-[#D4A853] border-[#D4A853] text-[#0B0B0E]'
                  : 'bg-[#1A1A22] hover:bg-[#24242F] border-[#2C2C35] text-[#F5F2EB]'
              }`}
            >
              {chatCollapsed ? (
                <>
                  <Eye className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">إظهار الشات</span>
                  <span className="sm:hidden">إظهار</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-4 h-4 shrink-0 text-[#D4A853]" />
                  <span className="hidden sm:inline">إخفاء الشات</span>
                  <span className="sm:hidden">إخفاء</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onOpenTickets}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1A1A22] hover:bg-[#24242F] border border-[#2C2C35] text-[11px] font-semibold text-[#D4A853] transition-colors whitespace-nowrap cursor-pointer"
          >
            <LifeBuoy className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">تكت</span>
          </button>

          {/* Compact Top-Corner Members Toggle Button */}
          {!chatCollapsed && (
            <button
              type="button"
              onClick={() => setMembersOpen((v) => !v)}
              aria-expanded={membersOpen}
              aria-haspopup="dialog"
              aria-label="عرض أو إخفاء أعضاء المنصة"
              title={
                roomMode === 'global'
                  ? 'أعضاء المنصة حول العالم'
                  : `أعضاء مجتمع ${targetCountryMeta?.nameAr || effectiveLocalCountry}`
              }
              className={`min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                membersOpen
                  ? 'bg-[#D4A853] border-[#D4A853] text-[#0B0B0E]'
                  : 'bg-[#1A1A22] hover:bg-[#24242F] border-[#2C2C35] text-[#F5F2EB]'
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">الأعضاء</span>
              <span
                className={`font-mono-num font-extrabold ${
                  membersOpen ? 'text-[#0B0B0E]' : 'text-emerald-400'
                }`}
              >
                {onlineMembers.length}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Dual Smart Chat Room Switcher + Private Messages (الخاص) + Moderator All-Countries Room Selector */}
      <div className="relative z-30 shrink-0 px-3 sm:px-6 py-2 border-b border-[#202029] bg-[#101016] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 p-1 bg-[#16161F] border border-[#252531] rounded-xl overflow-x-auto max-w-full">
          <button
            type="button"
            onClick={() =>
              onChangeChatRoom('local', isModOrAdmin ? effectiveLocalCountry : activeCountryCode)
            }
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
              roomMode === 'local'
                ? 'bg-[#D4A853] text-[#0B0B0E]'
                : 'text-[#B6B0A4] hover:text-[#F5F2EB]'
            }`}
          >
            <CountryFlag code={effectiveLocalCountry} size="xs" />
            <span>دردشة {targetCountryMeta?.nameAr || effectiveLocalCountry}</span>
            <span
              className={`font-mono-num text-[10px] ${
                roomMode === 'local' ? 'text-[#0B0B0E]/80' : 'text-[#8B857B]'
              }`}
            >
              ({localRoomCountForActiveCountry})
            </span>
          </button>

          <button
            type="button"
            onClick={() => onChangeChatRoom('global')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
              roomMode === 'global'
              ? 'bg-[#D4A853] text-[#0B0B0E]'
                : 'text-[#B6B0A4] hover:text-[#F5F2EB]'
            }`}
          >
            <Globe className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">الدردشة العامة (كل الدول)</span>
            <span className="sm:hidden">العامة</span>
            <span
              className={`font-mono-num text-[10px] ${
                roomMode === 'global' ? 'text-[#0B0B0E]/80' : 'text-[#8B857B]'
              }`}
            >
              ({roomDirectoryStats.globalMsgCount})
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenPrivateMessages}
            title="فتح المحادثات الخاصة"
            className="group px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer text-[#E5DEC9] hover:text-[#0B0B0E] hover:bg-[#D4A853]"
          >
            <MessageCircle className="w-3.5 h-3.5 shrink-0 text-[#D4A853] group-hover:text-[#0B0B0E]" />
            <span>الخاص</span>
            {privateConversationsCount > 0 && (
              <span className="font-mono-num text-[10px] text-[#D4A853] group-hover:text-[#0B0B0E]">
                ({privateConversationsCount})
              </span>
            )}
          </button>
        </div>

        {/* Moderator & Super Admin Full Room Access (All Countries + Global) */}
        {isModOrAdmin && (
          <div className="flex items-center gap-2 flex-wrap" ref={roomsDropdownRef}>
            {isInspectingForeignCountry && (
              <button
                type="button"
                onClick={() => onChangeChatRoom('local', activeCountryCode)}
                className="px-2.5 py-1.5 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-400/40 text-[11px] font-bold text-indigo-200 transition-colors cursor-pointer whitespace-nowrap"
              >
                العودة لغرفتي ({getCountryByCode(activeCountryCode)?.nameAr || activeCountryCode})
              </button>
            )}

            <div className="relative">
              <button
                type="button"
                onClick={() => setRoomsMenuOpen((v) => !v)}
                aria-expanded={roomsMenuOpen}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                  roomsMenuOpen
                    ? 'bg-indigo-500 border-indigo-400 text-white'
                    : 'bg-[#161620] hover:bg-[#1E1E2B] border-indigo-400/35 text-indigo-200'
                }`}
              >
                <Shield className="w-3.5 h-3.5 shrink-0" />
                <span>غرف كافة الدول ({COUNTRIES.length + 1})</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${
                    roomsMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {roomsMenuOpen && (
                <>
                  <div
                    aria-hidden="true"
                    onClick={() => setRoomsMenuOpen(false)}
                    className="fixed inset-0 z-40 bg-black/45 sm:bg-transparent"
                  />
                  <div className="fixed top-[68px] inset-x-3 sm:inset-x-auto sm:left-6 z-50 w-auto sm:w-96 max-w-[calc(100vw-24px)] bg-[#14141B] border border-[#2F2F3D] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[75dvh]">
                    <div className="px-3.5 py-3 border-b border-[#23232E] bg-[#181822] space-y-2.5 shrink-0">
                      <div className="flex items-center justify-between gap-2 text-xs font-bold text-[#F5F2EB]">
                        <span className="inline-flex items-center gap-1.5 min-w-0">
                          <Shield className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
                          <span className="truncate">إشراف كافة غرف الدردشة</span>
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-mono-num text-[#9C968B] whitespace-nowrap">
                            عامة + {COUNTRIES.length} دولة
                          </span>
                          <button
                            type="button"
                            onClick={() => setRoomsMenuOpen(false)}
                            aria-label="إغلاق قائمة الغرف"
                            className="p-1 rounded-lg bg-[#222230] text-[#9C968B] hover:text-white cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-[#8B857B] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={roomsSearch}
                          onChange={(e) => setRoomsSearch(e.target.value)}
                          placeholder="ابحث عن غرفة دولة..."
                          className="w-full bg-[#101016] border border-[#282834] focus:border-indigo-400 rounded-xl pr-9 pl-3 py-2 text-xs text-[#F5F2EB] placeholder:text-[#6B665E] outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-[#1E1E27] p-2 space-y-0.5">
                      {/* Global Chat Option */}
                      <button
                        type="button"
                        onClick={() => {
                          onChangeChatRoom('global');
                          setRoomsMenuOpen(false);
                        }}
                        className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between gap-2 text-right transition-colors cursor-pointer ${
                          roomMode === 'global'
                            ? 'bg-[#D4A853] text-[#0B0B0E] font-extrabold'
                            : 'hover:bg-[#1D1D27] text-[#F5F2EB]'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2 min-w-0 flex-1">
                          <Globe
                            className={`w-4 h-4 shrink-0 ${
                              roomMode === 'global' ? 'text-[#0B0B0E]' : 'text-sky-400'
                            }`}
                          />
                          <span className="text-xs font-bold truncate">
                            الدردشة العامة (العالمية)
                          </span>
                        </span>
                        <span
                          className={`text-[11px] font-mono-num shrink-0 whitespace-nowrap ${
                            roomMode === 'global' ? 'text-[#0B0B0E]/85 font-bold' : 'text-emerald-400'
                          }`}
                        >
                          {roomDirectoryStats.globalOnlineCount} متصل
                        </span>
                      </button>

                      {/* Every Country Room */}
                      {sortedCountriesForStaff.map((country) => {
                        const onlineCount =
                          roomDirectoryStats.countryOnlineCounts.get(country.code) || 0;
                        const isCurrentRoom =
                          roomMode === 'local' && effectiveLocalCountry === country.code;

                        return (
                          <button
                            key={country.code}
                            type="button"
                            onClick={() => {
                              onChangeChatRoom('local', country.code);
                              setRoomsMenuOpen(false);
                            }}
                            className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between gap-2 text-right transition-colors cursor-pointer ${
                              isCurrentRoom
                                ? 'bg-[#D4A853] text-[#0B0B0E] font-extrabold'
                                : 'hover:bg-[#1D1D27] text-[#F5F2EB]'
                            }`}
                          >
                            <span className="inline-flex items-center gap-2 min-w-0 flex-1">
                              <CountryFlag code={country.code} size="xs" />
                              <span className="text-xs font-semibold truncate">
                                {country.nameAr}
                              </span>
                              {country.code === activeCountryCode && (
                                <span
                                  className={`text-[10px] shrink-0 whitespace-nowrap ${
                                    isCurrentRoom ? 'text-[#0B0B0E]/80' : 'text-[#D4A853]'
                                  }`}
                                >
                                  (بلدك)
                                </span>
                              )}
                            </span>
                            <span
                              className={`text-[11px] font-mono-num shrink-0 whitespace-nowrap ${
                                isCurrentRoom
                                  ? 'text-[#0B0B0E]/85 font-bold'
                                  : onlineCount > 0
                                    ? 'text-emerald-400'
                                    : 'text-[#8B857B]'
                              }`}
                            >
                              {onlineCount} متصل
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Collapsed / Hidden Moderator View OR Kick Notice OR Full Edge-to-Edge Live Chat Workspace */}
      {chatCollapsed ? (
        <div className="flex-1 min-h-0 flex items-start justify-center p-4 sm:p-8 bg-[#0B0B0E]">
          <div className="w-full max-w-2xl bg-[#141419] border border-[#2A2A35] rounded-2xl p-6 text-center space-y-4 shadow-xl">
            <div className="w-12 h-12 rounded-2xl bg-[#D4A853]/12 text-[#D4A853] flex items-center justify-center mx-auto">
              <EyeOff className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base sm:text-lg font-extrabold text-[#F5F2EB]">
                تم إخفاء وطي واجهة الدردشة مؤقتاً
              </h2>
              <p className="text-xs text-[#9C968B] leading-relaxed">
                الغرفة المحددة حالياً:{' '}
                <strong className="text-[#F5F2EB]">
                  {roomMode === 'global'
                    ? 'الدردشة العامة (كل الدول)'
                    : `دردشة ${targetCountryMeta?.nameAr || effectiveLocalCountry}`}
                </strong>
                {' · '}
                <span className="font-mono-num">{sortedMessages.length} رسالة</span>
                {' · '}
                <span className="font-mono-num text-emerald-400">
                  {onlineMembers.length} متصل
                </span>
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={toggleChatCollapse}
                className="min-h-[42px] px-5 py-2.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] font-extrabold text-xs inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Eye className="w-4 h-4" />
                <span>إظهار الدردشة الآن</span>
              </button>
              <button
                type="button"
                onClick={onOpenTickets}
                className="min-h-[42px] px-4 py-2.5 rounded-xl bg-[#1C1C24] hover:bg-[#252532] border border-[#2C2C35] text-xs font-bold text-[#F5F2EB] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <LifeBuoy className="w-4 h-4 text-[#D4A853]" />
                <span>مركز التكتات والشكاوى</span>
              </button>
            </div>
          </div>
        </div>
      ) : currentUser.isKicked ? (
        <div className="relative flex-1 min-h-0 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#1A1A22] border border-amber-500/40 rounded-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center mx-auto">
              <UserX className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-[#F5F2EB]">تم طردك من الدردشة العامة</h2>
            <p className="text-xs text-[#D6D1C7] leading-relaxed">
              السبب: {currentUser.kickReason || 'مخالفة قواعد المحادثة'}
            </p>
            <button
              type="button"
              onClick={handleAcknowledgeKick}
              className="px-5 py-2.5 rounded-xl bg-[#D4A853] text-[#0B0B0E] text-xs font-bold hover:bg-[#E0B96B] cursor-pointer"
            >
              أتعهد بالالتزام — إعادة الدخول للدردشة
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Stream Area + Floating Members Dropdown Drawer */}
          <div className="relative flex-1 min-h-0 flex flex-col">
            {/* Scrollable Edge-to-Edge Messages Stream */}
            <div
              ref={messagesContainerRef}
              onScroll={handleStreamScroll}
              className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-6 lg:px-10 py-3 space-y-1.5 scroll-smooth"
            >
              {!usersReady && users.length === 0 && sortedMessages.length > 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-[#8B857B] space-y-2">
                  <MessageSquare className="w-7 h-7 opacity-40 animate-pulse" />
                  <p className="text-xs">جاري تحميل المحادثة...</p>
                </div>
              ) : sortedMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-[#8B857B] space-y-2">
                  {roomMode === 'global' ? (
                    <Globe className="w-8 h-8 opacity-40" />
                  ) : (
                    <MessageSquare className="w-8 h-8 opacity-40" />
                  )}
                  <p className="text-sm">
                    {roomMode === 'global'
                      ? 'لا توجد رسائل في الدردشة العامة العالمية بعد. ابدأ التفاعل مع الحلاقين والأعضاء حول العالم!'
                      : `لا توجد رسائل في دردشة ${targetCountryMeta?.nameAr || 'هذا البلد'} بعد. ابدأ التحية مع الأعضاء والحلاقين المحليين!`}
                  </p>
                </div>
              ) : (
                sortedMessages.map((msg, idx) => {
                  const prevMsg = idx > 0 ? sortedMessages[idx - 1] : null;
                  const isGroupedWithPrev = Boolean(
                    prevMsg &&
                      prevMsg.senderId === msg.senderId &&
                      !msg.replyToId &&
                      tsToMillis(msg.createdAt) - tsToMillis(prevMsg.createdAt) <
                        3 * 60 * 1000
                  );

                  const isOwn = msg.senderId === currentUser.uid;
                  const senderProfile = isOwn ? currentUser : findUser(msg.senderId);
                  const senderRoles = senderProfile
                    ? getUserRoles(senderProfile)
                    : [msg.senderRole];
                  const displayRole = senderRoles[0];
                  const senderRolesKey = senderRoles.join('|');
                  const senderDisplayName = senderProfile?.displayName || msg.senderName;
                  const senderHandle = senderProfile
                    ? getUserHandle(senderProfile, nowTick)
                    : msg.senderUsername ||
                      getUserHandle(
                        { uid: msg.senderId, displayName: msg.senderName },
                        nowTick
                      );
                  const senderCountryCode =
                    normalizeCountryCode(senderProfile?.countryCode || msg.countryCode) || '';
                  const senderPhoto = senderProfile?.photoURL || msg.senderPhoto || '';
                  const senderSpecialActive = isActiveSpecialId(senderProfile, nowTick);
                  const senderNameColorClass = getEffectiveNameColorClass(
                    senderProfile,
                    displayRole
                  );
                  const myOrder = getRoleHierarchyOrder(getPrimaryRole(currentUser));
                  const targetOrder = senderProfile
                    ? getRoleHierarchyOrder(displayRole)
                    : 99;
                  const canModTarget = Boolean(
                    isModOrAdmin &&
                      !isOwn &&
                      senderProfile &&
                      !hasRole(senderProfile, 'admin') &&
                      (isSuperAdmin || myOrder < targetOrder)
                  );

                  const mentionsMe =
                    !isOwn &&
                    (msg.replyToSenderId === currentUser.uid ||
                      (msg.mentions || []).includes(currentUser.uid) ||
                      msg.text.toLowerCase().includes(`@${myHandle.toLowerCase()}`));

                  const isHighlighted = highlightedMsgId === msg.id;

                  const senderLive = getEffectiveLiveStatus(
                    senderProfile,
                    isOwn && senderProfile?.liveStatus !== 'offline',
                    nowTick
                  );
                  const msgTime = formatMessageTime(msg.createdAt, nowTick);
                  const statusTitle =
                    senderLive.status === 'offline'
                      ? senderProfile?.lastActiveAt
                        ? `أوفلاين · آخر ظهور ${formatLastSeen(senderProfile.lastActiveAt, nowTick)}`
                        : 'أوفلاين'
                      : senderLive.label;

                  const bubbleToneClass = isHighlighted
                    ? 'bg-[#D4A853]/20 border-[#D4A853] text-[#F5F2EB] ring-1 ring-[#D4A853]/60'
                    : mentionsMe
                      ? 'bg-[#2A2212] border-[#D4A853]/60 text-[#FFF8E7] ring-1 ring-[#D4A853]/25'
                      : isOwn
                        ? 'bg-[#282115] border-[#D4A853]/35 text-[#F5F2EB]'
                        : displayRole === 'admin'
                          ? 'bg-[#1D1A12] border-[#D4A853]/40 text-[#F5F2EB]'
                          : displayRole === 'moderator'
                            ? 'bg-[#171929] border-indigo-400/35 text-[#E8EAF6]'
                            : displayRole === 'vip_barber'
                              ? 'bg-[#1B1F2B] border-slate-300/40 text-[#F1F5F9]'
                              : displayRole === 'barber_verified'
                                ? 'bg-[#13201B] border-emerald-400/30 text-[#E6F4EE]'
                                : 'bg-[#1A1A22] border-[#282832] text-[#E6E1D8]';

                  const canDelete =
                    isOwn ||
                    (allowDelete &&
                      (isSuperAdmin ||
                        !senderProfile ||
                        !hasRole(senderProfile, 'admin')));

                  return (
                    <CommunityMessageRow
                      key={msg.id}
                      msg={msg}
                      isOwn={isOwn}
                      isGroupedWithPrev={isGroupedWithPrev}
                      senderProfile={senderProfile}
                      senderDisplayName={senderDisplayName}
                      senderHandle={senderHandle}
                      senderRolesKey={senderRolesKey}
                      senderRoles={senderRoles}
                      displayRole={displayRole}
                      senderCountryCode={senderCountryCode}
                      senderPhoto={senderPhoto}
                      senderSpecialActive={senderSpecialActive}
                      senderNameColorClass={senderNameColorClass}
                      senderChatTitleKey={
                        senderProfile ? getActiveChatTitle(senderProfile, nowTick) : null
                      }
                      senderAvatarFrame={senderProfile?.avatarFrame}
                      senderAvatarFrameExpiresAt={senderProfile?.avatarFrameExpiresAt}
                      senderLiveDotClass={senderLive.dotClass}
                      statusTitle={statusTitle}
                      msgTime={msgTime}
                      bubbleToneClass={bubbleToneClass}
                      isEditing={editingMsgId === msg.id}
                      editingText={editingMsgId === msg.id ? editingText : ''}
                      canReply={!currentUser.isMuted}
                      canEdit={isOwn && !currentUser.isMuted}
                      canDelete={canDelete}
                      canModTarget={canModTarget}
                      allowMuteKick={allowMuteKick}
                      allowBan={allowBan}
                      isSuperAdmin={isSuperAdmin}
                      handleToUserMap={handleToUserMap}
                      myHandle={myHandle}
                      onOpenSender={handleOpenSender}
                      onHandleClick={handleMsgHandleClick}
                      onScrollToMessage={scrollToMessage}
                      onStartReply={handleStartReply}
                      onStartEdit={handleStartEdit}
                      onEditingTextChange={setEditingText}
                      onSaveEdit={handleSaveEdit}
                      onCancelEdit={handleCancelEdit}
                      onConfirmDelete={setConfirmDeleteMsg}
                      onOpenModModal={openModModal}
                      onOpenProfile={onOpenProfile}
                      canReport={Boolean(onOpenReport && !isOwn)}
                      onReportMessage={handleReportMessage}
                    />
                  );
                })
              )}
            </div>

            {/* Floating Jump-to-Latest Button when scrolled up */}
            {unreadBelowCount > 0 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20">
                <button
                  type="button"
                  onClick={() => scrollToBottom('smooth')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-extrabold shadow-lg cursor-pointer whitespace-nowrap"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                  <span>
                    {unreadBelowCount} {unreadBelowCount === 1 ? 'رسالة جديدة' : 'رسائل جديدة'}
                  </span>
                </button>
              </div>
            )}

            {/* Floating Top-Corner Dropdown / Drawer for Platform Members */}
            {membersOpen && (
              <>
                <div
                  aria-hidden="true"
                  onClick={() => setMembersOpen(false)}
                  className="absolute inset-0 z-30 bg-black/45 backdrop-blur-[1px]"
                />
                <aside
                  role="dialog"
                  aria-label="قائمة أعضاء المنصة"
                  className="absolute top-2 left-2 right-2 sm:right-auto sm:left-6 z-40 sm:w-96 max-h-[calc(100%-1rem)] flex flex-col bg-[#141419] border border-[#2C2C35] rounded-2xl shadow-2xl overflow-hidden"
                >
                  <div className="shrink-0 px-4 py-3 border-b border-[#22222A] bg-[#181820] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-[#D4A853]/15 text-[#D4A853] flex items-center justify-center shrink-0">
                        <Users className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-sm font-bold text-[#F5F2EB] truncate">
                          {roomMode === 'global'
                            ? 'أعضاء المنصة (كل الدول)'
                            : `أعضاء مجتمع ${targetCountryMeta?.nameAr || effectiveLocalCountry}`}
                        </h2>
                        <p className="text-[11px] font-mono-num text-[#9C968B]">
                          <span className="text-emerald-400 font-bold">{onlineMembers.length} متصل</span>
                          {' · '}
                          <span>{offlineMembers.length} أوفلاين</span>
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMembersOpen(false)}
                      aria-label="إغلاق قائمة الأعضاء"
                      className="min-w-[36px] min-h-[36px] rounded-xl bg-[#1A1A22] hover:bg-[#252530] border border-[#2C2C35] text-[#9C968B] hover:text-[#F5F2EB] flex items-center justify-center cursor-pointer transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-4">
                    {/* My Live Status Selector + Coins Hint */}
                    {(() => {
                      const myStatus = getEffectiveLiveStatus(currentUser, true, nowTick).status;
                      const myLevel = getCommunityLevel(currentUser.points);
                      return (
                        <div className="p-3 rounded-xl bg-[#1A1A22] border border-[#262630] space-y-2.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-[#C8C2B8]">حالة اتصالك المباشر</span>
                            <span className="inline-flex items-center gap-1 font-mono-num tabular-nums text-[#D4A853] font-bold">
                              <Coins className="w-3 h-3" />
                              {currentUser.points || 0} كريدت ({myLevel.title})
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            {(
                              [
                                {
                                  key: 'online',
                                  label: 'أونلاين',
                                  active: 'bg-emerald-500 text-[#0B0B0E]',
                                },
                                {
                                  key: 'cutting',
                                  label: 'مشغول',
                                  active: 'bg-amber-500 text-[#0B0B0E]',
                                },
                                {
                                  key: 'offline',
                                  label: 'أوفلاين',
                                  active: 'bg-[#5E5A54] text-white',
                                },
                              ] as const
                            ).map((opt) => (
                              <button
                                key={opt.key}
                                type="button"
                                onClick={() => handleSetMyLiveStatus(opt.key)}
                                className={`py-1.5 px-2 rounded-lg text-[10px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                                  myStatus === opt.key
                                    ? opt.active
                                    : 'bg-[#121217] text-[#9C968B] hover:text-[#F5F2EB]'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Online Section */}
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold text-emerald-400 px-1">
                        متصلون الآن ({onlineMembers.length})
                      </div>
                      {onlineMembers.length === 0 ? (
                        <p className="text-xs text-[#6B665E] px-1">لا يوجد أعضاء متصلون حالياً.</p>
                      ) : (
                        <div className="space-y-1">
                          {onlineMembers.map((member) => renderMemberRow(member, true))}
                        </div>
                      )}
                    </div>

                    {/* Offline Section */}
                    {offlineMembers.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-[#22222A]">
                        <div className="text-[11px] font-bold text-[#8B857B] px-1">
                          أوفلاين ({offlineMembers.length})
                        </div>
                        <div className="space-y-1 opacity-80">
                          {offlineMembers.map((member) => renderMemberRow(member, false))}
                        </div>
                      </div>
                    )}
                  </div>
                </aside>
              </>
            )}
          </div>

          {/* Pinned Bottom Composer / Muted Notice */}
          {currentUser.isMuted ? (
            <div className="shrink-0 p-4 border-t border-[#22222B] bg-amber-500/10 text-amber-200 text-xs flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>
                أنت مكتوم حالياً من الإرسال في الدردشة العامة. السبب:{' '}
                <strong>{currentUser.muteReason || 'إجراء إشرافي'}</strong>
              </span>
            </div>
          ) : (
            <div className="shrink-0 relative border-t border-[#22222B] bg-[#121218]">
              {/* @Mention Autocomplete Popover */}
              {mentionQuery && mentionSuggestions.length > 0 && (
                <div className="absolute bottom-full inset-x-3 sm:inset-x-6 mb-1.5 bg-[#181820] border border-[#D4A853]/40 rounded-xl shadow-2xl overflow-hidden z-30 max-w-md">
                  <div className="px-3 py-1.5 border-b border-[#252530] text-[10px] font-bold text-[#A6A196] flex items-center justify-between">
                    <span>إشارة سريعة إلى عضو (@Mention)</span>
                    <span className="font-mono-num text-[#D4A853]">↑ ↓ Enter</span>
                  </div>
                  <div className="divide-y divide-[#22222B] max-h-56 overflow-y-auto">
                    {mentionSuggestions.map((u, i) => {
                      const uRoles = getUserRoles(u);
                      const uHandle = getUserHandle(u, nowTick);
                      const uLive = getEffectiveLiveStatus(u, false, nowTick);
                      const isSelected = i === mentionSelectedIdx;
                      return (
                        <button
                          key={u.uid}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            applyMentionSelection(u);
                          }}
                          className={`w-full px-3 py-2 flex items-center justify-between gap-2 text-right transition-colors cursor-pointer ${
                            isSelected ? 'bg-[#D4A853]/18' : 'hover:bg-[#20202A]'
                          }`}
                      <div className="flex items-center gap-2 min-w-0">
                            <div className="relative shrink-0">
                              <Avatar
                                src={u.photoURL}
                                name={u.displayName}
                                size="xs"
                                role={uRoles[0]}
                                roles={uRoles}
                                avatarFrame={u.avatarFrame}
                                avatarFrameExpiresAt={u.avatarFrameExpiresAt}
                              />
                              <span
                                className={`absolute -bottom-0.5 -left-0.5 w-2 h-2 rounded-full ring-2 ring-[#181820] ${uLive.dotClass}`}
                              />
                            </div>
                            <span
                              className={`text-xs font-bold truncate ${getEffectiveNameColorClass(
                                u,
                                uRoles[0]
                              )}`}
                            >
                              {u.displayName}
                            </span>
                            <CountryFlag code={u.countryCode || activeCountryCode} size="xs" />
                          </div>
                          <span dir="ltr" className="text-[11px] font-mono-num text-[#D4A853] shrink-0">
                            @{uHandle}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Active Direct Reply Bar */}
              {replyingTo && (
                <div className="px-3.5 sm:px-6 py-2 border-b border-[#22222B] bg-[#181820] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0 text-xs">
                    <Reply className="w-3.5 h-3.5 text-[#D4A853] shrink-0" />
                    <span className="font-bold text-[#D4A853] shrink-0">
                      الرد على{' '}
                      {findUser(replyingTo.senderId)?.displayName || replyingTo.senderName}
                    </span>
                    <span dir="ltr" className="text-[11px] font-mono-num text-[#9C968B] shrink-0">
                      @
                      {replyingTo.senderUsername ||
                        getUserHandle(
                          findUser(replyingTo.senderId) || {
                            uid: replyingTo.senderId,
                            displayName: replyingTo.senderName,
                          }
                        )}
                    </span>
                    <span className="text-[#B6B0A4] truncate min-w-0">
                      {replyingTo.text}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    title="إلغاء الرد"
                    aria-label="إلغاء الرد"
                    className="p-1 rounded-lg text-[#8B857B] hover:text-white hover:bg-[#23232E] cursor-pointer shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Active Real-Time Typing Indicator */}
              {activeTypists.length > 0 && (
                <div className="px-4 sm:px-6 py-1.5 border-b border-[#1E1E26] bg-[#14141B] flex items-center gap-2 text-[11px] text-[#D4A853]">
                  <span className="inline-flex items-center gap-1" aria-hidden="true">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#D4A853] animate-bounce" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#D4A853] animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#D4A853] animate-bounce [animation-delay:300ms]" />
                  </span>
                  <span className="font-semibold truncate">
                    {activeTypists.length === 1
                      ? `${activeTypists[0].userName} يكتب الآن...`
                      : activeTypists.length === 2
                        ? `${activeTypists[0].userName} و ${activeTypists[1].userName} يكتبان الآن...`
                        : `${activeTypists.map((t) => t.userName).slice(0, 2).join('، ')} وآخرون يكتبون الآن...`}
                  </span>
                </div>
              )}

              {/* Inline Rate-limit / Validation Notice */}
              {sendError && (
                <div className="px-4 sm:px-6 py-2 border-b border-red-500/30 bg-red-500/10 flex items-center justify-between gap-2 text-xs text-red-300">
                  <span>{sendError}</span>
                  <button
                    type="button"
                    onClick={() => setSendError(null)}
                    className="p-0.5 text-red-300 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <form
                onSubmit={handleSendMessage}
                className="px-3 sm:px-6 py-2.5 flex items-center gap-2"
              >
                <button
                  type="button"
                  onClick={handleOpenMentionPicker}
                  title="إشارة إلى عضو (@Mention)"
                  aria-label="إشارة إلى عضو"
                  className="min-w-[42px] min-h-[42px] rounded-xl bg-[#1A1A22] hover:bg-[#24242F] border border-[#2C2C35] text-[#D4A853] flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                >
                  <AtSign className="w-4 h-4" />
                </button>
                <input
                  ref={inputRef}
                  type="text"
                  maxLength={1000}
                  value={text}
                  onChange={handleComposerChange}
                  onBlur={stopTypingNow}
                  onKeyDown={handleComposerKeyDown}
                  onClick={(e) => {
                    const pos = (e.target as HTMLInputElement).selectionStart ?? text.length;
                    setMentionQuery(detectMentionAtCaret(text, pos));
                  }}
                  placeholder={
                    replyingTo
                      ? `اكتب ردك لـ ${findUser(replyingTo.senderId)?.displayName || replyingTo.senderName}...`
                      : roomMode === 'global'
                        ? 'اكتب رسالتك في الدردشة العامة (كل الدول) أو @ للمنشن...'
                        : `اكتب رسالتك في دردشة ${targetCountryMeta?.nameAr || effectiveLocalCountry} أو @ للمنشن...`
                  }
                  className="flex-1 min-h-[42px] bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2 text-sm text-[#F5F2EB] placeholder:text-[#6B665E] outline-none"
                />
                <button
                  type="submit"
                  disabled={sending || !text.trim()}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] font-bold text-xs inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <span>إرسال</span>
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}
        </>
      )}

      {/* Quick Member Popover Modal */}
      {quickMember && (() => {
        const qRoles = getUserRoles(quickMember);
        const qPrimary = qRoles[0];
        const qHandle = getUserHandle(quickMember, nowTick);
        const qSpecial = isActiveSpecialId(quickMember, nowTick);
        const qIsSelf = quickMember.uid === currentUser.uid;
        const qLive = getEffectiveLiveStatus(
          quickMember,
          qIsSelf && currentUser.liveStatus !== 'offline',
          nowTick
        );
        const fId = !qIsSelf ? makeFriendshipId(currentUser.uid, quickMember.uid) : '';
        const activeF = !qIsSelf ? friendships.find((f) => f.id === fId) : undefined;
        const eligibility = !qIsSelf
          ? canSendFriendRequest(currentUser, quickMember)
          : { allowed: false, reason: '' };
        const canModQuick =
          isModOrAdmin &&
          !qIsSelf &&
          !hasRole(quickMember, 'admin') &&
          (isSuperAdmin ||
            getRoleHierarchyOrder(getPrimaryRole(currentUser)) < getRoleHierarchyOrder(qPrimary));

        return (
          <div
            onClick={() => setQuickMember(null)}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-[#141419] border border-[#2C2C35] rounded-2xl p-5 space-y-4 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <Avatar
                      src={quickMember.photoURL}
                      name={quickMember.displayName}
                      size="md"
                      role={qPrimary}
                      roles={qRoles}
                      avatarFrame={quickMember.avatarFrame}
                      avatarFrameExpiresAt={quickMember.avatarFrameExpiresAt}
                    />
                    <span
                      className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-[#141419] ${qLive.dotClass}`}
                    />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-sm font-bold truncate ${getEffectiveNameColorClass(quickMember, qPrimary)}`}>
                        {quickMember.displayName}
                      </span>
                      <CountryFlag code={quickMember.countryCode || activeCountryCode} size="xs" />
                      <VipSilverStar roles={qRoles} size="xs" />
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        dir="ltr"
                        className={`text-[11px] font-mono-num inline-flex items-center gap-0.5 ${
                          qSpecial ? 'text-[#FCE08B] font-bold' : 'text-[#D4A853]'
                        }`}
                      >
                        {qSpecial && <Sparkles className="w-3 h-3" />}
                        @{qHandle}
                      </span>
                      {qSpecial && (
                        <span className="text-[10px] px-1.5 py-0.25 rounded bg-[#D4A853]/15 text-[#F5D67B] font-bold">
                          {quickMember.specialIdLabel || 'رقم مميز'}
                        </span>
                      )}
                      <RoleBadgesList roles={qRoles} size="xs" compact />
                    </div>
                    <div className={`text-[11px] font-semibold ${qLive.textClass}`}>
                      {qLive.status === 'offline'
                        ? `أوفلاين · آخر ظهور ${formatLastSeen(quickMember.lastActiveAt, nowTick)}`
                        : qLive.label}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickMember(null)}
                  className="p-1 text-[#9C968B] hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {quickMemberError && (
                <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                  {quickMemberError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const uid = quickMember.uid;
                    setQuickMember(null);
                    onOpenProfile(uid);
                  }}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <UserIcon className="w-3.5 h-3.5" />
                  <span>عرض الملف</span>
                </button>

                {!qIsSelf && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = quickMember;
                      setQuickMember(null);
                      onStartPrivateChat(target);
                    }}
                    className="min-h-[40px] px-3 py-2 rounded-xl bg-[#1D1D25] hover:bg-[#262632] border border-[#2E2E3A] text-[#F5F2EB] text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-[#D4A853]" />
                    <span>مراسلة خاصة</span>
                  </button>
                )}

                {!qIsSelf && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = quickMember;
                      setQuickMember(null);
                      insertMentionToken(target);
                    }}
                    className="min-h-[40px] px-3 py-2 rounded-xl bg-[#1A1A22] hover:bg-[#23232E] border border-[#2C2C35] text-[#D4A853] text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <AtSign className="w-3.5 h-3.5" />
                    <span>منشن في الشات</span>
                  </button>
                )}

                {!qIsSelf && (
                  !activeF ? (
                    <button
                      type="button"
                      disabled={quickMemberBusy || !eligibility.allowed}
                      title={eligibility.reason || 'إضافة صديق'}
                      onClick={async () => {
                        if (!onSendFriendRequest) return;
                        setQuickMemberError(null);
                        setQuickMemberBusy(true);
                        try {
                          await onSendFriendRequest(quickMember);
                        } catch (err) {
                          setQuickMemberError(
                    err instanceof Error ? err.message : 'تعذر إرسال الطلب.'
                          );
                        } finally {
                          setQuickMemberBusy(false);
                        }
                      }}
                      className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${
                        eligibility.allowed
                          ? 'bg-[#1D1D25] hover:bg-emerald-500 hover:text-[#0B0B0E] border-emerald-500/40 text-emerald-300 cursor-pointer'
                          : 'bg-[#17171E] border-[#292935] text-[#7B766E] cursor-not-allowed'
                      }`}
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{eligibility.allowed ? 'إضافة صديق' : 'الطلبات مقيدة'}</span>
                    </button>
                  ) : activeF.status === 'pending' && activeF.requesterId === currentUser.uid ? (
                    <button
                      type="button"
                      disabled={quickMemberBusy}
                      onClick={async () => {
                        if (!onRejectOrRemoveFriend) return;
                        setQuickMemberBusy(true);
                        try {
                          await onRejectOrRemoveFriend(activeF.id);
                        } finally {
                          setQuickMemberBusy(false);
                        }
                      }}
                      className="min-h-[40px] px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-200 text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>طلب معلّق · إلغاء</span>
                    </button>
                  ) : activeF.status === 'pending' ? (
                    <button
                      type="button"
                      disabled={quickMemberBusy}
                      onClick={async () => {
                        if (!onAcceptFriendRequest) return;
                        setQuickMemberBusy(true);
                        try {
                          await onAcceptFriendRequest(activeF);
                        } finally {
                          setQuickMemberBusy(false);
                        }
                      }}
                      className="min-h-[40px] px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#0B0B0E] text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>قبول الصداقة</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={quickMemberBusy}
                      onClick={async () => {
                        if (!onRejectOrRemoveFriend) return;
                        setQuickMemberBusy(true);
                        try {
                          await onRejectOrRemoveFriend(activeF.id);
                        } finally {
                          setQuickMemberBusy(false);
                        }
                      }}
                      className="min-h-[40px] px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-red-500/15 border border-emerald-500/40 text-emerald-300 hover:text-red-300 text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>أصدقاء ✓</span>
                    </button>
                  )
                )}

                {!qIsSelf && onOpenReport && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = quickMember;
                      setQuickMember(null);
                      onOpenReport({
                        targetType: 'profile',
                        targetId: target.uid,
                        targetOwnerId: target.uid,
                        targetOwnerName: target.displayName,
                        targetPreview: target.bio || target.displayName,
                      });
                    }}
                    className="min-h-[40px] px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/35 text-amber-300 text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>إبلاغ</span>
                  </button>
                )}

                {!qIsSelf && onBlockUser && !hasRole(quickMember, 'admin') && (
                  <button
                    type="button"
                    disabled={quickMemberBusy}
                    onClick={async () => {
                      setQuickMemberBusy(true);
                      try {
                        await onBlockUser(
                          quickMember.uid,
                          quickMember.displayName,
                          quickMember.photoURL
                        );
                        setQuickMember(null);
                      } catch (err) {
                        setQuickMemberError(
                          err instanceof Error ? err.message : 'تعذر حظر المستخدم.'
                        );
                      } finally {
                        setQuickMemberBusy(false);
                      }
                    }}
                    className="min-h-[40px] px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/35 text-red-300 text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>حظر المستخدم</span>
                  </button>
                )}
              </div>

              {canModQuick && (allowMuteKick || allowBan || isSuperAdmin) && (
                <div className="pt-2 border-t border-[#22222A] flex flex-wrap items-center gap-1.5">
                  {allowMuteKick && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const target = quickMember;
                          setQuickMember(null);
                          openModModal('mute', target);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 text-[11px] font-bold cursor-pointer"
                      >
                        كتم
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const target = quickMember;
                          setQuickMember(null);
                          openModModal('kick', target);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-orange-500/15 text-orange-300 text-[11px] font-bold cursor-pointer"
                      >
                        طرد
                      </button>
                    </>
                  )}
                  {allowBan && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = quickMember;
                        setQuickMember(null);
                        openModModal('ban', target);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-red-500/15 text-red-300 text-[11px] font-bold cursor-pointer"
                    >
                      حظر
                    </button>
                  )}
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = quickMember;
                        setQuickMember(null);
                        openModModal('role', target);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-sky-500/15 text-sky-300 text-[11px] font-bold cursor-pointer"
                    >
                      تعديل الرتب
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Delete Community Message Confirmation Modal */}
      <ConfirmModal
        open={Boolean(confirmDeleteMsg)}
        title="هل أنت متأكد من الحذف؟"
        message={
          confirmDeleteMsg
            ? `سيتم حذف الرسالة "${confirmDeleteMsg.text.slice(0, 80)}${
                confirmDeleteMsg.text.length > 80 ? '...' : ''
              }" نهائياً من الدردشة العامة.`
            : ''
        }
        confirmLabel="نعم، حذف الرسالة"
        onCancel={() => setConfirmDeleteMsg(null)}
        onConfirm={() => {
          if (confirmDeleteMsg) {
            return handleDeleteMessage(confirmDeleteMsg.id);
          }
        }}
      />

      {/* Moderation Modal */}
      {modModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#141419] border border-[#2C2C35] rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#F5F2EB]">
                {modModal.type === 'mute' && `كتم العضو: ${modModal.target.displayName}`}
                {modModal.type === 'kick' && `طرد العضو: ${modModal.target.displayName}`}
                {modModal.type === 'ban' && `حظر نهائي: ${modModal.target.displayName}`}
                {modModal.type === 'role' && `تعديل رتبة: ${modModal.target.displayName}`}
              </h3>
              <button
                type="button"
                onClick={() => setModModal(null)}
                className="p-1 text-[#9C968B] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmModeration} className="space-y-4">
              {modModal.type === 'role' ? (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-[#C8C2B8]">
                    تعيين رتبة واحدة أو عدة رتب للعضو (صلاحيات مجتمعة)
                  </label>
                  <MultiRoleSelector
                    selectedRoles={selectedRoles}
                    onChange={setSelectedRoles}
                    disabled={modSubmitting}
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#C8C2B8]">
                    سبب الإجراء (يظهر للعضو)
                  </label>
                  <textarea
                    required
                    rows={3}
                    maxLength={240}
                    value={modReason}
                    onChange={(e) => setModReason(e.target.value)}
                    placeholder="اكتب السبب بوضوح..."
                    className="w-full bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F2EB] outline-none resize-none"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModModal(null)}
                  className="px-4 py-2 rounded-xl bg-[#1C1C24] text-xs font-semibold text-[#F5F2EB] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={modSubmitting}
                  className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                    modModal.type === 'ban'
                      ? 'bg-red-600 hover:bg-red-500 text-white'
                      : 'bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E]'
                  }`}
                >
                  {modSubmitting ? 'جاري التنفيذ...' : 'تأكيد الإجراء'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
          
