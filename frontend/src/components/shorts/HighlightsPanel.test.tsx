import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HighlightsPanel } from './HighlightsPanel';
import * as shortsService from '../../services/shortsService';
import type { HighlightsData } from '../../types/shorts';

vi.mock('../../services/shortsService', () => ({
  getTranscript: vi.fn(),
  getHighlights: vi.fn(),
  startHighlights: vi.fn(),
  generateHighlightClips: vi.fn(),
  getFriendlyErrorMessage: vi.fn((err: any) => {
    if (typeof err === 'string') return err;
    if (err?.code === 'AI_NOT_CONFIGURED') return 'AI is not configured on this server.';
    if (err?.code === 'AI_AUTH_FAILED') return 'AI authentication failed. Please verify provider credentials.';
    if (err?.code === 'AI_RATE_LIMITED') return 'AI service rate limit reached. Please try again shortly.';
    if (err?.code === 'AI_TIMEOUT') return 'AI request timed out. Please try again.';
    if (err?.code === 'AI_UNAVAILABLE') return 'AI service is currently unavailable. Please try again.';
    if (err?.code === 'AI_BAD_RESPONSE') return 'AI returned an invalid response. Please retry.';
    if (err?.code === 'TRANSCRIPT_REQUIRED') return 'A completed transcript is required before finding highlights.';
    return err?.message || 'Failed to analyze highlights.';
  }),
}));

const mockGetTranscript = vi.mocked(shortsService.getTranscript);
const mockGetHighlights = vi.mocked(shortsService.getHighlights);
const mockStartHighlights = vi.mocked(shortsService.startHighlights);
const mockGenerateHighlightClips = vi.mocked(shortsService.generateHighlightClips);

describe('HighlightsPanel Component Tests', () => {
  const jobId = 'test-job-highlights-123';
  const onSeek = vi.fn();
  const onApplyTrimmer = vi.fn();
  const onClipsGenerated = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders "needs transcript" state when transcript is missing or not done', async () => {
    mockGetTranscript.mockResolvedValueOnce({
      jobId,
      state: 'none',
      errorCode: null,
      segments: [],
      languageDetected: null,
      durationCoveredSeconds: null,
      truncated: false,
      modelSize: null,
      deviceUsed: null,
    });

    render(
      <HighlightsPanel
        jobId={jobId}
        onSeek={onSeek}
        onApplyTrimmer={onApplyTrimmer}
        onClipsGenerated={onClipsGenerated}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText(/generate a transcript above to enable ai clip suggestions/i)
      ).toBeInTheDocument();
    });

    const button = screen.getByRole('button', { name: /find best clips/i });
    expect(button).toBeDisabled();
  });

  it('renders "not_configured" state when API returns 503 AI_NOT_CONFIGURED', async () => {
    mockGetTranscript.mockResolvedValueOnce({
      jobId,
      state: 'done',
      errorCode: null,
      segments: [{ start: 0, end: 10, text: 'Sample' }],
      languageDetected: 'en',
      durationCoveredSeconds: 10,
      truncated: false,
      modelSize: 'medium',
      deviceUsed: 'cpu',
    });

    mockGetHighlights.mockRejectedValueOnce({
      status: 503,
      code: 'AI_NOT_CONFIGURED',
      message: 'AI is not configured on this server.',
    });

    render(
      <HighlightsPanel
        jobId={jobId}
        onSeek={onSeek}
        onApplyTrimmer={onApplyTrimmer}
        onClipsGenerated={onClipsGenerated}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/ai is not configured on this server/i)).toBeInTheDocument();
    });
  });

  it('renders "idle" state when transcript is ready and no highlights exist', async () => {
    mockGetTranscript.mockResolvedValueOnce({
      jobId,
      state: 'done',
      errorCode: null,
      segments: [{ start: 0, end: 10, text: 'Sample' }],
      languageDetected: 'en',
      durationCoveredSeconds: 10,
      truncated: false,
      modelSize: 'medium',
      deviceUsed: 'cpu',
    });

    mockGetHighlights.mockResolvedValueOnce({
      jobId,
      state: 'none',
      errorCode: null,
      suggestions: [],
      modelUsed: null,
      transcriptTruncated: false,
    });

    render(
      <HighlightsPanel
        jobId={jobId}
        onSeek={onSeek}
        onApplyTrimmer={onApplyTrimmer}
        onClipsGenerated={onClipsGenerated}
      />
    );

    const button = await screen.findByRole('button', { name: /find best clips/i });
    expect(button).not.toBeDisabled();

    mockStartHighlights.mockResolvedValueOnce({
      jobId,
      state: 'running',
      errorCode: null,
      suggestions: [],
      modelUsed: null,
      transcriptTruncated: false,
    });

    fireEvent.click(button);

    await waitFor(() => {
      expect(mockStartHighlights).toHaveBeenCalledWith(jobId);
    });
  });

  it('renders "running" state with spinner when analysis is in progress', async () => {
    mockGetTranscript.mockResolvedValueOnce({
      jobId,
      state: 'done',
      errorCode: null,
      segments: [{ start: 0, end: 10, text: 'Sample' }],
      languageDetected: 'en',
      durationCoveredSeconds: 10,
      truncated: false,
      modelSize: 'medium',
      deviceUsed: 'cpu',
    });

    mockGetHighlights.mockResolvedValueOnce({
      jobId,
      state: 'running',
      errorCode: null,
      suggestions: [],
      modelUsed: null,
      transcriptTruncated: false,
    });

    render(
      <HighlightsPanel
        jobId={jobId}
        onSeek={onSeek}
        onApplyTrimmer={onApplyTrimmer}
        onClipsGenerated={onClipsGenerated}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/analyzing transcript for best moments\.\.\./i)).toBeInTheDocument();
    });

    expect(
      screen.getByText(/selecting self-contained thoughts between 15s and 60s/i)
    ).toBeInTheDocument();
  });

  it('renders "empty" state when highlights completed with zero suggestions', async () => {
    mockGetTranscript.mockResolvedValueOnce({
      jobId,
      state: 'done',
      errorCode: null,
      segments: [{ start: 0, end: 10, text: 'Sample' }],
      languageDetected: 'en',
      durationCoveredSeconds: 10,
      truncated: false,
      modelSize: 'medium',
      deviceUsed: 'cpu',
    });

    mockGetHighlights.mockResolvedValueOnce({
      jobId,
      state: 'done',
      errorCode: null,
      suggestions: [],
      modelUsed: 'gemini-2.5-flash',
      transcriptTruncated: false,
    });

    render(
      <HighlightsPanel
        jobId={jobId}
        onSeek={onSeek}
        onApplyTrimmer={onApplyTrimmer}
        onClipsGenerated={onClipsGenerated}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/no highlights found in this transcript/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders "failed" state with error message and retry button', async () => {
    mockGetTranscript.mockResolvedValueOnce({
      jobId,
      state: 'done',
      errorCode: null,
      segments: [{ start: 0, end: 10, text: 'Sample' }],
      languageDetected: 'en',
      durationCoveredSeconds: 10,
      truncated: false,
      modelSize: 'medium',
      deviceUsed: 'cpu',
    });

    mockGetHighlights.mockResolvedValueOnce({
      jobId,
      state: 'failed',
      errorCode: 'AI_TIMEOUT',
      suggestions: [],
      modelUsed: null,
      transcriptTruncated: false,
    });

    render(
      <HighlightsPanel
        jobId={jobId}
        onSeek={onSeek}
        onApplyTrimmer={onApplyTrimmer}
        onClipsGenerated={onClipsGenerated}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/ai request timed out\. please try again\./i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders "done" state with cards, allows preview, use in trimmer, select/deselect, and generates clips', async () => {
    const mockHighlights: HighlightsData = {
      jobId,
      state: 'done',
      errorCode: null,
      suggestions: [
        {
          id: 'sug-1',
          start: 0.0,
          end: 20.0,
          title: 'Opening Hook Moment',
          reason: 'Energetic start introducing topic.',
          status: 'suggested',
        },
        {
          id: 'sug-2',
          start: 35.0,
          end: 60.0,
          title: 'Core Architecture Breakdown',
          reason: 'Clear explanation of core technical flow.',
          status: 'suggested',
        },
      ],
      modelUsed: 'gemini-2.5-flash',
      transcriptTruncated: false,
    };

    mockGetTranscript.mockResolvedValue({
      jobId,
      state: 'done',
      errorCode: null,
      segments: [{ start: 0, end: 60, text: 'Sample text' }],
      languageDetected: 'en',
      durationCoveredSeconds: 60,
      truncated: false,
      modelSize: 'medium',
      deviceUsed: 'cpu',
    });

    mockGetHighlights.mockResolvedValue(mockHighlights);

    render(
      <HighlightsPanel
        jobId={jobId}
        onSeek={onSeek}
        onApplyTrimmer={onApplyTrimmer}
        onClipsGenerated={onClipsGenerated}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Opening Hook Moment')).toBeInTheDocument();
      expect(screen.getByText('Core Architecture Breakdown')).toBeInTheDocument();
    });

    // Both selected by default
    expect(screen.getByRole('button', { name: /generate selected clips \(2\)/i })).toBeInTheDocument();

    // Click Preview on sug-1
    const previewButtons = screen.getAllByRole('button', { name: /preview/i });
    fireEvent.click(previewButtons[0]);
    expect(onSeek).toHaveBeenCalledWith(0.0);

    // Click Use in trimmer on sug-2
    const trimmerButtons = screen.getAllByRole('button', { name: /use in trimmer/i });
    fireEvent.click(trimmerButtons[1]);
    expect(onApplyTrimmer).toHaveBeenCalledWith(35.0, 60.0);

    // Deselect one card
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    expect(screen.getByRole('button', { name: /generate selected clips \(1\)/i })).toBeInTheDocument();

    // Select aspect ratio
    const squareBtn = screen.getByRole('button', { name: '1:1' });
    fireEvent.click(squareBtn);

    // Click Generate
    mockGenerateHighlightClips.mockResolvedValueOnce([
      {
        id: 'clip-new-1',
        jobId,
        startSeconds: 35.0,
        endSeconds: 60.0,
        aspect: 'square_1_1',
        status: 'queued',
        errorCode: null,
        createdAt: new Date().toISOString(),
        finishedAt: null,
      },
    ]);

    const generateBtn = screen.getByRole('button', { name: /generate selected clips \(1\)/i });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(mockGenerateHighlightClips).toHaveBeenCalledWith(jobId, {
        suggestionIds: ['sug-2'],
        aspect: 'square_1_1',
      });
      expect(onClipsGenerated).toHaveBeenCalled();
      expect(screen.getByText(/queued 1 clip\(s\) for rendering/i)).toBeInTheDocument();
    });
  });

  it('stops polling on component unmount', async () => {
    vi.useFakeTimers();

    mockGetTranscript.mockResolvedValue({
      jobId,
      state: 'done',
      errorCode: null,
      segments: [{ start: 0, end: 10, text: 'Sample' }],
      languageDetected: 'en',
      durationCoveredSeconds: 10,
      truncated: false,
      modelSize: 'medium',
      deviceUsed: 'cpu',
    });

    mockGetHighlights.mockResolvedValue({
      jobId,
      state: 'running',
      errorCode: null,
      suggestions: [],
      modelUsed: null,
      transcriptTruncated: false,
    });

    const { unmount } = render(
      <HighlightsPanel
        jobId={jobId}
        onSeek={onSeek}
        onApplyTrimmer={onApplyTrimmer}
        onClipsGenerated={onClipsGenerated}
      />
    );

    // Let initial load finish
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(mockGetHighlights).toHaveBeenCalledTimes(1);

    // Advance 2s to trigger next poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(mockGetHighlights).toHaveBeenCalledTimes(2);

    // Unmount component
    unmount();

    // Advance another 5s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    // Call count should NOT have increased after unmount
    expect(mockGetHighlights).toHaveBeenCalledTimes(2);
  });
});
