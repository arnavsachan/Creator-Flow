import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AppModeProvider } from '../context/AppModeContext';
import { AudiencePage } from './AudiencePage';
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
const mockGetChannelAudience = vi.mocked(youtubeService.getChannelAudience);

describe('AudiencePage Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders demo audience demographics in DEMO mode', async () => {
    mockGetConnectionStatus.mockResolvedValue({
      connected: false,
      channel: null,
    });

    mockGetChannelAudience.mockResolvedValue({
      channelId: 'demo-channel-1',
      title: 'Tech Pulse',
      dataState: 'DEMO',
      isLive: false,
      subscribers: 14200,
      totalViews: 894000,
      uploads: 124,
      returningViewersRate: '42.8%',
      subscriberConversionRate: '3.2%',
      optimalReleaseWindow: '18:00 - 21:00 UTC',
      topCountries: [
        { country: 'United States', share: '38.4%', viewers: '343.3K' },
      ],
      scopeLimitationNotice: null,
    });

    render(
      <AppModeProvider>
        <AudiencePage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('DEMO / SAMPLE DATA')).toBeInTheDocument();
    });

    expect(screen.getByText('14,200')).toBeInTheDocument();
    expect(screen.getByText('894,000')).toBeInTheDocument();
    expect(screen.getByText('124')).toBeInTheDocument();
    expect(screen.getByText('42.8%')).toBeInTheDocument();
  });

  it('fetches and renders live channel audience metrics and transparent scope disclosure', async () => {
    mockGetConnectionStatus.mockResolvedValue({
      connected: true,
      channel: {
        id: 'live_123',
        channelId: 'UC_LIVE_AUDIENCE_XYZ',
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

    mockGetChannelAudience.mockImplementation(async (channelId) => {
      if (channelId === 'UC_LIVE_AUDIENCE_XYZ') {
        return {
          channelId: 'UC_LIVE_AUDIENCE_XYZ',
          title: 'Chillespada Live',
          dataState: 'LIVE',
          isLive: true,
          subscribers: 43,
          totalViews: 11704,
          uploads: 13,
          returningViewersRate: 'Unavailable',
          returningViewersState: 'UNSUPPORTED_METRIC',
          returningViewersNotice: 'Not exposed by public YouTube Analytics API (Studio-only)',
          subscriberConversionRate: null,
          subscriberConversionState: 'NO_DATA',
          subscriberConversionNotice: '0 views in 28d lookback window (conversion rate requires views)',
          optimalReleaseWindow: 'Insufficient Data',
          optimalReleaseWindowState: 'INSUFFICIENT_HISTORY',
          optimalReleaseWindowNotice: 'Application heuristic: requires ≥20 public uploads across weekdays to estimate timing (channel has 13)',
          topCountries: null,
          scopeLimitationNotice: 'Viewer demographic breakdown (age, gender, country) requires YouTube Analytics Partner API permissions.',
        };
      }
      return {
        channelId: 'demo-channel-1',
        title: 'Tech Pulse',
        dataState: 'DEMO',
        isLive: false,
        subscribers: 14200,
        totalViews: 894000,
        uploads: 124,
        returningViewersRate: '42.8%',
        subscriberConversionRate: '3.2%',
        optimalReleaseWindow: '18:00 - 21:00 UTC',
        topCountries: null,
        scopeLimitationNotice: null,
      };
    });

    render(
      <AppModeProvider initialChannelId="UC_LIVE_AUDIENCE_XYZ" initialDataState="LIVE">
        <AudiencePage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('11,704')).toBeInTheDocument(); // total views
    });

    expect(screen.getByText('43')).toBeInTheDocument(); // subscribers
    expect(screen.getByText('13')).toBeInTheDocument(); // public uploads
    expect(screen.getByText('LIVE TELEMETRY')).toBeInTheDocument();
    expect(
      screen.getByText(/Audience Cohort Breakdown & Geography Limitation/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument(); // Returning Viewers
    expect(screen.getByText(/Not exposed by public YouTube Analytics API/i)).toBeInTheDocument();
    expect(screen.getByText('No Data')).toBeInTheDocument(); // Subscriber Conversion (never 0.00% when views=0)
    expect(screen.queryByText('0.00%')).not.toBeInTheDocument();
    expect(screen.getByText(/0 views in 28d lookback window/i)).toBeInTheDocument();
    expect(screen.getByText('Insufficient Data')).toBeInTheDocument(); // Optimal Release Window
    expect(screen.getByText(/Application heuristic: requires ≥20 public uploads/i)).toBeInTheDocument();
  });

  it('renders ErrorState with retry when audience fetch fails', async () => {
    mockGetConnectionStatus.mockResolvedValue({ connected: false, channel: null });
    mockGetChannelAudience.mockRejectedValue(new Error('Network error loading audience'));

    render(
      <AppModeProvider>
        <AudiencePage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('audience-error')).toBeInTheDocument();
    });
    expect(screen.getByText('Audience Demographics Unavailable')).toBeInTheDocument();
    expect(screen.getByText(/Network error loading audience/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry Connection/i })).toBeInTheDocument();
  });

  it('renders authorization banner and triggers OAuth when button is clicked', async () => {
    mockGetConnectionStatus.mockResolvedValue({
      connected: true,
      channel: {
        id: 'live_aud_auth',
        channelId: 'UC_AUD_AUTH',
        title: 'Audience Auth Channel',
        subscriberCount: 80,
        videoCount: 12,
        viewCount: 3000,
        status: 'connected',
        connectedAt: '2026-10-20T10:00:00Z',
        lastSyncedAt: '2026-10-20T16:00:00Z',
      },
    });

    mockGetChannelAudience.mockResolvedValue({
      channelId: 'UC_AUD_AUTH',
      title: 'Audience Auth Channel',
      dataState: 'LIVE',
      isLive: true,
      hasAnalyticsScope: false,
      subscribers: 80,
      totalViews: 3000,
      uploads: 12,
      returningViewersRate: null,
      subscriberConversionRate: null,
      optimalReleaseWindow: null,
      topCountries: null,
      authorizationUrl: null,
      scopeLimitationNotice: null,
    });

    const mockStartOAuth = vi.mocked(youtubeService.startOAuth);
    mockStartOAuth.mockResolvedValue({
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?scope=yt-analytics.readonly',
      state: 'test-state-aud',
    });

    render(
      <AppModeProvider>
        <AudiencePage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('authorize-audience-banner')).toBeInTheDocument();
    });

    expect(screen.getByText(/Unlock Geographic & Demographic Telemetry/i)).toBeInTheDocument();
    const authBtn = screen.getByTestId('authorize-audience-button');
    expect(authBtn).toBeInTheDocument();

    authBtn.click();
    expect(mockStartOAuth).toHaveBeenCalledWith({ includeAnalytics: true });
  });

  it('renders live country breakdown when analytics permission is granted', async () => {
    mockGetConnectionStatus.mockResolvedValue({
      connected: true,
      channel: {
        id: 'live_geo_granted',
        channelId: 'UC_GEO_GRANTED',
        title: 'Geo Granted Channel',
        subscriberCount: 350,
        videoCount: 20,
        viewCount: 40000,
        status: 'connected',
        connectedAt: '2026-10-20T10:00:00Z',
        lastSyncedAt: '2026-10-20T16:00:00Z',
      },
    });

    mockGetChannelAudience.mockResolvedValue({
      channelId: 'UC_GEO_GRANTED',
      title: 'Geo Granted Channel',
      dataState: 'LIVE',
      isLive: true,
      hasAnalyticsScope: true,
      analyticsVerified: true,
      subscribers: 350,
      totalViews: 40000,
      uploads: 20,
      returningViewersRate: null,
      subscriberConversionRate: null,
      optimalReleaseWindow: null,
      topCountries: [
        { country: 'United States', share: '52.0%', viewers: '20,800' },
        { country: 'India', share: '24.0%', viewers: '9,600' },
      ],
      authorizationUrl: null,
      scopeLimitationNotice: null,
    });

    render(
      <AppModeProvider>
        <AudiencePage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('United States')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('authorize-audience-banner')).not.toBeInTheDocument();
    expect(screen.getByText('ANALYTICS API VERIFIED')).toBeInTheDocument();
    expect(screen.getByText('52.0%')).toBeInTheDocument();
    expect(screen.getByText(/20,800/i)).toBeInTheDocument();
    expect(screen.getByText('India')).toBeInTheDocument();
    expect(screen.getByText('24.0%')).toBeInTheDocument();
    expect(screen.getByText(/9,600/i)).toBeInTheDocument();
  });

  it('renders api-disabled-audience-banner and does NOT display verified badge when Analytics API is disabled in Google Cloud', async () => {
    mockGetConnectionStatus.mockResolvedValue({
      connected: true,
      channel: {
        id: 'live_geo_disabled',
        channelId: 'UC_GEO_DISABLED',
        title: 'Disabled Scope Channel',
        subscriberCount: 43,
        videoCount: 13,
        viewCount: 11704,
        status: 'connected',
        connectedAt: '2026-10-20T10:00:00Z',
        lastSyncedAt: '2026-10-20T16:00:00Z',
      },
    });

    mockGetChannelAudience.mockResolvedValue({
      channelId: 'UC_GEO_DISABLED',
      title: 'Disabled Scope Channel',
      dataState: 'LIVE',
      isLive: true,
      hasAnalyticsScope: true,
      analyticsVerified: false,
      analyticsError: 'SERVICE_DISABLED',
      subscribers: 43,
      totalViews: 11704,
      uploads: 13,
      returningViewersRate: null,
      subscriberConversionRate: null,
      optimalReleaseWindow: null,
      topCountries: null,
      authorizationUrl: null,
      scopeNotice: 'YouTube Analytics API data temporarily unavailable.',
      scopeLimitationNotice: null,
    });

    render(
      <AppModeProvider>
        <AudiencePage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('api-disabled-audience-banner')).toBeInTheDocument();
    });

    // Badge must NOT be verified
    expect(screen.queryByText('ANALYTICS API VERIFIED')).not.toBeInTheDocument();
    expect(screen.getByText(/Google Cloud Action Required: YouTube Analytics API Disabled/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Enable in Google Cloud/i })).toHaveAttribute(
      'href',
      expect.stringContaining('console.developers.google.com')
    );
    expect(screen.getByText(/Viewer territory breakdown unavailable: API disabled in Google Cloud/i)).toBeInTheDocument();
  });

  it('renders live calculated subscriber conversion rate and optimal release window when data is available', async () => {
    mockGetConnectionStatus.mockResolvedValue({
      connected: true,
      channel: {
        id: 'live_calc_test',
        channelId: 'UC_CALC_TEST',
        title: 'Calc Channel',
        subscriberCount: 500,
        videoCount: 25,
        viewCount: 50000,
        status: 'connected',
        connectedAt: '2026-10-20T10:00:00Z',
        lastSyncedAt: '2026-10-20T16:00:00Z',
      },
    });

    mockGetChannelAudience.mockResolvedValue({
      channelId: 'UC_CALC_TEST',
      title: 'Calc Channel',
      dataState: 'LIVE',
      isLive: true,
      hasAnalyticsScope: true,
      analyticsVerified: true,
      subscribers: 500,
      totalViews: 50000,
      uploads: 25,
      returningViewersRate: 'Unavailable',
      returningViewersState: 'UNSUPPORTED_METRIC',
      returningViewersNotice: 'YouTube Studio-exclusive metric; not exposed by YouTube Analytics API',
      subscriberConversionRate: '0.45%',
      subscriberConversionState: 'LIVE',
      subscriberConversionNotice: '+45 subs gained across 10,000 views (28d window)',
      optimalReleaseWindow: 'Fridays & Sundays',
      optimalReleaseWindowState: 'LIVE',
      optimalReleaseWindowNotice: 'Application heuristic: Fridays & Sundays had highest avg views across 25 uploads (experimental estimate, not an official YouTube metric)',
      topCountries: [
        { country: 'United States', share: '60.0%', viewers: '30,000' },
      ],
      authorizationUrl: null,
      scopeNotice: null,
      scopeLimitationNotice: null,
    });

    render(
      <AppModeProvider>
        <AudiencePage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('0.45%')).toBeInTheDocument();
    });

    expect(screen.getByText('+45 subs gained across 10,000 views (28d window)')).toBeInTheDocument();
    expect(screen.getByText('Fridays & Sundays')).toBeInTheDocument();
    expect(screen.getByText(/Application heuristic: Fridays & Sundays had highest avg views/i)).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByText(/YouTube Studio-exclusive metric; not exposed by YouTube Analytics API/i)).toBeInTheDocument();
  });

  it('renders No Data when conversion state is NO_DATA with null rate', async () => {
    mockGetConnectionStatus.mockResolvedValue({
      connected: true,
      channel: {
        id: 'live_nodata_test',
        channelId: 'UC_NODATA_TEST',
        title: 'Zero Views Channel',
        subscriberCount: 10,
        videoCount: 5,
        viewCount: 0,
        status: 'connected',
        connectedAt: '2026-10-20T10:00:00Z',
        lastSyncedAt: '2026-10-20T16:00:00Z',
      },
    });

    mockGetChannelAudience.mockResolvedValue({
      channelId: 'UC_NODATA_TEST',
      title: 'Zero Views Channel',
      dataState: 'LIVE',
      isLive: true,
      hasAnalyticsScope: true,
      analyticsVerified: true,
      subscribers: 10,
      totalViews: 0,
      uploads: 5,
      returningViewersRate: null,
      returningViewersState: 'UNSUPPORTED_METRIC',
      returningViewersNotice: 'YouTube Studio-exclusive metric; not exposed by YouTube Analytics API',
      subscriberConversionRate: null,
      subscriberConversionState: 'NO_DATA',
      subscriberConversionNotice: '0 views in 28d lookback window (conversion rate requires views)',
      optimalReleaseWindow: 'Insufficient Data',
      optimalReleaseWindowState: 'INSUFFICIENT_HISTORY',
      optimalReleaseWindowNotice: 'Application heuristic: requires ≥20 public uploads to estimate timing (channel has 5)',
      topCountries: [],
      authorizationUrl: null,
      scopeNotice: null,
      scopeLimitationNotice: null,
    });

    render(
      <AppModeProvider>
        <AudiencePage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('No Data')).toBeInTheDocument();
    });

    // Subscriber conversion card must show 'No Data', NEVER '0.00%'
    expect(screen.getByText('No Data')).toBeInTheDocument();
    expect(screen.queryByText('0.00%')).not.toBeInTheDocument();
    expect(screen.getByText('0 views in 28d lookback window (conversion rate requires views)')).toBeInTheDocument();

    // Returning viewers must show 'Unavailable'
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByText('YouTube Studio-exclusive metric; not exposed by YouTube Analytics API')).toBeInTheDocument();
  });
});
