import React, { useMemo, useState } from 'react';
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  VolumeX,
  UserX,
  Ban,
  Search,
  Eye,
  Trash2,
  X,
  CheckCircle2,
  XCircle,
  Activity,
  BadgeCheck,
  ShieldAlert,
  Shield,
  Film,
  Sparkles,
  Crown,
  Coins,
  Palette,
  Frame,
  Plus,
  Edit3,
  ShoppingBag,
  KeyRound,
  Lock,
  Save,
} from 'lucide-react';
import {
  db,
  createSafeId,
  formatLastSeen,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import {
  ActivityLog,
  AvatarFrameKey,
  CommunityMessage,
  GalleryItem,
  NameColorKey,
  ProfilePost,
  RoleColorKey,
  RoleDefinition,
  RolePermissions,
  StoreConfig,
  StoreFeatureKey,
  UserProfile,
  UserRole,
  VerificationRequest,
const getUserHandle = (..._args: unknown[]) => ''; const isActiveSpecialId = (..._args: unknown[]) => false; const isValidUserId = (..._args: unknown[]) => true

import {
  Avatar,
  MultiRoleSelector,
  RoleBadgesList,
  RoleTag,
  VipSilverStar,
  formatRolesArabicSummary,
  getEffectiveNameColorClass,
  getPrimaryRole,
  getUserRoles,
  hasRole,
  normalizeUserRoles,
} from './Avatar';
import { assignMemberRoles } from '../utils/roleAssignment';
import {
  assertFounderActor,
  getAllRoleDefinitions,
  getRoleHierarchyOrder,
} from '../utils/roles';
import {
  MAX_TEXT_LENGTHS,
  sanitizePlainText,
} from '../utils/security';
import {
  AVATAR_FRAME_PRESETS,
  DEFAULT_STORE_CONFIG,
  NAME_COLOR_PRESETS,
  adminAdjustMemberCredits,
  adminGrantMemberPerk,
  adminUpdateMemberId,
  formatRemainingDuration,
  getActiveAvatarFrame,
  getActiveNameColor,
  resolveStoreConfig,
} from '../utils/store';
import { getEffectiveLiveStatus } from '../utils/gamification';
import {
  formatFullDateTime,
  formatMessageTime,
  useNowTick,
} from '../utils/time';
import { ConfirmModal } from './ConfirmModal';

interface AdminDashboardViewProps {
  currentUser: UserProfile;
  isSuperAdmin: boolean;
  users: UserProfile[];
  gallery: GalleryItem[];
  communityMessages: CommunityMessage[];
  posts: ProfilePost[];
  activityLogs: ActivityLog[];
  verificationRequests: VerificationRequest[];
  storeConfig?: StoreConfig | null;
  roleDefinitions?: RoleDefinition[];
  onOpenProfile: (uid: string) => void;
}

type AdminTab =
  | 'members'
  | 'roles'
  | 'store'
  | 'verifications'
  | 'logs'
  | 'content';

const PERMISSION_OPTIONS: { key: keyof RolePermissions; labelAr: string }[] = [
  { key: 'accessStaffRoom', labelAr: 'دخول غرفة الإدارة والإشراف السرية' },
  { key: 'viewAllChats', labelAr: 'الاطلاع على كافة غرف الدردشة (العامة والبلدان)' },
  { key: 'deleteMessages', labelAr: 'حذف الرسائل والمنشورات المخالفة' },
  { key: 'muteUsers', labelAr: 'كتم الأعضاء في الدردشة' },
  { key: 'kickUsers', labelAr: 'طرد الأعضاء من الدردشة' },
  { key: 'banUsers', labelAr: 'حظر الأعضاء نهائياً من المنصة' },
  { key: 'manageTickets', labelAr: 'استلام وإدارة التكتات والشكاوى' },
  { key: 'publishGallery', labelAr: 'النشر المباشر في المعرض العام' },
  { key: 'publishStories', labelAr: 'نشر الستوريات (24 ساعة)' },
  { key: 'receiveBookings', labelAr: 'استقبال حجوزات الزبائن' },
];

const ROLE_COLOR_CHOICES: { key: RoleColorKey; labelAr: string; dotClass: string }[] = [
  { key: 'gold', labelAr: 'ذهبي ملكي', dotClass: 'bg-[#D4A853]' },
  { key: 'crimson', labelAr: 'قرمزي', dotClass: 'bg-rose-400' },
  { key: 'indigo', labelAr: 'نيلي إشرافي', dotClass: 'bg-indigo-400' },
  { key: 'teal', labelAr: 'تركوازي', dotClass: 'bg-teal-400' },
  { key: 'silver', labelAr: 'فضي VIP', dotClass: 'bg-slate-200' },
  { key: 'amber', labelAr: 'كهرماني', dotClass: 'bg-amber-400' },
  { key: 'emerald', labelAr: 'زمردي', dotClass: 'bg-emerald-400' },
  { key: 'violet', labelAr: 'بنفسجي', dotClass: 'bg-violet-400' },
  { key: 'slate', labelAr: 'رمادي هادئ', dotClass: 'bg-slate-400' },
];

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  currentUser,
  isSuperAdmin,
  users,
  gallery,
  communityMessages,
  posts,
  activityLogs,
  verificationRequests,
  storeConfig,
  roleDefinitions = [],
  onOpenProfile,
}) => {
  const nowTick = useNowTick(20000);
  const [tab, setTab] = useState<AdminTab>('members');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole | 'story_creators'>('all');

  const [detailUser, setDetailUser] = useState<UserProfile | null>(null);
  const [roleModalUser, setRoleModalUser] = useState<UserProfile | null>(null);
  const [draftRoles, setDraftRoles] = useState<UserRole[]>(['customer']);
  const [draftCanPostStory, setDraftCanPostStory] = useState(false);
  const [savingRoles, setSavingRoles] = useState(false);

  // Dedicated ID & Special Number Modal
  const [idModalUser, setIdModalUser] = useState<UserProfile | null>(null);
  const [draftCustomId, setDraftCustomId] = useState('');
  const [draftIsSpecialId, setDraftIsSpecialId] = useState(false);
  const [draftSpecialLabel, setDraftSpecialLabel] = useState('');
  const [draftIdPermanent, setDraftIdPermanent] = useState(true);
  const [draftIdDays, setDraftIdDays] = useState(30);
  const [customIdError, setCustomIdError] = useState<string | null>(null);
  const [savingCustomId, setSavingCustomId] = useState(false);

  // Dedicated Credits & Free Perks Modal
  const [perkModalUser, setPerkModalUser] = useState<UserProfile | null>(null);
  const [creditMode, setCreditMode] = useState<'add' | 'deduct' | 'set'>('add');
  const [creditAmount, setCreditAmount] = useState(100);
  const [creditReason, setCreditReason] = useState('');
  const [savingCredits, setSavingCredits] = useState(false);

  const [grantColorKey, setGrantColorKey] = useState<NameColorKey>('gold_royal');
  const [grantColorPerm, setGrantColorPerm] = useState(true);
  const [grantColorDays, setGrantColorDays] = useState(14);

  const [grantFrameKey, setGrantFrameKey] = useState<AvatarFrameKey>('gold_crown');
  const [grantFramePerm, setGrantFramePerm] = useState(true);
  const [grantFrameDays, setGrantFrameDays] = useState(14);
  const [savingPerk, setSavingPerk] = useState(false);
  const [perkFeedback, setPerkFeedback] = useState<string | null>(null);

  // Roles & Permissions Builder State
  const [roleFormOpen, setRoleFormOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [newRoleId, setNewRoleId] = useState('');
  const [newRoleNameAr, setNewRoleNameAr] = useState('');
  const [newRoleShortAr, setNewRoleShortAr] = useState('');
  const [newRoleDescAr, setNewRoleDescAr] = useState('');
  const [newRoleColor, setNewRoleColor] = useState<RoleColorKey>('violet');
  const [newRoleOrder, setNewRoleOrder] = useState(10);
  const [newRolePerms, setNewRolePerms] = useState<RolePermissions>({});
  const [roleFormError, setRoleFormError] = useState<string | null>(null);
  const [savingRoleDef, setSavingRoleDef] = useState(false);
  const [confirmDeleteRoleDef, setConfirmDeleteRoleDef] = useState<RoleDefinition | null>(null);

  // Store Config Editor State
  const resolvedStore = useMemo(() => resolveStoreConfig(storeConfig), [storeConfig]);
  const [draftStore, setDraftStore] = useState<StoreConfig>(resolvedStore);
  const [reservedIdsInput, setReservedIdsInput] = useState(
    resolvedStore.reservedSpecialIds.join(', ')
  );
  const [savingStore, setSavingStore] = useState(false);
  const [storeFeedback, setStoreFeedback] = useState<string | null>(null);

  const syncDraftStoreFromLive = () => {
    const live = resolveStoreConfig(storeConfig);
    setDraftStore(live);
    setReservedIdsInput(live.reservedSpecialIds.join(', '));
  };

  // Restriction & Reject Verification & Content Delete Modals
  const [reasonModal, setReasonModal] = useState<{
    action: 'mute' | 'kick' | 'ban';
    target: UserProfile;
  } | null>(null);
  const [reasonText, setReasonText] = useState('');

  const [rejectReqModal, setRejectReqModal] = useState<VerificationRequest | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const [confirmDeleteContent, setConfirmDeleteContent] = useState<{
    col: 'gallery' | 'communityMessages' | 'posts';
    id: string;
    label: string;
  } | null>(null);

  if (!isSuperAdmin) {
    return (
      <div className="bg-[#141419] border border-red-500/35 rounded-2xl p-10 text-center space-y-3">
        <ShieldAlert className="w-10 h-10 text-red-400 mx-auto" />
        <h2 className="text-lg font-bold text-[#F5F2EB]">وصول مقصور على المؤسس</h2>
        <p className="text-xs text-[#9C968B]">
          هذه اللوحة مخصصة حصرياً لحساب المؤسس الأساسي للمنصة.
        </p>
      </div>
    );
  }

  const allRoleDefs = useMemo(() => getAllRoleDefinitions(), [roleDefinitions]);

  const pendingRequests = useMemo(
    () => verificationRequests.filter((r) => r.status === 'pending'),
    [verificationRequests]
  );

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => {
        if (roleFilter === 'story_creators') {
          if (!u.canPostStory && !hasRole(u, 'admin')) return false;
        } else if (roleFilter !== 'all' && !hasRole(u, roleFilter)) {
          return false;
        }
        if (!q) return true;
        return (
          u.displayName.toLowerCase().includes(q) ||
          getUserHandle(u, nowTick).toLowerCase().includes(q) ||
          (u.specialIdLabel || '').toLowerCase().includes(q) ||
          u.uid.toLowerCase().includes(q) ||
          (u.salonName || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const diff =
          getRoleHierarchyOrder(getPrimaryRole(a)) -
          getRoleHierarchyOrder(getPrimaryRole(b));
        if (diff !== 0) return diff;
        return a.displayName.localeCompare(b.displayName, 'ar');
      });
  }, [users, search, roleFilter, nowTick, roleDefinitions]);

  const stats = useMemo(() => {
    return {
      totalUsers: users.length,
      vipBarbers: users.filter((u) => hasRole(u, 'vip_barber')).length,
      verifiedBarbers: users.filter((u) => hasRole(u, 'barber_verified')).length,
      pendingVerifications: pendingRequests.length,
      restrictedCount: users.filter((u) => u.isBanned || u.isMuted).length,
    };
                       }, [users, pendingRequests.length]);

  const openIdModal = (u: UserProfile) => {
    setIdModalUser(u);
    setDraftCustomId(getUserHandle(u, nowTick));
    setDraftIsSpecialId(isActiveSpecialId(u, nowTick));
    setDraftSpecialLabel(u.specialIdLabel || '');
    setDraftIdPermanent(!u.specialIdExpiresAt);
    setDraftIdDays(30);
    setCustomIdError(null);
  };

  const openPerkModal = (u: UserProfile) => {
    setPerkModalUser(u);
    setCreditMode('add');
    setCreditAmount(100);
    setCreditReason('');
    setPerkFeedback(null);
    const activeC = getActiveNameColor(u, nowTick);
    if (activeC) setGrantColorKey(activeC);
    const activeF = getActiveAvatarFrame(u, nowTick);
    if (activeF) setGrantFrameKey(activeF);
  };

  const logAdminAction = async (
    targetUid: string,
    targetName: string,
    action: string,
    reason = ''
  ) => {
    const logId = createSafeId('log');
    await setDoc(doc(db, 'activityLogs', logId), {
      id: logId,
      actorId: currentUser.uid,
      actorName: currentUser.displayName,
      action,
      targetUserId: targetUid,
      targetUserName: targetName,
      reason,
      createdAt: serverTimestamp(),
    });
  };

  const handleToggleStoryPermission = async (
    target: UserProfile,
    nextValue: boolean
  ) => {
    assertFounderActor(currentUser, isSuperAdmin);
    if (target.uid === currentUser.uid || hasRole(target, 'admin')) return;
    try {
      await updateDoc(doc(db, 'users', target.uid), {
        canPostStory: nextValue,
        updatedAt: serverTimestamp(),
      });

      await logAdminAction(
        target.uid,
        target.displayName,
        nextValue ? 'منح صلاحية نشر الستوري' : 'سحب صلاحية نشر الستوري',
        nextValue
          ? 'تصريح يدوي من المؤسس لنشر ستوريات أوريليوس'
          : 'إيقاف صلاحية نشر الستوريات والاقتصار على المشاهدة'
      );

      const notifId = createSafeId('ntf');
      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        recipientId: target.uid,
        senderId: currentUser.uid,
        senderName: currentUser.displayName,
        type: 'role_update',
        title: nextValue
          ? 'تم منحك صلاحية نشر ستوريات أوريليوس'
          : 'تم تحديث صلاحية الستوريات',
        body: nextValue
          ? 'منحك المؤسس صلاحية نشر الستوريات (24 ساعة). يمكنك الآن إضافة ستوري جديد من قسم الستوريات.'
          : 'تم إيقاف صلاحية نشر الستوري الخاصة بك؛ لا يزال بإمكانك مشاهدة الستوريات والتفاعل والرد عليها.',
        targetView: 'stories',
        targetId: target.uid,
        read: false,
        createdAt: serverTimestamp(),
      });

      if (detailUser?.uid === target.uid) {
        setDetailUser({ ...detailUser, canPostStory: nextValue });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${target.uid}`);
    }
  };

  const openRoleModal = (target: UserProfile) => {
    setRoleModalUser(target);
    setDraftRoles(getUserRoles(target));
    setDraftCanPostStory(Boolean(target.canPostStory));
  };

  const handleSaveMultiRoles = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleModalUser) return;
    setSavingRoles(true);
    try {
      await assignMemberRoles(currentUser, roleModalUser, draftRoles, 'من لوحة التحكم');
      if (Boolean(roleModalUser.canPostStory) !== draftCanPostStory) {
        await handleToggleStoryPermission(roleModalUser, draftCanPostStory);
      }
      setRoleModalUser(null);
    } finally {
      setSavingRoles(false);
    }
  };

  const handleSaveCustomId = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idModalUser) return;
    const cleanHandle = normalizeUsernameInput(draftCustomId);
    if (!isValidUsername(cleanHandle)) {
      setCustomIdError(
        'صيغة الآيدي غير صالحة: استخدم أرقاماً أو أحرفاً إنجليزية صغيرة و (_) من 1 إلى 24 خانة.'
      );
      return;
    }
    const duplicate = users.find(
      (u) =>
        u.uid !== idModalUser.uid &&
        getUserHandle(u, nowTick).toLowerCase() === cleanHandle.toLowerCase()
    );
    if (duplicate) {
      setCustomIdError(
        `هذا المعرّف (@${cleanHandle}) مستخدم بالفعل للعضو ${duplicate.displayName}`
      );
      return;
    }

    setCustomIdError(null);
    setSavingCustomId(true);
    try {
      const duration =
        draftIsSpecialId && !draftIdPermanent
          ? Math.max(1, Math.min(365, Math.floor(draftIdDays || 30)))
          : null;
      await adminUpdateMemberId({
        actor: currentUser,
        target: idModalUser,
        newHandle: cleanHandle,
        isSpecialId: draftIsSpecialId,
        specialIdLabel: draftSpecialLabel,
        durationDays: duration,
      });
      setIdModalUser(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${idModalUser.uid}`);
    } finally {
      setSavingCustomId(false);
    }
  };

  const handleSubmitCreditAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!perkModalUser) return;
    setSavingCredits(true);
    setPerkFeedback(null);
    try {
      const next = await adminAdjustMemberCredits({
        actor: currentUser,
        target: perkModalUser,
        mode: creditMode,
        amount: creditAmount,
        reason: sanitizePlainText(creditReason, MAX_TEXT_LENGTHS.moderationReason),
      });
      setPerkModalUser({ ...perkModalUser, points: next });
      setPerkFeedback(`تم تحديث رصيد ${perkModalUser.displayName} إلى ${next} كريدت بنجاح.`);
      setCreditReason('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${perkModalUser.uid}`);
    } finally {
      setSavingCredits(false);
    }
  };

  const handleGrantPerk = async (
    perkType: 'name_color' | 'avatar_frame',
    value: string | null,
    permanent: boolean,
    days: number
  ) => {
    if (!perkModalUser) return;
    setSavingPerk(true);
    setPerkFeedback(null);
    try {
      await adminGrantMemberPerk({
        actor: currentUser,
        target: perkModalUser,
        perkType,
        value,
        durationDays: value && !permanent ? Math.max(1, Math.min(365, days)) : null,
      });
      setPerkFeedback(
        value
          ? perkType === 'name_color'
            ? 'تم تفعيل لون الاسم للعضو مجاناً.'
            : 'تم تفعيل إطار البروفايل للعضو مجاناً.'
          : perkType === 'name_color'
            ? 'تم سحب لون الاسم من العضو.'
            : 'تم سحب إطار البروفايل من العضو.'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${perkModalUser.uid}`);
    } finally {
      setSavingPerk(false);
    }
  };

  // Role Builder Handlers
  const openCreateRoleForm = () => {
    setEditingRoleId(null);
    setNewRoleId('');
    setNewRoleNameAr('');
    setNewRoleShortAr('');
    setNewRoleDescAr('');
    setNewRoleColor('violet');
    setNewRoleOrder(10);
    setNewRolePerms({});
    setRoleFormError(null);
    setRoleFormOpen(true);
  };

  const openEditRoleForm = (def: {
    id: string;
    nameAr: string;
    shortLabelAr: string;
    descriptionAr: string;
    colorKey: RoleColorKey;
    hierarchyOrder: number;
    permissions: RolePermissions;
  }) => {
    if (def.id === 'admin') return;
    setEditingRoleId(def.id);
    setNewRoleId(def.id);
    setNewRoleNameAr(def.nameAr);
    setNewRoleShortAr(def.shortLabelAr);
    setNewRoleDescAr(def.descriptionAr);
    setNewRoleColor(def.colorKey);
    setNewRoleOrder(def.hierarchyOrder);
    setNewRolePerms({ ...def.permissions });
    setRoleFormError(null);
    setRoleFormOpen(true);
  };

  const handleSaveRoleDef = async (e: React.FormEvent) => {
    e.preventDefault();
    assertFounderActor(currentUser, isSuperAdmin);
    const id = (editingRoleId || newRoleId)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_');

    if (!id || !/^[a-z0-9_-]{2,40}$/.test(id)) {
      setRoleFormError('معرّف الرتبة يجب أن يكون بالإنجليزية (حرفان على الأقل، أحرف صغيرة وأرقام و _).');
      return;
    }
    if (id === 'admin') {
      setRoleFormError('لا يمكن تعديل رتبة المؤسس الأساسية.');
      return;
    }
    const cleanRoleName = sanitizePlainText(newRoleNameAr, 40);
    if (!cleanRoleName) {
      setRoleFormError('أدخل اسم الرتبة بالعربية.');
      return;
    }

    setRoleFormError(null);
    setSavingRoleDef(true);
    try {
      const existing = allRoleDefs.find((r) => r.id === id);
      const isSystem = Boolean(existing?.isSystem);
      const cleanShort = sanitizePlainText(newRoleShortAr, 24) || cleanRoleName.slice(0, 24);
      const cleanDesc = sanitizePlainText(newRoleDescAr, 160);
      await setDoc(
        doc(db, 'roleDefinitions', id),
        {
          id,
          nameAr: cleanRoleName,
          shortLabelAr: cleanShort,
          descriptionAr: cleanDesc,
          colorKey: newRoleColor,
          hierarchyOrder: Math.max(1, Math.min(50, Math.floor(newRoleOrder || 10))),
          isSystem,
          permissions: newRolePerms,
          updatedById: currentUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await logAdminAction(
        currentUser.uid,
        cleanRoleName,
        editingRoleId ? `تعديل صلاحيات الرتبة (${id})` : `إنشاء رتبة جديدة (${id})`,
        cleanDesc
      );
      setRoleFormOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `roleDefinitions/${id}`);
    } finally {
      setSavingRoleDef(false);
    }
  };

  const handleDeleteCustomRole = async (def: RoleDefinition) => {
    assertFounderActor(currentUser, isSuperAdmin);
    if (def.isSystem || def.id === 'admin') return;
    try {
      await deleteDoc(doc(db, 'roleDefinitions', def.id));
      await logAdminAction(
        currentUser.uid,
        def.nameAr,
        `حذف رتبة مخصصة (${def.id})`,
        ''
      );
      setConfirmDeleteRoleDef(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `roleDefinitions/${def.id}`);
    }
  };

  // Store Config Save
  const handleSaveStoreConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    assertFounderActor(currentUser, isSuperAdmin);
    setSavingStore(true);
    setStoreFeedback(null);
    try {
      const parsedReserved = reservedIdsInput
        .split(/[\s,،]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => /^[a-z0-9_]{1,24}$/.test(s));

      const sanitizedItems: StoreConfig['items'] = {
        special_id: draftStore.items.special_id,
        name_color: draftStore.items.name_color,
        avatar_frame: draftStore.items.avatar_frame,
        chat_title: draftStore.items.chat_title || DEFAULT_STORE_CONFIG.items.chat_title,
        credit_pass: draftStore.items.credit_pass,
      };

      await setDoc(doc(db, 'storeConfig', 'current'), {
        id: 'current',
        dailyRewardCoins: Math.max(0, Math.min(100, Math.floor(draftStore.dailyRewardCoins || 25))),
        reservedSpecialIds:
          parsedReserved.length > 0
            ? Array.from(new Set(parsedReserved)).slice(0, 100)
            : DEFAULT_STORE_CONFIG.reservedSpecialIds,
        items: sanitizedItems,
        updatedById: currentUser.uid,
        createdAt: storeConfig?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setStoreFeedback('تم حفظ إعدادات المتجر والمكافآت وتطبيقها مباشرة على جميع الأعضاء.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'storeConfig/current');
    } finally {
      setSavingStore(false);
    }
  };

  const handleApproveVerification = async (req: VerificationRequest) => {
    assertFounderActor(currentUser, isSuperAdmin);
    try {
      await updateDoc(doc(db, 'verificationRequests', req.id), {
        status: 'approved',
        adminNote: 'تمت الموافقة والتوثيق',
        updatedAt: serverTimestamp(),
      });

      const targetUser = users.find((u) => u.uid === req.userId);
      const mergedRoles = normalizeUserRoles([
        ...(targetUser ? getUserRoles(targetUser) : []),
        'barber_verified',
      ]).filter((r) => r !== 'admin');
      const userUpdates: Record<string, unknown> = {
        role: mergedRoles[0] || 'barber_verified',
        roles: mergedRoles.length > 0 ? mergedRoles : ['barber_verified'],
        updatedAt: serverTimestamp(),
      };
      if (!targetUser?.salonName && req.salonName) {
        userUpdates.salonName = sanitizePlainText(req.salonName, MAX_TEXT_LENGTHS.salonName);
      }

      await updateDoc(doc(db, 'users', req.userId), userUpdates);
      await logAdminAction(
        req.userId,
        req.userName,
        'الموافقة على طلب توثيق حلاق',
        `الصالون: ${req.salonName}`
      );

      const notifId = createSafeId('ntf');
      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        recipientId: req.userId,
        senderId: currentUser.uid,
        senderName: currentUser.displayName,
        type: 'role_update',
        title: 'مبارك! تم توثيق حسابك كحلاق',
        body: `وافق المؤسس على طلب توثيق صالون "${req.salonName}". يمكنك الآن النشر في المعرض واستقبال الحجوزات.`,
        targetView: 'profile',
        targetId: req.userId,
        read: false,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `verificationRequests/${req.id}`
      );
    }
  };

  const handleRejectVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    assertFounderActor(currentUser, isSuperAdmin);
    if (!rejectReqModal) return;
    const req = rejectReqModal;
    const note =
      sanitizePlainText(rejectNote, MAX_TEXT_LENGTHS.moderationReason) ||
      'لم تستوفِ الشروط المطلوبة حالياً';
    try {
      await updateDoc(doc(db, 'verificationRequests', req.id), {
        status: 'rejected',
        adminNote: note,
        updatedAt: serverTimestamp(),
      });
      await logAdminAction(req.userId, req.userName, 'رفض طلب توثيق حلاق', note);

      const notifId = createSafeId('ntf');
      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        recipientId: req.userId,
        senderId: currentUser.uid,
        senderName: currentUser.displayName,
        type: 'role_update',
        title: 'تم رفض طلب التوثيق السابق',
        body: `تم رفض طلب توثيق صالون "${req.salonName}". السبب: ${note}`,
        targetView: 'profile',
        targetId: req.userId,
        read: false,
        createdAt: serverTimestamp(),
      });
      setRejectReqModal(null);
      setRejectNote('');
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `verificationRequests/${req.id}`
      );
    }
  };

  const handleToggleRestriction = async (
    target: UserProfile,
    field: 'isMuted' | 'isBanned' | 'isKicked',
    value: boolean,
    reason = ''
  ) => {
    assertFounderActor(currentUser, isSuperAdmin);
    if (hasRole(target, 'admin') || target.uid === currentUser.uid) return;
    const cleanReason = sanitizePlainText(reason, MAX_TEXT_LENGTHS.moderationReason);
    try {
      const reasonField =
        field === 'isMuted'
          ? 'muteReason'
          : field === 'isBanned'
            ? 'banReason'
            : 'kickReason';

      await updateDoc(doc(db, 'users', target.uid), {
        [field]: value,
        [reasonField]: value ? cleanReason : '',
        updatedAt: serverTimestamp(),
      });

      const labelMap = {
        isMuted: value ? 'كتم مستخدم' : 'فك كتم مستخدم',
        isBanned: value ? 'حظر نهائي' : 'إلغاء الحظر',
        isKicked: value ? 'طرد من الدردشة' : 'إزالة الطرد',
      };
      await logAdminAction(target.uid, target.displayName, labelMap[field], cleanReason);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${target.uid}`);
    }
  };

  const handleConfirmReasonAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reasonModal) return;
    const { action, target } = reasonModal;
    const clean =
      sanitizePlainText(reasonText, MAX_TEXT_LENGTHS.moderationReason) || 'قرار إداري';
    const field =
      action === 'mute' ? 'isMuted' : action === 'kick' ? 'isKicked' : 'isBanned';
    await handleToggleRestriction(target, field, true, clean);
    setReasonModal(null);
    setReasonText('');
  };

  const handleDeleteContent = async (
    col: 'gallery' | 'communityMessages' | 'posts',
    id: string
  ) => {
    assertFounderActor(currentUser, isSuperAdmin);
    try {
      await deleteDoc(doc(db, col, id));
      setConfirmDeleteContent(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${col}/${id}`);
    }
  };

  const adminTabs: { key: AdminTab; label: string; badge?: number }[] = [
    { key: 'members', label: 'الأعضاء والرتب' },
    { key: 'roles', label: 'الرتب والصلاحيات' },
    { key: 'store', label: 'المتجر والكريدت' },
    {
      key: 'verifications',
      label: 'طلبات التوثيق',
      badge: pendingRequests.length > 0 ? pendingRequests.length : undefined,
    },
    { key: 'logs', label: 'سجل النشاطات' },
    { key: 'content', label: 'مراقبة المحتوى' },
  ];

  return (
    <div className="space-y-5 w-full max-w-full overflow-x-hidden">
      {/* Header + Organized Top Tabs */}
      <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-[#D4A853]/18 border border-[#D4A853]/50 text-[11px] font-bold text-[#F5D67B] whitespace-nowrap">
                <Crown className="w-3.5 h-3.5" />
                <span>صلاحية المؤسس المطلقة 100%</span>
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#F5F2EB] mt-1.5">
              لوحة تحكم الإدارة والمؤسس
            </h1>
            <p className="text-xs sm:text-sm text-[#9C968B] mt-0.5">
              إدارة شاملة للأعضاء، الرتب والصلاحيات، الآيديات المميزة، المتجر والكريدت، والتوثيق.
            </p>
          </div>
        </div>

        {/* Clean Non-Clipping Tabs Grid/Wrap */}
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-[#0F0F14] border border-[#24242D] rounded-xl">
          {adminTabs.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setTab(t.key);
                  if (t.key === 'store') syncDraftStoreFromLive();
                }}
                className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#D4A853] text-[#0B0B0E]'
                    : 'bg-[#17171F] text-[#B6B0A4] hover:text-[#F5F2EB] hover:bg-[#1E1E28]'
                }`}
              >
                <span>{t.label}</span>
                {t.badge && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono-num tabular-nums leading-none ${
                      active ? 'bg-[#0B0B0E] text-[#D4A853]' : 'bg-red-500 text-white'
                    }`}
                  >
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Balanced KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-4">
          <div className="text-xs text-[#9C968B]">إجمالي الأعضاء</div>
          <div className="text-2xl font-extrabold font-mono-num tabular-nums text-[#F5F2EB] mt-1">
            {stats.totalUsers}
          </div>
        </div>
        <div className="bg-[#141419] border border-slate-300/35 rounded-2xl p-4">
          <div className="text-xs text-slate-300">حلاق خبير / VIP Barber</div>
          <div className="text-2xl font-extrabold font-mono-num tabular-nums text-slate-100 mt-1">
            {stats.vipBarbers}
          </div>
        </div>
        <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-4">
          <div className="text-xs text-[#9C968B]">الحلاقون الموثقون</div>
          <div className="text-2xl font-extrabold font-mono-num tabular-nums text-emerald-400 mt-1">
            {stats.verifiedBarbers}
          </div>
        </div>
        <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-4">
        <div className="text-xs text-[#9C968B]">طلبات التوثيق المعلقة</div>
          <div className="text-2xl font-extrabold font-mono-num tabular-nums text-[#D4A853] mt-1">
            {stats.pendingVerifications}
          </div>
        </div>
        <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-4 col-span-2 sm:col-span-1">
          <div className="text-xs text-[#9C968B]">الحسابات المقيدة</div>
          <div className="text-2xl font-extrabold font-mono-num tabular-nums text-red-400 mt-1">
            {stats.restrictedCount}
          </div>
        </div>
      </div>

      {/* TAB 1: Members & Ranks (Structured Member Cards) */}
      {tab === 'members' && (
        <div className="space-y-4">
          <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 sm:max-w-md">
              <Search className="w-4 h-4 text-[#8B857B] absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث باسم العضو أو @ID أو اسم الصالون..."
                className="w-full bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl py-2.5 pr-10 pl-3 text-xs text-[#F5F2EB] outline-none"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <select
                value={roleFilter}
                onChange={(e) =>
                  setRoleFilter(e.target.value as 'all' | UserRole | 'story_creators')
                }
                className="w-full sm:w-auto bg-[#1A1A22] border border-[#2C2C35] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F2EB] outline-none"
              >
                <option value="all">جميع الرتب ({users.length})</option>
                <option value="story_creators">مصرحون بنشر الستوري</option>
                {allRoleDefs.map((def) => (
                  <option key={def.id} value={def.id}>
                    {def.nameAr}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filteredUsers.length === 0 ? (
            <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-8 text-center text-xs text-[#8B857B]">
              لا يوجد أعضاء مطابقون لخيارات البحث الحالية.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUsers.map((u) => {
                const uRoles = getUserRoles(u);
                const primaryRole = uRoles[0];
                const isFounderAccount = hasRole(u, 'admin');
                const isProtected = u.uid === currentUser.uid || isFounderAccount;
                const handle = getUserHandle(u, nowTick);
                const specialActive = isActiveSpecialId(u, nowTick);
                const activeColorKey = getActiveNameColor(u, nowTick);
                const activeFrameKey = getActiveAvatarFrame(u, nowTick);
                const liveMeta = getEffectiveLiveStatus(
                  u,
                  u.uid === currentUser.uid && u.liveStatus !== 'offline',
                  nowTick
                );
                const online = liveMeta.status !== 'offline';

                return (
                  <div
                    key={u.uid}
                    className={`bg-[#141419] border rounded-2xl p-4 space-y-3 transition-colors ${
                      isFounderAccount
                        ? 'border-[#D4A853]/55 bg-gradient-to-l from-[#D4A853]/[0.06] to-transparent'
                        : 'border-[#27272F] hover:border-[#383844]'
                    }`}
                  >
                    {/* Header Row */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => onOpenProfile(u.uid)}
                        className="flex items-start gap-3 text-right min-w-0 cursor-pointer"
                      >
                        <Avatar
                          src={u.photoURL}
                          name={u.displayName}
                          size="md"
                          role={primaryRole}
                          roles={uRoles}
                          avatarFrame={u.avatarFrame}
                          avatarFrameExpiresAt={u.avatarFrameExpiresAt}
                        />
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`text-sm font-extrabold truncate ${getEffectiveNameColorClass(
                                u
                              )}`}
                            >
                              {u.displayName}
                            </span>
                            {u.countryCode && <CountryFlag code={u.countryCode} size="xs" />}
                            <VipSilverStar roles={uRoles} size="xs" />
                            <RoleBadgesList roles={uRoles} size="xs" compact />
                          </div>

                          <div className="flex items-center gap-2 flex-wrap text-[11px] text-[#9C968B]">
                            <span dir="ltr" className="font-mono-num text-[#D4A853] font-bold">
                              @{handle}
                            </span>
                            {specialActive && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#D4A853]/18 border border-[#D4A853]/45 text-[10px] font-bold text-[#FCE08B] whitespace-nowrap">
                                <Sparkles className="w-2.5 h-2.5" />
                                <span>{u.specialIdLabel || 'ID مميز'}</span>
                                <span className="text-[#D4A853]">
                                  ({formatRemainingDuration(u.specialIdExpiresAt, nowTick)})
                                </span>
                              </span>
                            )}
                            {u.salonName && (
                              <span className="text-[#C8C2B8] truncate max-w-[200px]">
                                صالون: {u.salonName}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>

                      {/* Status & Online Badge */}
                      <div className="flex items-center gap-2 flex-wrap shrink-0">
                        <span
                          title={
                            u.lastActiveAt ? formatFullDateTime(u.lastActiveAt) : liveMeta.label
                          }
                          className={`text-[11px] font-semibold whitespace-nowrap ${liveMeta.textClass}`}
                        >
                          {online
                            ? liveMeta.label
                            : `أوفلاين · ${formatLastSeen(u.lastActiveAt, nowTick)}`}
                        </span>
                        <span aria-hidden="true" className="text-[#4A4A56]">
                          ·
                        </span>
                        {isFounderAccount ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#D4A853]/18 border border-[#D4A853]/45 text-[11px] font-bold text-[#F5D67B] whitespace-nowrap">
                            <Lock className="w-3 h-3" />
                            <span>حساب المؤسس المحمي</span>
                          </span>
                        ) : u.isBanned ? (
                          <span className="text-xs text-red-400 font-bold whitespace-nowrap">
                            محظور نهائياً
                          </span>
                        ) : u.isMuted ? (
                          <span className="text-xs text-amber-400 font-bold whitespace-nowrap">
                            مكتوم
                          </span>
                        ) : u.isKicked ? (
                          <span className="text-xs text-orange-400 font-bold whitespace-nowrap">
                            مطرود
                          </span>
                        ) : (
                          <span className="text-xs text-emerald-400 font-semibold whitespace-nowrap">
                            حساب سليم
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Meta Strip: Credits, Perks, Story Permission */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#22222A] text-[11px]">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#1A1A22] border border-[#2B2B36] text-[#D4A853] font-bold font-mono-num tabular-nums whitespace-nowrap">
                        <Coins className="w-3.5 h-3.5" />
                        <span>{u.points || 0} كريدت</span>
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border whitespace-nowrap font-semibold ${
                          u.canPostStory || isFounderAccount
                            ? 'bg-[#D4A853]/12 border-[#D4A853]/35 text-[#F5D67B]'
                            : 'bg-[#181820] border-[#262630] text-[#8B857B]'
                        }`}
                      >
                        <Film className="w-3 h-3" />
                        <span>
                          {u.canPostStory || isFounderAccount
                            ? 'مصرح بنشر الستوري'
                            : 'الستوري: مشاهدة فقط'}
                        </span>
                      </span>

                      {activeColorKey && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#1A1A22] border border-[#2B2B36] text-[#F5F2EB] whitespace-nowrap">
                          <Palette className="w-3 h-3 text-[#D4A853]" />
                          <span>
                            لون: {NAME_COLOR_PRESETS[activeColorKey]?.labelAr} (
                            {formatRemainingDuration(u.nameColorExpiresAt, nowTick)})
                          </span>
                        </span>
                      )}

                      {activeFrameKey && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#1A1A22] border border-[#2B2B36] text-[#F5F2EB] whitespace-nowrap">
                          <Frame className="w-3 h-3 text-[#D4A853]" />
                          <span>
                            إطار: {AVATAR_FRAME_PRESETS[activeFrameKey]?.labelAr} (
                            {formatRemainingDuration(u.avatarFrameExpiresAt, nowTick)})
                          </span>
                        </span>
                      )}
                    </div>

                    {/* Uniform Action Controls */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[#22222A]">
                      {!isProtected && (
                        <>
                          <button
                            type="button"
                            onClick={() => openRoleModal(u)}
                            className="px-3 py-1.5 rounded-xl bg-[#1E1E28] hover:bg-[#D4A853] hover:text-[#0B0B0E] border border-[#2F2F3C] text-[11px] font-bold text-[#D4A853] inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                          >
                            <Shield className="w-3.5 h-3.5" />
                            <span>تعديل الرتب</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleToggleStoryPermission(u, !Boolean(u.canPostStory))
                            }
                            className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                              u.canPostStory
                                ? 'bg-[#D4A853]/18 border-[#D4A853]/55 text-[#F5D67B] hover:bg-red-500/15 hover:border-red-500/40 hover:text-red-300'
                                : 'bg-[#181820] border-[#2C2C38] text-[#B6B0A4] hover:border-[#D4A853]/50 hover:text-[#D4A853]'
                            }`}
                          >
                            <Film className="w-3.5 h-3.5" />
                            <span>{u.canPostStory ? 'سحب الستوري' : 'منح الستوري'}</span>
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => openIdModal(u)}
                        className="px-3 py-1.5 rounded-xl bg-[#1E1E28] hover:bg-[#2A2A36] border border-[#2F2F3C] text-[11px] font-bold text-[#F5D67B] inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>إدارة ID</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openPerkModal(u)}
                        className="px-3 py-1.5 rounded-xl bg-[#1E1E28] hover:bg-[#2A2A36] border border-[#2F2F3C] text-[11px] font-bold text-emerald-300 inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Coins className="w-3.5 h-3.5" />
                        <span>الكريدت والمزايا</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDetailUser(u)}
                        className="px-3 py-1.5 rounded-xl bg-[#1A1A22] hover:bg-[#252530] border border-[#2B2B36] text-[11px] font-bold text-[#F5F2EB] inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#D4A853]" />
                        <span>تفاصيل</span>
                      </button>

                      {!isProtected && (
                        <>
                          {u.isMuted ? (
                            <button
                              type="button"
                              onClick={() => handleToggleRestriction(u, 'isMuted', false)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-[11px] font-bold cursor-pointer whitespace-nowrap shrink-0"
                            >
                              فك الكتم
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setReasonModal({ action: 'mute', target: u })}
                              className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                            >
                              <VolumeX className="w-3.5 h-3.5" />
                              <span>كتم</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setReasonModal({ action: 'kick', target: u })}
                            className="px-3 py-1.5 rounded-xl bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            <span>طرد</span>
                          </button>

                          {u.isBanned ? (
                            <button
                              type="button"
                              onClick={() => handleToggleRestriction(u, 'isBanned', false)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-[11px] font-bold cursor-pointer whitespace-nowrap shrink-0"
                              >
                              رفع الحظر
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setReasonModal({ action: 'ban', target: u })}
                              className="px-3 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-300 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              <span>حظر</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Dynamic Roles & Permissions Manager */}
      {tab === 'roles' && (
        <div className="space-y-5">
          <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[#F5F2EB]">
                نظام الرتب المتدرج والصلاحيات المخصصة
              </h2>
              <p className="text-xs text-[#9C968B] mt-1">
                أي رتبة جديدة يتم إنشاؤها أو تعديل اسمها وصلاحياتها هنا تظهر وتُحدّث تلقائياً في صفحة «شرح الرتب والصلاحيات» والقوانين.
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateRoleForm}
              className="px-4 py-2.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء رتبة جديدة</span>
            </button>
          </div>

          {/* Pinned Immutable Founder Card */}
          <div className="bg-gradient-to-l from-[#D4A853]/15 via-[#171510] to-[#141419] border border-[#D4A853]/65 rounded-2xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <RoleTag role="admin" size="md" />
                <span className="text-xs font-bold text-[#F5D67B]">
                  الرتبة العليا الدائمة · الترتيب: 0
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#D4A853]/20 border border-[#D4A853]/50 text-[11px] font-extrabold text-[#FCE08B] whitespace-nowrap">
                <Lock className="w-3.5 h-3.5" />
                <span>محمية 100% — غير قابلة للتعديل أو التقييد</span>
              </span>
            </div>
            <p className="text-xs text-[#E5DEC9] leading-relaxed">
              أعلى رتبة في المنصة وصاحب الأساس، يمتلك صلاحيات مطلقة ودائمة على كافة أقسام التطبيق، إدارة الطاقم، الرتب، الكريدت، والمعرّفات (ID)، مع وصول دائم ومجاني غير محدود لجميع مزايا المتجر.
            </p>
          </div>

          {/* All Built-In & Custom Roles Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allRoleDefs
              .filter((def) => def.id !== 'admin')
              .map((def) => {
                const activePerms = PERMISSION_OPTIONS.filter(
                  (p) => Boolean(def.permissions[p.key])
                );
                const customRecord = roleDefinitions.find((r) => r.id === def.id);
                const canDelete = !def.isSystem && Boolean(customRecord);

                return (
                  <div
                    key={def.id}
                    className="bg-[#141419] border border-[#27272F] rounded-2xl p-4 flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <RoleTag role={def.id} size="sm" />
                            <span
                              dir="ltr"
                              className="text-[11px] font-mono-num text-[#8B857B]"
                            >
                              #{def.id}
                            </span>
                            <span className="text-[11px] font-mono-num tabular-nums text-[#9C968B]">
                              الترتيب: {def.hierarchyOrder}
                            </span>
                          </div>
                          <p className="text-xs text-[#B6B0A4]">{def.descriptionAr}</p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditRoleForm(def)}
                            title="تعديل الرتبة والصلاحيات"
                            className="p-2 rounded-xl bg-[#1C1C25] hover:bg-[#D4A853] hover:text-[#0B0B0E] text-[#D4A853] transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {canDelete && customRecord && (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteRoleDef(customRecord)}
                              title="حذف الرتبة المخصصة"
                              className="p-2 rounded-xl bg-[#1C1C25] hover:bg-red-500/20 text-red-400 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[#22222A]">
                        {activePerms.length === 0 ? (
                          <span className="text-[11px] text-[#7D7870]">
                            صلاحيات التصفح والعضوية الأساسية فقط
                          </span>
                        ) : (
                          activePerms.map((p) => (
                            <span
                              key={p.key}
                              className="px-2 py-0.5 rounded-md bg-[#1B1B24] border border-[#2C2C38] text-[10px] text-[#D6D1C7]"
                            >
                              {p.labelAr}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* TAB 3: Store & Credits Configuration */}
      {tab === 'store' && (
        <form onSubmit={handleSaveStoreConfig} className="space-y-5">
          <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[#F5F2EB] flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-[#D4A853]" />
                <span>إدارة أسعار المتجر المؤقت والكريدت والآيديات المحجوزة</span>
              </h2>
              <p className="text-xs text-[#9C968B] mt-1">
                عدّل تكلفة الشراء، مدة التفعيل بالأيام، تفعيل أو إيقاف كل ميزة، والمكافأة اليومية للأعضاء.
              </p>
            </div>
            <button
              type="submit"
              disabled={savingStore}
              className="px-5 py-2.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              <span>{savingStore ? 'جاري الحفظ...' : 'حفظ إعدادات المتجر'}</span>
            </button>
          </div>

          {storeFeedback && (
            <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-xs font-bold text-emerald-300">
              {storeFeedback}
            </div>
          )}

          {/* Global Economy Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-5 space-y-2">
              <label className="block text-xs font-bold text-[#F5F2EB]">
                مكافأة تسجيل الدخول اليومية (كريدت / يوم)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={draftStore.dailyRewardCoins}
                onChange={(e) =>
                  setDraftStore((prev) => ({
                    ...prev,
                    dailyRewardCoins: Number(e.target.value) || 0,
                  }))
                }
                className="w-full bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-sm font-mono-num tabular-nums text-[#D4A853] outline-none"
              />
              <p className="text-[11px] text-[#8B857B]">
                تُمنح تلقائياً للعضو مرة واحدة كل يوم عند فتح التطبيق (الحد الأقصى 100 كريدت).
              </p>
            </div>

            <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-5 space-y-2">
              <label className="block text-xs font-bold text-[#F5F2EB]">
                الآيديات المحجوزة للإدارة (Reserved IDs)
              </label>
              <input
                type="text"
                dir="ltr"
                value={reservedIdsInput}
                onChange={(e) => setReservedIdsInput(e.target.value)}
                placeholder="1, 7, 10, 77, 777, 999, 1000"
                className="w-full bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-xs font-mono-num text-[#F5F2EB] outline-none"
              />
              <p className="text-[11px] text-[#8B857B]">
                افصل بين الآيديات بفاصلة (،). هذه الآيديات + أي ID من خانة أو خانتين تبقى محجوزة للمؤسس فقط ولا تُباع في المتجر.
              </p>
            </div>
          </div>

          {/* Store Feature Items */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(['special_id', 'name_color', 'avatar_frame', 'chat_title', 'credit_pass'] as StoreFeatureKey[]).map((key) => {
              const item = draftStore.items[key] || DEFAULT_STORE_CONFIG.items[key]!;
              return (
                <div
                  key={key}
                  className="bg-[#141419] border border-[#27272F] rounded-2xl p-5 space-y-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-extrabold text-[#F5F2EB]">
                      {item.labelAr}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setDraftStore((prev) => ({
                          ...prev,
                          items: {
                            ...prev.items,
                            [key]: { ...item, enabled: !item.enabled },
                          },
                        }))
                      }
                      className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap ${
                        item.enabled
                          ? 'bg-emerald-500/20 border border-emerald-500/45 text-emerald-300'
                          : 'bg-[#1D1D26] border border-[#2D2D38] text-[#8B857B]'
                      }`}
                    >
                      {item.enabled ? 'مفعل في المتجر' : 'معطل مؤقتاً'}
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="block text-[11px] text-[#9C968B]">اسم الميزة بالعربية</label>
                      <input
                        type="text"
                        maxLength={60}
                        value={item.labelAr}
                        onChange={(e) =>
                          setDraftStore((prev) => ({
                            ...prev,
                            items: {
                              ...prev.items,
                              [key]: { ...item, labelAr: e.target.value },
                            },
                          }))
                        }
                        className="w-full bg-[#1A1A22] border border-[#2C2C35] rounded-xl px-3 py-2 text-xs text-[#F5F2EB] outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-[11px] text-[#9C968B]">السعر (كريدت)</label>
                        <input
                          type="number"
                          min={0}
                          max={100000}
                          value={item.price}
                          onChange={(e) =>
                            setDraftStore((prev) => ({
                              ...prev,
                              items: {
                                ...prev.items,
                                [key]: { ...item, price: Number(e.target.value) || 0 },
                              },
                            }))
                          }
                          className="w-full bg-[#1A1A22] border border-[#2C2C35] rounded-xl px-3 py-2 text-xs font-mono-num tabular-nums text-[#D4A853] outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[11px] text-[#9C968B]">المدة (أيام)</label>
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={item.durationDays}
                          onChange={(e) =>
                            setDraftStore((prev) => ({
                              ...prev,
                              items: {
                                ...prev.items,
                                [key]: {
                                  ...item,
            durationDays: Math.max(1, Number(e.target.value) || 1),
                                },
                              },
                            }))
                          }
                          className="w-full bg-[#1A1A22] border border-[#2C2C35] rounded-xl px-3 py-2 text-xs font-mono-num tabular-nums text-[#F5F2EB] outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </form>
      )}

      {/* TAB 4: Verification Requests */}
      {tab === 'verifications' && (
        <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold text-[#F5F2EB]">
              <BadgeCheck className="w-5 h-5 text-[#D4A853]" />
              <span>طلبات توثيق الحلاقين</span>
            </div>
            <span className="text-xs font-mono-num tabular-nums text-[#9C968B] whitespace-nowrap">
              {pendingRequests.length} بانتظار القرار
            </span>
          </div>

          {verificationRequests.length === 0 ? (
            <p className="text-xs text-[#8B857B] py-6 text-center">
              لا توجد طلبات توثيق مقدمة حتى الآن.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {verificationRequests.map((req) => (
                <div
                  key={req.id}
                  className="bg-[#1A1A22] border border-[#2A2A35] rounded-2xl p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenProfile(req.userId)}
                      className="flex items-center gap-2.5 text-right cursor-pointer min-w-0"
                    >
                      <Avatar src={req.userPhoto} name={req.userName} size="sm" />
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-[#F5F2EB] flex items-center gap-1.5 flex-wrap">
                          <span className="truncate">{req.userName}</span>
                          {req.countryCode && (
                            <CountryFlag code={req.countryCode} showName size="xs" />
                          )}
                        </div>
                        <div className="text-xs text-[#D4A853] font-semibold truncate">
                          {req.salonName}
                          {req.city ? ` · ${req.city}` : ''}
                        </div>
                      </div>
                    </button>

                    <span
                      className={`text-xs font-bold whitespace-nowrap shrink-0 ${
                        req.status === 'pending'
                          ? 'text-amber-400'
                          : req.status === 'approved'
                            ? 'text-emerald-400'
                            : 'text-red-400'
                      }`}
                    >
                      {req.status === 'pending'
                        ? 'قيد المراجعة'
                        : req.status === 'approved'
                          ? 'تم التوثيق'
                          : 'مرفوض'}
                    </span>
                  </div>

                  <p className="text-xs text-[#D6D1C7] leading-relaxed">{req.experience}</p>
                  {req.phoneOrSocial && (
                    <div className="text-[11px] text-[#9C968B]">
                      التواصل: <span className="text-[#F5F2EB]">{req.phoneOrSocial}</span>
                    </div>
                  )}
                  {req.adminNote && req.status !== 'pending' && (
                    <div className="text-[11px] text-[#A6A196] pt-1 border-t border-[#262630]">
                      ملاحظة الإدارة: {req.adminNote}
                    </div>
                  )}

                  {req.status === 'pending' && (
                    <div className="flex items-center gap-2 pt-2 border-t border-[#262630]">
                      <button
                        type="button"
                        onClick={() => handleApproveVerification(req)}
                        className="flex-1 py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#0B0B0E] text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>موافقة وتوثيق</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectReqModal(req);
                          setRejectNote('');
                        }}
                        className="flex-1 py-2 px-3 rounded-xl bg-red-500/15 hover:bg-red-500 text-red-300 hover:text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>رفض الطلب</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: Activity Logs */}
      {tab === 'logs' && (
        <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-[#F5F2EB]">
            <Activity className="w-4 h-4 text-[#D4A853]" />
            <span>سجل النشاطات والإشراف المباشر</span>
          </div>
          {activityLogs.length === 0 ? (
            <p className="text-xs text-[#8B857B]">لا توجد عمليات إشرافية مسجلة بعد.</p>
          ) : (
            <div className="divide-y divide-[#22222A]">
              {activityLogs.map((log) => (
                <div
                  key={log.id}
                  className="py-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <span className="font-bold text-[#D4A853]">{log.actorName}</span>{' '}
                    <span className="text-[#F5F2EB]">{log.action}</span>{' '}
                    <span className="text-[#9C968B]">بحق</span>{' '}
                    <span className="font-bold text-[#F5F2EB]">{log.targetUserName}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-[#A6A196]">
                    {log.reason && <span>السبب: {log.reason}</span>}
                    {log.createdAt && (
                      <span
                        title={formatFullDateTime(log.createdAt)}
                        className="font-mono-num text-[#8B857B] whitespace-nowrap"
                      >
                        {formatMessageTime(log.createdAt, nowTick)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 6: Content Moderation */}
      {tab === 'content' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-bold text-[#F5F2EB]">
              أعمال المعرض ({gallery.length})
            </h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {gallery.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between gap-2 p-2 rounded-xl bg-[#1A1A22]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={g.imageUrl}
                      alt={g.title}
                      className="w-10 h-10 rounded-lg object-cover shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#F5F2EB] truncate">
                        {g.title}
                      </div>
                      <div className="text-[11px] text-[#8B857B] truncate">
                        {g.barberName}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmDeleteContent({
                        col: 'gallery',
                        id: g.id,
                        label: `صورة المعرض "${g.title}"`,
                      })
                    }
                    className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-bold text-[#F5F2EB]">
              رسائل الدردشة ({communityMessages.length})
            </h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {communityMessages.map((m) => (
                <div
                  key={m.id}
                  className="flex items-start justify-between gap-2 p-2.5 rounded-xl bg-[#1A1A22]"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#D4A853]">{m.senderName}</div>
                    <p className="text-xs text-[#D6D1C7] break-words">{m.text}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmDeleteContent({
                        col: 'communityMessages',
                        id: m.id,
                        label: `رسالة "${m.senderName}"`,
                      })
                    }
                    className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-4 space-y-3">
            <h3 className="text-sm font-bold text-[#F5F2EB]">
              المنشورات الشخصية ({posts.length})
            </h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {posts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-start justify-between gap-2 p-2.5 rounded-xl bg-[#1A1A22]"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#F5F2EB]">{p.authorName}</div>
                    <p className="text-xs text-[#D6D1C7] break-words line-clamp-2">
                      {p.text}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmDeleteContent({
                        col: 'posts',
                        id: p.id,
                        label: `منشور "${p.authorName}"`,
                      })
                    }
                    className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Dedicated Member ID & Special Number Control */}
      {idModalUser && (
        <div
          onClick={() => setIdModalUser(null)}
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#141419] border border-[#D4A853]/45 rounded-2xl p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-[#D4A853]" />
                <h3 className="text-base font-bold text-[#F5F2EB]">
                  إدارة ID والرقم المميز: {idModalUser.displayName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIdModalUser(null)}
                className="p-1 text-[#9C968B] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomId} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#C8C2B8]">
                  المعرّف الجديد (@ID)
                          </label>
                <input
                  type="text"
                  dir="ltr"
                  maxLength={24}
                  value={draftCustomId}
                  onChange={(e) => {
                    setDraftCustomId(normalizeUsernameInput(e.target.value));
                    setCustomIdError(null);
                  }}
                  placeholder="777 أو king_barber"
                  className="w-full bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-sm font-mono-num text-[#F5F2EB] outline-none"
                />
                <p className="text-[11px] text-[#8B857B]">
                  يُسمح للمؤسس بتعيين أي رقم قصير أو معرّف إنجليزي مميز دون قيود.
                </p>
              </div>

              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#1A1A22] border border-[#2A2A35] cursor-pointer">
                <input
                  type="checkbox"
                  checked={draftIsSpecialId}
                  onChange={(e) => setDraftIsSpecialId(e.target.checked)}
                  className="accent-[#D4A853] w-4 h-4"
                />
                <span className="text-xs font-bold text-[#FCE08B]">
                  تمييز المعرّف كـ «آيدي مميز VIP» مع شارة بجانب الاسم
                </span>
              </label>

              {draftIsSpecialId && (
                <div className="space-y-3 p-3.5 rounded-xl bg-[#181820] border border-[#2B2B36]">
                  <div className="space-y-1">
                    <label className="block text-[11px] text-[#C8C2B8]">
                      وصف الشارة (اختياري)
                    </label>
                    <input
                      type="text"
                      maxLength={40}
                      value={draftSpecialLabel}
                      onChange={(e) => setDraftSpecialLabel(e.target.value)}
                      placeholder="رقم ذهبي / آيدي نادر"
                      className="w-full bg-[#121217] border border-[#2C2C35] rounded-lg px-3 py-2 text-xs text-[#F5F2EB] outline-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[11px] text-[#C8C2B8]">مدة التفعيل</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setDraftIdPermanent(true)}
                        className={`py-2 rounded-lg border text-xs font-bold cursor-pointer ${
                          draftIdPermanent
                            ? 'bg-[#D4A853] border-[#D4A853] text-[#0B0B0E]'
                            : 'bg-[#121217] border-[#2C2C35] text-[#B6B0A4]'
                        }`}
                      >
                        تفعيل دائم
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraftIdPermanent(false)}
                        className={`py-2 rounded-lg border text-xs font-bold cursor-pointer ${
                          !draftIdPermanent
                            ? 'bg-[#D4A853] border-[#D4A853] text-[#0B0B0E]'
                            : 'bg-[#121217] border-[#2C2C35] text-[#B6B0A4]'
                        }`}
                      >
                        مؤقت (أيام محددة)
                      </button>
                    </div>

                    {!draftIdPermanent && (
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={draftIdDays}
                          onChange={(e) => setDraftIdDays(Number(e.target.value) || 7)}
                          className="w-24 bg-[#121217] border border-[#2C2C35] rounded-lg px-3 py-1.5 text-xs font-mono-num tabular-nums text-[#F5F2EB] outline-none"
                        />
                        <span className="text-xs text-[#9C968B]">يوم قبل العودة تلقائياً للمعرّف السابق</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {customIdError && (
                <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/35 text-xs text-red-300">
                  {customIdError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-[#22222A]">
                <button
                  type="button"
                  onClick={() => setIdModalUser(null)}
                  className="px-4 py-2 rounded-xl bg-[#1E1E26] text-xs text-[#F5F2EB] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingCustomId}
                  className="px-5 py-2 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-extrabold cursor-pointer disabled:opacity-60"
                >
                  {savingCustomId ? 'جاري الحفظ...' : 'حفظ المعرّف'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Admin Credits & Free Perks Grant */}
      {perkModalUser && (
        <div
          onClick={() => setPerkModalUser(null)}
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[90dvh] overflow-y-auto bg-[#141419] border border-[#D4A853]/45 rounded-2xl p-5 sm:p-6 space-y-5 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-[#F5F2EB]">
                  إدارة الكريدت والمزايا المجانية: {perkModalUser.displayName}
                </h3>
                <p className="text-xs text-[#D4A853] font-mono-num tabular-nums mt-0.5">
                  الرصيد الحالي: {perkModalUser.points || 0} كريدت
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPerkModalUser(null)}
                className="p-1 text-[#9C968B] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {perkFeedback && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-xs font-bold text-emerald-300">
                {perkFeedback}
              </div>
            )}

            {/* Section A: Credits Adjustment */}
            <form
              onSubmit={handleSubmitCreditAdjustment}
              className="p-4 rounded-xl bg-[#1A1A22] border border-[#2A2A35] space-y-3"
            >
              <div className="text-xs font-extrabold text-[#D4A853] flex items-center gap-1.5">
                <Coins className="w-4 h-4" />
                <span>تعديل رصيد الكريدت</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { key: 'add', label: 'منح (+)' },
                    { key: 'deduct', label: 'خصم (-)' },
                    { key: 'set', label: 'تعيين رقم' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setCreditMode(m.key)}
                    className={`py-2 rounded-lg border text-xs font-bold cursor-pointer ${
                      creditMode === m.key
                        ? 'bg-[#D4A853] border-[#D4A853] text-[#0B0B0E]'
                        : 'bg-[#121217] border-[#2C2C35] text-[#B6B0A4]'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="number"
                  min={0}
                  max={1000000}
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="الكمية"
                  className="bg-[#121217] border border-[#2C2C35] rounded-xl px-3 py-2 text-xs font-mono-num tabular-nums text-[#F5F2EB] outline-none"
                />
                <input
                  type="text"
                  maxLength={100}
                  value={creditReason}
                  onChange={(e) => setCreditReason(e.target.value)}
                  placeholder="السبب (اختياري)"
                  className="bg-[#121217] border border-[#2C2C35] rounded-xl px-3 py-2 text-xs text-[#F5F2EB] outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={savingCredits}
                className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#0B0B0E] text-xs font-extrabold cursor-pointer disabled:opacity-60"
              >
                {savingCredits ? 'جاري التنفيذ...' : 'تطبيق تعديل الكريدت'}
              </button>
            </form>

            {/* Section B: Free Name Color Grant */}
            <div className="p-4 rounded-xl bg-[#1A1A22] border border-[#2A2A35] space-y-3">
              <div className="text-xs font-extrabold text-[#F5F2EB] flex items-center gap-1.5">
                <Palette className="w-4 h-4 text-[#D4A853]" />
                <span>منح أو سحب لون الاسم مجاناً</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(Object.keys(NAME_COLOR_PRESETS) as NameColorKey[]).map((key) => {
                  const preset = NAME_COLOR_PRESETS[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setGrantColorKey(key)}
                      className={`px-3 py-2 rounded-lg border flex items-center gap-2 text-right cursor-pointer ${
                        grantColorKey === key
                          ? 'bg-[#22222C] border-[#D4A853]'
                          : 'bg-[#121217] border-[#2C2C35]'
                      }`}
                    >
                      <span className={`w-3.5 h-3.5 rounded-full shrink-0 ${preset.swatchClass}`} />
                      <span className={`text-xs font-bold truncate ${preset.textClass}`}>
                        {preset.labelAr}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setGrantColorPerm(true)}
                  className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer ${
                    grantColorPerm
                      ? 'bg-[#D4A853] border-[#D4A853] text-[#0B0B0E]'
                      : 'bg-[#121217] border-[#2C2C35] text-[#B6B0A4]'
                  }`}
                >
                  دائم
                </button>
                <button
                  type="button"
                  onClick={() => setGrantColorPerm(false)}
                  className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer ${
                    !grantColorPerm
                      ? 'bg-[#D4A853] border-[#D4A853] text-[#0B0B0E]'
                      : 'bg-[#121217] border-[#2C2C35] text-[#B6B0A4]'
                  }`}
                >
                  مؤقت (أيام)
                </button>
                {!grantColorPerm && (
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={grantColorDays}
                    onChange={(e) => setGrantColorDays(Number(e.target.value) || 7)}
                    className="w-20 bg-[#121217] border border-[#2C2C35] rounded-lg px-2.5 py-1.5 text-xs font-mono-num text-[#F5F2EB] outline-none"
                  />
                )}
                <button
                  type="button"
                  disabled={savingPerk}
                  onClick={() =>
                    handleGrantPerk('name_color', grantColorKey, grantColorPerm, grantColorDays)
                  }
                  className="px-3.5 py-1.5 rounded-lg bg-[#D4A853] text-[#0B0B0E] text-[11px] font-extrabold cursor-pointer"
                >
                  منح اللون مجاناً
                </button>
                <button
                  type="button"
                  disabled={savingPerk}
                  onClick={() => handleGrantPerk('name_color', null, true, 0)}
                  className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-300 text-[11px] font-bold cursor-pointer"
                >
                  سحب
                </button>
              </div>
            </div>

            {/* Section C: Free Avatar Frame Grant */}
            <div className="p-4 rounded-xl bg-[#1A1A22] border border-[#2A2A35] space-y-3">
              <div className="text-xs font-extrabold text-[#F5F2EB] flex items-center gap-1.5">
                <Frame className="w-4 h-4 text-[#D4A853]" />
                <span>منح أو سحب إطار البروفايل مجاناً</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                             {(Object.keys(AVATAR_FRAME_PRESETS) as AvatarFrameKey[]).map((key) => {
                  const preset = AVATAR_FRAME_PRESETS[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setGrantFrameKey(key)}
                      className={`px-3 py-2 rounded-lg border flex items-center gap-2 text-right cursor-pointer ${
                        grantFrameKey === key
                          ? 'bg-[#22222C] border-[#D4A853]'
                          : 'bg-[#121217] border-[#2C2C35]'
                      }`}
                    >
                      <span className={`w-3.5 h-3.5 rounded-full shrink-0 ${preset.badgeClass}`} />
                      <span className="text-xs font-bold text-[#F5F2EB] truncate">
                        {preset.labelAr}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setGrantFramePerm(true)}
                  className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer ${
                    grantFramePerm
                      ? 'bg-[#D4A853] border-[#D4A853] text-[#0B0B0E]'
                      : 'bg-[#121217] border-[#2C2C35] text-[#B6B0A4]'
                  }`}
                >
                  دائم
                </button>
                <button
                  type="button"
                  onClick={() => setGrantFramePerm(false)}
                  className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer ${
                    !grantFramePerm
                      ? 'bg-[#D4A853] border-[#D4A853] text-[#0B0B0E]'
                      : 'bg-[#121217] border-[#2C2C35] text-[#B6B0A4]'
                  }`}
                >
                  مؤقت (أيام)
                </button>
                {!grantFramePerm && (
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={grantFrameDays}
                    onChange={(e) => setGrantFrameDays(Number(e.target.value) || 7)}
                    className="w-20 bg-[#121217] border border-[#2C2C35] rounded-lg px-2.5 py-1.5 text-xs font-mono-num text-[#F5F2EB] outline-none"
                  />
                )}
                <button
                  type="button"
                  disabled={savingPerk}
                  onClick={() =>
                    handleGrantPerk('avatar_frame', grantFrameKey, grantFramePerm, grantFrameDays)
                  }
                  className="px-3.5 py-1.5 rounded-lg bg-[#D4A853] text-[#0B0B0E] text-[11px] font-extrabold cursor-pointer"
                >
                  منح الإطار مجاناً
                </button>
                <button
                  type="button"
                  disabled={savingPerk}
                  onClick={() => handleGrantPerk('avatar_frame', null, true, 0)}
                  className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-300 text-[11px] font-bold cursor-pointer"
                >
                  سحب
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Create / Edit Role Definition */}
      {roleFormOpen && (
        <div
          onClick={() => setRoleFormOpen(false)}
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[90dvh] overflow-y-auto bg-[#141419] border border-[#D4A853]/45 rounded-2xl p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#F5F2EB]">
                {editingRoleId ? `تعديل رتبة: ${newRoleNameAr}` : 'إنشاء رتبة مخصصة جديدة'}
              </h3>
              <button
                type="button"
                onClick={() => setRoleFormOpen(false)}
                className="p-1 text-[#9C968B] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRoleDef} className="space-y-4">
              {!editingRoleId && (
                <div className="space-y-1">
                  <label className="block text-xs text-[#C8C2B8]">
                    معرّف الرتبة بالإنجليزية (مثال: supervisor_vip)
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    required
                    maxLength={40}
                    value={newRoleId}
                    onChange={(e) => setNewRoleId(e.target.value)}
                    placeholder="custom_rank"
                    className="w-full bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2 text-xs font-mono-num text-[#F5F2EB] outline-none"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs text-[#C8C2B8]">الاسم بالعربية</label>
                  <input
                    type="text"
                    required
                    maxLength={40}
                    value={newRoleNameAr}
                    onChange={(e) => setNewRoleNameAr(e.target.value)}
                    placeholder="مثال: مراقب نخبة"
                    className="w-full bg-[#1A1A22] border border-[#2C2C35] rounded-xl px-3.5 py-2 text-xs text-[#F5F2EB] outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs text-[#C8C2B8]">الاسم المختصر للشارة</label>
                  <input
                    type="text"
                    maxLength={24}
                    value={newRoleShortAr}
                    onChange={(e) => setNewRoleShortAr(e.target.value)}
                    placeholder="مثال: مراقب نخبة"
                    className="w-full bg-[#1A1A22] border border-[#2C2C35] rounded-xl px-3.5 py-2 text-xs text-[#F5F2EB] outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs text-[#C8C2B8]">وصف الصلاحية والدور</label>
                <input
                  type="text"
                  maxLength={160}
                  value={newRoleDescAr}
                  onChange={(e) => setNewRoleDescAr(e.target.value)}
                  placeholder="وصف مختصر لدور صاحب هذه الرتبة"
                  className="w-full bg-[#1A1A22] border border-[#2C2C35] rounded-xl px-3.5 py-2 text-xs text-[#F5F2EB] outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs text-[#C8C2B8]">لون الشارة</label>
                  <select
                    value={newRoleColor}
                    onChange={(e) => setNewRoleColor(e.target.value as RoleColorKey)}
                    className="w-full bg-[#1A1A22] border border-[#2C2C35] rounded-xl px-3 py-2 text-xs text-[#F5F2EB] outline-none"
                  >
                    {ROLE_COLOR_CHOICES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.labelAr}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs text-[#C8C2B8]">الترتيب الهرمي (1 إلى 50)</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={newRoleOrder}
                    onChange={(e) => setNewRoleOrder(Number(e.target.value) || 10)}
                    className="w-full bg-[#1A1A22] border border-[#2C2C35] rounded-xl px-3 py-2 text-xs font-mono-num text-[#F5F2EB] outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-[#D4A853]">
                  صلاحيات الرتبة
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PERMISSION_OPTIONS.map((opt) => {
                    const checked = Boolean(newRolePerms[opt.key]);
                    return (
                      <label
                        key={opt.key}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-[11px] cursor-pointer ${
                          checked
                            ? 'bg-[#D4A853]/12 border-[#D4A853]/50 text-[#F5F2EB]'
                            : 'bg-[#1A1A22] border-[#2A2A35] text-[#9C968B]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setNewRolePerms((prev) => ({
                              ...prev,
                              [opt.key]: e.target.checked,
                            }))
                          }
                          className="accent-[#D4A853]"
                        />
                        <span>{opt.labelAr}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {roleFormError && (
                <div className="p-2.5 rounded-xl bg-red-500/15 border border-red-500/35 text-xs text-red-300">
                  {roleFormError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-[#22222A]">
                <button
                  type="button"
                  onClick={() => setRoleFormOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#1E1E26] text-xs text-[#F5F2EB] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingRoleDef}
                  className="px-5 py-2 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-extrabold cursor-pointer disabled:opacity-60"
                >
                  {savingRoleDef ? 'جاري الحفظ...' : 'حفظ الرتبة والصلاحيات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Detailed Info Modal */}
      {detailUser &&
        (() => {
          const dRoles = getUserRoles(detailUser);
          const dPrimary = dRoles[0];
          return (
            <div
              onClick={() => setDetailUser(null)}
              className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md bg-[#141419] border border-[#2C2C35] rounded-2xl p-6 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar
                      src={detailUser.photoURL}
                      name={detailUser.displayName}
                      size="md"
                      role={dPrimary}
                      roles={dRoles}
                      avatarFrame={detailUser.avatarFrame}
                      avatarFrameExpiresAt={detailUser.avatarFrameExpiresAt}
                    />
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className={`text-base font-bold ${getEffectiveNameColorClass(detailUser)}`}>
                          {detailUser.displayName}
                        </h3>
                        <VipSilverStar roles={dRoles} size="sm" />
                      </div>
                      <RoleBadgesList roles={dRoles} size="sm" />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetailUser(null)}
                    className="p-1 text-[#9C968B] hover:text-white cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-2.5 text-xs bg-[#1A1A22] border border-[#262630] rounded-xl p-4">
                  <div className="flex justify-between gap-2">
                    <span className="text-[#9C968B]">الاسم:</span>
                    <span className="text-[#F5F2EB] font-bold">{detailUser.displayName}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#9C968B]">المعرّف (@ID):</span>
                    <span className="font-mono-num text-[#D4A853] font-bold" dir="ltr">
                      @{getUserHandle(detailUser, nowTick)}
                      {isActiveSpecialId(detailUser, nowTick)
                        ? ` (${detailUser.specialIdLabel || 'ID مميز'})`
                        : ''}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#9C968B]">رصيد الكريدت:</span>
                    <span className="font-mono-num tabular-nums text-[#D4A853] font-bold">
                                 {detailUser.points || 0} كريدت
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#9C968B]">الرتب النشطة:</span>
                    <span className="text-[#F5F2EB] font-semibold">
                      {formatRolesArabicSummary(dRoles)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#9C968B]">صلاحية نشر الستوريات:</span>
                    <span
                      className={`font-bold ${
                        detailUser.canPostStory || hasRole(detailUser, 'admin')
                          ? 'text-[#D4A853]'
                          : 'text-[#8B857B]'
                      }`}
                    >
                      {detailUser.canPostStory || hasRole(detailUser, 'admin')
                        ? 'مصرح له بنشر الستوري'
                        : 'للمشاهدة فقط'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[#9C968B]">حالة الاتصال:</span>
                    {(() => {
                      const dLive = getEffectiveLiveStatus(
                        detailUser,
                        detailUser.uid === currentUser.uid &&
                          detailUser.liveStatus !== 'offline',
                        nowTick
                      );
                      return (
                        <span className={`font-semibold ${dLive.textClass}`}>
                          {dLive.status !== 'offline'
                            ? dLive.label
                            : `أوفلاين · آخر ظهور ${formatLastSeen(detailUser.lastActiveAt, nowTick)}`}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const target = detailUser;
                      setDetailUser(null);
                      openIdModal(target);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-[#1E1E28] border border-[#2F2F3C] text-xs font-bold text-[#F5D67B] inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>تعديل ID</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const target = detailUser;
                      setDetailUser(null);
                      openPerkModal(target);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-[#1E1E28] border border-[#2F2F3C] text-xs font-bold text-emerald-300 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Coins className="w-3.5 h-3.5" />
                    <span>الكريدت والمزايا</span>
                  </button>
                  {detailUser.uid !== currentUser.uid && !hasRole(detailUser, 'admin') && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = detailUser;
                        setDetailUser(null);
                        openRoleModal(target);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-[#1E1E28] border border-[#D4A853]/45 text-[#D4A853] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      <span>الرتب</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const id = detailUser.uid;
                      setDetailUser(null);
                      onOpenProfile(id);
                    }}
                    className="px-4 py-2 rounded-xl bg-[#D4A853] text-[#0B0B0E] text-xs font-bold cursor-pointer"
                  >
                    عرض البروفايل الكامل
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Multi-Role Assignment Modal */}
      {roleModalUser && (
        <div
          onClick={() => setRoleModalUser(null)}
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[90dvh] overflow-y-auto bg-[#141419] border border-[#D4A853]/45 rounded-2xl p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <h3 className="text-base font-bold text-[#F5F2EB] flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#D4A853]" />
                  <span>تعيين الرتب المتعددة: {roleModalUser.displayName}</span>
                </h3>
                <p className="text-[11px] text-[#9C968B]">
                  اختر رتبة واحدة أو أكثر لتفعيل صلاحياتها معاً لهذا العضو.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRoleModalUser(null)}
                className="p-1 text-[#9C968B] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMultiRoles} className="space-y-4">
              <MultiRoleSelector
                selectedRoles={draftRoles}
                onChange={setDraftRoles}
                disabled={savingRoles}
              />

              <button
                type="button"
                disabled={savingRoles}
                onClick={() => setDraftCanPostStory((v) => !v)}
                className={`w-full p-3 rounded-xl border flex items-center justify-between gap-3 text-right transition-colors cursor-pointer ${
                  draftCanPostStory
                    ? 'bg-[#D4A853]/12 border-[#D4A853]/65 text-[#F5F2EB]'
                    : 'bg-[#181820] border-[#292935] text-[#B6B0A4]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      draftCanPostStory
                        ? 'bg-[#D4A853] text-[#0B0B0E]'
                        : 'bg-[#22222C] text-[#9C968B]'
                    }`}
                  >
                    <Film className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#F5F2EB]">
                      صلاحية نشر «ستوريات أوريليوس» (24 ساعة)
                    </div>
                    <div className="text-[11px] text-[#9C968B]">
                      عند التفعيل يظهر لهذا العضو زر (+ إضافة ستوري) للنشر في قسم الستوريات.
                    </div>
                  </div>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 ${
                    draftCanPostStory
                      ? 'bg-[#D4A853] text-[#0B0B0E]'
                      : 'bg-[#24242F] text-[#9C968B]'
                  }`}
                >
                  {draftCanPostStory ? 'مفعل' : 'معطل'}
                </span>
              </button>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#22222A]">
                <button
                  type="button"
                  onClick={() => setRoleModalUser(null)}
                  className="px-4 py-2 rounded-xl bg-[#1E1E26] text-xs text-[#F5F2EB] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingRoles}
                  className="px-5 py-2 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-bold cursor-pointer disabled:opacity-60"
                >
                  {savingRoles ? 'جاري الحفظ...' : 'حفظ الرتب والصلاحيات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reason Input Modal */}
      {reasonModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#141419] border border-[#2C2C35] rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-[#F5F2EB]">
              {reasonModal.action === 'mute' && `كتم ${reasonModal.target.displayName}`}
              {reasonModal.action === 'kick' && `طرد ${reasonModal.target.displayName}`}
              {reasonModal.action === 'ban' && `حظر نهائي: ${reasonModal.target.displayName}`}
            </h3>
            <form onSubmit={handleConfirmReasonAction} className="space-y-4">
              <textarea
                required
                rows={3}
                maxLength={240}
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder="اكتب السبب الواضح لهذا الإجراء..."
                className="w-full bg-[#1A1A22] border border-[#2C2C35] rounded-xl p-3 text-xs text-[#F5F2EB] outline-none resize-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReasonModal(null)}
                  className="px-4 py-2 rounded-xl bg-[#1E1E26] text-xs text-[#F5F2EB] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold cursor-pointer"
                >
                  تأكيد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Verification Request Modal */}
      {rejectReqModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#141419] border border-[#2C2C35] rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-[#F5F2EB]">
              رفض طلب التوثيق: {rejectReqModal.userName}
            </h3>
            <form onSubmit={handleRejectVerification} className="space-y-4">
              <textarea
                required
                rows={3}
                maxLength={300}
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="اذكر سبب الرفض ليظهر لمقدم الطلب..."
                className="w-full bg-[#1A1A22] border border-[#2C2C35] rounded-xl p-3 text-xs text-[#F5F2EB] outline-none resize-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectReqModal(null)}
                  className="px-4 py-2 rounded-xl bg-[#1E1E26] text-xs text-[#F5F2EB] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold cursor-pointer"
                >
                  تأكيد الرفض
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Content Modal */}
      <ConfirmModal
        open={Boolean(confirmDeleteContent)}
        title="هل أنت متأكد من الحذف؟"
        message={
          confirmDeleteContent
            ? `سيتم حذف ${confirmDeleteContent.label} نهائياً من المنصة.`
            : ''
        }
        confirmLabel="نعم، حذف نهائي"
        onCancel={() => setConfirmDeleteContent(null)}
        onConfirm={() => {
          if (confirmDeleteContent) {
            return handleDeleteContent(confirmDeleteContent.col, confirmDeleteContent.id);
          }
        }}
      />

      {/* Confirm Delete Custom Role */}
      <ConfirmModal
        open={Boolean(confirmDeleteRoleDef)}
        title="حذف رتبة مخصصة"
        message={
          confirmDeleteRoleDef
            ? `سيتم حذف الرتبة "${confirmDeleteRoleDef.nameAr}" نهائياً من قائمة الرتب.`
            : ''
        }
        confirmLabel="نعم، حذف الرتبة"
        onCancel={() => setConfirmDeleteRoleDef(null)}
        onConfirm={() => {
          if (confirmDeleteRoleDef) {
            return handleDeleteCustomRole(confirmDeleteRoleDef);
          }
        }}
      />
    </div>
  );
};
                      
