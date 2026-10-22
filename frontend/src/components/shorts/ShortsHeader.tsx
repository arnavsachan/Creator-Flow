import React from 'react';
import { Scissors, Sparkles } from 'lucide-react';

export interface ShortsHeaderProps {
  mode?: 'manual' | 'ai';
  onModeChange?: (mode: 'manual' | 'ai') => void;
}

export const ShortsHeader: React.FC<ShortsHeaderProps> = ({
  mode = 'manual',
  onModeChange,
}) => {
  const isManual = mode === 'manual';

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">
          Shorts Clipper
        </h1>
        <p className="text-xs text-zinc-400 mt-0.5">
          {isManual
            ? 'Precision manual trimming with FFmpeg re-encoding, 9:16 vertical crop framing, and instant MP4 export.'
            : 'Automated local speech transcription and AI-powered clip suggestions from your video.'}
        </p>
      </div>

      {/* Mode Switcher Tabs */}
      <div
        className="inline-flex items-center p-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs self-start sm:self-auto"
        role="tablist"
        aria-label="Clipper modes"
      >
        <button
          type="button"
          role="tab"
          aria-selected={isManual}
          onClick={() => onModeChange?.('manual')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
            isManual
              ? 'bg-zinc-800 text-zinc-100 border border-zinc-700/80 shadow-xs'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Scissors className="w-3.5 h-3.5" />
          <span>Manual</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={!isManual}
          onClick={() => onModeChange?.('ai')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
            !isManual
              ? 'bg-zinc-800 text-zinc-100 border border-zinc-700/80 shadow-xs'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>AI Auto-Clip</span>
        </button>
      </div>
    </div>
  );
};
