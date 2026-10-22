import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ShortsClipperPage } from './ShortsClipperPage';
import * as shortsService from '../services/shortsService';
import type { ShortsJob } from '../types/shorts';

vi.mock('../services/shortsService', () => ({
  listJobs: vi.fn(),
  uploadJob: vi.fn(),
  createClip: vi.fn(),
  getClip: vi.fn(),
  deleteJob: vi.fn(),
  deleteClip: vi.fn(),
  getTranscript: vi.fn().mockResolvedValue({
    jobId: 'mock-job-id',
    state: 'none',
    errorCode: null,
    segments: [],
    languageDetected: null,
    durationCoveredSeconds: null,
    truncated: false,
    modelSize: null,
    deviceUsed: null,
  }),
  startTranscription: vi.fn(),
  getHighlights: vi.fn().mockResolvedValue({
    jobId: 'mock-job-id',
    state: 'none',
    errorCode: null,
    suggestions: [],
    modelUsed: null,
    transcriptTruncated: false,
  }),
  startHighlights: vi.fn(),
  generateHighlightClips: vi.fn(),
  getSourcePreviewUrl: vi.fn((id: string) => `/mock-api/shorts/jobs/${id}/source`),
  getClipDownloadUrl: vi.fn((jobId: string, clipId: string) => `/mock-api/shorts/jobs/${jobId}/clips/${clipId}/download`),
  getFriendlyErrorMessage: vi.fn((err: any) => err?.message || 'An unexpected error occurred.'),
}));

const mockListJobs = vi.mocked(shortsService.listJobs);
const mockUploadJob = vi.mocked(shortsService.uploadJob);
const mockCreateClip = vi.mocked(shortsService.createClip);
const mockDeleteClip = vi.mocked(shortsService.deleteClip);
const mockGetTranscript = vi.mocked(shortsService.getTranscript);
const mockGetHighlights = vi.mocked(shortsService.getHighlights);
const mockGenerateHighlightClips = vi.mocked(shortsService.generateHighlightClips);

describe('ShortsClipperPage Frontend Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders 503 disabled state when feature is disabled', async () => {
    mockListJobs.mockRejectedValueOnce({
      status: 503,
      code: 'FEATURE_DISABLED',
      message: 'FEATURE_DISABLED',
      kind: 'unavailable',
    });

    render(<ShortsClipperPage />);

    await waitFor(() => {
      expect(
        screen.getByText('Feature Disabled in this Environment')
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText(/The Shorts Clipper engine is restricted to authorized testing environments/i)
    ).toBeInTheDocument();
  });

  it('displays upload validation error when an invalid file extension is selected', async () => {
    mockListJobs.mockResolvedValueOnce([]);

    const { container } = render(<ShortsClipperPage />);

    await waitFor(() => {
      expect(screen.getByText('No Videos Uploaded Yet')).toBeInTheDocument();
    });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    const invalidFile = new File(['dummy content'], 'document.pdf', { type: 'application/pdf' });

    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    await waitFor(() => {
      expect(
        screen.getByText(/Unsupported format '\.pdf'\. Allowed: \.mp4, \.mov, \.mkv, \.webm/i)
      ).toBeInTheDocument();
    });

    expect(mockUploadJob).not.toHaveBeenCalled();
  });

  it('displays API upload error when server rejects the upload', async () => {
    mockListJobs.mockResolvedValueOnce([]);
    mockUploadJob.mockRejectedValueOnce({
      status: 400,
      code: 'FILE_TOO_LARGE',
      message: 'File exceeds the maximum upload limit (500MB).',
    });

    const { container } = render(<ShortsClipperPage />);

    await waitFor(() => {
      expect(screen.getByText('No Videos Uploaded Yet')).toBeInTheDocument();
    });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const validFile = new File(['dummy data'], 'video.mp4', { type: 'video/mp4' });

    fireEvent.change(fileInput, { target: { files: [validFile] } });

    await waitFor(() => {
      expect(
        screen.getByText(/File exceeds the maximum upload limit/i)
      ).toBeInTheDocument();
    });
  });

  it('stops polling for pending clips when component unmounts', async () => {
    vi.useFakeTimers();

    const pendingJob: ShortsJob = {
      id: 'job-123',
      ownerId: null,
      originalFilename: 'source.mp4',
      sizeBytes: 1048576,
      durationSeconds: 60,
      width: 1920,
      height: 1080,
      status: 'uploaded',
      errorCode: null,
      createdAt: '2026-10-19T10:00:00Z',
      clips: [
        {
          id: 'clip-1',
          jobId: 'job-123',
          startSeconds: 0,
          endSeconds: 15,
          aspect: 'vertical_9_16',
          status: 'processing',
          errorCode: null,
          createdAt: '2026-10-19T10:01:00Z',
          finishedAt: null,
        },
      ],
    };

    mockListJobs.mockResolvedValue([pendingJob]);

    let renderResult: any;
    await act(async () => {
      renderResult = render(<ShortsClipperPage />);
    });

    // Advance timers so initial mount fetch completes and sets pending job state
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(mockListJobs).toHaveBeenCalledTimes(1);

    // Advance 2100ms for polling tick
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    expect(mockListJobs).toHaveBeenCalledTimes(2);

    // Unmount component
    renderResult.unmount();

    // Advance further 10 seconds - no more calls should be made
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(mockListJobs).toHaveBeenCalledTimes(2);
  });

  it('resets trimmer defaults when another job is selected', async () => {
    const job1: ShortsJob = {
      id: 'job-1',
      ownerId: null,
      originalFilename: 'first.mp4',
      sizeBytes: 1048576,
      durationSeconds: 50,
      width: 1920,
      height: 1080,
      status: 'uploaded',
      errorCode: null,
      createdAt: '2026-10-19T10:00:00Z',
      clips: [],
    };
    const job2: ShortsJob = {
      id: 'job-2',
      ownerId: null,
      originalFilename: 'second.mp4',
      sizeBytes: 2097152,
      durationSeconds: 120,
      width: 1920,
      height: 1080,
      status: 'uploaded',
      errorCode: null,
      createdAt: '2026-10-19T10:05:00Z',
      clips: [],
    };

    mockListJobs.mockResolvedValue([job1, job2]);

    const { container } = render(<ShortsClipperPage />);

    await waitFor(() => {
      expect(screen.getAllByText('first.mp4')[0]).toBeInTheDocument();
    });

    const startInput = container.querySelector('#trim-start-seconds') as HTMLInputElement;
    const endInput = container.querySelector('#trim-end-seconds') as HTMLInputElement;

    expect(startInput.value).toBe('0');
    expect(endInput.value).toBe('30');

    // Change start/end inputs on job1
    fireEvent.change(startInput, { target: { value: '15' } });
    fireEvent.change(endInput, { target: { value: '45' } });
    expect(startInput.value).toBe('15');
    expect(endInput.value).toBe('45');

    // Select second.mp4 in the list
    const secondJobButton = screen.getByText('second.mp4');
    fireEvent.click(secondJobButton);

    // Verify trimmer inputs reset
    await waitFor(() => {
      expect(startInput.value).toBe('0');
      expect(endInput.value).toBe('30');
    });
  });

  it('supports slider keyboard control and clamps values within limits', async () => {
    const job: ShortsJob = {
      id: 'job-trimmer',
      ownerId: null,
      originalFilename: 'trimmer-test.mp4',
      sizeBytes: 1048576,
      durationSeconds: 100,
      width: 1920,
      height: 1080,
      status: 'uploaded',
      errorCode: null,
      createdAt: '2026-10-19T10:00:00Z',
      clips: [],
    };

    mockListJobs.mockResolvedValueOnce([job]);

    render(<ShortsClipperPage />);

    await waitFor(() => {
      expect(screen.getByRole('slider', { name: 'Start time' })).toBeInTheDocument();
    });

    const startSlider = screen.getByRole('slider', { name: 'Start time' });
    const endSlider = screen.getByRole('slider', { name: 'End time' });

    // Initial values
    expect(startSlider).toHaveAttribute('aria-valuenow', '0');
    expect(endSlider).toHaveAttribute('aria-valuenow', '30');

    // ArrowRight on start slider increments by 0.5s
    fireEvent.keyDown(startSlider, { key: 'ArrowRight' });
    expect(startSlider).toHaveAttribute('aria-valuenow', '0.5');

    // ArrowLeft on start slider decrements by 0.5s back to 0
    fireEvent.keyDown(startSlider, { key: 'ArrowLeft' });
    expect(startSlider).toHaveAttribute('aria-valuenow', '0');

    // ArrowLeft when at 0 is clamped to 0
    fireEvent.keyDown(startSlider, { key: 'ArrowLeft' });
    expect(startSlider).toHaveAttribute('aria-valuenow', '0');

    // End key moves start to maximum allowed (end - 0.5 = 29.5)
    fireEvent.keyDown(startSlider, { key: 'End' });
    expect(startSlider).toHaveAttribute('aria-valuenow', '29.5');

    // Further ArrowRight is clamped to 29.5
    fireEvent.keyDown(startSlider, { key: 'ArrowRight' });
    expect(startSlider).toHaveAttribute('aria-valuenow', '29.5');

    // Home key moves start back to 0
    fireEvent.keyDown(startSlider, { key: 'Home' });
    expect(startSlider).toHaveAttribute('aria-valuenow', '0');

    // End slider ArrowRight increments by 0.5s
    fireEvent.keyDown(endSlider, { key: 'ArrowRight' });
    expect(endSlider).toHaveAttribute('aria-valuenow', '30.5');

    // End slider ArrowLeft decrements by 0.5s
    fireEvent.keyDown(endSlider, { key: 'ArrowLeft' });
    expect(endSlider).toHaveAttribute('aria-valuenow', '30');

    // End slider Home key moves to minimum allowed (start + 0.5 = 0.5)
    fireEvent.keyDown(endSlider, { key: 'Home' });
    expect(endSlider).toHaveAttribute('aria-valuenow', '0.5');
  });

  it('disables Generate button with inline reason when range is invalid', async () => {
    const job: ShortsJob = {
      id: 'job-validation',
      ownerId: null,
      originalFilename: 'validation-test.mp4',
      sizeBytes: 1048576,
      durationSeconds: 250,
      width: 1920,
      height: 1080,
      status: 'uploaded',
      errorCode: null,
      createdAt: '2026-10-19T10:00:00Z',
      clips: [],
    };

    mockListJobs.mockResolvedValueOnce([job]);

    const { container } = render(<ShortsClipperPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Generate Clip/i })).toBeInTheDocument();
    });

    const startInput = container.querySelector('#trim-start-seconds') as HTMLInputElement;
    const endInput = container.querySelector('#trim-end-seconds') as HTMLInputElement;
    const generateBtn = screen.getByRole('button', { name: /Generate Clip/i });

    // Initially valid (0 to 30s)
    expect(generateBtn).not.toBeDisabled();

    // Invalid: start >= end
    fireEvent.change(startInput, { target: { value: '35' } });
    await waitFor(() => {
      expect(generateBtn).toBeDisabled();
      expect(
        screen.getByText(/Cannot generate: End time must be strictly greater than start time/i)
      ).toBeInTheDocument();
    });

    // Invalid: duration > 180s
    fireEvent.change(startInput, { target: { value: '0' } });
    fireEvent.change(endInput, { target: { value: '200' } });
    await waitFor(() => {
      expect(generateBtn).toBeDisabled();
      expect(
        screen.getByText(/Cannot generate: Clip length \(200s\) exceeds max limit of 180 seconds/i)
      ).toBeInTheDocument();
    });

    // Valid: back to 10s length
    fireEvent.change(endInput, { target: { value: '10' } });
    await waitFor(() => {
      expect(generateBtn).not.toBeDisabled();
      expect(screen.queryByText(/Cannot generate:/i)).not.toBeInTheDocument();
    });
  });

  it('renders status chips for all clip statuses (queued, processing, done, failed)', async () => {
    const jobWithClips: ShortsJob = {
      id: 'job-clips-status',
      ownerId: null,
      originalFilename: 'all-status-video.mp4',
      sizeBytes: 5242880,
      durationSeconds: 120,
      width: 1920,
      height: 1080,
      status: 'uploaded',
      errorCode: null,
      createdAt: '2026-10-19T10:00:00Z',
      clips: [
        {
          id: 'clip-done',
          jobId: 'job-clips-status',
          startSeconds: 0,
          endSeconds: 15,
          aspect: 'vertical_9_16',
          status: 'done',
          errorCode: null,
          createdAt: '2026-10-19T10:01:00Z',
          finishedAt: '2026-10-19T10:02:00Z',
        },
        {
          id: 'clip-proc',
          jobId: 'job-clips-status',
          startSeconds: 15,
          endSeconds: 30,
          aspect: 'vertical_9_16',
          status: 'processing',
          errorCode: null,
          createdAt: '2026-10-19T10:03:00Z',
          finishedAt: null,
        },
        {
          id: 'clip-queue',
          jobId: 'job-clips-status',
          startSeconds: 30,
          endSeconds: 45,
          aspect: 'original',
          status: 'queued',
          errorCode: null,
          createdAt: '2026-10-19T10:04:00Z',
          finishedAt: null,
        },
        {
          id: 'clip-fail',
          jobId: 'job-clips-status',
          startSeconds: 45,
          endSeconds: 60,
          aspect: 'vertical_9_16',
          status: 'failed',
          errorCode: 'FFMPEG_TIMEOUT',
          createdAt: '2026-10-19T10:05:00Z',
          finishedAt: '2026-10-19T10:05:30Z',
        },
      ],
    };

    mockListJobs.mockResolvedValueOnce([jobWithClips]);

    render(<ShortsClipperPage />);

    await waitFor(() => {
      expect(screen.getByTestId('clip-status-clip-done')).toHaveTextContent('DONE');
      expect(screen.getByTestId('clip-status-clip-proc')).toHaveTextContent('PROCESSING');
      expect(screen.getByTestId('clip-status-clip-queue')).toHaveTextContent('QUEUED');
      expect(screen.getByTestId('clip-status-clip-fail')).toHaveTextContent('FAILED');
    });

    // Check friendly error text and download button
    expect(screen.getByText('FFMPEG_TIMEOUT')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Download clip clip-don/i })).toBeInTheDocument();
  });

  it('aspect control shows 5 options and sends the chosen key to createClip', async () => {
    const job: ShortsJob = {
      id: 'job-aspects',
      ownerId: null,
      originalFilename: 'aspects.mp4',
      sizeBytes: 1048576,
      durationSeconds: 60,
      width: 1920,
      height: 1080,
      status: 'uploaded',
      errorCode: null,
      createdAt: '2026-10-19T10:00:00Z',
      clips: [],
    };

    mockListJobs.mockResolvedValueOnce([job]);
    mockCreateClip.mockResolvedValueOnce({
      id: 'clip-sq',
      jobId: 'job-aspects',
      startSeconds: 0,
      endSeconds: 15,
      aspect: 'square_1_1',
      status: 'queued',
      errorCode: null,
      createdAt: '2026-10-19T10:01:00Z',
      finishedAt: null,
    });

    render(<ShortsClipperPage />);

    await waitFor(() => {
      expect(screen.getByText('9:16 Vertical')).toBeInTheDocument();
      expect(screen.getByText('1:1 Square')).toBeInTheDocument();
      expect(screen.getByText('4:5 Portrait')).toBeInTheDocument();
      expect(screen.getByText('16:9 Landscape')).toBeInTheDocument();
      expect(screen.getByText('Original')).toBeInTheDocument();
    });

    // Select 1:1 Square
    fireEvent.click(screen.getByText('1:1 Square'));

    // Click Generate Clip
    const generateBtn = screen.getByRole('button', { name: /Generate Clip/i });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(mockCreateClip).toHaveBeenCalledWith(
        'job-aspects',
        expect.objectContaining({
          aspect: 'square_1_1',
        })
      );
    });
  });

  it('3-dot menu opens and closes via Escape and outside click', async () => {
    const job: ShortsJob = {
      id: 'job-menu-test',
      ownerId: null,
      originalFilename: 'menu-test.mp4',
      sizeBytes: 1048576,
      durationSeconds: 60,
      width: 1920,
      height: 1080,
      status: 'uploaded',
      errorCode: null,
      createdAt: '2026-10-19T10:00:00Z',
      clips: [
        {
          id: 'clip-menu-1',
          jobId: 'job-menu-test',
          startSeconds: 0,
          endSeconds: 10,
          aspect: 'vertical_9_16',
          status: 'done',
          errorCode: null,
          createdAt: '2026-10-19T10:01:00Z',
          finishedAt: '2026-10-19T10:02:00Z',
        },
      ],
    };

    mockListJobs.mockResolvedValueOnce([job]);

    render(<ShortsClipperPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Options for clip clip-men/i)).toBeInTheDocument();
    });

    const menuTrigger = screen.getByLabelText(/Options for clip clip-men/i);

    // Click trigger to open menu
    fireEvent.click(menuTrigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Delete clip/i })).toBeInTheDocument();

    // Escape closes menu
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    // Open again, outside pointerdown closes menu
    fireEvent.click(menuTrigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('delete confirm flow calls deleteClip, removes card, and updates job clip count', async () => {
    const job: ShortsJob = {
      id: 'job-del-test',
      ownerId: null,
      originalFilename: 'delete-flow.mp4',
      sizeBytes: 1048576,
      durationSeconds: 60,
      width: 1920,
      height: 1080,
      status: 'uploaded',
      errorCode: null,
      createdAt: '2026-10-19T10:00:00Z',
      clips: [
        {
          id: 'clip-alpha',
          jobId: 'job-del-test',
          startSeconds: 0,
          endSeconds: 10,
          aspect: 'square_1_1',
          status: 'done',
          errorCode: null,
          createdAt: '2026-10-19T10:01:00Z',
          finishedAt: '2026-10-19T10:02:00Z',
        },
        {
          id: 'clip-beta',
          jobId: 'job-del-test',
          startSeconds: 10,
          endSeconds: 20,
          aspect: 'vertical_9_16',
          status: 'done',
          errorCode: null,
          createdAt: '2026-10-19T10:03:00Z',
          finishedAt: '2026-10-19T10:04:00Z',
        },
      ],
    };

    mockListJobs.mockResolvedValue([job]);
    mockDeleteClip.mockResolvedValueOnce(undefined);

    render(<ShortsClipperPage />);

    await waitFor(() => {
      expect(screen.getByText('2 clips')).toBeInTheDocument();
    });

    const menuTrigger = screen.getByLabelText(/Options for clip clip-alp/i);
    fireEvent.click(menuTrigger);

    const deleteMenuItem = screen.getByRole('menuitem', { name: /Delete clip/i });
    fireEvent.click(deleteMenuItem);

    // Shows confirmation prompt
    expect(screen.getByText('Delete this clip?')).toBeInTheDocument();

    // Click Confirm
    const confirmBtn = screen.getByRole('button', { name: 'Confirm' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockDeleteClip).toHaveBeenCalledWith('job-del-test', 'clip-alpha');
      expect(screen.queryByLabelText(/Options for clip clip-alp/i)).not.toBeInTheDocument();
      // Clip count in JobsList updates to "1 clip"
      expect(screen.getByText('1 clip')).toBeInTheDocument();
    });
  });

  it('displays friendly message on delete failure and disables delete for processing clips', async () => {
    const job: ShortsJob = {
      id: 'job-busy-test',
      ownerId: null,
      originalFilename: 'busy.mp4',
      sizeBytes: 1048576,
      durationSeconds: 60,
      width: 1920,
      height: 1080,
      status: 'uploaded',
      errorCode: null,
      createdAt: '2026-10-19T10:00:00Z',
      clips: [
        {
          id: 'clip-proc-id',
          jobId: 'job-busy-test',
          startSeconds: 0,
          endSeconds: 10,
          aspect: 'portrait_4_5',
          status: 'processing',
          errorCode: null,
          createdAt: '2026-10-19T10:01:00Z',
          finishedAt: null,
        },
        {
          id: 'clip-err-id',
          jobId: 'job-busy-test',
          startSeconds: 10,
          endSeconds: 20,
          aspect: 'landscape_16_9',
          status: 'done',
          errorCode: null,
          createdAt: '2026-10-19T10:02:00Z',
          finishedAt: '2026-10-19T10:03:00Z',
        },
      ],
    };

    mockListJobs.mockResolvedValue([job]);
    mockDeleteClip.mockRejectedValueOnce({
      code: 'CLIP_BUSY',
      message: 'Wait until this clip finishes processing before deleting.',
    });

    render(<ShortsClipperPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Options for clip clip-pro/i)).toBeInTheDocument();
    });

    // 1. Processing clip has Delete disabled with tooltip
    const procTrigger = screen.getByLabelText(/Options for clip clip-pro/i);
    fireEvent.click(procTrigger);

    const procDeleteBtn = screen.getByRole('menuitem', { name: /Delete clip/i });
    expect(procDeleteBtn).toBeDisabled();
    expect(procDeleteBtn).toHaveAttribute(
      'title',
      'Cannot delete clip while it is queued or processing'
    );

    // Close menu
    fireEvent.keyDown(document, { key: 'Escape' });

    // 2. Done clip that fails on delete with CLIP_BUSY shows friendly message
    const errTrigger = screen.getByLabelText(/Options for clip clip-err/i);
    fireEvent.click(errTrigger);

    const errDeleteBtn = screen.getByRole('menuitem', { name: /Delete clip/i });
    fireEvent.click(errDeleteBtn);

    const confirmBtn = screen.getByRole('button', { name: 'Confirm' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(
        screen.getByText('Wait until this clip finishes processing before deleting.')
      ).toBeInTheDocument();
    });
  });

  it('mode switcher defaults to Manual mode with trimmer and settings visible, transcript and AI panels hidden', async () => {
    const job: ShortsJob = {
      id: 'job-mode-1',
      ownerId: null,
      originalFilename: 'sample.mp4',
      sizeBytes: 1048576,
      durationSeconds: 60,
      width: 1920,
      height: 1080,
      status: 'uploaded',
      errorCode: null,
      createdAt: '2026-10-19T10:00:00Z',
      clips: [],
    };
    mockListJobs.mockResolvedValueOnce([job]);

    render(<ShortsClipperPage />);

    await waitFor(() => {
      expect(screen.getByRole('slider', { name: 'Start time' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Generate Clip/i })).toBeInTheDocument();
    });

    // Transcript panel and AI suggested clips panels are not rendered
    expect(screen.queryByText(/AI suggested clips/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Transcript')).not.toBeInTheDocument();
    // Subtitle is manual mode subtitle
    expect(
      screen.getByText(/Precision manual trimming with FFmpeg re-encoding/i)
    ).toBeInTheDocument();
  });

  it('clicking AI Auto-Clip switches mode: Transcript and AI panels rendered, trimmer and manual settings hidden', async () => {
    const job: ShortsJob = {
      id: 'job-mode-2',
      ownerId: null,
      originalFilename: 'sample.mp4',
      sizeBytes: 1048576,
      durationSeconds: 60,
      width: 1920,
      height: 1080,
      status: 'uploaded',
      errorCode: null,
      createdAt: '2026-10-19T10:00:00Z',
      clips: [],
    };
    mockListJobs.mockResolvedValueOnce([job]);

    render(<ShortsClipperPage />);

    await waitFor(() => {
      expect(screen.getByRole('slider', { name: 'Start time' })).toBeInTheDocument();
    });

    const aiTabButton = screen.getByRole('tab', { name: /AI Auto-Clip/i });
    fireEvent.click(aiTabButton);

    // AI panels are now rendered
    await waitFor(() => {
      expect(screen.getByText('Transcript')).toBeInTheDocument();
      expect(screen.getByText(/AI suggested clips/i)).toBeInTheDocument();
    });

    // Trimmer and ClipSettingsCard are hidden
    expect(screen.queryByRole('slider', { name: 'Start time' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Generate Clip/i })).not.toBeInTheDocument();

    // Header subtitle updated
    expect(
      screen.getByText(/Automated local speech transcription and AI-powered clip suggestions/i)
    ).toBeInTheDocument();
  });

  it('switching between Manual and AI Auto-Clip preserves loaded transcript and AI suggestions without re-fetching or losing selection state', async () => {
    const job: ShortsJob = {
      id: 'job-preserve-state',
      ownerId: null,
      originalFilename: 'sample.mp4',
      sizeBytes: 1048576,
      durationSeconds: 60,
      width: 1920,
      height: 1080,
      status: 'uploaded',
      errorCode: null,
      createdAt: '2026-10-19T10:00:00Z',
      clips: [],
    };
    mockListJobs.mockResolvedValueOnce([job]);

    mockGetTranscript.mockResolvedValue({
      jobId: 'job-preserve-state',
      state: 'done',
      errorCode: null,
      segments: [{ start: 0, end: 15, text: 'Hello world' }],
      languageDetected: 'en',
      durationCoveredSeconds: 15,
      truncated: false,
      modelSize: 'medium',
      deviceUsed: 'cpu',
    });

    mockGetHighlights.mockResolvedValue({
      jobId: 'job-preserve-state',
      state: 'done',
      errorCode: null,
      suggestions: [
        {
          id: 'sug-preserve-1',
          start: 0,
          end: 15,
          title: 'Preserved Highlight 1',
          reason: 'Good hook',
          status: 'suggested',
        },
        {
          id: 'sug-preserve-2',
          start: 20,
          end: 35,
          title: 'Preserved Highlight 2',
          reason: 'Solid explanation',
          status: 'suggested',
        },
      ],
      modelUsed: 'gemini-2.5-flash',
      transcriptTruncated: false,
    });

    render(<ShortsClipperPage />);

    await waitFor(() => {
      expect(screen.getByRole('slider', { name: 'Start time' })).toBeInTheDocument();
    });

    // 1. Switch to AI Auto-Clip
    const aiTabButton = screen.getByRole('tab', { name: /AI Auto-Clip/i });
    fireEvent.click(aiTabButton);

    await waitFor(() => {
      expect(screen.getByText('Preserved Highlight 1')).toBeInTheDocument();
      expect(screen.getByText('Preserved Highlight 2')).toBeInTheDocument();
    });

    // Both selected by default: count is 2
    expect(screen.getByRole('button', { name: /Generate selected clips \(2\)/i })).toBeInTheDocument();

    // Uncheck first card
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    expect(screen.getByRole('button', { name: /Generate selected clips \(1\)/i })).toBeInTheDocument();

    const transcriptCallCountBefore = mockGetTranscript.mock.calls.length;
    const highlightsCallCountBefore = mockGetHighlights.mock.calls.length;

    // 2. Switch back to Manual mode
    const manualTabButton = screen.getByRole('tab', { name: /Manual/i });
    fireEvent.click(manualTabButton);

    await waitFor(() => {
      expect(screen.getByRole('slider', { name: 'Start time' })).toBeInTheDocument();
      expect(screen.queryByText(/AI suggested clips/i)).not.toBeInTheDocument();
    });

    // 3. Switch back to AI Auto-Clip mode
    fireEvent.click(screen.getByRole('tab', { name: /AI Auto-Clip/i }));

    await waitFor(() => {
      expect(screen.getByText('Preserved Highlight 1')).toBeInTheDocument();
      expect(screen.getByText('Preserved Highlight 2')).toBeInTheDocument();
    });

    // Verify selection state was preserved: still (1) selected!
    expect(screen.getByRole('button', { name: /Generate selected clips \(1\)/i })).toBeInTheDocument();

    // Verify no new fetch calls were made
    expect(mockGetTranscript.mock.calls.length).toBe(transcriptCallCountBefore);
    expect(mockGetHighlights.mock.calls.length).toBe(highlightsCallCountBefore);
  });

  it('clicking "Use in trimmer" on an AI suggestion switches the view back to "Manual" mode and updates the trimmer start/end range', async () => {
    const job: ShortsJob = {
      id: 'job-trimmer-handoff',
      ownerId: null,
      originalFilename: 'sample.mp4',
      sizeBytes: 1048576,
      durationSeconds: 120,
      width: 1920,
      height: 1080,
      status: 'uploaded',
      errorCode: null,
      createdAt: '2026-10-19T10:00:00Z',
      clips: [],
    };
    mockListJobs.mockResolvedValueOnce([job]);

    mockGetTranscript.mockResolvedValue({
      jobId: 'job-trimmer-handoff',
      state: 'done',
      errorCode: null,
      segments: [{ start: 0, end: 60, text: 'Sample text' }],
      languageDetected: 'en',
      durationCoveredSeconds: 60,
      truncated: false,
      modelSize: 'medium',
      deviceUsed: 'cpu',
    });

    mockGetHighlights.mockResolvedValue({
      jobId: 'job-trimmer-handoff',
      state: 'done',
      errorCode: null,
      suggestions: [
        {
          id: 'sug-handoff-1',
          start: 12.5,
          end: 38.0,
          title: 'Epic Highlight Moment',
          reason: 'High engagement moment',
          status: 'suggested',
        },
      ],
      modelUsed: 'gemini-2.5-flash',
      transcriptTruncated: false,
    });

    const { container } = render(<ShortsClipperPage />);

    await waitFor(() => {
      expect(screen.getByRole('slider', { name: 'Start time' })).toBeInTheDocument();
    });

    // Switch to AI Auto-Clip mode
    fireEvent.click(screen.getByRole('tab', { name: /AI Auto-Clip/i }));

    await waitFor(() => {
      expect(screen.getByText('Epic Highlight Moment')).toBeInTheDocument();
    });

    // Click "Use in trimmer" button
    const useInTrimmerBtn = screen.getByRole('button', { name: /Use in trimmer/i });
    fireEvent.click(useInTrimmerBtn);

    // Must switch back to Manual mode automatically
    await waitFor(() => {
      expect(screen.getByRole('slider', { name: 'Start time' })).toBeInTheDocument();
      expect(screen.queryByText(/AI suggested clips/i)).not.toBeInTheDocument();
    });

    // Start and end seconds must match the suggestion
    const startInput = container.querySelector('#trim-start-seconds') as HTMLInputElement;
    const endInput = container.querySelector('#trim-end-seconds') as HTMLInputElement;

    expect(startInput.value).toBe('12.5');
    expect(endInput.value).toBe('38');
  });

  it('generates clips from selected AI suggestions, passes full payload, queues clips immediately in gallery, and avoids clutter', async () => {
    const job: ShortsJob = {
      id: 'job-ai-batch-1',
      ownerId: null,
      originalFilename: 'demo-lecture.mp4',
      sizeBytes: 1048576,
      durationSeconds: 120,
      width: 1920,
      height: 1080,
      status: 'uploaded',
      errorCode: null,
      createdAt: '2026-10-19T10:00:00Z',
      clips: [],
    };
    mockListJobs.mockResolvedValue([job]);

    mockGetTranscript.mockResolvedValue({
      jobId: 'job-ai-batch-1',
      state: 'done',
      errorCode: null,
      segments: [{ start: 0, end: 60, text: 'Clean transcript segment' }],
      languageDetected: 'hi',
      durationCoveredSeconds: 60,
      truncated: false,
      modelSize: 'medium',
      deviceUsed: 'cpu',
    });

    mockGetHighlights.mockResolvedValue({
      jobId: 'job-ai-batch-1',
      state: 'done',
      errorCode: null,
      suggestions: [
        {
          id: 'sug-batch-1',
          start: 5.0,
          end: 25.0,
          title: 'First Key Concept',
          reason: 'Clear explanation of concept',
          status: 'suggested',
        },
      ],
      modelUsed: 'gemini-2.5-flash',
      transcriptTruncated: false,
    });

    render(<ShortsClipperPage />);

    await waitFor(() => {
      expect(screen.getAllByText('demo-lecture.mp4')[0]).toBeInTheDocument();
    });

    // Verify clean empty state in Generated Clips gallery
    expect(screen.getByText('No clips generated yet.')).toBeInTheDocument();
    expect(screen.queryByText(/Choose start and end timestamps above/i)).not.toBeInTheDocument();

    // Switch to AI Auto-Clip mode
    fireEvent.click(screen.getByRole('tab', { name: /AI Auto-Clip/i }));

    await waitFor(() => {
      expect(screen.getByText('First Key Concept')).toBeInTheDocument();
    });

    // Clutter checks: No disclaimer subtitle, no model/device metadata
    expect(screen.queryByText(/they do not predict performance/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/device: cpu/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/model: medium/i)).not.toBeInTheDocument();

    // Mock generated batch response
    mockGenerateHighlightClips.mockResolvedValueOnce([
      {
        id: 'clip-ai-generated-1',
        jobId: 'job-ai-batch-1',
        startSeconds: 5.0,
        endSeconds: 25.0,
        aspect: 'vertical_9_16',
        status: 'queued',
        errorCode: null,
        createdAt: '2026-10-21T10:00:00Z',
        finishedAt: null,
      },
    ]);

    const generateBtn = screen.getByRole('button', { name: /Generate selected clips \(1\)/i });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(mockGenerateHighlightClips).toHaveBeenCalledWith('job-ai-batch-1', {
        suggestionIds: ['sug-batch-1'],
        suggestions: [
          {
            id: 'sug-batch-1',
            start: 5.0,
            end: 25.0,
            title: 'First Key Concept',
            reason: 'Clear explanation of concept',
          },
        ],
        aspect: 'vertical_9_16',
      });
    });

    // Check that the clip is queued and appears in Generated Clips gallery
    await waitFor(() => {
      expect(screen.getByTestId('clip-status-clip-ai-generated-1')).toBeInTheDocument();
      expect(screen.getByText('QUEUED')).toBeInTheDocument();
    });
  });
});



