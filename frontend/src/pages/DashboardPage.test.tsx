import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppModeProvider, useAppMode } from '../context/AppModeContext';
import { DashboardPage } from './DashboardPage';
import * as dashboardService from '../services/dashboardService';
import type { DashboardOverviewResponse } from '../types/dashboard';

vi.mock('../services/dashboardService', () => ({
  getDashboardOverview: vi.fn(),
  default: {
    getDashboardOverview: vi.fn(),
  },
}));

const mockGetDashboardOverview = vi.mocked(dashboardService.getDashboardOverview);

const createMockSuccessResponse = (
  channelId: string,
  overrides?: Partial<DashboardOverviewResponse>
): DashboardOverviewResponse => ({
  data_state: 'LIVE',
  last_synced_at: '2026-10-19T02:00:00Z',
  data: {
    channelId,
    kpis: {
      totalViews: {
        title: 'Total Views',
        value: 50000,
        formattedValue: '50,000',
        change: 5.2,
        formattedChange: '+5.2%',
        trend: 'up',
        changePeriod: 'vs previous 28d',
        sparklinePoints: [10, 20, 30, 40],
      },
      netSubscribers: {
        title: 'Net Subscribers',
        value: 300,
        formattedValue: '+300',
        change: 2.1,
        formattedChange: '+2.1%',
        trend: 'up',
        changePeriod: 'vs previous 28d',
        sparklinePoints: [5, 10, 15, 20],
      },
      watchTimeHours: {
        title: 'Watch Time (hrs)',
        value: 1200,
        formattedValue: '1,200',
        change: -1.5,
        formattedChange: '-1.5%',
        trend: 'down',
        changePeriod: 'vs previous 28d',
        sparklinePoints: [20, 18, 15, 12],
      },
      estimatedPartnerRevenue: null, // explicitly null for testing
    },
    velocityChart: [
      { date: 'Oct 01', views: 5000, watchTime: 120, subscribers: 30 },
      { date: 'Oct 05', views: 7000, watchTime: 150, subscribers: 45 },
    ],
    actionableInsights: [],
    recentVideos: [
      {
        id: 'live-vid-1',
        title: 'Real Live Channel Upload 2026',
        published: '2 hours ago',
        views: 1250,
        formattedViews: '1,250',
        avd: '4:15',
        ctr: '5.5%',
        ctrStatus: 'normal',
      },
    ],
    contentPipeline: [
      {
        id: 'pipe-1',
        title: 'Live Scheduled Video',
        format: 'Long-form',
        stage: 'Editing',
        scheduledDate: 'Oct 25',
      },
    ],
  },
  ...overrides,
});

describe('DashboardPage Reliability Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  // a. LIVE failure renders no synthetic KPI values
  it('a. LIVE failure renders no synthetic KPI values', async () => {
    mockGetDashboardOverview.mockRejectedValue(new Error('Network error'));

    render(
      <MemoryRouter>
        <AppModeProvider initialDataState="LIVE" initialChannelId="uc-live-001">
          <DashboardPage />
        </AppModeProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('error-network')).toBeInTheDocument();
    });

    // Hardcoded demo strings must NOT be rendered
    expect(screen.queryByText('1,428,900')).not.toBeInTheDocument();
    expect(screen.queryByText('+18.4%')).not.toBeInTheDocument();
    expect(screen.queryByText('+4,820')).not.toBeInTheDocument();
    expect(screen.queryByText('$3,842.10')).not.toBeInTheDocument();
  });

  // b. LIVE failure renders no demo chart, videos or pipeline items
  it('b. LIVE failure renders no demo chart, videos or pipeline items', async () => {
    mockGetDashboardOverview.mockRejectedValue(new Error('Connection timed out'));

    render(
      <MemoryRouter>
        <AppModeProvider initialDataState="LIVE" initialChannelId="uc-live-001">
          <DashboardPage />
        </AppModeProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('error-network')).toBeInTheDocument();
    });

    // Must not show demo video title or demo pipeline items
    expect(
      screen.queryByText('Why 90% of AI Agents Fail in Production (System Architecture)')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Building a Multi-Agent YouTube Production Engine')
    ).not.toBeInTheDocument();
  });

  // c. DEMO channel still renders the existing demo data
  it('c. DEMO channel still renders the existing demo data', async () => {
    // When demo channel request succeeds with null data or baseline fallback
    mockGetDashboardOverview.mockResolvedValue({
      data_state: 'DEMO',
      last_synced_at: null,
      data: null,
    });

    render(
      <MemoryRouter>
        <AppModeProvider initialDataState="DEMO" initialChannelId="demo-channel-1">
          <DashboardPage />
        </AppModeProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('1,428,900')).toBeInTheDocument();
    });

    expect(screen.getByText('+18.4%')).toBeInTheDocument();
    expect(
      screen.getByText('Why 90% of AI Agents Fail in Production (System Architecture)')
    ).toBeInTheDocument();
    expect(screen.getByText('Building a Multi-Agent YouTube Production Engine')).toBeInTheDocument();
  });

  // d. 401, 404, network error and UNAVAILABLE each produce a different UI state; STALE shows data with a stale banner
  it('d. 401 produces unauthorized UI state', async () => {
    mockGetDashboardOverview.mockRejectedValue({
      response: {
        status: 401,
        data: { detail: 'Session expired' },
      },
    });

    render(
      <MemoryRouter>
        <AppModeProvider initialDataState="LIVE" initialChannelId="uc-live-001">
          <DashboardPage />
        </AppModeProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('error-unauthorized')).toBeInTheDocument();
    });
    expect(screen.getByText(/Session Expired \/ Authentication Required/i)).toBeInTheDocument();
  });

  it('d. 404 produces not-found UI state with generic message', async () => {
    mockGetDashboardOverview.mockRejectedValue({
      response: {
        status: 404,
        data: { detail: 'Channel not found' },
      },
    });

    render(
      <MemoryRouter>
        <AppModeProvider initialDataState="LIVE" initialChannelId="uc-live-001">
          <DashboardPage />
        </AppModeProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('error-not-found')).toBeInTheDocument();
    });
    expect(screen.getByText('Channel Not Found')).toBeInTheDocument();
  });

  it('d. network error produces network connection error state with Retry', async () => {
    mockGetDashboardOverview.mockRejectedValue(new Error('Network error'));

    render(
      <MemoryRouter>
        <AppModeProvider initialDataState="LIVE" initialChannelId="uc-live-001">
          <DashboardPage />
        </AppModeProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('error-network')).toBeInTheDocument();
    });
    expect(screen.getByText('Network Connection Error')).toBeInTheDocument();
  });

  it('d. UNAVAILABLE produces unavailable state', async () => {
    mockGetDashboardOverview.mockRejectedValue({
      response: {
        status: 503,
        data: { message: 'Service Unavailable' },
      },
    });

    render(
      <MemoryRouter>
        <AppModeProvider initialDataState="UNAVAILABLE" initialChannelId="uc-live-001">
          <DashboardPage />
        </AppModeProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('error-unavailable')).toBeInTheDocument();
    });
    expect(screen.getByText('Creator Telemetry Disconnected')).toBeInTheDocument();
  });

  it('d. STALE shows data with a stale banner and no demo fallback', async () => {
    const liveData = createMockSuccessResponse('uc-live-001', {
      data_state: 'STALE',
    });
    mockGetDashboardOverview.mockResolvedValue(liveData);

    render(
      <MemoryRouter>
        <AppModeProvider initialDataState="STALE" initialChannelId="uc-live-001">
          <DashboardPage />
        </AppModeProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('stale-banner')).toBeInTheDocument();
    });

    // Displays the live channel's data (50,000 views), not demo (1,428,900)
    expect(screen.getByText('50,000')).toBeInTheDocument();
    expect(screen.queryByText('1,428,900')).not.toBeInTheDocument();
  });

  // f. Null revenue does not crash and is not shown as $0
  it('f. Null revenue does not crash and is not shown as $0', async () => {
    const liveData = createMockSuccessResponse('uc-live-001');
    mockGetDashboardOverview.mockResolvedValue(liveData);

    render(
      <MemoryRouter>
        <AppModeProvider initialDataState="LIVE" initialChannelId="uc-live-001">
          <DashboardPage />
        </AppModeProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Est. Partner Revenue')).toBeInTheDocument();
    });

    expect(screen.getByText('Not available')).toBeInTheDocument();
    expect(screen.queryByText('$0')).not.toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
  });

  // g. Retry keeps the selected channel id and does not switch to DEMO
  it('g. Retry keeps the selected channel id and does not switch to DEMO', async () => {
    mockGetDashboardOverview.mockRejectedValueOnce(new Error('First attempt failed'));

    render(
      <MemoryRouter>
        <AppModeProvider initialDataState="LIVE" initialChannelId="uc-live-001">
          <DashboardPage />
        </AppModeProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('error-network')).toBeInTheDocument();
    });

    // Prepare mock for retry
    const liveData = createMockSuccessResponse('uc-live-001');
    mockGetDashboardOverview.mockResolvedValueOnce(liveData);

    const retryButton = screen.getByRole('button', { name: /Retry Connection/i });
    act(() => {
      retryButton.click();
    });

    await waitFor(() => {
      expect(mockGetDashboardOverview).toHaveBeenCalledTimes(2);
    });

    // Verified: retry called with SAME selectedChannelId uc-live-001 and days=28
    expect(mockGetDashboardOverview).toHaveBeenLastCalledWith('uc-live-001', 28, expect.any(AbortSignal));

    await waitFor(() => {
      expect(screen.getByText('50,000')).toBeInTheDocument();
    });
  });

  // h. A late response from a previous channel does not overwrite the current channel
  it('h. A late response from a previous channel does not overwrite the current channel', async () => {
    let resolveFirst: ((res: DashboardOverviewResponse) => void) | null = null;
    mockGetDashboardOverview.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );

    const secondChannelData = createMockSuccessResponse('uc-live-002', {
      data: {
        ...createMockSuccessResponse('uc-live-002').data!,
        kpis: {
          ...createMockSuccessResponse('uc-live-002').data!.kpis,
          totalViews: {
            title: 'Total Views',
            value: 99999,
            formattedValue: '99,999',
            change: 1.0,
            formattedChange: '+1.0%',
            trend: 'up',
            changePeriod: 'vs previous 28d',
            sparklinePoints: [1, 2],
          },
        },
      },
    });

    const ChannelSwitcherTestHarness: React.FC = () => {
      const { setSelectedChannelId } = useAppMode();
      return (
        <div>
          <button onClick={() => setSelectedChannelId('uc-live-002')}>
            Switch to Channel 2
          </button>
          <DashboardPage />
        </div>
      );
    };

    render(
      <MemoryRouter>
        <AppModeProvider initialDataState="LIVE" initialChannelId="uc-live-001">
          <ChannelSwitcherTestHarness />
        </AppModeProvider>
      </MemoryRouter>
    );

    // Mock response for the second channel
    mockGetDashboardOverview.mockResolvedValueOnce(secondChannelData);

    // Switch channel to uc-live-002
    const switchButton = screen.getByText('Switch to Channel 2');
    act(() => {
      switchButton.click();
    });

    await waitFor(() => {
      expect(screen.getByText('99,999')).toBeInTheDocument();
    });

    // Now the late response for uc-live-001 resolves
    if (resolveFirst) {
      act(() => {
        (resolveFirst as (res: DashboardOverviewResponse) => void)(
          createMockSuccessResponse('uc-live-001', {
            data: {
              ...createMockSuccessResponse('uc-live-001').data!,
              kpis: {
                ...createMockSuccessResponse('uc-live-001').data!.kpis,
                totalViews: {
                  title: 'Total Views',
                  value: 11111,
                  formattedValue: '11,111',
                  change: 1.0,
                  formattedChange: '+1.0%',
                  trend: 'up',
                  changePeriod: 'vs previous 28d',
                  sparklinePoints: [1, 2],
                },
              },
            },
          })
        );
      });
    }

    // The late response must NOT overwrite uc-live-002
    expect(screen.getByText('99,999')).toBeInTheDocument();
    expect(screen.queryByText('11,111')).not.toBeInTheDocument();
  });

  // i. Phase 2: Live Recent Video Performance & Velocity Chart telemetry states
  it('i. Renders live recent videos and single-snapshot baseline telemetry message', async () => {
    const singleSnapshotData = createMockSuccessResponse('uc-live-001', {
      data: {
        ...createMockSuccessResponse('uc-live-001').data!,
        velocityChart: [
          { date: 'Oct 20', views: 11704, watchTime: 0, subscribers: 43 },
        ],
        recentVideos: [
          {
            id: 'real-vid-abc',
            title: 'Are bananas radioactive?? #shorts',
            published: '3 days ago',
            views: 4500,
            formattedViews: '4,500',
            avd: '—',
            ctr: 'N/A',
            ctrStatus: 'normal',
          },
        ],
      },
    });

    mockGetDashboardOverview.mockResolvedValue(singleSnapshotData);

    render(
      <MemoryRouter>
        <AppModeProvider initialDataState="LIVE" initialChannelId="uc-live-001">
          <DashboardPage />
        </AppModeProvider>
      </MemoryRouter>
    );

    // Verify recent video is rendered
    await waitFor(() => {
      expect(screen.getByText('Are bananas radioactive?? #shorts')).toBeInTheDocument();
    });
    expect(screen.getByText('4,500')).toBeInTheDocument();
    expect(screen.getByText('3 days ago')).toBeInTheDocument();

    // Verify single-snapshot velocity chart explanation is displayed
    expect(
      screen.getByText(/baseline telemetry snapshot recorded/i)
    ).toBeInTheDocument();

    // Verify clear Insufficient History card is rendered
    expect(screen.getByTestId('insufficient-history-state')).toBeInTheDocument();
    expect(
      screen.getByText('Insufficient History for Growth Trajectory')
    ).toBeInTheDocument();
    expect(screen.getByTestId('sync-now-insufficient-history')).toBeInTheDocument();
  });
});
