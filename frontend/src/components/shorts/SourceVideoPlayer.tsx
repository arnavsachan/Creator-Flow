import React from 'react';
import { FileVideo } from 'lucide-react';
import type { ShortsJob } from '../../types/shorts';
import { getSourcePreviewUrl } from '../../services/shortsService';
import { formatDuration, formatFileSize, truncateFilename } from '../../utils/shortsFormat';

interface SourceVideoPlayerProps {
  job: ShortsJob;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onTimeUpdate?: (currentTime: number) => void;
}

export const SourceVideoPlayer: React.FC<SourceVideoPlayerProps> = ({
  job,
  videoRef,
  onTimeUpdate,
}) => {
  const isPortrait = job.height > job.width;
  const aspectRatio = job.width > 0 && job.height > 0 ? `${job.width} / ${job.height}` : '16 / 9';

  return (
    <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] space-y-3">
      {/* File & Metadata Bar */}
      <div className="flex items-center justify-between text-xs pb-2 border-b border-zinc-800 gap-2">
        <div
          className="flex items-center gap-2 font-medium text-zinc-200 truncate min-w-0"
          title={job.originalFilename}
        >
          <FileVideo className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="truncate">{truncateFilename(job.originalFilename, 36)}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-400 shrink-0">
          <span>{formatFileSize(job.sizeBytes)}</span>
          <span className="hidden sm:inline">
            {job.width}x{job.height}
          </span>
          <span>{formatDuration(job.durationSeconds)}</span>
        </div>
      </div>

      {/* Video Viewport Container: sized from job dimensions; portrait centered & capped at 60vh */}
      <div className="w-full flex items-center justify-center bg-[#09090B] rounded-md border border-zinc-800 overflow-hidden">
        <div
          className={`relative flex items-center justify-center overflow-hidden ${
            isPortrait ? 'mx-auto' : 'w-full'
          }`}
          style={{
            aspectRatio,
            maxHeight: '60vh',
            maxWidth: '100%',
          }}
        >
          <video
            ref={videoRef}
            controls
            preload="metadata"
            src={getSourcePreviewUrl(job.id)}
            className="w-full h-full object-contain"
            onTimeUpdate={(e) => {
              if (onTimeUpdate) {
                onTimeUpdate(e.currentTarget.currentTime);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
};
