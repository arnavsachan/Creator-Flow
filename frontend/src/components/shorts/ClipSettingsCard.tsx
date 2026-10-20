import React from 'react';
import { Film, Loader2, Scissors, Smartphone } from 'lucide-react';
import type { AspectRatio } from '../../types/shorts';

interface ClipSettingsCardProps {
  aspect: AspectRatio;
  onAspectChange: (aspect: AspectRatio) => void;
  isCreatingClip: boolean;
  onGenerateClip: () => void;
  selectedLength: number;
  validationError: string | null;
}

export const ClipSettingsCard: React.FC<ClipSettingsCardProps> = ({
  aspect,
  onAspectChange,
  isCreatingClip,
  onGenerateClip,
  selectedLength,
  validationError,
}) => {
  const isGenerateDisabled = isCreatingClip || !!validationError || selectedLength <= 0;

  return (
    <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
        <span className="text-xs font-semibold text-zinc-100">Clip Settings</span>
        <span className="text-[11px] font-mono text-zinc-400">
          Duration: {selectedLength.toFixed(1)}s
        </span>
      </div>

      {/* Aspect Ratio Segmented Control */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-300">Output Aspect Ratio</label>
        <div
          className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-zinc-900 border border-zinc-800"
          role="radiogroup"
          aria-label="Output Aspect Ratio"
        >
          <button
            type="button"
            role="radio"
            aria-checked={aspect === 'vertical_9_16'}
            onClick={() => onAspectChange('vertical_9_16')}
            className={`p-2 rounded-md text-xs font-medium flex flex-col items-center justify-center gap-1 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none ${
              aspect === 'vertical_9_16'
                ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-zinc-300" />
              <span>9:16 Vertical</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">1080x1920 crop</span>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={aspect === 'original'}
            onClick={() => onAspectChange('original')}
            className={`p-2 rounded-md text-xs font-medium flex flex-col items-center justify-center gap-1 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none ${
              aspect === 'original'
                ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Film className="w-3.5 h-3.5 text-zinc-300" />
              <span>Original</span>
            </div>
            <span className="text-[10px] text-zinc-500 font-mono">Preserve ratio</span>
          </button>
        </div>
      </div>

      {/* Inline reason when generate is disabled */}
      {validationError && (
        <div
          className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-md"
          role="status"
          aria-live="polite"
        >
          Cannot generate: {validationError}
        </div>
      )}

      {/* Generate Action Button */}
      <button
        type="button"
        disabled={isGenerateDisabled}
        onClick={onGenerateClip}
        className="w-full py-2.5 px-4 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-950 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:border-zinc-800 disabled:cursor-not-allowed border border-transparent text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none"
      >
        {isCreatingClip ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-950" />
            <span>Queuing Trim Job...</span>
          </>
        ) : (
          <>
            <Scissors className="w-3.5 h-3.5" />
            <span>Generate Clip ({Math.max(0, Math.round(selectedLength))}s)</span>
          </>
        )}
      </button>
    </div>
  );
};
