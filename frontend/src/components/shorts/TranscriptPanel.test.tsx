import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TranscriptPanel } from './TranscriptPanel';
import * as shortsService from '../../services/shortsService';
import type { TranscriptData } from '../../types/shorts';

vi.mock('../../services/shortsService', () => ({
  getTranscript: vi.fn(),
  startTranscription: vi.fn(),
}));

const mockGetTranscript = vi.mocked(shortsService.getTranscript);
const mockStartTranscription = vi.mocked(shortsService.startTranscription);

describe('TranscriptPanel Component Tests', () => {
  const jobId = 'test-job-123';
  const onSelectSegment = vi.fn();
  const onSeek = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders "none" state when no transcript has been generated', async () => {
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
      <TranscriptPanel
        jobId={jobId}
        onSelectSegment={onSelectSegment}
        onSeek={onSeek}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate transcript/i })).toBeInTheDocument();
    });

    expect(
      screen.getByText(/runs locally on this computer and may take a few minutes/i)
    ).toBeInTheDocument();
  });

  it('renders "running" state with spinner and local note', async () => {
    mockGetTranscript.mockResolvedValueOnce({
      jobId,
      state: 'running',
      errorCode: null,
      segments: [],
      languageDetected: null,
      durationCoveredSeconds: null,
      truncated: false,
      modelSize: null,
      deviceUsed: null,
    });

    render(
      <TranscriptPanel
        jobId={jobId}
        onSelectSegment={onSelectSegment}
        onSeek={onSeek}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/transcribing audio locally\.\.\./i)).toBeInTheDocument();
    });

    expect(screen.getByText(/processing speech on this machine/i)).toBeInTheDocument();
  });

  it('renders "done" state with segments list, truncated notice, and metadata footer', async () => {
    const mockData: TranscriptData = {
      jobId,
      state: 'done',
      errorCode: null,
      segments: [
        { start: 0.0, end: 3.5, text: 'Namaste and welcome to this video' },
        { start: 3.5, end: 7.2, text: 'Aaj hum baat karenge Creator Flow ke baare mein' },
      ],
      languageDetected: 'hi',
      durationCoveredSeconds: 600,
      truncated: true,
      modelSize: 'medium',
      deviceUsed: 'cuda',
    };

    mockGetTranscript.mockResolvedValueOnce(mockData);

    render(
      <TranscriptPanel
        jobId={jobId}
        onSelectSegment={onSelectSegment}
        onSeek={onSeek}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Namaste and welcome to this video')).toBeInTheDocument();
    });

    expect(screen.getByText('Aaj hum baat karenge Creator Flow ke baare mein')).toBeInTheDocument();
    expect(screen.getByText(/video exceeds 10 minutes/i)).toBeInTheDocument();
    expect(screen.getByText(/language: hi/i)).toBeInTheDocument();
    expect(screen.getByText(/model: medium/i)).toBeInTheDocument();
    expect(screen.getByText(/device: CUDA/i)).toBeInTheDocument();
  });

  it('renders "No speech detected in this video." when done with zero segments', async () => {
    mockGetTranscript.mockResolvedValueOnce({
      jobId,
      state: 'done',
      errorCode: null,
      segments: [],
      languageDetected: 'en',
      durationCoveredSeconds: 15,
      truncated: false,
      modelSize: 'medium',
      deviceUsed: 'cpu',
    });

    render(
      <TranscriptPanel
        jobId={jobId}
        onSelectSegment={onSelectSegment}
        onSeek={onSeek}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('No speech detected in this video.')).toBeInTheDocument();
    });
  });

  it('renders "failed" state with friendly message and retry button', async () => {
    mockGetTranscript.mockResolvedValueOnce({
      jobId,
      state: 'failed',
      errorCode: 'MODEL_DOWNLOAD_FAILED',
      segments: [],
      languageDetected: null,
      durationCoveredSeconds: null,
      truncated: false,
      modelSize: null,
      deviceUsed: null,
    });

    render(
      <TranscriptPanel
        jobId={jobId}
        onSelectSegment={onSelectSegment}
        onSeek={onSeek}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText(/failed to download the speech recognition model/i)
      ).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders "unavailable" state when 503 TRANSCRIPTION_UNAVAILABLE is returned', async () => {
    mockGetTranscript.mockRejectedValueOnce({
      status: 503,
      code: 'TRANSCRIPTION_UNAVAILABLE',
      message: 'TRANSCRIPTION_UNAVAILABLE',
    });

    render(
      <TranscriptPanel
        jobId={jobId}
        onSelectSegment={onSelectSegment}
        onSeek={onSeek}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Local Transcription Unavailable')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/optional local speech transcription package \(faster-whisper\) is not installed/i)
    ).toBeInTheDocument();
  });

  it('clicking a segment sets trimmer and seeks player', async () => {
    mockGetTranscript.mockResolvedValueOnce({
      jobId,
      state: 'done',
      errorCode: null,
      segments: [
        { start: 15.5, end: 28.0, text: 'Clickable segment content' },
      ],
      languageDetected: 'en',
      durationCoveredSeconds: 30,
      truncated: false,
      modelSize: 'medium',
      deviceUsed: 'cpu',
    });

    render(
      <TranscriptPanel
        jobId={jobId}
        onSelectSegment={onSelectSegment}
        onSeek={onSeek}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Clickable segment content')).toBeInTheDocument();
    });

    const segmentBtn = screen.getByText('Clickable segment content').closest('button')!;
    fireEvent.click(segmentBtn);

    expect(onSelectSegment).toHaveBeenCalledWith(15.5, 28.0);
    expect(onSeek).toHaveBeenCalledWith(15.5);
  });

  it('retry button calls startTranscription and transitions to running', async () => {
    mockGetTranscript.mockResolvedValueOnce({
      jobId,
      state: 'failed',
      errorCode: 'NO_AUDIO_STREAM',
      segments: [],
      languageDetected: null,
      durationCoveredSeconds: null,
      truncated: false,
      modelSize: null,
      deviceUsed: null,
    });

    mockStartTranscription.mockResolvedValueOnce({
      jobId,
      state: 'running',
      errorCode: null,
      segments: [],
      languageDetected: null,
      durationCoveredSeconds: null,
      truncated: false,
      modelSize: null,
      deviceUsed: null,
    });

    render(
      <TranscriptPanel
        jobId={jobId}
        onSelectSegment={onSelectSegment}
        onSeek={onSeek}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(mockStartTranscription).toHaveBeenCalledWith(jobId);
      expect(screen.getByText(/transcribing audio locally\.\.\./i)).toBeInTheDocument();
    });
  });

  it('polling stops on unmount', async () => {
    vi.useFakeTimers();

    mockGetTranscript.mockResolvedValue({
      jobId,
      state: 'running',
      errorCode: null,
      segments: [],
      languageDetected: null,
      durationCoveredSeconds: null,
      truncated: false,
      modelSize: null,
      deviceUsed: null,
    });

    const { unmount } = render(
      <TranscriptPanel
        jobId={jobId}
        onSelectSegment={onSelectSegment}
        onSeek={onSeek}
      />
    );

    // Initial load resolves
    await act(async () => {
      await Promise.resolve();
    });

    // Advance timer 2 seconds
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    const callCountBeforeUnmount = mockGetTranscript.mock.calls.length;

    // Unmount the component
    unmount();

    // Advance timer again
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    // Polling should have stopped, so no additional calls
    expect(mockGetTranscript.mock.calls.length).toBe(callCountBeforeUnmount);
  });

  it('clamps segments exceeding 180s limit when handled by trimmer logic', () => {
    const durationSeconds = 300;
    const MAX_CLIP_SECONDS = 180;

    const clampTrimmer = (start: number, end: number) => {
      const safeStart = Math.max(0, Math.min(start, durationSeconds));
      const segmentDuration = Math.max(0.5, end - start);
      const clampedLength = Math.min(segmentDuration, MAX_CLIP_SECONDS);
      const safeEnd = Math.min(durationSeconds, safeStart + clampedLength);
      return { start: safeStart, end: safeEnd };
    };

    // A segment that spans 200s (e.g. 10s to 210s)
    const result = clampTrimmer(10, 210);
    expect(result.start).toBe(10);
    expect(result.end).toBe(190); // 10 + 180 = 190
    expect(result.end - result.start).toBe(180);

    // A normal segment within 180s
    const normalResult = clampTrimmer(10, 45);
    expect(normalResult.start).toBe(10);
    expect(normalResult.end).toBe(45);
  });
});
