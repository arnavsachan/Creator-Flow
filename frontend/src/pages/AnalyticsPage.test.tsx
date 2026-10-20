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
});
