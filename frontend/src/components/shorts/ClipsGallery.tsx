import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  MoreVertical,
  Scissors,
  Trash2,
} from 'lucide-react';
import type { AspectRatio, ShortsClip } from '../../types/shorts';
import { getClipDownloadUrl, getFriendlyErrorMessage } from '../../services/shortsService';
import { formatDuration } from '../../utils/shortsFormat';

interface ClipsGalleryProps {
  jobId: string;
  jobFilename: string;
  clips: ShortsClip[];
  onDeleteClip?: (clipId: string) => Promise<void> | void;
}

const getAspectStyle = (aspect: AspectRatio) => {
  switch (aspect) {
    case 'vertical_9_16':
      return { containerClass: 'aspect-[9/16] max-w-[200px] mx-auto', label: '9:16' };
    case 'square_1_1':
      return { containerClass: 'aspect-square max-w-[220px] mx-auto', label: '1:1' };
    case 'portrait_4_5':
      return { containerClass: 'aspect-[4/5] max-w-[210px] mx-auto', label: '4:5' };
    case 'landscape_16_9':
      return { containerClass: 'aspect-video max-w-[280px] mx-auto', label: '16:9' };
    case 'original':
    default:
      return { containerClass: 'aspect-video max-w-[280px] mx-auto', label: 'Original' };
  }
};

interface ClipCardProps {
  clip: ShortsClip;
  jobId: string;
  onDeleteClip?: (clipId: string) => Promise<void> | void;
}

const ClipCard: React.FC<ClipCardProps> = ({ clip, jobId, onDeleteClip }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const duration = Math.max(0, Math.round(clip.endSeconds - clip.startSeconds));
  const isDone = clip.status === 'done';
  const isProcessing = clip.status === 'processing';
  const isQueued = clip.status === 'queued';
  const isFailed = clip.status === 'failed';
  const isBusy = isQueued || isProcessing;
  const aspectStyle = getAspectStyle(clip.aspect);

  // Keyboard navigation & outside click dismissal for 3-dot menu
  useEffect(() => {
    if (!isMenuOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsMenuOpen(false);
        triggerRef.current?.focus();
      }
    };

    const handlePointerDown = (e: MouseEvent | PointerEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isMenuOpen]);

  const handleConfirmDelete = async () => {
    if (!onDeleteClip) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDeleteClip(clip.id);
    } catch (err: unknown) {
      setDeleteError(getFriendlyErrorMessage(err));
      setIsDeleting(false);
      setIsConfirmingDelete(false);
    }
  };

  return (
    <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] flex flex-col justify-between space-y-3 relative">
      {/* Header: Status Chip, Aspect Badge, and 3-dot Menu */}
      <div className="flex items-center justify-between gap-2 relative">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Status Chip */}
          {isDone && (
            <span
              data-testid={`clip-status-${clip.id}`}
              className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 inline-flex items-center gap-1"
            >
              <CheckCircle2 className="w-2.5 h-2.5" />
              <span>DONE</span>
            </span>
          )}
          {isProcessing && (
            <span
              data-testid={`clip-status-${clip.id}`}
              className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded text-sky-400 bg-sky-500/10 border border-sky-500/20 inline-flex items-center gap-1"
            >
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              <span>PROCESSING</span>
            </span>
          )}
          {isQueued && (
            <span
              data-testid={`clip-status-${clip.id}`}
              className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded text-amber-400 bg-amber-500/10 border border-amber-500/20 inline-flex items-center gap-1"
            >
              <Clock className="w-2.5 h-2.5" />
              <span>QUEUED</span>
            </span>
          )}
          {isFailed && (
            <span
              data-testid={`clip-status-${clip.id}`}
              className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded text-rose-400 bg-rose-500/10 border border-rose-500/20 inline-flex items-center gap-1"
            >
              <AlertCircle className="w-2.5 h-2.5" />
              <span>FAILED</span>
            </span>
          )}

          {/* Aspect Badge */}
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700/60">
            {aspectStyle.label}
          </span>
        </div>

        {/* 3-dot Menu */}
        <div className="relative">
          <button
            ref={triggerRef}
            type="button"
            aria-label={`Options for clip ${clip.id.slice(0, 8)}`}
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-zinc-400"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {isMenuOpen && (
            <div
              ref={menuRef}
              role="menu"
              aria-label={`Options for clip ${clip.id.slice(0, 8)}`}
              className="absolute right-0 top-7 w-40 rounded-md bg-[#18181B] border border-zinc-700 shadow-2xl z-50 py-1 text-xs"
            >
              {isDone ? (
                <a
                  role="menuitem"
                  href={getClipDownloadUrl(jobId, clip.id)}
                  download={`clip_${clip.id.slice(0, 8)}.mp4`}
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-1.5 text-zinc-200 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
              ) : (
                <span
                  role="menuitem"
                  aria-disabled="true"
                  className="flex items-center gap-2 px-3 py-1.5 text-zinc-500 cursor-not-allowed select-none"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </span>
              )}

              <button
                type="button"
                role="menuitem"
                disabled={isBusy}
                title={isBusy ? 'Cannot delete clip while it is queued or processing' : undefined}
                onClick={() => {
                  if (isBusy) return;
                  setIsConfirmingDelete(true);
                  setIsMenuOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
                  isBusy
                    ? 'text-zinc-500 cursor-not-allowed select-none'
                    : 'text-rose-400 hover:bg-zinc-800 hover:text-rose-300 cursor-pointer'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete clip</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Visual Preview / Status Area using output aspect ratio */}
      <div
        className={`w-full rounded-md bg-[#09090B] border border-zinc-800 flex flex-col items-center justify-center text-zinc-500 relative overflow-hidden ${aspectStyle.containerClass}`}
      >
        {isDone ? (
          <video
            controls
            preload="metadata"
            src={getClipDownloadUrl(jobId, clip.id)}
            className="w-full h-full object-contain"
          />
        ) : isProcessing ? (
          <div className="flex flex-col items-center justify-center space-y-2 p-4 text-center">
            <Loader2 className="w-7 h-7 animate-spin text-sky-400" />
            <span className="text-xs font-medium text-zinc-200">FFmpeg Rendering...</span>
            <span className="text-[10px] text-zinc-400 font-mono">
              {formatDuration(clip.startSeconds)} - {formatDuration(clip.endSeconds)}
            </span>
          </div>
        ) : isQueued ? (
          <div className="flex flex-col items-center justify-center space-y-2 p-4 text-center">
            <Clock className="w-7 h-7 text-amber-400" />
            <span className="text-xs font-medium text-zinc-200">Queued in Engine</span>
            <span className="text-[10px] text-zinc-400 font-mono">Waiting for worker</span>
          </div>
        ) : isFailed ? (
          <div className="flex flex-col items-center justify-center space-y-2 p-4 text-center text-rose-400">
            <AlertCircle className="w-7 h-7" />
            <span className="text-xs font-medium">Processing Failed</span>
            <span className="text-[10px] text-zinc-400 font-mono">
              {clip.errorCode || 'Trimming error'}
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-1">
            <Scissors className="w-6 h-6 text-zinc-600" />
            <span className="text-[11px] font-mono text-zinc-400">Clip Preview</span>
          </div>
        )}
      </div>

      {/* Timestamps & Duration */}
      <div className="text-xs font-semibold text-zinc-100 flex items-center justify-between">
        <span>
          {formatDuration(clip.startSeconds)} - {formatDuration(clip.endSeconds)}
        </span>
        <span className="text-zinc-400 font-mono text-[11px] flex items-center gap-1">
          <Clock className="w-3 h-3 text-zinc-500" />
          {duration}s
        </span>
      </div>

      {/* Inline Delete Confirmation Step */}
      {isConfirmingDelete && (
        <div className="p-2.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-xs space-y-2">
          <div className="flex items-center gap-1.5 text-rose-300 font-medium">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Delete this clip?</span>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setIsConfirmingDelete(false)}
              className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleConfirmDelete}
              className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                <span>Confirm</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Inline Delete Error */}
      {deleteError && (
        <div
          role="alert"
          aria-live="polite"
          className="text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1.5 rounded-md flex items-center gap-1.5"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{deleteError}</span>
        </div>
      )}

      {/* Primary Download / Status Button */}
      {isDone ? (
        <a
          href={getClipDownloadUrl(jobId, clip.id)}
          download={`clip_${clip.id.slice(0, 8)}.mp4`}
          aria-label={`Download clip ${clip.id.slice(0, 8)}`}
          className="w-full py-2 px-3 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download MP4 Clip</span>
        </a>
      ) : (
        <button
          type="button"
          disabled
          aria-label={`Clip status: ${clip.status}`}
          className="w-full py-2 px-3 rounded-md bg-zinc-900 border border-zinc-800/80 text-xs font-medium text-zinc-500 flex items-center justify-center gap-1.5 cursor-not-allowed select-none"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Rendering...</span>
            </>
          ) : isQueued ? (
            <>
              <Clock className="w-3.5 h-3.5" />
              <span>Queued...</span>
            </>
          ) : (
            <span>Unavailable</span>
          )}
        </button>
      )}
    </div>
  );
};

export const ClipsGallery: React.FC<ClipsGalleryProps> = ({
  jobId,
  jobFilename,
  clips,
  onDeleteClip,
}) => {
  // Sort newest first
  const sortedClips = [...clips].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="space-y-4 pt-4 border-t border-zinc-800">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
          <span>Generated Clips for</span>
          <span className="text-zinc-400 font-normal truncate max-w-xs sm:max-w-md">
            {jobFilename}
          </span>
        </h2>
        <span className="text-xs font-mono text-zinc-400">
          {clips.length} {clips.length === 1 ? 'cut' : 'cuts'}
        </span>
      </div>

      {clips.length === 0 ? (
        <div className="p-8 rounded-lg bg-[#141418] border border-white/[0.06] text-center">
          <p className="text-xs text-zinc-400">No clips generated yet.</p>
        </div>
      ) : (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          aria-live="polite"
        >
          {sortedClips.map((clip) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              jobId={jobId}
              onDeleteClip={onDeleteClip}
            />
          ))}
        </div>
      )}
    </div>
  );
};
