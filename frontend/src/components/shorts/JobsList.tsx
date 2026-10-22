import React, { useState } from 'react';
import { Check, Trash2, X } from 'lucide-react';
import type { ShortsJob } from '../../types/shorts';
import {
  formatDuration,
  formatFileSize,
  formatRelativeTime,
  truncateFilename,
} from '../../utils/shortsFormat';

interface JobsListProps {
  jobs: ShortsJob[];
  activeJobId: string | null;
  onSelectJob: (job: ShortsJob) => void;
  onDeleteJob: (jobId: string) => Promise<void> | void;
}

export const JobsList: React.FC<JobsListProps> = ({
  jobs,
  activeJobId,
  onSelectJob,
  onDeleteJob,
}) => {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
        <span className="text-xs font-semibold text-zinc-100">Video Jobs</span>
        <span className="text-[11px] font-mono text-zinc-400">
          {jobs.length} {jobs.length === 1 ? 'video' : 'videos'}
        </span>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
        {jobs.map((job) => {
          const isActive = job.id === activeJobId;
          const isConfirmingDelete = confirmDeleteId === job.id;

          return (
            <div
              key={job.id}
              className={`p-3 rounded-md border text-xs transition-colors flex flex-col gap-2 ${
                isActive
                  ? 'border-zinc-500/80 bg-zinc-800/40 text-zinc-100'
                  : 'border-zinc-800/80 bg-[#09090B] text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onSelectJob(job)}
                  className="flex-1 text-left cursor-pointer min-w-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 rounded"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="font-medium text-zinc-200 truncate"
                      title={job.originalFilename}
                    >
                      {truncateFilename(job.originalFilename, 22)}
                    </span>
                    {isActive && (
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-200 border border-zinc-700 shrink-0">
                        ACTIVE
                      </span>
                    )}
                  </div>

                  <div className="text-[10px] text-zinc-400 font-mono mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span>{formatDuration(job.durationSeconds)}</span>
                    <span>•</span>
                    <span>{formatFileSize(job.sizeBytes)}</span>
                    <span>•</span>
                    <span>
                      {job.width}x{job.height}
                    </span>
                    <span>•</span>
                    <span>
                      {job.clips.length} {job.clips.length === 1 ? 'clip' : 'clips'}
                    </span>
                    <span>•</span>
                    <span>{formatRelativeTime(job.createdAt)}</span>
                  </div>
                </button>

                {/* Inline confirmation delete step */}
                {isConfirmingDelete ? (
                  <div className="flex items-center gap-1 shrink-0 bg-zinc-900 border border-zinc-700 rounded p-1">
                    <span className="text-[10px] text-zinc-300 font-medium px-1">Delete?</span>
                    <button
                      type="button"
                      aria-label="Confirm delete"
                      onClick={async (e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(null);
                        await onDeleteJob(job.id);
                      }}
                      className="p-1 rounded bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/40 transition-colors cursor-pointer"
                      title="Confirm delete"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      aria-label="Cancel delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(null);
                      }}
                      className="p-1 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                      title="Cancel"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-label={`Delete video ${job.originalFilename}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(job.id);
                    }}
                    title="Delete video and clips"
                    className="p-1.5 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-colors cursor-pointer shrink-0 focus-visible:ring-1 focus-visible:ring-zinc-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
