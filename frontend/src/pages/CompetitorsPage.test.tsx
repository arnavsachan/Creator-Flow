import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModeProvider } from '../context/AppModeContext';
import { CompetitorAvatar, CompetitorsPage, VideoThumbnail } from './CompetitorsPage';
import * as competitorService from '../services/competitorService';
import type {
  CompetitorComparisonResponse,
  CompetitorResponse,
  CompetitorSearchResponse,
  CompetitorUploadsResponse,
} from '../types/competitor';

vi.mock('../services/competitorService', async (importOriginal) => {
  const actual = await importOriginal<typeof competitorService>();
  return {
    ...actual,
    searchCompetitors: vi.fn(),
    getCompetitors: vi.fn(),
    saveCompetitor: vi.fn(),
    deleteCompetitor: vi.fn(),
    getCompetitorUploads: vi.fn(),
    compareCompetitor: vi.fn(),
  };
});

describe('CompetitorsPage Tests', () => {
  const mockCompetitors: CompetitorResponse[] = [
    {
      id: 'comp_1',
      userId: 'user_1',
      channelId: 'UC_COMP_1',
      title: 'Tech Lead Pro',
      customUrl: '@TechLeadPro',
      description: 'System architecture and engineering management.',
      thumbnailUrl: 'https://example.com/avatar1.jpg',
      subscriberCount: 420000,
      hiddenSubscriberCount: false,
      videoCount: 340,
      viewCount: 45200000,
      primaryChannelId: 'demo-channel-1',
      notes: 'Direct competitor',
      createdAt: '2026-10-22T10:00:00Z',
      updatedAt: '2026-10-22T10:00:00Z',
    },
    {
      id: 'comp_2',
      userId: 'user_1',
      channelId: 'UC_COMP_2',
      title: 'ByteByte Architecture',
      customUrl: '@ByteByteArch',
      description: 'Visual guides to distributed systems.',
      thumbnailUrl: 'https://example.com/avatar2.jpg',
      subscriberCount: 890000,
      hiddenSubscriberCount: false,
      videoCount: 280,
      viewCount: 92100000,
      primaryChannelId: 'demo-channel-1',
      notes: null,
      createdAt: '2026-10-21T10:00:00Z',
      updatedAt: '2026-10-21T10:00:00Z',
    },
  ];

  const mockSearchResults: CompetitorSearchResponse = {
    query: 'DevOps',
    results: [
      {
        channelId: 'UC_FOUND_DEV',
        title: 'DevOps Directive',
        description: 'Hands on infrastructure tutorials.',
        customUrl: '@DevOpsDirective',
        thumbnailUrl: 'https://example.com/devops.jpg',
        subscriberCount: 150000,
        hiddenSubscriberCount: false,
        videoCount: 110,
        viewCount: 12000000,
        isTracked: false,
      },
    ],
    totalResults: 1,
    dataState: 'LIVE',
  };

  const mockComparison: CompetitorComparisonResponse = {
    userChannelId: 'demo-channel-1',
    userChannelTitle: 'Tech Pulse',
    competitorId: 'comp_1',
    competitorChannelId: 'UC_COMP_1',
    competitorTitle: 'Tech Lead Pro',
    metrics: [
      {
        metricKey: 'subscribers',
        label: 'Public Subscribers',
        userValue: 48200,
        competitorValue: 420000,
        diffPct: -88.5,
      },
      {
        metricKey: 'lifetime_views',
        label: 'Lifetime Channel Views',
        userValue: 1428900,
        competitorValue: 45200000,
        diffPct: -96.8,
      },
      {
        metricKey: 'video_count',
        label: 'Public Video Count',
        userValue: 128,
        competitorValue: 340,
        diffPct: -62.4,
      },
    ],
    userRecentVideos: [],
    competitorRecentVideos: [],
    privateDataDisclosure: 'Private metrics (such as impressions CTR and shared audience overlap) are protected by YouTube.',
  };

  const mockUploads: CompetitorUploadsResponse = {
    competitorId: 'comp_1',
    channelId: 'UC_COMP_1',
    channelTitle: 'Tech Lead Pro',
    videos: [
      {
        videoId: 'vid_123',
        channelId: 'UC_COMP_1',
        title: 'Scaling Distributed Cache with Redis',
        description: 'Cache invalidation best practices.',
        publishedAt: '2026-10-20T10:00:00Z',
        relativePublished: '2 days ago',
        thumbnailUrl: 'https://example.com/thumb_redis.jpg',
        duration: '16:45',
        durationSeconds: 1005,
        viewCount: 84200,
        likeCount: 4210,
        commentCount: 340,
        youtubeUrl: 'https://www.youtube.com/watch?v=vid_123',
      },
    ],
    totalResults: 1,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    localStorage.setItem('auth_token', 'mock_valid_token');

    vi.mocked(competitorService.getCompetitors).mockResolvedValue(mockCompetitors);
    vi.mocked(competitorService.compareCompetitor).mockResolvedValue(mockComparison);
    vi.mocked(competitorService.getCompetitorUploads).mockResolvedValue(mockUploads);
    vi.mocked(competitorService.searchCompetitors).mockResolvedValue(mockSearchResults);
  });

  it('renders loading state initially', async () => {
    vi.mocked(competitorService.getCompetitors).mockReturnValueOnce(new Promise(() => {}));

    render(
      <AppModeProvider initialDataState="DEMO" initialChannelId="demo-channel-1">
        <CompetitorsPage />
      </AppModeProvider>
    );

    expect(screen.getByTestId('competitors-loading')).toBeInTheDocument();
    expect(screen.getByText(/Loading tracked competitors/i)).toBeInTheDocument();
  });

  it('renders tracked competitors list and side-by-side comparison', async () => {
    render(
      <AppModeProvider initialDataState="DEMO" initialChannelId="demo-channel-1">
        <CompetitorsPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Tech Lead Pro')).toBeInTheDocument();
      expect(screen.getByText('ByteByte Architecture')).toBeInTheDocument();
    });

    // Check subscriber counts on cards
    expect(screen.getByText('420,000')).toBeInTheDocument();
    expect(screen.getByText('890,000')).toBeInTheDocument();

    // Check comparison section rendered for auto-selected first competitor
    await waitFor(() => {
      expect(screen.getByTestId('comparison-section')).toBeInTheDocument();
      expect(screen.getByText(/Head-to-Head Comparison/i)).toBeInTheDocument();
      expect(screen.getByText('Public Subscribers')).toBeInTheDocument();
      expect(screen.getByText('Lifetime Channel Views')).toBeInTheDocument();
      expect(screen.getByTestId('data-disclosure-notice')).toBeInTheDocument();
    });
  });

  it('handles competitor search debouncing and shows results with add action', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    render(
      <AppModeProvider initialDataState="DEMO" initialChannelId="demo-channel-1">
        <CompetitorsPage />
      </AppModeProvider>
    );

    const searchInput = screen.getByTestId('competitor-search-input');
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'DevOps' } });
    });

    // Advance 350ms timer
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(competitorService.searchCompetitors).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'DevOps' })
    );

    vi.useRealTimers();

    await waitFor(() => {
      expect(screen.getByTestId('search-results-list')).toBeInTheDocument();
      expect(screen.getByText('DevOps Directive')).toBeInTheDocument();
      expect(screen.getByTestId('add-competitor-btn-UC_FOUND_DEV')).toBeInTheDocument();
    });

    // Click track competitor
    const newComp: CompetitorResponse = {
      ...mockCompetitors[0],
      id: 'comp_new_dev',
      channelId: 'UC_FOUND_DEV',
      title: 'DevOps Directive',
    };
    vi.mocked(competitorService.saveCompetitor).mockResolvedValueOnce(newComp);

    const addBtn = screen.getByTestId('add-competitor-btn-UC_FOUND_DEV');
    await act(async () => {
      fireEvent.click(addBtn);
    });

    expect(competitorService.saveCompetitor).toHaveBeenCalledWith(
      expect.objectContaining({ channelId: 'UC_FOUND_DEV' })
    );
  });

  it('renders competitor latest uploads drawer when Latest Uploads button is clicked', async () => {
    render(
      <AppModeProvider initialDataState="DEMO" initialChannelId="demo-channel-1">
        <CompetitorsPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('uploads-btn-comp_1')).toBeInTheDocument();
    });

    const uploadsBtn = screen.getByTestId('uploads-btn-comp_1');
    await act(async () => {
      fireEvent.click(uploadsBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('competitor-uploads-section')).toBeInTheDocument();
      expect(screen.getByText('Scaling Distributed Cache with Redis')).toBeInTheDocument();
      expect(screen.getByText('16:45')).toBeInTheDocument();
      expect(screen.getByText('84,200')).toBeInTheDocument();
    });
  });

  it('removes a competitor when delete button is clicked', async () => {
    vi.mocked(competitorService.deleteCompetitor).mockResolvedValueOnce();

    render(
      <AppModeProvider initialDataState="DEMO" initialChannelId="demo-channel-1">
        <CompetitorsPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('delete-competitor-comp_1')).toBeInTheDocument();
    });

    const deleteBtn = screen.getByTestId('delete-competitor-comp_1');
    await act(async () => {
      fireEvent.click(deleteBtn);
    });

    expect(competitorService.deleteCompetitor).toHaveBeenCalledWith('comp_1');
  });

  it('renders empty state when no competitors exist', async () => {
    vi.mocked(competitorService.getCompetitors).mockResolvedValueOnce([]);

    render(
      <AppModeProvider initialDataState="DEMO" initialChannelId="demo-channel-1">
        <CompetitorsPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('competitors-empty')).toBeInTheDocument();
      expect(screen.getByText(/No Tracked Competitors Yet/i)).toBeInTheDocument();
    });
  });

  it('displays quota error banner if quota limit is reached', async () => {
    vi.mocked(competitorService.searchCompetitors).mockRejectedValueOnce({
      status: 429,
      message: 'YouTube Data API quota or rate limit exceeded.',
    });

    render(
      <AppModeProvider initialDataState="DEMO" initialChannelId="demo-channel-1">
        <CompetitorsPage />
      </AppModeProvider>
    );

    const searchInput = screen.getByTestId('competitor-search-input');
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'HighVolumeQuery' } });
    });

    await waitFor(() => {
      expect(screen.getByTestId('quota-error-banner')).toBeInTheDocument();
      expect(screen.getByText(/YouTube Data API Quota Limit Exceeded/i)).toBeInTheDocument();
    });
  });

  describe('Competitor Avatar & Thumbnail Fallback Tests', () => {
    it('renders valid thumbnail URL with no-referrer policy', () => {
      render(
        <CompetitorAvatar
          url="https://yt3.ggpht.com/valid-avatar.jpg"
          title="Tech Lead Pro"
          size="md"
          testId="test-comp"
        />
      );

      const img = screen.getByTestId('test-comp-img') as HTMLImageElement;
      expect(img).toBeInTheDocument();
      expect(img.src).toBe('https://yt3.ggpht.com/valid-avatar.jpg');
      expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
    });

    it('displays initials fallback avatar when thumbnail URL is null or empty', () => {
      const { rerender } = render(
        <CompetitorAvatar
          url={null}
          title="ByteByte Architecture"
          size="md"
          testId="test-comp"
        />
      );

      const fallback = screen.getByTestId('test-comp-fallback');
      expect(fallback).toBeInTheDocument();
      expect(fallback).toHaveTextContent('B');
      expect(screen.queryByTestId('test-comp-img')).not.toBeInTheDocument();

      // Test with empty string URL
      rerender(
        <CompetitorAvatar
          url=""
          title="DevOps Directive"
          size="sm"
          testId="test-comp"
        />
      );
      expect(screen.getByTestId('test-comp-fallback')).toHaveTextContent('D');
    });

    it('falls back to initials avatar when thumbnail image fails with onError without crashing', () => {
      render(
        <CompetitorAvatar
          url="https://yt3.ggpht.com/broken-avatar.jpg"
          title="Distributed Systems Hub"
          size="md"
          testId="test-comp"
        />
      );

      const img = screen.getByTestId('test-comp-img');
      expect(img).toBeInTheDocument();

      // Simulate network / 403 / broken image error
      fireEvent.error(img);

      // Verify immediate transition to initials fallback avatar
      expect(screen.queryByTestId('test-comp-img')).not.toBeInTheDocument();
      const fallback = screen.getByTestId('test-comp-fallback');
      expect(fallback).toBeInTheDocument();
      expect(fallback).toHaveTextContent('D');
    });

    it('resets error state when image URL prop changes', () => {
      const { rerender } = render(
        <CompetitorAvatar
          url="https://yt3.ggpht.com/broken-avatar.jpg"
          title="Scaling Expert"
          size="md"
          testId="test-comp"
        />
      );

      // Cause error
      fireEvent.error(screen.getByTestId('test-comp-img'));
      expect(screen.getByTestId('test-comp-fallback')).toBeInTheDocument();

      // Change url prop (e.g. fresh channel data loaded)
      rerender(
        <CompetitorAvatar
          url="https://yt3.ggpht.com/new-working-avatar.jpg"
          title="Scaling Expert"
          size="md"
          testId="test-comp"
        />
      );

      // Error state reset, new img rendered
      const newImg = screen.getByTestId('test-comp-img') as HTMLImageElement;
      expect(newImg).toBeInTheDocument();
      expect(newImg.src).toBe('https://yt3.ggpht.com/new-working-avatar.jpg');
    });

    it('failure of one competitor image in tracked list does not affect other competitors', async () => {
      render(
        <AppModeProvider initialDataState="DEMO" initialChannelId="demo-channel-1">
          <CompetitorsPage />
        </AppModeProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('competitor-avatar-comp_1-img')).toBeInTheDocument();
        expect(screen.getByTestId('competitor-avatar-comp_2-img')).toBeInTheDocument();
      });

      const comp1Img = screen.getByTestId('competitor-avatar-comp_1-img');
      const comp2Img = screen.getByTestId('competitor-avatar-comp_2-img');

      // Trigger error on competitor 1's profile picture
      fireEvent.error(comp1Img);

      // Competitor 1 should show fallback avatar with initial 'T'
      await waitFor(() => {
        expect(screen.queryByTestId('competitor-avatar-comp_1-img')).not.toBeInTheDocument();
        expect(screen.getByTestId('competitor-avatar-comp_1-fallback')).toHaveTextContent('T');
      });

      // Competitor 2 must remain completely intact and unaffected
      expect(screen.getByTestId('competitor-avatar-comp_2-img')).toBeInTheDocument();
      expect(comp2Img).toBeInTheDocument();
    });

    it('renders video thumbnail with no-referrer and handles onError fallback', () => {
      const { rerender } = render(
        <VideoThumbnail
          url="https://i.ytimg.com/vi/123/hqdefault.jpg"
          title="Redis Deep Dive"
          testId="test-vid"
        />
      );

      const img = screen.getByTestId('test-vid-img') as HTMLImageElement;
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');

      // Trigger error
      fireEvent.error(img);

      expect(screen.queryByTestId('test-vid-img')).not.toBeInTheDocument();
      expect(screen.getByTestId('test-vid-fallback')).toBeInTheDocument();

      // When url is null
      rerender(
        <VideoThumbnail
          url={null}
          title="Kafka Stream Processing"
          testId="test-vid"
        />
      );
      expect(screen.getByTestId('test-vid-fallback')).toBeInTheDocument();
    });
  });
});
