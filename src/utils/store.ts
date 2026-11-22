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
import { getUserHandle, isValidUsername } from './username';

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
