import React, { useState } from 'react';
import {
  Award,
  BadgeCheck,
  BookOpen,
  CalendarClock,
  ChevronRight,
  Coins,
  EyeOff,
  Image as ImageIcon,
  MapPin,
  MessageSquare,
  Radio,
  Scissors,
  ShieldCheck,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { useMemo } from 'react';
import { RoleDefinition } from '../types';
import { getAllRoleDefinitions } from '../utils/roles';
import { RoleTag } from './Avatar';

interface OnboardingTourProps {
  userName?: string;
  roleDefinitions?: RoleDefinition[];
  onComplete: () => void;
}

const TOTAL_STEPS = 4;

export const OnboardingTour: React.FC<OnboardingTourProps> = ({
  userName,
  roleDefinitions,
  onComplete,
}) => {
  const [step, setStep] = useState(0);
  const allRoleDefs = useMemo(() => getAllRoleDefinitions(), [roleDefinitions]);

  const stepMeta = [
    {
      index: '01',
      kicker: 'المعرض الحصري والإبداع',
      title: userName
        ? `أهلاً بك ${userName} في أوريليوس باربر`
        : 'أهلاً بك في أوريليوس باربر',
      subtitle: 'منصتك الفاخرة لاكتشاف أحدث قصات الحلاقة والتفاعل مع نخبة الحلاقين.',
    },
    {
      index: '02',
      kicker: 'المجتمع والرتب وحالة الاتصال',
      title: 'المجتمع والدردشة العامة الحية',
      subtitle: 'تواصل مباشرة مع نخبة الحلاقين والأعضاء مع معرفة حالة كل عضو لحظياً.',
    },
    {
      index: '03',
      kicker: 'التميّز الأسبوعي وتنظيم المواعيد',
      title: 'لوحة الشرف ونظام المواعيد الذكي',
      subtitle: 'تعرّف على أكثر الصالونات تفاعلاً واحجز موعدك بدقة وفي ثوانٍ.',
    },
    {
      index: '04',
      kicker: 'فلسفة المنصة وميثاق الخصوصية',
      title: 'من نحن وقوانين مجتمع أوريليوس',
      subtitle: 'رؤيتنا لتنظيم عالم الحلاقة بأسلوب راقٍ وضوابط الأمان الملزمة للجميع.',
    },
  ];

  const currentMeta = stepMeta[step];

  const handleNext = () => {
    if (step < TOTAL_STEPS - 1) {
      setStep((s) => s + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (step > 0) {
      setStep((s) => s - 1);
    }
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-step-title"
        className="w-full max-w-4xl max-h-[92vh] bg-[#121217] border border-[#2C2C35] rounded-3xl overflow-hidden shadow-2xl flex flex-col"
      >
        {/* Top Bar: Brand + Step Progress Indicators */}
        <header className="px-5 py-4 sm:px-8 border-b border-[#22222A] bg-[#15151C] flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#D4A853] text-[#0B0B0E] flex items-center justify-center shadow-md shrink-0">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm sm:text-base font-extrabold text-[#F5F2EB]">
                  أوريليوس باربر
                </span>
                <span aria-hidden="true" className="text-[#454552]">
                  ·
                </span>
                <span className="font-serif-accent text-xs text-[#D4A853]">
                  Aurelius Barber
                </span>
              </div>
              <p className="text-[11px] text-[#9C968B]">
                الجولة التعريفية التفاعلية · الخطوة{' '}
                <span className="font-mono-num text-[#D4A853] font-bold">
                  {step + 1}/{TOTAL_STEPS}
                </span>
              </p>
            </div>
          </div>

          {/* Interactive 4-Step Progress Controls */}
          <div className="flex items-center gap-1.5" role="tablist" aria-label="خطوات الجولة">
            {stepMeta.map((s, idx) => {
              const isCurrent = idx === step;
              const isDone = idx < step;
              return (
                <button
                  key={s.index}
                  type="button"
                  role="tab"
                  aria-selected={isCurrent}
                  aria-label={`الخطوة ${idx + 1}: ${s.title}`}
                  onClick={() => setStep(idx)}
                  className={`h-8 px-2.5 rounded-xl text-xs font-mono-num font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    isCurrent
                      ? 'bg-[#D4A853] text-[#0B0B0E]'
                      : isDone
                        ? 'bg-[#D4A853]/20 text-[#F5D67B] border border-[#D4A853]/40'
                        : 'bg-[#1B1B23] text-[#8B857B] border border-[#272732] hover:text-[#F5F2EB]'
                  }`}
                >
                  {s.index}
                </button>
              );
            })}
          </div>
        </header>

        {/* Thin Progress Track */}
        <div className="h-1 w-full bg-[#1C1C24] shrink-0">
          <div
            className="h-full bg-[#D4A853] transition-all duration-300"
            style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
          />
        </div>

        {/* Scrollable Step Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-8 space-y-6">
          {/* Editorial Step Heading */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-[#D4A853] flex items-center gap-2">
              <span className="font-mono-num">{currentMeta.index}.</span>
              <span>{currentMeta.kicker}</span>
            </div>
            <h2
              id="onboarding-step-title"
              className="text-xl sm:text-3xl font-extrabold text-[#F5F2EB] leading-tight [text-wrap:balance]"
            >
              {currentMeta.title}
            </h2>
            <p className="text-xs sm:text-sm text-[#B6B0A4] leading-relaxed max-w-2xl">
              {currentMeta.subtitle}
            </p>
          </div>

          {/* STEP 1: Exclusive Gallery & Look of the Season */}
          {step === 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
              <div className="lg:col-span-7 space-y-4">
                <div className="bg-[#17171F] border border-[#282833] rounded-2xl p-5 space-y-2.5">
                  <div className="flex items-center gap-2.5 text-sm font-bold text-[#F5F2EB]">
                    <div className="w-8 h-8 rounded-xl bg-[#D4A853]/15 text-[#D4A853] flex items-center justify-center shrink-0">
                      <ImageIcon className="w-4 h-4" />
                    </div>
                    <span>المعرض الحصري وأحدث القصات</span>
                  </div>
                  <p className="text-xs sm:text-sm text-[#A6A196] leading-relaxed">
                    استكشف مكتبة مختارة بعناية من أحدث قصات الشعر وتنسيق اللحية، المنشورة حصرياً من قِبل حملة رتبة{' '}
                    <strong className="text-slate-200">«حلاق VIP / خبير»</strong>، مع ميزة المقارنة التفاعلية{' '}
                    <strong className="text-[#F5F2EB]">«قبل وبعد»</strong> والإعجاب بالأعمال.
                  </p>
                </div>

                <div className="bg-[#17171F] border border-[#D4A853]/40 rounded-2xl p-5 space-y-2.5">
                  <div className="flex items-center gap-2.5 text-sm font-bold text-[#F5D67B]">
                    <div className="w-8 h-8 rounded-xl bg-[#D4A853]/15 text-[#D4A853] flex items-center justify-center shrink-0">
                      <Trophy className="w-4 h-4" />
                    </div>
                    <span>نظام الكريدت ومتجر المزايا المؤقتة</span>
                  </div>
                  <p className="text-xs sm:text-sm text-[#A6A196] leading-relaxed">
                    اكسب <strong className="text-[#F5D67B]">نقاط الكريدت</strong> عبر التواجد اليومي والتفاعل الإيجابي، واستبدلها من المتجر بمزايا مؤقتة مثل{' '}
                    <strong className="text-[#F5F2EB]">ID مميز، ألوان الأسماء، الإطارات، وبطاقة المتجر المؤقتة</strong>.
                  </p>
                </div>
              </div>

              <div className="lg:col-span-5 relative rounded-2xl overflow-hidden border border-[#2A2A35] bg-[#1A1A22] min-h-[220px] flex flex-col justify-end">
                <img
                  src="./src/assets/images/barber_hero_salon_1794853787883.jpg"
                  alt="أجواء المعرض الفاخر في أوريليوس باربر"
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0E] via-[#0B0B0E]/45 to-transparent" />
                <div className="relative p-5 space-y-2">
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#F5D67B]">
                    <Sparkles className="w-3.5 h-3.5 text-[#D4A853]" />
                    <span>المعرض الحصري · ستوريات 24 ساعة</span>
                  </div>
                  <p className="text-xs text-[#E6E1D8] leading-relaxed">
                    اضغط على اسم أي حلاق أسفل قصّته للانتقال فوراً إلى ملفه الشخصي أو حجز موعدك معه.
                  </p>
                </div>
              </div>
            </div>
          )}
                    {/* STEP 2: Community, Public Chat, Roles & Live Status */}
          {step === 1 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Public Chat + Live Status */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-[#17171F] border border-[#282833] rounded-2xl p-5 space-y-2.5">
                  <div className="flex items-center gap-2.5 text-sm font-bold text-[#F5F2EB]">
                    <div className="w-8 h-8 rounded-xl bg-[#D4A853]/15 text-[#D4A853] flex items-center justify-center shrink-0">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <span>الدردشة العامة والرسائل الخاصة</span>
                  </div>
                  <p className="text-xs sm:text-sm text-[#A6A196] leading-relaxed">
                    تواصل فورياً مع الحلاقين والزبائن في ساحة المجتمع، استشرهم حول القصات المناسبة، أو افتح محادثة خاصة مباشرة بضغطة زر.
                  </p>
                </div>

                <div className="bg-[#17171F] border border-[#282833] rounded-2xl p-5 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#D4A853]">
                    <Radio className="w-4 h-4" />
                    <span>مؤشر حالة الاتصال المتقدم (Live Status)</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between py-1.5 border-b border-[#23232D]">
                      <span className="font-bold text-emerald-400">متصل الآن</span>
                      <span className="text-[#9C968B]">متاح للرد الفوري واستقبال الرسائل</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-[#23232D]">
                      <span className="font-bold text-amber-400">مشغول</span>
                      <span className="text-[#9C968B]">الحلاق منشغل حالياً على الكرسي</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="font-bold text-[#8B857B]">أوفلاين</span>
                      <span className="text-[#9C968B]">يعرض آخر وقت ظهور للعضو</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dynamic Role Hierarchy */}
              <div className="lg:col-span-7 bg-[#17171F] border border-[#282833] rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-[#F5F2EB]">
                    هرمية الرتب والصلاحيات في أوريليوس باربر
                  </h3>
                  <span className="text-[11px] text-[#9C968B]">محدّثة تلقائياً من لوحة المؤسس</span>
                </div>

                <div className="divide-y divide-[#23232D] text-xs max-h-[300px] overflow-y-auto pr-1">
                  {allRoleDefs.map((def) => (
                    <div key={def.id} className="py-2.5 flex items-start gap-2.5">
                      <div className="shrink-0 mt-0.5">
                        <RoleTag role={def.id} size="xs" />
                      </div>
                      <p className="text-[#9C968B] leading-relaxed">{def.descriptionAr}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Leaderboard & Appointments */}
          {step === 2 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-[#17171F] border border-[#D4A853]/35 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#D4A853]/15 text-[#D4A853] flex items-center justify-center shrink-0">
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-[#F5F2EB]">
                      لوحة الشرف ونظام الكريدت
                    </h3>
                    <p className="text-xs text-[#D4A853]">منافسة أسبوعية ومكافآت يومية للأعضاء</p>
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-[#B6B0A4] leading-relaxed">
                  تسلّط <strong className="text-[#F5F2EB]">لوحة الشرف (Leaderboard)</strong> الضوء على أبرز الحلاقين والصالونات تفاعلاً وطلباً وتقييماً خلال الأسبوع، مما يساعدك في الوصول إلى النخبة بلمح البصر.
                </p>

                <div className="pt-2 border-t border-[#23232D] flex items-start gap-2.5 text-xs text-[#A6A196]">
                  <Coins className="w-4 h-4 text-[#D4A853] shrink-0 mt-0.5" />
                  <span>
                    اكسب <strong className="text-[#F5D67B]">نقاط الكريدت</strong> عند التواجد والمشاركة الإيجابية في الدردشة وإتمام الحجوزات لاستئجار مزايا مؤقتة من المتجر.
                  </span>
                </div>
              </div>

              <div className="bg-[#17171F] border border-[#282833] rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                    <CalendarClock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-[#F5F2EB]">
                      حجز المواعيد والخريطة التفاعلية
                    </h3>
                    <p className="text-xs text-emerald-400">تنظيم دقيق بدون انتظار عشوائي</p>
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-[#B6B0A4] leading-relaxed">
                  اختر الخدمة والسعر والمدة من ملف الحلاق، حدد التاريخ والساعة المناسبة لك، وتابع حالة حجزك مع إشعارات صوتية وفورية عند التأكيد أو إعادة الجدولة، وإمكانية حذف أي حجز بمرونة.
                </p>

                <div className="pt-2 border-t border-[#23232D] flex items-start gap-2.5 text-xs text-[#A6A196]">
                  <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    استخدم <strong className="text-[#F5F2EB]">الخريطة التفاعلية</strong> لاكتشاف أقرب الصالونات الموثقة إليك والتحقق من توفر الحلاقين قبل الحجز.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: About Us, Rules & Launch */}
          {step === 3 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* About Us Summary */}
              <div className="lg:col-span-6 bg-[#17171F] border border-[#282833] rounded-2xl p-6 space-y-3">
                <div className="flex items-center gap-2.5 text-sm font-extrabold text-[#D4A853]">
                  <BookOpen className="w-4 h-4" />
                  <span>من نحن وفلسفة أوريليوس باربر</span>
                </div>
                <h3 className="text-base font-extrabold text-[#F5F2EB]">
                  تنظيم عالم الحلاقة بأسلوب فخم يليق بالجميع
                </h3>
                <p className="text-xs sm:text-sm text-[#B6B0A4] leading-relaxed">
                  «أوريليوس باربر» هو أول مجتمع رقمي واحترافي يجمع أحسن الحلاقين وأصحاب الصنعة بالزبائن لإنهاء العشوائية، تقدير الحلاق المحترف، وتوفير وقت الزبون في منصة واحدة تنبض بالأناقة والاحترام.
                </p>
                <div className="pt-2 border-t border-[#23232D] text-xs text-[#9C968B] flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#D4A853] shrink-0" />
                  <span>يمكنك دائماً زيارة تبويب «عن التطبيق» لمتابعة أخبار التحديثات القادمة.</span>
                </div>
              </div>

              {/* Mandatory Rules & Privacy */}
              <div className="lg:col-span-6 bg-[#17171F] border border-[#D4A853]/35 rounded-2xl p-6 space-y-3.5">
                <div className="flex items-center gap-2.5 text-sm font-extrabold text-[#F5D67B]">
                  <ShieldCheck className="w-4 h-4 text-[#D4A853]" />
                  <span>قوانين التطبيق وإرشادات الاستخدام (إلزامي)</span>
                </div>

                <ul className="space-y-3 text-xs text-[#B6B0A4] leading-relaxed">
                  <li className="flex items-start gap-2.5">
                    <MessageSquare className="w-4 h-4 text-[#D4A853] shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-[#F5F2EB]">السلوك العام والدردشة:</strong> الالتزام بالاحترام المتبادل ومنع السب أو الروابط العشوائية والسبام، ونشر المحتوى اللائق بعالم الحلاقة فقط.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Coins className="w-4 h-4 text-[#D4A853] shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-[#F5F2EB]">نظام الكريدت والـ ID المميز:</strong> جميع المزايا المستأجرة بالكريدت مؤقتة وتعود تلقائياً بعد انتهائها (باستثناء المحجوز للإدارة أو المثبت من المؤسس)، ويُمنع التحايل أو استغلال أي ثغرة.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <EyeOff className="w-4 h-4 text-[#D4A853] shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-[#F5F2EB]">السرية والخصوصية:</strong> يُمنع تداول الإيميلات نهائياً، ويلتزم الطاقم الإداري بحدود صلاحياته والسرية التامة لمركز التنسيق.
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Sticky Footer Navigation */}
        <footer className="px-5 py-4 sm:px-8 border-t border-[#22222A] bg-[#15151C] flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center justify-between sm:justify-start gap-3">
            {step > 0 ? (
              <button
                type="button"
                onClick={handlePrev}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#1D1D25] hover:bg-[#262632] border border-[#2D2D38] text-xs font-bold text-[#E6E1D8] transition-colors cursor-pointer whitespace-nowrap"
              >
                <ChevronRight className="w-4 h-4" />
                <span>السابق</span>
              </button>
            ) : (
              <span className="text-xs text-[#8B857B]">
                استكشف أقسام أوريليوس باربر في 4 خطوات سريعة
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleNext}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-sm font-extrabold transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
          >
            {step < TOTAL_STEPS - 1 ? (
              <span>التالي ➡️</span>
            ) : (
              <span>موافق، ابدأ الاستخدام 🚀</span>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
};
