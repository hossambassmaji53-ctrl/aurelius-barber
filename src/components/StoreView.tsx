import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Coins,
  Crown,
  Frame,
  Gift,
  Hash,
  Home,
  Lock,
  Palette,
  ShieldCheck,
  Sparkles,
  Ticket,
} from 'lucide-react';
import {
  AvatarFrameKey,
  ChatTitleKey,
  NameColorKey,
  StoreAvatarFrameKey,
  StoreConfig,
  StoreFeatureKey,
  UserProfile,
} from '../types';
import {
  Avatar,
  getPrimaryRole,
  getRoleMeta,
  getUserRoles,
} from './Avatar';
const getCommunityLevel = (..._args: unknown[]) => 1; const getTodayDateKey = (..._args: unknown[]) => new Date().toISOString().slice(0, 10);

import { isFounderUser } from '../utils/roles';
import {
  AVATAR_FRAME_PRESETS,
  CHAT_TITLE_PRESETS,
  FOUNDER_AVATAR_FRAME_PRESET,
  NAME_COLOR_PRESETS,
  RANK_AVATAR_FRAME_PRESETS,
  STORE_AVATAR_FRAME_PRESETS,
  canUserUseRankFrame,
  claimDailyLoginReward,
  equipFreeAvatarFrame,
  formatRemainingDuration,
  getActiveAvatarFrame,
  getActiveChatTitle,
  getActiveCreditPass,
  getActiveNameColor,
  getStoreAvatarFramePrice,
  isIdReservedForFounder,
  purchaseStoreFeature,
  resolveStoreConfig,
} from '../utils/store';
import {
  getUserHandle,
  isActiveSpecialId,
  normalizeUsernameInput,
} from '../utils/username';
import { useNowTick } from '../utils/time';

interface StoreViewProps {
  currentUser: UserProfile;
  isSuperAdmin: boolean;
  users: UserProfile[];
  storeConfig?: StoreConfig | null;
}

type StoreTabKey = 'home' | 'frames' | 'style' | 'passes';

const STORE_TABS: { key: StoreTabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'home', label: 'الرئيسية', icon: Home },
  { key: 'frames', label: 'الإطارات', icon: Frame },
  { key: 'style', label: 'الألوان والألقاب', icon: Palette },
  { key: 'passes', label: 'البطاقات والمزايا', icon: Ticket },
];

const SUGGESTED_STORE_IDS = [
  '2026',
  '4040',
  '5050',
  '7070',
  '8800',
  '9090',
  '1212',
  '3434',
];

export const StoreView: React.FC<StoreViewProps> = ({
  currentUser,
  isSuperAdmin,
  users,
  storeConfig,
}) => {
  const nowTick = useNowTick(20000);
  const config = useMemo(() => resolveStoreConfig(storeConfig), [storeConfig]);
  const isFounder = isSuperAdmin || isFounderUser(currentUser);
  const myRoles = useMemo(() => getUserRoles(currentUser), [currentUser]);
  const myPrimaryRole = useMemo(() => getPrimaryRole(currentUser), [currentUser]);

  const credits = Math.max(0, Math.floor(currentUser.points || 0));
  const levelInfo = getCommunityLevel(credits);
  const todayKey = getTodayDateKey();
  const dailyAlreadyClaimed = currentUser.lastDailyClaimDate === todayKey;

  const activeNameColor = getActiveNameColor(currentUser, nowTick);
  const activeAvatarFrame = getActiveAvatarFrame(currentUser, nowTick);
  const activeChatTitle = getActiveChatTitle(currentUser, nowTick);
  const activeCreditPass = getActiveCreditPass(currentUser, nowTick);
  const specialIdActive = isActiveSpecialId(currentUser, nowTick);

  const [activeTab, setActiveTab] = useState<StoreTabKey>('home');
  const [claimingDaily, setClaimingDaily] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [desiredId, setDesiredId] = useState('');
  const [selectedColor, setSelectedColor] = useState<NameColorKey>(
    activeNameColor || 'gold_royal'
  );
  const [selectedChatTitle, setSelectedChatTitle] = useState<ChatTitleKey>(
    activeChatTitle || 'community_star'
  );
  const [previewFrameKey, setPreviewFrameKey] = useState<AvatarFrameKey>(
    activeAvatarFrame || (isFounder ? 'founder_sovereign' : 'gold_crown')
  );

  const takenHandles = useMemo(() => {
    const set = new Set<string>();
    users.forEach((u) => {
      if (u.uid !== currentUser.uid) {
        set.add(getUserHandle(u, nowTick).toLowerCase());
      }
    });
    return set;
  }, [users, currentUser.uid, nowTick]);

  const availableSuggestions = useMemo(
    () =>
      SUGGESTED_STORE_IDS.filter(
        (id) =>
          !takenHandles.has(id.toLowerCase()) &&
          (isFounder || !isIdReservedForFounder(id, config))
      ),
    [takenHandles, isFounder, config]
  );

  const handleClaimDaily = async () => {
    if (claimingDaily || dailyAlreadyClaimed) return;
    setClaimingDaily(true);
    setFeedback(null);
    try {
      const res = await claimDailyLoginReward(currentUser, config);
      if (res.claimed) {
        setFeedback({
          type: 'ok',
          text: `تمت إضافة +${res.amount} كريدت مكافأة تسجيل الدخول اليومي بنجاح!`,
        });
      }
    } catch {
      setFeedback({ type: 'err', text: 'تعذر استلام المكافأة اليومية حالياً.' });
    } finally {
      setClaimingDaily(false);
    }
  };

  const handlePurchase = async (
    feature: StoreFeatureKey,
    overrides?: { avatarFrameKey?: AvatarFrameKey; chatTitleKey?: ChatTitleKey }
  ) => {
    const chosenFrame = overrides?.avatarFrameKey || previewFrameKey;
    const chosenTitle = overrides?.chatTitleKey || selectedChatTitle;
    setBusyKey(`${feature}:${chosenFrame}`);
    setFeedback(null);
    try {
      const res = await purchaseStoreFeature({
        user: currentUser,
        isFounder,
        config,
        feature,
        allUsers: users,
        customIdValue: desiredId,
        nameColorKey: selectedColor,
        avatarFrameKey: chosenFrame,
        chatTitleKey: chosenTitle,
      });
      if (res.ok) {
        setFeedback({ type: 'ok', text: res.message || 'تم التفعيل بنجاح!' });
        if (feature === 'special_id') setDesiredId('');
      } else {
        setFeedback({ type: 'err', text: res.error || 'تعذرت عملية التفعيل.' });
      }
    } catch {
      setFeedback({ type: 'err', text: 'حدث خطأ أثناء تنفيذ العملية. حاول مجدداً.' });
    } finally {
      setBusyKey(null);
    }
  };

  const handleEquipOrRemoveFreeFrame = async (frameKey: AvatarFrameKey | null) => {
    setBusyKey(`free:${frameKey || 'remove'}`);
    setFeedback(null);
    try {
      const res = await equipFreeAvatarFrame({
        user: currentUser,
        isFounder,
        frameKey,
      });
      if (res.ok) {
        setFeedback({ type: 'ok', text: res.message || 'تم التحديث بنجاح!' });
      } else {
        setFeedback({ type: 'err', text: res.error || 'تعذر تحديث الإطار.' });
      }
    } catch {
      setFeedback({ type: 'err', text: 'حدث خطأ أثناء تحديث الإطار.' });
    } finally {
      setBusyKey(null);
    }
  };

  const previewNameClass = NAME_COLOR_PRESETS[selectedColor].textClass;
  const chatTitleCfg = config.items.chat_title || {
    enabled: true,
    price: 90,
    durationDays: 7,
    labelAr: 'لقب تميز في الدردشة',
  };

  const storeFrameList = useMemo(
    () => Object.values(STORE_AVATAR_FRAME_PRESETS),
    []
  );
  const rankFrameList = useMemo(
    () => Object.values(RANK_AVATAR_FRAME_PRESETS),
    []
  );

  const previewPreset = AVATAR_FRAME_PRESETS[previewFrameKey] || AVATAR_FRAME_PRESETS.gold_crown;
  const previewPrice =
    previewPreset.category === 'store'
      ? getStoreAvatarFramePrice(previewPreset.key as StoreAvatarFrameKey, config)
      : 0;

  return (
    <div className="space-y-5">
      {/* Compact Store Wallet Bar + 4 Horizontal Tabs */}
      <section className="bg-[#141419] border border-[#D4A853]/35 rounded-3xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-extrabold text-[#F5F2EB] flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#D4A853] shrink-0" />
              <span className="truncate">متجر أوريليوس والكريدت</span>
            </h1>
            <p className="text-xs text-[#9C968B] mt-0.5">
              استبدل نقاط الكريدت الافتراضية بإطارات مزخرفة وألوان أسماء وألقاب دردشة مميزة.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap shrink-0">
            <div className="px-3.5 py-2 rounded-2xl bg-[#1A1A22] border border-[#D4A853]/45 flex items-center gap-2.5">
              <Coins className="w-4 h-4 text-[#D4A853] shrink-0" />
              <span className="text-sm font-extrabold font-mono-num text-[#F5D67B] tabular-nums whitespace-nowrap">
                {credits} كريدت
              </span>
              <span className={`text-[11px] font-bold whitespace-nowrap ${levelInfo.textColorClass}`}>
                · م{levelInfo.level}
              </span>
            </div>

            <button
              type="button"
              onClick={handleClaimDaily}
              disabled={claimingDaily || dailyAlreadyClaimed}
              className={`min-h-[42px] px-3.5 py-2 rounded-2xl border text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-default ${
                dailyAlreadyClaimed
                  ? 'bg-emerald-500/12 border-emerald-500/35 text-emerald-300'
                  : 'bg-[#D4A853] hover:bg-[#E0B96B] border-[#D4A853] text-[#0B0B0E]'
              }`}
            >
              <Gift className="w-4 h-4 shrink-0" />
              <span>
                {dailyAlreadyClaimed
                  ? 'استُلمت مكافأة اليوم'
                  : `+${config.dailyRewardCoins} كريدت يومي`}
              </span>
            </button>
          </div>
        </div>
{/* 4 Single-Line Horizontal Category Tabs */}
        <div
          role="tablist"
          aria-label="أقسام المتجر"
          className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#0F0F14] border border-[#242430] overflow-x-auto"
        >
          {STORE_TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setActiveTab(t.key)}
                className={`min-h-[44px] flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-xs font-extrabold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                  active
                    ? 'bg-[#D4A853] text-[#0B0B0E]'
                    : 'text-[#B6B0A4] hover:text-[#F5F2EB] hover:bg-[#191922]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {feedback && (
        <div
          className={`p-3.5 rounded-2xl border flex items-center gap-2.5 text-xs font-bold ${
            feedback.type === 'ok'
              ? 'bg-emerald-500/12 border-emerald-500/40 text-emerald-200'
              : 'bg-red-500/12 border-red-500/40 text-red-200'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* TAB 1: HOME */}
      {activeTab === 'home' && (
        <div className="space-y-5">
          {isFounder && (
            <div className="p-4 rounded-2xl bg-gradient-to-l from-[#D4A853]/18 via-[#19150E] to-[#141419] border border-[#D4A853]/50 flex items-center gap-3 text-xs text-[#F8DF8E]">
              <Crown className="w-5 h-5 text-[#D4A853] shrink-0" />
              <span>
                <strong>امتياز المؤسس الدائم:</strong> جميع الإطارات، الألوان، الألقاب، والآيديات مفعلة لك{' '}
                <strong>مجاناً وبشكل دائم</strong>، مع وجود إطار السيادة المتحرك الحصري للمؤسس.
              </span>
            </div>
          )}

          {/* Quick Entry Cards into Store Sections */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() => setActiveTab('frames')}
              className="p-4 rounded-2xl bg-[#141419] hover:bg-[#191922] border border-[#27272F] hover:border-[#D4A853]/55 text-right space-y-2 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-[#D4A853]/15 text-[#D4A853] flex items-center justify-center">
                  <Frame className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-bold text-[#D4A853]">تصفح القسم ←</span>
              </div>
              <h2 className="text-sm font-extrabold text-[#F5F2EB]">الإطارات المزخرفة</h2>
              <p className="text-[11px] text-[#9C968B]">
                إطارات متجر بالكريدت، إطارات مجانية للرتب، وإطار المؤسس المتحرك.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('style')}
              className="p-4 rounded-2xl bg-[#141419] hover:bg-[#191922] border border-[#27272F] hover:border-[#D4A853]/55 text-right space-y-2 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-sky-500/15 text-sky-300 flex items-center justify-center">
                  <Palette className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-bold text-sky-300">تصفح القسم ←</span>
              </div>
              <h2 className="text-sm font-extrabold text-[#F5F2EB]">ألوان الأسماء وألقاب الدردشة</h2>
              <p className="text-[11px] text-[#9C968B]">
                توهج مخصص للاسم وألقاب تفاعل محفزة تظهر بجانبك في الدردشة دون إغراق البروفايل.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('passes')}
              className="p-4 rounded-2xl bg-[#141419] hover:bg-[#191922] border border-[#27272F] hover:border-[#D4A853]/55 text-right space-y-2 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-violet-500/15 text-violet-300 flex items-center justify-center">
                  <Ticket className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-bold text-violet-300">تصفح القسم ←</span>
              </div>
              <h2 className="text-sm font-extrabold text-[#F5F2EB]">الآيدي المميز والبطاقات</h2>
              <p className="text-[11px] text-[#9C968B]">
                استئجار معرف رقمي مميز (ID) وبطاقة الضيافة المؤقتة بالكريدت.
              </p>
            </button>
          </div>

          {/* How to Earn Strip */}
          <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-4 sm:p-5 space-y-3">
            <h3 className="text-xs sm:text-sm font-extrabold text-[#F5F2EB]">
              طرق كسب كريدت أوريليوس المجانية
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-[#181820] border border-[#252530]">
                <div className="text-[11px] text-[#9C968B]">دخول يومي</div>
                <div className="text-sm font-extrabold font-mono-num text-[#D4A853] mt-0.5 tabular-nums">
                  +{config.dailyRewardCoins} كريدت
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#181820] border border-[#252530]">
                <div className="text-[11px] text-[#9C968B]">رسائل الدردشة</div>
                <div className="text-sm font-extrabold font-mono-num text-emerald-300 mt-0.5 tabular-nums">
                  +2 كريدت / رسالة
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#181820] border border-[#252530]">
                <div className="text-[11px] text-[#9C968B]">التفاعل بالمعرض</div>
                <div className="text-sm font-extrabold font-mono-num text-sky-300 mt-0.5 tabular-nums">
                  +3 كريدت / إعجاب
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#181820] border border-[#252530]">
                <div className="text-[11px] text-[#9C968B]">حجز وتقييم مكتمل</div>
                <div className="text-sm font-extrabold font-mono-num text-violet-300 mt-0.5 tabular-nums">
                  +15 إلى +25 كريدت
                </div>
              </div>
            </div>
          </div>

          {/* Google Play Virtual Credit Clarity */}
          <div className="p-3.5 rounded-2xl bg-[#101015] border border-[#272733] flex items-start gap-2.5 text-xs text-[#B6B0A4] leading-relaxed">
            <AlertCircle className="w-4 h-4 text-[#D4A853] shrink-0 mt-0.5" />
            <span>
              <strong className="text-[#F5F2EB]">الكريدت رصيد افتراضي داخل المنصة فقط:</strong>{' '}
              جميع النقاط والمكافآت والبطاقات المؤقتة مجانية وتفاعلية بالكامل، ولا تمتلك أي قيمة نقدية حقيقية ولا يمكن بيعها أو تحويلها أو سحبها.
            </span>
          </div>
        </div>
      )}

      {/* TAB 2: CATEGORIZED ORNAMENTAL FRAMES */}
      {activeTab === 'frames' && (
        <div className="space-y-6">
          {/* Live Interactive Frame Showcase */}
          <section className="bg-gradient-to-l from-[#181622] via-[#141419] to-[#111116] border border-[#D4A853]/35 rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-5">
            <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-right">
              <div className="p-3">
                <Avatar
                  src={currentUser.photoURL}
                  name={currentUser.displayName}
                  size="xl"
                  role={myPrimaryRole}
                  roles={myRoles}
                  forcePreviewFrame={previewFrameKey}
                />
              </div>
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold border whitespace-nowrap ${
                      previewPreset.category === 'founder'
                        ? 'bg-[#D4A853]/20 border-[#D4A853]/60 text-[#FCE08B]'
                        : previewPreset.category === 'rank'
                          ? 'bg-indigo-500/15 border-indigo-400/40 text-indigo-200'
                          : 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
                    }`}
                  >
                    {previewPreset.category === 'founder'
                      ? 'إطار المؤسس الحصري'
                      : previewPreset.category === 'rank'
                        ? `خاص برتبة: ${getRoleMeta(previewPreset.requiredRole!).label}`
                        : 'متجر الكريدت'}
                  </span>
                  {previewPreset.category === 'store' && (
                    <span className="px-2.5 py-0.5 rounded-lg bg-[#1C1C26] border border-[#D4A853]/40 text-[10px] font-mono-num font-extrabold text-[#D4A853]">
                      {previewPrice} كريدت · {config.items.avatar_frame.durationDays} يوم
                    </span>
                  )}
                </div>
                <h2 className="text-base sm:text-lg font-extrabold text-[#F5F2EB]">
                  معاينة حية: {previewPreset.labelAr}
                </h2>
                <p className="text-xs text-[#9C968B] max-w-md leading-relaxed">
                  {previewPreset.descriptionAr}
                </p>
              </div>
            </div>

            {activeAvatarFrame && (
              <button
                type="button"
                disabled={busyKey === 'free:remove'}
                onClick={() => handleEquipOrRemoveFreeFrame(null)}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#1D1D26] hover:bg-red-500/15 border border-[#2F2F3C] hover:border-red-500/40 text-xs font-bold text-[#C8C2B8] hover:text-red-300 cursor-pointer transition-colors whitespace-nowrap shrink-0"
              >
                إزالة الإطار الحالي
              </button>
            )}
          </section>

          {/* SECTION 1: CREDIT STORE FRAMES (Grid, Tiered Prices, Clear "متجر الكريدت" badge, NO Founder badge) */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-[#F5F2EB] flex items-center gap-2">
                  <Coins className="w-4 h-4 text-[#D4A853]" />
                  <span>1. إطارات متجر الكريدت</span>
                </h3>
                <p className="text-[11px] text-[#9C968B]">
                  متاحة لجميع الأعضاء مقابل الكريدت لمدة {config.items.avatar_frame.durationDays} أيام بتصاميم زخرفية متدرجة.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/12 border border-emerald-500/35 text-[11px] font-bold text-emerald-300 whitespace-nowrap">
                متجر الكريدت · {storeFrameList.length} تصاميم
              </span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {storeFrameList.map((preset) => {
                const price = getStoreAvatarFramePrice(preset.key as StoreAvatarFrameKey, config);
                const isEquipped = activeAvatarFrame === preset.key;
                const isPreviewing = previewFrameKey === preset.key;
                const isBusy = busyKey === `avatar_frame:${preset.key}`;

                return (
                  <div
                    key={preset.key}
                    onClick={() => setPreviewFrameKey(preset.key)}
                    className={`rounded-2xl border p-3.5 sm:p-4 flex flex-col justify-between gap-3 cursor-pointer transition-all ${
                      isPreviewing
                        ? 'bg-[#1A1924] border-[#D4A853] shadow-[0_0_20px_-6px_rgba(212,168,83,0.4)]'
                        : 'bg-[#141419] border-[#262632] hover:border-[#3A3A4A]'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/12 border border-emerald-500/30 text-[10px] font-bold text-emerald-300 whitespace-nowrap">
                          متجر الكريدت
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-[#1D1D26] border border-[#D4A853]/40 text-[10px] font-mono-num font-extrabold text-[#F5D67B] whitespace-nowrap">
                          {price} كريدت
                        </span>
                      </div>

                      <div className="flex justify-center py-2">
                        <Avatar
                          src={currentUser.photoURL}
                          name={currentUser.displayName}
                          size="lg"
                          role={myPrimaryRole}
                          roles={myRoles}
                          forcePreviewFrame={preset.key}
                        />
                      </div>

                      <div className="text-center space-y-1">
                        <h4 className="text-xs sm:text-sm font-extrabold text-[#F5F2EB] truncate">
                          {preset.labelAr}
                        </h4>
                        <p className="text-[10px] sm:text-[11px] text-[#9C968B] line-clamp-2 leading-snug">
                          {preset.descriptionAr}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isBusy || (!isFounder && !config.items.avatar_frame.enabled)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewFrameKey(preset.key);
                        handlePurchase('avatar_frame', { avatarFrameKey: preset.key });
                      }}
                      className={`w-full min-h-[40px] px-3 py-2 rounded-xl text-[11px] font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
                        isEquipped
                          ? 'bg-emerald-500/20 border border-emerald-500/45 text-emerald-200'
                          : 'bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E]'
                      }`}
                    >
                      {isEquipped ? (
                        <>
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span>مفعل الآن</span>
                        </>
                      ) : isBusy ? (
                        <span>جاري التفعيل...</span>
                      ) : isFounder ? (
                        <span>تفعيل مباشر</span>
                      ) : (
                        <span>شراء ({price} كريدت)</span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* SECTION 2: RANK-EXCLUSIVE FRAMES (Free for holders, Locked with exact rank label for others) */}
          <section className="space-y-3 pt-2 border-t border-[#22222C]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-[#F5F2EB] flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-300" />
                  <span>2. إطارات الرتب والصلاحيات الرسمية</span>
                </h3>
                <p className="text-[11px] text-[#9C968B]">
                  مخصصة مجاناً وبشكل دائم لأصحاب كل رتبة — ومقفلة لغير حامليها.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-indigo-500/12 border border-indigo-400/35 text-[11px] font-bold text-indigo-200 whitespace-nowrap">
                حسب الرتبة · مجاني لحاملها
              </span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {rankFrameList.map((preset) => {
                const reqRole = preset.requiredRole!;
                const reqMeta = getRoleMeta(reqRole);
                const unlocked = canUserUseRankFrame(currentUser, preset.key, isFounder);
                const isEquipped = activeAvatarFrame === preset.key;
                const isPreviewing = previewFrameKey === preset.key;
                const isBusy = busyKey === `free:${preset.key}`;

                return (
                  <div
                    key={preset.key}
                    onClick={() => setPreviewFrameKey(preset.key)}
                    className={`rounded-2xl border p-3.5 sm:p-4 flex flex-col justify-between gap-3 cursor-pointer transition-all ${
                      isPreviewing
                        ? 'bg-[#181826] border-indigo-400'
                        : unlocked
                          ? 'bg-[#141419] border-[#262632] hover:border-indigo-400/55'
                          : 'bg-[#111116] border-[#202029] opacity-85'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-md border text-[10px] font-bold truncate max-w-full ${reqMeta.badgeClass}`}
                        >
                          رتبة: {reqMeta.shortLabel}
                        </span>
                        {!unlocked && <Lock className="w-3.5 h-3.5 text-[#8B857B] shrink-0" />}
                      </div>

                      <div className="flex justify-center py-2 relative">
                        <Avatar
                          src={currentUser.photoURL}
                          name={currentUser.displayName}
                          size="lg"
                          role={myPrimaryRole}
                          roles={myRoles}
                          forcePreviewFrame={preset.key}
                        />
                      </div>

                      <div className="text-center space-y-1">
                        <h4 className="text-xs sm:text-sm font-extrabold text-[#F5F2EB] truncate">
                          {preset.labelAr}
                        </h4>
                        <p className="text-[10px] sm:text-[11px] text-[#9C968B] line-clamp-2 leading-snug">
                          {preset.descriptionAr}
                        </p>
                      </div>
                    </div>

                    {unlocked ? (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewFrameKey(preset.key);
                          handleEquipOrRemoveFreeFrame(isEquipped ? null : preset.key);
                        }}
                        className={`w-full min-h-[40px] px-3 py-2 rounded-xl text-[11px] font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                          isEquipped
                            ? 'bg-emerald-500/20 border border-emerald-500/45 text-emerald-200'
                            : 'bg-indigo-500 hover:bg-indigo-400 text-white'
                        }`}
                      >
                        {isEquipped ? 'مفعل الآن (اضغط للإزالة)' : isBusy ? 'جاري التفعيل...' : 'تفعيل مجاني'}
                      </button>
                    ) : (
                      <div className="w-full min-h-[40px] px-2.5 py-2 rounded-xl bg-[#181820] border border-[#272733] text-[10px] font-bold text-[#8B857B] inline-flex items-center justify-center gap-1 text-center">
                        <Lock className="w-3 h-3 shrink-0" />
                        <span className="truncate">يتطلب رتبة {reqMeta.shortLabel}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* SECTION 3: FOUNDER EXCLUSIVE ANIMATED SOVEREIGN FRAME */}
          <section className="space-y-3 pt-2 border-t border-[#22222C]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-[#F8DF8E] flex items-center gap-2">
                  <Crown className="w-4 h-4 text-[#D4A853]" />
                  <span>3. إطار المؤسس الحصري المتحرك</span>
                </h3>
                <p className="text-[11px] text-[#9C968B]">
                  أرقى تصميم متحرك في المنصة بتاج السيادة الذهبي والدوران المستمر — حصري للمؤسس فقط.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-[#D4A853]/18 border border-[#D4A853]/55 text-[11px] font-extrabold text-[#FCE08B] whitespace-nowrap">
                حصري للمؤسس · ANIMATED
              </span>
            </div>

            <div
              onClick={() => setPreviewFrameKey(FOUNDER_AVATAR_FRAME_PRESET.key)}
              className="rounded-3xl border border-[#D4A853]/65 bg-gradient-to-br from-[#21180B] via-[#121116] to-[#0B0B0E] p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-5 cursor-pointer shadow-[0_18px_48px_-24px_rgba(212,168,83,0.45)]"
            >
              <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-right">
                <div className="p-3">
                  <Avatar
                    src={currentUser.photoURL}
                    name={currentUser.displayName}
                    size="xl"
                    role="admin"
                    roles={['admin']}
                    forcePreviewFrame="founder_sovereign"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-[#D4A853]/20 border border-[#D4A853]/55 text-[10px] font-extrabold text-[#FCE08B]">
                    <Crown className="w-3 h-3" />
                    <span>إطار المؤسس الحصري</span>
                  </div>
                  <h4 className="text-base sm:text-lg font-extrabold text-[#F8DF8E]">
                    {FOUNDER_AVATAR_FRAME_PRESET.labelAr}
                  </h4>
                  <p className="text-xs text-[#D6CEBC] max-w-md leading-relaxed">
                    {FOUNDER_AVATAR_FRAME_PRESET.descriptionAr}
                  </p>
                </div>
              </div>

              {isFounder ? (
                <button
                  type="button"
                  disabled={busyKey === 'free:founder_sovereign'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewFrameKey('founder_sovereign');
                    handleEquipOrRemoveFreeFrame(
                      activeAvatarFrame === 'founder_sovereign' ? null : 'founder_sovereign'
                    );
                  }}
                  className={`min-h-[44px] px-5 py-2.5 rounded-xl text-xs font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                    activeAvatarFrame === 'founder_sovereign'
                      ? 'bg-emerald-500/20 border border-emerald-500/45 text-emerald-200'
                      : 'bg-gradient-to-l from-[#D4A853] to-[#FCE08B] text-[#0B0B0E]'
                  }`}
                >
                  <Crown className="w-4 h-4 shrink-0" />
                  <span>
                    {activeAvatarFrame === 'founder_sovereign'
                      ? 'مفعل حالياً (اضغط للإزالة)'
                      : busyKey === 'free:founder_sovereign'
                        ? 'جاري التفعيل...'
                        : 'تفعيل إطار السيادة الآن'}
                  </span>
                </button>
              ) : (
                <div className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#181611] border border-[#D4A853]/35 text-xs font-bold text-[#D4A853] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
                  <Lock className="w-4 h-4" />
                  <span>مقفول حصرياً للمؤسس</span>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* TAB 3: NAME COLORS & CHAT DISTINCTION TITLES */}
      {activeTab === 'style' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Name Colors */}
          <section className="bg-[#141419] border border-[#27272F] rounded-2xl p-5 flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/15 text-sky-300 flex items-center justify-center shrink-0">
                    <Palette className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-extrabold text-[#F5F2EB]">
                      {config.items.name_color.labelAr || 'لون اسم متوهج ومميز'}
                    </h2>
                    <p className="text-[11px] text-[#9C968B]">
                      ميّز اسمك بلون متوهج في الدردشة والملف الشخصي والمعرض.
                    </p>
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <div className="px-2.5 py-1 rounded-lg bg-[#1C1C24] border border-[#D4A853]/40 text-xs font-extrabold font-mono-num text-[#D4A853] whitespace-nowrap">
                    {isFounder ? 'مجاني · دائم' : `${config.items.name_color.price} كريدت`}
                  </div>
                  {!isFounder && (
                    <div className="text-[10px] text-[#8B857B] mt-1 inline-flex items-center gap-1 whitespace-nowrap">
                      <Clock className="w-3 h-3" />
                      <span>{config.items.name_color.durationDays} يوم</span>
                    </div>
                  )}
                </div>
              </div>

              {activeNameColor && (
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-200 flex items-center justify-between">
                  <span>
                    المفعل حالياً: <strong>{NAME_COLOR_PRESETS[activeNameColor].labelAr}</strong>
                  </span>
                  <span className="font-mono-num whitespace-nowrap">
                    {formatRemainingDuration(currentUser.nameColorExpiresAt, nowTick)}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(Object.keys(NAME_COLOR_PRESETS) as NameColorKey[]).map((key) => {
                  const preset = NAME_COLOR_PRESETS[key];
                  const selected = selectedColor === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedColor(key)}
                      className={`min-h-[44px] p-2.5 rounded-xl border text-right flex items-center gap-2.5 cursor-pointer transition-colors ${
                        selected
                          ? 'bg-[#1D1D28] border-[#D4A853]'
                          : 'bg-[#101015] border-[#262632] hover:border-[#3A3A4A]'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded-full shrink-0 ${preset.swatchClass}`} />
                      <span className={`text-xs font-bold truncate ${preset.textClass}`}>
                        {preset.labelAr}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="p-3 rounded-xl bg-[#101015] border border-[#24242F] flex items-center justify-between gap-2 text-xs">
                <span className="text-[#8B857B]">معاينة الاسم:</span>
                <span className={`text-sm font-extrabold truncate ${previewNameClass}`}>
                  {currentUser.displayName}
                </span>
              </div>
            </div>

            <button
              type="button"
              disabled={
                busyKey === `name_color:${previewFrameKey}` ||
                (!isFounder && !config.items.name_color.enabled)
              }
              onClick={() => handlePurchase('name_color')}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-extrabold cursor-pointer disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {busyKey === `name_color:${previewFrameKey}`
                ? 'جاري التفعيل...'
                : isFounder
                  ? 'تفعيل اللون مجاناً وبشكل دائم'
                  : config.items.name_color.enabled
                    ? `تفعيل لون الاسم (${config.items.name_color.price} كريدت)`
                    : 'غير متاح حالياً'}
            </button>
            </section>

          {/* Chat Distinction Titles */}
          <section className="bg-[#141419] border border-[#27272F] rounded-2xl p-5 flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-300 flex items-center justify-center shrink-0">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-extrabold text-[#F5F2EB]">
                      {chatTitleCfg.labelAr || 'لقب تميز في الدردشة'}
                    </h2>
                    <p className="text-[11px] text-[#9C968B]">
                      يظهر بجانب اسمك داخل رسائل الدردشة العامة والخاصة دون تكديس بالبروفايل.
                    </p>
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <div className="px-2.5 py-1 rounded-lg bg-[#1C1C24] border border-[#D4A853]/40 text-xs font-extrabold font-mono-num text-[#D4A853] whitespace-nowrap">
                    {isFounder ? 'مجاني · دائم' : `${chatTitleCfg.price} كريدت`}
                  </div>
                  {!isFounder && (
                    <div className="text-[10px] text-[#8B857B] mt-1 inline-flex items-center gap-1 whitespace-nowrap">
                      <Clock className="w-3 h-3" />
                      <span>{chatTitleCfg.durationDays} يوم</span>
                    </div>
                  )}
                </div>
              </div>

              {activeChatTitle && (
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-200 flex items-center justify-between">
                  <span>
                    اللقب المفعل حالياً:{' '}
                    <strong>{CHAT_TITLE_PRESETS[activeChatTitle].labelAr}</strong>
                  </span>
                  <span className="font-mono-num whitespace-nowrap">
                    {formatRemainingDuration(currentUser.chatTitleExpiresAt, nowTick)}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(Object.keys(CHAT_TITLE_PRESETS) as ChatTitleKey[])
                  .filter((key) => !CHAT_TITLE_PRESETS[key].founderOnly || isFounder)
                  .map((key) => {
                    const preset = CHAT_TITLE_PRESETS[key];
                    const selected = selectedChatTitle === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedChatTitle(key)}
                        className={`min-h-[44px] p-2.5 rounded-xl border text-right flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                          selected
                            ? 'bg-[#1D1D28] border-[#D4A853]'
                            : 'bg-[#101015] border-[#262632] hover:border-[#3A3A4A]'
                        }`}
                      >
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-bold ${preset.pillClass}`}
                        >
                          <Sparkles className="w-3 h-3 shrink-0" />
                          <span>{preset.labelAr}</span>
                        </span>
                        {preset.founderOnly && (
                          <Crown className="w-3.5 h-3.5 text-[#D4A853] shrink-0" />
                        )}
                      </button>
                    );
                  })}
              </div>

              {/* Live Chat Bubble Preview */}
              <div className="p-3 rounded-xl bg-[#101015] border border-[#24242F] space-y-1.5">
                <div className="text-[10px] text-[#8B857B]">معاينة مظهرك في الدردشة:</div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-xs font-bold ${previewNameClass}`}>
                    {currentUser.displayName}
                  </span>
                  <span
                    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border text-[9px] font-bold ${CHAT_TITLE_PRESETS[selectedChatTitle].pillClass}`}
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>{CHAT_TITLE_PRESETS[selectedChatTitle].labelAr}</span>
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={
                busyKey === `chat_title:${previewFrameKey}` ||
                (!isFounder && !chatTitleCfg.enabled)
              }
              onClick={() => handlePurchase('chat_title', { chatTitleKey: selectedChatTitle })}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-extrabold cursor-pointer disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {busyKey === `chat_title:${previewFrameKey}`
                ? 'جاري التفعيل...'
                : isFounder
                  ? 'تفعيل لقب الدردشة مجاناً وبشكل دائم'
                  : chatTitleCfg.enabled
                    ? `تفعيل اللقب (${chatTitleCfg.price} كريدت)`
                    : 'غير متاح حالياً'}
            </button>
          </section>
        </div>
      )}

      {/* TAB 4: SPECIAL ID & TIMED CREDIT PASS */}
      {activeTab === 'passes' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Temporary Special ID */}
          <section className="bg-[#141419] border border-[#27272F] rounded-2xl p-5 flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-[#D4A853]/15 text-[#D4A853] flex items-center justify-center shrink-0">
                    <Hash className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-extrabold text-[#F5F2EB]">
                      {config.items.special_id.labelAr || 'آيدي مميز مؤقت (ID)'}
                    </h2>
                    <p className="text-[11px] text-[#9C968B]">
                      اختر معرفاً مميزاً يظهر بجانب اسمك في جميع أنحاء التطبيق.
                    </p>
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <div className="px-2.5 py-1 rounded-lg bg-[#1C1C24] border border-[#D4A853]/40 text-xs font-extrabold font-mono-num text-[#D4A853] whitespace-nowrap">
                    {isFounder ? 'مجاني · دائم' : `${config.items.special_id.price} كريدت`}
                  </div>
                  {!isFounder && (
                    <div className="text-[10px] text-[#8B857B] mt-1 inline-flex items-center gap-1 whitespace-nowrap">
                      <Clock className="w-3 h-3" />
                      <span>{config.items.special_id.durationDays} يوم</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#1A1A22] border border-[#272732] flex items-center justify-between gap-2 text-xs">
                <span className="text-[#9C968B]">معرفك الحالي:</span>
                <div className="flex items-center gap-2">
                  <span dir="ltr" className="font-mono-num font-bold text-[#D4A853]">
                    @{getUserHandle(currentUser, nowTick)}
                  </span>
                  {specialIdActive && (
                    <span className="px-2 py-0.5 rounded-md bg-[#D4A853]/15 border border-[#D4A853]/40 text-[10px] font-bold text-[#F5D67B] whitespace-nowrap">
                      {formatRemainingDuration(currentUser.specialIdExpiresAt, nowTick)}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] text-[#C8C2B8] font-semibold">
                  اكتب الآيدي المطلوب (أرقام أو أحرف إنجليزية صغيرة)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  maxLength={24}
                  value={desiredId}
                  onChange={(e) => setDesiredId(normalizeUsernameInput(e.target.value))}
                  placeholder="مثال: 2026 أو vip_50"
                  className="w-full bg-[#101015] border border-[#2C2C36] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-sm font-mono-num text-[#F5F2EB] outline-none"
                />
                {availableSuggestions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] text-[#8B857B]">أرقام متاحة:</span>
                    {availableSuggestions.slice(0, 6).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setDesiredId(s)}
                        dir="ltr"
                        className="px-2 py-0.5 rounded-lg bg-[#1A1A22] hover:bg-[#D4A853]/20 border border-[#2C2C38] hover:border-[#D4A853]/60 text-[11px] font-mono-num text-[#E5DEC9] cursor-pointer transition-colors"
                      >
                        @{s}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-[#8B857B]">
                  ملاحظة: الأرقام المحجوزة للإدارة والمؤسس غير متاحة للشراء التلقائي.
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={
                busyKey === `special_id:${previewFrameKey}` ||
                !desiredId.trim() ||
                (!isFounder && !config.items.special_id.enabled)
              }
              onClick={() => handlePurchase('special_id')}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-extrabold cursor-pointer disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {busyKey === `special_id:${previewFrameKey}`
                ? 'جاري التفعيل...'
                : isFounder
                  ? 'تفعيل الآيدي مجاناً وبشكل دائم'
                  : config.items.special_id.enabled
                    ? `استئجار الآيدي (${config.items.special_id.price} كريدت)`
                    : 'غير متاح حالياً'}
            </button>
          </section>

          {/* Timed Credit Pass */}
          <section className="bg-[#11151E] border border-dashed border-sky-400/45 rounded-2xl p-5 flex flex-col justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/15 text-sky-300 flex items-center justify-center shrink-0">
                    <Ticket className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-extrabold text-[#F5F2EB]">
                      {config.items.credit_pass.labelAr || 'بطاقة المتجر المؤقتة (بالكريدت)'}
                    </h2>
                    <p className="text-[11px] text-[#9C968B]">
                      بطاقة ضيافة تجميلية مؤقتة تظهر بوضوح في قسم المزايا بملفك الشخصي.
                    </p>
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <div className="px-2.5 py-1 rounded-lg bg-[#1A202E] border border-sky-400/40 text-xs font-extrabold font-mono-num text-sky-300 whitespace-nowrap">
                    {isFounder ? 'بطاقة المؤسس دائمة' : `${config.items.credit_pass.price} كريدت`}
                  </div>
                  {!isFounder && (
                    <div className="text-[10px] text-[#8B857B] mt-1 inline-flex items-center gap-1 whitespace-nowrap">
                      <Clock className="w-3 h-3" />
                      <span>{config.items.credit_pass.durationDays} يوم</span>
                    </div>
                  )}
                </div>
              </div>

              {activeCreditPass && (
                <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-400/35 text-[11px] text-sky-200 flex items-center justify-between gap-2">
                  <span>بطاقة المتجر المؤقتة مفعلة حالياً</span>
                  <span className="font-mono-num whitespace-nowrap font-bold">
                    {formatRemainingDuration(currentUser.creditPassExpiresAt, nowTick)}
                  </span>
                </div>
              )}

              <div className="p-3.5 rounded-xl bg-[#0D1017] border border-sky-400/25 space-y-2">
                <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-sky-300">
                  <span>تمييز واضح عن الرتب الرسمية</span>
                  <span className="font-mono-num">TIMED PASS</span>
                </div>
                <p className="text-[11px] text-[#B6C0D1] leading-relaxed">
                  هذه البطاقة امتياز مؤقت مستأجر بالكريدت وتُعرض في قسم مستقل بعنوان «مزايا المتجر المؤقتة» دون أي تداخل مع بطاقات الرتب الرسمية المعتمدة.
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={
                busyKey === `credit_pass:${previewFrameKey}` ||
                isFounder ||
                (!isFounder && !config.items.credit_pass.enabled)
              }
              onClick={() => handlePurchase('credit_pass')}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-sky-400 hover:bg-sky-300 text-[#0B0B0E] text-xs font-extrabold cursor-pointer disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {busyKey === `credit_pass:${previewFrameKey}`
                ? 'جاري التفعيل...'
                : isFounder
                  ? 'تمتلك بطاقة المؤسس الملكية الدائمة'
                  : config.items.credit_pass.enabled
                    ? activeCreditPass
                      ? `تمديد / تجديد البطاقة (${config.items.credit_pass.price} كريدت)`
                      : `استئجار البطاقة المؤقتة (${config.items.credit_pass.price} كريدت)`
                    : 'غير متاح حالياً'}
            </button>
          </section>
        </div>
      )}
    </div>
  );
};
        
