import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModeProvider } from '../context/AppModeContext';
import { ContentLibraryPage } from './ContentLibraryPage';
import * as youtubeService from '../services/youtubeService';
import type {
  ChannelDetailsResponse,
  ContentLibraryResponse,
} from '../types/youtube';

vi.mock('../services/youtubeService', async (importOriginal) => {
  const actual = await importOriginal<typeof youtubeService>();
  return {
    ...actual,
    getConnectionStatus: vi.fn(),
    getChannelDetails: vi.fn(),
    getContentLibrary: vi.fn(),
    startOAuth: vi.fn(),
  };
});

describe('ContentLibraryPage Tests', () => {
  const mockChannelDetails: ChannelDetailsResponse = {
    channelId: 'demo-channel-1',
    dataState: 'DEMO',
    isLive: false,
    title: 'Tech Pulse',
    description: 'Deep dives into system design and AI agents.',
    customUrl: '@TechPulseOfficial',
    publishedAt: '2024-01-15T00:00:00Z',
    thumbnailUrl: 'https://example.com/avatar.jpg',
    subscriberCount: 48200,
    hiddenSubscriberCount: false,
    videoCount: 128,
    viewCount: 1428900,
    topicCategories: ['https://en.wikipedia.org/wiki/Technology'],
    hasDataScope: true,
  };

  const mockLibraryResponse: ContentLibraryResponse = {
    channelId: 'demo-channel-1',
    dataState: 'DEMO',
    isLive: false,
    videos: [
      {
        videoId: 'vid_001',
        channelId: 'demo-channel-1',
        channelTitle: 'Tech Pulse',
        title: 'We Built an Autonomous YouTube Studio in 48 Hours',
        description: 'Multi-agent coding workflows for full studio automation.',
        publishedAt: '2026-10-18T14:00:00Z',
        relativePublished: '3 days ago',
        thumbnailUrl: 'https://example.com/thumb1.jpg',
        duration: '14:28',
        durationIso: 'PT14M28S',
        durationSeconds: 868,
        viewCount: 184500,
        likeCount: 9820,
        commentCount: 642,
        tags: ['AI Agents', 'FastAPI', 'Automation'],
        privacyStatus: 'public',
        definition: 'hd',
        hasCaption: true,
      },
      {
        videoId: 'vid_002',
        channelId: 'demo-channel-1',
        channelTitle: 'Tech Pulse',
        title: 'Building a Multi-Agent YouTube Production Engine',
        description: 'Architecting worker queues and telemetry pipelines.',
        publishedAt: '2026-10-14T10:00:00Z',
        relativePublished: '7 days ago',
        thumbnailUrl: 'https://example.com/thumb2.jpg',
        duration: '18:42',
        durationIso: 'PT18M42S',
        durationSeconds: 1122,
        viewCount: 142300,
        likeCount: 7410,
        commentCount: 489,
        tags: ['System Design', 'Python'],
        privacyStatus: 'public',
        definition: 'hd',
        hasCaption: true,
      },
    ],
    nextPageToken: 'NEXT_PAGE_TOKEN_1',
    prevPageToken: null,
    totalResults: 28,
    resultsPerPage: 24,
    q: null,
    order: 'date',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    localStorage.setItem('auth_token', 'mock_token');
    localStorage.setItem('selected_channel_id', 'demo-channel-1');

    vi.mocked(youtubeService.getConnectionStatus).mockResolvedValue({
      connected: false,
      channel: null,
    });
    vi.mocked(youtubeService.getChannelDetails).mockResolvedValue(mockChannelDetails);
    vi.mocked(youtubeService.getContentLibrary).mockResolvedValue(mockLibraryResponse);
  });

  it('renders loading state initially', async () => {
    // Delay resolution to capture loading
    vi.mocked(youtubeService.getContentLibrary).mockReturnValueOnce(new Promise(() => {}));

    render(
      <AppModeProvider initialDataState="DEMO" initialChannelId="demo-channel-1">
        <ContentLibraryPage />
      </AppModeProvider>
    );

    expect(screen.getByTestId('content-library-loading')).toBeInTheDocument();
    expect(screen.getByText(/Fetching uploaded videos/i)).toBeInTheDocument();
  });

  it('renders channel details and video cards with duration and statistics', async () => {
    render(
      <AppModeProvider initialDataState="DEMO" initialChannelId="demo-channel-1">
        <ContentLibraryPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Tech Pulse')).toBeInTheDocument();
      expect(screen.getByText('We Built an Autonomous YouTube Studio in 48 Hours')).toBeInTheDocument();
      expect(screen.getByText('Building a Multi-Agent YouTube Production Engine')).toBeInTheDocument();
    });

    // Check duration display
    expect(screen.getByText('14:28')).toBeInTheDocument();
    expect(screen.getByText('18:42')).toBeInTheDocument();

    // Check stats
    expect(screen.getByText('184,500')).toBeInTheDocument();
    expect(screen.getByText('9,820')).toBeInTheDocument();
    expect(screen.getByText('642')).toBeInTheDocument();

    // Check badges
    expect(screen.getByText('DEMO / SAMPLE DATA')).toBeInTheDocument();
  });

  it('renders live telemetry badge and verified tag when in live channel mode', async () => {
    const liveDetails: ChannelDetailsResponse = {
      ...mockChannelDetails,
      channelId: 'UC_LIVE_123',
      title: 'Live Creator Channel',
      isLive: true,
      dataState: 'LIVE',
    };
    const liveLibrary: ContentLibraryResponse = {
      ...mockLibraryResponse,
      channelId: 'UC_LIVE_123',
      isLive: true,
      dataState: 'LIVE',
    };

    vi.mocked(youtubeService.getChannelDetails).mockResolvedValue(liveDetails);
    vi.mocked(youtubeService.getContentLibrary).mockResolvedValue(liveLibrary);

    render(
      <AppModeProvider initialDataState="LIVE" initialChannelId="UC_LIVE_123">
        <ContentLibraryPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('LIVE TELEMETRY')).toBeInTheDocument();
      expect(screen.getByText('YOUTUBE DATA API v3')).toBeInTheDocument();
    });
  });

  it('renders Google Cloud API disabled banner when service is disabled', async () => {
    vi.mocked(youtubeService.getContentLibrary).mockResolvedValueOnce({
      ...mockLibraryResponse,
      dataState: 'SERVICE_DISABLED',
      isLive: true,
      videos: [],
    });

    render(
      <AppModeProvider initialDataState="LIVE" initialChannelId="UC_LIVE_123">
        <ContentLibraryPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('api-disabled-banner')).toBeInTheDocument();
      expect(screen.getByText(/YouTube Data API v3 Not Enabled/i)).toBeInTheDocument();
      expect(screen.getByText('Enable in Google Cloud')).toBeInTheDocument();
    });
  });

  it('renders re-authorization banner when permissions are missing and triggers OAuth', async () => {
    vi.mocked(youtubeService.getContentLibrary).mockResolvedValueOnce({
      ...mockLibraryResponse,
      dataState: 'AUTHORIZATION_REQUIRED',
      isLive: true,
      videos: [],
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?mock=1',
    });
    vi.mocked(youtubeService.startOAuth).mockResolvedValue({
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?mock=1',
      state: 'mock_state',
    });

    render(
      <AppModeProvider initialDataState="LIVE" initialChannelId="UC_LIVE_123">
        <ContentLibraryPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('authorize-banner')).toBeInTheDocument();
      expect(screen.getByText(/Grant YouTube Data API Read Permissions/i)).toBeInTheDocument();
    });

    const authBtn = screen.getByTestId('authorize-data-api-button');
    expect(authBtn).toBeInTheDocument();

    // Mock window.location
    const originalLocation = window.location;
    delete (window as any).location;
    (window as any).location = { ...originalLocation, href: '' };

    await act(async () => {
      fireEvent.click(authBtn);
    });

    expect((window as any).location.href).toContain('accounts.google.com');
    (window as any).location = originalLocation;
  });

  it('renders quota exceeded banner when rate limited', async () => {
    vi.mocked(youtubeService.getContentLibrary).mockRejectedValueOnce({
      status: 429,
      message: 'YouTube Data API quota or rate limit exceeded. Please try again later.',
    });

    render(
      <AppModeProvider initialDataState="LIVE" initialChannelId="UC_LIVE_123">
        <ContentLibraryPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('quota-error-banner')).toBeInTheDocument();
      expect(screen.getByText(/YouTube Data API Quota Limit Exceeded/i)).toBeInTheDocument();
    });
  });

  it('renders ErrorState with retry on general API failure', async () => {
    vi.mocked(youtubeService.getContentLibrary).mockRejectedValueOnce({
      status: 503,
      message: 'Unable to reach YouTube Data API.',
    });

    render(
      <AppModeProvider initialDataState="LIVE" initialChannelId="UC_LIVE_123">
        <ContentLibraryPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('content-library-error')).toBeInTheDocument();
      expect(screen.getByText(/Unable to reach YouTube Data API/i)).toBeInTheDocument();
    });

    // Test retry
    vi.mocked(youtubeService.getContentLibrary).mockResolvedValue(mockLibraryResponse);
    const retryBtn = screen.getByRole('button', { name: /retry/i });
    await act(async () => {
      fireEvent.click(retryBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('We Built an Autonomous YouTube Studio in 48 Hours')).toBeInTheDocument();
    });
  });

  it('renders empty state when no videos match query', async () => {
    vi.mocked(youtubeService.getContentLibrary).mockResolvedValue({
      ...mockLibraryResponse,
      videos: [],
      totalResults: 0,
    });

    render(
      <AppModeProvider initialDataState="DEMO" initialChannelId="demo-channel-1">
        <ContentLibraryPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('content-library-empty')).toBeInTheDocument();
      expect(screen.getByText(/No Uploaded Videos Found/i)).toBeInTheDocument();
    });
  });

  it('handles search input with debouncing and calls service with query', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    render(
      <AppModeProvider initialDataState="DEMO" initialChannelId="demo-channel-1">
        <ContentLibraryPage />
      </AppModeProvider>
    );

    const searchInput = screen.getByTestId('search-input');
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'Autonomous' } });
    });

    // Advance 300ms debounce timer
    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(youtubeService.getContentLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        q: 'Autonomous',
      })
    );

    vi.useRealTimers();
  });

  it('handles sorting selection and refetches data', async () => {
    render(
      <AppModeProvider initialDataState="DEMO" initialChannelId="demo-channel-1">
        <ContentLibraryPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('sort-select')).toBeInTheDocument();
    });

    const sortSelect = screen.getByTestId('sort-select');
    await act(async () => {
      fireEvent.change(sortSelect, { target: { value: 'views' } });
    });

    expect(youtubeService.getContentLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        order: 'views',
      })
    );
  });

  it('handles pagination next and previous clicks', async () => {
    render(
      <AppModeProvider initialDataState="DEMO" initialChannelId="demo-channel-1">
        <ContentLibraryPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('next-page-btn')).toBeInTheDocument();
    });

    const nextBtn = screen.getByTestId('next-page-btn');
    expect(nextBtn).not.toBeDisabled();

    // Click Next
    await act(async () => {
      fireEvent.click(nextBtn);
    });

    expect(youtubeService.getContentLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        pageToken: 'NEXT_PAGE_TOKEN_1',
      })
    );

    // After moving to next page, Previous button should be enabled
    const prevBtn = screen.getByTestId('prev-page-btn');
    expect(prevBtn).not.toBeDisabled();

    // Click Previous
    await act(async () => {
      fireEvent.click(prevBtn);
    });

    expect(youtubeService.getContentLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        pageToken: undefined,
      })
    );
  });
});
