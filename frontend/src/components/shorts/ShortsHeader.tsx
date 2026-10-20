import React from 'react';
import { Scissors, Sparkles } from 'lucide-react';

export const ShortsHeader: React.FC = () => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">
          Shorts Clipper
        </h1>
        <p className="text-xs text-zinc-400 mt-0.5">
          Precision manual trimming with FFmpeg re-encoding, 9:16 vertical crop framing, and instant MP4 export.
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
          aria-selected="true"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 text-zinc-100 font-medium border border-zinc-700/80 shadow-xs cursor-default"
        >
          <Scissors className="w-3.5 h-3.5 text-zinc-300" />
          <span>Manual</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected="false"
          aria-disabled="true"
          disabled
          title="AI auto-clipping engine is coming in a future update"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-zinc-500 font-normal cursor-not-allowed select-none opacity-60"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>AI Auto-Clip</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800/80 text-zinc-400 border border-zinc-700/50 ml-1">
            Coming soon
          </span>
        </button>
      </div>
    </div>
  );
};
