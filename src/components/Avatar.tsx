import React, { memo, useEffect, useId, useState } from 'react';
import {
  ShieldCheck,
  Crown,
  Scissors,
  User as UserIcon,
  BadgeCheck,
  Star,
  Check,
  Sparkles,
  Award,
  MessageSquare,
} from 'lucide-react';
import { AvatarFrameKey, RoleColorKey, UserProfile, UserRole } from '../types';
import { getInitials } from '../utils/image';
import {
  ASSIGNABLE_ELEVATED_ROLES,
  ROLE_HIERARCHY,
  formatRolesArabicSummary,
  getAssignableRoles,
  getPrimaryRole,
  getRoleDefinitionById,
  getUserRoles,
  hasRole,
  isAnyBarberRole,
  isBarberMember,
  isStaffMember,
  canPublishToGallery,
  canPublishStories,
  normalizeUserRoles,
  toggleElevatedRoleSelection,
} from '../utils/roles';
import {
  AVATAR_FRAME_PRESETS,
  NAME_COLOR_PRESETS,
  getActiveAvatarFrame,
  getActiveNameColor,
} from '../utils/store';

export {
  ASSIGNABLE_ELEVATED_ROLES,
  ROLE_HIERARCHY,
  formatRolesArabicSummary,
  getPrimaryRole,
  getUserRoles,
  hasRole,
  isAnyBarberRole,
  isBarberMember,
  isStaffMember,
  canPublishToGallery,
  canPublishStories,
  normalizeUserRoles,
  toggleElevatedRoleSelection,
};

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  src?: string;
  name: string;
  size?: AvatarSize;
  role?: UserRole;
  roles?: UserRole[];
  avatarFrame?: string;
  avatarFrameExpiresAt?: any;
  forcePreviewFrame?: AvatarFrameKey | null;
  className?: string;
}

const SIZE_MAP: Record<AvatarSize, string> = {
  xs: 'w-7 h-7 text-[10px]',
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-16 h-16 text-lg',
  xl: 'w-24 h-24 text-2xl',
};

const FRAME_INSET_MAP: Record<AvatarSize, string> = {
  xs: '-inset-[3px]',
  sm: '-inset-[4px]',
  md: '-inset-[5px]',
  lg: '-inset-[7px]',
  xl: '-inset-[10px]',
};

const FRAME_THEME_COLORS: Record<
  AvatarFrameKey,
  { c1: string; c2: string; c3: string; accent: string }
> = {
  obsidian_bronze: { c1: '#B45309', c2: '#F59E0B', c3: '#78350F', accent: '#FCD34D' },
  emerald_royal: { c1: '#059669', c2: '#6EE7B7', c3: '#065F46', accent: '#A7F3D0' },
  gold_crown: { c1: '#D4A853', c2: '#FCE08B', c3: '#9A6F1C', accent: '#FFF3B8' },
  ruby_flame: { c1: '#E11D48', c2: '#FB7185', c3: '#881337', accent: '#FDA4AF' },
  sapphire_neon: { c1: '#0284C7', c2: '#38BDF8', c3: '#075985', accent: '#BAE6FD' },
  platinum_diamond: { c1: '#CBD5E1', c2: '#F8FAFC', c3: '#64748B', accent: '#FFFFFF' },
  rank_deputy: { c1: '#E11D48', c2: '#FB7185', c3: '#D4A853', accent: '#FFE4E6' },
  rank_moderator: { c1: '#4F46E5', c2: '#A5B4FC', c3: '#312E81', accent: '#E0E7FF' },
  rank_chat_mod: { c1: '#0D9488', c2: '#5EEAD4', c3: '#115E59', accent: '#CCFBF1' },
  rank_vip_barber: { c1: '#94A3B8', c2: '#F8FAFC', c3: '#475569', accent: '#FFFFFF' },
  rank_master_barber: { c1: '#D97706', c2: '#FDE68A', c3: '#92400E', accent: '#FEF3C7' },
  rank_verified_barber: { c1: '#10B981', c2: '#6EE7B7', c3: '#D4A853', accent: '#D1FAE5' },
  rank_vip_member: { c1: '#7C3AED', c2: '#C4B5FD', c3: '#4C1D95', accent: '#EDE9FE' },
  founder_sovereign: { c1: '#D4A853', c2: '#FFF3B8', c3: '#B67D1B', accent: '#FFFFFF' },
};

export const OrnamentalFrameArtwork: React.FC<{
  frameKey: AvatarFrameKey;
  size: AvatarSize;
}> = memo(({ frameKey, size }) => {
  const uid = useId().replace(/:/g, '');
  const gradId = `aur_fg_${uid}`;
  const palette = FRAME_THEME_COLORS[frameKey] || FRAME_THEME_COLORS.gold_crown;
  const isMini = size === 'xs' || size === 'sm';
  const isFounderFrame = frameKey === 'founder_sovereign';

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute ${FRAME_INSET_MAP[size]} flex items-center justify-center`}
    >
      {/* Founder Animated Halo & Rotating Conic Rim */}
      {isFounderFrame && (
        <>
          <div className="founder-aura-glow absolute inset-0 rounded-full bg-[#D4A853]/28 blur-[5px]" />
          <div
            className="founder-aura-ring absolute inset-[4%] rounded-full p-[2.5px]"
            style={{
              WebkitMask:
                'radial-gradient(farthest-side, transparent calc(100% - 3.5px), #000 calc(100% - 2.5px))',
              mask: 'radial-gradient(farthest-side, transparent calc(100% - 3.5px), #000 calc(100% - 2.5px))',
            }}
          />
        </>
      )}

      {/* Animated subtle pulse halo for top-tier gem frames */}
      {(frameKey === 'platinum_diamond' ||
        frameKey === 'ruby_flame' ||
        frameKey === 'sapphire_neon' ||
        frameKey === 'rank_deputy' ||
        frameKey === 'rank_vip_barber') && (
        <div
          className="founder-aura-glow absolute inset-[6%] rounded-full"
          style={{
            boxShadow: `0 0 ${isMini ? 8 : 16}px ${palette.c2}55`,
          }}
        />
      )}

      {/* Bespoke Ornamental Vector Frame */}
      <svg
        viewBox="0 0 120 120"
        fill="none"
        className="w-full h-full overflow-visible drop-shadow-[0_2px_6px_rgba(0,0,0,0.65)]"
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={palette.c2} />
            <stop offset="50%" stopColor={palette.c1} />
            <stop offset="100%" stopColor={palette.c3} />
          </linearGradient>
        </defs>

        {/* Outer Bevel Ring */}
        <circle
          cx="60"
          cy="60"
          r="53"
          stroke={`url(#${gradId})`}
          strokeWidth={isFounderFrame ? '3.4' : '2.8'}
        />
        {/* Inner Precision Filigree Hairline */}
        <circle
          cx="60"
          cy="60"
          r="48.5"
          stroke={palette.accent}
          strokeOpacity={isFounderFrame ? '0.85' : '0.55'}
          strokeWidth="0.9"
          strokeDasharray={
            frameKey === 'sapphire_neon'
              ? '10 4 3 4'
              : frameKey === 'rank_chat_mod'
                ? '14 5'
                : frameKey === 'obsidian_bronze'
                  ? '6 3'
                  : undefined
          }
        />

        {/* Category / Frame-specific Engraved Artwork */}
        {isFounderFrame && (
          <>
            {/* Flanking Gold Laurel Wreaths */}
            <path
              d="M15 74 C9 60, 10 44, 19 31 M12 63 L18 59 M11 52 L17 50 M14 41 L20 42"
              stroke={`url(#${gradId})`}
              strokeWidth="2.1"
              strokeLinecap="round"
            />
            <path
              d="M105 74 C111 60, 110 44, 101 31 M108 63 L102 59 M109 52 L103 50 M106 41 L100 42"
              stroke={`url(#${gradId})`}
              strokeWidth="2.1"
              strokeLinecap="round"
            />
            {/* Top Sculpted Sovereign Crown Crest */}
            <path
              d="M44 10 L48 1 L55 7 L60 -1 L65 7 L72 1 L76 10 Z"
              fill={`url(#${gradId})`}
              stroke="#0B0B0E"
              strokeWidth="1.1"
              strokeLinejoin="round"
            />
            <circle cx="60" cy="6" r="1.8" fill="#FFF7D1" />
            {/* Bottom Heraldic Diamond Seal */}
            <polygon
              points="60,108 66,114 60,120 54,114"
              fill={`url(#${gradId})`}
              stroke="#0B0B0E"
              strokeWidth="1"
            />
          </>
        )}

        {frameKey === 'gold_crown' && (
          <>
            <path
              d="M47 10 L50 3 L56 8 L60 1 L64 8 L70 3 L73 10 Z"
              fill={`url(#${gradId})`}
              stroke="#0B0B0E"
              strokeWidth="1"
            />
            <path
              d="M20 90 C32 104, 45 109, 60 109 C75 109, 88 104, 100 90"
              stroke={palette.c2}
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <circle cx="14" cy="60" r="2.2" fill={palette.accent} />
            <circle cx="106" cy="60" r="2.2" fill={palette.accent} />
          </>
        )}

        {frameKey === 'platinum_diamond' && (
          <>
            <polygon points="60,2 65,8 60,14 55,8" fill={palette.accent} stroke="#1E293B" strokeWidth="0.9" />
            <polygon points="60,106 65,112 60,118 55,112" fill={palette.accent} stroke="#1E293B" strokeWidth="0.9" />
            <polygon points="2,60 8,55 14,60 8,65" fill={palette.c2} stroke="#1E293B" strokeWidth="0.9" />
            <polygon points="106,60 112,55 118,60 112,65" fill={palette.c2} stroke="#1E293B" strokeWidth="0.9" />
          </>
        )}

        {frameKey === 'ruby_flame' && (
          <>
            <path
              d="M46 11 Q60 -2 74 11"
              stroke={palette.c2}
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <polygon points="60,3 64,9 60,15 56,9" fill="#FF3B6B" stroke="#FFE4E6" strokeWidth="0.8" />
            <path d="M16 42 Q6 60 16 78" stroke={palette.c1} strokeWidth="2.2" strokeLinecap="round" />
            <path d="M104 42 Q114 60 104 78" stroke={palette.c1} strokeWidth="2.2" strokeLinecap="round" />
          </>
        )}

        {frameKey === 'emerald_royal' && (
          <>
            <path
              d="M22 36 Q12 60 22 84 M98 36 Q108 60 98 84"
              stroke={palette.c2}
              strokeWidth="1.9"
              strokeLinecap="round"
            />
            <polygon points="60,3 64,8 60,13 56,8" fill="#34D399" stroke="#ECFDF5" strokeWidth="0.8" />
            <circle cx="60" cy="113" r="2.6" fill="#34D399" />
          </>
        )}

        {frameKey === 'sapphire_neon' && (
          <>
            <path
              d="M34 11 L60 4 L86 11 M34 109 L60 116 L86 109"
              stroke={palette.c2}
              strokeWidth="2.1"
              strokeLinecap="round"
            />
            <circle cx="60" cy="5" r="2.2" fill="#E0F2FE" />
            <circle cx="60" cy="115" r="2.2" fill="#E0F2FE" />
          </>
        )}

        {frameKey === 'obsidian_bronze' && (
          <>
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
              <g key={deg} transform={`rotate(${deg} 60 60)`}>
                <circle cx="60" cy="7" r="2.1" fill={palette.c2} stroke="#1F1306" strokeWidth="0.7" />
              </g>
            ))}
          </>
        )}

        {/* Rank-Specific Bezel Artwork */}
        {frameKey === 'rank_deputy' && (
          <>
            <path
              d="M49 9 L60 2 L71 9 L67 14 L53 14 Z"
              fill={`url(#${gradId})`}
              stroke="#0B0B0E"
              strokeWidth="0.9"
            />
            <path d="M13 46 L13 74 M107 46 L107 74" stroke="#D4A853" strokeWidth="2.4" strokeLinecap="round" />
          </>
        )}

        {frameKey === 'rank_moderator' && (
          <>
            <path
              d="M52 4 L68 4 L68 11 L60 16 L52 11 Z"
              fill={`url(#${gradId})`}
              stroke="#0B0B0E"
              strokeWidth="0.9"
            />
            <path d="M22 95 L32 103 M98 95 L88 103" stroke={palette.c2} strokeWidth="2.2" strokeLinecap="round" />
          </>
        )}

        {frameKey === 'rank_chat_mod' && (
          <>
            <path d="M12 45 C6 55, 6 65, 12 75" stroke={palette.c2} strokeWidth="2.3" strokeLinecap="round" />
            <path d="M108 45 C114 55, 114 65, 108 75" stroke={palette.c2} strokeWidth="2.3" strokeLinecap="round" />
            <circle cx="60" cy="7" r="2.8" fill={palette.c2} stroke="#0B0B0E" strokeWidth="0.8" />
          </>
        )}

        {frameKey === 'rank_vip_barber' && (
          <>
            {/* 4-Point Silver VIP Star Jewel */}
            <path
              d="M60 0 L62.5 5.5 L68 8 L62.5 10.5 L60 16 L57.5 10.5 L52 8 L57.5 5.5 Z"
              fill="#FFFFFF"
              stroke="#334155"
              strokeWidth="0.8"
            />
            <path d="M17 86 C29 102, 43 109, 60 109 C77 109, 91 102, 103 86" stroke="#E2E8F0" strokeWidth="2" strokeLinecap="round" />
          </>
        )}

        {frameKey === 'rank_master_barber' && (
          <>
            <path d="M18 76 C12 62, 13 46, 22 33" stroke={palette.c2} strokeWidth="2.1" strokeLinecap="round" />
            <path d="M102 76 C108 62, 107 46, 98 33" stroke={palette.c2} strokeWidth="2.1" strokeLinecap="round" />
            <polygon points="60,2 64,8 60,14 56,8" fill={palette.c2} stroke="#0B0B0E" strokeWidth="0.8" />
          </>
        )}

        {frameKey === 'rank_verified_barber' && (
          <>
            <circle cx="60" cy="7" r="5" fill="#10B981" stroke="#0B0B0E" strokeWidth="1" />
            <path d="M57.6 7.2 L59.4 9 L62.8 5.2" stroke="#0B0B0E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M24 98 Q60 116 96 98" stroke="#D4A853" strokeWidth="1.8" strokeLinecap="round" />
          </>
        )}

        {frameKey === 'rank_vip_member' && (
          <>
            <polygon points="60,2 64,7.5 60,13 56,7.5" fill="#C4B5FD" stroke="#2E1065" strokeWidth="0.9" />
            <circle cx="14" cy="40" r="2" fill={palette.c2} />
            <circle cx="106" cy="40" r="2" fill={palette.c2} />
            <circle cx="60" cy="113" r="2.2" fill={palette.c2} />
          </>
        )}
      </svg>
    </div>
  );
});
export interface RoleVisualMeta {
  label: string;
  shortLabel: string;
  permissionHint: string;
  nameColor: string;
  badgeClass: string;
  avatarBorderClass: string;
  fallbackBgClass: string;
  rowAccentClass: string;
}

const COLOR_STYLES: Record<
  RoleColorKey,
  Omit<RoleVisualMeta, 'label' | 'shortLabel' | 'permissionHint'>
> = {
  gold: {
    nameColor: 'text-[#F5D67B]',
    badgeClass:
      'bg-gradient-to-l from-[#D4A853]/30 via-[#E5BE67]/20 to-[#B8892E]/25 border-[#D4A853]/65 text-[#F8DF8E] shadow-[0_0_14px_-3px_rgba(212,168,83,0.55)]',
    avatarBorderClass: 'border-[#D4A853] ring-1 ring-[#D4A853]/45',
    fallbackBgClass:
      'bg-gradient-to-br from-[#3A2D12] to-[#1A160B] border-[#D4A853]/65 text-[#F5D67B]',
    rowAccentClass: 'border-r-2 border-r-[#D4A853]/80 bg-[#D4A853]/[0.05]',
  },
  crimson: {
    nameColor: 'text-rose-300',
    badgeClass:
      'bg-gradient-to-l from-rose-500/25 via-red-500/20 to-amber-600/20 border-rose-400/60 text-rose-200 shadow-[0_0_12px_-3px_rgba(244,63,94,0.45)]',
    avatarBorderClass: 'border-rose-400/80 ring-1 ring-rose-400/35',
    fallbackBgClass:
      'bg-gradient-to-br from-[#3D1520] to-[#1A1015] border-rose-400/60 text-rose-200',
    rowAccentClass: 'border-r-2 border-r-rose-400/75 bg-rose-500/[0.04]',
  },
  indigo: {
    nameColor: 'text-indigo-300',
    badgeClass:
      'bg-gradient-to-l from-blue-500/22 via-indigo-500/22 to-violet-500/22 border-indigo-400/55 text-indigo-200 shadow-[0_0_11px_-3px_rgba(99,102,241,0.45)]',
    avatarBorderClass: 'border-indigo-400/80 ring-1 ring-indigo-400/35',
    fallbackBgClass:
      'bg-gradient-to-br from-[#1C2142] to-[#141528] border-indigo-400/55 text-indigo-300',
    rowAccentClass: 'border-r-2 border-r-indigo-400/75 bg-indigo-500/[0.04]',
  },
  teal: {
    nameColor: 'text-teal-300',
    badgeClass:
      'bg-gradient-to-l from-teal-500/22 via-cyan-500/18 to-emerald-500/18 border-teal-400/55 text-teal-200 shadow-[0_0_10px_-3px_rgba(20,184,166,0.4)]',
    avatarBorderClass: 'border-teal-400/75 ring-1 ring-teal-400/30',
    fallbackBgClass:
      'bg-gradient-to-br from-[#103032] to-[#0F1B1D] border-teal-400/55 text-teal-200',
    rowAccentClass: 'border-r-2 border-r-teal-400/70 bg-teal-500/[0.04]',
  },
  silver: {
    nameColor:
      'text-[#F1F5F9] drop-shadow-[0_0_8px_rgba(226,232,240,0.45)]',
    badgeClass:
      'bg-gradient-to-l from-[#F8FAFC]/30 via-[#CBD5E1]/20 to-[#94A3B8]/30 border-[#E2E8F0]/75 text-[#F8FAFC] shadow-[0_0_14px_-2px_rgba(226,232,240,0.55)]',
    avatarBorderClass:
      'border-[#E2E8F0] ring-2 ring-[#CBD5E1]/50 shadow-[0_0_12px_-2px_rgba(226,232,240,0.45)]',
    fallbackBgClass:
      'bg-gradient-to-br from-[#64748B] via-[#334155] to-[#0F172A] border-[#E2E8F0]/80 text-[#F8FAFC]',
    rowAccentClass:
      'border-r-2 border-r-[#E2E8F0]/85 bg-gradient-to-l from-slate-200/[0.08] to-transparent',
  },
  amber: {
    nameColor: 'text-amber-300',
    badgeClass:
      'bg-gradient-to-l from-amber-500/25 via-orange-500/18 to-yellow-500/20 border-amber-400/55 text-amber-200 shadow-[0_0_10px_-3px_rgba(245,158,11,0.45)]',
    avatarBorderClass: 'border-amber-400/75 ring-1 ring-amber-400/35',
    fallbackBgClass:
      'bg-gradient-to-br from-[#352610] to-[#1A150B] border-amber-400/55 text-amber-300',
    rowAccentClass: 'border-r-2 border-r-amber-400/70 bg-amber-500/[0.04]',
  },
  emerald: {
    nameColor: 'text-emerald-300',
    badgeClass:
      'bg-gradient-to-l from-emerald-500/20 via-emerald-500/15 to-amber-700/20 border-emerald-400/50 text-emerald-300 shadow-[0_0_10px_-4px_rgba(16,185,129,0.4)]',
    avatarBorderClass: 'border-emerald-400/75 ring-1 ring-emerald-400/30',
    fallbackBgClass:
      'bg-gradient-to-br from-[#103026] to-[#1A1610] border-emerald-400/50 text-emerald-300',
    rowAccentClass: 'border-r-2 border-r-emerald-400/65 bg-emerald-500/[0.03]',
  },
  violet: {
    nameColor: 'text-violet-300',
    badgeClass:
      'bg-gradient-to-l from-violet-500/24 via-purple-500/18 to-fuchsia-500/20 border-violet-400/55 text-violet-200 shadow-[0_0_10px_-3px_rgba(139,92,246,0.45)]',
    avatarBorderClass: 'border-violet-400/75 ring-1 ring-violet-400/35',
    fallbackBgClass:
      'bg-gradient-to-br from-[#271940] to-[#161224] border-violet-400/55 text-violet-200',
    rowAccentClass: 'border-r-2 border-r-violet-400/70 bg-violet-500/[0.04]',
  },
  slate: {
    nameColor: 'text-[#E8E4DC]',
    badgeClass: 'bg-[#22222A]/90 border-[#383844] text-[#9EA3AE]',
    avatarBorderClass: 'border-[#32323E]',
    fallbackBgClass:
      'bg-gradient-to-br from-[#23232C] to-[#17171D] border-[#383844] text-[#B4B8C2]',
    rowAccentClass: '',
  },
};

export function getRoleMeta(role: UserRole): RoleVisualMeta {
  const def = getRoleDefinitionById(String(role));
  const palette = COLOR_STYLES[def.colorKey] || COLOR_STYLES.slate;
  return {
    label: def.nameAr,
    shortLabel: def.shortLabelAr || def.nameAr,
    permissionHint: def.descriptionAr || 'رتبة في منصة أوريليوس باربر',
    ...palette,
  };
}

export function getEffectiveNameColorClass(
  user?: Pick<UserProfile, 'role' | 'roles' | 'nameColor' | 'nameColorExpiresAt'> | null,
  fallbackRole?: UserRole
): string {
  const activeColor = getActiveNameColor(user);
  if (activeColor && NAME_COLOR_PRESETS[activeColor]) {
    return NAME_COLOR_PRESETS[activeColor].textClass;
  }
  const role = user ? getPrimaryRole(user) : fallbackRole || 'customer';
  return getRoleMeta(role).nameColor;
}

export const VipSilverStar: React.FC<{
  role?: UserRole;
  roles?: UserRole[];
  size?: 'xs' | 'sm' | 'md';
}> = ({ role, roles, size = 'sm' }) => {
  const isVip = role === 'vip_barber' || Boolean(roles?.includes('vip_barber'));
  if (!isVip) return null;
  const dims =
    size === 'md' ? 'w-4 h-4' : size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5';
  return (
    <span
      title="نجمة VIP الفضية · حلاق خبير"
      aria-label="نجمة VIP الفضية"
      className="inline-flex items-center justify-center shrink-0"
    >
      <Star
        className={`${dims} fill-[#E2E8F0] text-white drop-shadow-[0_0_6px_rgba(248,250,252,0.85)]`}
      />
    </span>
  );
};

export const Avatar: React.FC<AvatarProps> = memo(({
  src,
  name,
  size = 'md',
  role,
  roles,
  avatarFrame,
  avatarFrameExpiresAt,
  forcePreviewFrame,
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [src]);

  const resolvedRole =
    roles && roles.length > 0
      ? getPrimaryRole({ role: role || 'customer', roles })
      : role;
  const roleMeta = resolvedRole ? getRoleMeta(resolvedRole) : null;
  const resolvedFrameKey: AvatarFrameKey | null =
    forcePreviewFrame !== undefined
      ? forcePreviewFrame
      : getActiveAvatarFrame({
          role: role || 'customer',
          roles,
          avatarFrame,
          avatarFrameExpiresAt,
        });

  const frameClass =
    resolvedFrameKey && AVATAR_FRAME_PRESETS[resolvedFrameKey]
      ? AVATAR_FRAME_PRESETS[resolvedFrameKey].ringClass
      : '';

  const core =
    src && !imgError ? (
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className={`${SIZE_MAP[size]} rounded-full object-cover border shrink-0 bg-[#1A1A22] ${
          resolvedFrameKey
            ? 'border-transparent'
            : roleMeta
              ? roleMeta.avatarBorderClass
              : 'border-[#2C2C36]'
        } ${resolvedFrameKey ? '' : className}`}
      />
    ) : (
      <div
        className={`${SIZE_MAP[size]} rounded-full border font-bold flex items-center justify-center shrink-0 select-none ${
          roleMeta
            ? roleMeta.fallbackBgClass
            : 'bg-gradient-to-br from-[#2A2418] to-[#1A1A22] border-[#D4A853]/35 text-[#D4A853]'
        } ${resolvedFrameKey ? 'border-transparent' : ''} ${resolvedFrameKey ? '' : className}`}
      >
        {getInitials(name)}
      </div>
    );

  if (!resolvedFrameKey) {
    return core;
  }

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full ${className}`}
    >
      <span className={`rounded-full ${frameClass}`}>{core}</span>
      <OrnamentalFrameArtwork frameKey={resolvedFrameKey} size={size} />
    </span>
  );
});

export function getRoleLabel(role: UserRole): string {
  return getRoleMeta(role).label;
}

export function getRoleNameColor(role: UserRole): string {
  return getRoleMeta(role).nameColor;
}

interface RoleTagProps {
  role: UserRole;
  size?: 'xs' | 'sm' | 'md';
  compact?: boolean;
}

export const RoleTag: React.FC<RoleTagProps> = memo(({
  role,
  size = 'sm',
  compact = false,
}) => {
  const meta = getRoleMeta(role);

  const sizeClasses =
    size === 'xs'
      ? 'px-1.5 py-0.5 text-[10px] gap-1 rounded-md'
      : size === 'md'
        ? 'px-2.5 py-1 text-xs gap-1.5 rounded-lg'
        : 'px-2 py-0.5 text-[11px] gap-1 rounded-md';

  const iconSize =
    size === 'xs' ? 'w-3 h-3' : size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3';

  return (
    <span
      className={`inline-flex items-center font-bold border whitespace-nowrap shrink-0 leading-none ${sizeClasses} ${meta.badgeClass}`}
    >
      {role === 'admin' && <Crown className={`${iconSize} shrink-0`} />}
      {role === 'deputy_director' && <Crown className={`${iconSize} shrink-0`} />}
      {role === 'moderator' && <ShieldCheck className={`${iconSize} shrink-0`} />}
      {role === 'chat_moderator' && <MessageSquare className={`${iconSize} shrink-0`} />}
      {role === 'vip_barber' && (
        <Star
          className={`${iconSize} shrink-0 fill-[#F8FAFC] text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.8)]`}
        />
      )}
      {role === 'master_barber' && <Award className={`${iconSize} shrink-0`} />}
      {role === 'barber_verified' && <Scissors className={`${iconSize} shrink-0`} />}
      {role === 'vip_member' && <Sparkles className={`${iconSize} shrink-0`} />}
      {role === 'customer' && <UserIcon className={`${iconSize} shrink-0`} />}
      {![
        'admin',
        'deputy_director',
        'moderator',
        'chat_moderator',
        'vip_barber',
        'master_barber',
        'barber_verified',
        'vip_member',
        'customer',
      ].includes(String(role)) && <Sparkles className={`${iconSize} shrink-0`} />}

      <span>{compact ? meta.shortLabel : meta.label}</span>

      {role === 'barber_verified' && (
        <BadgeCheck className={`${iconSize} shrink-0 text-amber-400`} />
      )}
      {role === 'vip_barber' && (
        <Scissors className={`${iconSize} shrink-0 text-slate-200`} />
      )}
    </span>
  );
});

interface RoleBadgesListProps {
  roles: UserRole[];
  size?: 'xs' | 'sm' | 'md';
  compact?: boolean;
}

export const RoleBadgesList: React.FC<RoleBadgesListProps> = memo(({
  roles,
  size = 'sm',
  compact = false,
}) => {
  const normalized = normalizeUserRoles(roles);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {normalized.map((r) => (
        <RoleTag key={String(r)} role={r} size={size} compact={compact} />
      ))}
    </span>
  );
});

interface MultiRoleSelectorProps {
  selectedRoles: UserRole[];
  onChange: (nextRoles: UserRole[]) => void;
  disabled?: boolean;
}

export const MultiRoleSelector: React.FC<MultiRoleSelectorProps> = ({
  selectedRoles,
  onChange,
  disabled = false,
}) => {
  const normalized = normalizeUserRoles(selectedRoles);
  const isDefaultCustomerOnly =
    normalized.length === 1 && normalized[0] === 'customer';
  const assignableRoles = getAssignableRoles();

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {assignableRoles.map((def) => {
          const r = def.id as UserRole;
          const meta = getRoleMeta(r);
          const active = normalized.includes(r);
          return (
            <button
              key={def.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(toggleElevatedRoleSelection(normalized, r))}
              className={`flex items-start justify-between gap-2 p-2.5 rounded-xl border text-right transition-all cursor-pointer disabled:opacity-55 ${
                active
                  ? 'bg-[#1D1D28] border-[#D4A853]/75 shadow-[0_0_12px_-4px_rgba(212,168,83,0.35)]'
                  : 'bg-[#14141A] border-[#292935] hover:border-[#3E3E4E]'
              }`}
            >
              <div className="space-y-1 min-w-0">
                <RoleTag role={r} size="xs" />
                <div className="text-[10px] text-[#A6A196] leading-snug">
                  {meta.permissionHint}
                </div>
              </div>
              <span
                className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${
                  active
                    ? 'bg-[#D4A853] border-[#D4A853] text-[#0B0B0E]'
                    : 'bg-[#101015] border-[#383846] text-transparent'
                }`}
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </span>
            </button>
          );
        })}

        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(['customer'])}
          className={`flex items-start justify-between gap-2 p-2.5 rounded-xl border text-right transition-all cursor-pointer disabled:opacity-55 ${
            isDefaultCustomerOnly
              ? 'bg-[#1C1C24] border-[#6B7280] shadow-sm'
              : 'bg-[#14141A] border-[#292935] hover:border-[#3E3E4E]'
          }`}
        >
          <div className="space-y-1 min-w-0">
            <RoleTag role="customer" size="xs" />
            <div className="text-[10px] text-[#A6A196] leading-snug">
              {getRoleMeta('customer').permissionHint}
            </div>
          </div>
          <span
            className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${
              isDefaultCustomerOnly
                ? 'bg-[#9CA3AF] border-[#9CA3AF] text-[#0B0B0E]'
                : 'bg-[#101015] border-[#383846] text-transparent'
            }`}
          >
            <Check className="w-3.5 h-3.5 stroke-[3]" />
          </span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-[#9C968B]">
        <span>الشارات التي ستظهر بجانب الاسم:</span>
        <RoleBadgesList roles={normalized} size="xs" />
      </div>
    </div>
  );
};
