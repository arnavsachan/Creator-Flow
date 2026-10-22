import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThumbnailLabPage } from './ThumbnailLabPage';
import * as thumbnailService from '../services/thumbnailService';

describe('ThumbnailLabPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders page title and both navigation tabs', () => {
    render(<ThumbnailLabPage />);
    expect(
      screen.getByText(/Thumbnail Lab & Title Scoring Engine/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Thumbnail Audit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Title Scorer/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Benchmarks/i })).not.toBeInTheDocument();
  });

  it('defaults to Thumbnail Audit tab and does not render Benchmarks content', () => {
    render(<ThumbnailLabPage />);
    // Thumbnail Audit is active by default
    expect(screen.getByText(/Upload Variant/i)).toBeInTheDocument();
    expect(screen.getByText(/No Variant Analyzed Yet/i)).toBeInTheDocument();

    // Benchmarks content must not be present
    expect(screen.queryByRole('button', { name: /Benchmarks/i })).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Concept A: High Contrast Facial Focal Point/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Concept B: Minimalist Code Architecture Diagram/i)
    ).not.toBeInTheDocument();
  });

  it('switches to Title Scorer tab and shows empty state', () => {
    render(<ThumbnailLabPage />);
    const titleTab = screen.getByRole('button', { name: /Title Scorer/i });
    fireEvent.click(titleTab);

    expect(screen.getByText(/No Title Evaluated Yet/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e\.g\. 7 Proven YouTube Automation Secrets/i)).toBeInTheDocument();
  });

  it('validates empty title and shows error', async () => {
    render(<ThumbnailLabPage />);
    const titleTab = screen.getByRole('button', { name: /Title Scorer/i });
    fireEvent.click(titleTab);

    const submitBtn = screen.getByRole('button', { name: /Score Video Title/i });
    // Attempt submit with empty title
    fireEvent.click(submitBtn);

    // Disabled button or error display
    expect(submitBtn).toBeDisabled();
  });

  it('successfully analyzes title and renders scoring breakdown', async () => {
    const mockScoreResponse = {
      overallScore: 88,
      grade: 'A Strong Performer',
      clarityScore: 92,
      specificityScore: 85,
      curiosityScore: 89,
      readabilityScore: 95,
      relevanceScore: 80,
      criteria: [
        {
          name: 'Clarity',
          score: 92,
          grade: 'Excellent' as const,
          reasoning: 'Clear phrasing and punchy length.',
          suggestions: [],
        },
      ],
      explanations: ['Weighted composite of clarity, specificity, and curiosity.'],
      suggestions: ['Add a bracketed tag to boost specificity.'],
      alternativeTitles: [
        'The Real Reason YouTube Automation Is Changing',
        '7 YouTube Secrets That Actually Work in 2026',
      ],
      characterCount: 45,
      wordCount: 7,
      provider: 'heuristic-nlp-engine',
      providerNote: 'Evaluated using heuristic title analytics.',
      evaluatedAt: new Date().toISOString(),
    };

    vi.spyOn(thumbnailService, 'scoreTitle').mockResolvedValueOnce(mockScoreResponse);

    render(<ThumbnailLabPage />);
    const titleTab = screen.getByRole('button', { name: /Title Scorer/i });
    fireEvent.click(titleTab);

    const titleInput = screen.getByPlaceholderText(/e\.g\. 7 Proven YouTube Automation Secrets/i);
    fireEvent.change(titleInput, {
      target: { value: '7 Proven YouTube Automation Secrets in 2026' },
    });

    const submitBtn = screen.getByRole('button', { name: /Score Video Title/i });
    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/88/)).toBeInTheDocument();
      expect(screen.getByText(/A Strong Performer/i)).toBeInTheDocument();
      expect(
        screen.getByText('The Real Reason YouTube Automation Is Changing')
      ).toBeInTheDocument();
    });
  });

  it('handles thumbnail scoring timeout cleanly: stops loading, preserves image, clears stale scores, and shows retry message', async () => {
    window.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/dummy-url');

    const timeoutErr = new Error(
      'Thumbnail scoring request timed out. The AI model is taking longer than expected. Your image is preserved—please click Analyze to retry.'
    );
    (timeoutErr as any).code = 'ECONNABORTED';
    (timeoutErr as any).isTimeout = true;

    vi.spyOn(thumbnailService, 'scoreThumbnail').mockRejectedValueOnce(timeoutErr);

    render(<ThumbnailLabPage />);

    // Upload a file
    const file = new File(['dummy-bytes'], 'sample_thumb.png', { type: 'image/png' });
    const fileInput = document.querySelector('#thumbnail-upload-input') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Click Analyze button
    const analyzeBtn = screen.getByRole('button', { name: /Run Diagnostic Scoring/i });
    fireEvent.click(analyzeBtn);

    // Wait for error banner and retry button
    await waitFor(() => {
      expect(screen.getByText(/Thumbnail scoring request timed out/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Retry Diagnostic Scoring/i })).toBeInTheDocument();
      // Ensure filename and image preview are preserved
      expect(screen.getByText('sample_thumb.png')).toBeInTheDocument();
      // Ensure no stale score is displayed
      expect(screen.getByText(/No Variant Analyzed Yet/i)).toBeInTheDocument();
    });
  });

  it('clears stale scores when a subsequent thumbnail analysis fails with timeout', async () => {
    window.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/dummy-url-2');

    const mockInitialSuccess = {
      overallScore: 92,
      grade: 'A+ Recommended',
      focalPoint: 'Center Subject Face',
      contrastRatio: '14.2:1 (AAA)',
      criteria: [],
      suggestions: ['Keep text bold'],
      warnings: [],
      metadata: {
        width: 1280,
        height: 720,
        aspectRatio: '16:9',
        fileFormat: 'PNG',
        fileSizeBytes: 1024,
        isRecommendedResolution: true,
      },
      provider: 'google-gemini/gemini-2.5-flash',
      providerNote: 'Analyzed with Gemini AI',
      evaluatedAt: new Date().toISOString(),
    };

    const mockScoreSpy = vi.spyOn(thumbnailService, 'scoreThumbnail');
    mockScoreSpy.mockResolvedValueOnce(mockInitialSuccess);

    render(<ThumbnailLabPage />);

    // First upload and analyze
    const file = new File(['dummy-bytes'], 'variant_a.png', { type: 'image/png' });
    const fileInput = document.querySelector('#thumbnail-upload-input') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    const analyzeBtn = screen.getByRole('button', { name: /Run Diagnostic Scoring/i });
    fireEvent.click(analyzeBtn);

    await waitFor(() => {
      expect(screen.getByText(/92/)).toBeInTheDocument();
    });

    // Now mock second attempt as timeout
    const timeoutErr = new Error('Thumbnail scoring request timed out.');
    (timeoutErr as any).code = 'ECONNABORTED';
    mockScoreSpy.mockRejectedValueOnce(timeoutErr);

    const retryBtn = screen.getByRole('button', { name: /Run Diagnostic Scoring/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText(/Thumbnail scoring request timed out/i)).toBeInTheDocument();
      // The score 92 MUST NOT be in the document anymore (stale score avoided!)
      expect(screen.queryByText(/92/)).not.toBeInTheDocument();
      expect(screen.getByText(/No Variant Analyzed Yet/i)).toBeInTheDocument();
    });
  });

  it('renders quota exhaustion error with specific note explaining provider limits', async () => {
    window.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/dummy-url-3');


    const quotaErr = new Error(
      'Google Gemini API quota has been exhausted for this project. Check your plan and billing details at Google AI Studio.'
    );

    vi.spyOn(thumbnailService, 'scoreThumbnail').mockRejectedValueOnce(quotaErr);

    render(<ThumbnailLabPage />);

    const file = new File(['dummy-bytes'], 'variant_quota.png', { type: 'image/png' });
    const fileInput = document.querySelector('#thumbnail-upload-input') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    const analyzeBtn = screen.getByRole('button', { name: /Run Diagnostic Scoring/i });
    fireEvent.click(analyzeBtn);

    await waitFor(() => {
      expect(screen.getByText(/Google Gemini API quota has been exhausted/i)).toBeInTheDocument();
      expect(screen.getByText(/Code modifications cannot restore provider quota/i)).toBeInTheDocument();
      expect(screen.getByText('variant_quota.png')).toBeInTheDocument();
    });
  });

  it('discards stale async response if a subsequent request completes first', async () => {
    window.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/dummy-url-4');

    let resolveFirst: (val: any) => void;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    const mockScoreSpy = vi.spyOn(thumbnailService, 'scoreThumbnail');

    const file = new File(['dummy-bytes'], 'variant_race.png', { type: 'image/png' });
    render(<ThumbnailLabPage />);
    const fileInput = document.querySelector('#thumbnail-upload-input') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    // 1st request hangs
    mockScoreSpy.mockReturnValueOnce(firstPromise as any);
    const analyzeBtn = screen.getByRole('button', { name: /Run Diagnostic Scoring/i });
    fireEvent.click(analyzeBtn);

    // Upload a new file (which cancels request 1)
    const file2 = new File(['dummy-bytes-2'], 'variant_race_2.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file2] } });

    // 2nd request succeeds immediately
    const mockSuccess2 = {
      overallScore: 85,
      grade: 'A High Performing',
      focalPoint: 'Subject Hero',
      contrastRatio: '10:1 (AA)',
      criteria: [],
      suggestions: [],
      warnings: [],
      metadata: {
        width: 1280,
        height: 720,
        aspectRatio: '16:9',
        fileFormat: 'PNG',
        fileSizeBytes: 2048,
        isRecommendedResolution: true,
      },
      provider: 'google-gemini/gemini-3.8-flash',
      providerNote: 'Analyzed with Gemini AI',
      evaluatedAt: new Date().toISOString(),
    };
    mockScoreSpy.mockResolvedValueOnce(mockSuccess2);

    const analyzeBtn2 = screen.getByRole('button', { name: /Run Diagnostic Scoring/i });
    fireEvent.click(analyzeBtn2);

    await waitFor(() => {
      expect(screen.getByText(/85/)).toBeInTheDocument();
      expect(screen.getByText('variant_race_2.png')).toBeInTheDocument();
    });

    // Now resolve the 1st request (stale!)
    const mockStaleResponse = {
      overallScore: 50,
      grade: 'D Low Glanceability',
      focalPoint: 'Stale Focal',
      contrastRatio: '3:1',
      criteria: [],
      suggestions: [],
      warnings: [],
      metadata: {
        width: 640,
        height: 360,
        aspectRatio: '16:9',
        fileFormat: 'PNG',
        fileSizeBytes: 1024,
        isRecommendedResolution: false,
      },
      provider: 'google-gemini/gemini-3.8-flash',
      providerNote: 'Stale analysis',
      evaluatedAt: new Date().toISOString(),
    };
    resolveFirst!(mockStaleResponse);

    // Ensure score 85 remains and stale score 50 is never rendered
    expect(screen.getByText(/85/)).toBeInTheDocument();
    expect(screen.queryByText(/50/)).not.toBeInTheDocument();
  });
});

describe('thumbnailService file validation', () => {
  it('accepts valid JPEG, PNG, and WebP files', () => {
    const validPng = new File(['dummy content'], 'thumb.png', { type: 'image/png' });
    expect(() => thumbnailService.validateThumbnailFile(validPng)).not.toThrow();

    const validJpg = new File(['dummy content'], 'thumb.jpg', { type: 'image/jpeg' });
    expect(() => thumbnailService.validateThumbnailFile(validJpg)).not.toThrow();

    const validWebp = new File(['dummy content'], 'thumb.webp', { type: 'image/webp' });
    expect(() => thumbnailService.validateThumbnailFile(validWebp)).not.toThrow();
  });

  it('rejects empty 0-byte file', () => {
    const emptyFile = new File([], 'empty.png', { type: 'image/png' });
    expect(() => thumbnailService.validateThumbnailFile(emptyFile)).toThrow(
      /empty/i
    );
  });

  it('rejects unsupported file extension/mime', () => {
    const pdfFile = new File(['dummy'], 'document.pdf', { type: 'application/pdf' });
    expect(() => thumbnailService.validateThumbnailFile(pdfFile)).toThrow(
      /unsupported file format/i
    );
  });

  it('rejects file exceeding 10MB', () => {
    const largeBlob = new Blob([new Uint8Array(11 * 1024 * 1024)]);
    const largeFile = new File([largeBlob], 'huge.png', { type: 'image/png' });
    expect(() => thumbnailService.validateThumbnailFile(largeFile)).toThrow(
      /exceeds maximum allowed limit of 10 MB/i
    );
  });
});
