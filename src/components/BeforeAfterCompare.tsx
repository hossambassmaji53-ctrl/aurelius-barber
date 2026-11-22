import React, { useState } from 'react';
import { Columns2, SlidersHorizontal } from 'lucide-react';

interface BeforeAfterCompareProps {
  beforeUrl: string;
  afterUrl: string;
  title: string;
  aspectClass?: string;
}

export const BeforeAfterCompare: React.FC<BeforeAfterCompareProps> = ({
  beforeUrl,
  afterUrl,
  title,
  aspectClass = 'aspect-[4/3]',
}) => {
  const [sliderPos, setSliderPos] = useState(50);
  const [viewMode, setViewMode] = useState<'slider' | 'split'>('slider');

  return (
    <div
      className={`relative w-full ${aspectClass} bg-[#121218] overflow-hidden select-none`}
      onClick={(e) => e.stopPropagation()}
    >
      {viewMode === 'split' ? (
        <div className="grid grid-cols-2 w-full h-full gap-0.5 bg-[#0B0B0E]">
          <div className="relative h-full overflow-hidden">
            <img
              src={beforeUrl}
              alt={`${title} - قبل`}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded bg-black/75 text-[11px] font-bold text-[#E6E1D8]">
              قبل
            </span>
          </div>
          <div className="relative h-full overflow-hidden">
            <img
              src={afterUrl}
              alt={`${title} - بعد`}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded bg-[#D4A853] text-[11px] font-bold text-[#0B0B0E]">
              بعد
            </span>
          </div>
        </div>
      ) : (
        <div dir="ltr" className="relative w-full h-full">
          {/* Base: After */}
          <img
            src={afterUrl}
            alt={`${title} - بعد`}
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />

          {/* Overlay clipped: Before */}
          <div
            className="absolute inset-0 overflow-hidden pointer-events-none"
            style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
          >
            <img
              src={beforeUrl}
              alt={`${title} - قبل`}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>

          {/* Divider line & handle */}
          <div
            className="absolute inset-y-0 w-0.5 bg-[#D4A853] shadow-lg pointer-events-none"
            style={{ left: `${sliderPos}%` }}
          >
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-[#D4A853] text-[#0B0B0E] flex items-center justify-center shadow-lg border-2 border-[#0B0B0E]">
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Invisible accessible range input for drag & touch */}
          <input
            type="range"
            min={0}
            max={100}
            value={sliderPos}
            aria-label="مقارنة قبل وبعد"
            onChange={(e) => setSliderPos(Number(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-10"
          />

          <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded bg-black/75 text-[11px] font-bold text-[#E6E1D8] pointer-events-none">
            قبل
          </span>
          <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded bg-[#D4A853] text-[11px] font-bold text-[#0B0B0E] pointer-events-none">
            بعد
          </span>
        </div>
      )}

      {/* Mode Switch Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setViewMode((m) => (m === 'slider' ? 'split' : 'slider'));
        }}
        title={viewMode === 'slider' ? 'عرض جنب إلى جنب' : 'عرض شريط المقارنة'}
        className="absolute bottom-2.5 left-2.5 z-20 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/75 hover:bg-black text-[10px] font-bold text-[#F5F2EB] border border-white/15 cursor-pointer"
      >
        <Columns2 className="w-3 h-3 text-[#D4A853]" />
        <span>{viewMode === 'slider' ? 'جنب إلى جنب' : 'مقارنة متحركة'}</span>
      </button>
    </div>
  );
};
