import React, { useMemo, useState } from 'react';
import {
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Compass,
  Edit3,
  Megaphone,
  Pin,
  PinOff,
  Plus,
  Rocket,
  Scissors,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { db, createSafeId, handleFirestoreError, OperationType } from '../firebase';
import {
  AnnouncementBadge,
  AppView,
  PlatformAnnouncement,
  RoleDefinition,
  UserProfile,
} from '../types';
import { tsToMillis } from '../utils/gamification';
import {
  assertFounderActor,
  getAllRoleDefinitions,
  getRolePermissionArabicLabels,
} from '../utils/roles';
import { MAX_TEXT_LENGTHS, sanitizePlainText } from '../utils/security';
import { formatGregorianDate } from '../utils/time';
import { RoleTag } from './Avatar';
import { ConfirmModal } from './ConfirmModal';

interface AboutAndUpdatesViewProps {
  currentUser: UserProfile;
  isSuperAdmin: boolean;
  users: UserProfile[];
  announcements: PlatformAnnouncement[];
  roleDefinitions?: RoleDefinition[];
  onNavigateView: (view: AppView) => void;
  onOpenPrivacy?: (tab?: 'privacy' | 'delete') => void;
}

const BADGE_META: Record<
  AnnouncementBadge,
  { label: string; colorClass: string; borderClass: string }
> = {
  coming_soon: {
    label: 'قريباً',
    colorClass: 'text-[#F5D67B]',
    borderClass: 'border-[#D4A853]/40 bg-[#D4A853]/10',
  },
  in_development: {
    label: 'قيد التطوير',
    colorClass: 'text-sky-300',
    borderClass: 'border-sky-400/35 bg-sky-500/10',
  },
  major_update: {
    label: 'تحديث ضخم',
    colorClass: 'text-emerald-300',
    borderClass: 'border-emerald-400/35 bg-emerald-500/10',
  },
  new_feature: {
    label: 'ميزة جديدة',
    colorClass: 'text-slate-200',
    borderClass: 'border-slate-300/35 bg-slate-300/10',
  },
};

export const AboutAndUpdatesView: React.FC<AboutAndUpdatesViewProps> = ({
  currentUser,
  isSuperAdmin,
  users,
  announcements,
  roleDefinitions,
  onNavigateView,
  onOpenPrivacy,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PlatformAnnouncement | null>(null);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [badge, setBadge] = useState<AnnouncementBadge>('coming_soon');
  const [targetWindow, setTargetWindow] = useState('قريباً في الإصدار القادم');
  const [isPinned, setIsPinned] = useState(true);
  const [notifyAll, setNotifyAll] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PlatformAnnouncement | null>(null);

  const allRoleDefs = useMemo(() => getAllRoleDefinitions(), [roleDefinitions]);

  const sortedAnnouncements = useMemo(() => {
    return [...announcements].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return tsToMillis(b.createdAt) - tsToMillis(a.createdAt);
    });
  }, [announcements]);

  const openCreateModal = () => {
    setEditingItem(null);
    setTitle('');
    setSummary('');
    setBadge('coming_soon');
    setTargetWindow('الإصدار القادم');
    setIsPinned(true);
    setNotifyAll(true);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const openEditModal = (item: PlatformAnnouncement) => {
    setEditingItem(item);
    setTitle(item.title);
    setSummary(item.summary);
    setBadge(item.badge);
    setTargetWindow(item.targetWindow || '');
    setIsPinned(item.isPinned);
    setNotifyAll(false);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    assertFounderActor(currentUser, isSuperAdmin);
    const cleanTitle = sanitizePlainText(title, MAX_TEXT_LENGTHS.announcementTitle, {
      multiline: false,
    });
    const cleanSummary = sanitizePlainText(summary, MAX_TEXT_LENGTHS.announcementSummary, {
      multiline: true,
    });
    const cleanTargetWindow = sanitizePlainText(targetWindow, 60, { multiline: false });
    if (!cleanTitle || !cleanSummary) {
      setErrorMsg('يرجى إدخال عنوان الخبر وتفاصيل التحديث القادم.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setFeedback(null);

    try {
      if (editingItem) {
        await updateDoc(doc(db, 'platformAnnouncements', editingItem.id), {
          title: cleanTitle,
          summary: cleanSummary,
          badge,
          targetWindow: cleanTargetWindow,
          isPinned,
          updatedAt: serverTimestamp(),
        });
        setFeedback('تم تحديث خبر التطوير بنجاح.');
      } else {
        const id = createSafeId('ann');
        await setDoc(doc(db, 'platformAnnouncements', id), {
          id,
          authorId: currentUser.uid,
          authorName: currentUser.displayName || 'إدارة أوريليوس باربر',
          title: cleanTitle,
          summary: cleanSummary,
          badge,
          targetWindow: cleanTargetWindow,
          isPinned,
          visibility: 'public',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        if (notifyAll) {
          const targets = users.filter((u) => !u.isBanned && u.uid !== currentUser.uid);
          for (let i = 0; i < targets.length; i += 400) {
            const slice = targets.slice(i, i + 400);
            const batch = writeBatch(db);
            slice.forEach((member) => {
              const ntfId = createSafeId('ntf');
              batch.set(doc(db, 'notifications', ntfId), {
                id: ntfId,
                recipientId: member.uid,
                senderId: currentUser.uid,
                senderName: 'إدارة أوريليوس باربر',
                type: 'announcement',
                title: `قريباً في أوريليوس باربر: ${cleanTitle}`.slice(0, 120),
                body: cleanSummary.slice(0, 280),
                targetView: 'about',
                targetId: id,
                read: false,
                createdAt: serverTimestamp(),
              });
            });
            await batch.commit();
          }
        }
        setFeedback(
          notifyAll
            ? 'تم نشر الإعلان وإرسال إشعار لجميع الأعضاء بنجاح.'
            : 'تم نشر إعلان التحديث القادم بنجاح.'
        );
      }

      setModalOpen(false);
    } catch (err) {
      handleFirestoreError(
        err,
        editingItem ? OperationType.UPDATE : OperationType.CREATE,
        'platformAnnouncements'
      );
      setErrorMsg('تعذر حفظ الإعلان، يرجى المحاولة مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTogglePin = async (item: PlatformAnnouncement) => {
    assertFounderActor(currentUser, isSuperAdmin);
    try {
      await updateDoc(doc(db, 'platformAnnouncements', item.id), {
        isPinned: !item.isPinned,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `platformAnnouncements/${item.id}`);
    }
  };

  const handleDeleteAnnouncement = async (item: PlatformAnnouncement) => {
    assertFounderActor(currentUser, isSuperAdmin);
    try {
      await deleteDoc(doc(db, 'platformAnnouncements', item.id));
      setConfirmDelete(null);
      setFeedback('تم حذف الإعلان بنجاح.');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `platformAnnouncements/${item.id}`);
    }
  };
                  const formatDate = (ts: any) => formatGregorianDate(ts);

  return (
    <div className="space-y-10">
      {/* Section 1: About Us & App Story (Editorial Hero) */}
      <section className="bg-[#141419] border border-[#27272F] rounded-3xl overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <div className="text-xs font-bold text-[#D4A853] tracking-wide">
                قصة أوريليوس باربر · AURELIUS BARBER
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-[#F5F2EB] leading-tight [text-wrap:balance]">
                منصة تجمع أصحاب الصنعة الحقيقية والباحثين عن الأناقة في بيت واحد
              </h1>
              <p className="text-sm sm:text-base text-[#C8C2B8] leading-loose max-w-2xl">
                «أوريليوس باربر» هو أول مجتمع رقمي واحترافي متكامل يجمع أمهر الحلاقين
                وأصحاب الصنعة بالزبائن بأسلوب فخم وراقي، بعيداً عن العشوائية، وبمعايير جودة
                وخصوصية تليق بكل عضو في المنصة.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => onNavigateView('gallery')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Compass className="w-4 h-4 shrink-0" />
                <span>تصفح المعرض الحصري</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  document
                    .getElementById('roles-guide')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1C1C24] hover:bg-[#252530] border border-[#2D2D38] text-[#F5F2EB] text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Users className="w-4 h-4 text-[#D4A853] shrink-0" />
                <span>شرح الرتب والصلاحيات</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  document
                    .getElementById('platform-rules')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1C1C24] hover:bg-[#252530] border border-[#2D2D38] text-[#F5F2EB] text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>قوانين التطبيق</span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 relative min-h-[260px] bg-[#1A1A22]">
            <img
              src="./src/assets/images/barber_hero_salon_1794853787883.jpg"
              alt="صالون أوريليوس باربر الفاخر"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#141419]/90 via-[#141419]/25 to-transparent lg:bg-gradient-to-r lg:from-transparent lg:to-[#141419]/50" />
            <div className="absolute bottom-5 right-5 left-5">
              <p className="text-xs sm:text-sm font-semibold text-[#F5D67B] leading-relaxed">
                «الحلاقة ليست مجرد خدمة عابرة، بل صنعةٌ متقنة، ذوقٌ رفيع، وثقةٌ متبادلة بين
                المحترف وزبونه.»
              </p>
            </div>
          </div>
        </div>

        {/* 3 Core Editorial Chapters: Who We Are / Why / Mutual Benefit */}
        <div className="border-t border-[#23232C] grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x md:divide-x-reverse divide-[#23232C]">
          <article className="p-6 sm:p-8 space-y-3">
            <div className="text-xs font-mono-num font-bold text-[#D4A853]">01. من نحن</div>
            <h2 className="text-lg font-extrabold text-[#F5F2EB]">
              أول مجتمع رقمي احترافي للحلاقة
            </h2>
            <p className="text-xs sm:text-sm text-[#A6A196] leading-relaxed">
              تأسس «أوريليوس باربر» ليكون المرجع الرقمي الأرقى الذي يجمع أمهر الحلاقين
              الموثقين وخبراء الـ VIP مع الزبائن في بيئة محترمة ومنظمة تبرز جمال الصنعة
              وتفاصيلها.
            </p>
          </article>

          <article className="p-6 sm:p-8 space-y-3">
            <div className="text-xs font-mono-num font-bold text-[#D4A853]">
              02. لماذا صنعنا التطبيق؟
            </div>
            <h2 className="text-lg font-extrabold text-[#F5F2EB]">
              إنهاء العشوائية وتقدير أصحاب الصنعة
            </h2>
            <p className="text-xs sm:text-sm text-[#A6A196] leading-relaxed">
              جئنا لننهي عناء البحث العشوائي والانتظار غير المنظم، ونمنح الحلاق المحترف
              المكانة التي يستحقها لإبراز مهاراته، مع توفير وقت الزبون في منصة واحدة متكاملة
              تنبض بالأناقة والانضباط.
            </p>
          </article>

          <article className="p-6 sm:p-8 space-y-3">
            <div className="text-xs font-mono-num font-bold text-[#D4A853]">
              03. القيمة والفائدة للجميع
            </div>
            <h2 className="text-lg font-extrabold text-[#F5F2EB]">
              تجربة متوازنة للزبون والحلاق
            </h2>
            <ul className="space-y-2 text-xs sm:text-sm text-[#A6A196] leading-relaxed">
              <li className="flex items-start gap-2">
                <CalendarClock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-[#F5F2EB]">للزبون:</strong> حجز أسرع وأدق، رؤية
                  الأعمال الحقيقية، خريطة الصالونات، وتقييمات موثوقة بعد كل تجربة.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Scissors className="w-4 h-4 text-[#D4A853] shrink-0 mt-0.5" />
                <span>
                  <strong className="text-[#F5F2EB]">للحلاقين:</strong> عرض الشغل باحترافية
                  عالية، ستوريات يومية، والتنافس بشرف في لوحة الشرف الأسبوعية.
                </span>
              </li>
            </ul>
          </article>
        </div>
      </section>

      {/* Core Platform Values Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-5 space-y-2">
          <div className="w-9 h-9 rounded-xl bg-[#D4A853]/12 text-[#D4A853] flex items-center justify-center">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-[#F5F2EB]">خصوصية وسرية تامة</h3>
          <p className="text-xs text-[#9C968B] leading-relaxed">
            بيانات الاتصال والبريد الإلكتروني محمية ومخفية بالكامل ولا تظهر في أي ملف أو واجهة
            عامة.
          </p>
        </div>

        <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-5 space-y-2">
          <div className="w-9 h-9 rounded-xl bg-slate-200/10 text-slate-200 flex items-center justify-center">
            <Users className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-[#F5F2EB]">هرمية رتب احترافية</h3>
          <p className="text-xs text-[#9C968B] leading-relaxed">
            تدرج واضح من المؤسس وطاقم الإدارة والإشراف إلى نخبة حلاقي الـ VIP والحلاقين الموثقين والأعضاء.
          </p>
        </div>

        <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-5 space-y-2">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/12 text-emerald-400 flex items-center justify-center">
            <BookOpen className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-[#F5F2EB]">كريدت ومتجر مزايا مرن</h3>
          <p className="text-xs text-[#9C968B] leading-relaxed">
            اجمع نقاط الكريدت بالتفاعل والحجوزات واستبدلها بمزايا مؤقتة (آيدي مميز، ألوان، إطارات، وبطاقة المتجر المؤقتة) دون خلطها مع الرتب الرسمية.
          </p>
        </div>
      </section>

      {/* Section: Dynamic Roles & Permissions Guide */}
      <section id="roles-guide" className="space-y-4">
        <div className="bg-[#141419] border border-[#27272F] rounded-3xl p-5 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-[#D4A853]">
              <Users className="w-4 h-4 shrink-0" />
              <span>دليل الرتب الرسمي · محدّث تلقائياً</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#F5F2EB]">
              شرح الرتب والصلاحيات في أوريليوس باربر
            </h2>
            <p className="text-xs sm:text-sm text-[#9C968B] max-w-2xl leading-relaxed">
              تُرتّب الرتب هرمياً من الأعلى إلى الأساسي، وأي رتبة جديدة يتم إنشاؤها أو تعديل اسمها وصلاحياتها من لوحة الإدارة تظهر وتُحدّث هنا تلقائياً.
            </p>
          </div>
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => onNavigateView('admin')}
              className="px-4 py-2.5 rounded-xl bg-[#1C1C24] hover:bg-[#D4A853] hover:text-[#0B0B0E] border border-[#D4A853]/40 text-xs font-bold text-[#F5D67B] whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              إدارة وتعديل الرتب
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {allRoleDefs.map((def) => {
            const isFounder = def.id === 'admin';
            const permsList = getRolePermissionArabicLabels(def.permissions);
            return (
              <article
                key={def.id}
                className={`rounded-2xl p-5 border space-y-3 ${
                  isFounder
                    ? 'md:col-span-2 bg-gradient-to-l from-[#D4A853]/14 via-[#171510] to-[#141419] border-[#D4A853]/60'
                    : 'bg-[#141419] border-[#27272F]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                    <RoleTag role={def.id} size="md" />
                    <span className="text-[11px] font-mono-num tabular-nums text-[#8B857B] whitespace-nowrap">
                      الترتيب: {def.hierarchyOrder}
                    </span>
                  </div>
                  {isFounder ? (
                    <span className="px-2.5 py-1 rounded-lg bg-[#D4A853]/20 border border-[#D4A853]/50 text-[11px] font-extrabold text-[#FCE08B] whitespace-nowrap shrink-0">
                      الرتبة العليا الدائمة
                    </span>
                  ) : !def.isSystem ? (
                    <span className="px-2.5 py-1 rounded-lg bg-violet-500/15 border border-violet-400/35 text-[11px] font-bold text-violet-200 whitespace-nowrap shrink-0">
                      رتبة مخصّصة من الإدارة
                    </span>
                  ) : null}
                </div>

                <p className="text-xs sm:text-sm text-[#D6D1C7] leading-relaxed">
                  {def.descriptionAr || 'رتبة مخصّصة بصلاحيات محددة من إدارة المنصة.'}
                </p>

                <div className="pt-2 border-t border-[#22222A] flex flex-wrap gap-1.5">
                  {isFounder ? (
                    <span className="px-2.5 py-1 rounded-lg bg-[#D4A853]/15 border border-[#D4A853]/40 text-[11px] font-bold text-[#F5D67B]">
                      كافة الصلاحيات المطلقة + وصول دائم ومجاني غير محدود لجميع مزايا المتجر
                    </span>
                  ) : permsList.length === 0 ? (
                    <span className="text-[11px] text-[#8B857B]">
                      صلاحيات العضوية الأساسية: التصفح، الدردشة، التصويت، حجز المواعيد، وجمع الكريدت.
                    </span>
                  ) : (
                    permsList.map((label) => (
                      <span
                        key={label}
                        className="px-2 py-0.5 rounded-md bg-[#1B1B24] border border-[#2C2C38] text-[10px] text-[#D6D1C7]"
                      >
                        {label}
                      </span>
                    ))
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Section: Platform Rules & Usage Guidelines */}
      <section id="platform-rules" className="space-y-4">
        <div className="bg-[#141419] border border-[#27272F] rounded-3xl p-5 sm:p-7 space-y-1.5">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-emerald-400">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>ميثاق مجتمع أوريليوس باربر</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#F5F2EB]">
            قوانين التطبيق وإرشادات الاستخدام
          </h2>
          <p className="text-xs sm:text-sm text-[#9C968B] max-w-3xl leading-relaxed">
            ضوابط ملزمة لجميع الأعضاء والحلاقين والطاقم الإداري لضمان بيئة احترافية آمنة وعادلة في جميع الدول.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* First: General Conduct & Chat */}
          <article className="bg-[#141419] border border-[#27272F] rounded-2xl p-5 space-y-3">
            <div className="pb-2.5 border-b border-[#22222A] flex items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold text-[#F5F2EB]">
                أولاً: قوانين السلوك العام والدردشة
              </h3>
              <span className="text-[11px] font-mono-num font-bold text-[#D4A853] whitespace-nowrap">
                01
              </span>
            </div>
            <ul className="space-y-2.5 text-xs text-[#D6D1C7] leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D4A853] mt-1.5 shrink-0" />
                <span>
                  الالتزام بالاحترام المتبادل بين جميع الأعضاء والحلاقين والطاقم الإداري، ويُمنع منعاً باتاً السب، القذف، أو إثارة الفتن.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D4A853] mt-1.5 shrink-0" />
                <span>
                  يُمنع نشر الروابط العشوائية، الإعلانات الخارجية غير المصرح بها، أو الرسائل المزعجة (السبام) في الدردشات العامة والمحلية.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D4A853] mt-1.5 shrink-0" />
                <span>
                  الالتزام بنشر المحتوى اللائق والخاص بعالم الحلاقة والأناقة في المعرض العام والستوري.
                </span>
              </li>
            </ul>
          </article>

          {/* Second: Credits & Special ID */}
          <article className="bg-[#141419] border border-[#D4A853]/40 rounded-2xl p-5 space-y-3">
            <div className="pb-2.5 border-b border-[#22222A] flex items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold text-[#F5D67B]">
                ثانياً: قوانين نظام الكريدت والـ ID المميز
              </h3>
              <span className="text-[11px] font-mono-num font-bold text-[#D4A853] whitespace-nowrap">
                02
              </span>
            </div>
            <ul className="space-y-2.5 text-xs text-[#D6D1C7] leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D4A853] mt-1.5 shrink-0" />
                <span>
                  تُكتسب نقاط الكريدت عبر التواجد والتفاعل الإيجابي أو كمكافآت من الإدارة، وتُستبدل بمزايا مؤقتة من المتجر (مثل استئجار ID مميز، ألوان الأسماء، الإطارات، أو بطاقة المتجر المؤقتة).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D4A853] mt-1.5 shrink-0" />
                <span>
                  جميع البطاقات والمزايا المستأجرة بالكريدت محددة بمدة زمنية ومنفصلة شكلاً ومضموناً عن الرتب الرسمية المعتمدة؛ وعند انتهائها يعود الحساب تلقائياً إلى وضعه السابق باستثناء الأرقام المثبتة بقرار من المؤسس.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D4A853] mt-1.5 shrink-0" />
                <span>
                  يُمنع التحايل أو استغلال أي ثغرة لجمع الكريدت، ويعرّض المخالف لسحب الرصيد وتجميد الحساب.
                </span>
              </li>
            </ul>
          </article>

          {/* Third: Administrative & Moderation Staff */}
          <article className="bg-[#141419] border border-indigo-400/35 rounded-2xl p-5 space-y-3">
            <div className="pb-2.5 border-b border-[#22222A] flex items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold text-indigo-200">
                ثالثاً: قوانين الطاقم الإداري والإشراف
              </h3>
              <span className="text-[11px] font-mono-num font-bold text-indigo-300 whitespace-nowrap">
                03
              </span>
            </div>
            <ul className="space-y-2.5 text-xs text-[#D6D1C7] leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                <span>
                  يلتزم كل مشرف بحدود صلاحياته الممنوحة له، ويُمنع استخدام الصلاحيات لأغراض شخصية أو التعسف ضد أي عضو.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                <span>
                  السرية التامة لما يدور داخل مركز تنسيق الطاقم (الغرفة السرية)، وأي تسريب للمعلومات الإدارية يؤدي لسحب الرتبة فوراً.
                </span>
              </li>
            </ul>
          </article>
        </div>

        {/* Play Store Transparency: Privacy Policy, Account Deletion & Virtual Credit Policy */}
        <div className="bg-[#141419] border border-[#D4A853]/35 rounded-2xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-extrabold text-[#D4A853]">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>الخصوصية، الأمان، وشفافية الكريدت الافتراضي</span>
            </div>
            <p className="text-xs text-[#D6D1C7] leading-relaxed">
              <strong>الكريدت رصيد افتراضي داخل المنصة فقط</strong> وليس عملة مالية حقيقية ولا يقبل البيع أو السحب. يمكنك الاطلاع على سياسة الخصوصية الكاملة أو طلب حذف حسابك وبياناتك نهائياً في أي وقت.
            </p>
          </div>
          {onOpenPrivacy && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onOpenPrivacy('privacy')}
                className="px-4 py-2.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-extrabold cursor-pointer whitespace-nowrap"
              >
                قراءة سياسة الخصوصية
              </button>
              <button
                type="button"
                onClick={() => onOpenPrivacy('delete')}
                className="px-4 py-2.5 rounded-xl bg-[#1C1C24] hover:bg-red-500/15 border border-red-500/35 text-red-300 text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                حذف الحساب والبيانات
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Section 2: Coming Soon & Dev Log Announcements */}
      <section id="coming-soon" className="space-y-5">
        <div className="bg-[#141419] border border-[#27272F] rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-[#D4A853]">
              <Rocket className="w-4 h-4" />
              <span>سجل التطوير والأخبار الرسمية</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#F5F2EB]">
              أخبار التحديثات القادمة (Coming Soon)
            </h2>
            <p className="text-xs sm:text-sm text-[#9C968B] max-w-2xl leading-relaxed">
              تابع أحدث الإعلانات الرسمية الصادرة من إدارة المنصة حول الميزات الجديدة والتحسينات
              المرتقبة في «أوريليوس باربر».
            </p>
          </div>

          {isSuperAdmin && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-bold transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>نشر إعلان تحديث جديد</span>
            </button>
          )}
        </div>

        {feedback && (
          <div className="flex items-center gap-2 p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/35 text-emerald-300 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        {sortedAnnouncements.length === 0 ? (
          <div className="bg-[#141419] border border-[#D4A853]/35 rounded-2xl p-6 sm:p-8 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 text-xs font-bold text-[#F5D67B]">
                <Megaphone className="w-4 h-4 text-[#D4A853]" />
                <span>قريباً في أوريليوس باربر</span>
                <span aria-hidden="true">·</span>
                <span className="text-[#9C968B] font-normal">خارطة الطريق</span>
              </div>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-[#D4A853]/40 bg-[#D4A853]/10 text-[#F5D67B]">
                قريباً
              </span>
            </div>
            <h3 className="text-lg font-extrabold text-[#F5F2EB]">
              🚀 قريباً في أوريليوس باربر: ترقبوا التحديث القادم والميزات الجديدة!
            </h3>
            <p className="text-xs sm:text-sm text-[#B6B0A4] leading-relaxed max-w-3xl">
              يعمل فريق «أوريليوس باربر» باستمرار على تطوير مزايا مبتكرة تعزز تجربة الحجز،
              توسّع قدرات معارض الحلاقين الخبراء، وتضيف أدوات تفاعلية جديدة للمجتمع. ترقبوا
              الإعلانات الرسمية القادمة هنا فور نشرها من إدارة المنصة.
            </p>
            {isSuperAdmin && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#D4A853] hover:underline cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>أضف أول إعلان رسمي للتحديث القادم</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {sortedAnnouncements.map((item) => {
              const badgeInfo = BADGE_META[item.badge] || BADGE_META.coming_soon;
              return (
                <article
                  key={item.id}
                  className={`bg-[#141419] border rounded-2xl p-6 space-y-3 transition-colors ${
                    item.isPinned ? 'border-[#D4A853]/50' : 'border-[#27272F]'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {item.isPinned && (
                          <span className="inline-flex items-center gap-1 font-bold text-[#D4A853]">
                            <Pin className="w-3.5 h-3.5" />
                            <span>مثبت</span>
                          </span>
                        )}
                                                {item.isPinned && (
                          <span aria-hidden="true" className="text-[#454552]">
                            ·
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11px] font-bold ${badgeInfo.borderClass} ${badgeInfo.colorClass}`}
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>{badgeInfo.label}</span>
                        </span>
                        {item.targetWindow && (
                          <>
                            <span aria-hidden="true" className="text-[#454552]">
                              ·
                            </span>
                            <span className="text-[#C8C2B8] font-medium">{item.targetWindow}</span>
                          </>
                        )}
                        <span aria-hidden="true" className="text-[#454552]">
                          ·
                        </span>
                        <span className="text-[#8B857B] font-mono-num">
                          {formatDate(item.createdAt)}
                        </span>
                      </div>

                      <h3 className="text-lg font-extrabold text-[#F5F2EB] leading-snug">
                        {item.title}
                      </h3>
                    </div>

                    {isSuperAdmin && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleTogglePin(item)}
                          title={item.isPinned ? 'إلغاء التثبيت' : 'تثبيت في الأعلى'}
                          className={`p-2 rounded-xl border text-xs transition-colors cursor-pointer ${
                            item.isPinned
                              ? 'bg-[#D4A853]/15 border-[#D4A853]/40 text-[#D4A853]'
                              : 'bg-[#1A1A22] border-[#2C2C35] text-[#9C968B] hover:text-white'
                          }`}
                        >
                          {item.isPinned ? (
                            <PinOff className="w-3.5 h-3.5" />
                          ) : (
                            <Pin className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          title="تعديل الإعلان"
                          className="p-2 rounded-xl bg-[#1A1A22] border border-[#2C2C35] text-[#9C968B] hover:text-[#D4A853] cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(item)}
                          title="حذف الإعلان"
                          className="p-2 rounded-xl bg-[#1A1A22] border border-[#2C2C35] text-[#9C968B] hover:text-red-400 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <p className="text-xs sm:text-sm text-[#D6D1C7] leading-relaxed whitespace-pre-wrap max-w-4xl">
                    {item.summary}
                  </p>

                  <div className="pt-2 border-t border-[#22222A] text-[11px] text-[#8B857B] flex items-center gap-2">
                    <span>صادر عن:</span>
                    <span className="font-bold text-[#D4A853]">إدارة أوريليوس باربر</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Admin Create / Edit Announcement Modal */}
      {modalOpen && isSuperAdmin && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-[#141419] border border-[#2C2C35] rounded-2xl p-6 space-y-5 shadow-2xl my-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Rocket className="w-5 h-5 text-[#D4A853]" />
                <h2 className="text-base font-bold text-[#F5F2EB]">
                  {editingItem ? 'تعديل خبر التحديث' : 'نشر خبر تحديث قادم (Coming Soon)'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-[#9C968B] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/35 text-xs text-red-300">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSaveAnnouncement} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#C8C2B8]">
                  عنوان الإعلان
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: 🚀 قريباً في أوريليوس باربر: نظام التذكير الذكي بالمواعيد!"
                  className="w-full bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F2EB] outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#C8C2B8]">
                    حالة الميزة
                  </label>
                  <select
                    value={badge}
                    onChange={(e) => setBadge(e.target.value as AnnouncementBadge)}
                    className="w-full bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F2EB] outline-none"
                  >
                    <option value="coming_soon">قريباً</option>
                    <option value="in_development">قيد التطوير</option>
                    <option value="major_update">تحديث ضخم</option>
                    <option value="new_feature">ميزة جديدة</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#C8C2B8]">
                    موعد الإطلاق المتوقع (اختياري)
                  </label>
                  <input
                    type="text"
                    maxLength={60}
                    value={targetWindow}
                    onChange={(e) => setTargetWindow(e.target.value)}
                    placeholder="مثال: الأسبوع القادم"
                    className="w-full bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F2EB] outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#C8C2B8]">
                  تفاصيل الخبر والتشويق للأعضاء
                </label>
                <textarea
                  required
                  rows={4}
                  maxLength={1200}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="اشرح باختصار الميزات القادمة وما سيستفيد منه الزبائن والحلاقون..."
                  className="w-full bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F2EB] outline-none resize-none"
                />
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2.5 text-xs text-[#E6E1D8] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPinned}
                    onChange={(e) => setIsPinned(e.target.checked)}
                    className="accent-[#D4A853] w-4 h-4 rounded"
                  />
                  <span>تثبيت الإعلان في أعلى المعرض وسجل التطوير</span>
                </label>

                {!editingItem && (
                  <label className="flex items-center gap-2.5 text-xs text-[#E6E1D8] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyAll}
                      onChange={(e) => setNotifyAll(e.target.checked)}
                      className="accent-[#D4A853] w-4 h-4 rounded"
                    />
                    <span>إرسال إشعار تنبيهي مباشر لجميع الأعضاء النشطين</span>
                  </label>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#1C1C24] text-xs font-semibold text-[#A6A196] hover:text-white cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-bold cursor-pointer disabled:opacity-60"
                >
                  {submitting
                    ? 'جاري النشر...'
                    : editingItem
                      ? 'حفظ التعديلات'
                      : 'نشر الإعلان الآن'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={Boolean(confirmDelete)}
        title="هل أنت متأكد من حذف الإعلان؟"
        message={
          confirmDelete
            ? `سيتم حذف إعلان "${confirmDelete.title}" من سجل التحديثات القادمة نهائياً.`
            : ''
        }
        confirmLabel="نعم، حذف الإعلان"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) return handleDeleteAnnouncement(confirmDelete);
        }}
      />
    </div>
  );
};
