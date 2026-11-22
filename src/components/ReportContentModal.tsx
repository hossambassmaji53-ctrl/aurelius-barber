import React, { useState } from 'react';
import { Ban, CheckCircle2, Flag, ShieldAlert, X } from 'lucide-react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { createSafeId, db, handleFirestoreError, OperationType } from '../firebase';
import {
  ReportCategory,
  ReportTargetType,
  UserProfile,
} from '../types';
import { checkActionRateLimit, MAX_TEXT_LENGTHS, sanitizePlainText } from '../utils/security';
import { isStaffMember } from './Avatar';

export interface ReportRequestPayload {
  targetType: ReportTargetType;
  targetId: string;
  targetOwnerId: string;
  targetOwnerName: string;
  targetPreview?: string;
}

interface ReportContentModalProps {
  open: boolean;
  payload: ReportRequestPayload | null;
  currentUser: UserProfile;
  users: UserProfile[];
  onClose: () => void;
  onBlockUser?: (targetUid: string, targetName: string, targetPhoto?: string) => Promise<void> | void;
  onSuccessMessage?: (msg: string) => void;
}

const REPORT_CATEGORIES: { key: ReportCategory; label: string; desc: string }[] = [
  {
    key: 'harassment',
    label: 'إساءة أو تحرش أو ألفاظ مسيئة',
    desc: 'سب، تهديد، تنمر، أو مضايقة شخصية للأعضاء.',
  },
  {
    key: 'spam',
    label: 'إزعاج أو سبام أو روابط مشبوهة',
    desc: 'إعلانات عشوائية أو تكرار مفرط أو روابط احتيالية.',
  },
  {
    key: 'inappropriate',
    label: 'محتوى غير لائق أو مخالف للذوق العام',
    desc: 'صور أو نصوص خارجة عن محتوى الحلاقة والأناقة.',
  },
  {
    key: 'impersonation',
    label: 'انتحال شخصية أو احتيال',
    desc: 'انتحال صفة حلاق موثق أو مشرف أو تلاعب بالكريدت.',
  },
  {
    key: 'other',
    label: 'مخالفة أخرى لقوانين أوريليوس باربر',
    desc: 'أي سلوك آخر يستدعي مراجعة الطاقم الإشرافي.',
  },
];

export const ReportContentModal: React.FC<ReportContentModalProps> = ({
  open,
  payload,
  currentUser,
  users,
  onClose,
  onBlockUser,
  onSuccessMessage,
}) => {
  const [category, setCategory] = useState<ReportCategory>('harassment');
  const [reason, setReason] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (!open || !payload) return null;

  const targetProfile = users.find((u) => u.uid === payload.targetOwnerId);
  const canOfferBlock =
    Boolean(onBlockUser) &&
    payload.targetOwnerId !== currentUser.uid &&
    payload.targetOwnerId !== '';

  const handleClose = () => {
    setError(null);
    setSubmitted(false);
    setReason('');
    setAlsoBlock(false);
    setCategory('harassment');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (payload.targetOwnerId === currentUser.uid) {
      setError('لا يمكنك الإبلاغ عن حسابك الشخصي.');
      return;
    }

    const rate = checkActionRateLimit(`report_${currentUser.uid}`, {
      cooldownMs: 8000,
      maxInWindow: 6,
      windowMs: 5 * 60 * 1000,
    });
    if (!rate.allowed) {
      setError(rate.message || 'يرجى الانتظار قبل إرسال بلاغ جديد.');
      return;
    }

    setSubmitting(true);
    try {
      const reportId = createSafeId('rep');
      const cleanReason = sanitizePlainText(reason, MAX_TEXT_LENGTHS.reportReason, {
        multiline: true,
      });
      const cleanPreview = sanitizePlainText(payload.targetPreview || '', 180, {
        multiline: false,
      });
      const cleanOwnerName =
        sanitizePlainText(payload.targetOwnerName, MAX_TEXT_LENGTHS.displayName, {
          multiline: false,
        }) || 'عضو';

      await setDoc(doc(db, 'contentReports', reportId), {
        id: reportId,
        reporterId: currentUser.uid,
        reporterName: currentUser.displayName,
        targetType: payload.targetType,
        targetId: payload.targetId,
        targetOwnerId: payload.targetOwnerId,
        targetOwnerName: cleanOwnerName,
        targetPreview: cleanPreview,
        category,
        reason: cleanReason,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const staffRecipients = users.filter(
        (u) => !u.isBanned && u.uid !== currentUser.uid && isStaffMember(u, false)
      );
      await Promise.all(
        staffRecipients.slice(0, 15).map((staff) => {
          const notifId = createSafeId('ntf');
          return setDoc(doc(db, 'notifications', notifId), {
            id: notifId,
            recipientId: staff.uid,
            senderId: currentUser.uid,
            senderName: currentUser.displayName,
            type: 'moderation',
            title: `بلاغ محتوى جديد ضد ${cleanOwnerName}`.slice(0, 120),
            body: (cleanReason || cleanPreview || 'بلاغ مستخدم قيد المراجعة من الإشراف').slice(
              0,
              280
            ),
            targetView: 'staff_room',
            targetId: reportId,
            read: false,
            createdAt: serverTimestamp(),
          });
        })
      );

      if (alsoBlock && canOfferBlock && onBlockUser) {
        await onBlockUser(
          payload.targetOwnerId,
          cleanOwnerName,
          targetProfile?.photoURL || ''
        );
      }

      setSubmitted(true);
      onSuccessMessage?.('تم استلام بلاغك بسرية وسيتم مراجعته من قبل فريق الإشراف.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'contentReports');
      setError('تعذر إرسال البلاغ حالياً. يرجى المحاولة مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={handleClose}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-[2px] flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="الإبلاغ عن محتوى أو عضو"
        className="w-full max-w-md bg-[#141419] border border-[#2C2C36] rounded-2xl p-5 sm:p-6 space-y-4 shadow-2xl max-h-[90dvh] overflow-y-auto"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/35 text-red-400 flex items-center justify-center shrink-0">
              <Flag className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-[#F5F2EB] truncate">
                إبلاغ عن مخالفة
              </h2>
              <p className="text-[11px] text-[#9C968B] truncate">
                ضد: {payload.targetOwnerName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="إغلاق"
            className="w-8 h-8 rounded-lg bg-[#1A1A22] hover:bg-[#23232E] text-[#9C968B] hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitted ? (
          <div className="py-5 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-[#F5F2EB]">
              تم إرسال البلاغ بنجاح
            </h3>
            <p className="text-xs text-[#A6A196] leading-relaxed">
              شكراً لمساهمتك في الحفاظ على أمان مجتمع أوريليوس باربر. سيراجع المشرفون البلاغ ويتخذون الإجراء اللازم.
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="w-full py-2.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-extrabold cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {payload.targetPreview && (
              <div className="p-3 rounded-xl bg-[#101015] border border-[#24242E] text-xs text-[#B6B0A4] line-clamp-2 break-words">
                «{payload.targetPreview}»
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#E6E1D8]">
                سبب البلاغ
              </label>
              <div className="space-y-1.5">
                {REPORT_CATEGORIES.map((item) => {
                  const selected = category === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setCategory(item.key)}
                      className={`w-full text-right p-2.5 rounded-xl border transition-colors cursor-pointer ${
                        selected
                          ? 'bg-red-500/10 border-red-400/50 text-[#F5F2EB]'
                          : 'bg-[#191921] border-[#262632] text-[#B6B0A4] hover:border-[#3A3A4A]'
                      }`}
                    >
                      <div className="text-xs font-bold">{item.label}</div>
                      <div className="text-[11px] text-[#8B857B] mt-0.5">{item.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#E6E1D8]">
                تفاصيل إضافية (اختياري)
              </label>
              <textarea
                rows={2}
                maxLength={MAX_TEXT_LENGTHS.reportReason}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="اشرح المخالفة باختصار لمساعدة فريق الإشراف..."
                className="w-full bg-[#191921] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F2EB] outline-none resize-none"
              />
            </div>

            {canOfferBlock && (
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#191921] border border-[#262632] cursor-pointer">
                <input
                  type="checkbox"
                  checked={alsoBlock}
                  onChange={(e) => setAlsoBlock(e.target.checked)}
                  className="mt-0.5 accent-[#D4A853]"
                />
                <span className="text-xs text-[#D6D1C7] leading-relaxed flex items-center gap-1.5">
                  <Ban className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <span>حظر هذا المستخدم وإخفاء جميع رسائله ومنشوراته من عندي فوراً</span>
                </span>
              </label>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/35 text-xs text-red-300 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2.5 rounded-xl bg-[#1E1E26] hover:bg-[#272733] text-xs font-semibold text-[#F5F2EB] cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 text-white text-xs font-extrabold cursor-pointer disabled:opacity-60"
              >
                {submitting ? 'جاري الإرسال...' : 'إرسال البلاغ'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
                  
