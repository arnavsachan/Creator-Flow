import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { ErrorState } from '../components/states/ErrorState';
import { LoadingSkeleton } from '../components/states/LoadingSkeleton';
import { ShortsHeader } from '../components/shorts/ShortsHeader';
import { ShortsUploadDropzone } from '../components/shorts/ShortsUploadDropzone';
import { SourceVideoPlayer } from '../components/shorts/SourceVideoPlayer';
import { TimelineTrimmer } from '../components/shorts/TimelineTrimmer';
import { ClipSettingsCard } from '../components/shorts/ClipSettingsCard';
import { JobsList } from '../components/shorts/JobsList';
import { ClipsGallery } from '../components/shorts/ClipsGallery';
import { TranscriptPanel } from '../components/shorts/TranscriptPanel';
import { HighlightsPanel } from '../components/shorts/HighlightsPanel';
import {
  createClip,
  deleteClip,
  deleteJob,
  getFriendlyErrorMessage,
  listJobs,
  uploadJob,
} from '../services/shortsService';
import type { AspectRatio, HighlightsData, ShortsClip, ShortsJob, TranscriptData } from '../types/shorts';
import { formatFileSize } from '../utils/shortsFormat';

const MAX_CLIP_SECONDS = 180;
const MAX_UPLOAD_MB = 500;
const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.webm'];

export const ShortsClipperPage: React.FC = () => {
  const [jobs, setJobs] = useState<ShortsJob[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isFeatureDisabled, setIsFeatureDisabled] = useState<boolean>(false);
  const [pageError, setPageError] = useState<string | null>(null);

  // Upload state
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Video playback & Trimmer state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [startSeconds, setStartSeconds] = useState<number>(0);
  const [endSeconds, setEndSeconds] = useState<number>(30);
  const [aspect, setAspect] = useState<AspectRatio>('vertical_9_16');
  const [isCreatingClip, setIsCreatingClip] = useState<boolean>(false);
  const [trimError, setTrimError] = useState<string | null>(null);

  // Mode switcher & preserved studio state
  const [clipperMode, setClipperMode] = useState<'manual' | 'ai'>('manual');
  const [transcriptsByJob, setTranscriptsByJob] = useState<Record<string, TranscriptData>>({});
  const [highlightsByJob, setHighlightsByJob] = useState<Record<string, HighlightsData>>({});
  const [selectedHighlightIdsByJob, setSelectedHighlightIdsByJob] = useState<Record<string, Set<string>>>({});

  const activeJob = jobs.find((j) => j.id === activeJobId) || null;

  const selectActiveJob = (job: ShortsJob | null) => {
    setActiveJobId(job ? job.id : null);
    setCurrentTime(0);
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
    } catch (err: unknown) {
      const errorObj = err as { status?: number; code?: string };
      if (errorObj?.status === 503 || errorObj?.code === 'FEATURE_DISABLED') {
        setIsFeatureDisabled(true);
      } else {
        setPageError(getFriendlyErrorMessage(err));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Load jobs on initial mount
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
      .catch((err: unknown) => {
        const errorObj = err as { name?: string; code?: string; status?: number };
        if (!isMounted || errorObj?.name === 'CanceledError' || errorObj?.code === 'ERR_CANCELED') return;
        if (errorObj?.status === 503 || errorObj?.code === 'FEATURE_DISABLED') {
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
      } catch (err: unknown) {
        const errorObj = err as { name?: string; code?: string };
        if (errorObj?.name === 'CanceledError' || errorObj?.code === 'ERR_CANCELED') return;
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
      setUploadError(`File size (${formatFileSize(file.size)}) exceeds maximum limit of 500MB.`);
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
    } catch (err: unknown) {
      setUploadProgress(null);
      const errorObj = err as { status?: number; code?: string };
      if (errorObj?.status === 503 || errorObj?.code === 'FEATURE_DISABLED') {
        setIsFeatureDisabled(true);
      } else {
        setUploadError(getFriendlyErrorMessage(err));
      }
    }
  };

  // Determine trimmer validation error
  const computeValidationError = (): string | null => {
    if (!activeJob) return null;
    const start = Number(startSeconds);
    const end = Number(endSeconds);

    if (isNaN(start) || isNaN(end) || start < 0) {
      return 'Start time must be greater than or equal to 0.';
    }
    if (start >= end) {
      return 'End time must be strictly greater than start time.';
    }
    if (end > activeJob.durationSeconds) {
      return `End time (${end}s) exceeds video duration (${Math.round(activeJob.durationSeconds)}s).`;
    }
    if (end - start > MAX_CLIP_SECONDS) {
      return `Clip length (${Math.round(end - start)}s) exceeds max limit of 180 seconds.`;
    }
    return null;
  };

  const validationError = computeValidationError();

  const handleCreateClip = async () => {
    if (!activeJob) return;
    setTrimError(null);

    const validationMsg = computeValidationError();
    if (validationMsg) {
      setTrimError(validationMsg);
      return;
    }

    setIsCreatingClip(true);
    try {
      const newClip = await createClip(activeJob.id, {
        start_seconds: Number(startSeconds),
        end_seconds: Number(endSeconds),
        aspect,
      });

      // Update active job with new clip
      setJobs((prev) =>
        prev.map((j) => (j.id === activeJob.id ? { ...j, clips: [newClip, ...j.clips] } : j))
      );
    } catch (err: unknown) {
      const errorObj = err as { status?: number; code?: string };
      if (errorObj?.status === 503 || errorObj?.code === 'FEATURE_DISABLED') {
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
    } catch (err: unknown) {
      setPageError(getFriendlyErrorMessage(err));
    }
  };

  const handleDeleteClip = async (jobId: string, clipId: string) => {
    await deleteClip(jobId, clipId);
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId ? { ...j, clips: j.clips.filter((c) => c.id !== clipId) } : j
      )
    );
  };

  const handleSeekVideo = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
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

  const handleSelectTranscriptSegment = (start: number, end: number) => {
    if (!activeJob) return;
    const safeStart = Math.max(0, Math.min(start, activeJob.durationSeconds));
    const segmentDuration = Math.max(0.5, end - start);
    const clampedLength = Math.min(segmentDuration, MAX_CLIP_SECONDS);
    const safeEnd = Math.min(activeJob.durationSeconds, safeStart + clampedLength);

    setStartSeconds(parseFloat(safeStart.toFixed(2)));
    setEndSeconds(parseFloat(safeEnd.toFixed(2)));
    setTrimError(null);
  };

  const handleClipsGenerated = (newClips: ShortsClip[]) => {
    if (!activeJobId || newClips.length === 0) return;
    const normalizedClips: ShortsClip[] = newClips.map((c) => ({
      id: c.id,
      jobId: c.jobId ?? (c as unknown as { job_id?: string }).job_id ?? activeJobId,
      startSeconds: Number(c.startSeconds ?? (c as unknown as { start_seconds?: number }).start_seconds ?? 0),
      endSeconds: Number(c.endSeconds ?? (c as unknown as { end_seconds?: number }).end_seconds ?? 0),
      aspect: c.aspect || 'vertical_9_16',
      status: c.status || 'queued',
      errorCode: c.errorCode ?? (c as unknown as { error_code?: string }).error_code ?? null,
      createdAt: c.createdAt ?? (c as unknown as { created_at?: string }).created_at ?? new Date().toISOString(),
      finishedAt: c.finishedAt ?? (c as unknown as { finished_at?: string }).finished_at ?? null,
    }));

    setJobs((prev) =>
      prev.map((j) => {
        if (j.id === activeJobId) {
          const existingIds = new Set(j.clips.map((clip) => clip.id));
          const uniqueNew = normalizedClips.filter((clip) => !existingIds.has(clip.id));
          return {
            ...j,
            clips: [...uniqueNew, ...j.clips],
          };
        }
        return j;
      })
    );
  };

  const handleApplyTrimmerFromHighlight = (start: number, end: number) => {
    setStartSeconds(start);
    setEndSeconds(end);
    setTrimError(null);
    setClipperMode('manual');
    handleSeekVideo(start);
  };

  const handlePreviewRange = (seconds: number) => {
    handleSeekVideo(seconds);
    if (videoRef.current) {
      videoRef.current.play?.().catch(() => {});
    }
  };

  const handleTranscriptLoaded = useCallback((data: TranscriptData) => {
    if (!activeJobId) return;
    setTranscriptsByJob((prev) => (prev[activeJobId] === data ? prev : { ...prev, [activeJobId]: data }));
  }, [activeJobId]);

  const handleHighlightsLoaded = useCallback((data: HighlightsData) => {
    if (!activeJobId) return;
    setHighlightsByJob((prev) => (prev[activeJobId] === data ? prev : { ...prev, [activeJobId]: data }));
  }, [activeJobId]);

  const handleSelectionChange = useCallback((ids: Set<string>) => {
    if (!activeJobId) return;
    setSelectedHighlightIdsByJob((prev) => (prev[activeJobId] === ids ? prev : { ...prev, [activeJobId]: ids }));
  }, [activeJobId]);

  // 503 Feature Disabled State
  if (isFeatureDisabled) {
    return (
      <div className="max-w-[1400px] mx-auto space-y-6">
        <ShortsHeader mode={clipperMode} onModeChange={setClipperMode} />

        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-8 text-center max-w-lg mx-auto space-y-3">
          <div className="w-10 h-10 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mx-auto">
            <AlertCircle className="w-5 h-5" />
          </div>
          <h2 className="font-semibold text-zinc-100 text-sm">Feature Disabled in this Environment</h2>
          <p className="text-xs text-zinc-400 leading-relaxed">
            The Shorts Clipper engine is restricted to authorized testing environments until creator
            authentication is enabled.
          </p>
          <button
            type="button"
            onClick={reloadJobs}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors cursor-pointer mt-2 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none"
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
        <ShortsHeader mode={clipperMode} onModeChange={setClipperMode} />
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
      <ShortsHeader mode={clipperMode} onModeChange={setClipperMode} />

      {/* Upload Zone (Large dropzone when no active job; slim bar when active job exists) */}
      <ShortsUploadDropzone
        hasActiveJob={!!activeJob}
        uploadProgress={uploadProgress}
        uploadError={uploadError}
        onFileSelect={handleFileUpload}
      />

      {/* Workspace Layout: Separated by active mode */}
      {activeJob ? (
        clipperMode === 'manual' ? (
          /* Manual Mode: 2-column workspace (Player + Trimmer left; Settings + Jobs right) */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Left Column (lg:col-span-2): Source Player + Timeline Trimmer */}
            <div className="lg:col-span-2 space-y-6">
              <SourceVideoPlayer
                job={activeJob}
                videoRef={videoRef}
                onTimeUpdate={(t) => setCurrentTime(t)}
              />

              <TimelineTrimmer
                durationSeconds={activeJob.durationSeconds}
                startSeconds={startSeconds}
                endSeconds={endSeconds}
                currentTime={currentTime}
                onChangeStart={(s) => setStartSeconds(s)}
                onChangeEnd={(e) => setEndSeconds(e)}
                onSetStartToCurrent={setStartFromCurrentVideoTime}
                onSetEndToCurrent={setEndFromCurrentVideoTime}
                onSeek={handleSeekVideo}
                validationError={validationError || trimError}
              />
            </div>

            {/* Right Column (lg:col-span-1): Clip Settings + Jobs List */}
            <div className="space-y-6">
              <ClipSettingsCard
                aspect={aspect}
                onAspectChange={(asp) => setAspect(asp)}
                isCreatingClip={isCreatingClip}
                onGenerateClip={handleCreateClip}
                selectedLength={Math.max(0, endSeconds - startSeconds)}
                validationError={validationError || trimError}
              />

              <JobsList
                jobs={jobs}
                activeJobId={activeJobId}
                onSelectJob={(j) => selectActiveJob(j)}
                onDeleteJob={handleDeleteJob}
              />
            </div>
          </div>
        ) : (
          /* AI Auto-Clip Studio Mode: 2-column layout (Player + Transcript left; Highlights + Jobs right) */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Left Column (lg:col-span-2): Video Player on top, Transcript Panel directly below */}
            <div className="lg:col-span-2 space-y-6">
              <SourceVideoPlayer
                job={activeJob}
                videoRef={videoRef}
                onTimeUpdate={(t) => setCurrentTime(t)}
              />

              <TranscriptPanel
                jobId={activeJob.id}
                initialTranscript={transcriptsByJob[activeJob.id] || null}
                onTranscriptLoaded={handleTranscriptLoaded}
                onSelectSegment={handleSelectTranscriptSegment}
                onSeek={handlePreviewRange}
              />
            </div>

            {/* Right Column (lg:col-span-1): AI Suggested Clips on top, Jobs List below */}
            <div className="space-y-6">
              <HighlightsPanel
                jobId={activeJob.id}
                initialHighlights={highlightsByJob[activeJob.id] || null}
                initialSelectedIds={selectedHighlightIdsByJob[activeJob.id]}
                onHighlightsLoaded={handleHighlightsLoaded}
                onSelectionChange={handleSelectionChange}
                onSeek={handlePreviewRange}
                onApplyTrimmer={handleApplyTrimmerFromHighlight}
                onClipsGenerated={handleClipsGenerated}
              />

              <JobsList
                jobs={jobs}
                activeJobId={activeJobId}
                onSelectJob={(j) => selectActiveJob(j)}
                onDeleteJob={handleDeleteJob}
              />
            </div>
          </div>
        )
      ) : (
        /* Empty State when no jobs uploaded */
        <div className="p-12 rounded-lg bg-[#141418] border border-white/[0.06] text-center space-y-2">
          <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 mx-auto">
            <RefreshCw className="w-5 h-5" />
          </div>
          <h2 className="text-sm font-medium text-zinc-200">No Videos Uploaded Yet</h2>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            Upload a long-form video above to begin selecting manual timestamp ranges and rendering vertical clips.
          </p>
        </div>
      )}

      {/* Clips Gallery for Active Job */}
      {activeJob && (
        <ClipsGallery
          jobId={activeJob.id}
          jobFilename={activeJob.originalFilename}
          clips={activeJob.clips}
          onDeleteClip={(clipId) => handleDeleteClip(activeJob.id, clipId)}
        />
      )}
    </div>
  );
};

export default ShortsClipperPage;
