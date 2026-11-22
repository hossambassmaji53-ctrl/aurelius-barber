import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  User,
} from 'firebase/auth';
import {
  Mail,
  Lock,
  User as UserIcon,
  Scissors,
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
  LogOut,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import { BarberScene3D } from './BarberScene3D';
import { PrivacyAndPolicyModal } from './PrivacyAndPolicyModal';
import { MAX_TEXT_LENGTHS, sanitizePlainText } from '../utils/security';

interface AuthScreenProps {
  unverifiedUser: User | null;
  onVerifiedRefresh: () => Promise<void>;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  unverifiedUser,
  onVerifiedRefresh,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [providerHint, setProviderHint] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const mapAuthError = (err: unknown): string => {
    const code = (err as { code?: string })?.code || '';
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
      case 'auth/email-already-in-use':
        return 'هذا البريد الإلكتروني مسجل مسبقاً. يمكنك تسجيل الدخول مباشرة.';
      case 'auth/weak-password':
        return 'كلمة المرور ضعيفة، يجب أن تكون 6 أحرف على الأقل.';
      case 'auth/invalid-email':
        return 'صيغة البريد الإلكتروني غير صحيحة.';
      case 'auth/too-many-requests':
        return 'تم تجاوز عدد المحاولات المسموح. يرجى الانتظار قليلاً ثم المحاولة.';
      case 'auth/popup-closed-by-user':
        return 'تم إغلاق نافذة تسجيل الدخول قبل إتمام العملية.';
      case 'auth/operation-not-allowed':
        setProviderHint(true);
        return 'خدمة البريد وكلمة المرور غير مفعلة بعد في لوحة Firebase. يمكنك تسجيل الدخول الآن عبر بريد Google بالأسفل أو تفعيل موفر Email/Password في Firebase Console.';
      default:
        return 'تعذر إتمام العملية. يرجى التحقق من البيانات والمحاولة مرة أخرى.';
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setProviderHint(false);
    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else if (mode === 'register') {
        const cleanName = sanitizePlainText(displayName, MAX_TEXT_LENGTHS.displayName, {
          multiline: false,
        });
        if (!cleanName) {
          setError('يرجى إدخال الاسم الكامل بشكل صحيح.');
          setLoading(false);
          return;
        }
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, { displayName: cleanName });
        await sendEmailVerification(cred.user);
        setInfo('تم إنشاء الحساب وإرسال رابط التفعيل إلى بريدك الإلكتروني.');
      } else {
        await sendPasswordResetEmail(auth, email.trim());
        setInfo('تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني.');
        setMode('login');
      }
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!unverifiedUser) return;
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      await sendEmailVerification(unverifiedUser);
      setInfo('تم إعادة إرسال رسالة التفعيل بنجاح. تحقق من صندوق الوارد أو البريد غير المرغوب.');
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  if (unverifiedUser) {
    return (
      <div className="relative min-h-screen w-full flex items-center justify-center p-4 sm:p-6">
        <BarberScene3D />
        <div className="relative z-10 w-full max-w-md bg-[#121217]/95 border border-[#2C2C35] rounded-2xl p-7 shadow-2xl space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#D4A853]/15 border border-[#D4A853]/40 flex items-center justify-center text-[#D4A853]">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-[#D4A853]">أوريليوس باربر · Aurelius Barber</div>
              <h1 className="text-xl font-bold text-[#F5F2EB]">تفعيل البريد الإلكتروني</h1>
              <p className="text-xs text-[#A6A196]">{unverifiedUser.email}</p>
            </div>
          </div>

          <p className="text-sm text-[#D6D1C7] leading-relaxed">
            لحماية حسابك والوصول إلى الدردشة والحجوزات، أرسلنا رابط تفعيل إلى بريدك الإلكتروني.
            اضغط على الرابط ثم اضغط زر التحديث أدناه.
          </p>

          {info && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{info}</span>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              disabled={loading}
              onClick={onVerifiedRefresh}
              className="w-full py-3 px-4 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>تم التفعيل — متابعة الدخول</span>
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={handleResendVerification}
              className="w-full py-2.5 px-4 rounded-xl bg-[#1C1C23] hover:bg-[#25252E] border border-[#2E2E38] text-[#F5F2EB] font-medium text-sm transition-colors cursor-pointer"
            >
              إعادة إرسال رابط التفعيل
            </button>

            <button
              type="button"
              onClick={() => signOut(auth)}
              className="w-full py-2 px-4 rounded-xl text-[#A6A196] hover:text-[#F5F2EB] text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>استخدام بريد إلكتروني آخر</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 sm:p-8">
      <BarberScene3D />

      <div className="relative z-10 w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Editorial Welcome Column */}
        <div className="lg:col-span-6 space-y-5 text-right hidden lg:block">
          <div className="inline-flex items-center gap-2.5 text-[#D4A853] text-sm font-semibold">
            <Scissors className="w-4 h-4" />
            <span>أوريليوس باربر — Aurelius Barber</span>
          </div>
          <h1 className="text-4xl xl:text-5xl font-extrabold text-[#F5F2EB] leading-tight [text-wrap:balance]">
            حرفية الحلاقة الفاخرة وتجربة الحجز الذكية في مكان واحد
          </h1>
          <p className="text-base text-[#B6B0A4] leading-relaxed max-w-xl">
            استكشف أعمال الحلاقين الموثقين، تواصل مباشرة عبر الدردشة الحية، حدد موقع أقرب صالون على الخريطة، واحجز موعدك بدقة باليوم والساعة والخدمة.
          </p>
          <div className="grid grid-cols-3 gap-4 pt-2 max-w-lg">
            <div className="bg-[#14141A]/90 border border-[#282832] rounded-xl p-3.5">
              <div className="text-sm font-bold text-[#F5F2EB]">معرض موثق</div>
              <div className="text-xs text-[#9C968B] mt-1">أعمال حقيقية للحلاقين</div>
            </div>
            <div className="bg-[#14141A]/90 border border-[#282832] rounded-xl p-3.5">
              <div className="text-sm font-bold text-[#F5F2EB]">مواعيد دقيقة</div>
              <div className="text-xs text-[#9C968B] mt-1">تأكيد وتعديل فوري</div>
            </div>
            <div className="bg-[#14141A]/90 border border-[#282832] rounded-xl p-3.5">
              <div className="text-sm font-bold text-[#F5F2EB]">خريطة حية</div>
              <div className="text-xs text-[#9C968B] mt-1">وصول مباشر للصالون</div>
            </div>
          </div>
        </div>
        {/* Auth Card */}
        <div className="lg:col-span-6 w-full max-w-md mx-auto bg-[#121217]/95 border border-[#2C2C35] rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#D4A853] text-[#0B0B0E] flex items-center justify-center">
                <Scissors className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#F5F2EB]">
                  {mode === 'login'
                    ? 'تسجيل الدخول'
                    : mode === 'register'
                      ? 'إنشاء حساب جديد'
                      : 'استعادة كلمة المرور'}
                </h2>
                <p className="text-xs text-[#9C968B]">أوريليوس باربر — دخول آمن ومباشر</p>
              </div>
            </div>
            <span className="font-serif-accent text-xs text-[#D4A853] whitespace-nowrap shrink-0">Aurelius Barber</span>
          </div>

          {/* Mode Tabs */}
          {mode !== 'reset' && (
            <div className="grid grid-cols-2 gap-1 p-1 bg-[#1A1A22] rounded-xl border border-[#262630]">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setInfo(null);
                }}
                className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  mode === 'login'
                    ? 'bg-[#D4A853] text-[#0B0B0E]'
                    : 'text-[#A6A196] hover:text-[#F5F2EB]'
                }`}
              >
                تسجيل الدخول
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                  setInfo(null);
                }}
                className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  mode === 'register'
                    ? 'bg-[#D4A853] text-[#0B0B0E]'
                    : 'text-[#A6A196] hover:text-[#F5F2EB]'
                }`}
              >
                حساب جديد
              </button>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs leading-relaxed space-y-1.5">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
              {providerHint && (
                <div className="text-[11px] text-amber-200/90 pt-1 border-t border-red-500/20">
                  لتفعيل البريد وكلمة المرور في Firebase Console: Authentication &larr; Sign-in method &larr; Email/Password &larr; Enable.
                </div>
              )}
            </div>
          )}

          {info && (
            <div className="flex items-start gap-2 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{info}</span>
            </div>
          )}

          <form onSubmit={handleEmailSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#C8C2B8]">الاسم الكامل</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-[#8B857B] absolute right-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="مثال: حسام الشامي"
                    className="w-full bg-[#181820] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl py-2.5 pr-10 pl-3.5 text-sm text-[#F5F2EB] placeholder:text-[#6B665E] outline-none transition-colors"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#C8C2B8]">البريد الإلكتروني</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#8B857B] absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  dir="ltr"
                  className="w-full bg-[#181820] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl py-2.5 pr-10 pl-3.5 text-sm text-left text-[#F5F2EB] placeholder:text-[#6B665E] outline-none transition-colors"
                />
              </div>
            </div>

            {mode !== 'reset' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-[#C8C2B8]">كلمة المرور</label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('reset');
                        setError(null);
                      }}
                      className="text-[11px] text-[#D4A853] hover:underline cursor-pointer"
                    >
                      نسيت كلمة المرور؟
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#8B857B] absolute right-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    dir="ltr"
                    className="w-full bg-[#181820] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl py-2.5 pr-10 pl-3.5 text-sm text-left text-[#F5F2EB] placeholder:text-[#6B665E] outline-none transition-colors"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
            >
              <span>
                {loading
                  ? 'جاري المعالجة...'
                  : mode === 'login'
                    ? 'دخول بالبريد الإلكتروني'
                    : mode === 'register'
                      ? 'إنشاء الحساب وتفعيل البريد'
                      : 'إرسال رابط الاستعادة'}
              </span>
              <ArrowLeft className="w-4 h-4" />
            </button>

            {mode === 'reset' && (
              <button
                type="button"
                onClick={() => setMode('login')}
                className="w-full text-xs text-[#A6A196] hover:text-[#F5F2EB] py-1 cursor-pointer"
              >
                العودة إلى تسجيل الدخول
              </button>
            )}
          </form>

          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-[#262630]" />
            <span className="shrink mx-3 text-[11px] text-[#8B857B]">أو المتابعة السريعة</span>
            <div className="flex-grow border-t border-[#262630]" />
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={handleGoogleSignIn}
            className="w-full py-2.5 px-4 rounded-xl bg-[#1A1A22] hover:bg-[#23232D] border border-[#2E2E3A] text-[#F5F2EB] font-semibold text-sm flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-60"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#EA4335"
                d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12s4.3 9.5 9.5 9.5c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-1.6H12z"
              />
            </svg>
            <span>تسجيل الدخول عبر بريد Google</span>
          </button>

          <div className="pt-2 border-t border-[#22222C] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#8B857B]">
            <span>الكريدت داخل المنصة افتراضي ومجاني بالكامل</span>
            <button
              type="button"
              onClick={() => setPrivacyOpen(true)}
              className="inline-flex items-center gap-1 text-[#D4A853] hover:underline font-semibold cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>سياسة الخصوصية وحذف البيانات</span>
            </button>
          </div>
        </div>
      </div>

      <PrivacyAndPolicyModal
        open={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        currentUser={null}
        initialTab="privacy"
      />
    </div>
  );
};
