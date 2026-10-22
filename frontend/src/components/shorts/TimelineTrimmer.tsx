import React, { useCallback, useRef } from 'react';
import { Clock, Play, Scissors } from 'lucide-react';
import { formatDuration } from '../../utils/shortsFormat';

const MIN_GAP_SECONDS = 0.5;
const MAX_CLIP_SECONDS = 180;

interface TimelineTrimmerProps {
  durationSeconds: number;
  startSeconds: number;
  endSeconds: number;
  currentTime: number;
  onChangeStart: (newStart: number) => void;
  onChangeEnd: (newEnd: number) => void;
  onSetStartToCurrent: () => void;
  onSetEndToCurrent: () => void;
  onSeek?: (seconds: number) => void;
  validationError?: string | null;
}

export const TimelineTrimmer: React.FC<TimelineTrimmerProps> = ({
  durationSeconds,
  startSeconds,
  endSeconds,
  currentTime,
  onChangeStart,
  onChangeEnd,
  onSetStartToCurrent,
  onSetEndToCurrent,
  onSeek,
  validationError,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const activeDragRef = useRef<'start' | 'end' | null>(null);

  const duration = Math.max(0.1, durationSeconds);
  const selectedLength = Math.max(0, endSeconds - startSeconds);

  // Percentages for positions
  const startPercent = Math.min(100, Math.max(0, (startSeconds / duration) * 100));
  const endPercent = Math.min(100, Math.max(0, (endSeconds / duration) * 100));
  const currentPercent = Math.min(100, Math.max(0, (currentTime / duration) * 100));

  const getTimeFromPointer = useCallback(
    (clientX: number): number => {
      if (!trackRef.current) return 0;
      const rect = trackRef.current.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const ratio = rect.width > 0 ? clickX / rect.width : 0;
      const time = ratio * duration;
      return Math.round(time * 10) / 10;
    },
    [duration]
  );

  const handlePointerDown = (type: 'start' | 'end', e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    activeDragRef.current = type;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeDragRef.current) return;
    const time = getTimeFromPointer(e.clientX);

    if (activeDragRef.current === 'start') {
      // Clamping start: 0 <= start <= end - MIN_GAP, and end - start <= 180
      const minPossible = Math.max(0, endSeconds - MAX_CLIP_SECONDS);
      const maxPossible = Math.max(0, endSeconds - MIN_GAP_SECONDS);
      const clamped = Math.min(maxPossible, Math.max(minPossible, time));
      onChangeStart(clamped);
      if (onSeek) onSeek(clamped);
    } else {
      // Clamping end: start + MIN_GAP <= end <= min(duration, start + 180)
      const minPossible = Math.min(duration, startSeconds + MIN_GAP_SECONDS);
      const maxPossible = Math.min(duration, startSeconds + MAX_CLIP_SECONDS);
      const clamped = Math.min(maxPossible, Math.max(minPossible, time));
      onChangeEnd(clamped);
      if (onSeek) onSeek(clamped);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeDragRef.current) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Pointer was already released
      }
      activeDragRef.current = null;
    }
  };

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Seek to clicked position if not dragging handles
    if (activeDragRef.current) return;
    const time = getTimeFromPointer(e.clientX);
    if (onSeek) {
      onSeek(time);
    }
  };

  const handleKeyDownStart = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 5 : 0.5;
    const minPossible = Math.max(0, endSeconds - MAX_CLIP_SECONDS);
    const maxPossible = Math.max(0, endSeconds - MIN_GAP_SECONDS);

    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      const updated = Math.max(minPossible, Math.round((startSeconds - step) * 10) / 10);
      onChangeStart(updated);
      if (onSeek) onSeek(updated);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      const updated = Math.min(maxPossible, Math.round((startSeconds + step) * 10) / 10);
      onChangeStart(updated);
      if (onSeek) onSeek(updated);
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChangeStart(0);
      if (onSeek) onSeek(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChangeStart(maxPossible);
      if (onSeek) onSeek(maxPossible);
    }
  };

  const handleKeyDownEnd = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 5 : 0.5;
    const minPossible = Math.min(duration, startSeconds + MIN_GAP_SECONDS);
    const maxPossible = Math.min(duration, startSeconds + MAX_CLIP_SECONDS);

    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      const updated = Math.max(minPossible, Math.round((endSeconds - step) * 10) / 10);
      onChangeEnd(updated);
      if (onSeek) onSeek(updated);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      const updated = Math.min(maxPossible, Math.round((endSeconds + step) * 10) / 10);
      onChangeEnd(updated);
      if (onSeek) onSeek(updated);
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChangeEnd(minPossible);
      if (onSeek) onSeek(minPossible);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChangeEnd(maxPossible);
      if (onSeek) onSeek(maxPossible);
    }
  };

  return (
    <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] space-y-4">
      {/* Header with length indicator */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
        <span className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
          <Scissors className="w-3.5 h-3.5 text-zinc-300" />
          <span>Timeline Trimmer</span>
        </span>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span
            className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
              selectedLength > MAX_CLIP_SECONDS
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                : 'border-zinc-700/80 bg-zinc-800 text-zinc-200'
            }`}
          >
            Selected: {selectedLength.toFixed(1)}s
          </span>
          <span className="text-zinc-500 text-[10px]">max 180s</span>
        </div>
      </div>

      {/* Dual Handle Interactive Range Slider */}
      <div className="space-y-2 py-2">
        <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 px-0.5">
          <span>00:00</span>
          <span className="flex items-center gap-1 text-zinc-400">
            <Play className="w-2.5 h-2.5 fill-zinc-400" />
            {formatDuration(currentTime)}
          </span>
          <span>{formatDuration(duration)}</span>
        </div>

        {/* Slider Track Area */}
        <div
          ref={trackRef}
          onClick={handleTrackClick}
          className="relative h-10 bg-zinc-900 rounded-md border border-zinc-800 cursor-pointer select-none overflow-visible"
        >
          {/* Subtle time tick lines */}
          <div className="absolute inset-0 flex justify-between px-2 py-1 pointer-events-none opacity-20">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="w-[1px] h-full bg-zinc-500" />
            ))}
          </div>

          {/* Active Range Highlight */}
          <div
            className="absolute top-0 bottom-0 bg-zinc-700/60 border-y border-zinc-500/40"
            style={{
              left: `${startPercent}%`,
              width: `${Math.max(0, endPercent - startPercent)}%`,
            }}
          />

          {/* Current Video Time Indicator Line */}
          <div
            className="absolute top-0 bottom-0 w-[2px] bg-sky-400 z-10 pointer-events-none shadow-xs"
            style={{ left: `${currentPercent}%` }}
          >
            <div className="w-2 h-2 -ml-[3px] bg-sky-400 rounded-full" />
          </div>

          {/* Left / Start Handle */}
          <div
            role="slider"
            tabIndex={0}
            aria-label="Start time"
            aria-valuemin={0}
            aria-valuemax={Math.max(0, endSeconds - MIN_GAP_SECONDS)}
            aria-valuenow={startSeconds}
            aria-valuetext={`${startSeconds.toFixed(1)} seconds`}
            onPointerDown={(e) => handlePointerDown('start', e)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onKeyDown={handleKeyDownStart}
            style={{ left: `${startPercent}%` }}
            className="absolute top-0 bottom-0 -ml-2.5 w-5 bg-zinc-200 hover:bg-white border border-zinc-950 rounded-sm cursor-ew-resize z-20 flex items-center justify-center shadow-md focus-visible:ring-2 focus-visible:ring-zinc-100 focus-visible:outline-none transition-colors"
          >
            <div className="w-[2px] h-4 bg-zinc-800 rounded-full" />
          </div>

          {/* Right / End Handle */}
          <div
            role="slider"
            tabIndex={0}
            aria-label="End time"
            aria-valuemin={startSeconds + MIN_GAP_SECONDS}
            aria-valuemax={Math.min(duration, startSeconds + MAX_CLIP_SECONDS)}
            aria-valuenow={endSeconds}
            aria-valuetext={`${endSeconds.toFixed(1)} seconds`}
            onPointerDown={(e) => handlePointerDown('end', e)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onKeyDown={handleKeyDownEnd}
            style={{ left: `${endPercent}%` }}
            className="absolute top-0 bottom-0 -ml-2.5 w-5 bg-zinc-200 hover:bg-white border border-zinc-950 rounded-sm cursor-ew-resize z-20 flex items-center justify-center shadow-md focus-visible:ring-2 focus-visible:ring-zinc-100 focus-visible:outline-none transition-colors"
          >
            <div className="w-[2px] h-4 bg-zinc-800 rounded-full" />
          </div>
        </div>
      </div>

      {/* Numeric Inputs & Precision Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
        {/* Start Time Numeric Control */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-300">
            <label htmlFor="trim-start-seconds" className="font-medium">
              Start Time (seconds)
            </label>
            <button
              type="button"
              onClick={onSetStartToCurrent}
              className="text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-zinc-400 rounded px-1"
            >
              Set to current time
            </button>
          </div>
          <input
            id="trim-start-seconds"
            type="number"
            min={0}
            max={duration}
            step={0.1}
            value={startSeconds}
            onChange={(e) => onChangeStart(parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-1.5 rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 focus-visible:ring-2 focus-visible:ring-zinc-400 font-mono"
          />
          <div className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
            <Clock className="w-3 h-3 text-zinc-500" />
            <span>Timestamp: {formatDuration(startSeconds)}</span>
          </div>
        </div>

        {/* End Time Numeric Control */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-300">
            <label htmlFor="trim-end-seconds" className="font-medium">
              End Time (seconds)
            </label>
            <button
              type="button"
              onClick={onSetEndToCurrent}
              className="text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-zinc-400 rounded px-1"
            >
              Set to current time
            </button>
          </div>
          <input
            id="trim-end-seconds"
            type="number"
            min={0}
            max={duration}
            step={0.1}
            value={endSeconds}
            onChange={(e) => onChangeEnd(parseFloat(e.target.value) || 0)}
            className="w-full px-3 py-1.5 rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 focus-visible:ring-2 focus-visible:ring-zinc-400 font-mono"
          />
          <div className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
            <Clock className="w-3 h-3 text-zinc-500" />
            <span>Timestamp: {formatDuration(endSeconds)}</span>
          </div>
        </div>
      </div>

      {/* Validation / Inline Error Display */}
      {validationError && (
        <div
          className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-md"
          role="alert"
          aria-live="polite"
        >
          {validationError}
        </div>
      )}
    </div>
  );
};
