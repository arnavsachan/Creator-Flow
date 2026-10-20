import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AppModeProvider } from '../context/AppModeContext';
import { AnalyticsPage } from './AnalyticsPage';
import * as youtubeService from '../services/youtubeService';

vi.mock('../services/youtubeService', () => ({
  getConnectionStatus: vi.fn(),
  startOAuth: vi.fn(),
  disconnectChannel: vi.fn(),
  syncChannel: vi.fn(),
  getChannelAnalytics: vi.fn(),
  getChannelAudience: vi.fn(),
  default: {
    getConnectionStatus: vi.fn(),
    startOAuth: vi.fn(),
    disconnectChannel: vi.fn(),
    syncChannel: vi.fn(),
    getChannelAnalytics: vi.fn(),
    getChannelAudience: vi.fn(),
  },
}));

const mockGetConnectionStatus = vi.mocked(youtubeService.getConnectionStatus);
const mockGetChannelAnalytics = vi.mocked(youtubeService.getChannelAnalytics);

describe('AnalyticsPage Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders demo metrics when in DEMO mode', async () => {
    mockGetConnectionStatus.mockResolvedValue({
      connected: false,
      channel: null,
    });

    mockGetChannelAnalytics.mockResolvedValue({
      channelId: 'demo-channel-1',
      title: 'Tech Pulse',
      dataState: 'DEMO',
      isLive: false,
      totalViews: 894000,
      totalSubscribers: 14200,
      totalVideos: 124,
      trafficSources: [
        { source: 'YouTube Search', views: 342000, percentage: '38.2%', change: '+12.4%' },
      ],
      retentionChart: [
        { timestamp: '0:30', longForm: 82, shortForm: 94 },
      ],
      scopeLimitationNotice: null,
    });

    render(
      <AppModeProvider>
        <AnalyticsPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('DEMO / SAMPLE DATA')).toBeInTheDocument();
    });

    expect(screen.getByText('894,000')).toBeInTheDocument();
    expect(screen.getByText('14,200')).toBeInTheDocument();
    expect(screen.getByText('124')).toBeInTheDocument();
    expect(screen.getByText('Tech Pulse', { exact: false })).toBeInTheDocument();
  });

  it('fetches and renders live channel telemetry when connected', async () => {
    mockGetConnectionStatus.mockResolvedValue({
      connected: true,
      channel: {
        id: 'live_123',
        channelId: 'UC_LIVE_CHANNEL_XYZ',
        title: 'Chillespada Live',
        customUrl: '@chillespada',
        thumbnailUrl: null,
        subscriberCount: 43,
        videoCount: 13,
        viewCount: 11704,
        status: 'connected',
        connectedAt: '2026-10-20T10:00:00Z',
        lastSyncedAt: '2026-10-20T12:00:00Z',
      },
    });

    mockGetChannelAnalytics.mockImplementation(async (channelId) => {
      if (channelId === 'UC_LIVE_CHANNEL_XYZ') {
        return {
          channelId: 'UC_LIVE_CHANNEL_XYZ',
          title: 'Chillespada Live',
          dataState: 'LIVE',
          isLive: true,
          totalViews: 11704,
          totalSubscribers: 43,
          totalVideos: 13,
          trafficSources: null,
          retentionChart: null,
          scopeLimitationNotice: 'Granular inbound traffic vectors and audience retention curves require YouTube Analytics Reporting API permissions.',
        };
      }
      return {
        channelId: 'demo-channel-1',
        title: 'Tech Pulse',
        dataState: 'DEMO',
        isLive: false,
        totalViews: 894000,
        totalSubscribers: 14200,
        totalVideos: 124,
        trafficSources: null,
        retentionChart: null,
        scopeLimitationNotice: null,
      };
    });

    render(
      <AppModeProvider>
        <AnalyticsPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('11,704')).toBeInTheDocument(); // exact live view count
    });

    expect(screen.getByText('43')).toBeInTheDocument(); // subscribers
    expect(screen.getByText('13')).toBeInTheDocument(); // videos
    expect(screen.getByText('LIVE TELEMETRY')).toBeInTheDocument();
    expect(
      screen.getByText(/Granular Traffic Vectors & Retention API Limitation/i)
    ).toBeInTheDocument();
  });

  it('renders ErrorState with retry when analytics fetch fails', async () => {
    mockGetConnectionStatus.mockResolvedValue({ connected: false, channel: null });
    mockGetChannelAnalytics.mockRejectedValue(new Error('Network error loading analytics'));

    render(
      <AppModeProvider>
        <AnalyticsPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('analytics-error')).toBeInTheDocument();
    });
    expect(screen.getByText('Channel Analytics Unavailable')).toBeInTheDocument();
    expect(screen.getByText(/Network error loading analytics/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry Connection/i })).toBeInTheDocument();
  });

  it('triggers CSV download containing verified channel KPIs on export click', async () => {
    mockGetConnectionStatus.mockResolvedValue({
      connected: true,
      channel: {
        id: 'live_123',
        channelId: 'UC_CSV_TEST',
        title: 'Chillespada Live',
        subscriberCount: 43,
        videoCount: 13,
        viewCount: 11704,
        status: 'connected',
        connectedAt: '2026-10-20T10:00:00Z',
        lastSyncedAt: '2026-10-20T16:00:00Z',
      },
    });

    mockGetChannelAnalytics.mockResolvedValue({
      channelId: 'UC_CSV_TEST',
      title: 'Chillespada Live',
      dataState: 'LIVE',
      isLive: true,
      totalViews: 11704,
      totalSubscribers: 43,
      totalVideos: 13,
      trafficSources: null,
      retentionChart: null,
      scopeLimitationNotice: null,
    });

    // Mock document.createElement and click
    const createElementSpy = vi.spyOn(document, 'createElement');

    render(
      <AppModeProvider>
        <AnalyticsPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('11,704')).toBeInTheDocument();
    });

    const exportBtn = screen.getByTestId('export-csv-button');
    expect(exportBtn).not.toBeDisabled();

    // Verify click triggers download
    exportBtn.click();
    expect(createElementSpy).toHaveBeenCalledWith('a');
  });

  it('renders authorization banner and triggers OAuth when button is clicked', async () => {
    mockGetConnectionStatus.mockResolvedValue({
      connected: true,
      channel: {
        id: 'live_auth_test',
        channelId: 'UC_AUTH_TEST',
        title: 'Auth Channel',
        subscriberCount: 50,
        videoCount: 10,
        viewCount: 1500,
        status: 'connected',
        connectedAt: '2026-10-20T10:00:00Z',
        lastSyncedAt: '2026-10-20T16:00:00Z',
      },
    });

    mockGetChannelAnalytics.mockResolvedValue({
      channelId: 'UC_AUTH_TEST',
      title: 'Auth Channel',
      dataState: 'LIVE',
      isLive: true,
      hasAnalyticsScope: false,
      totalViews: 1500,
      totalSubscribers: 50,
      totalVideos: 10,
      trafficSources: null,
      retentionChart: null,
      timeSeries: null,
      authorizationUrl: null,
      scopeLimitationNotice: null,
    });

    const mockStartOAuth = vi.mocked(youtubeService.startOAuth);
    mockStartOAuth.mockResolvedValue({
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?scope=yt-analytics.readonly',
      state: 'test-state',
    });

    render(
      <AppModeProvider>
        <AnalyticsPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('authorize-analytics-banner')).toBeInTheDocument();
    });

    expect(screen.getByText(/Unlock YouTube Analytics Reporting/i)).toBeInTheDocument();
    const authBtn = screen.getByTestId('authorize-analytics-button');
    expect(authBtn).toBeInTheDocument();

    authBtn.click();
    expect(mockStartOAuth).toHaveBeenCalledWith({ includeAnalytics: true });
  });

  it('renders live traffic sources and daily performance when analytics permission is granted', async () => {
    mockGetConnectionStatus.mockResolvedValue({
      connected: true,
      channel: {
        id: 'live_granted_test',
        channelId: 'UC_GRANTED_TEST',
        title: 'Granted Channel',
        subscriberCount: 200,
        videoCount: 15,
        viewCount: 25000,
        status: 'connected',
        connectedAt: '2026-10-20T10:00:00Z',
        lastSyncedAt: '2026-10-20T16:00:00Z',
      },
    });

    mockGetChannelAnalytics.mockResolvedValue({
      channelId: 'UC_GRANTED_TEST',
      title: 'Granted Channel',
      dataState: 'LIVE',
      isLive: true,
      hasAnalyticsScope: true,
      analyticsVerified: true,
      totalViews: 25000,
      totalSubscribers: 200,
      totalVideos: 15,
      trafficSources: [
        { source: 'Suggested Videos', views: 12000, percentage: '48.0%', change: '' },
        { source: 'YouTube Search', views: 8000, percentage: '32.0%', change: '' },
      ],
      retentionChart: null,
      timeSeries: [
        {
          date: '2026-10-18',
          views: 450,
          estimatedMinutesWatched: 1350,
          averageViewDurationSeconds: 180,
          subscribersGained: 5,
          subscribersLost: 1,
        },
      ],
      scopeLimitationNotice: null,
    });

    render(
      <AppModeProvider>
        <AnalyticsPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Suggested Videos')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('authorize-analytics-banner')).not.toBeInTheDocument();
    expect(screen.getByText('ANALYTICS API VERIFIED')).toBeInTheDocument();
    expect(screen.getByText('12,000')).toBeInTheDocument();
    expect(screen.getByText('48.0%')).toBeInTheDocument();
    expect(screen.getByText('YouTube Search')).toBeInTheDocument();
    expect(screen.getByText('8,000')).toBeInTheDocument();
  });

  it('renders api-disabled-banner and does NOT display verified badge when Analytics API is disabled in Google Cloud', async () => {
    mockGetConnectionStatus.mockResolvedValue({
      connected: true,
      channel: {
        id: 'live_disabled_test',
        channelId: 'UC_DISABLED_TEST',
        title: 'Disabled Scope Channel',
        subscriberCount: 43,
        videoCount: 13,
        viewCount: 11704,
        status: 'connected',
        connectedAt: '2026-10-20T10:00:00Z',
        lastSyncedAt: '2026-10-20T16:00:00Z',
      },
    });

    mockGetChannelAnalytics.mockResolvedValue({
      channelId: 'UC_DISABLED_TEST',
      title: 'Disabled Scope Channel',
      dataState: 'LIVE',
      isLive: true,
      hasAnalyticsScope: true,
      analyticsVerified: false,
      analyticsError: 'SERVICE_DISABLED',
      totalViews: 11704,
      totalSubscribers: 43,
      totalVideos: 13,
      trafficSources: null,
      retentionChart: null,
      timeSeries: null,
      scopeNotice: 'YouTube Analytics API data temporarily unavailable.',
      scopeLimitationNotice: null,
    });

    render(
      <AppModeProvider>
        <AnalyticsPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('api-disabled-banner')).toBeInTheDocument();
    });

    // Badge must NOT be verified
    expect(screen.queryByText('ANALYTICS API VERIFIED')).not.toBeInTheDocument();
    expect(screen.getByText(/Google Cloud Action Required: YouTube Analytics API Disabled/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Enable in Google Cloud/i })).toHaveAttribute(
      'href',
      expect.stringContaining('console.developers.google.com')
    );
    expect(screen.getByText(/Discovery vectors unavailable: API disabled in Google Cloud/i)).toBeInTheDocument();
    expect(screen.getByText(/Daily performance unavailable: API disabled in Google Cloud/i)).toBeInTheDocument();
  });
});
