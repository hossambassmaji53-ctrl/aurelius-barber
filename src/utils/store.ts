import {
  Timestamp,
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, createSafeId, db, isSuperAdminEmail, tsToMillis } from '../firebase';
import {
  AvatarFrameKey,
  BuiltInRole,
  ChatTitleKey,
  FounderAvatarFrameKey,
  NameColorKey,
  RankAvatarFrameKey,
  StoreAvatarFrameKey,
  StoreConfig,
  StoreFeatureKey,
  UserProfile,
} from '../types';
import { getTodayDateKey } from './gamification';
import { assertFounderActor, hasRole, isFounderUser } from './roles';
import { sanitizeHandleInput, sanitizePlainText } from './security';
const getUserHandle = (..._args: unknown[]) => ''; const isValidUsername = (..._args: unknown[]) => true;

export const DEFAULT_STORE_CONFIG: StoreConfig = {
  id: 'current',
  dailyRewardCoins: 25,
  reservedSpecialIds: [
    '1',
    '7',
    '10',
    '77',
    '99',
    '100',
    '777',
    '999',
    '1000',
    '7777',
    '9999',
    '10000',
    '77777',
    '100000',
  ],
  items: {
    special_id: {
      enabled: true,
      price: 250,
      durationDays: 7,
      labelAr: 'آيدي مميز مؤقت (ID)',
    },
    name_color: {
      enabled: true,
      price: 120,
      durationDays: 7,
      labelAr: 'لون اسم متوهج ومميز',
    },
    avatar_frame: {
      enabled: true,
      price: 150,
      durationDays: 7,
      labelAr: 'إطارات المتجر المتنوعة',
    },
    chat_title: {
      enabled: true,
      price: 90,
      durationDays: 7,
      labelAr: 'لقب تميز في الدردشة',
    },
    credit_pass: {
      enabled: true,
      price: 200,
      durationDays: 7,
      labelAr: 'بطاقة المتجر المؤقتة (بالكريدت)',
    },
  },
  updatedById: 'system',
  createdAt: null,
  updatedAt: null,
};

export interface NameColorPreset {
  key: NameColorKey;
  labelAr: string;
  textClass: string;
  swatchClass: string;
}

export const NAME_COLOR_PRESETS: Record<NameColorKey, NameColorPreset> = {
  gold_royal: {
    key: 'gold_royal',
    labelAr: 'ذهبي ملكي متوهج',
    textClass: 'text-[#F8DF8E] drop-shadow-[0_0_8px_rgba(212,168,83,0.55)]',
    swatchClass: 'bg-gradient-to-l from-[#D4A853] to-[#F8DF8E]',
  },
  emerald_neon: {
    key: 'emerald_neon',
    labelAr: 'زمردي لامع',
    textClass: 'text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.45)]',
    swatchClass: 'bg-gradient-to-l from-emerald-500 to-teal-300',
  },
  crimson_ruby: {
    key: 'crimson_ruby',
    labelAr: 'ياقوتي قرمزي',
    textClass: 'text-rose-300 drop-shadow-[0_0_8px_rgba(244,63,94,0.45)]',
    swatchClass: 'bg-gradient-to-l from-rose-500 to-red-300',
  },
  sapphire_sky: {
    key: 'sapphire_sky',
    labelAr: 'أزرق سماوي ملكي',
    textClass: 'text-sky-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.45)]',
    swatchClass: 'bg-gradient-to-l from-sky-500 to-cyan-300',
  },
  violet_amethyst: {
    key: 'violet_amethyst',
    labelAr: 'بنفسجي أميثست',
    textClass: 'text-violet-300 drop-shadow-[0_0_8px_rgba(167,139,250,0.45)]',
    swatchClass: 'bg-gradient-to-l from-violet-500 to-fuchsia-300',
  },
};

export type AvatarFrameCategory = 'store' | 'rank' | 'founder';

export interface AvatarFramePreset {
  key: AvatarFrameKey;
  category: AvatarFrameCategory;
  labelAr: string;
  descriptionAr: string;
  tierPrice?: number;
  requiredRole?: BuiltInRole;
  isAnimated?: boolean;
  ringClass: string;
  badgeClass: string;
}

export const STORE_AVATAR_FRAME_PRESETS: Record<StoreAvatarFrameKey, AvatarFramePreset> = {
  obsidian_bronze: {
    key: 'obsidian_bronze',
    category: 'store',
    labelAr: 'إطار البرونز الكلاسيكي',
    descriptionAr: 'تطويق برونزي مصقول بطابع كلاسيكي أنيق مناسب لجميع الأعضاء',
    tierPrice: 100,
    ringClass:
      'ring-2 ring-amber-600 ring-offset-2 ring-offset-[#0B0B0E] shadow-[0_0_14px_-2px_rgba(217,119,6,0.55)]',
    badgeClass: 'bg-amber-600 text-white',
  },
  emerald_royal: {
    key: 'emerald_royal',
    category: 'store',
    labelAr: 'إطار الزمرد الملكي',
    descriptionAr: 'هالة زمردية متوازنة تبرز حضورك في الدردشة والملف',
    tierPrice: 140,
    ringClass:
      'ring-2 ring-emerald-400 ring-offset-2 ring-offset-[#0B0B0E] shadow-[0_0_16px_-2px_rgba(52,211,153,0.6)]',
    badgeClass: 'bg-emerald-500 text-[#0B0B0E]',
  },
  gold_crown: {
    key: 'gold_crown',
    category: 'store',
    labelAr: 'إطار التاج الذهبي',
    descriptionAr: 'توهج أوريليوس الذهبي الأصيل بحواف مصقولة',
    tierPrice: 150,
    ringClass:
      'ring-2 ring-[#D4A853] ring-offset-2 ring-offset-[#0B0B0E] shadow-[0_0_16px_-2px_rgba(212,168,83,0.68)]',
    badgeClass: 'bg-[#D4A853] text-[#0B0B0E]',
  },
  ruby_flame: {
    key: 'ruby_flame',
    category: 'store',
    labelAr: 'إطار الياقوت المشتعل',
    descriptionAr: 'توهج قرمزي عميق يمنح صورتك طابعاً جريئاً ولافتاً',
    tierPrice: 180,
    ringClass:
      'ring-2 ring-rose-400 ring-offset-2 ring-offset-[#0B0B0E] shadow-[0_0_16px_-2px_rgba(244,63,94,0.62)]',
    badgeClass: 'bg-rose-500 text-white',
  },
  sapphire_neon: {
    key: 'sapphire_neon',
    category: 'store',
    labelAr: 'إطار الياقوت الأزرق',
    descriptionAr: 'إضاءة نيون سماوية نقية مثالية لهوية عصرية متجددة',
    tierPrice: 200,
    ringClass:
      'ring-2 ring-sky-400 ring-offset-2 ring-offset-[#0B0B0E] shadow-[0_0_18px_-2px_rgba(56,189,248,0.65)]',
    badgeClass: 'bg-sky-400 text-[#0B0B0E]',
  },
  platinum_diamond: {
    key: 'platinum_diamond',
    category: 'store',
    labelAr: 'إطار الألماس البلاتيني',
    descriptionAr: 'بريق فضي بلاتيني فائق الندرة لإطلالة استثنائية',
    tierPrice: 260,
    ringClass:
      'ring-2 ring-slate-200 ring-offset-2 ring-offset-[#0B0B0E] shadow-[0_0_18px_-2px_rgba(241,245,249,0.62)]',
    badgeClass: 'bg-slate-200 text-[#0B0B0E]',
  },
};
export const RANK_AVATAR_FRAME_PRESETS: Record<RankAvatarFrameKey, AvatarFramePreset> = {
  rank_deputy: {
    key: 'rank_deputy',
    category: 'rank',
    labelAr: 'إطار رتبة نائب المدير',
    descriptionAr: 'إطار تنفيذي مرموق مجاني ومخصص لحاملي رتبة نائب المدير',
    requiredRole: 'deputy_director',
    ringClass:
      'ring-[2.5px] ring-rose-500 ring-offset-2 ring-offset-[#0B0B0E] shadow-[0_0_18px_-2px_rgba(244,63,94,0.65)]',
    badgeClass: 'bg-rose-500 text-white',
  },
  rank_moderator: {
    key: 'rank_moderator',
    category: 'rank',
    labelAr: 'إطار رتبة المشرف العام',
    descriptionAr: 'إطار إشرافي نيلي مخصص لطاقم المشرفين العامين مجاناً',
    requiredRole: 'moderator',
    ringClass:
      'ring-[2.5px] ring-indigo-400 ring-offset-2 ring-offset-[#0B0B0E] shadow-[0_0_16px_-2px_rgba(129,140,248,0.62)]',
    badgeClass: 'bg-indigo-500 text-white',
  },
  rank_chat_mod: {
    key: 'rank_chat_mod',
    category: 'rank',
    labelAr: 'إطار رتبة مشرف الدردشة',
    descriptionAr: 'إطار فيروزي هادئ مخصص لمراقبي ومشرفي غرف الدردشة',
    requiredRole: 'chat_moderator',
    ringClass:
      'ring-[2.5px] ring-teal-400 ring-offset-2 ring-offset-[#0B0B0E] shadow-[0_0_16px_-2px_rgba(45,212,191,0.58)]',
    badgeClass: 'bg-teal-400 text-[#0B0B0E]',
  },
  rank_vip_barber: {
    key: 'rank_vip_barber',
    category: 'rank',
    labelAr: 'إطار حلاق VIP الخبير',
    descriptionAr: 'إطار فضي مصقول مخصص لنخبة الحلاقين VIP مجاناً',
    requiredRole: 'vip_barber',
    ringClass:
      'ring-[2.5px] ring-slate-200 ring-offset-2 ring-offset-[#0B0B0E] shadow-[0_0_16px_-2px_rgba(226,232,240,0.58)]',
    badgeClass: 'bg-slate-200 text-[#0B0B0E]',
  },
  rank_master_barber: {
    key: 'rank_master_barber',
    category: 'rank',
    labelAr: 'إطار أستاذ الحلاقة',
    descriptionAr: 'إطار كهرماني دافئ مخصص لحاملي رتبة أستاذ حلاقة',
    requiredRole: 'master_barber',
    ringClass:
      'ring-[2.5px] ring-amber-400 ring-offset-2 ring-offset-[#0B0B0E] shadow-[0_0_16px_-2px_rgba(251,191,36,0.6)]',
    badgeClass: 'bg-amber-400 text-[#0B0B0E]',
  },
  rank_verified_barber: {
    key: 'rank_verified_barber',
    category: 'rank',
    labelAr: 'إطار الحلاق الموثّق',
    descriptionAr: 'إطار توثيق زمردي خاص بالحلاقين المعتمدين في المنصة',
    requiredRole: 'barber_verified',
    ringClass:
      'ring-[2.5px] ring-emerald-400 ring-offset-2 ring-offset-[#0B0B0E] shadow-[0_0_15px_-2px_rgba(52,211,153,0.58)]',
    badgeClass: 'bg-emerald-400 text-[#0B0B0E]',
  },
  rank_vip_member: {
    key: 'rank_vip_member',
    category: 'rank',
    labelAr: 'إطار العضو المميز (VIP)',
    descriptionAr: 'إطار بنفسجي ملكي مجاني لحاملي رتبة العضو المميز',
    requiredRole: 'vip_member',
    ringClass:
      'ring-[2.5px] ring-violet-400 ring-offset-2 ring-offset-[#0B0B0E] shadow-[0_0_16px_-2px_rgba(167,139,250,0.6)]',
    badgeClass: 'bg-violet-400 text-[#0B0B0E]',
  },
};

export const FOUNDER_AVATAR_FRAME_PRESET: AvatarFramePreset = {
  key: 'founder_sovereign',
  category: 'founder',
  labelAr: 'إطار السيادة الملكي (حصري للمؤسس)',
  descriptionAr:
    'هالة ذهبية متحركة فاخرة بدوران سلس وتوهج أوريليوس الدائم — مقفول حصرياً لحساب المؤسس',
  requiredRole: 'admin',
  isAnimated: true,
  ringClass:
    'ring-[3px] ring-[#FCE08B] ring-offset-2 ring-offset-[#0B0B0E] shadow-[0_0_24px_rgba(212,168,83,0.82)]',
  badgeClass: 'bg-gradient-to-l from-[#B67D1B] via-[#FCE08B] to-[#D4A853] text-[#0B0B0E]',
};

export const AVATAR_FRAME_PRESETS: Record<AvatarFrameKey, AvatarFramePreset> = {
  ...STORE_AVATAR_FRAME_PRESETS,
  ...RANK_AVATAR_FRAME_PRESETS,
  founder_sovereign: FOUNDER_AVATAR_FRAME_PRESET,
};

export interface ChatTitlePreset {
  key: ChatTitleKey;
  labelAr: string;
  descriptionAr: string;
  pillClass: string;
  founderOnly?: boolean;
}

export const CHAT_TITLE_PRESETS: Record<ChatTitleKey, ChatTitlePreset> = {
  community_star: {
    key: 'community_star',
    labelAr: 'نجم المجتمع',
    descriptionAr: 'يظهر بجانب اسمك في الدردشة العامة والخاصة',
    pillClass: 'bg-amber-500/15 text-amber-200 border-amber-400/35',
  },
  refined_taste: {
    key: 'refined_taste',
    labelAr: 'ذوق رفيع',
    descriptionAr: 'لقب أنيق يعكس حضورك المميز في مجتمع أوريليوس',
    pillClass: 'bg-[#D4A853]/15 text-[#FCE08B] border-[#D4A853]/40',
  },
  guest_of_honor: {
    key: 'guest_of_honor',
    labelAr: 'ضيف الشرف',
    descriptionAr: 'شارة ترحيب وتقدير خاصة داخل الغرف',
    pillClass: 'bg-sky-500/15 text-sky-200 border-sky-400/35',
  },
  elite_supporter: {
    key: 'elite_supporter',
    labelAr: 'داعم النخبة',
    descriptionAr: 'يعكس مساهمتك الفاعلة وتواجدك المستمر',
    pillClass: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/35',
  },
  style_icon: {
    key: 'style_icon',
    labelAr: 'أيقونة الأناقة',
    descriptionAr: 'لقب عصري يبرز اهتمامك بأرقى تفاصيل الحلاقة',
    pillClass: 'bg-violet-500/15 text-violet-200 border-violet-400/35',
  },
  founder_dean: {
    key: 'founder_dean',
    labelAr: 'عميد أوريليوس',
    descriptionAr: 'لقب سيادي حصري للمؤسس أو من يمنحه المؤسس',
    pillClass: 'bg-[#D4A853]/25 text-[#FFF2BC] border-[#FCE08B]/60',
    founderOnly: true,
  },
};

export function resolveStoreConfig(config?: StoreConfig | null): StoreConfig {
  if (!config) return DEFAULT_STORE_CONFIG;
  return {
    ...DEFAULT_STORE_CONFIG,
    ...config,
    reservedSpecialIds: Array.isArray(config.reservedSpecialIds)
      ? config.reservedSpecialIds
      : DEFAULT_STORE_CONFIG.reservedSpecialIds,
    items: {
      special_id: {
        ...DEFAULT_STORE_CONFIG.items.special_id,
        ...(config.items?.special_id || {}),
      },
      name_color: {
        ...DEFAULT_STORE_CONFIG.items.name_color,
        ...(config.items?.name_color || {}),
      },
      avatar_frame: {
        ...DEFAULT_STORE_CONFIG.items.avatar_frame,
        ...(config.items?.avatar_frame || {}),
      },
      chat_title: {
        ...DEFAULT_STORE_CONFIG.items.chat_title!,
        ...(config.items?.chat_title || {}),
      },
      credit_pass: {
        ...DEFAULT_STORE_CONFIG.items.credit_pass,
        ...(config.items?.credit_pass || {}),
      },
    },
  };
}

export function getStoreAvatarFramePrice(
  frameKey: StoreAvatarFrameKey,
  config?: StoreConfig | null
): number {
  const preset = STORE_AVATAR_FRAME_PRESETS[frameKey];
  if (typeof preset?.tierPrice === 'number') {
    return preset.tierPrice;
  }
  return resolveStoreConfig(config).items.avatar_frame.price;
}

export function canUserUseRankFrame(
  user: Pick<UserProfile, 'role' | 'roles'> | null | undefined,
  frameKey: AvatarFrameKey,
  isFounder = false
): boolean {
  const preset = AVATAR_FRAME_PRESETS[frameKey];
  if (!preset) return false;
  if (preset.category === 'store') return true;
  if (preset.category === 'founder') {
    return Boolean(isFounder || isFounderUser(user));
  }
  if (isFounder || isFounderUser(user)) return true;
  if (!preset.requiredRole) return false;
  return hasRole(user, preset.requiredRole);
}
export function getActiveNameColor(
  user?: Pick<UserProfile, 'nameColor' | 'nameColorExpiresAt' | 'role' | 'roles'> | null,
  nowMs = Date.now()
): NameColorKey | null {
  if (!user?.nameColor) return null;
  if (!(user.nameColor in NAME_COLOR_PRESETS)) return null;
  if (isFounderUser(user)) return user.nameColor as NameColorKey;
  if (!user.nameColorExpiresAt) return user.nameColor as NameColorKey;
  const exp = tsToMillis(user.nameColorExpiresAt);
  if (!exp || exp > nowMs) return user.nameColor as NameColorKey;
  return null;
}

export function getActiveAvatarFrame(
  user?: Pick<UserProfile, 'avatarFrame' | 'avatarFrameExpiresAt' | 'role' | 'roles'> | null,
  nowMs = Date.now()
): AvatarFrameKey | null {
  if (!user?.avatarFrame) return null;
  if (!(user.avatarFrame in AVATAR_FRAME_PRESETS)) return null;
  const key = user.avatarFrame as AvatarFrameKey;
  const preset = AVATAR_FRAME_PRESETS[key];
  if (preset.category === 'founder' && !isFounderUser(user)) return null;
  if (preset.category === 'rank' && preset.requiredRole && !isFounderUser(user) && !hasRole(user, preset.requiredRole)) {
    return null;
  }
  if (isFounderUser(user)) return key;
  if (!user.avatarFrameExpiresAt) return key;
  const exp = tsToMillis(user.avatarFrameExpiresAt);
  if (!exp || exp > nowMs) return key;
  return null;
}

export function getActiveChatTitle(
  user?: Pick<UserProfile, 'chatTitle' | 'chatTitleExpiresAt' | 'role' | 'roles'> | null,
  nowMs = Date.now()
): ChatTitleKey | null {
  if (!user?.chatTitle) return null;
  if (!(user.chatTitle in CHAT_TITLE_PRESETS)) return null;
  if (isFounderUser(user)) return user.chatTitle as ChatTitleKey;
  if (!user.chatTitleExpiresAt) return user.chatTitle as ChatTitleKey;
  const exp = tsToMillis(user.chatTitleExpiresAt);
  if (!exp || exp > nowMs) return user.chatTitle as ChatTitleKey;
  return null;
}

export function getActiveCreditPass(
  user?: Pick<UserProfile, 'creditPassTier' | 'creditPassExpiresAt' | 'role' | 'roles'> | null,
  nowMs = Date.now()
): string | null {
  if (!user?.creditPassTier) return null;
  if (isFounderUser(user)) return null;
  if (!user.creditPassExpiresAt) return user.creditPassTier;
  const exp = tsToMillis(user.creditPassExpiresAt);
  if (!exp || exp > nowMs) return user.creditPassTier;
  return null;
}

export function hasAnyActiveCreditRental(
  user?: Pick<
    UserProfile,
    | 'role'
    | 'roles'
    | 'creditPassTier'
    | 'creditPassExpiresAt'
    | 'isSpecialId'
    | 'specialIdExpiresAt'
    | 'specialIdGrantedBy'
    | 'nameColor'
    | 'nameColorExpiresAt'
    | 'avatarFrame'
    | 'avatarFrameExpiresAt'
    | 'chatTitle'
    | 'chatTitleExpiresAt'
  > | null,
  nowMs = Date.now()
): boolean {
  if (!user || isFounderUser(user)) return false;
  if (getActiveCreditPass(user, nowMs)) return true;
  if (getActiveNameColor(user, nowMs)) return true;
  if (getActiveChatTitle(user, nowMs)) return true;
  const frameKey = getActiveAvatarFrame(user, nowMs);
  if (frameKey && AVATAR_FRAME_PRESETS[frameKey]?.category === 'store') return true;
  if (user.isSpecialId && (user.specialIdGrantedBy === 'store' || Boolean(user.specialIdExpiresAt))) {
    if (!user.specialIdExpiresAt) return true;
    const exp = tsToMillis(user.specialIdExpiresAt);
    if (!exp || exp > nowMs) return true;
  }
  return false;
}

export function formatRemainingDuration(expiresAt: any, nowMs = Date.now()): string {
  if (!expiresAt) return 'دائم';
  const exp = tsToMillis(expiresAt);
  if (!exp) return 'دائم';
  const diff = exp - nowMs;
  if (diff <= 0) return 'منتهي';
  const hours = Math.ceil(diff / (60 * 60 * 1000));
  if (hours < 24) return `باقي ${hours} ساعة`;
  const days = Math.ceil(hours / 24);
  return `باقي ${days} يوم`;
}

export function isIdReservedForFounder(
  candidateId: string,
  config?: StoreConfig | null
): boolean {
  const normalized = candidateId.trim().toLowerCase();
  const resolved = resolveStoreConfig(config);
  if (resolved.reservedSpecialIds.map((id) => id.toLowerCase()).includes(normalized)) {
    return true;
  }
  // Short 1-2 character/digit ultra-rare IDs stay reserved for Founder assignment
  if (normalized.length <= 2) return true;
  return false;
}

export async function claimDailyLoginReward(
  user: UserProfile,
  config?: StoreConfig | null
): Promise<{ claimed: boolean; amount: number }> {
  if (user.isBanned) return { claimed: false, amount: 0 };
  const today = getTodayDateKey();
  if (user.lastDailyClaimDate === today) {
    return { claimed: false, amount: 0 };
  }
  const resolved = resolveStoreConfig(config);
  const reward = Math.max(
    0,
    Math.min(100, Math.floor(resolved.dailyRewardCoins ?? 25))
  );
  if (reward <= 0) return { claimed: false, amount: 0 };

  const userRef = doc(db, 'users', user.uid);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists()) return { claimed: false, amount: 0 };
    const serverUser = snap.data() as UserProfile;
    if (serverUser.isBanned || serverUser.lastDailyClaimDate === today) {
      return { claimed: false, amount: 0 };
    }
    const serverPoints = Math.max(0, Math.floor(serverUser.points || 0));
    const nextPoints = Math.min(1000000, serverPoints + reward);
    tx.update(userRef, {
      points: nextPoints,
      lastDailyClaimDate: today,
      updatedAt: serverTimestamp(),
    });
    return { claimed: true, amount: reward };
  });
}

export async function equipFreeAvatarFrame(params: {
  user: UserProfile;
  isFounder: boolean;
  frameKey: AvatarFrameKey | null;
}): Promise<{ ok: boolean; error?: string; message?: string }> {
  const { user, isFounder, frameKey } = params;
  if (!auth.currentUser || auth.currentUser.uid !== user.uid) {
    return { ok: false, error: 'تعذر التحقق من هوية الحساب.' };
  }

  const effectiveFounder =
    Boolean(isFounder) && isSuperAdminEmail(auth.currentUser.email);

  if (frameKey === null) {
    await updateDoc(doc(db, 'users', user.uid), {
      avatarFrame: '',
      avatarFrameExpiresAt: null,
      updatedAt: serverTimestamp(),
    });
    return { ok: true, message: 'تمت إزالة الإطار من صورتك بنجاح.' };
  }

  const preset = AVATAR_FRAME_PRESETS[frameKey];
  if (!preset) {
    return { ok: false, error: 'الإطار المختار غير صالح.' };
  }

  if (preset.category === 'store' && !effectiveFounder) {
    return { ok: false, error: 'إطارات المتجر تتطلب الشراء بالكريدت.' };
  }

  if (!canUserUseRankFrame(user, frameKey, effectiveFounder)) {
    return {
      ok: false,
      error: `هذا الإطار مخصص فقط لحاملي الرتبة المطلوبة (${preset.labelAr}).`,
    };
  }

  await updateDoc(doc(db, 'users', user.uid), {
    avatarFrame: frameKey,
    avatarFrameExpiresAt: null,
    updatedAt: serverTimestamp(),
  });

  return {
    ok: true,
    message: `تم تفعيل ${preset.labelAr} مجاناً على صورتك.`,
  };
}
export async function purchaseStoreFeature(params: {
  user: UserProfile;
  isFounder: boolean;
  config: StoreConfig;
  feature: StoreFeatureKey;
  allUsers: UserProfile[];
  customIdValue?: string;
  nameColorKey?: NameColorKey;
  avatarFrameKey?: AvatarFrameKey;
  chatTitleKey?: ChatTitleKey;
}): Promise<{ ok: boolean; error?: string; message?: string }> {
  const {
    user,
    isFounder,
    config,
    feature,
    allUsers,
    customIdValue,
    nameColorKey,
    avatarFrameKey,
    chatTitleKey,
  } = params;

  if (!auth.currentUser || auth.currentUser.uid !== user.uid) {
    return { ok: false, error: 'تعذر التحقق من هوية الحساب.' };
  }

  const effectiveFounder =
    Boolean(isFounder) && isSuperAdminEmail(auth.currentUser.email);

  const resolved = resolveStoreConfig(config);
  const itemCfg = resolved.items[feature] || DEFAULT_STORE_CONFIG.items[feature]!;

  if (!effectiveFounder && !itemCfg.enabled) {
    return { ok: false, error: 'هذه الميزة غير متاحة حالياً في المتجر.' };
  }

  const basePrice = effectiveFounder ? 0 : Math.max(0, Math.floor(itemCfg.price));
  const durationDays = Math.max(1, Math.min(365, Math.floor(itemCfg.durationDays || 7)));
  const expiresAtTs = effectiveFounder
    ? null
    : Timestamp.fromMillis(Date.now() + durationDays * 24 * 60 * 60 * 1000);
  const userRef = doc(db, 'users', user.uid);

  if (feature === 'special_id') {
    const cleanId = sanitizeHandleInput(customIdValue);
    if (!isValidUsername(cleanId)) {
      return { ok: false, error: 'صيغة الآيدي غير صالحة (أرقام أو أحرف إنجليزية صغيرة و _ فقط).' };
    }
    if (!effectiveFounder && isIdReservedForFounder(cleanId, resolved)) {
      return {
        ok: false,
        error: 'هذا الرقم/الآيدي محجوز للإدارة أو المؤسس ولا يمكن شراؤه من المتجر.',
      };
    }
    const conflict = allUsers.find(
      (u) => u.uid !== user.uid && getUserHandle(u).toLowerCase() === cleanId
    );
    if (conflict) {
      return { ok: false, error: 'هذا الآيدي مستخدم بالفعل من عضو آخر.' };
    }

    return runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) return { ok: false, error: 'تعذر العثور على الحساب.' };
      const serverUser = snap.data() as UserProfile;
      const serverCredits = Math.max(0, Math.floor(serverUser.points || 0));
      if (!effectiveFounder && serverCredits < basePrice) {
        return {
          ok: false,
          error: `رصيدك الحالي (${serverCredits} كريدت) غير كافٍ. المطلوب ${basePrice} كريدت.`,
        };
      }
      const nextPoints = effectiveFounder ? serverCredits : serverCredits - basePrice;
      const baseHandle = isValidUsername(serverUser.baseUsername)
        ? serverUser.baseUsername!
        : !serverUser.isSpecialId
          ? getUserHandle(serverUser)
          : serverUser.baseUsername || getUserHandle(serverUser);

      tx.update(userRef, {
        ...(effectiveFounder ? {} : { points: nextPoints }),
        baseUsername: baseHandle,
        username: cleanId,
        isSpecialId: true,
        specialIdLabel: effectiveFounder ? 'آيدي المؤسس المميز' : 'آيدي مميز (متجر)',
        specialIdExpiresAt: expiresAtTs,
        specialIdGrantedBy: effectiveFounder ? 'admin' : 'store',
        updatedAt: serverTimestamp(),
      });

      return {
        ok: true,
        message: effectiveFounder
          ? `تم تفعيل الآيدي @${cleanId} بشكل دائم ومجاني للمؤسس.`
          : `تم تفعيل الآيدي المميز @${cleanId} لمدة ${durationDays} يوم.`,
      };
    });
  }

  if (feature === 'name_color') {
    if (!nameColorKey || !(nameColorKey in NAME_COLOR_PRESETS)) {
      return { ok: false, error: 'يرجى اختيار لون اسم صالح.' };
    }
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) return { ok: false, error: 'تعذر العثور على الحساب.' };
      const serverUser = snap.data() as UserProfile;
      const serverCredits = Math.max(0, Math.floor(serverUser.points || 0));
      if (!effectiveFounder && serverCredits < basePrice) {
        return {
          ok: false,
          error: `رصيدك الحالي (${serverCredits} كريدت) غير كافٍ. المطلوب ${basePrice} كريدت.`,
        };
      }
      const nextPoints = effectiveFounder ? serverCredits : serverCredits - basePrice;
      tx.update(userRef, {
        ...(effectiveFounder ? {} : { points: nextPoints }),
        nameColor: nameColorKey,
        nameColorExpiresAt: expiresAtTs,
        updatedAt: serverTimestamp(),
      });
      return {
        ok: true,
        message: effectiveFounder
          ? `تم تفعيل لون الاسم (${NAME_COLOR_PRESETS[nameColorKey].labelAr}) بشكل دائم.`
          : `تم تفعيل لون الاسم (${NAME_COLOR_PRESETS[nameColorKey].labelAr}) لمدة ${durationDays} يوم.`,
      };
    });
  }

  if (feature === 'avatar_frame') {
    if (!avatarFrameKey || !(avatarFrameKey in AVATAR_FRAME_PRESETS)) {
      return { ok: false, error: 'يرجى اختيار إطار صورة صالح.' };
    }
    const preset = AVATAR_FRAME_PRESETS[avatarFrameKey];
    if (preset.category !== 'store') {
      return equipFreeAvatarFrame({
        user,
        isFounder: effectiveFounder,
        frameKey: avatarFrameKey,
      });
    }
    const framePrice = effectiveFounder
      ? 0
      : getStoreAvatarFramePrice(avatarFrameKey as StoreAvatarFrameKey, resolved);

    return runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) return { ok: false, error: 'تعذر العثور على الحساب.' };
      const serverUser = snap.data() as UserProfile;
      const serverCredits = Math.max(0, Math.floor(serverUser.points || 0));
      if (!effectiveFounder && serverCredits < framePrice) {
        return {
          ok: false,
          error: `رصيدك الحالي (${serverCredits} كريدت) غير كافٍ. المطلوب ${framePrice} كريدت.`,
        };
      }
      const nextPoints = effectiveFounder ? serverCredits : serverCredits - framePrice;
      tx.update(userRef, {
        ...(effectiveFounder ? {} : { points: nextPoints }),
        avatarFrame: avatarFrameKey,
        avatarFrameExpiresAt: expiresAtTs,
        updatedAt: serverTimestamp(),
      });
      return {
        ok: true,
        message: effectiveFounder
          ? `تم تفعيل (${preset.labelAr}) بشكل دائم.`
          : `تم تفعيل (${preset.labelAr}) لمدة ${durationDays} يوم.`,
      };
    });
  }

  if (feature === 'chat_title') {
    if (!chatTitleKey || !(chatTitleKey in CHAT_TITLE_PRESETS)) {
      return { ok: false, error: 'يرجى اختيار لقب دردشة صالح.' };
    }
    const preset = CHAT_TITLE_PRESETS[chatTitleKey];
    if (preset.founderOnly && !effectiveFounder) {
      return { ok: false, error: 'هذا اللقب السيادي مخصص للمؤسس فقط.' };
    }
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) return { ok: false, error: 'تعذر العثور على الحساب.' };
      const serverUser = snap.data() as UserProfile;
      const serverCredits = Math.max(0, Math.floor(serverUser.points || 0));
      if (!effectiveFounder && serverCredits < basePrice) {
        return {
          ok: false,
          error: `رصيدك الحالي (${serverCredits} كريدت) غير كافٍ. المطلوب ${basePrice} كريدت.`,
        };
      }
      const nextPoints = effectiveFounder ? serverCredits : serverCredits - basePrice;
      tx.update(userRef, {
        ...(effectiveFounder ? {} : { points: nextPoints }),
        chatTitle: chatTitleKey,
        chatTitleExpiresAt: expiresAtTs,
        updatedAt: serverTimestamp(),
      });
      return {
        ok: true,
        message: effectiveFounder
          ? `تم تفعيل لقب (${preset.labelAr}) بشكل دائم للمؤسس.`
          : `تم تفعيل لقب (${preset.labelAr}) في الدردشة لمدة ${durationDays} يوم.`,
      };
    });
  }

  if (feature === 'credit_pass') {
    if (effectiveFounder) {
      return {
        ok: true,
        message: 'بطاقة المؤسس الملكية مفعّلة لديك بشكل دائم ومجاني ولا تحتاج إلى بطاقة متجر مؤقتة.',
      };
    }
    return runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) return { ok: false, error: 'تعذر العثور على الحساب.' };
      const serverUser = snap.data() as UserProfile;
      const serverCredits = Math.max(0, Math.floor(serverUser.points || 0));
      if (serverCredits < basePrice) {
        return {
          ok: false,
          error: `رصيدك الحالي (${serverCredits} كريدت) غير كافٍ. المطلوب ${basePrice} كريدت.`,
        };
      }
      const nextPoints = serverCredits - basePrice;
      tx.update(userRef, {
        points: nextPoints,
        creditPassTier: 'aurelius_credit_pass',
        creditPassExpiresAt: expiresAtTs,
        updatedAt: serverTimestamp(),
      });
      return {
        ok: true,
        message: `تم تفعيل بطاقة المتجر المؤقتة (بالكريدت) في ملفك لمدة ${durationDays} يوم.`,
      };
    });
  }

  return { ok: false, error: 'خيار غير معروف.' };
}

export async function adminAdjustMemberCredits(params: {
  actor: UserProfile;
  target: UserProfile;
  mode: 'add' | 'deduct' | 'set';
  amount: number;
  reason?: string;
}): Promise<number> {
  const { actor, target, mode, amount, reason } = params;
  const isFounderAuth =
    isSuperAdminEmail(auth.currentUser?.email) && auth.currentUser?.uid === actor.uid;
  assertFounderActor(actor, isFounderAuth);
  const cleanAmount = Math.max(0, Math.min(1000000, Math.floor(amount)));
  const targetRef = doc(db, 'users', target.uid);

  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(targetRef);
    const serverPoints = snap.exists()
      ? Math.max(0, Math.floor(((snap.data() as UserProfile).points) || 0))
      : Math.max(0, Math.floor(target.points || 0));
    const computed =
      mode === 'set'
        ? Math.min(1000000, cleanAmount)
        : mode === 'add'
          ? Math.min(1000000, serverPoints + cleanAmount)
          : Math.max(0, serverPoints - cleanAmount);

    tx.update(targetRef, {
      points: computed,
      updatedAt: serverTimestamp(),
    });
    return computed;
  });

  const actionLabel =
    mode === 'set'
      ? `تعيين رصيد الكريدت إلى ${next}`
      : mode === 'add'
        ? `منح +${cleanAmount} كريدت`
        : `خصم -${cleanAmount} كريدت`;

  const logId = createSafeId('log');
  await setDoc(doc(db, 'activityLogs', logId), {
    id: logId,
    actorId: actor.uid,
    actorName: actor.displayName,
    action: actionLabel,
    targetUserId: target.uid,
    targetUserName: target.displayName,
    reason:
      sanitizePlainText(reason, 240, { multiline: false }) ||
      'تعديل إداري لرصيد الكريدت',
    createdAt: serverTimestamp(),
  });

  if (target.uid !== actor.uid) {
    const notifId = createSafeId('ntf');
    await setDoc(doc(db, 'notifications', notifId), {
      id: notifId,
      recipientId: target.uid,
      senderId: actor.uid,
      senderName: actor.displayName,
      type: 'credit_grant',
      title: 'تحديث رصيد الكريدت الخاص بك',
      body: `${actionLabel} بواسطة ${actor.displayName}. رصيدك الحالي: ${next} كريدت.`,
      targetView: 'store',
      targetId: target.uid,
      read: false,
      createdAt: serverTimestamp(),
    });
  }

  return next;
}

export async function adminUpdateMemberId(params: {
  actor: UserProfile;
  target: UserProfile;
  newHandle: string;
  isSpecialId: boolean;
  specialIdLabel?: string;
  durationDays?: number | null; // null or <=0 = permanent
}): Promise<void> {
  const { actor, target, newHandle, isSpecialId, specialIdLabel, durationDays } = params;
  const isFounderAuth =
    isSuperAdminEmail(auth.currentUser?.email) && auth.currentUser?.uid === actor.uid;
  assertFounderActor(actor, isFounderAuth);

  const cleanHandle = sanitizeHandleInput(newHandle);
  if (!isValidUsername(cleanHandle)) {
    throw new Error('صيغة المعرّف غير صالحة.');
  }
  const cleanSpecialLabel =
    sanitizePlainText(specialIdLabel, 40, { multiline: false }) || 'آيدي مميز';

  const baseHandle = isValidUsername(target.baseUsername)
    ? target.baseUsername!
    : !target.isSpecialId
      ? getUserHandle(target)
      : target.baseUsername || getUserHandle(target);

  const expiresAtTs =
    isSpecialId && durationDays && durationDays > 0
      ? Timestamp.fromMillis(Date.now() + durationDays * 24 * 60 * 60 * 1000)
      : null;

  await updateDoc(doc(db, 'users', target.uid), {
    baseUsername: baseHandle,
    username: cleanHandle,
    isSpecialId,
    specialIdLabel: isSpecialId ? cleanSpecialLabel : '',
    specialIdExpiresAt: expiresAtTs,
    specialIdGrantedBy: isSpecialId ? 'admin' : '',
    updatedAt: serverTimestamp(),
  });

  const logId = createSafeId('log');
  await setDoc(doc(db, 'activityLogs', logId), {
    id: logId,
    actorId: actor.uid,
    actorName: actor.displayName,
    action: isSpecialId
      ? `تخصيص آيدي مميز (@${cleanHandle})`
      : `تحديث الآيدي (@${cleanHandle})`,
    targetUserId: target.uid,
    targetUserName: target.displayName,
    reason: isSpecialId
      ? durationDays && durationDays > 0
        ? `آيدي مميز مؤقت لمدة ${durationDays} يوم`
        : 'آيدي مميز دائم بإدارة المؤسس'
      : 'تعديل إداري للآيدي',
    createdAt: serverTimestamp(),
  });

  if (target.uid !== actor.uid) {
    const notifId = createSafeId('ntf');
    await setDoc(doc(db, 'notifications', notifId), {
      id: notifId,
      recipientId: target.uid,
      senderId: actor.uid,
      senderName: actor.displayName,
      type: 'role_update',
      title: isSpecialId ? 'تم منحك آيدي مميز' : 'تم تحديث معرف الحساب',
      body: isSpecialId
        ? `خصص لك المؤسس الآيدي المميز @${cleanHandle}${durationDays && durationDays > 0 ? ` لمدة ${durationDays} يوم` : ' بشكل دائم'}.`
        : `تم تحديث معرف حسابك إلى @${cleanHandle}.`,
      targetView: 'profile',
      targetId: target.uid,
      read: false,
      createdAt: serverTimestamp(),
    });
  }
}

export async function adminGrantMemberPerk(params: {
  actor: UserProfile;
  target: UserProfile;
  perkType: 'name_color' | 'avatar_frame' | 'chat_title';
  value: string | null; // null revokes
  durationDays?: number | null; // null = permanent
}): Promise<void> {
  const { actor, target, perkType, value, durationDays } = params;
  const isFounderAuth =
    isSuperAdminEmail(auth.currentUser?.email) && auth.currentUser?.uid === actor.uid;
  assertFounderActor(actor, isFounderAuth);
  const expiresAtTs =
    value && durationDays && durationDays > 0
      ? Timestamp.fromMillis(Date.now() + durationDays * 24 * 60 * 60 * 1000)
      : null;

  if (perkType === 'name_color') {
    await updateDoc(doc(db, 'users', target.uid), {
      nameColor: value || '',
      nameColorExpiresAt: expiresAtTs,
      updatedAt: serverTimestamp(),
    });
  } else if (perkType === 'chat_title') {
    await updateDoc(doc(db, 'users', target.uid), {
      chatTitle: value || '',
      chatTitleExpiresAt: expiresAtTs,
      updatedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(doc(db, 'users', target.uid), {
      avatarFrame: value || '',
      avatarFrameExpiresAt: expiresAtTs,
      updatedAt: serverTimestamp(),
    });
  }

  const label =
    perkType === 'name_color'
      ? value
        ? `منح لون اسم (${NAME_COLOR_PRESETS[value as NameColorKey]?.labelAr || value})`
        : 'سحب لون الاسم المميز'
      : perkType === 'chat_title'
        ? value
          ? `منح لقب دردشة (${CHAT_TITLE_PRESETS[value as ChatTitleKey]?.labelAr || value})`
          : 'سحب لقب الدردشة'
        : value
          ? `منح إطار بروفايل (${AVATAR_FRAME_PRESETS[value as AvatarFrameKey]?.labelAr || value})`
          : 'سحب إطار البروفايل';

  const logId = createSafeId('log');
  await setDoc(doc(db, 'activityLogs', logId), {
    id: logId,
    actorId: actor.uid,
    actorName: actor.displayName,
    action: label,
    targetUserId: target.uid,
    targetUserName: target.displayName,
    reason: durationDays && durationDays > 0 ? `منحة لمدة ${durationDays} يوم` : 'منحة دائمة ومجانية من المؤسس',
    createdAt: serverTimestamp(),
  });
    }
