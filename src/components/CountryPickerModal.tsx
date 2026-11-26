import React, { useMemo, useState } from 'react';
import { Check, Globe, Search, Sparkles, X } from 'lucide-react';
import {
  COUNTRIES,
  CountryMeta,
  CountryRegion,
  getCountryByCode,
} from '../utils/countries';

interface CountryFlagProps {
  code?: string | null;
  showName?: boolean;
  size?: 'xs' | 'sm';
  className?: string;
}

export const CountryFlag: React.FC<CountryFlagProps> = ({
  code,
  showName = false,
  size = 'xs',
  className = '',
}) => {
  const country = getCountryByCode(code);
  if (!country) return null;

  return (
    <span
      title={country.nameAr}
      aria-label={country.nameAr}
      className={`inline-flex items-center gap-1 shrink-0 ${className}`}
    >
      <span
        className={
          size === 'xs'
            ? 'text-xs leading-none select-none'
            : 'text-sm leading-none select-none'
        }
      >
        {country.flag}
      </span>
      {showName && (
        <span className="text-[11px] font-semibold text-[#C8C2B8]">
          {country.nameAr}
        </span>
      )}
    </span>
  );
};

interface CountryPickerModalProps {
  open: boolean;
  mode: 'welcome' | 'switcher';
  currentCode?: string | null;
  suggestedCode: string;
  onSelectCountry: (code: string) => void | Promise<void>;
  onClose?: () => void;
}

export const CountryPickerModal: React.FC<CountryPickerModalProps> = ({
  open,
  mode,
  currentCode,
  suggestedCode,
  onSelectCountry,
  onClose,
}) => {
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState<'all' | CountryRegion>('all');
  const [selectedCode, setSelectedCode] = useState<string>(
    currentCode || suggestedCode
  );
  const [saving, setSaving] = useState(false);

  const suggestedCountry = useMemo(
    () => getCountryByCode(suggestedCode) || COUNTRIES[0],
    [suggestedCode]
  );

  const filteredCountries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return COUNTRIES.filter((c) => {
      if (regionFilter !== 'all' && c.region !== regionFilter) return false;
      if (!q) return true;
      return (
        c.nameAr.toLowerCase().includes(q) ||
        c.nameEn.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q)
      );
    });
  }, [search, regionFilter]);

  if (!open) return null;

  const chosenCountry = getCountryByCode(selectedCode) || suggestedCountry;

  const handleConfirm = async (codeToApply: string) => {
    if (saving) return;
    setSaving(true);
    try {
      await onSelectCountry(codeToApply);
    } finally {
      setSaving(false);
    }
  };

  const renderCountryCard = (country: CountryMeta) => {
    const isSelected = chosenCountry.code === country.code;
    const isCurrent = currentCode === country.code;
    return (
      <button
        key={country.code}
        type="button"
        onClick={() => {
          setSelectedCode(country.code);
          if (mode === 'switcher') {
            void handleConfirm(country.code);
          }
        }}
        className={`min-h-[54px] px-3 py-2.5 rounded-xl border flex items-center justify-between gap-2 text-right transition-colors cursor-pointer ${
          isSelected
            ? 'bg-[#D4A853]/15 border-[#D4A853] text-[#F5F2EB]'
            : 'bg-[#181820] hover:bg-[#20202B] border-[#292935] text-[#E2DDD3]'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xl leading-none shrink-0 select-none">
            {country.flag}
          </span>
          <div className="min-w-0">
            <div className="text-xs font-bold truncate">{country.nameAr}</div>
            <div className="text-[10px] text-[#8B857B] truncate">
              {country.nameEn}
            </div>
          </div>
        </div>
        {isSelected ? (
          <Check className="w-4 h-4 text-[#D4A853] shrink-0" />
        ) : isCurrent ? (
          <span className="text-[10px] text-[#D4A853] font-bold shrink-0">
            الحالي
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 bg-[#070709]/92 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={
          mode === 'welcome' ? 'اختيار البلد للمرة الأولى' : 'تغيير البلد'
        }
        className="w-full max-w-2xl bg-[#111116] border border-[#2B2B36] rounded-3xl overflow-hidden shadow-2xl my-auto flex flex-col max-h-[92dvh]"
      >
        {/* Header */}
        <div className="shrink-0 px-5 sm:px-7 py-5 border-b border-[#22222B] bg-gradient-to-l from-[#1C170F] via-[#131319] to-[#111116] flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-[#D4A853]">
              <Globe className="w-4 h-4" />
              <span>
                {mode === 'welcome'
                  ? 'مرحباً بك في أوريليوس باربر العالمية'
                  : 'تغيير البلد · Change Country'}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#F5F2EB] tracking-tight">
              {mode === 'welcome'
                ? 'اختر بلدك للانضمام إلى مجتمعك المحلي'
                : 'اختر الدولة التي تود الانتقال إلى مجتمعها'}
            </h2>
            <p className="text-xs sm:text-sm text-[#A6A196] leading-relaxed">
              {mode === 'welcome'
                ? 'يتم تخصيص الدردشة العامة، الستوريات، ودليل الحلاقين الموثوقين حسب البلد المختار، ويمكنك تغييره في أي وقت.'
                : 'سيتم تحديث الدردشة العامة والستوريات ودليل الحلاقين والخريطة فوراً لعرض مجتمع البلد الجديد.'}
            </p>
          </div>

          {mode === 'switcher' && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="min-w-[40px] min-h-[40px] rounded-xl bg-[#1A1A22] hover:bg-[#252530] border border-[#2D2D38] text-[#9C968B] hover:text-white flex items-center justify-center shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-4">
          {/* Auto-suggested Device Country Card */}
          <div className="p-4 rounded-2xl bg-[#181510] border border-[#D4A853]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-3xl leading-none shrink-0 select-none">
                {suggestedCountry.flag}
              </span>
              <div className="min-w-0">
                <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#D4A853]">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>اقتراح تلقائي حسب إعدادات جهازك</span>
                </div>
                <div className="text-sm font-extrabold text-[#F5F2EB] truncate">
                  {suggestedCountry.nameAr} · {suggestedCountry.nameEn}
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setSelectedCode(suggestedCountry.code);
                void handleConfirm(suggestedCountry.code);
              }}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-extrabold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              {mode === 'welcome'
                ? `متابعة في ${suggestedCountry.nameAr}`
                : `الانتقال إلى ${suggestedCountry.nameAr}`}
            </button>
          </div>

          {/* Search & Region Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#8B857B] absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث عن الدولة (مثال: لبنان، ألمانيا، السعودية...)"
                className="w-full min-h-[42px] bg-[#181820] border border-[#2A2A36] focus:border-[#D4A853] rounded-xl py-2 pr-10 pl-3 text-xs text-[#F5F2EB] placeholder:text-[#6B665E] outline-none"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#181820] border border-[#2A2A36] rounded-xl overflow-x-auto">
              {(
                [
                  { key: 'all', label: 'الكل' },
                  { key: 'arab', label: 'الدول العربية' },
                  { key: 'europe', label: 'أوروبا' },
                  { key: 'other', label: 'دول أخرى' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setRegionFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
                    regionFilter === tab.key
                      ? 'bg-[#D4A853] text-[#0B0B0E]'
                      : 'text-[#A6A196] hover:text-[#F5F2EB]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Country Grid */}
          {filteredCountries.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#8B857B]">
              لم يتم العثور على دولة مطابقة لبحثك.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {filteredCountries.map(renderCountryCard)}
            </div>
          )}
        </div>

        {/* Footer Confirm (Welcome Mode) */}
              <div className="shrink-0 px-5 sm:px-7 py-4 border-t border-[#222222] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={saving || !selectedCode}
                  onClick={() => {
                    if (selectedCode) {
                      void handleConfirm(selectedCode);
                    }
                  }}
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] disabled:opacity-50 text-[#080808] text-xs font-extrabold cursor-pointer transition-colors"
                >
                  {saving ? 'جاري الحفظ...' : 'متابعة'}
                </button>
              </div>
            )
          </div>
        </div>
      )}
    
  );
};

export default CountryPickerModal;

