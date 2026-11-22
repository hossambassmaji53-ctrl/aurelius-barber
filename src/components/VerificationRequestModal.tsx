import React, { useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { BadgeCheck, X } from 'lucide-react';
import { db, createSafeId, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile } from '../types';

import { checkActionRateLimit, MAX_TEXT_LENGTHS, sanitizePlainText } from '../utils/security';

interface VerificationRequestModalProps {
  open: boolean;
  currentUser: UserProfile;
  users: UserProfile[];
  activeCountryCode?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const VerificationRequestModal: React.FC<VerificationRequestModalProps> = ({
  open,
  currentUser,
  users,
  activeCountryCode,
  onClose,
  onSuccess,
}) => {
  const [salonName, setSalonName] = useState(currentUser.salonName || '');
  const [experience, setExperience] = useState('');
  const [phoneOrSocial, setPhoneOrSocial] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSalon = sanitizePlainText(salonName, MAX_TEXT_LENGTHS.salonName, {
      multiline: false,
    });
    const cleanExperience = sanitizePlainText(experience, 400, {
      multiline: true,
    });
    const cleanContact = sanitizePlainText(phoneOrSocial, 120, {
      multiline: false,
    });

    if (!cleanSalon || !cleanExperience) {
      setError('يرجى إدخال اسم الصالون وتفاصيل الخبرة بشكل صحيح.');
      return;
    }

    const rate = checkActionRateLimit(`verify_req_${currentUser.uid}`, {
      cooldownMs: 15000,
      maxInWindow: 3,
      windowMs: 5 * 60 * 1000,
    });
    if (!rate.allowed) {
      setError(rate.message || 'يرجى الانتظار قليلاً قبل إرسال طلب جديد.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const reqId = createSafeId('vreq');
      const resolvedCountry = activeCountryCode || currentUser.countryCode;
      await setDoc(doc(db, 'verificationRequests', reqId), {
        id: reqId,
        userId: currentUser.uid,
        userName: currentUser.displayName,
        userPhoto: currentUser.photoURL || '',
        salonName: cleanSalon,
        ...(resolvedCountry ? { countryCode: resolvedCountry } : {}),
        experience: cleanExperience,
        phoneOrSocial: cleanContact,
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
          senderName: currentUser.displayName,
          type: 'verification_request',
          title: `طلب توثيق حلاق جديد من ${currentUser.displayName}`.slice(0, 120),
          body: `الصالون: ${cleanSalon.slice(0, 80)}`,
          targetView: 'admin',
          targetId: reqId,
          read: false,
          createdAt: serverTimestamp(),
        });
      }

      setExperience('');
      setPhoneOrSocial('');
      onSuccess();
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'verificationRequests');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      dir="rtl"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[#141419] border border-[#2C2C35] rounded-2xl p-6 space-y-5 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#F5F2EB] flex items-center gap-2">
            <BadgeCheck className="w-5 h-5 text-[#D4A853]" />
            <span>تقديم طلب توثيق كحلاق</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#9C968B] hover:text-[#F5F2EB] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#C8C2B8]">اسم الصالون</label>
            <input
              type="text"
              required
              maxLength={100}
              value={salonName}
              onChange={(e) => setSalonName(e.target.value)}
              placeholder="مثال: صالون النخبة للحلاقة"
              className="w-full bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F2EB] outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#C8C2B8]">
              سنوات الخبرة والتخصص
            </label>
            <textarea
              rows={3}
              required
              maxLength={400}
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              placeholder="اذكر خبرتك في الحلاقة، التدرجات، تنسيق اللحية، وموقع الصالون..."
              className="w-full bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F2EB] outline-none resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#C8C2B8]">
              وسيلة تواصل أو حساب أعمال (اختياري)
            </label>
            <input
              type="text"
              maxLength={120}
              value={phoneOrSocial}
              onChange={(e) => setPhoneOrSocial(e.target.value)}
              placeholder="مثال: @barber_handle أو رقم الهاتف"
              className="w-full bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F2EB] outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-[#1E1E26] text-xs font-semibold text-[#F5F2EB] cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-bold cursor-pointer disabled:opacity-60"
            >
              {submitting ? 'جاري الإرسال...' : 'إرسال طلب التوثيق'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
