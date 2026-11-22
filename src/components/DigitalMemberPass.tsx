import React, { useMemo, useState } from 'react';
import {
  Award,
  BadgeCheck,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Crown,
  Frame,
  Hash,
  Palette,
  Scissors,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Ticket,
  User as UserIcon,
} from 'lucide-react';
import {
  RoleColorKey,
  UserProfile,
  VerificationRequestStatus,
} from '../types';
import { getCommunityLevel } from '../utils/gamification';
import {
  formatRolesArabicSummary,
  getPrimaryRole,
  getRoleDefinitionById,
  getScopedUserPermissionLabels,
  getUserRoles,
  hasRole,
  isBarberMember,
  isFounderUser,
  isStaffMember,
} from '../utils/roles';
import {
  AVATAR_FRAME_PRESETS,
  CHAT_TITLE_PRESETS,
  NAME_COLOR_PRESETS,
  formatRemainingDuration,
  getActiveAvatarFrame,
  getActiveChatTitle,
  getActiveCreditPass,
  getActiveNameColor,
} from '../utils/store';
import { isActiveSpecialId } from '../utils/username';
import {
  Avatar,
  RoleBadgesList,
  VipSilverStar,
  getEffectiveNameColorClass,
} from './Avatar';
import { CountryFlag } from './CountryPickerModal';

interface DigitalMemberPassProps {
  profileUser: UserProfile;
  profileHandle: string;
  isOwnProfile: boolean;
  ratingStats: { avg: number; count: number };
  latestVerificationStatus?: VerificationRequestStatus;
  activeCountryCode: string;
  nowTick: number;
}

interface PassVisualTheme {
  editionCode: string;
  editionTitleAr: string;
  verificationLabel: string;
  isVerifiedTier: boolean;
  containerClass: string;
  topAccentBarClass: string;
  crestClass: string;
  badgeClass: string;
  textAccentClass: string;
  tierType: 'founder' | 'staff' | 'barber' | 'vip' | 'basic';
}

const ROLE_COLOR_TO_THEME: Record<
  RoleColorKey,
  Pick<PassVisualTheme, 'containerClass' | 'topAccentBarClass' | 'crestClass' | 'badgeClass' | 'textAccentClass'>
> = {
  gold: {
    containerClass:
      'bg-gradient-to-br from-[#1D160A] via-[#0F0E12] to-[#08080B] border-[#D4A853]/75 shadow-[0_18px_48px_-24px_rgba(212,168,83,0.45)]',
    topAccentBarClass: 'bg-gradient-to-r from-transparent via-[#F7DC85] to-transparent',
    crestClass: 'bg-[#D4A853]/18 border-[#D4A853]/55 text-[#F8DF8E]',
    badgeClass: 'bg-[#D4A853]/18 border-[#D4A853]/55 text-[#F8DF8E]',
    textAccentClass: 'text-[#F5D67B]',
  },
  crimson: {
    containerClass:
      'bg-gradient-to-br from-[#1E1016] via-[#110E14] to-[#0A0A0E] border-rose-400/55 shadow-[0_16px_42px_-24px_rgba(244,63,94,0.35)]',
    topAccentBarClass: 'bg-gradient-to-r from-transparent via-rose-400/80 to-transparent',
    crestClass: 'bg-rose-500/15 border-rose-400/45 text-rose-300',
    badgeClass: 'bg-rose-500/15 border-rose-400/45 text-rose-200',
    textAccentClass: 'text-rose-300',
  },
  indigo: {
    containerClass:
      'bg-gradient-to-br from-[#111524] via-[#0F1119] to-[#090A0E] border-indigo-400/55 shadow-[0_16px_42px_-24px_rgba(129,140,248,0.35)]',
    topAccentBarClass: 'bg-gradient-to-r from-transparent via-indigo-400/80 to-transparent',
    crestClass: 'bg-indigo-500/15 border-indigo-400/45 text-indigo-300',
    badgeClass: 'bg-indigo-500/15 border-indigo-400/45 text-indigo-200',
    textAccentClass: 'text-indigo-300',
  },
  teal: {
    containerClass:
      'bg-gradient-to-br from-[#0E1C1E] via-[#0E1317] to-[#090B0E] border-teal-400/55 shadow-[0_16px_42px_-24px_rgba(45,212,191,0.3)]',
    topAccentBarClass: 'bg-gradient-to-r from-transparent via-teal-400/80 to-transparent',
    crestClass: 'bg-teal-500/15 border-teal-400/45 text-teal-300',
    badgeClass: 'bg-teal-500/15 border-teal-400/45 text-teal-200',
    textAccentClass: 'text-teal-300',
  },
  silver: {
    containerClass:
      'bg-gradient-to-br from-[#191D26] via-[#111319] to-[#0A0B0F] border-slate-300/65 shadow-[0_16px_42px_-24px_rgba(226,232,240,0.3)]',
    topAccentBarClass: 'bg-gradient-to-r from-transparent via-slate-200/85 to-transparent',
    crestClass: 'bg-slate-200/15 border-slate-300/50 text-slate-100',
    badgeClass: 'bg-slate-200/15 border-slate-300/45 text-slate-100',
    textAccentClass: 'text-slate-100',
  },
  amber: {
    containerClass:
      'bg-gradient-to-br from-[#1E160C] via-[#121013] to-[#0A0A0D] border-amber-400/55 shadow-[0_16px_42px_-24px_rgba(251,191,36,0.3)]',
    topAccentBarClass: 'bg-gradient-to-r from-transparent via-amber-400/80 to-transparent',
    crestClass: 'bg-amber-500/15 border-amber-400/45 text-amber-300',
    badgeClass: 'bg-amber-500/15 border-amber-400/45 text-amber-200',
    textAccentClass: 'text-amber-300',
  },
  emerald: {
    containerClass:
      'bg-gradient-to-br from-[#0D1C16] via-[#0E1314] to-[#090B0D] border-emerald-400/55 shadow-[0_16px_42px_-24px_rgba(52,211,153,0.28)]',
    topAccentBarClass: 'bg-gradient-to-r from-transparent via-emerald-400/80 to-transparent',
    crestClass: 'bg-emerald-500/15 border-emerald-400/45 text-emerald-300',
    badgeClass: 'bg-emerald-500/15 border-emerald-400/45 text-emerald-200',
    textAccentClass: 'text-emerald-300',
  },
  violet: {
    containerClass:
      'bg-gradient-to-br from-[#191224] via-[#110F18] to-[#0A0A0E] border-violet-400/55 shadow-[0_16px_42px_-24px_rgba(167,139,250,0.3)]',
    topAccentBarClass: 'bg-gradient-to-r from-transparent via-violet-400/80 to-transparent',
    crestClass: 'bg-violet-500/15 border-violet-400/45 text-violet-300',
    badgeClass: 'bg-violet-500/15 border-violet-400/45 text-violet-200',
    textAccentClass: 'text-violet-300',
  },
  slate: {
    containerClass:
      'bg-gradient-to-br from-[#15151C] via-[#101015] to-[#0A0A0E] border-[#2C2C38]',
    topAccentBarClass: 'bg-gradient-to-r from-transparent via-[#555568] to-transparent',
    crestClass: 'bg-[#1D1D26] border-[#333340] text-[#C8C2B8]',
    badgeClass: 'bg-[#1A1A22] border-[#2F2F3C] text-[#C8C2B8]',
    textAccentClass: 'text-[#C8C2B8]',
  },
};

function resolveOfficialPassTheme(
  user: UserProfile,
  latestVerificationStatus?: VerificationRequestStatus
): PassVisualTheme {
  const roles = getUserRoles(user);
  const primary = getPrimaryRole(user);
  const roleDef = getRoleDefinitionById(String(primary));

  if (isFounderUser(user) || primary === 'admin') {
    return {
      editionCode: 'FOUNDER EDITION',
      editionTitleAr: 'بطاقة المؤسس الملكية',
      verificationLabel: 'مؤسس المنصة · صلاحية مطلقة ودائمة',
      isVerifiedTier: true,
      tierType: 'founder',
      ...ROLE_COLOR_TO_THEME.gold,
    };
  }

  if (primary === 'deputy_director') {
    return {
      editionCode: 'COMMAND PASS',
      editionTitleAr: 'بطاقة نائب المدير الرسمية',
      verificationLabel: 'إدارة عليا · الذراع التنفيذي',
      isVerifiedTier: true,
      tierType: 'staff',
      ...ROLE_COLOR_TO_THEME.crimson,
    };
  }

  if (primary === 'moderator') {
    return {
      editionCode: 'STAFF PASS',
      editionTitleAr: 'بطاقة المشرف العام الرسمية',
      verificationLabel: 'إداري معتمد · طاقم الإشراف',
      isVerifiedTier: true,
      tierType: 'staff',
      ...ROLE_COLOR_TO_THEME.indigo,
    };
  }

  if (primary === 'chat_moderator') {
    return {
      editionCode: 'CHAT GUARD PASS',
      editionTitleAr: 'بطاقة مشرف الدردشة الرسمية',
      verificationLabel: 'إداري معتمد · إشراف الدردشة',
      isVerifiedTier: true,
      tierType: 'staff',
      ...ROLE_COLOR_TO_THEME.teal,
    };
  }

  if (hasRole(user, 'vip_barber') || primary === 'vip_barber') {
    return {
      editionCode: 'VIP BARBER PASS',
      editionTitleAr: 'بطاقة النخبة الفضية · حلاق VIP',
      verificationLabel: 'حلاق VIP خبير وموثّق',
      isVerifiedTier: true,
      tierType: 'barber',
      ...ROLE_COLOR_TO_THEME.silver,
    };
  }

  if (primary === 'master_barber') {
    return {
      editionCode: 'MASTER BARBER PASS',
      editionTitleAr: 'بطاقة أستاذ الحلاقة المعتمد',
      verificationLabel: 'حلاق محترف موثّق',
      isVerifiedTier: true,
      tierType: 'barber',
      ...ROLE_COLOR_TO_THEME.amber,
    };
  }

  if (primary === 'barber_verified' || isBarberMember(user)) {
    return {
      editionCode: 'VERIFIED BARBER PASS',
      editionTitleAr: 'بطاقة الحلاق الموثّق',
      verificationLabel: 'حلاق موثّق ومعتمد',
      isVerifiedTier: true,
      tierType: 'barber',
      ...ROLE_COLOR_TO_THEME.emerald,
    };
  }

  if (primary === 'vip_member' || (!roleDef.isSystem && primary !== 'customer')) {
    const palette = ROLE_COLOR_TO_THEME[roleDef.colorKey] || ROLE_COLOR_TO_THEME.violet;
    return {
      editionCode: primary === 'vip_member' ? 'VIP MEMBER PASS' : 'OFFICIAL RANK PASS',
      editionTitleAr: `بطاقة ${roleDef.nameAr}`,
      verificationLabel:
        roles.some((r) => r !== 'customer')
          ? 'رتبة رسمية معتمدة من الإدارة'
          : 'عضوية موثّقة',
      isVerifiedTier: true,
      tierType: 'vip',
      ...palette,
    };
  }

  const pendingNote =
    latestVerificationStatus === 'pending'
      ? 'عضو مسجل · طلب توثيق كحلاق قيد المراجعة'
      : 'عضو / زبون في المجتمع';

  return {
    editionCode: 'STANDARD PASS',
    editionTitleAr: 'بطاقة العضوية الأساسية',
    verificationLabel: pendingNote,
    isVerifiedTier: false,
    tierType: 'basic',
    ...ROLE_COLOR_TO_THEME.slate,
  };
}

export const DigitalMemberPass: React.FC<DigitalMemberPassProps> = ({
  profileUser,
  profileHandle,
  isOwnProfile,
  ratingStats,
  latestVerificationStatus,
  activeCountryCode,
  nowTick,
}) => {
  const [copiedId, setCopiedId] = useState(false);

  const roles = useMemo(() => getUserRoles(profileUser), [profileUser]);
  const primaryRole = roles[0];
  const primaryDef = useMemo(() => getRoleDefinitionById(String(primaryRole)), [primaryRole]);
  const isFounder = isFounderUser(profileUser);
  const isBarber = isBarberMember(profileUser);
  const isStaff = isStaffMember(profileUser, false);

  const theme = useMemo(
    () => resolveOfficialPassTheme(profileUser, latestVerificationStatus),
    [profileUser, latestVerificationStatus]
  );

  const scopedPermissions = useMemo(
    () => getScopedUserPermissionLabels(profileUser, isFounder),
    [profileUser, isFounder]
  );

  const levelInfo = useMemo(
    () => getCommunityLevel(profileUser.points || 0),
    [profileUser.points]
  );

  const activeCreditPass = useMemo(
    () => getActiveCreditPass(profileUser, nowTick),
    [profileUser, nowTick]
  );
  const activeNameColor = useMemo(
    () => getActiveNameColor(profileUser, nowTick),
    [profileUser, nowTick]
  );
  const activeAvatarFrame = useMemo(
    () => getActiveAvatarFrame(profileUser, nowTick),
    [profileUser, nowTick]
  );
  const activeChatTitle = useMemo(
    () => getActiveChatTitle(profileUser, nowTick),
    [profileUser, nowTick]
  );
  const isSpecialId = useMemo(
    () => isActiveSpecialId(profileUser, nowTick),
    [profileUser, nowTick]
  );

  const activeRentalEntries = useMemo(() => {
    if (isFounder) return [];
    const entries: {
      key: string;
      icon: 'pass' | 'id' | 'color' | 'frame' | 'title';
      title: string;
      value: string;
      durationLabel: string;
      isStoreRental: boolean;
    }[] = [];

    if (activeCreditPass) {
      entries.push({
        key: 'credit_pass',
        icon: 'pass',
        title: 'بطاقة المتجر المؤقتة',
        value: 'ضيافة متجر مؤقتة (Credit Pass)',
        durationLabel: formatRemainingDuration(profileUser.creditPassExpiresAt, nowTick),
        isStoreRental: true,
      });
    }

    if (
      isSpecialId &&
      (profileUser.specialIdGrantedBy === 'store' || Boolean(profileUser.specialIdExpiresAt))
    ) {
      entries.push({
        key: 'special_id',
        icon: 'id',
        title: 'آيدي مميز مؤقت',
        value: `@${profileHandle}`,
        durationLabel: formatRemainingDuration(profileUser.specialIdExpiresAt, nowTick),
        isStoreRental: profileUser.specialIdGrantedBy === 'store',
      });
    }
    if (activeNameColor) {
      entries.push({
        key: 'name_color',
        icon: 'color',
        title: 'لون اسم متوهج',
        value: NAME_COLOR_PRESETS[activeNameColor]?.labelAr || activeNameColor,
        durationLabel: formatRemainingDuration(profileUser.nameColorExpiresAt, nowTick),
        isStoreRental: Boolean(profileUser.nameColorExpiresAt),
      });
    }

    if (activeChatTitle) {
      entries.push({
        key: 'chat_title',
        icon: 'title',
        title: 'لقب تميز في الدردشة',
        value: CHAT_TITLE_PRESETS[activeChatTitle]?.labelAr || activeChatTitle,
        durationLabel: formatRemainingDuration(profileUser.chatTitleExpiresAt, nowTick),
        isStoreRental: Boolean(profileUser.chatTitleExpiresAt),
      });
    }

    if (activeAvatarFrame && AVATAR_FRAME_PRESETS[activeAvatarFrame]?.category === 'store') {
      entries.push({
        key: 'avatar_frame',
        icon: 'frame',
        title: 'إطار بروفايل مميز',
        value: AVATAR_FRAME_PRESETS[activeAvatarFrame]?.labelAr || activeAvatarFrame,
        durationLabel: formatRemainingDuration(profileUser.avatarFrameExpiresAt, nowTick),
        isStoreRental: Boolean(profileUser.avatarFrameExpiresAt),
      });
    }

    return entries;
  }, [
    isFounder,
    activeCreditPass,
    isSpecialId,
    activeNameColor,
    activeChatTitle,
    activeAvatarFrame,
    profileUser,
    profileHandle,
    nowTick,
  ]);

  const serialNumber = useMemo(() => {
    const cleanUid = (profileUser.uid || '000000').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const prefix = isFounder
      ? 'AUR-FND'
      : theme.tierType === 'staff'
        ? 'AUR-STF'
        : theme.tierType === 'barber'
          ? 'AUR-BRB'
          : theme.tierType === 'vip'
            ? 'AUR-VIP'
            : 'AUR-MBR';
    return `${prefix}-${cleanUid.slice(0, 6) || 'MEMBER'}`;
  }, [profileUser.uid, isFounder, theme.tierType]);

  const handleCopySerial = () => {
    navigator.clipboard?.writeText(`@${profileHandle} (${serialNumber})`).catch(() => {});
    setCopiedId(true);
    window.setTimeout(() => setCopiedId(false), 1800);
  };

  const renderTierEmblem = () => {
    if (isFounder) return <Crown className="w-5 h-5" />;
    if (theme.tierType === 'staff') return <ShieldCheck className="w-5 h-5" />;
    if (primaryRole === 'vip_barber') return <Star className="w-5 h-5 fill-current" />;
    if (primaryRole === 'master_barber') return <Award className="w-5 h-5" />;
    if (theme.tierType === 'barber') return <Scissors className="w-5 h-5" />;
    if (theme.tierType === 'vip') return <Sparkles className="w-5 h-5" />;
    return <UserIcon className="w-5 h-5" />;
  };

  const countryCodeToRender =
    profileUser.countryCode || (isOwnProfile ? activeCountryCode : undefined);

  return (
    <section className="space-y-4">
      {/* 1. Official Digital Identity Pass (Strictly Scoped to Actual Rank) */}
      <article
        className={`relative rounded-3xl border overflow-hidden transition-colors ${theme.containerClass}`}
      >
        <div className={`h-[2px] w-full ${theme.topAccentBarClass}`} />

        <div className="p-4 sm:p-6 space-y-4">
          {/* Card Header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 ${theme.crestClass}`}
              >
                {renderTierEmblem()}
              </div>
              <div className="min-w-0">
                <span
                  dir="ltr"
                  className={`block text-[10px] font-extrabold font-mono-num tracking-[0.14em] uppercase ${theme.textAccentClass}`}
                >
                  AURELIUS BARBER · {theme.editionCode}
                </span>
                <h2 className="text-sm sm:text-base font-extrabold text-[#F5F2EB] truncate mt-0.5">
                  {theme.editionTitleAr}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span
                dir="ltr"
                className="px-2.5 py-1 rounded-lg bg-black/45 border border-white/10 text-[11px] font-mono-num tabular-nums text-[#C8C2B8] whitespace-nowrap"
              >
                {serialNumber}
              </span>
              <button
                type="button"
                onClick={handleCopySerial}
                title="نسخ بيانات البطاقة والآيدي"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#1A1A22]/90 hover:bg-[#24242E] border border-white/10 text-[11px] font-bold text-[#F5F2EB] cursor-pointer transition-colors whitespace-nowrap"
              >
                {copiedId ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-[#D4A853]" />
                )}
                <span>{copiedId ? 'تم النسخ' : 'نسخ الهوية'}</span>
              </button>
            </div>
          </div>

          {/* Member Identity Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3.5 sm:p-4 rounded-2xl bg-black/35 border border-white/8">
            <div className="flex items-center gap-3.5 min-w-0">
              <Avatar
                src={profileUser.photoURL}
                name={profileUser.displayName}
                size="md"
                role={primaryRole}
                roles={roles}
                avatarFrame={profileUser.avatarFrame}
                avatarFrameExpiresAt={profileUser.avatarFrameExpiresAt}
              />
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={`text-base sm:text-lg font-extrabold truncate ${getEffectiveNameColorClass(
                      profileUser
                    )}`}
                  >
                    {profileUser.displayName}
                  </span>
                  <VipSilverStar roles={roles} size="sm" />
                  <RoleBadgesList roles={roles} size="sm" />
                </div>

                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span dir="ltr" className="font-mono-num font-bold text-[#D4A853]">
                    @{profileHandle}
                  </span>
                  {isSpecialId && (
                    <span className="text-[11px] font-bold text-[#F8DF8E]">
                      · {profileUser.specialIdLabel || 'ID مميز'}
                      {!isFounder && profileUser.specialIdExpiresAt
                        ? ` (${formatRemainingDuration(profileUser.specialIdExpiresAt, nowTick)})`
                        : ''}
                    </span>
                  )}
                  {countryCodeToRender && (
                    <>
                      <span aria-hidden="true" className="text-[#565666]">·</span>
                      <CountryFlag
                        code={countryCodeToRender}
                        showName
                        size="xs"
                        className="text-[#D6D1C7] font-semibold"
                      />
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="shrink-0">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-extrabold whitespace-nowrap ${theme.badgeClass}`}
              >
                {theme.isVerifiedTier ? (
                  <BadgeCheck className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <Shield className="w-3.5 h-3.5 shrink-0 opacity-80" />
                )}
                <span>{theme.verificationLabel}</span>
              </span>
            </div>
          </div>

          {/* Credentials Grid (Strictly Role-Accurate) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-black/30 border border-white/8 space-y-1">
              <div className="text-[11px] text-[#9C968B]">الرتبة الرسمية المعتمدة</div>
              <div className={`text-xs sm:text-sm font-extrabold truncate ${theme.textAccentClass}`}>
                {roles.length > 1 ? formatRolesArabicSummary(roles) : primaryDef.nameAr}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-black/30 border border-white/8 space-y-1">
              <div className="text-[11px] text-[#9C968B]">تصنيف الحساب</div>
              <div className="text-xs sm:text-sm font-bold text-[#F5F2EB] truncate">
                {isFounder
                  ? 'القيادة التأسيسية'
                  : isStaff && isBarber
                    ? 'طاقم إداري + حلاق معتمد'
                    : isStaff
                      ? 'طاقم الإدارة والإشراف'
                      : isBarber
                        ? 'حلاق / صالون معتمد'
                        : 'عضوية مجتمع أوريليوس'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-black/30 border border-white/8 space-y-1">
              <div className="text-[11px] text-[#9C968B]">
                {isBarber
                  ? 'الصالون والتقييم'
                  : isFounder || isStaff
                    ? 'نطاق الصلاحية الإدارية'
                    : 'المستوى والكريدت'}
              </div>
              <div className="text-xs sm:text-sm font-bold text-[#F5F2EB] truncate font-mono-num tabular-nums">
                {isBarber
                  ? `${profileUser.salonName || 'حلاق معتمد'} · ${
                      ratingStats.count > 0
                        ? `${ratingStats.avg.toFixed(1)}★ (${ratingStats.count})`
                        : 'بدون تقييم بعد'
                    }`
                  : isFounder
                    ? 'سيادة مطلقة على كامل المنصة'
                    : isStaff
                      ? `${scopedPermissions.length} صلاحية إدارية مفعلة`
                      : `المستوى ${levelInfo.level} · ${levelInfo.title}`}
              </div>
            </div>
          </div>

          {/* Effective Permissions List for Current Rank Only */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-black/30 border border-white/8 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#F5F2EB]">
                <ShieldCheck className={`w-4 h-4 ${theme.textAccentClass}`} />
                <span>الصلاحيات الفعلية لهذه الرتبة فقط</span>
              </span>
              <span className="text-[10px] text-[#9C968B] whitespace-nowrap">
                حسب الصلاحيات المعتمدة
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {scopedPermissions.map((perm) => (
                <div
                  key={perm}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/6 text-[11px] text-[#E6E1D7]"
                >
                  <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${theme.textAccentClass}`} />
                  <span className="truncate">{perm}</span>
                </div>
              ))}
            </div>
          </div>

          {isFounder && (
            <div className="px-3.5 py-2.5 rounded-xl bg-[#D4A853]/12 border border-[#D4A853]/40 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-[#F8DF8E]">
              <span className="inline-flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5 text-[#D4A853] shrink-0" />
                <span>بطاقة المؤسس الدائمة — جميع مزايا المتجر والآيدي المميز مفعلة مجاناً بلا قيود.</span>
              </span>
              <span className="font-mono-num text-[#D4A853] whitespace-nowrap">
                PERMANENT · FREE
              </span>
            </div>
          )}
        </div>
      </article>

      {/* 2. Strictly Separated Temporary Store / Credit Rental Card */}
      {activeRentalEntries.length > 0 && (
        <article className="rounded-2xl border border-dashed border-sky-400/50 bg-[#0E131D] p-4 sm:p-5 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-sky-400/20">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-400/35 text-sky-300 flex items-center justify-center shrink-0">
                <Ticket className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-extrabold text-sky-100 truncate">
                  مزايا المتجر المؤقتة (بالكريدت)
                </h3>
                <p className="text-[11px] text-sky-200/75">
                  مزايا تجميلية وتفاعلية مستأجرة بمدة محددة ومنفصلة تماماً عن الرتب الرسمية.
                </p>
              </div>
            </div>

            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/15 border border-sky-400/40 text-[10px] font-extrabold text-sky-200 whitespace-nowrap shrink-0">
              <Clock className="w-3 h-3" />
              <span>مؤقتة بالكريدت</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {activeRentalEntries.map((entry) => {
              const Icon =
                entry.icon === 'pass'
                  ? Ticket
                  : entry.icon === 'id'
                    ? Hash
                    : entry.icon === 'color'
                      ? Palette
                      : entry.icon === 'title'
                        ? Sparkles
                        : Frame;
              return (
                <div
                  key={entry.key}
                  className="p-3 rounded-xl bg-[#0A0E16] border border-sky-400/25 flex items-center justify-between gap-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-sky-500/12 text-sky-300 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] text-sky-200/75 truncate">
                        {entry.title}
                      </div>
                      <div className="text-xs font-bold text-[#F5F2EB] truncate">
                        {entry.value}
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-sky-500/15 border border-sky-400/35 text-[10px] font-bold font-mono-num text-sky-200 whitespace-nowrap shrink-0">
                    {entry.durationLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </article>
      )}
    </section>
  );
};
