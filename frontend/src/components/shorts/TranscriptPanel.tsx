import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, FileText, Loader2, RefreshCw } from 'lucide-react';
import { getTranscript, startTranscription } from '../../services/shortsService';
import type { TranscriptData, TranscriptState } from '../../types/shorts';
import { formatDuration } from '../../utils/shortsFormat';

interface TranscriptPanelProps {
  jobId: string;
  onSelectSegment: (start: number, end: number) => void;
  onSeek: (seconds: number) => void;
}

const FRIENDLY_ERROR_MAP: Record<string, string> = {
  NO_AUDIO_STREAM: 'This video does not contain an audio stream to transcribe.',
  MODEL_DOWNLOAD_FAILED: 'Failed to download the speech recognition model. Please check your internet connection.',
  INTERRUPTED: 'Transcription was interrupted by a previous server restart. Please retry.',
  TRANSCRIPTION_BUSY: 'Another transcription is currently in progress. Please wait and retry.',
  TRANSCRIPTION_UNAVAILABLE: 'The optional local transcription package is not installed on this machine.',
};

export const TranscriptPanel: React.FC<TranscriptPanelProps> = ({
  jobId,
  onSelectSegment,
  onSeek,
}) => {
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const [panelState, setPanelState] = useState<TranscriptState | 'loading'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [prevJobId, setPrevJobId] = useState<string>(jobId);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  if (prevJobId !== jobId) {
    setPrevJobId(jobId);
    setPanelState('loading');
    setTranscript(null);
    setErrorMessage(null);
  }

  const clearPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const loadTranscript = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await getTranscript(jobId, signal);
        setTranscript(data);
        if (data.state === 'failed') {
          const friendly =
            (data.errorCode && FRIENDLY_ERROR_MAP[data.errorCode]) ||
            'Transcription failed. Please try again.';
          setErrorMessage(friendly);
          setPanelState('failed');
          clearPolling();
        } else if (data.state === 'done') {
          setPanelState('done');
          setErrorMessage(null);
          clearPolling();
        } else if (data.state === 'running') {
          setPanelState('running');
          setErrorMessage(null);
        } else {
          setPanelState('none');
          setErrorMessage(null);
          clearPolling();
        }
        return data;
      } catch (err: unknown) {
        const errObj = err as { status?: number; code?: string; message?: string };
        if (errObj?.status === 503 || errObj?.code === 'TRANSCRIPTION_UNAVAILABLE') {
          setPanelState('unavailable');
          clearPolling();
        } else {
          setErrorMessage('Failed to fetch transcript status.');
          setPanelState('failed');
          clearPolling();
        }
        return null;
      }
    },
    [jobId, clearPolling]
  );

  const startPolling = useCallback(() => {
    clearPolling();
    pollTimerRef.current = setInterval(async () => {
      const data = await loadTranscript();
      if (data && (data.state === 'done' || data.state === 'failed')) {
        clearPolling();
      }
    }, 2000);
  }, [clearPolling, loadTranscript]);

  const handleGenerate = async () => {
    setPanelState('running');
    setErrorMessage(null);
    try {
      const data = await startTranscription(jobId);
      setTranscript(data);
      startPolling();
    } catch (err: unknown) {
      const errObj = err as { status?: number; code?: string; message?: string };
      if (errObj?.status === 503 || errObj?.code === 'TRANSCRIPTION_UNAVAILABLE') {
        setPanelState('unavailable');
      } else {
        const code = errObj?.code;
        const friendly =
          (code && FRIENDLY_ERROR_MAP[code]) ||
          'Could not start transcription. Please try again.';
        setErrorMessage(friendly);
        setPanelState('failed');
      }
    }
  };

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    clearPolling();

    getTranscript(jobId, controller.signal)
      .then((data) => {
        if (!isMounted) return;
        setTranscript(data);
        if (data.state === 'failed') {
          const friendly =
            (data.errorCode && FRIENDLY_ERROR_MAP[data.errorCode]) ||
            'Transcription failed. Please try again.';
          setErrorMessage(friendly);
          setPanelState('failed');
          clearPolling();
        } else if (data.state === 'done') {
          setPanelState('done');
          setErrorMessage(null);
          clearPolling();
        } else if (data.state === 'running') {
          setPanelState('running');
          setErrorMessage(null);
          startPolling();
        } else {
          setPanelState('none');
          setErrorMessage(null);
          clearPolling();
        }
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        const errObj = err as { status?: number; code?: string; message?: string; name?: string };
        if (errObj?.name === 'CanceledError' || errObj?.code === 'ERR_CANCELED') return;
        if (errObj?.status === 503 || errObj?.code === 'TRANSCRIPTION_UNAVAILABLE') {
          setPanelState('unavailable');
          clearPolling();
        } else {
          setErrorMessage('Failed to fetch transcript status.');
          setPanelState('failed');
          clearPolling();
        }
      });

    return () => {
      isMounted = false;
      controller.abort();
      clearPolling();
    };
  }, [jobId, startPolling, clearPolling]);

  return (
    <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] space-y-3">
      {/* Header Bar */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-800 text-xs">
        <div className="flex items-center gap-2 font-medium text-zinc-200">
          <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-semibold uppercase tracking-wider text-[11px] text-zinc-300">
            Transcript
          </span>
        </div>
        {panelState === 'done' && (
          <span className="text-[11px] font-mono text-zinc-500">
            {transcript?.segments.length || 0} segments
          </span>
        )}
      </div>

      {/* State: Initial Loading Skeleton */}
      {panelState === 'loading' && (
        <div className="py-6 flex items-center justify-center text-zinc-500 text-xs gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
          <span>Loading transcript status...</span>
        </div>
      )}

      {/* State: Unavailable (optional package not installed) */}
      {panelState === 'unavailable' && (
        <div className="p-4 rounded-md bg-zinc-900/50 border border-zinc-800 text-center space-y-2">
          <AlertCircle className="w-5 h-5 text-zinc-500 mx-auto" />
          <p className="text-xs text-zinc-300 font-medium">Local Transcription Unavailable</p>
          <p className="text-[11px] text-zinc-400 max-w-sm mx-auto leading-relaxed">
            The optional local speech transcription package (faster-whisper) is not installed on this machine.
          </p>
        </div>
      )}

      {/* State: None (Not Generated) */}
      {panelState === 'none' && (
        <div className="p-5 rounded-md bg-zinc-900/30 border border-dashed border-zinc-800 text-center space-y-3">
          <button
            type="button"
            onClick={handleGenerate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors cursor-pointer shadow-sm focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Generate transcript</span>
          </button>
          <p className="text-[11px] text-zinc-500">
            Runs locally on this computer and may take a few minutes.
          </p>
        </div>
      )}

      {/* State: Running */}
      {panelState === 'running' && (
        <div className="p-6 rounded-md bg-zinc-900/40 border border-zinc-800/60 text-center space-y-3">
          <Loader2 className="w-5 h-5 text-emerald-400 animate-spin mx-auto" />
          <div className="space-y-1">
            <p className="text-xs font-medium text-zinc-200">Transcribing audio locally...</p>
            <p className="text-[11px] text-zinc-500 max-w-sm mx-auto leading-relaxed">
              Processing speech on this machine. This may take a couple of minutes depending on video duration.
            </p>
          </div>
        </div>
      )}

      {/* State: Failed */}
      {panelState === 'failed' && (
        <div className="p-4 rounded-md bg-rose-500/10 border border-rose-500/20 text-center space-y-2.5">
          <AlertCircle className="w-5 h-5 text-rose-400 mx-auto" />
          <p className="text-xs text-rose-300 leading-relaxed font-medium">
            {errorMessage || 'Transcription failed.'}
          </p>
          <button
            type="button"
            onClick={handleGenerate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* State: Done */}
      {panelState === 'done' && transcript && (
        <div className="space-y-3">
          {/* Truncated note if video exceeded cap */}
          {transcript.truncated && (
            <div className="text-[11px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded px-2.5 py-1.5 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Video exceeds 10 minutes. Transcript covers the first 10 minutes.</span>
            </div>
          )}

          {/* Scrollable Segment List */}
          <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1 divide-y divide-zinc-800/40">
            {transcript.segments.length > 0 ? (
              transcript.segments.map((seg, idx) => (
                <button
                  key={`${seg.start}-${seg.end}-${idx}`}
                  type="button"
                  onClick={() => {
                    onSelectSegment(seg.start, seg.end);
                    onSeek(seg.start);
                  }}
                  className="w-full text-left p-2 rounded-md hover:bg-zinc-800/60 transition-colors cursor-pointer group flex items-start gap-2.5 focus-visible:ring-1 focus-visible:ring-emerald-400 focus-visible:outline-none"
                  title="Click to jump player and set trimmer"
                >
                  <span className="shrink-0 text-[11px] font-mono font-medium text-emerald-400 group-hover:text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                    {formatDuration(seg.start)} - {formatDuration(seg.end)}
                  </span>
                  <span className="text-xs text-zinc-300 group-hover:text-zinc-100 leading-relaxed break-words flex-1">
                    {seg.text}
                  </span>
                </button>
              ))
            ) : (
              <p className="text-xs text-zinc-500 py-3 text-center">
                No speech detected in this video.
              </p>
            )}
          </div>

          {/* Model and Device Metadata */}
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 pt-2 border-t border-zinc-800/60">
            <span>Language: {transcript.languageDetected || 'auto'}</span>
            <span>Model: {transcript.modelSize || 'medium'}</span>
            <span>Device: {(transcript.deviceUsed || 'cpu').toUpperCase()}</span>
          </div>
        </div>
      )}
    </div>
  );
};
