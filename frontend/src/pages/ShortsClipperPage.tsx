import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Clock,
  Download,
  FileVideo,
  Loader2,
  RefreshCw,
  Scissors,
  Smartphone,
  Trash2,
  Upload,
} from 'lucide-react';
import { ErrorState } from '../components/states/ErrorState';
import { LoadingSkeleton } from '../components/states/LoadingSkeleton';
import {
  createClip,
  deleteJob,
  getClipDownloadUrl,
  getFriendlyErrorMessage,
  getSourcePreviewUrl,
  listJobs,
  uploadJob,
} from '../services/shortsService';
import type { AspectRatio, ShortsClip, ShortsJob } from '../types/shorts';

const MAX_CLIP_SECONDS = 180;
const MAX_UPLOAD_MB = 500;
const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.webm'];

function formatSeconds(secs: number): string {
  if (isNaN(secs) || secs < 0) return '00:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const ShortsClipperPage: React.FC = () => {
  const [jobs, setJobs] = useState<ShortsJob[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isFeatureDisabled, setIsFeatureDisabled] = useState<boolean>(false);
  const [pageError, setPageError] = useState<string | null>(null);

  // Upload state
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Trimmer state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [startSeconds, setStartSeconds] = useState<number>(0);
  const [endSeconds, setEndSeconds] = useState<number>(30);
  const [aspect, setAspect] = useState<AspectRatio>('vertical_9_16');
  const [isCreatingClip, setIsCreatingClip] = useState<boolean>(false);
  const [trimError, setTrimError] = useState<string | null>(null);

  const activeJob = jobs.find((j) => j.id === activeJobId) || null;

  const selectActiveJob = (job: ShortsJob | null) => {
    setActiveJobId(job ? job.id : null);
    if (job) {
      setStartSeconds(0);
      setEndSeconds(Math.min(job.durationSeconds, 30));
      setTrimError(null);
    } else {
      setStartSeconds(0);
      setEndSeconds(30);
      setTrimError(null);
    }
  };

  const reloadJobs = async () => {
    setIsLoading(true);
    try {
      const data = await listJobs();
      setJobs(data);
      setIsFeatureDisabled(false);
      setPageError(null);
      if (data.length > 0) {
        selectActiveJob(data[0]);
      } else {
        selectActiveJob(null);
      }
    } catch (err: any) {
      if (err?.status === 503 || err?.code === 'FEATURE_DISABLED') {
        setIsFeatureDisabled(true);
      } else {
        setPageError(getFriendlyErrorMessage(err));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Load jobs on mount
  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    listJobs(controller.signal)
      .then((data) => {
        if (!isMounted) return;
        setJobs(data);
        setIsFeatureDisabled(false);
        setPageError(null);
        if (data.length > 0) {
          const firstJob = data[0];
          setActiveJobId(firstJob.id);
          setStartSeconds(0);
          setEndSeconds(Math.min(firstJob.durationSeconds, 30));
          setTrimError(null);
        } else {
          setActiveJobId(null);
        }
      })
      .catch((err: any) => {
        if (!isMounted || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
        if (err?.status === 503 || err?.code === 'FEATURE_DISABLED') {
          setIsFeatureDisabled(true);
        } else {
          setPageError(getFriendlyErrorMessage(err));
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  // Polling for active clip jobs
  useEffect(() => {
    const hasPendingClips = jobs.some((job) =>
      job.clips.some((c) => c.status === 'queued' || c.status === 'processing')
    );

    if (!hasPendingClips || isFeatureDisabled) return;

    const controller = new AbortController();
    const intervalId = setInterval(async () => {
      try {
        const data = await listJobs(controller.signal);
        setJobs(data);
      } catch (err: any) {
        if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
      }
    }, 2000);

    return () => {
      clearInterval(intervalId);
      controller.abort();
    };
  }, [jobs, isFeatureDisabled]);

  // Handle file validation and upload
  const handleFileUpload = async (file: File) => {
    setUploadError(null);
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setUploadError(`Unsupported format '${ext}'. Allowed: .mp4, .mov, .mkv, .webm`);
      return;
    }

    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setUploadError(`File size (${formatBytes(file.size)}) exceeds maximum limit of 500MB.`);
      return;
    }

    setUploadProgress(0);
    try {
      const newJob = await uploadJob(file, (progress) => {
        setUploadProgress(progress);
      });
      setJobs((prev) => [newJob, ...prev.filter((j) => j.id !== newJob.id)]);
      selectActiveJob(newJob);
      setUploadProgress(null);
    } catch (err: any) {
      setUploadProgress(null);
      if (err?.status === 503 || err?.code === 'FEATURE_DISABLED') {
        setIsFeatureDisabled(true);
      } else {
        setUploadError(getFriendlyErrorMessage(err));
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleCreateClip = async () => {
    if (!activeJob) return;
    setTrimError(null);

    const start = Number(startSeconds);
    const end = Number(endSeconds);

    if (isNaN(start) || isNaN(end) || start < 0) {
      setTrimError('Start time must be greater than or equal to 0.');
      return;
    }

    if (start >= end) {
      setTrimError('End time must be strictly greater than start time.');
      return;
    }

    if (end > activeJob.durationSeconds) {
      setTrimError(
        `End time (${end}s) exceeds video duration (${Math.round(activeJob.durationSeconds)}s).`
      );
      return;
    }

    if (end - start > MAX_CLIP_SECONDS) {
      setTrimError(`Clip length (${Math.round(end - start)}s) exceeds max limit of 180 seconds.`);
      return;
    }

    setIsCreatingClip(true);
    try {
      const newClip = await createClip(activeJob.id, {
        start_seconds: start,
        end_seconds: end,
        aspect,
      });

      // Update active job with new clip
      setJobs((prev) =>
        prev.map((j) => (j.id === activeJob.id ? { ...j, clips: [newClip, ...j.clips] } : j))
      );
    } catch (err: any) {
      if (err?.status === 503 || err?.code === 'FEATURE_DISABLED') {
        setIsFeatureDisabled(true);
      } else {
        setTrimError(getFriendlyErrorMessage(err));
      }
    } finally {
      setIsCreatingClip(false);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    try {
      await deleteJob(jobId);
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      if (activeJobId === jobId) {
        const remaining = jobs.filter((j) => j.id !== jobId);
        selectActiveJob(remaining.length > 0 ? remaining[0] : null);
      }
    } catch (err: any) {
      setPageError(getFriendlyErrorMessage(err));
    }
  };

  const setStartFromCurrentVideoTime = () => {
    if (videoRef.current) {
      const cur = parseFloat(videoRef.current.currentTime.toFixed(1));
      setStartSeconds(cur);
    }
  };

  const setEndFromCurrentVideoTime = () => {
    if (videoRef.current) {
      const cur = parseFloat(videoRef.current.currentTime.toFixed(1));
      setEndSeconds(cur);
    }
  };

  // 503 Feature Disabled State
  if (isFeatureDisabled) {
    return (
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 tracking-tight">
              Shorts & Video Clip Trimmer
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Upload long-form video, set precision manual timestamps, re-frame to 9:16 vertical and download.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-8 text-center max-w-lg mx-auto space-y-3">
          <div className="w-10 h-10 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mx-auto">
            <AlertCircle className="w-5 h-5" />
          </div>
          <h3 className="font-semibold text-zinc-100 text-sm">Feature Disabled in this Environment</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            The Shorts Clipper engine is restricted to authorized testing environments until creator
            authentication is enabled.
          </p>
          <button
            type="button"
            onClick={reloadJobs}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors cursor-pointer mt-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Check Availability</span>
          </button>
        </div>
      </div>
    );
  }

  // Loading State
  if (isLoading) {
    return (
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="pb-4 border-b border-zinc-800">
          <LoadingSkeleton variant="text" className="w-64 h-6 mb-2" />
          <LoadingSkeleton variant="text" className="w-96 h-4" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <LoadingSkeleton variant="card" className="h-96 md:col-span-2" />
          <LoadingSkeleton variant="card" className="h-96" />
        </div>
      </div>
    );
  }

  // Global Error State
  if (pageError && jobs.length === 0) {
    return (
      <div className="max-w-[1400px] mx-auto space-y-6">
        <div className="pb-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-100">Shorts & Video Clip Trimmer</h2>
        </div>
        <ErrorState
          title="Failed to Load Video Clipper"
          message={pageError}
          onRetry={reloadJobs}
        />
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100 tracking-tight">
            Shorts & Video Clip Trimmer
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Manual timestamp trimming with FFmpeg re-encoding, 9:16 center-crop framing, and instant export.
          </p>
        </div>
      </div>

      {/* Upload Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`p-6 rounded-lg border transition-colors ${
          isDragging
            ? 'border-emerald-500/50 bg-emerald-500/5'
            : 'border-white/[0.06] bg-[#141418]'
        } flex flex-col items-center justify-center text-center space-y-3`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp4,.mov,.mkv,.webm"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFileUpload(e.target.files[0]);
            }
          }}
        />

        <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400">
          {uploadProgress !== null ? (
            <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
          ) : (
            <Upload className="w-5 h-5" />
          )}
        </div>

        <div className="space-y-1">
          <div className="text-xs font-medium text-zinc-200">
            {uploadProgress !== null ? (
              <span>Uploading & Validating Video ({uploadProgress}%)</span>
            ) : (
              <span>Drag & drop video here or browse file</span>
            )}
          </div>
          <div className="text-[11px] text-zinc-500">
            Supports MP4, MOV, MKV, WebM up to 500MB (max duration 60 mins).
          </div>
        </div>

        {uploadProgress !== null ? (
          <div className="w-full max-w-xs bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-2">
            <div
              className="bg-emerald-500 h-full transition-all duration-200"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-xs font-medium text-zinc-200 hover:text-white hover:border-zinc-700 transition-colors cursor-pointer"
          >
            Select Video File
          </button>
        )}

        {uploadError && (
          <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-md mt-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}
      </div>

      {/* Main Trimming Workspace */}
      {activeJob ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Video Preview and Trimmer Controls */}
          <div className="lg:col-span-2 space-y-4">
            {/* Active Video Player */}
            <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between text-xs pb-2 border-b border-zinc-800">
                <div className="flex items-center gap-2 font-medium text-zinc-200 truncate">
                  <FileVideo className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="truncate">{activeJob.originalFilename}</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-500 shrink-0">
                  <span>{formatBytes(activeJob.sizeBytes)}</span>
                  <span>
                    {activeJob.width}x{activeJob.height}
                  </span>
                  <span>{formatSeconds(activeJob.durationSeconds)}</span>
                </div>
              </div>

              {/* HTML5 Video Preview */}
              <div className="w-full aspect-video rounded-md bg-[#09090B] border border-zinc-800 overflow-hidden flex items-center justify-center">
                <video
                  ref={videoRef}
                  controls
                  preload="metadata"
                  src={getSourcePreviewUrl(activeJob.id)}
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Timestamp Trimmer Controls */}
              <div className="p-4 rounded-md bg-[#09090B] border border-zinc-800 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                    <Scissors className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Clip Boundaries & Format</span>
                  </span>
                  <span className="text-[11px] font-mono text-zinc-500">
                    Max clip duration: 180s
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Start time */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-zinc-400">
                      <label htmlFor="trim-start-seconds">Start Time (seconds)</label>
                      <button
                        type="button"
                        onClick={setStartFromCurrentVideoTime}
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                      >
                        Set to current time
                      </button>
                    </div>
                    <input
                      id="trim-start-seconds"
                      type="number"
                      min={0}
                      max={activeJob.durationSeconds}
                      step={0.1}
                      value={startSeconds}
                      onChange={(e) => setStartSeconds(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 rounded-md bg-[#141418] border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono"
                    />
                    <div className="text-[10px] text-zinc-500 font-mono">
                      Timestamp: {formatSeconds(startSeconds)}
                    </div>
                  </div>

                  {/* End time */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-zinc-400">
                      <label htmlFor="trim-end-seconds">End Time (seconds)</label>
                      <button
                        type="button"
                        onClick={setEndFromCurrentVideoTime}
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                      >
                        Set to current time
                      </button>
                    </div>
                    <input
                      id="trim-end-seconds"
                      type="number"
                      min={0}
                      max={activeJob.durationSeconds}
                      step={0.1}
                      value={endSeconds}
                      onChange={(e) => setEndSeconds(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 rounded-md bg-[#141418] border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono"
                    />
                    <div className="text-[10px] text-zinc-500 font-mono">
                      Timestamp: {formatSeconds(endSeconds)}
                    </div>
                  </div>
                </div>

                {/* Aspect Ratio Selector */}
                <div className="space-y-1.5">
                  <div className="text-xs text-zinc-400">Output Aspect Framing</div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setAspect('vertical_9_16')}
                      className={`p-2.5 rounded-md border text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                        aspect === 'vertical_9_16'
                          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                          : 'border-zinc-800 bg-[#141418] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                      }`}
                    >
                      <Smartphone className="w-4 h-4" />
                      <span>9:16 Vertical (1080x1920)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAspect('original')}
                      className={`p-2.5 rounded-md border text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                        aspect === 'original'
                          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                          : 'border-zinc-800 bg-[#141418] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                      }`}
                    >
                      <FileVideo className="w-4 h-4" />
                      <span>Original Aspect Ratio</span>
                    </button>
                  </div>
                </div>

                {trimError && (
                  <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-md">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{trimError}</span>
                  </div>
                )}

                <button
                  type="button"
                  disabled={isCreatingClip}
                  onClick={handleCreateClip}
                  className="w-full py-2.5 px-4 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm"
                >
                  {isCreatingClip ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Queuing Trim Job...</span>
                    </>
                  ) : (
                    <>
                      <Scissors className="w-4 h-4" />
                      <span>
                        Generate Clip ({Math.max(0, Math.round(endSeconds - startSeconds))}s)
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right Col: Video History & Job Switcher */}
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <span className="text-xs font-semibold text-zinc-200">Video Jobs</span>
                <span className="text-[11px] font-mono text-zinc-500">{jobs.length} uploaded</span>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className={`p-2.5 rounded-md border text-xs flex items-center justify-between transition-colors ${
                      job.id === activeJobId
                        ? 'border-emerald-500/40 bg-emerald-500/5 text-zinc-200'
                        : 'border-zinc-800 bg-[#09090B] text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => selectActiveJob(job)}
                      className="flex-1 text-left truncate mr-2 cursor-pointer"
                    >
                      <div className="font-medium truncate text-zinc-200">{job.originalFilename}</div>
                      <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                        {formatSeconds(job.durationSeconds)} • {formatBytes(job.sizeBytes)} •{' '}
                        {job.clips.length} {job.clips.length === 1 ? 'clip' : 'clips'}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteJob(job.id)}
                      title="Delete video and clips"
                      className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-12 rounded-lg bg-[#141418] border border-white/[0.06] text-center space-y-2">
          <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 mx-auto">
            <FileVideo className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-medium text-zinc-200">No Videos Uploaded Yet</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Upload a long-form video above to begin selecting manual timestamp ranges and rendering vertical clips.
          </p>
        </div>
      )}

      {/* Generated Clips List (Preserving layout aesthetic) */}
      {activeJob && (
        <div className="space-y-4 pt-4 border-t border-zinc-800">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-200">
              Generated Clips for {activeJob.originalFilename}
            </h3>
            <span className="text-xs font-mono text-zinc-500">
              {activeJob.clips.length} {activeJob.clips.length === 1 ? 'cut' : 'cuts'}
            </span>
          </div>

          {activeJob.clips.length === 0 ? (
            <div className="p-8 rounded-lg bg-[#141418] border border-white/[0.06] text-center space-y-1">
              <p className="text-xs text-zinc-400">No clips generated for this video yet.</p>
              <p className="text-[11px] text-zinc-600">
                Choose start and end timestamps above and click &quot;Generate Clip&quot;.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {activeJob.clips.map((clip: ShortsClip) => {
                const duration = Math.max(0, Math.round(clip.endSeconds - clip.startSeconds));
                const isDone = clip.status === 'done';
                const isProcessing = clip.status === 'processing' || clip.status === 'queued';
                const isFailed = clip.status === 'failed';

                return (
                  <div
                    key={clip.id}
                    className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] flex flex-col justify-between space-y-4"
                  >
                    {/* Visual Preview / Status Area */}
                    <div className="w-full aspect-[9/16] max-h-72 mx-auto rounded-md bg-[#09090B] border border-zinc-800 flex flex-col items-center justify-center text-zinc-500 relative overflow-hidden">
                      {isDone ? (
                        <video
                          controls
                          preload="metadata"
                          src={getClipDownloadUrl(activeJob.id, clip.id)}
                          className="w-full h-full object-contain"
                        />
                      ) : isProcessing ? (
                        <div className="flex flex-col items-center justify-center space-y-2 p-4 text-center">
                          <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                          <span className="text-xs font-medium text-zinc-300">
                            {clip.status === 'processing' ? 'FFmpeg Rendering...' : 'Queued...'}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono">
                            {formatSeconds(clip.startSeconds)} - {formatSeconds(clip.endSeconds)}
                          </span>
                        </div>
                      ) : isFailed ? (
                        <div className="flex flex-col items-center justify-center space-y-2 p-4 text-center text-rose-400">
                          <AlertCircle className="w-8 h-8" />
                          <span className="text-xs font-medium">Processing Failed</span>
                          <span className="text-[10px] text-zinc-500 font-mono">
                            {clip.errorCode || 'INTERRUPTED'}
                          </span>
                        </div>
                      ) : (
                        <>
                          <Smartphone className="w-8 h-8 text-zinc-600 mb-2" />
                          <span className="text-[11px] font-mono text-zinc-400">Vertical Cut</span>
                        </>
                      )}
                    </div>

                    {/* Metadata & Status */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-mono font-semibold px-2 py-0.5 rounded ${
                            isDone
                              ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                              : isProcessing
                              ? 'text-amber-400 bg-amber-500/10 border border-amber-500/20'
                              : 'text-rose-400 bg-rose-500/10 border border-rose-500/20'
                          }`}
                        >
                          {clip.status.toUpperCase()}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                          {clip.aspect === 'vertical_9_16' ? '9:16 Vertical' : 'Original Aspect'}
                        </span>
                      </div>

                      <div className="text-xs font-semibold text-zinc-100 flex items-center justify-between">
                        <span>
                          {formatSeconds(clip.startSeconds)} - {formatSeconds(clip.endSeconds)}
                        </span>
                        <span className="text-zinc-500 font-mono text-[11px] flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {duration}s
                        </span>
                      </div>
                    </div>

                    {/* Action Button */}
                    {isDone ? (
                      <a
                        href={getClipDownloadUrl(activeJob.id, clip.id)}
                        download={`clip_${clip.id.slice(0, 8)}.mp4`}
                        className="w-full py-2 px-3 rounded-md bg-zinc-900 border border-zinc-800 text-xs font-medium text-zinc-200 hover:text-white hover:border-zinc-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Download MP4 Clip</span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="w-full py-2 px-3 rounded-md bg-zinc-900/50 border border-zinc-800/50 text-xs font-medium text-zinc-500 flex items-center justify-center gap-1.5 cursor-not-allowed"
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Processing...</span>
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
      )}
    </div>
  );
};

export default ShortsClipperPage;
