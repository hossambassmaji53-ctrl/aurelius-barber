import React, { useState } from 'react';
import { Download, Share, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWA';

export const PWAInstallButton: React.FC = () => {
  const { canInstall, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);

  if (isInstalled || (!canInstall && !isIOS)) {
    return null;
  }

  const handleClick = () => {
    if (isIOS && !canInstall) {
      setShowIOSModal(true);
      return;
    }
    void promptInstall();
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title="تثبيت تطبيق أوريليوس باربر"
        aria-label="تثبيت التطبيق"
        className="inline-flex items-center justify-center gap-1.5 min-h-[34px] sm:min-h-[40px] px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-[#D4A853] hover:bg-[#e0b868] text-[#0B0B0E] text-xs font-extrabold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4A853]"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden sm:inline">تثبيت التطبيق</span>
      </button>

      {showIOSModal && (
        <div
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-install-title"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowIOSModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#141419] border border-[#D4A853]/40 rounded-2xl p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#D4A853]/15 text-[#D4A853] flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h2 id="ios-install-title" className="text-base font-extrabold text-[#F5F2EB]">
                    تثبيت أوريليوس باربر على جهازك
                  </h2>
                  <p className="text-xs text-[#A6A196]">تجربة تطبيق متكاملة وسريعة بدون متصفح</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSModal(false)}
                aria-label="إغلاق"
                className="p-2 rounded-xl text-[#8B857B] hover:text-[#F5F2EB] hover:bg-[#1E1E26] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ol className="space-y-3 text-xs text-[#EAE5DB] leading-relaxed">
              <li className="flex items-center gap-2.5 p-3 rounded-xl bg-[#1A1A22] border border-[#282834]">
                <span className="w-6 h-6 rounded-lg bg-[#D4A853] text-[#0B0B0E] font-bold font-mono-num flex items-center justify-center shrink-0">
                  1
                </span>
                <span className="flex items-center gap-1.5 flex-wrap">
                  اضغط على زر المشاركة <Share className="w-4 h-4 text-[#D4A853] inline" /> في أسفل متصفح Safari.
                </span>
              </li>
              <li className="flex items-center gap-2.5 p-3 rounded-xl bg-[#1A1A22] border border-[#282834]">
                <span className="w-6 h-6 rounded-lg bg-[#D4A853] text-[#0B0B0E] font-bold font-mono-num flex items-center justify-center shrink-0">
                  2
                </span>
                <span>مرر للأسفل واختر &quot;إضافة إلى الشاشة الرئيسية&quot; (Add to Home Screen).</span>
              </li>
              <li className="flex items-center gap-2.5 p-3 rounded-xl bg-[#1A1A22] border border-[#282834]">
                <span className="w-6 h-6 rounded-lg bg-[#D4A853] text-[#0B0B0E] font-bold font-mono-num flex items-center justify-center shrink-0">
                  3
                </span>
                <span>اضغط &quot;إضافة&quot; لتظهر أيقونة أوريليوس باربر مباشرة على شاشتك.</span>
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setShowIOSModal(false)}
              className="w-full min-h-[42px] rounded-xl bg-[#D4A853] hover:bg-[#e0b868] text-[#0B0B0E] text-sm font-extrabold transition-colors cursor-pointer"
            >
              فهمت، شكراً
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-amber-500/15 border-b border-amber-500/35 px-4 py-2 text-xs text-amber-200 flex items-center justify-center gap-2 text-center"
    >
      <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
      <span>
        وضع عدم الاتصال — يتم تصفح الواجهة من الذاكرة المؤقتة وسيعود التزامن الفوري فور عودة الإنترنت.
      </span>
    </div>
  );
};
