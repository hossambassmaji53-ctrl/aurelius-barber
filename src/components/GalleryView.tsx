import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  X,
  Upload,
  Scissors,
  Star,
  CalendarClock,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  BadgeCheck,
  Clock,
  CheckCircle2,
  Heart,
  Columns2,
  Flag,
  Ban,
} from 'lucide-react';
import {
  db,
  createSafeId,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import {
  GalleryCategory,
  GalleryItem,
  LikeRecord,
  LikeTargetType,
  PlatformAnnouncement,
  Review,
  RoleDefinition,
  UserProfile,
  UserRole,
  VerificationRequest,
} from '../types';
import { compressImageToDataUrl } from '../utils/image';
import { getEffectiveLiveStatus } from '../utils/gamification';
import {
  Avatar,
  RoleTag,
  VipSilverStar,
  canPublishToGallery,
  getEffectiveNameColorClass,
  getUserRoles,
  hasRole,
  isAnyBarberRole,
  isBarberMember,
} from './Avatar';
import { getRoleHierarchyOrder } from '../utils/roles';
import { ConfirmModal } from './ConfirmModal';
import { BeforeAfterCompare } from './BeforeAfterCompare';
import { VerificationRequestModal } from './VerificationRequestModal';
import { CountryFlag } from './CountryPickerModal';
import {
  getCountryByCode,
  matchesActiveCountry,
  normalizeCountryCode,
} from '../utils/countries';
import {
  checkActionRateLimit,
  isSafeMediaUrl,
  MAX_TEXT_LENGTHS,
  sanitizePlainText,
} from '../utils/security';
import { ReportRequestPayload } from './ReportContentModal';
const demoFadeImg = '';
const demoBeardImg = '';
const demoToolingImg = '';
const demoSalonImg = '';


const DEMO_HIDE_STORAGE_KEY = 'aurelius_hide_demo_gallery_v1';

const DEMO_GALLERY_ITEMS: GalleryItem[] = [
  {
    id: 'demo_fade_01',
    barberId: 'demo_barber',
    barberName: 'نماذج أوريليوس التجريبية',
    title: 'تدرج سكين فيد مع تحديد دقيق',
    description: 'نموذج عرض توضيحي لتنسيق التدرج الجانبي النظيف وتحديد الحواف بالموس.',
    category: 'fade',
    imageUrl: demoFadeImg,
    visibility: 'public',
    createdAt: null,
    updatedAt: null,
  },
  {
    id: 'demo_beard_02',
    barberId: 'demo_barber',
    barberName: 'نماذج أوريليوس التجريبية',
    title: 'تشذيب وتدريج لحية ملكي',
    description: 'نموذج توضيحي يبرز توازن خطوط اللحية الحادة والعناية بالبشرة.',
    category: 'beard',
    imageUrl: demoBeardImg,
    visibility: 'public',
    createdAt: null,
    updatedAt: null,
  },
  {
    id: 'demo_classic_03',
    barberId: 'demo_barber',
    barberName: 'نماذج أوريليوس التجريبية',
    title: 'تجهيز أدوات الصالون الفاخر',
    description: 'نموذج عرض توضيحي لبيئة العمل الاحترافية ومعايير النظافة والضيافة.',
    category: 'classic',
    imageUrl: demoToolsImg,
    visibility: 'public',
    createdAt: null,
    updatedAt: null,
  },
  {
    id: 'demo_vip_04',
    barberId: 'demo_barber',
    barberName: 'نماذج أوريليوس التجريبية',
    title: 'جلسة عناية وتصفيف VIP',
    description: 'نموذج توضيحي لتجربة جلسة أوريليوس المتكاملة للقص والتصفيف.',
    category: 'vip',
    imageUrl: demoSalonImg,
    visibility: 'public',
    createdAt: null,
    updatedAt: null,
  },
];

interface GalleryViewProps {
  currentUser: UserProfile;
  isSuperAdmin: boolean;
  users: UserProfile[];
  gallery: GalleryItem[];
  reviews: Review[];
  likes: LikeRecord[];
  announcements?: PlatformAnnouncement[];
  verificationRequests: VerificationRequest[];
  roleDefinitions?: RoleDefinition[];
  activeCountryCode: string;
  onOpenProfile: (uid: string) => void;
  onBookBarber: (barber: UserProfile) => void;
  onToggleLike: (targetType: LikeTargetType, targetId: string) => Promise<void>;
  blockedUserIds?: string[];
  onBlockUser?: (targetUid: string, targetName: string, targetPhoto?: string) => Promise<void> | void;
  onOpenReport?: (payload: ReportRequestPayload) => void;
}

const CATEGORIES: { key: 'all' | GalleryCategory; label: string }[] = [
  { key: 'all', label: 'جميع الأعمال' },
  { key: 'fade', label: 'تدرج حديث' },
  { key: 'beard', label: 'تنسيق لحية' },
  { key: 'classic', label: 'كلاسيكي' },
  { key: 'styling', label: 'تصفيف وعناية' },
  { key: 'vip', label: 'جلسات VIP' },
];

export const GalleryView: React.FC<GalleryViewProps> = ({
  currentUser,
  isSuperAdmin,
  users,
  gallery,
  reviews,
  likes,
  verificationRequests,
  roleDefinitions,
  activeCountryCode,
  onOpenProfile,
  onBookBarber,
  onToggleLike,
  blockedUserIds = [],
  onBlockUser,
  onOpenReport,
}) => {
  const blockedSet = useMemo(() => new Set(blockedUserIds), [blockedUserIds]);
  const activeCountryMeta = useMemo(
    () => getCountryByCode(activeCountryCode),
    [activeCountryCode]
  );
  const [category, setCategory] = useState<'all' | GalleryCategory>('all');
  const [search, setSearch] = useState('');
  const [barbersDropdownOpen, setBarbersDropdownOpen] = useState(false);
  const [barbersScope, setBarbersScope] = useState<'all' | 'country'>('all');
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [hideDemoSamples, setHideDemoSamples] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DEMO_HIDE_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const handleToggleDemoSamples = (hide: boolean) => {
    setHideDemoSamples(hide);
    try {
      if (hide) localStorage.setItem(DEMO_HIDE_STORAGE_KEY, '1');
      else localStorage.removeItem(DEMO_HIDE_STORAGE_KEY);
    } catch {
      // Ignore storage failures in private browsing
    }
  };

  // Gallery upload / edit / delete
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GalleryItem | null>(null);
  const [lightboxItem, setLightboxItem] = useState<GalleryItem | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<GalleryItem | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [itemCategory, setItemCategory] = useState<GalleryCategory>('fade');
  const [imageUrl, setImageUrl] = useState('');
  const [isBeforeAfter, setIsBeforeAfter] = useState(false);
  const [beforeImageUrl, setBeforeImageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Barber Verification Request modal
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [verifySuccessMsg, setVerifySuccessMsg] = useState<string | null>(null);

  // Exclusive public gallery publishing strictly for VIP Barber (Silver) & Super Admin
  const canPublish = canPublishToGallery(currentUser, isSuperAdmin);
  const currentUserIsBarber = isBarberMember(currentUser);

  const directoryUsers = useMemo(() => {
    const map = new Map<string, UserProfile>();
    users.forEach((u) => map.set(u.uid, u));
    if (!map.has(currentUser.uid)) {
      map.set(currentUser.uid, currentUser);
    }
    return Array.from(map.values());
  }, [users, currentUser]);

  // Verified barbers directory bound directly to actual barber roles (excluding Founder/staff without a barber rank)
  const verifiedBarbers = useMemo(
    () =>
      directoryUsers
        .filter((u) => !u.isBanned && !blockedSet.has(u.uid) && isBarberMember(u))
        .sort((a, b) => {
          const aCountry =
            a.uid === currentUser.uid
              ? activeCountryCode
              : normalizeCountryCode(a.countryCode);
          const bCountry =
            b.uid === currentUser.uid
              ? activeCountryCode
              : normalizeCountryCode(b.countryCode);
          const aLocal = aCountry === activeCountryCode;
          const bLocal = bCountry === activeCountryCode;
          if (aLocal !== bLocal) return aLocal ? -1 : 1;

          const aVip = hasRole(a, 'vip_barber');
          const bVip = hasRole(b, 'vip_barber');
          if (aVip && !bVip) return -1;
          if (bVip && !aVip) return 1;

          const aBarberRole =
            getUserRoles(a).find((r) => isAnyBarberRole(r)) || getUserRoles(a)[0];
          const bBarberRole =
            getUserRoles(b).find((r) => isAnyBarberRole(r)) || getUserRoles(b)[0];
          const rankDiff =
            getRoleHierarchyOrder(aBarberRole) - getRoleHierarchyOrder(bBarberRole);
          if (rankDiff !== 0) return rankDiff;
            return a.displayName.localeCompare(b.displayName, 'ar');
        }),
    [directoryUsers, activeCountryCode, currentUser.uid, blockedSet, roleDefinitions]
  );

  const localVerifiedBarbers = useMemo(
    () =>
      verifiedBarbers.filter((u) => {
        const uCountry =
          u.uid === currentUser.uid
            ? activeCountryCode
            : normalizeCountryCode(u.countryCode);
        return uCountry === activeCountryCode;
      }),
    [verifiedBarbers, activeCountryCode, currentUser.uid]
  );

  const displayedVerifiedBarbers =
    barbersScope === 'country' ? localVerifiedBarbers : verifiedBarbers;

  // Latest verification request for current user
  const myLatestRequest = useMemo(() => {
    const mine = verificationRequests.filter((r) => r.userId === currentUser.uid);
    return mine[0] || null;
  }, [verificationRequests, currentUser.uid]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setBarbersDropdownOpen(false);
      }
    };
    if (barbersDropdownOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [barbersDropdownOpen]);

  const countryGallery = useMemo(() => {
    return gallery.filter((item) => {
      if (blockedSet.has(item.barberId)) return false;
      const barber = users.find((u) => u.uid === item.barberId);
      const barberCountry =
        barber?.uid === currentUser.uid ? activeCountryCode : barber?.countryCode;
      return matchesActiveCountry(item.countryCode, barberCountry, activeCountryCode);
    });
  }, [gallery, users, activeCountryCode, currentUser.uid, blockedSet]);

  const showingDemoFallback = countryGallery.length === 0 && !hideDemoSamples;

  const filteredGallery = useMemo(() => {
    const source = showingDemoFallback ? DEMO_GALLERY_ITEMS : countryGallery;
    const q = search.trim().toLowerCase();
    return source.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        (item.description || '').toLowerCase().includes(q) ||
        item.barberName.toLowerCase().includes(q)
      );
    });
  }, [showingDemoFallback, countryGallery, category, search]);

  const getBarberRating = (barberId: string) => {
    const list = reviews.filter((r) => r.barberId === barberId);
    if (list.length === 0) return { avg: 0, count: 0 };
    const sum = list.reduce((a, b) => a + b.rating, 0);
    return { avg: sum / list.length, count: list.length };
  };

  const getItemLikes = (itemId: string) => {
    const itemLikes = likes.filter(
      (l) => l.targetType === 'gallery' && l.targetId === itemId
    );
    return {
      count: itemLikes.length,
      likedByMe: itemLikes.some((l) => l.userId === currentUser.uid),
    };
  };

  const openCreateModal = () => {
    setEditingItem(null);
    setTitle('');
    setDescription('');
    setItemCategory('fade');
    setImageUrl('');
    setIsBeforeAfter(false);
    setBeforeImageUrl('');
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (item: GalleryItem) => {
    setEditingItem(item);
    setTitle(item.title);
    setDescription(item.description || '');
    setItemCategory(item.category);
    setImageUrl(item.imageUrl);
    setIsBeforeAfter(Boolean(item.isBeforeAfter && item.beforeImageUrl));
    setBeforeImageUrl(item.beforeImageUrl || '');
    setFormError(null);
    setModalOpen(true);
  };

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'after' | 'before'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormError(null);
    try {
      const dataUrl = await compressImageToDataUrl(file, 720, 720, 0.72);
      if (dataUrl.length > 395000) {
        const smaller = await compressImageToDataUrl(file, 580, 580, 0.62);
        if (target === 'before') setBeforeImageUrl(smaller);
        else setImageUrl(smaller);
      } else {
        if (target === 'before') setBeforeImageUrl(dataUrl);
        else setImageUrl(dataUrl);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'تعذر تحميل الصورة.');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = sanitizePlainText(title, MAX_TEXT_LENGTHS.galleryTitle);
    const cleanDesc = sanitizePlainText(description, MAX_TEXT_LENGTHS.galleryDescription);
    const cleanImageUrl = imageUrl.trim();
    const cleanBeforeUrl = beforeImageUrl.trim();

    if (!cleanTitle) {
      setFormError('يرجى إدخال عنوان عمل صالح.');
      return;
    }
    if (!cleanImageUrl || !isSafeMediaUrl(cleanImageUrl)) {
      setFormError(
        isBeforeAfter
          ? 'يرجى اختيار صورة نتيجة صالحة (بعد).'
          : 'يرجى اختيار صورة عمل صالحة.'
      );
      return;
    }
    if (isBeforeAfter && (!cleanBeforeUrl || !isSafeMediaUrl(cleanBeforeUrl))) {
      setFormError('يرجى اختيار صورة "قبل" صالحة لإتمام عرض قبل وبعد.');
      return;
    }

    if (!editingItem) {
      const rate = checkActionRateLimit(`gallery_create_${currentUser.uid}`, {
        cooldownMs: 8000,
        maxInWindow: 6,
        windowMs: 300000,
      });
      if (!rate.allowed) {
        setFormError(rate.message || 'يرجى الانتظار قليلاً قبل نشر عمل جديد.');
        return;
      }
    }

    setSubmitting(true);
    setFormError(null);
    try {
      if (editingItem) {
        const ref = doc(db, 'gallery', editingItem.id);
        await updateDoc(ref, {
          title: cleanTitle,
          description: cleanDesc,
          category: itemCategory,
          imageUrl: cleanImageUrl,
          isBeforeAfter,
          beforeImageUrl: isBeforeAfter ? cleanBeforeUrl : '',
          updatedAt: serverTimestamp(),
        });
      } else {
        const newId = createSafeId('gal');
        const ref = doc(db, 'gallery', newId);
        await setDoc(ref, {
          id: newId,
          barberId: currentUser.uid,
          barberName: sanitizePlainText(currentUser.displayName, MAX_TEXT_LENGTHS.displayName) || currentUser.displayName,
          barberPhoto: currentUser.photoURL || '',
          title: cleanTitle,
          description: cleanDesc,
          category: itemCategory,
          imageUrl: cleanImageUrl,
          isBeforeAfter,
          beforeImageUrl: isBeforeAfter ? cleanBeforeUrl : '',
          countryCode: activeCountryCode,
          visibility: 'public',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      setModalOpen(false);
    } catch (err) {
      handleFirestoreError(
        err,
        editingItem ? OperationType.UPDATE : OperationType.CREATE,
        'gallery'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (item: GalleryItem) => {
    try {
      await deleteDoc(doc(db, 'gallery', item.id));
      setConfirmDeleteItem(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `gallery/${item.id}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Compact Top Bar with Prominent 'إضافة عمل للمعرض' CTA */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#141419] border border-[#27272F] rounded-2xl px-4 py-3">
        <div className="flex items-center gap-2.5 flex-wrap min-w-0">
          <h1 className="text-lg sm:text-xl font-extrabold text-[#F5F2EB] whitespace-nowrap">
            معرض الأعمال
          </h1>
          <span aria-hidden="true" className="text-[#454552]">·</span>
          <CountryFlag code={activeCountryCode} showName size="xs" />
          <span aria-hidden="true" className="text-[#454552]">·</span>
          <span className="text-xs text-[#9C968B] font-mono-num whitespace-nowrap">
            {countryGallery.length} عمل منشور
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canPublish && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] font-bold text-xs transition-colors cursor-pointer whitespace-nowrap shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة عمل للمعرض</span>
            </button>
          )}

          {!isSuperAdmin && !currentUserIsBarber && (
            <>
              {myLatestRequest?.status === 'pending' ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-300 text-xs font-semibold whitespace-nowrap">
                  <Clock className="w-3.5 h-3.5" />
                  <span>طلب التوثيق قيد المراجعة</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setVerifyModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1C1C24] hover:bg-[#262632] border border-[#D4A853]/45 text-[#D4A853] font-bold text-xs transition-colors cursor-pointer whitespace-nowrap"
                >
                  <BadgeCheck className="w-3.5 h-3.5" />
                  <span>
                    {myLatestRequest?.status === 'rejected'
                      ? 'إعادة طلب التوثيق'
                      : 'طلب توثيق كحلاق'}
                  </span>
                </button>
              )}
            </>
          )}
        </div>
        </div>

      {verifySuccessMsg && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{verifySuccessMsg}</span>
        </div>
      )}

      {/* Filter, Search, and Compact Collapsible Verified Barbers Dropdown */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-[#141419] border border-[#27272F] rounded-xl overflow-x-auto">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => setCategory(cat.key)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                category === cat.key
                  ? 'bg-[#D4A853] text-[#0B0B0E]'
                  : 'text-[#A6A196] hover:text-[#F5F2EB]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Collapsible Verified Barbers Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setBarbersDropdownOpen((v) => !v)}
              className={`w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl border text-xs font-bold inline-flex items-center justify-between gap-2.5 transition-colors whitespace-nowrap cursor-pointer ${
                barbersDropdownOpen
                  ? 'bg-[#D4A853] text-[#0B0B0E] border-[#D4A853]'
                  : 'bg-[#141419] hover:bg-[#1B1B23] text-[#F5F2EB] border-[#27272F]'
              }`}
            >
              <span className="inline-flex items-center gap-2 min-w-0">
                <Scissors className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">الحلاقون الموثقون</span>
                <span className="font-mono-num shrink-0">({verifiedBarbers.length})</span>
              </span>
              {barbersDropdownOpen ? (
                <ChevronUp className="w-4 h-4 shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 shrink-0" />
              )}
            </button>

            {barbersDropdownOpen && (
              <div className="absolute right-0 left-0 sm:left-auto sm:w-96 mt-2 bg-[#14141A] border border-[#2D2D38] rounded-2xl shadow-2xl z-30 overflow-hidden">
                <div className="px-4 py-3 border-b border-[#22222A] space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#F5F2EB]">
                      قائمة الحلاقين الموثقين
                    </span>
                    <span className="text-xs font-mono-num font-bold text-[#D4A853]">
                      {displayedVerifiedBarbers.length}
                    </span>
                  </div>

                  {verifiedBarbers.length > 0 && (
                    <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#0E0E13] border border-[#22222A]">
                      <button
                        type="button"
                        onClick={() => setBarbersScope('all')}
                        className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer truncate ${
                          barbersScope === 'all'
                            ? 'bg-[#D4A853] text-[#0B0B0E]'
                            : 'text-[#A6A196] hover:text-[#F5F2EB]'
                        }`}
                      >
                        الكل ({verifiedBarbers.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setBarbersScope('country')}
                        className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer truncate ${
                          barbersScope === 'country'
                            ? 'bg-[#D4A853] text-[#0B0B0E]'
                            : 'text-[#A6A196] hover:text-[#F5F2EB]'
                        }`}
                      >
                        {activeCountryMeta?.nameAr || 'البلد الحالي'} ({localVerifiedBarbers.length})
                      </button>
                    </div>
                  )}
                </div>

                {displayedVerifiedBarbers.length === 0 ? (
                  <div className="p-5 text-center space-y-2">
                    <p className="text-xs text-[#8B857B] leading-relaxed">
                      {barbersScope === 'country' && verifiedBarbers.length > 0
                        ? `لا يوجد حلاقون موثقون في ${activeCountryMeta?.nameAr || 'هذا البلد'} حالياً.`
                        : 'لا يوجد حلاقون موثقون حالياً.'}
                    </p>
                    {barbersScope === 'country' && verifiedBarbers.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setBarbersScope('all')}
                        className="px-3 py-1.5 rounded-lg bg-[#1D1D26] hover:bg-[#272734] text-[11px] font-bold text-[#D4A853] cursor-pointer"
                      >
                        عرض جميع الحلاقين ({verifiedBarbers.length})
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="max-h-80 overflow-y-auto divide-y divide-[#22222A]">
                    {displayedVerifiedBarbers.map((barber) => {
                      const stats = getBarberRating(barber.uid);
                      const liveMeta = getEffectiveLiveStatus(barber);
                      const barberRoles = getUserRoles(barber);
                      const barberRankRole =
                        barberRoles.find((r) => isAnyBarberRole(r)) || barberRoles[0];
                      const barberCountry =
                        normalizeCountryCode(barber.countryCode) || activeCountryCode;
                      return (
                        <div
                          key={barber.uid}
                          className="p-3 flex items-center justify-between gap-2.5 hover:bg-[#1A1A22] transition-colors"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setBarbersDropdownOpen(false);
                              onOpenProfile(barber.uid);
                            }}
                            className="flex-1 flex items-center gap-2.5 min-w-0 text-right cursor-pointer"
                          >
                            <Avatar
                              src={barber.photoURL}
                              name={barber.displayName}
                              size="sm"
                              role={barberRankRole}
                              roles={barberRoles}
                              avatarFrame={barber.avatarFrame}
                              avatarFrameExpiresAt={barber.avatarFrameExpiresAt}
                            />
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className={`text-xs font-bold truncate ${getEffectiveNameColorClass(
                                    barber,
                                    barberRankRole
                                  )}`}
                                >
                                  {barber.displayName}
                                </span>
                                <VipSilverStar roles={barberRoles} size="xs" />
                                <CountryFlag code={barberCountry} size="xs" />
                              </div>

                              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                <RoleTag role={barberRankRole} size="xs" compact />
                                {barber.salonName && (
                                  <span className="text-[11px] text-[#9C968B] truncate max-w-[130px]">
                                    · {barber.salonName}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 text-[11px] leading-none">
                                <span className={`font-semibold whitespace-nowrap ${liveMeta.textClass}`}>
                                  {liveMeta.label}
                                </span>
                                <span aria-hidden="true" className="text-[#565666]">
                                  ·
                                </span>
                                <span className="inline-flex items-center gap-0.5 text-[#D4A853] font-mono-num whitespace-nowrap">
                                  <Star className="w-3 h-3 fill-[#D4A853]" />
                                  {stats.count > 0 ? stats.avg.toFixed(1) : 'جديد'}
                                </span>
                              </div>
                            </div>
                          </button>

                          {barber.uid !== currentUser.uid ? (
                            <button
                              type="button"
                              onClick={() => {
                                setBarbersDropdownOpen(false);
                                onBookBarber(barber);
                              }}
                              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#D4A853]/15 hover:bg-[#D4A853] text-[#D4A853] hover:text-[#0B0B0E] text-[11px] font-bold inline-flex items-center gap-1 shrink-0 transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <CalendarClock className="w-3.5 h-3.5" />
                              <span>حجز</span>
                            </button>
                          ) : (
                            <span className="text-[11px] font-semibold text-[#D4A853] shrink-0 px-1.5 whitespace-nowrap">
                              حسابك
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-[#8B857B] absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث عن قصة أو اسم حلاق..."
              className="w-full min-h-[44px] bg-[#141419] border border-[#27272F] focus:border-[#D4A853] rounded-xl py-2.5 pr-10 pl-3.5 text-xs text-[#F5F2EB] placeholder:text-[#6B665E] outline-none"
            />
          </div>
        </div>
      </div>

      {/* Temporary Demo Banner (auto-hidden once real works are published) */}
      {showingDemoFallback && (
        <div className="bg-[#16161F] border border-[#D4A853]/35 rounded-2xl p-3.5 sm:px-4 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
            <ImageIcon className="w-4 h-4 text-[#D4A853] shrink-0 mt-0.5 sm:mt-0" />
            <p className="text-xs text-[#DFD9CD] leading-relaxed">
              <strong className="text-[#F5D67B]">نماذج تجريبية مؤقتة:</strong>{' '}
              تُعرض هذه الأعمال لتوضيح شكل المعرض حتى ينشر الحلاقون الموثقون أعمالهم الحقيقية.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleToggleDemoSamples(true)}
            className="w-full sm:w-auto min-h-[40px] px-3.5 py-2 rounded-xl bg-[#1F1F2B] hover:bg-[#2A2A38] border border-[#323242] text-xs font-bold text-[#C8C2B8] cursor-pointer whitespace-nowrap shrink-0 text-center"
          >
            إخفاء النماذج التجريبية
          </button>
        </div>
      )}

      {/* Gallery Grid */}
      {filteredGallery.length === 0 ? (
        <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-[#1D1D25] border border-[#2C2C36] flex items-center justify-center mx-auto text-[#D4A853]">
            <ImageIcon className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-[#F5F2EB]">
            لا توجد أعمال في معرض {activeCountryMeta?.nameAr || 'هذا البلد'} حالياً
          </h3>
          <p className="text-xs text-[#9C968B] max-w-sm mx-auto">
            {canPublish
              ? 'كن أول من يشارك أعماله! اضغط على "إضافة عمل للمعرض" لرفع أول صورة.'
              : 'سيظهر هنا أحدث أعمال الحلاقين الموثقين فور نشرها.'}
          </p>
          {countryGallery.length === 0 && hideDemoSamples && (
            <button
              type="button"
              onClick={() => handleToggleDemoSamples(false)}
              className="mt-2 px-4 py-2 rounded-xl bg-[#1C1C26] hover:bg-[#252534] border border-[#D4A853]/35 text-xs font-bold text-[#D4A853] cursor-pointer"
            >
              إظهار النماذج التجريبية التوضيحية
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredGallery.map((item) => {
            const isDemo = item.id.startsWith('demo_');
            const canManage = !isDemo && (isSuperAdmin || item.barberId === currentUser.uid);
            const catLabel =
              CATEGORIES.find((c) => c.key === item.category)?.label || item.category;
            const hasBeforeAfter = Boolean(item.isBeforeAfter && item.beforeImageUrl);
            const itemLike = isDemo ? { count: 0, likedByMe: false } : getItemLikes(item.id);

            return (
              <article
                key={item.id}
                className="bg-[#141419] border border-[#27272F] rounded-2xl overflow-hidden flex flex-col justify-between group"
              >
                {hasBeforeAfter && item.beforeImageUrl ? (
                  <div className="relative">
                    <BeforeAfterCompare
                      beforeUrl={item.beforeImageUrl}
                      afterUrl={item.imageUrl}
                      title={item.title}
                    />
                    <button
                      type="button"
                      onClick={() => setLightboxItem(item)}
                      className="px-4 pt-3 pb-1 w-full text-right cursor-pointer"
                    >
                      <div className="text-[11px] font-medium text-[#D4A853]">
                        {catLabel} · مقارنة قبل وبعد
                      </div>
                      <h3 className="text-base font-bold text-white leading-snug hover:text-[#D4A853] transition-colors">
                        {item.title}
                      </h3>
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => setLightboxItem(item)}
                    className="relative aspect-[4/3] bg-[#1A1A22] overflow-hidden cursor-pointer"
                  >
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
                    <div className="absolute bottom-3 right-3 left-3 flex items-end justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-[11px] font-semibold text-[#D4A853] truncate">
                          {isDemo ? `${catLabel} · نموذج توضيحي` : catLabel}
                        </div>
                        <h3 className="text-sm sm:text-base font-bold text-white leading-snug line-clamp-2">
                          {item.title}
                        </h3>
                      </div>
                    </div>
                  </div>
                )}

                <div className="p-4 space-y-3">
                  {item.description && (
                    <p className="text-xs text-[#A6A196] line-clamp-2 leading-relaxed">
                      {item.description}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2.5 border-t border-[#22222A]">
                    {isDemo ? (
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="w-7 h-7 rounded-full bg-[#D4A853]/15 border border-[#D4A853]/40 text-[#D4A853] flex items-center justify-center shrink-0">
                          <Scissors className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-semibold text-[#C8C2B8] truncate">
                          {item.barberName}
                        </span>
                      </div>
                    ) : (() => {
                      const authorProfile = users.find((u) => u.uid === item.barberId);
                      const authorRoles: UserRole[] = authorProfile
                        ? getUserRoles(authorProfile)
                        : ['vip_barber'];
                      const authorPrimary =
                        authorRoles.find((r) => isAnyBarberRole(r)) || authorRoles[0];
                      return (
                        <button
                          type="button"
                          onClick={() => onOpenProfile(item.barberId)}
                          className="flex-1 flex items-center gap-2 min-w-0 hover:opacity-90 cursor-pointer text-right"
                        >
                          <Avatar
                            src={authorProfile?.photoURL || item.barberPhoto}
                            name={authorProfile?.displayName || item.barberName}
                            size="xs"
                            role={authorPrimary}
                            roles={authorRoles}
                            avatarFrame={authorProfile?.avatarFrame}
                            avatarFrameExpiresAt={authorProfile?.avatarFrameExpiresAt}
                          />
                          <span
                            className={`text-xs font-semibold truncate hover:underline ${getEffectiveNameColorClass(
                              authorProfile,
                              authorPrimary
                            )}`}
                          >
                            {authorProfile?.displayName || item.barberName}
                          </span>
                          <CountryFlag
                            code={
                              authorProfile?.countryCode ||
                              item.countryCode ||
                              activeCountryCode
                            }
                            size="xs"
                          />
                          <VipSilverStar roles={authorRoles} size="xs" />
                          <RoleTag role={authorPrimary} size="xs" compact />
                        </button>
                      );
                    })()}

                    {isDemo ? (
                      <button
                        type="button"
                        onClick={() => setLightboxItem(item)}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#1A1A24] hover:bg-[#242432] text-[11px] font-bold text-[#D4A853] cursor-pointer shrink-0 whitespace-nowrap"
                      >
                        معاينة
                      </button>
                    ) : (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => onToggleLike('gallery', item.id)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                            itemLike.likedByMe
                              ? 'bg-rose-500/15 text-rose-400'
                              : 'bg-[#1A1A22] text-[#A6A196] hover:text-rose-400'
                          }`}
                        >
                          <Heart
                            className={`w-3.5 h-3.5 ${
                              itemLike.likedByMe ? 'fill-rose-400' : ''
                            }`}
                          />
                          <span className="font-mono-num">{itemLike.count}</span>
                        </button>

                        {item.barberId !== currentUser.uid && onOpenReport && (
                          <button
                            type="button"
                            onClick={() =>
                              onOpenReport({
                                targetType: 'gallery',
                                targetId: item.id,
                                targetOwnerId: item.barberId,
                                targetOwnerName: item.barberName,
                                targetPreview: item.title,
                              })
                            }
                            title="إبلاغ عن العمل"
                            className="p-2 rounded-lg text-[#A6A196] hover:text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer"
                          >
                            <Flag className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {item.barberId !== currentUser.uid && onBlockUser && (
                          <button
                            type="button"
                            onClick={() =>
                              onBlockUser(item.barberId, item.barberName, item.barberPhoto)
                            }
                            title="حظر الناشر"
                            className="p-2 rounded-lg text-[#A6A196] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {canManage && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditModal(item)}
                              title="تعديل"
                              className="p-2 rounded-lg text-[#A6A196] hover:text-[#D4A853] hover:bg-[#1E1E26] transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteItem(item)}
                              title="حذف"
                              className="p-2 rounded-lg text-[#A6A196] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Upload / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-[#141419] border border-[#2C2C35] rounded-2xl p-6 space-y-5 shadow-2xl my-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#F5F2EB] flex items-center gap-2">
                <Scissors className="w-4 h-4 text-[#D4A853]" />
                <span>{editingItem ? 'تعديل العمل' : 'نشر عمل جديد في المعرض'}</span>
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-[#9C968B] hover:text-[#F5F2EB] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                {formError}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              {/* Toggle Regular vs Before & After */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#1A1A22] border border-[#2C2C35]">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#F5F2EB]">
                  <Columns2 className="w-4 h-4 text-[#D4A853]" />
                  <span>عمل بميزة «قبل وبعد»</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsBeforeAfter((v) => !v)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                    isBeforeAfter
                      ? 'bg-[#D4A853] text-[#0B0B0E]'
                      : 'bg-[#252530] text-[#9C968B]'
                  }`}
                >
                  {isBeforeAfter ? 'مفعّلة' : 'صورة واحدة'}
                </button>
              </div>

              <div className={`grid gap-3 ${isBeforeAfter ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                {isBeforeAfter && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-[#C8C2B8]">صورة «قبل»</label>
                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-[#2C2C36] hover:border-[#D4A853] rounded-xl p-3 cursor-pointer transition-colors bg-[#1A1A22] min-h-[136px]">
                      {beforeImageUrl ? (
                        <img
                          src={beforeImageUrl}
                          alt="معاينة قبل"
                          className="w-full h-32 object-cover rounded-lg"
                        />
                      ) : (
                        <div className="text-center space-y-1 py-3">
                          <Upload className="w-5 h-5 text-[#D4A853] mx-auto" />
                          <div className="text-xs font-semibold text-[#F5F2EB]">
                            اختر صورة قبل
                          </div>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleFileChange(e, 'before')}
                        className="hidden"
                            />
                    </label>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#C8C2B8]">
                    {isBeforeAfter ? 'صورة النتيجة «بعد»' : 'صورة العمل'}
                  </label>
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-[#2C2C36] hover:border-[#D4A853] rounded-xl p-3 cursor-pointer transition-colors bg-[#1A1A22] min-h-[136px]">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt="معاينة النتيجة"
                        className="w-full h-32 object-cover rounded-lg"
                      />
                    ) : (
                      <div className="text-center space-y-1 py-3">
                        <Upload className="w-5 h-5 text-[#D4A853] mx-auto" />
                        <div className="text-xs font-semibold text-[#F5F2EB]">
                          {isBeforeAfter ? 'اختر صورة بعد' : 'اضغط لاختيار صورة من جهازك'}
                        </div>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileChange(e, 'after')}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#C8C2B8]">عنوان القصة / العمل</label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="مثال: تدرج كلاسيكي مع تحديد"
                    className="w-full bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F2EB] outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#C8C2B8]">التصنيف</label>
                  <select
                    value={itemCategory}
                    onChange={(e) => setItemCategory(e.target.value as GalleryCategory)}
                    className="w-full bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F2EB] outline-none"
                  >
                    {CATEGORIES.filter((c) => c.key !== 'all').map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#C8C2B8]">وصف تفصيلي (اختياري)</label>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="تفاصيل القصة والأدوات المستخدمة..."
                  className="w-full bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F2EB] outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-[#1C1C24] text-xs font-semibold text-[#A6A196] hover:text-[#F5F2EB] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-bold cursor-pointer disabled:opacity-60"
                >
                  {submitting ? 'جاري الحفظ...' : editingItem ? 'حفظ التعديلات' : 'نشر في المعرض'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reusable Verification Request Modal */}
      <VerificationRequestModal
        open={verifyModalOpen}
        currentUser={currentUser}
        users={users}
        activeCountryCode={activeCountryCode}
        onClose={() => setVerifyModalOpen(false)}
        onSuccess={() =>
          setVerifySuccessMsg('تم إرسال طلب التوثيق إلى المؤسس والإدارة بنجاح.')
        }
      />

      {/* Lightbox Modal */}
      {lightboxItem && (
        <div
          onClick={() => setLightboxItem(null)}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl bg-[#141419] border border-[#2C2C35] rounded-2xl overflow-hidden shadow-2xl"
          >
            <div className="relative bg-black">
              {lightboxItem.isBeforeAfter && lightboxItem.beforeImageUrl ? (
                <BeforeAfterCompare
                  beforeUrl={lightboxItem.beforeImageUrl}
                  afterUrl={lightboxItem.imageUrl}
                  title={lightboxItem.title}
                  aspectClass="aspect-[16/10]"
                />
              ) : (
                <img
                  src={lightboxItem.imageUrl}
                  alt={lightboxItem.title}
                  referrerPolicy="no-referrer"
                  className="w-full max-h-[68vh] object-contain mx-auto"
                />
              )}
              <button
                type="button"
                onClick={() => setLightboxItem(null)}
                className="absolute top-3 left-3 z-30 p-2 rounded-full bg-black/70 text-white hover:bg-black cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-[#F5F2EB]">{lightboxItem.title}</h3>
                {lightboxItem.description && (
                  <p className="text-xs text-[#A6A196]">{lightboxItem.description}</p>
                )}
              </div>
              {!lightboxItem.id.startsWith('demo_') && (
                <div className="flex items-center gap-2.5 shrink-0">
                  {(() => {
                    const likeInfo = getItemLikes(lightboxItem.id);
                    return (
                      <button
                        type="button"
                        onClick={() => onToggleLike('gallery', lightboxItem.id)}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold cursor-pointer ${
                          likeInfo.likedByMe
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                            : 'bg-[#1D1D25] text-[#F5F2EB] border border-[#2E2E3A]'
                        }`}
                      >
                        <Heart
                          className={`w-4 h-4 ${likeInfo.likedByMe ? 'fill-rose-400' : ''}`}
                        />
                        <span className="font-mono-num">{likeInfo.count}</span>
                      </button>
                    );
                  })()}
                  {(() => {
                    const lightboxAuthor = users.find((u) => u.uid === lightboxItem.barberId);
                    const lightboxRoles: UserRole[] = lightboxAuthor
                      ? getUserRoles(lightboxAuthor)
                      : ['vip_barber'];
                    const lightboxPrimary = lightboxRoles[0];
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          const id = lightboxItem.barberId;
                          setLightboxItem(null);
                          onOpenProfile(id);
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#D4A853] text-[#0B0B0E] text-xs font-bold shrink-0 cursor-pointer"
                      >
                        <Avatar
                          src={lightboxAuthor?.photoURL || lightboxItem.barberPhoto}
                          name={lightboxAuthor?.displayName || lightboxItem.barberName}
                          size="xs"
                          role={lightboxPrimary}
                          roles={lightboxRoles}
                          avatarFrame={lightboxAuthor?.avatarFrame}
                          avatarFrameExpiresAt={lightboxAuthor?.avatarFrameExpiresAt}
                        />
                        <span>ملف الحلاق: {lightboxAuthor?.displayName || lightboxItem.barberName}</span>
                        <CountryFlag
                          code={
                            lightboxAuthor?.countryCode ||
                            lightboxItem.countryCode ||
                            activeCountryCode
                          }
                          size="xs"
                        />
                        <VipSilverStar roles={lightboxRoles} size="xs" />
                      </button>
                    );
                  })()}
                  {lightboxItem.barberId !== currentUser.uid && onOpenReport && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = lightboxItem;
                        setLightboxItem(null);
                        onOpenReport({
                          targetType: 'gallery',
                          targetId: target.id,
                          targetOwnerId: target.barberId,
                          targetOwnerName: target.barberName,
                          targetPreview: target.title,
                        });
                      }}
                      title="إبلاغ عن العمل"
                      className="p-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 cursor-pointer"
                    >
                      <Flag className="w-4 h-4" />
                    </button>
                  )}
                  {lightboxItem.barberId !== currentUser.uid && onBlockUser && (
                    <button
                      type="button"
                      onClick={async () => {
                        const target = lightboxItem;
                        setLightboxItem(null);
                        await onBlockUser(target.barberId, target.barberName, target.barberPhoto);
                      }}
                      title="حظر الناشر"
                      className="p-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/35 text-red-300 cursor-pointer"
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      <ConfirmModal
        open={Boolean(confirmDeleteItem)}
        title="هل أنت متأكد من الحذف؟"
        message={
          confirmDeleteItem
            ? `سيتم حذف "${confirmDeleteItem.title}" من معرض الأعمال نهائياً ولا يمكن التراجع عن ذلك.`
            : ''
        }
        confirmLabel="نعم، حذف الصورة"
        onCancel={() => setConfirmDeleteItem(null)}
        onConfirm={() => {
          if (confirmDeleteItem) {
            return handleDelete(confirmDeleteItem);
          }
        }}
      />
    </div>
  );
};
                        
