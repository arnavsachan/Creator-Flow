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
  getSourcePreviewUrl: vi.fn((id: string) => `/mock-api/shorts/jobs/${id}/source`),
  getClipDownloadUrl: vi.fn((jobId: string, clipId: string) => `/mock-api/shorts/jobs/${jobId}/clips/${clipId}/download`),
  getFriendlyErrorMessage: vi.fn((err: any) => err?.message || 'An unexpected error occurred.'),
}));

const mockListJobs = vi.mocked(shortsService.listJobs);
const mockUploadJob = vi.mocked(shortsService.uploadJob);

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
});
