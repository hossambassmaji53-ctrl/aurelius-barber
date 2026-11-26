import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Coins,
  FileText,
  Lock,
  ShieldCheck,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { auth, isSuperAdminEmail } from '../firebase';
import { UserProfile } from '../types';
import { deleteOwnAccountAndData } from '../utils/accountDeletion';

interface PrivacyAndPolicyModalProps {
  open: boolean;
  onClose: () => void;
  currentUser?: UserProfile | null;
  initialTab?: 'privacy' | 'delete';
}

export const PrivacyAndPolicyModal: React.FC<PrivacyAndPolicyModalProps> = ({
  open,
  onClose,
  currentUser = null,
  initialTab = 'privacy',
}) => {
  const [tab, setTab] = useState<'privacy' | 'delete'>(initialTab);
  const [confirmWord, setConfirmWord] = useState('');
  const [ackChecked, setAckChecked] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setError(null);
    }
  }, [open, initialTab]);

  if (!open) return null;

  const fbUser = auth.currentUser;
  const isFounder =
    Boolean(currentUser?.role === 'admin') ||
    isSuperAdminEmail(fbUser?.email);

  const handleClose = () => {
    if (deleting) return;
    setError(null);
    setConfirmWord('');
    setAckChecked(false);
    setPasswordInput('');
    setNeedsPassword(false);
    onClose();
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !fbUser) return;
    setError(null);

    if (!ackChecked || confirmWord.trim() !== 'حذف') {
      setError('يرجى تفعيل الإقرار وكتابة كلمة «حذف» للتأكيد النهائي.');
      return;
    }

    setDeleting(true);
    try {
      const res = await deleteOwnAccountAndData(
        currentUser,
        fbUser,
        passwordInput || undefined
      );
      if (!res.ok) {
        if (res.requiresPassword) {
          setNeedsPassword(true);
        }
        setError(res.error || 'تعذر حذف الحساب.');
        return;
      }
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      onClick={handleClose}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-5"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="سياسة الخصوصية وحذف الحساب"
        className="w-full max-w-2xl bg-[#121218] border border-[#2C2C36] rounded-2xl shadow-2xl flex flex-col max-h-[88dvh] overflow-hidden"
      >
        {/* Header */}
        <div className="shrink-0 px-5 py-4 border-b border-[#24242E] bg-[#16161E] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#D4A853]/15 border border-[#D4A853]/35 text-[#D4A853] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-[#F5F2EB] truncate">
                الخصوصية، الأمان، وحذف الحساب — أوريليوس باربر
              </h2>
              <p className="text-[11px] text-[#9C968B] truncate">
                سياسة الخصوصية والشفافية وإدارة بيانات المستخدم
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="إغلاق"
            className="w-8 h-8 rounded-lg bg-[#1D1D26] hover:bg-[#262632] text-[#9C968B] hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sub Tabs */}
        {currentUser && (
          <div className="shrink-0 px-5 pt-3 pb-2 bg-[#14141B] border-b border-[#22222C] flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTab('privacy')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                tab === 'privacy'
                  ? 'bg-[#D4A853] text-[#0B0B0E]'
                  : 'bg-[#1B1B24] text-[#B6B0A4] hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>سياسة الخصوصية والأمان</span>
            </button>

            <button
              type="button"
              onClick={() => setTab('delete')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                tab === 'delete'
                  ? 'bg-red-500 text-white'
                  : 'bg-[#1B1B24] text-red-300 hover:bg-red-500/15'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف الحساب والبيانات</span>
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4 text-xs sm:text-sm text-[#D6D1C7] leading-relaxed">
          {tab === 'privacy' || !currentUser ? (
            <>
              <div className="p-4 rounded-xl bg-[#181822] border border-[#D4A853]/30 space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-extrabold text-[#D4A853]">
                  <Coins className="w-4 h-4 shrink-0" />
                  <span>إيضاح رسمي حول رصيد الكريدت والمتجر</span>
                </div>
                <p className="text-xs text-[#D6D1C7] leading-relaxed">
                  <strong>الكريدت رصيد افتراضي داخل المنصة فقط:</strong> جميع نقاط الكريدت والمزايا الرقمية (مثل الألوان المؤقتة، الإطارات، وبطاقات العضوية) هي عناصر ترفيهية وتفاعلية مجانية داخل تطبيق «أوريليوس باربر»، ولا تمثل عملة مالية حقيقية، ولا يمكن شراؤها بأموال حقيقية، أو تحويلها، أو سحبها نقداً بأي شكل.
                </p>
              </div>

              <section className="space-y-1.5">
                <h3 className="text-sm font-extrabold text-[#F5F2EB] flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-[#D4A853]" />
                  <span>1. البيانات التي نجمعها والغرض منها</span>
                </h3>
                <ul className="list-disc pr-5 space-y-1 text-xs text-[#B6B0A4]">
                  <li>
                    <strong>بيانات الحساب:</strong> الاسم المعروض، اسم المستخدم (@ID)، البريد الإلكتروني (محفوظ في ملف خاص معزول ولا يظهر لبقية الأعضاء)، والصورة الشخصية.
                  </li>
                  <li>
                    <strong>بيانات الحلاقين والمواعيد:</strong> اسم الصالون، قائمة الخدمات، الموقع الجغرافي التقريبي الذي تحدده يدوياً للظهور على الخريطة، وسجل المواعيد بين الزبون والحلاق.
                  </li>
                  <li>
                    <strong>المحتوى التفاعلي:</strong> الرسائل النصية في الدردشة والخاص، أعمال المعرض، الستوريات، والتقييمات التي تختار نشرها طوعياً.
                  </li>
                </ul>
              </section>

              <section className="space-y-1.5">
                <h3 className="text-sm font-extrabold text-[#F5F2EB] flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                  <span>2. سلامة المجتمع وأدوات الإبلاغ والحظر</span>
                </h3>
                <p className="text-xs text-[#B6B0A4]">
                  تلتزم منصة أوريليوس باربر بتوفير بيئة محترمة وآمنة. يمكن لأي مستخدم <strong>الإبلاغ (Report)</strong> عن أي رسالة أو عمل أو حساب مخالف عبر أيقونة البلاغ المباشرة، كما يمكنه <strong>حظر (Block)</strong> أي مستخدم فوراً لإخفاء رسائله وأعماله ومنع تواصله معه. يراجع طاقم الإشراف البلاغات ويتخذ إجراءات رادعة ضد التحرش والسبام وانتحال الصفة.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="text-sm font-extrabold text-[#F5F2EB] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-sky-400" />
                  <span>3. حماية البيانات وعدم البيع لأطراف ثالثة</span>
                </h3>
                <p className="text-xs text-[#B6B0A4]">
                  لا نبيع بياناتك الشخصية ولا نشارك بريدك الإلكتروني مع أي أطراف تسويقية خارجية. تُطبّق قواعد تحقق وأمن صارمة على الخادم لحماية الحسابات، الرتب، وأرصدة الكريدت من أي تعديل غير مصرح به.
                </p>
              </section>

                            <section className="space-y-1.5">
                <p className="text-xs text-[#A8B0C7] leading-relaxed">
                  يتم تحديث سياسة الخصوصية والبيانات عند الحاجة لضمان وضوح الإجراءات وحماية الحسابات.
                </p>
                      </section>

        ) : null}
      </div>
    </div>
  );
      }
