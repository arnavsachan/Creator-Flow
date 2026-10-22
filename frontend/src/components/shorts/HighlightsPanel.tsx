import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Film, Loader2, Sparkles } from 'lucide-react';
import {
  generateHighlightClips,
  getFriendlyErrorMessage,
  getHighlights,
  getTranscript,
  startHighlights,
} from '../../services/shortsService';
import type { AspectRatio, HighlightSuggestion, HighlightsData, ShortsClip } from '../../types/shorts';
import { formatDuration } from '../../utils/shortsFormat';

interface HighlightsPanelProps {
  jobId: string;
  hasTranscript?: boolean;
  onSeek: (seconds: number) => void;
  onApplyTrimmer?: (start: number, end: number) => void;
  onClipsGenerated?: (clips: ShortsClip[]) => void;
  initialHighlights?: HighlightsData | null;
  initialSelectedIds?: Set<string>;
  onHighlightsLoaded?: (data: HighlightsData) => void;
  onSelectionChange?: (selectedIds: Set<string>) => void;
}

type PanelState = 'loading' | 'needs_transcript' | 'not_configured' | 'idle' | 'running' | 'done' | 'failed' | 'empty';

const ASPECT_OPTIONS: Array<{ value: AspectRatio; label: string }> = [
  { value: 'vertical_9_16', label: '9:16' },
  { value: 'square_1_1', label: '1:1' },
  { value: 'portrait_4_5', label: '4:5' },
  { value: 'landscape_16_9', label: '16:9' },
  { value: 'original', label: 'Original' },
];

export const HighlightsPanel: React.FC<HighlightsPanelProps> = ({
  jobId,
  hasTranscript: hasTranscriptProp,
  onSeek,
  onApplyTrimmer,
  onClipsGenerated,
  initialHighlights,
  initialSelectedIds,
  onHighlightsLoaded,
  onSelectionChange,
}) => {
  const [highlights, setHighlights] = useState<HighlightsData | null>(initialHighlights || null);
  const [panelState, setPanelState] = useState<PanelState>(() => {
    if (initialHighlights) {
      if (initialHighlights.state === 'done') {
        return initialHighlights.suggestions.length === 0 ? 'empty' : 'done';
      }
      if (initialHighlights.state === 'failed') return 'failed';
      if (initialHighlights.state === 'running') return 'running';
      return 'idle';
    }
    return 'loading';
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialHighlights?.errorCode
      ? getFriendlyErrorMessage({ code: initialHighlights.errorCode })
      : null
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    if (initialSelectedIds) return new Set(initialSelectedIds);
    if (initialHighlights?.suggestions) return new Set(initialHighlights.suggestions.map((s) => s.id));
    return new Set();
  });
  const [aspect, setAspect] = useState<AspectRatio>('vertical_9_16');
  const [isGeneratingClips, setIsGeneratingClips] = useState(false);
  const [generateFeedback, setGenerateFeedback] = useState<{ message: string; isError: boolean } | null>(null);

  const [prevJobId, setPrevJobId] = useState<string>(jobId);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef<boolean>(true);

  if (prevJobId !== jobId) {
    setPrevJobId(jobId);
    setPanelState(
      initialHighlights
        ? initialHighlights.state === 'done'
          ? initialHighlights.suggestions.length === 0
            ? 'empty'
            : 'done'
          : initialHighlights.state === 'failed'
          ? 'failed'
          : initialHighlights.state === 'running'
          ? 'running'
          : 'idle'
        : 'loading'
    );
    setHighlights(initialHighlights || null);
    setErrorMessage(null);
    setSelectedIds(
      initialSelectedIds
        ? new Set(initialSelectedIds)
        : initialHighlights?.suggestions
        ? new Set(initialHighlights.suggestions.map((s) => s.id))
        : new Set()
    );
    setGenerateFeedback(null);
  }

  const clearPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const pollHighlights = useCallback(async () => {
    try {
      const data = await getHighlights(jobId);
      if (!isMountedRef.current) return;
      setHighlights(data);

      if (data.state === 'failed') {
        const friendly = data.errorCode
          ? getFriendlyErrorMessage({ code: data.errorCode })
          : 'Failed to analyze highlights.';
        setErrorMessage(friendly);
        setPanelState('failed');
        clearPolling();
      } else if (data.state === 'done') {
        if (data.suggestions.length === 0) {
          setPanelState('empty');
        } else {
          setPanelState('done');
          const ids = new Set(data.suggestions.map((s) => s.id));
          setSelectedIds(ids);
          onSelectionChange?.(ids);
        }
        onHighlightsLoaded?.(data);
        setErrorMessage(null);
        clearPolling();
      }
    } catch {
      clearPolling();
    }
  }, [jobId, clearPolling, onHighlightsLoaded, onSelectionChange]);

  const startPolling = useCallback(() => {
    clearPolling();
    pollTimerRef.current = setInterval(() => {
      pollHighlights();
    }, 2000);
  }, [clearPolling, pollHighlights]);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    clearPolling();

    // If highlights are already provided in done state, skip re-fetching
    if (initialHighlights && initialHighlights.state === 'done') {
      return () => {
        isMounted = false;
        clearPolling();
      };
    }

    const fetchInitial = async () => {
      try {
        if (hasTranscriptProp === false) {
          if (!isMounted) return;
          setPanelState('needs_transcript');
          return;
        }

        const transcriptData = await getTranscript(jobId, controller.signal);
        if (!isMounted) return;

        if (
          transcriptData.state !== 'done' ||
          !transcriptData.segments ||
          transcriptData.segments.length === 0
        ) {
          setPanelState('needs_transcript');
          return;
        }

        const data = await getHighlights(jobId, controller.signal);
        if (!isMounted) return;
        setHighlights(data);

        if (data.state === 'failed') {
          const friendly = data.errorCode
            ? getFriendlyErrorMessage({ code: data.errorCode })
            : 'Failed to analyze highlights.';
          setErrorMessage(friendly);
          setPanelState('failed');
        } else if (data.state === 'done') {
          if (data.suggestions.length === 0) {
            setPanelState('empty');
          } else {
            setPanelState('done');
            const validIds = new Set(data.suggestions.map((s) => s.id));
            let ids: Set<string>;
            if (initialSelectedIds && initialSelectedIds.size > 0) {
              const filtered = new Set(
                Array.from(initialSelectedIds).filter((id) => validIds.has(id))
              );
              ids = filtered.size > 0 ? filtered : validIds;
            } else {
              ids = validIds;
            }
            setSelectedIds(ids);
            queueMicrotask(() => {
              if (isMountedRef.current) {
                onSelectionChange?.(ids);
                onHighlightsLoaded?.(data);
              }
            });
          }
          setErrorMessage(null);
        } else if (data.state === 'running') {
          setPanelState('running');
          setErrorMessage(null);
          startPolling();
        } else {
          setPanelState('idle');
          setErrorMessage(null);
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        const errObj = err as { status?: number; code?: string; message?: string };
        if (errObj?.status === 503 || errObj?.code === 'AI_NOT_CONFIGURED') {
          setPanelState('not_configured');
        } else if (errObj?.status === 409 || errObj?.code === 'TRANSCRIPT_REQUIRED') {
          setPanelState('needs_transcript');
        } else {
          setErrorMessage(getFriendlyErrorMessage(err));
          setPanelState('failed');
        }
      }
    };

    fetchInitial();

    return () => {
      isMounted = false;
      controller.abort();
      clearPolling();
    };
  }, [
    jobId,
    hasTranscriptProp,
    clearPolling,
    startPolling,
    initialHighlights,
    initialSelectedIds,
    onHighlightsLoaded,
    onSelectionChange,
  ]);

  const handleStartAnalysis = async () => {
    setPanelState('running');
    setErrorMessage(null);
    setGenerateFeedback(null);
    setSelectedIds(new Set());
    onSelectionChange?.(new Set());
    try {
      const data = await startHighlights(jobId);
      setHighlights(data);
      onHighlightsLoaded?.(data);
      startPolling();
    } catch (err: unknown) {
      const errObj = err as { status?: number; code?: string };
      if (errObj?.status === 503 || errObj?.code === 'AI_NOT_CONFIGURED') {
        setPanelState('not_configured');
      } else {
        setErrorMessage(getFriendlyErrorMessage(err));
        setPanelState('failed');
      }
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelectionChange?.(next);
  };

  const handleSelectAll = () => {
    if (!highlights?.suggestions) return;
    let next: Set<string>;
    if (selectedIds.size === highlights.suggestions.length) {
      next = new Set();
    } else {
      next = new Set(highlights.suggestions.map((s) => s.id));
    }
    setSelectedIds(next);
    onSelectionChange?.(next);
  };

  const handleGenerateClips = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setIsGeneratingClips(true);
    setGenerateFeedback(null);

    const selectedSuggestions = (highlights?.suggestions || [])
      .filter((s) => selectedIds.has(s.id))
      .map((s) => ({
        id: s.id,
        start: s.start,
        end: s.end,
        title: s.title,
        reason: s.reason,
      }));

    try {
      const clips = await generateHighlightClips(jobId, {
        suggestionIds: ids,
        suggestions: selectedSuggestions,
        aspect,
      });
      setGenerateFeedback({
        message: `Queued ${clips.length} clip(s) for rendering.`,
        isError: false,
      });
      onClipsGenerated?.(clips);
    } catch (err: unknown) {
      setGenerateFeedback({
        message: getFriendlyErrorMessage(err),
        isError: true,
      });
    } finally {
      setIsGeneratingClips(false);
    }
  };

  return (
    <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] space-y-4">
      {/* Panel Header */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-zinc-300" />
            <h3 className="text-xs font-semibold text-zinc-100">AI suggested clips</h3>
          </div>
        </div>
      </div>

      {/* State 1: Needs transcript first */}
      {panelState === 'needs_transcript' ? (
        <div className="p-4 rounded-md bg-zinc-900/60 border border-zinc-800 text-center space-y-2">
          <p className="text-xs text-zinc-400">
            Generate a transcript above to enable AI clip suggestions.
          </p>
          <button
            type="button"
            disabled
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-500 cursor-not-allowed"
          >
            Find best clips
          </button>
        </div>
      ) : panelState === 'loading' ? (
        /* State 2: Initial loading */
        <div className="flex items-center justify-center p-6 text-zinc-400 space-x-2">
          <Loader2 className="w-4 h-4 animate-spin text-zinc-300" />
          <span className="text-xs">Checking highlights status...</span>
        </div>
      ) : panelState === 'not_configured' ? (
        /* State 3: 503 AI_NOT_CONFIGURED */
        <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>AI is not configured on this server.</span>
        </div>
      ) : panelState === 'idle' ? (
        /* State 4: Idle state ready to analyze */
        <div className="p-4 rounded-md bg-zinc-900/50 border border-zinc-800 text-center space-y-3">
          <p className="text-xs text-zinc-300">
            Analyze the video transcript with AI to identify high-engagement highlights for shorts.
          </p>
          <button
            type="button"
            onClick={handleStartAnalysis}
            className="px-4 py-2 rounded-md text-xs font-medium bg-zinc-100 text-zinc-900 hover:bg-white transition-colors cursor-pointer inline-flex items-center gap-2 shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Find best clips
          </button>
        </div>
      ) : panelState === 'running' ? (
        /* State 5: Running with spinner */
        <div className="flex flex-col items-center justify-center p-6 space-y-2 text-center">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-300" />
          <p className="text-xs font-medium text-zinc-200">Analyzing transcript for best moments...</p>
          <p className="text-[11px] text-zinc-400">Selecting self-contained thoughts between 15s and 60s.</p>
        </div>
      ) : panelState === 'failed' ? (
        /* State 6: Failed state with retry */
        <div className="p-3 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-200 text-xs space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage || 'Failed to analyze highlights.'}</span>
          </div>
          <button
            type="button"
            onClick={handleStartAnalysis}
            className="px-3 py-1 rounded-md text-xs font-medium bg-rose-500/20 hover:bg-rose-500/30 text-rose-100 transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : panelState === 'empty' ? (
        /* State 7: Done with 0 suggestions */
        <div className="p-4 rounded-md bg-zinc-900/50 border border-zinc-800 text-center space-y-2">
          <p className="text-xs text-zinc-400">No highlights found in this transcript.</p>
          <button
            type="button"
            onClick={handleStartAnalysis}
            className="px-3 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : (
        /* State 8: Done with cards */
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>
              Found {highlights?.suggestions.length || 0} suggestion(s)
            </span>
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-[11px] text-zinc-300 hover:text-white underline cursor-pointer"
            >
              {selectedIds.size === (highlights?.suggestions.length || 0)
                ? 'Deselect all'
                : 'Select all'}
            </button>
          </div>

          {/* Cards List */}
          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
            {highlights?.suggestions.map((suggestion: HighlightSuggestion) => {
              const isSelected = selectedIds.has(suggestion.id);
              const duration = Math.round(suggestion.end - suggestion.start);

              return (
                <div
                  key={suggestion.id}
                  className={`p-3 rounded-lg border transition-all ${
                    isSelected
                      ? 'bg-zinc-900/90 border-zinc-600 shadow-xs'
                      : 'bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      aria-label={`Select clip: ${suggestion.title}`}
                      checked={isSelected}
                      onChange={() => handleToggleSelect(suggestion.id)}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-800 text-white focus:ring-0 cursor-pointer"
                    />

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-zinc-100 truncate">
                          {suggestion.title}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 shrink-0 border border-zinc-700/60">
                          {formatDuration(duration)}
                        </span>
                      </div>

                      <div className="text-[11px] font-mono text-zinc-400">
                        {formatDuration(suggestion.start)} - {formatDuration(suggestion.end)}
                      </div>

                      <p className="text-[11px] text-zinc-400 truncate leading-relaxed" title={suggestion.reason}>
                        {suggestion.reason}
                      </p>

                      <div className="flex items-center gap-2 pt-1.5">
                        <button
                          type="button"
                          onClick={() => onSeek(suggestion.start)}
                          className="px-2.5 py-1 rounded text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700/60 transition-colors cursor-pointer"
                        >
                          Preview
                        </button>
                        {onApplyTrimmer && (
                          <button
                            type="button"
                            onClick={() => onApplyTrimmer(suggestion.start, suggestion.end)}
                            className="px-2.5 py-1 rounded text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700/60 transition-colors cursor-pointer"
                          >
                            Use in trimmer
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sticky Action Footer */}
          <div className="sticky bottom-0 bg-[#141418] pt-3 border-t border-zinc-800 space-y-3 z-10 shadow-lg">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-zinc-400">Aspect:</span>
                <div className="inline-flex rounded-md bg-zinc-900 border border-zinc-800 p-0.5" role="group">
                  {ASPECT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAspect(opt.value)}
                      className={`px-2 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                        aspect === opt.value
                          ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 shadow-xs'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                disabled={selectedIds.size === 0 || isGeneratingClips}
                onClick={handleGenerateClips}
                className="px-3.5 py-1.5 rounded-md text-xs font-medium bg-zinc-100 text-zinc-900 hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
              >
                {isGeneratingClips ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Queuing clips...</span>
                  </>
                ) : (
                  <>
                    <Film className="w-3.5 h-3.5" />
                    <span>Generate selected clips ({selectedIds.size})</span>
                  </>
                )}
              </button>
            </div>

            {/* Inline Feedback */}
            {generateFeedback && (
              <div
                className={`p-2 rounded text-xs flex items-center gap-2 ${
                  generateFeedback.isError
                    ? 'bg-rose-500/10 border border-rose-500/20 text-rose-200'
                    : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-200'
                }`}
              >
                {generateFeedback.isError ? (
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{generateFeedback.message}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
