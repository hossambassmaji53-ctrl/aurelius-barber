import React, { useMemo, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Clock,
  Globe,
  MapPin,
  Scissors,
  Send,
  Shield,
  Sparkles,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { createSafeId, db, handleFirestoreError, OperationType } from '../firebase';
import { AppView, UserProfile, VerificationRequest } from '../types';
import { formatFullDateTime, formatMessageTime, useNowTick } from '../utils/time';
import { COUNTRIES, getCountryByCode } from '../utils/countries';
import { CountryFlag } from './CountryPickerModal';
import { isBarberMember } from './Avatar';

interface JoinTeamViewProps {
  currentUser: UserProfile;
  isSuperAdmin: boolean;
  users: UserProfile[];
  verificationRequests: VerificationRequest[];
  activeCountryCode: string;
  onOpenOwnProfile: () => void;
  onNavigateView: (view: AppView) => void;
}

export const JoinTeamView: React.FC<JoinTeamViewProps> = ({
  currentUser,
  isSuperAdmin,
  users,
  verificationRequests,
  activeCountryCode,
  onOpenOwnProfile,
  onNavigateView,
}) => {
  const nowTick = useNowTick(30000);
  const [applicantName, setApplicantName] = useState(currentUser.displayName || '');
  const [countryCode, setCountryCode] = useState(activeCountryCode || currentUser.countryCode || 'LB');
  const [city, setCity] = useState('');
  const [salonName, setSalonName] = useState(currentUser.salonName || '');
  const [experience, setExperience] = useState('');
  const [phoneOrSocial, setPhoneOrSocial] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedJustNow, setSubmittedJustNow] = useState(false);

  const isAlreadyBarber = isBarberMember(currentUser);

  const myRequests = useMemo(() => {
    return verificationRequests.filter((r) => r.userId === currentUser.uid);
  }, [verificationRequests, currentUser.uid]);

  const latestRequest = myRequests[0] || null;
  const hasPendingRequest = latestRequest?.status === 'pending';

  const pendingTotalForAdmin = useMemo(() => {
    if (!isSuperAdmin) return 0;
    return verificationRequests.filter((r) => r.status === 'pending').length;
  }, [isSuperAdmin, verificationRequests]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasPendingRequest || isAlreadyBarber || isSuperAdmin) return;

    const cleanName = applicantName.trim() || currentUser.displayName;
    const cleanCity = city.trim();
    const cleanSalon = salonName.trim();
    const cleanExp = experience.trim();
    const cleanContact = phoneOrSocial.trim();

    if (!cleanName || !cleanSalon || !cleanExp || !cleanCity) {
      setError('يرجى إدخال الاسم، البلد والمدينة، اسم الصالون، وتفاصيل خبرتك لإرسال الطلب.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSubmittedJustNow(false);

    try {
      const reqId = createSafeId('vreq');
      const selectedCountryMeta = getCountryByCode(countryCode);
      await setDoc(doc(db, 'verificationRequests', reqId), {
        id: reqId,
        userId: currentUser.uid,
        userName: cleanName.slice(0, 80),
        userPhoto: currentUser.photoURL || '',
        salonName: cleanSalon.slice(0, 100),
        countryCode,
        city: cleanCity.slice(0, 80),
        experience: cleanExp.slice(0, 400),
        phoneOrSocial: cleanContact.slice(0, 120),
        status: 'pending',
        adminNote: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const adminProfile = users.find((u) => u.role === 'admin');
      if (adminProfile) {
        const notifId = createSafeId('ntf');
        await setDoc(doc(db, 'notifications', notifId), {
          id: notifId,
          recipientId: adminProfile.uid,
          senderId: currentUser.uid,
          senderName: cleanName.slice(0, 80),
          type: 'verification_request',
          title: `طلب شراكة وانضمام جديد من ${cleanName.slice(0, 50)}`,
          body: `${selectedCountryMeta?.flag || ''} ${selectedCountryMeta?.nameAr || countryCode} - ${cleanCity} · الصالون: ${cleanSalon.slice(0, 60)}`,
          targetView: 'admin',
          targetId: reqId,
          read: false,
          createdAt: serverTimestamp(),
        });
      }

      setExperience('');
      setCity('');
      setPhoneOrSocial('');
      setSubmittedJustNow(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'verificationRequests');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Banner */}
      <section className="bg-[#141419] border border-[#27272F] rounded-3xl p-6 sm:p-8 space-y-4">
        <div className="inline-flex items-center gap-2 text-xs font-bold text-[#D4A853]">
          <UserPlus className="w-4 h-4" />
          <span>طلبات الشراكة والانضمام · Join the Team</span>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F5F2EB] tracking-tight">
              انضم إلى نخبة حلاقي أوريليوس الموثوقين
            </h1>
            <p className="text-xs sm:text-sm text-[#A6A196] leading-relaxed">
              هل تمتلك صالوناً أو خبرة احترافية في عالم الحلاقة؟ قدّم طلب الشراكة والانضمام
              ليصل مباشرة لإدارة المنصة وتصبح جزءاً من فريق الحلاقين الموثوقين في أوريليوس
              باربر.
            </p>
          </div>
        </div>

        {/* Concise Partner Benefits */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="bg-[#191921] border border-[#262632] rounded-2xl p-4 space-y-1.5">
            <BadgeCheck className="w-5 h-5 text-emerald-400" />
            <div className="text-xs font-bold text-[#F5F2EB]">شارة التوثيق الرسمية</div>
            <p className="text-[11px] text-[#9C968B] leading-relaxed">
              ظهور موثق باسمك وصالونك أمام جميع أعضاء وزوار المنصة.
            </p>
          </div>
          <div className="bg-[#191921] border border-[#262632] rounded-2xl p-4 space-y-1.5">
            <CalendarClock className="w-5 h-5 text-[#D4A853]" />
            <div className="text-xs font-bold text-[#F5F2EB]">استقبال الحجوزات والمواعيد</div>
            <p className="text-[11px] text-[#9C968B] leading-relaxed">
              تنظيم مواعيد زبائنك وعرض خدماتك وأسعارك في ملفك الشخصي.
            </p>
          </div>
          <div className="bg-[#191921] border border-[#262632] rounded-2xl p-4 space-y-1.5">
            <MapPin className="w-5 h-5 text-sky-400" />
            <div className="text-xs font-bold text-[#F5F2EB]">الظهور على خريطة الحلاقين</div>
            <p className="text-[11px] text-[#9C968B] leading-relaxed">
              تثبيت موقع صالونك على الخريطة التفاعلية ليسهل الوصول إليك.
            </p>
          </div>
        </div>
      </section>

      {/* Role-Aware Body */}
      {isSuperAdmin ? (
        <section className="bg-[#141419] border border-[#D4A853]/35 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-bold text-[#D4A853]">
              <Shield className="w-4 h-4" />
              <span>إدارة طلبات الشراكة والانضمام</span>
            </div>
            <p className="text-xs sm:text-sm text-[#B6B0A4]">
              يوجد حالياً{' '}
              <span className="font-mono-num font-bold text-[#F5F2EB]">
                {pendingTotalForAdmin}
              </span>{' '}
              طلب انضمام بانتظار المراجعة والقرار في لوحة الإدارة.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateView('admin')}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <Shield className="w-4 h-4" />
            <span>مراجعة الطلبات في الإدارة</span>
          </button>
        </section>
      ) : isAlreadyBarber ? (
        <section className="bg-[#141419] border border-emerald-500/35 rounded-3xl p-6 sm:p-8 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base sm:text-lg font-bold text-[#F5F2EB]">
                أنت بالفعل ضمن فريق الحلاقين الموثوقين
              </h2>
              <p className="text-xs sm:text-sm text-[#A6A196] leading-relaxed">
                حسابك موثق ويمكنك تعديل خدماتك وأسعارك وموقع الصالون من ملفك الشخصي، بالإضافة
                لاستقبال حجوزات المواعيد مباشرة.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={onOpenOwnProfile}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Scissors className="w-4 h-4" />
              <span>إدارة خدماتي وصالوني</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateView('appointments')}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#1A1A22] hover:bg-[#23232E] border border-[#2C2C38] text-[#F5F2EB] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <CalendarClock className="w-4 h-4 text-[#D4A853]" />
              <span>عرض المواعيد</span>
            </button>
          </div>
        </section>
      ) : (
            <div className="space-y-6">
          {/* Existing Request Status Card */}
          {latestRequest && (
            <section
              className={`rounded-3xl border p-5 sm:p-6 space-y-3 ${
                latestRequest.status === 'pending'
                  ? 'bg-amber-500/[0.08] border-amber-500/35'
                  : latestRequest.status === 'approved'
                    ? 'bg-emerald-500/[0.08] border-emerald-500/35'
                    : 'bg-red-500/[0.08] border-red-500/35'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-bold text-[#F5F2EB]">
                  {latestRequest.status === 'pending' ? (
                    <Clock className="w-4 h-4 text-amber-400" />
                  ) : latestRequest.status === 'approved' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400" />
                  )}
                  <span>
                    {latestRequest.status === 'pending'
                      ? 'طلب الانضمام الخاص بك قيد المراجعة'
                      : latestRequest.status === 'approved'
                        ? 'تمت الموافقة على طلبك'
                        : 'تم رفض طلبك السابق'}
                  </span>
                </div>

                {latestRequest.createdAt && (
                  <span
                    title={formatFullDateTime(latestRequest.createdAt)}
                    className="text-[11px] font-mono-num text-[#B6B0A4]"
                  >
                    {formatMessageTime(latestRequest.createdAt, nowTick)}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-[#111116]/70 border border-white/10 rounded-2xl p-4">
                <div>
                  <span className="text-[#9C968B]">الاسم: </span>
                  <span className="font-bold text-[#F5F2EB]">{latestRequest.userName}</span>
                </div>
                <div>
                  <span className="text-[#9C968B]">اسم الصالون: </span>
                  <span className="font-bold text-[#F5F2EB]">{latestRequest.salonName}</span>
                </div>
                {(latestRequest.countryCode || latestRequest.city) && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[#9C968B]">الموقع: </span>
                    {latestRequest.countryCode && (
                      <CountryFlag code={latestRequest.countryCode} showName size="xs" className="text-[#F5F2EB] font-semibold" />
                    )}
                    {latestRequest.city && (
                      <span className="text-[#D4A853] font-semibold">· {latestRequest.city}</span>
                    )}
                  </div>
                )}
                {latestRequest.phoneOrSocial && (
                  <div>
                    <span className="text-[#9C968B]">وسيلة التواصل: </span>
                    <span className="font-semibold text-[#F5F2EB]">
                      {latestRequest.phoneOrSocial}
                    </span>
                  </div>
                )}
                <div className="sm:col-span-2 text-[#D6D1C7] leading-relaxed">
                  <span className="text-[#9C968B]">الخبرة والتفاصيل: </span>
                  {latestRequest.experience}
                </div>
                {latestRequest.adminNote && latestRequest.status !== 'pending' && (
                  <div className="sm:col-span-2 pt-2 border-t border-white/10 text-[#F5D67B]">
                    ملاحظة الإدارة: {latestRequest.adminNote}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Submit Form (shown if no pending request) */}
          {!hasPendingRequest && (
            <section className="bg-[#141419] border border-[#27272F] rounded-3xl p-6 sm:p-8 space-y-5">
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-[#F5F2EB] flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#D4A853]" />
                  <span>
                    {latestRequest?.status === 'rejected'
                      ? 'إعادة تقديم طلب الانضمام'
                      : 'نموذج طلب الشراكة والانضمام'}
                  </span>
                </h2>
                <p className="text-xs text-[#9C968B]">
                  أكمل بياناتك المهنية ليتم إرسال طلبك مباشرة إلى إدارة أوريليوس باربر للمراجعة
                  والتوثيق.
                </p>
              </div>

              {submittedJustNow && (
                <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/35 text-xs text-emerald-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    تم إرسال طلبك بنجاح إلى إدارة المنصة! سيصلك إشعار فور اتخاذ القرار.
                  </span>
                </div>
              )}

              {error && (
                <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[#C8C2B8]">
                      الاسم الكامل *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={applicantName}
                      onChange={(e) => setApplicantName(e.target.value)}
                      placeholder="اسمك المهني أو الشخصي"
                      className="w-full min-h-[44px] bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[#F5F2EB] outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[#C8C2B8]">
                      اسم الصالون أو العلامة التجارية *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={100}
                      value={salonName}
                      onChange={(e) => setSalonName(e.target.value)}
                      placeholder="مثال: صالون النخبة للحلاقة"
                      className="w-full min-h-[44px] bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[#F5F2EB] outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-[#C8C2B8]">
                      <Globe className="w-3.5 h-3.5 text-[#D4A853]" />
                      <span>البلد *</span>
                    </label>
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className="w-full min-h-[44px] bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[#F5F2EB] outline-none"
                    >
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.flag} {c.nameAr}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[#C8C2B8]">
                      المدينة / المنطقة *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="مثال: بيروت / الرياض / برلين"
                      className="w-full min-h-[44px] bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[#F5F2EB] outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-[#C8C2B8]">
                      وسيلة التواصل / رابط الأعمال
                    </label>
                    <input
                      type="text"
                      maxLength={120}
                      value={phoneOrSocial}
                      onChange={(e) => setPhoneOrSocial(e.target.value)}
                      placeholder="رقم الهاتف أو حساب الإنستغرام"
                      className="w-full min-h-[44px] bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[#F5F2EB] outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-[#C8C2B8]">
                      سنوات الخبرة، التخصص، والموقع *
                    </label>
                    <span className="text-[11px] font-mono-num text-[#8B857B]">
                      {experience.length}/400
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    required
                    maxLength={400}
                    value={experience}
                    onChange={(e) => setExperience(e.target.value)}
                    placeholder="اكتب نبذة عن خبرتك في الحلاقة (مثل: التدرجات، تنسيق اللحية، العناية بالبشرة)، عدد سنوات الخبرة، والمدينة أو الحي..."
                    className="w-full bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl p-3.5 text-xs sm:text-sm text-[#F5F2EB] outline-none resize-none leading-relaxed"
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 transition-colors"
                  >
                    <Send className="w-4 h-4" />
                    <span>{submitting ? 'جاري إرسال الطلب...' : 'إرسال طلب الانضمام للإدارة'}</span>
                  </button>
                </div>
              </form>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
