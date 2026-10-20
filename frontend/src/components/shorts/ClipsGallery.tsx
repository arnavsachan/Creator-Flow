import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  Scissors,
} from 'lucide-react';
import type { ShortsClip } from '../../types/shorts';
import { getClipDownloadUrl } from '../../services/shortsService';
import { formatDuration } from '../../utils/shortsFormat';

interface ClipsGalleryProps {
  jobId: string;
  jobFilename: string;
  clips: ShortsClip[];
}

export const ClipsGallery: React.FC<ClipsGalleryProps> = ({
  jobId,
  jobFilename,
  clips,
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
        <div className="p-8 rounded-lg bg-[#141418] border border-white/[0.06] text-center space-y-1">
          <p className="text-xs text-zinc-300">No clips generated for this video yet.</p>
          <p className="text-[11px] text-zinc-500">
            Choose start and end timestamps above and click &quot;Generate Clip&quot;.
          </p>
        </div>
      ) : (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          aria-live="polite"
        >
          {sortedClips.map((clip) => {
            const duration = Math.max(0, Math.round(clip.endSeconds - clip.startSeconds));
            const isDone = clip.status === 'done';
            const isProcessing = clip.status === 'processing';
            const isQueued = clip.status === 'queued';
            const isFailed = clip.status === 'failed';
            const isVertical = clip.aspect === 'vertical_9_16';

            return (
              <div
                key={clip.id}
                className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] flex flex-col justify-between space-y-3"
              >
                {/* Visual Preview / Status Area using output aspect ratio */}
                <div
                  className={`w-full rounded-md bg-[#09090B] border border-zinc-800 flex flex-col items-center justify-center text-zinc-500 relative overflow-hidden ${
                    isVertical
                      ? 'aspect-[9/16] max-w-[220px] mx-auto'
                      : 'aspect-video max-w-[280px] mx-auto'
                  }`}
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
                      <span className="text-xs font-medium text-zinc-200">
                        FFmpeg Rendering...
                      </span>
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

                {/* Metadata & Status Chips */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-1">
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
                      {isVertical ? '9:16' : 'Original'}
                    </span>
                  </div>

                  <div className="text-xs font-semibold text-zinc-100 flex items-center justify-between">
                    <span>
                      {formatDuration(clip.startSeconds)} - {formatDuration(clip.endSeconds)}
                    </span>
                    <span className="text-zinc-400 font-mono text-[11px] flex items-center gap-1">
                      <Clock className="w-3 h-3 text-zinc-500" />
                      {duration}s
                    </span>
                  </div>
                </div>

                {/* Action Download / Status Button */}
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
          })}
        </div>
      )}
    </div>
  );
};
