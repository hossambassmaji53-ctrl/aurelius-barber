import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  Activity,
  Ban,
  BookOpen,
  Check,
  Edit3,
  LifeBuoy,
  Lock,
  MessageSquareLock,
  Plus,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserX,
  VolumeX,
  X,
  Globe,
  Eye,
  EyeOff,
  ExternalLink,
  Flag,
  CheckCircle2,
} from 'lucide-react';
import {
  db,
  createSafeId,
  formatLastSeen,
  handleFirestoreError,
  isUserCurrentlyOnline,
  OperationType,
  tsToMillis,
} from '../firebase';
import {
  ActivityLog,
  CommunityMessage,
  ContentReport,
  StaffGuideline,
  StaffGuidelineCategory,
  StaffMessage,
  SupportTicket,
  UserProfile,
  UserRole,
} from '../types';
import {
  Avatar,
  RoleBadgesList,
  VipSilverStar,
  getEffectiveNameColorClass,
  getPrimaryRole,
  getRoleMeta,
  getUserRoles,
  hasRole,
  isStaffMember,
} from './Avatar';
import {
  assertFounderActor,
  canActorModerateTarget,
  canUserBan,
  canUserMuteKick,
  getRoleHierarchyOrder,
} from '../utils/roles';
import { getEffectiveLiveStatus } from '../utils/gamification';
import {
  formatFullDateTime,
  formatMessageTime,
  useNowTick,
} from '../utils/time';
import { COUNTRIES, normalizeCountryCode } from '../utils/countries';
import { CountryFlag } from './CountryPickerModal';
import { ConfirmModal } from './ConfirmModal';
import { TicketsView } from './TicketsView';
import {
  checkActionRateLimit,
  MAX_TEXT_LENGTHS,
  sanitizePlainText,
} from '../utils/security';

interface StaffRoomViewProps {
  currentUser: UserProfile;
  isSuperAdmin: boolean;
  users: UserProfile[];
  staffMessages: StaffMessage[];
  staffGuidelines: StaffGuideline[];
  tickets: SupportTicket[];
  contentReports?: ContentReport[];
  activityLogs: ActivityLog[];
  communityMessages?: CommunityMessage[];
  selectedTicketId: string | null;
  onSelectTicket: (id: string | null) => void;
  onOpenProfile: (uid: string) => void;
  onOpenCommunityRoom?: (roomType: 'global' | 'local', countryCode?: string) => void;
}

type StaffRoomTab = 'chat' | 'rooms' | 'guide' | 'tickets' | 'reports' | 'monitor';

const GUIDE_CATEGORY_LABELS: Record<StaffGuidelineCategory, string> = {
  duties: 'مهام المشرف اليومية',
  rules: 'قوانين الانضباط والعقوبات',
  tickets: 'بروتوكول التكتات والشكاوى',
  escalation: 'التسلسل الإداري والسرية',
};

const CORE_MODERATOR_GUIDE: {
  category: StaffGuidelineCategory;
  title: string;
  points: string[];
}[] = [
  {
    category: 'duties',
    title: '1. المهام اليومية للمشرفين',
    points: [
      'متابعة الدردشات العامة والمحلية باستمرار لضمان التزام الأعضاء بالاحترام المتبادل ومنع السب أو الروابط العشوائية والسبام.',
      'استقبال التكتات والشكاوى الواردة من الأعضاء في مركز التكتات والرد عليها بسرعة ومهنية.',
      'التنسيق الفوري مع المؤسس ونائب المدير في هذه الغرفة السرية قبل اتخاذ قرارات حظر دائمة في الحالات الحساسة.',
      'التأكد من التزام الجميع بنشر المحتوى اللائق والخاص بعالم الحلاقة والأناقة في المعرض العام والستوري.',
    ],
  },
  {
    category: 'rules',
    title: '2. قوانين الطاقم وحدود الصلاحيات',
    points: [
      'يلتزم كل مشرف بحدود صلاحياته الممنوحة لرتبته، ويُمنع استخدام الصلاحيات لأغراض شخصية أو التعسف ضد أي عضو.',
      'الالتزام بالتدرج عند المخالفات: تنبيه ودي أولاً ← حذف المحتوى المخالف أو كتم مؤقت مع توضيح السبب ← طرد ← حظر عند التكرار وفق الصلاحية.',
      'جميع الإجراءات الإشرافية تُسجل تلقائياً في «سجل الإجراءات الإدارية» باسم المشرف وتاريخ التنفيذ.',
      'يُمنع التحايل أو التغاضي عن أي استغلال لنظام الكريدت أو الـ ID المميز، ويجب الإبلاغ الفوري للمؤسس لسحب الرصيد وتجميد المخالف.',
    ],
  },
  {
    category: 'tickets',
    title: '3. قواعد التعامل مع التكتات والشكاوى',
    points: [
      'عند فتح تكت جديد، اضغط على «استلام التكت» فور بدئك بالمتابعة ليعلم بقية المشرفين وصاحب التكت أن الشكوى قيد المعالجة.',
      'الحفاظ على السرية التامة لمحتوى التكتات؛ يُحظر نشر تفاصيل شكاوى الأعضاء في الدردشات العامة أو المحلية.',
      'بعد حل المشكلة، أضف ملخصاً واضحاً للحل قبل إغلاق التكت لضمان توثيق الحالة لدى المؤسس.',
    ],
  },
  {
    category: 'escalation',
    title: '4. السرية التامة وصلاحيات المؤسس',
    points: [
      'السرية التامة لما يدور داخل مركز تنسيق الطاقم (الغرفة السرية)، وأي تسريب للمعلومات الإدارية يؤدي لسحب الرتبة فوراً.',
      'صلاحيات منح وسحب الرتب، إنشاء الرتب المخصصة، التحكم الكامل بالكريدت والـ IDs المميزة، والموافقة على التوثيق محكومة بنظام المؤسس.',
      'في حال اكتشاف ثغرة في الكريدت أو المتجر أو سلوك احتيالي، ارفع تقريراً فورياً في هذه الغرفة للمؤسس.',
    ],
  },
];

export const StaffRoomView: React.FC<StaffRoomViewProps> = ({
  currentUser,
  isSuperAdmin,
  users,
  staffMessages,
  staffGuidelines,
  tickets,
  contentReports = [],
  activityLogs,
  communityMessages = [],
  selectedTicketId,
  onSelectTicket,
  onOpenProfile,
  onOpenCommunityRoom,
}) => {
  const isStaff = isStaffMember(currentUser, isSuperAdmin);
  const nowTick = useNowTick(20000);

  const [tab, setTab] = useState<StaffRoomTab>('chat');

  // Confidential Staff Chat state + quick Collapse/Hide toggle
  const [staffChatCollapsed, setStaffChatCollapsed] = useState(false);
  const [roomsSearch, setRoomsSearch] = useState('');
  const [roomsPreviewCollapsed, setRoomsPreviewCollapsed] = useState(false);
  const [chatText, setChatText] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingMsgText, setEditingMsgText] = useState('');
  const [confirmDeleteMsg, setConfirmDeleteMsg] = useState<StaffMessage | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Moderator Guide Admin Controls
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [editingGuide, setEditingGuide] = useState<StaffGuideline | null>(null);
  const [guideTitle, setGuideTitle] = useState('');
  const [guideCategory, setGuideCategory] = useState<StaffGuidelineCategory>('rules');
  const [guideContent, setGuideContent] = useState('');
  const [savingGuide, setSavingGuide] = useState(false);
  const [confirmDeleteGuide, setConfirmDeleteGuide] = useState<StaffGuideline | null>(null);

  // Monitor & Audit Log state
  const [memberSearch, setMemberSearch] = useState('');
  const [logSearch, setLogSearch] = useState('');
  const [actionModal, setActionModal] = useState<{
    action: 'mute' | 'kick' | 'ban';
    target: UserProfile;
  } | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  useEffect(() => {
    if (tab === 'chat') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [staffMessages.length, tab]);

  // Staff Team Roster (Founder first, then Deputy/Moderators/Custom Staff)
  const staffMembers = useMemo(() => {
    return users
      .filter((u) => !u.isBanned && isStaffMember(u, hasRole(u, 'admin')))
      .sort((a, b) => {
        const aAdmin = hasRole(a, 'admin');
        const bAdmin = hasRole(b, 'admin');
        if (aAdmin && !bAdmin) return -1;
        if (bAdmin && !aAdmin) return 1;
        const aOn = a.uid === currentUser.uid || isUserCurrentlyOnline(a, nowTick);
        const bOn = b.uid === currentUser.uid || isUserCurrentlyOnline(b, nowTick);
        if (aOn !== bOn) return aOn ? -1 : 1;
        const rankDiff =
          getRoleHierarchyOrder(getPrimaryRole(a)) -
          getRoleHierarchyOrder(getPrimaryRole(b));
        if (rankDiff !== 0) return rankDiff;
        return a.displayName.localeCompare(b.displayName, 'ar');
      });
  }, [users, currentUser.uid, nowTick]);

  const openTicketsCount = useMemo(
    () => tickets.filter((t) => t.status !== 'closed').length,
    [tickets]
  );

  const pendingReportsCount = useMemo(
    () => contentReports.filter((r) => r.status === 'pending').length,
    [contentReports]
  );

  const monitorUsers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return users.filter((u) => {
      if (hasRole(u, 'admin')) return false;
      if (!q) return true;
      return (
        u.displayName.toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q) ||
        (u.salonName || '').toLowerCase().includes(q)
      );
    });
  }, [users, memberSearch]);

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    if (!q) return activityLogs;
    return activityLogs.filter(
      (l) =>
        l.actorName.toLowerCase().includes(q) ||
        l.targetUserName.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        (l.reason || '').toLowerCase().includes(q)
    );
  }, [activityLogs, logSearch]);

  const monitorStats = useMemo(() => {
    const activeStaffOnline = staffMembers.filter(
      (s) => s.uid === currentUser.uid || isUserCurrentlyOnline(s, nowTick)
    ).length;
    const restricted = users.filter((u) => u.isMuted || u.isKicked || u.isBanned).length;
    return {
      activeStaffOnline,
      totalStaff: staffMembers.length,
      openTickets: openTicketsCount,
      restricted,
      totalLogs: activityLogs.length,
    };
  }, [staffMembers, currentUser.uid, users, openTicketsCount, activityLogs.length, nowTick]);

  // All Chat Rooms Overview (Global + Every Country Local Chat) for Moderators & Admin
  const chatRoomsOverview = useMemo(() => {
    const userByUid = new Map<string, UserProfile>();
    for (const u of users) userByUid.set(u.uid, u);

    const resolveScope = (msg: CommunityMessage): 'global' | 'local' => {
      if (msg.roomType === 'global') return 'global';
      if (msg.roomType === 'local') return 'local';
      const sender = userByUid.get(msg.senderId);
      const hasCountry =
        Boolean(normalizeCountryCode(msg.countryCode)) ||
        Boolean(normalizeCountryCode(sender?.countryCode));
      return hasCountry ? 'local' : 'global';
    };

    const globalMsgs = communityMessages
      .filter((m) => resolveScope(m) === 'global')
      .sort((a, b) => tsToMillis(b.createdAt) - tsToMillis(a.createdAt));
  const countryRooms = COUNTRIES.map((country) => {
      const msgs = communityMessages
        .filter((m) => {
          if (resolveScope(m) !== 'local') return false;
          const sender = userByUid.get(m.senderId);
          const code =
            normalizeCountryCode(m.countryCode) || normalizeCountryCode(sender?.countryCode);
          return code === country.code;
        })
        .sort((a, b) => tsToMillis(b.createdAt) - tsToMillis(a.createdAt));

      const membersCount = users.filter(
        (u) => !u.isBanned && normalizeCountryCode(u.countryCode) === country.code
      ).length;

      return {
        country,
        count: msgs.length,
        latest: msgs[0] || null,
        membersCount,
      };
    }).sort((a, b) => b.count - a.count || b.membersCount - a.membersCount);

    return { globalMsgs, countryRooms };
  }, [communityMessages, users]);

  if (!isStaff) {
    return (
      <div className="bg-[#141419] border border-red-500/35 rounded-2xl p-10 text-center space-y-3">
        <ShieldAlert className="w-10 h-10 text-red-400 mx-auto" />
        <h2 className="text-lg font-bold text-[#F5F2EB]">
          قسم محمي · غرفة الإدارة والمشرفين فقط
        </h2>
        <p className="text-xs text-[#9C968B]">
          هذا القسم سري ومقتصر حصرياً على المؤسس والطاقم الإداري والإشرافي المعتمد ولا يظهر للزبائن أو الحلاقين.
        </p>
      </div>
    );
  }

  // Staff Chat Handlers
  const handleSendStaffMsg = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = sanitizePlainText(chatText, 1200);
    if (!trimmed) return;
    const rate = checkActionRateLimit(`staff_msg_${currentUser.uid}`, {
      cooldownMs: 900,
      maxInWindow: 15,
      windowMs: 60000,
    });
    if (!rate.allowed) return;
    setSendingChat(true);
    try {
      const msgId = createSafeId('stf');
      const senderRole: UserRole = isSuperAdmin ? 'admin' : getPrimaryRole(currentUser);
      await setDoc(doc(db, 'staffMessages', msgId), {
        id: msgId,
        senderId: currentUser.uid,
        senderName: sanitizePlainText(currentUser.displayName, MAX_TEXT_LENGTHS.displayName) || currentUser.displayName,
        senderPhoto: currentUser.photoURL || '',
        senderRole,
        text: trimmed,
        edited: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setChatText('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'staffMessages');
    } finally {
      setSendingChat(false);
    }
  };

  const handleSaveStaffEdit = async (msg: StaffMessage) => {
    const trimmed = sanitizePlainText(editingMsgText, 1200);
    if (!trimmed) return;
    try {
      await updateDoc(doc(db, 'staffMessages', msg.id), {
        text: trimmed,
        edited: true,
        updatedAt: serverTimestamp(),
      });
      setEditingMsgId(null);
      setEditingMsgText('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `staffMessages/${msg.id}`);
    }
  };

  const handleDeleteStaffMsg = async (msgId: string) => {
    try {
      await deleteDoc(doc(db, 'staffMessages', msgId));
      setConfirmDeleteMsg(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `staffMessages/${msgId}`);
    }
  };

  // Super Admin Custom Guidelines Handlers
  const openCreateGuide = () => {
    setEditingGuide(null);
    setGuideTitle('');
    setGuideCategory('rules');
    setGuideContent('');
    setGuideModalOpen(true);
  };

  const openEditGuide = (g: StaffGuideline) => {
    setEditingGuide(g);
    setGuideTitle(g.title);
    setGuideCategory(g.category);
    setGuideContent(g.content);
    setGuideModalOpen(true);
  };

  const handleSaveGuide = async (e: React.FormEvent) => {
    e.preventDefault();
    assertFounderActor(currentUser, isSuperAdmin);
    const cleanTitle = sanitizePlainText(guideTitle, 120);
    const cleanContent = sanitizePlainText(guideContent, 2000);
    if (!cleanTitle || !cleanContent) return;
    setSavingGuide(true);
    try {
      if (editingGuide) {
        await updateDoc(doc(db, 'staffGuidelines', editingGuide.id), {
          title: cleanTitle,
          category: guideCategory,
          content: cleanContent,
          updatedAt: serverTimestamp(),
        });
      } else {
        const gid = createSafeId('gd');
        await setDoc(doc(db, 'staffGuidelines', gid), {
          id: gid,
          authorId: currentUser.uid,
          authorName: currentUser.displayName,
          title: cleanTitle,
          category: guideCategory,
          content: cleanContent,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      setGuideModalOpen(false);
    } catch (err) {
      handleFirestoreError(
        err,
        editingGuide ? OperationType.UPDATE : OperationType.CREATE,
        'staffGuidelines'
      );
    } finally {
      setSavingGuide(false);
    }
  };

  const handleDeleteGuide = async (g: StaffGuideline) => {
    assertFounderActor(currentUser, isSuperAdmin);
    try {
      await deleteDoc(doc(db, 'staffGuidelines', g.id));
      setConfirmDeleteGuide(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `staffGuidelines/${g.id}`);
    }
  };

  const handleUpdateReportStatus = async (
    report: ContentReport,
    nextStatus: ContentReport['status']
  ) => {
    if (!isStaff) return;
    try {
      await updateDoc(doc(db, 'contentReports', report.id), {
        status: nextStatus,
        reviewedById: currentUser.uid,
        reviewedByName: currentUser.displayName,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `contentReports/${report.id}`);
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    if (!isSuperAdmin) return;
    try {
      await deleteDoc(doc(db, 'contentReports', reportId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `contentReports/${reportId}`);
    }
  };

  const allowBan = canUserBan(currentUser, isSuperAdmin);
  const allowMuteKick = canUserMuteKick(currentUser, isSuperAdmin);

  // Staff Monitor Discipline Actions
  const handleToggleDiscipline = async (
    target: UserProfile,
    field: 'isMuted' | 'isKicked' | 'isBanned',
    value: boolean,
    reason = ''
  ) => {
    if (!canActorModerateTarget(currentUser, target, isSuperAdmin)) return;
    if (field === 'isBanned' && !allowBan) return;
    if ((field === 'isMuted' || field === 'isKicked') && !allowMuteKick) return;
    const cleanReason = sanitizePlainText(reason, MAX_TEXT_LENGTHS.moderationReason);
    try {
      const reasonField =
        field === 'isMuted'
          ? 'muteReason'
          : field === 'isKicked'
            ? 'kickReason'
            : 'banReason';
      await updateDoc(doc(db, 'users', target.uid), {
        [field]: value,
        [reasonField]: value ? cleanReason : '',
        updatedAt: serverTimestamp(),
      });

      const actionLabel = {
        isMuted: value ? 'كتم مستخدم (من غرفة الإشراف)' : 'فك كتم مستخدم',
        isKicked: value ? 'طرد مستخدم (من غرفة الإشراف)' : 'إلغاء الطرد',
        isBanned: value ? 'حظر نهائي (من غرفة الإشراف)' : 'رفع الحظر',
      }[field];

      const logId = createSafeId('log');
      await setDoc(doc(db, 'activityLogs', logId), {
        id: logId,
        actorId: currentUser.uid,
        actorName: currentUser.displayName,
        action: actionLabel,
        targetUserId: target.uid,
        targetUserName: target.displayName,
        reason: cleanReason,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${target.uid}`);
    }
  };

  const handleConfirmMonitorAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionModal) return;
    setSubmittingAction(true);
    try {
      const { action, target } = actionModal;
      const field =
        action === 'mute' ? 'isMuted' : action === 'kick' ? 'isKicked' : 'isBanned';
      await handleToggleDiscipline(
        target,
        field,
        true,
        sanitizePlainText(actionReason, MAX_TEXT_LENGTHS.moderationReason) ||
          'إجراء إشرافي من غرفة الإدارة'
      );
      setActionModal(null);
      setActionReason('');
    } finally {
      setSubmittingAction(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Staff Room Protected Header */}
      <div className="bg-[#141419] border border-indigo-400/30 rounded-3xl p-4 sm:p-6 space-y-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/15 border border-indigo-400/40 text-indigo-200 text-[11px] font-bold whitespace-nowrap">
              <Lock className="w-3.5 h-3.5" />
              <span>غرفة الإدارة والمشرفين السرية</span>
            </span>
            <RoleBadgesList
              roles={isSuperAdmin ? ['admin'] : getUserRoles(currentUser)}
              size="xs"
            />
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#F5F2EB]">
            مركز تنسيق الطاقم الإداري والإشراف
          </h1>
          <p className="text-xs sm:text-sm text-[#A6A196]">
            مساحة محمية تجمع المؤسس وطاقم الإشراف: نقاشات سرية، دليل المشرفين، التكتات، ومراقبة الغرف.
          </p>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-[#101015] border border-[#262632] rounded-xl">
          <button
            type="button"
            onClick={() => setTab('chat')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
              tab === 'chat'
                ? 'bg-indigo-500 text-white'
                : 'text-[#A6A196] hover:text-[#F5F2EB]'
            }`}
          >
            <MessageSquareLock className="w-3.5 h-3.5" />
            <span>الدردشة السرية</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('rooms')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
              tab === 'rooms'
                ? 'bg-indigo-500 text-white'
                : 'text-[#A6A196] hover:text-[#F5F2EB]'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>غرف الدردشة ({COUNTRIES.length + 1})</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('guide')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
              tab === 'guide'
                ? 'bg-indigo-500 text-white'
                : 'text-[#A6A196] hover:text-[#F5F2EB]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>دليل المشرفين الجدد</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('tickets')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
              tab === 'tickets'
                ? 'bg-indigo-500 text-white'
                : 'text-[#A6A196] hover:text-[#F5F2EB]'
            }`}
          >
            <LifeBuoy className="w-3.5 h-3.5" />
            <span>مركز التكتات</span>
            {openTicketsCount > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono-num leading-none ${
                  tab === 'tickets'
                    ? 'bg-white text-indigo-700'
                    : 'bg-[#D4A853] text-[#0B0B0E]'
                }`}
              >
                {openTicketsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setTab('reports')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
              tab === 'reports'
                ? 'bg-indigo-500 text-white'
                : 'text-[#A6A196] hover:text-[#F5F2EB]'
            }`}
          >
            <Flag className="w-3.5 h-3.5" />
            <span>البلاغات الواردة</span>
            {pendingReportsCount > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono-num leading-none ${
                  tab === 'reports'
                    ? 'bg-white text-indigo-700'
                    : 'bg-amber-400 text-[#0B0B0E]'
                }`}
              >
                {pendingReportsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setTab('monitor')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
              tab === 'monitor'
                ? 'bg-indigo-500 text-white'
                : 'text-[#A6A196] hover:text-[#F5F2EB]'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>المراقبة والسجل</span>
          </button>
        </div>
      </div>

      {/* TAB 1: Confidential Staff Chat Room (Stacked cleanly above Roster Grid) */}
      {tab === 'chat' && (
        <div className="space-y-5">
          {/* Chat Stream */}
          <div
            className={`bg-[#141419] border border-[#27272F] rounded-2xl overflow-hidden flex flex-col ${
              staffChatCollapsed ? '' : 'h-[380px] sm:h-[440px]'
            }`}
          >
            <div className="px-4 sm:px-5 py-3.5 border-b border-[#23232C] flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <ShieldCheck className="w-5 h-5 text-indigo-300 shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-[#F5F2EB] truncate">
                    غرفة النقاش السري للإدارة والإشراف
                  </h2>
                  <p className="text-[11px] text-[#9C968B] truncate">
                    الرسائل هنا محصورة بطاقم الإدارة والإشراف فقط
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-mono-num tabular-nums text-[#9C968B] whitespace-nowrap">
                  {staffMessages.length} رسالة
                </span>
                <button
                  type="button"
                  onClick={() => setStaffChatCollapsed((v) => !v)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    staffChatCollapsed
                      ? 'bg-[#D4A853] border-[#D4A853] text-[#0B0B0E]'
                      : 'bg-[#1A1A22] hover:bg-[#23232E] border-[#2C2C35] text-[#F5F2EB]'
                  }`}
                >
                  {staffChatCollapsed ? (
                    <>
                      <Eye className="w-3.5 h-3.5" />
                      <span>إظهار الشات</span>
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3.5 h-3.5 text-[#D4A853]" />
                      <span>إخفاء الشات</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {staffChatCollapsed ? (
              <div className="p-6 text-center space-y-3 bg-[#101015]">
                <p className="text-xs text-[#9C968B]">
                  تم طي وإخفاء محتوى الدردشة السرية لتقليل ازدحام الشاشة ({staffMessages.length} رسالة).
                </p>
                <button
                  type="button"
                  onClick={() => setStaffChatCollapsed(false)}
                  className="px-4 py-2 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>إظهار الدردشة</span>
                </button>
              </div>
            ) : (
              <>
                <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
                  {staffMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center text-[#8B857B] space-y-2">
                      <MessageSquareLock className="w-8 h-8 opacity-45 text-indigo-300" />
                      <p className="text-sm font-semibold text-[#F5F2EB]">
                        غرفة الإشراف السرية جاهزة للتنسيق
                      </p>
                      <p className="text-xs max-w-sm">
                        ابدأ نقاشاً مع الطاقم والمؤسس حول التكتات، المهام، أو الحالات التي تحتاج مراجعة.
                      </p>
                    </div>
                  ) : (
                    staffMessages.map((msg) => {
                      const isOwn = msg.senderId === currentUser.uid;
                      const profile = users.find((u) => u.uid === msg.senderId);
                      const displayRoles = profile
                        ? getUserRoles(profile)
                        : [msg.senderRole];
                      const roleToShow = displayRoles[0];
                      const canDelete = isOwn || isSuperAdmin;

                      return (
                        <div
                          key={msg.id}
                          className={`flex items-start gap-3 group ${
                            isOwn ? 'flex-row-reverse' : ''
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => onOpenProfile(msg.senderId)}
                            className="shrink-0 cursor-pointer"
                          >
                            <Avatar
                              src={profile?.photoURL || msg.senderPhoto}
                              name={profile?.displayName || msg.senderName}
                              size="sm"
                              role={roleToShow}
                              roles={displayRoles}
                              avatarFrame={profile?.avatarFrame}
                              avatarFrameExpiresAt={profile?.avatarFrameExpiresAt}
                            />
                          </button>

                          <div className="max-w-[78%] space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => onOpenProfile(msg.senderId)}
                                className={`text-xs font-bold hover:underline cursor-pointer ${getEffectiveNameColorClass(
                                  profile,
                                  roleToShow
                                )}`}
                              >
                                {profile?.displayName || msg.senderName}
                              </button>
                              <VipSilverStar roles={displayRoles} size="xs" />
                              <RoleBadgesList roles={displayRoles} size="xs" />
                              {(() => {
                                const senderLive = getEffectiveLiveStatus(
                                  profile,
                                  isOwn && profile?.liveStatus !== 'offline',
                                  nowTick
                                );
                                const msgTime = formatMessageTime(msg.createdAt, nowTick);
                                const statusText =
                                  senderLive.status === 'offline'
                                    ? profile?.lastActiveAt
                                      ? `أوفلاين · آخر ظهور ${formatLastSeen(profile.lastActiveAt, nowTick)}`
                                      : 'أوفلاين'
                                    : senderLive.label;
                                return (
                                  <>
                                    <span
                                      title={
                                        profile?.lastActiveAt
                                          ? formatFullDateTime(profile.lastActiveAt)
                                          : senderLive.label
                                      }
                                      className={`inline-flex items-center gap-1 text-[10px] font-semibold ${senderLive.textClass}`}
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full ${senderLive.dotClass}`} />
                                      {statusText}
                                    </span>
                                    {msgTime && (
                                      <span
                                        title={formatFullDateTime(msg.createdAt)}
                                        className="text-[10px] font-mono-num text-[#8B857B] whitespace-nowrap"
                                      >
                                        · {msgTime}
                                      </span>
                                    )}
                                  </>
                                );
                              })()}
                              {msg.edited && (
                                <span className="text-[10px] text-[#8B857B]">(معدّلة)</span>
                              )}
                            </div>

                            {editingMsgId === msg.id ? (
                              <div className="flex items-center gap-2 bg-[#1D1D26] border border-indigo-400 rounded-xl p-2">
                                <input
                                  type="text"
                                  maxLength={1200}
                                  value={editingMsgText}
                                  onChange={(e) => setEditingMsgText(e.target.value)}
                                  className="bg-transparent text-xs text-[#F5F2EB] outline-none min-w-[160px] flex-1"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveStaffEdit(msg)}
                                  className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded cursor-pointer"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingMsgId(null)}
                                  className="p-1 text-[#9C968B] hover:text-white rounded cursor-pointer"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <div
                                className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words ${
                                  roleToShow === 'admin'
                                    ? 'bg-[#1D1A12] border border-[#D4A853]/45 text-[#F5F2EB]'
                                    : 'bg-[#171929] border border-indigo-400/35 text-[#E8EAF6]'
                                }`}
                              >
                                {msg.text}
                              </div>
                            )}

                            <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity pt-0.5">
                              {isOwn && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingMsgId(msg.id);
                                    setEditingMsgText(msg.text);
                                  }}
                                  title="تعديل"
                                  className="p-1 text-[11px] text-[#9C968B] hover:text-[#D4A853] cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteMsg(msg)}
                                                          title="حذف الرسالة"
                                  className="p-1 text-[11px] text-[#9C968B] hover:text-red-400 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatBottomRef} />
                </div>

                <form
                  onSubmit={handleSendStaffMsg}
                  className="shrink-0 p-3 border-t border-[#23232C] bg-[#121217] flex items-center gap-2"
                >
                  <input
                    type="text"
                    maxLength={1200}
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    placeholder="اكتب رسالة سرية للمشرفين والمؤسس..."
                    className="flex-1 min-w-0 bg-[#1A1A22] border border-[#2C2C35] focus:border-indigo-400 rounded-xl px-3.5 py-2.5 text-sm text-[#F5F2EB] placeholder:text-[#6B665E] outline-none"
                  />
                  <button
                    type="submit"
                    disabled={sendingChat || !chatText.trim()}
                    className="px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    <span>إرسال سري</span>
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </>
            )}
          </div>

          {/* Staff Team Roster Grid Positioned Cleanly Below Chat Box */}
          <section className="bg-[#141419] border border-[#27272F] rounded-2xl p-4 sm:p-5 space-y-3.5">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#22222A]">
              <h3 className="text-sm font-extrabold text-[#F5F2EB]">
                فريق الإدارة والإشراف
              </h3>
              <span className="text-xs font-mono-num tabular-nums text-indigo-300 whitespace-nowrap">
                {staffMembers.length} عضو
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {staffMembers.map((member) => {
                const online =
                  member.uid === currentUser.uid || isUserCurrentlyOnline(member, nowTick);
                const memberRoles = getUserRoles(member);
                const primaryRole = memberRoles[0];
                const meta = getRoleMeta(primaryRole);
                return (
                  <button
                    key={member.uid}
                    type="button"
                    onClick={() => onOpenProfile(member.uid)}
                    className={`w-full text-right flex items-center gap-3 p-3 rounded-xl border border-[#24242E] hover:bg-[#1B1B24] transition-colors cursor-pointer ${meta.rowAccentClass}`}
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
                        className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-[#141419] ${
                          online ? 'bg-emerald-400' : 'bg-[#5E5A54]'
                        }`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`text-xs font-bold truncate ${getEffectiveNameColorClass(
                            member
                          )}`}
                        >
                          {member.displayName}
                        </span>
                        <VipSilverStar roles={memberRoles} size="xs" />
                        <RoleBadgesList roles={memberRoles} size="xs" compact />
                      </div>
                      <div
                        className={`text-[10px] font-semibold mt-0.5 truncate ${
                          online ? 'text-emerald-400' : 'text-[#8B857B]'
                        }`}
                      >
                        {online
                          ? 'متصل الآن'
                          : `أوفلاين · آخر ظهور ${formatLastSeen(member.lastActiveAt, nowTick)}`}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* TAB 1B: All Chat Rooms Directory (Global + Every Country) */}
      {tab === 'rooms' && (
        <div className="space-y-5">
          <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-[#F5F2EB] flex items-center gap-2">
                <Globe className="w-5 h-5 text-[#D4A853]" />
                <span>غرف الدردشة العامة والمحلية لجميع الدول</span>
              </h2>
              <p className="text-xs text-[#9C968B]">
                صلاحية إشرافية كاملة للاطلاع على الدردشة العامة العالمية ودردشات كل الدول ومراقبتها.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#8B857B] absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={roomsSearch}
                  onChange={(e) => setRoomsSearch(e.target.value)}
                  placeholder="بحث باسم الدولة..."
                  className="bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl pr-8 pl-3 py-2 text-xs text-[#F5F2EB] outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => setRoomsPreviewCollapsed((v) => !v)}
                className={`px-3.5 py-2 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
                  roomsPreviewCollapsed
                    ? 'bg-[#D4A853] border-[#D4A853] text-[#0B0B0E]'
                    : 'bg-[#1A1A22] hover:bg-[#23232E] border-[#2C2C35] text-[#F5F2EB]'
                }`}
              >
                {roomsPreviewCollapsed ? (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    <span>إظهار المعاينات</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-[#D4A853]" />
                    <span>إخفاء المعاينات</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Global Chat Card */}
          <div className="bg-[#141419] border border-[#D4A853]/40 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-sky-400 shrink-0" />
                <h3 className="text-sm font-extrabold text-[#F5F2EB]">
                  الدردشة العامة (كل الدول)
                </h3>
                <span className="text-xs font-mono-num text-[#D4A853]">
                  ({chatRoomsOverview.globalMsgs.length} رسالة)
                </span>
              </div>
              {!roomsPreviewCollapsed && (
                <p className="text-xs text-[#A6A196] truncate">
                  {chatRoomsOverview.globalMsgs[0]
                    ? `آخر رسالة من ${chatRoomsOverview.globalMsgs[0].senderName}: ${chatRoomsOverview.globalMsgs[0].text}`
                    : 'لا توجد رسائل في الدردشة العالمية حتى الآن.'}
                </p>
              )}
            </div>
            {onOpenCommunityRoom && (
              <button
                type="button"
                onClick={() => onOpenCommunityRoom('global')}
                className="px-4 py-2 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>فتح الدردشة العامة</span>
              </button>
            )}
          </div>

          {/* Country Rooms Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {chatRoomsOverview.countryRooms
              .filter(({ country }) => {
                const q = roomsSearch.trim().toLowerCase();
                if (!q) return true;
                return (
                  country.nameAr.toLowerCase().includes(q) ||
                  country.nameEn.toLowerCase().includes(q) ||
                  country.code.toLowerCase().includes(q)
                );
              })
              .map(({ country, count, latest, membersCount }) => (
                <div
                  key={country.code}
                  className="bg-[#141419] border border-[#27272F] rounded-2xl p-4 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <CountryFlag code={country.code} size="sm" />
                        <span className="text-sm font-bold text-[#F5F2EB] truncate">
                          {country.nameAr}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono-num text-[#9C968B] shrink-0">
                        {count} رسالة · {membersCount} عضو
                      </span>
                    </div>
                    {!roomsPreviewCollapsed && (
                      <p className="text-xs text-[#9C968B] line-clamp-2 min-h-[32px]">
                        {latest
                          ? `${latest.senderName}: ${latest.text}`
                          : 'لا توجد رسائل محلية في هذه الغرفة بعد.'}
                      </p>
                    )}
                  </div>

                  {onOpenCommunityRoom && (
                    <button
                      type="button"
                      onClick={() => onOpenCommunityRoom('local', country.code)}
                      className="w-full py-2 px-3 rounded-xl bg-[#1B1B24] hover:bg-[#D4A853] hover:text-[#0B0B0E] border border-[#2C2C35] text-xs font-bold text-[#F5F2EB] inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>دخول ومراقبة الغرفة</span>
                    </button>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* TAB 2: New Moderators Guide (Missions & Laws) */}
      {tab === 'guide' && (
        <div className="space-y-6">
          <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-[#F5F2EB] flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#D4A853]" />
                <span>دليل المشرفين الجدد — المهام والقوانين المعتمدة</span>
              </h2>
              <p className="text-xs text-[#9C968B]">
                مرجع شامل يوضح مهام الإشراف اليومية، حدود الصلاحيات، وضوابط حفظ سرية المنصة والتعامل مع التكتات.
              </p>
            </div>

            {isSuperAdmin && (
              <button
                type="button"
                onClick={openCreateGuide}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-bold shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة قاعدة أو توجيه جديد</span>
              </button>
            )}
          </div>

          {/* Core Handbook Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {CORE_MODERATOR_GUIDE.map((section) => (
              <section
                key={section.title}
                className="bg-[#141419] border border-[#27272F] rounded-2xl p-5 space-y-3"
              >
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#22222A]">
                  <h3 className="text-sm font-bold text-[#F5F2EB]">{section.title}</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-400/35 text-indigo-200">
                    {GUIDE_CATEGORY_LABELS[section.category]}
                  </span>
                </div>
                <ul className="space-y-2.5">
                  {section.points.map((pt, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2.5 text-xs text-[#D6D1C7] leading-relaxed"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[#D4A853] mt-1.5 shrink-0" />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {/* Super Admin Dynamic Guidelines */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#D4A853]">
                توجيهات وقرارات المؤسس المحدّثة ({staffGuidelines.length})
              </h3>
            </div>

            {staffGuidelines.length === 0 ? (
              <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-6 text-center text-xs text-[#8B857B]">
                لا توجد توجيهات إضافية مخصصة بعد. يلتزم الطاقم بالقواعد الأساسية المعتمدة أعلاه.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {staffGuidelines.map((g) => (
                  <article
                    key={g.id}
                    className="bg-[#141419] border border-[#D4A853]/35 rounded-2xl p-5 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold text-[#D4A853]">
                          {GUIDE_CATEGORY_LABELS[g.category]}
                        </span>
                        <h4 className="text-sm font-bold text-[#F5F2EB] mt-0.5">
                          {g.title}
                        </h4>
                      </div>
                      {isSuperAdmin && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditGuide(g)}
                            className="p-1.5 rounded-lg text-[#9C968B] hover:text-[#D4A853] cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteGuide(g)}
                            className="p-1.5 rounded-lg text-[#9C968B] hover:text-red-400 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-[#D6D1C7] leading-relaxed whitespace-pre-wrap">
                      {g.content}
                    </p>
                    <div className="text-[10px] text-[#8B857B] pt-1 border-t border-[#22222A]">
                      بقلم المؤسس: {g.authorName}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Integrated Tickets & Complaints Center */}
      {tab === 'tickets' && (
        <TicketsView
          currentUser={currentUser}
          isSuperAdmin={isSuperAdmin}
          users={users}
          tickets={tickets}
          selectedTicketId={selectedTicketId}
          onSelectTicket={onSelectTicket}
          onOpenProfile={onOpenProfile}
          embedded
        />
      )}

      {/* TAB: UGC Content Moderation Reports Queue */}
      {tab === 'reports' && (
        <div className="bg-[#141419] border border-[#27272F] rounded-2xl overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-[#22222A] flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[#F5F2EB] flex items-center gap-2">
                <Flag className="w-4 h-4 text-amber-400" />
                <span>بلاغات المحتوى والمستخدمين ({contentReports.length})</span>
              </h2>
              <p className="text-xs text-[#9C968B] mt-0.5">
                مراجعة فورية لبلاغات الأعضاء على الرسائل والصور والملفات واتخاذ القرار المناسب.
              </p>
            </div>
          </div>

          {contentReports.length === 0 ? (
            <div className="p-10 text-center text-xs text-[#8B857B] space-y-2">
              <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400/60" />
              <p>لا توجد بلاغات واردة حالياً.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#22222A]">
              {contentReports.map((r) => (
                <div key={r.id} className="p-4 sm:p-5 space-y-3 hover:bg-[#181820]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`px-2 py-0.5 rounded-lg font-bold text-[11px] ${
                          r.status === 'pending'
                            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/35'
                            : r.status === 'reviewed'
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/35'
                              : 'bg-[#22222C] text-[#9C968B]'
                        }`}
                      >
                        {r.status === 'pending'
                          ? 'بانتظار المراجعة'
                          : r.status === 'reviewed'
                            ? 'تمت المعالجة'
                            : 'مغلق'}
                      </span>
                      <span className="text-[#D4A853] font-bold">{r.category}</span>
                      <span className="text-[#6B665E]">·</span>
                      <span className="text-[#9C968B]">{r.targetType}</span>
                    </div>
                    <span className="text-[11px] font-mono-num text-[#8B857B]">
                      {formatMessageTime(r.createdAt, nowTick)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[#8B857B]">المبلِّغ: </span>
                      <button
                        type="button"
                        onClick={() => onOpenProfile(r.reporterId)}
                        className="font-bold text-[#F5F2EB] hover:text-[#D4A853] cursor-pointer"
                      >
                        {r.reporterName}
                      </button>
                    </div>
                    <div>
                      <span className="text-[#8B857B]">المبلَّغ عنه: </span>
                      <button
                        type="button"
                        onClick={() => onOpenProfile(r.targetOwnerId)}
                        className="font-bold text-red-300 hover:underline cursor-pointer"
                      >
                        {r.targetOwnerName}
                      </button>
                    </div>
                  </div>

                  {r.targetPreview && (
                    <div className="p-2.5 rounded-xl bg-[#101016] border border-[#24242E] text-xs text-[#C8C2B8]">
                      المحتوى: {r.targetPreview}
                    </div>
                  )}

                  {r.reason && (
                    <p className="text-xs text-[#E5DFD3] leading-relaxed">
                      <strong>تفاصيل البلاغ:</strong> {r.reason}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {r.status === 'pending' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleUpdateReportStatus(r, 'reviewed')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 text-xs font-bold cursor-pointer"
                        >
                          تمت المراجعة
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateReportStatus(r, 'dismissed')}
                          className="px-3 py-1.5 rounded-lg bg-[#22222C] hover:bg-[#2E2E3B] text-[#C8C2B8] text-xs font-semibold cursor-pointer"
                        >
                          إغلاق / تجاهل
                        </button>
                      </>
                    )}
                    {isSuperAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDeleteReport(r.id)}
                        className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-semibold cursor-pointer"
                      >
                        حذف السجل
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Monitoring Dashboard & Administrative Activity Log */}
      {tab === 'monitor' && (
        <div className="space-y-6">
          {/* Metrics Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-4">
              <div className="text-xs text-[#9C968B]">الطاقم الإداري المتصل</div>
              <div className="text-2xl font-extrabold font-mono-num text-indigo-300 mt-1">
                {monitorStats.activeStaffOnline} / {monitorStats.totalStaff}
              </div>
            </div>
            <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-4">
              <div className="text-xs text-[#9C968B]">تكتات مفتوحة للمتابعة</div>
              <div className="text-2xl font-extrabold font-mono-num text-[#D4A853] mt-1">
                {monitorStats.openTickets}
              </div>
            </div>
            <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-4">
              <div className="text-xs text-[#9C968B]">حسابات عليها قيود</div>
              <div className="text-2xl font-extrabold font-mono-num text-amber-400 mt-1">
                {monitorStats.restricted}
              </div>
            </div>
            <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-4">
              <div className="text-xs text-[#9C968B]">سجلات الإجراءات المسجلة</div>
              <div className="text-2xl font-extrabold font-mono-num text-emerald-400 mt-1">
                {monitorStats.totalLogs}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Quick Member Monitoring & Discipline */}
            <div className="lg:col-span-6 bg-[#141419] border border-[#27272F] rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-[#22222A] space-y-3">
                <h3 className="text-sm font-bold text-[#F5F2EB]">
                  لوحة مراقبة الأعضاء والانضباط الفوري
                </h3>
                <div className="relative">
                  <Search className="w-4 h-4 text-[#8B857B] absolute right-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="ابحث باسم العضو لمراقبة حالته..."
                    className="w-full bg-[#1A1A22] border border-[#2C2C35] rounded-xl py-2 pr-10 pl-3 text-xs text-[#F5F2EB] outline-none"
                  />
                </div>
              </div>

              <div className="max-h-[460px] overflow-y-auto divide-y divide-[#22222A]">
                {monitorUsers.map((u) => {
                  const online = u.uid === currentUser.uid || isUserCurrentlyOnline(u, nowTick);
                  const uRoles = getUserRoles(u);
                  const uPrimary = uRoles[0];
                  const targetIsStaff = isStaffMember(u, false);
                  const hierarchyOk =
                    isSuperAdmin ||
                    !targetIsStaff ||
                    getRoleHierarchyOrder(getPrimaryRole(currentUser)) <
                      getRoleHierarchyOrder(uPrimary);
                  const canDiscipline =
                    u.uid !== currentUser.uid &&
                    !hasRole(u, 'admin') &&
                    hierarchyOk &&
                    (allowMuteKick || allowBan);

                  return (
                    <div
                      key={u.uid}
                      className="p-3.5 flex flex-wrap items-center justify-between gap-2.5 hover:bg-[#191920]"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenProfile(u.uid)}
                        className="flex items-center gap-2.5 text-right min-w-0 cursor-pointer"
                      >
                        <Avatar
                          src={u.photoURL}
                          name={u.displayName}
                          size="sm"
                          role={uPrimary}
                          roles={uRoles}
                          avatarFrame={u.avatarFrame}
                          avatarFrameExpiresAt={u.avatarFrameExpiresAt}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-xs font-bold truncate ${getEffectiveNameColorClass(u)}`}>
                              {u.displayName}
                            </span>
                            <VipSilverStar roles={uRoles} size="xs" />
                            <RoleBadgesList roles={uRoles} size="xs" compact />
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] mt-0.5">
                            <span className={online ? 'text-emerald-400' : 'text-[#8B857B]'}>
                              {online ? 'متصل' : `أوفلاين · ${formatLastSeen(u.lastActiveAt, nowTick)}`}
                            </span>
                            <span aria-hidden="true" className="text-[#4A4A56]">·</span>
                            {u.isBanned ? (
                              <span className="text-red-400 font-bold">محظور</span>
                            ) : u.isMuted ? (
                              <span className="text-amber-400 font-bold">مكتوم</span>
                            ) : u.isKicked ? (
                              <span className="text-orange-400 font-bold">مطرود</span>
                            ) : (
                              <span className="text-emerald-400">سليم</span>
                            )}
                          </div>
                        </div>
                      </button>

                      {canDiscipline && (
                        <div className="flex items-center gap-1 shrink-0">
                          {allowMuteKick && (
                            <>
                              {u.isMuted ? (
                                <button
                                  type="button"
                                  onClick={() => handleToggleDiscipline(u, 'isMuted', false)}
                                  className="px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 text-[11px] font-semibold cursor-pointer"
                                >
                                  فك كتم
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setActionModal({ action: 'mute', target: u })
                                  }
                                  title="كتم"
                                  className="p-1.5 rounded-lg bg-amber-500/15 text-amber-300 cursor-pointer"
                                >
                                  <VolumeX className="w-3.5 h-3.5" />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() =>
                                  setActionModal({ action: 'kick', target: u })
                                }
                                title="طرد"
                                className="p-1.5 rounded-lg bg-orange-500/15 text-orange-300 cursor-pointer"
                              >
                                <UserX className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {allowBan && (
                            u.isBanned ? (
                              <button
                                type="button"
                                onClick={() => handleToggleDiscipline(u, 'isBanned', false)}
                                className="px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 text-[11px] font-semibold cursor-pointer"
                              >
                                رفع حظر
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setActionModal({ action: 'ban', target: u })
                                }
                                title="حظر"
                                className="p-1.5 rounded-lg bg-red-500/15 text-red-300 cursor-pointer"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Administrative Actions Log */}
            <div className="lg:col-span-6 bg-[#141419] border border-[#27272F] rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-[#22222A] space-y-3">
                <h3 className="text-sm font-bold text-[#F5F2EB]">
                  سجل الإجراءات الإدارية ({filteredLogs.length})
                </h3>
                <div className="relative">
                  <Search className="w-4 h-4 text-[#8B857B] absolute right-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="ابحث في السجل باسم المنفذ أو العضو أو الإجراء..."
                    className="w-full bg-[#1A1A22] border border-[#2C2C35] rounded-xl py-2 pr-10 pl-3 text-xs text-[#F5F2EB] outline-none"
                  />
                </div>
              </div>

              <div className="max-h-[460px] overflow-y-auto divide-y divide-[#22222A] p-4 space-y-1">
                {filteredLogs.length === 0 ? (
                  <p className="text-xs text-[#8B857B] text-center py-8">
                    لا توجد إجراءات إدارية مطابقة.
                  </p>
                ) : (
                  filteredLogs.map((log) => {
                    const actor = users.find((u) => u.uid === log.actorId);
                    const actorRoles = actor ? getUserRoles(actor) : null;
                    return (
                      <div key={log.id} className="py-3 space-y-1 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`font-bold ${
                                actor
                                  ? getEffectiveNameColorClass(actor)
                                  : 'text-[#D4A853]'
                              }`}
                            >
                              {actor?.displayName || log.actorName}
                            </span>
                            {actorRoles && <VipSilverStar roles={actorRoles} size="xs" />}
                            {actorRoles && <RoleBadgesList roles={actorRoles} size="xs" compact />}
                            <span className="text-[#F5F2EB]">{log.action}</span>
                            <span className="text-[#9C968B]">بحق</span>
                            <button
                              type="button"
                              onClick={() => onOpenProfile(log.targetUserId)}
                              className="font-bold text-[#F5F2EB] hover:text-[#D4A853] underline-offset-2 hover:underline cursor-pointer"
                            >
                              {log.targetUserName}
                            </button>
                          </div>
                          <span
                            title={formatFullDateTime(log.createdAt)}
                            className="text-[10px] font-mono-num text-[#8B857B]"
                          >
                            {formatMessageTime(log.createdAt, nowTick) ||
                              formatLastSeen(log.createdAt, nowTick)}
                          </span>
                        </div>
                        {log.reason && (
                          <div className="text-[11px] text-[#A6A196]">
                            السبب: {log.reason}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Super Admin Add/Edit Custom Guideline Modal */}
      {guideModalOpen && isSuperAdmin && (
        <div
          onClick={() => setGuideModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[#141419] border border-[#2C2C35] rounded-2xl p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#F5F2EB]">
                {editingGuide ? 'تعديل توجيه إشرافي' : 'إضافة قاعدة / توجيه للمشرفين'}
              </h3>
              <button
                type="button"
                onClick={() => setGuideModalOpen(false)}
                className="p-1 text-[#9C968B] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGuide} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#C8C2B8]">القسم</label>
                <select
                  value={guideCategory}
                  onChange={(e) =>
                    setGuideCategory(e.target.value as StaffGuidelineCategory)
                  }
                  className="w-full bg-[#1A1A22] border border-[#2C2C35] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F2EB] outline-none"
                >
                  <option value="duties">{GUIDE_CATEGORY_LABELS.duties}</option>
                  <option value="rules">{GUIDE_CATEGORY_LABELS.rules}</option>
                  <option value="tickets">{GUIDE_CATEGORY_LABELS.tickets}</option>
                  <option value="escalation">{GUIDE_CATEGORY_LABELS.escalation}</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#C8C2B8]">العنوان</label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={guideTitle}
                  onChange={(e) => setGuideTitle(e.target.value)}
                  placeholder="مثال: ضوابط التعامل مع البلاغات العاجلة"
                  className="w-full bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F2EB] outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#C8C2B8]">النص والتفاصيل</label>
                <textarea
                  required
                  rows={4}
                  maxLength={2000}
                  value={guideContent}
                  onChange={(e) => setGuideContent(e.target.value)}
                  placeholder="اكتب التعليمات والقواعد للمشرفين الجدد بوضوح..."
                  className="w-full bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F2EB] outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setGuideModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#1E1E26] text-xs text-[#F5F2EB] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingGuide}
                  className="px-5 py-2 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-bold cursor-pointer"
                >
                  {savingGuide ? 'جاري الحفظ...' : editingGuide ? 'حفظ التعديل' : 'نشر التوجيه'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Discipline Reason Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#141419] border border-[#2C2C35] rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-[#F5F2EB]">
              {actionModal.action === 'mute' && `كتم ${actionModal.target.displayName}`}
              {actionModal.action === 'kick' && `طرد ${actionModal.target.displayName}`}
              {actionModal.action === 'ban' && `حظر نهائي: ${actionModal.target.displayName}`}
            </h3>
            <form onSubmit={handleConfirmMonitorAction} className="space-y-4">
              <textarea
                required
                rows={3}
                maxLength={240}
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="اكتب السبب الواضح لهذا الإجراء..."
                className="w-full bg-[#1A1A22] border border-[#2C2C35] rounded-xl p-3 text-xs text-[#F5F2EB] outline-none resize-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActionModal(null)}
                  className="px-4 py-2 rounded-xl bg-[#1E1E26] text-xs text-[#F5F2EB] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold cursor-pointer"
                >
                  {submittingAction ? 'جاري التنفيذ...' : 'تأكيد'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Staff Chat Message */}
      <ConfirmModal
        open={Boolean(confirmDeleteMsg)}
        title="هل أنت متأكد من الحذف؟"
        message={
          confirmDeleteMsg
            ? `سيتم حذف الرسالة "${confirmDeleteMsg.text.slice(0, 80)}${
                confirmDeleteMsg.text.length > 80 ? '...' : ''
              }" من غرفة الإشراف السرية.`
            : ''
        }
        confirmLabel="نعم، حذف الرسالة"
        onCancel={() => setConfirmDeleteMsg(null)}
        onConfirm={() => {
          if (confirmDeleteMsg) {
            return handleDeleteStaffMsg(confirmDeleteMsg.id);
          }
        }}
      />

      {/* Confirm Delete Custom Guideline */}
      <ConfirmModal
        open={Boolean(confirmDeleteGuide)}
        title="هل أنت متأكد من الحذف؟"
        message={
          confirmDeleteGuide
            ? `سيتم حذف التوجيه "${confirmDeleteGuide.title}" من دليل المشرفين.`
            : ''
        }
        confirmLabel="نعم، حذف التوجيه"
        onCancel={() => setConfirmDeleteGuide(null)}
        onConfirm={() => {
          if (confirmDeleteGuide) {
            return handleDeleteGuide(confirmDeleteGuide);
          }
        }}
      />
    </div>
  );
};
                
