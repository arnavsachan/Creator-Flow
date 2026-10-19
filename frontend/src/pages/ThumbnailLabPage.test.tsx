import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThumbnailLabPage } from './ThumbnailLabPage';
import * as thumbnailService from '../services/thumbnailService';

describe('ThumbnailLabPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders page title and all 3 navigation tabs', () => {
    render(<ThumbnailLabPage />);
    expect(
      screen.getByText(/Thumbnail Lab & Title Scoring Engine/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Thumbnail Audit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Title Scorer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Benchmarks/i })).toBeInTheDocument();
  });

  it('switches to Benchmarks tab and displays preserved concepts', () => {
    render(<ThumbnailLabPage />);
    const benchmarksTab = screen.getByRole('button', { name: /Benchmarks/i });
    fireEvent.click(benchmarksTab);

    expect(
      screen.getByText(/Concept A: High Contrast Facial Focal Point/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Concept B: Minimalist Code Architecture Diagram/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/14.2:1 \(AAA\)/i)).toBeInTheDocument();
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
