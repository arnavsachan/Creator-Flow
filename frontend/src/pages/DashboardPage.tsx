import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertCircle,
  ArrowRight,
  Clock,
  DollarSign,
  Eye,
  FileText,
  Flame,
  Image,
  MoreVertical,
  RefreshCw,
  Scissors,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useAppMode } from '../context/AppModeContext';
import { KpiCard } from '../components/ui/KpiCard';
import { ErrorState } from '../components/states/ErrorState';
import { getDashboardOverview } from '../services/dashboardService';
import { normalizeApiError, type NormalizedApiError } from '../services/apiClient';
import { dashboardSync } from '../services/dashboardSync';
import { isDemoChannel } from '../utils/channelMode';
import type { DashboardOverviewData, RecentVideoItem } from '../types/dashboard';
import { cn } from '../utils/cn';

// Baseline fallback data for DEMO channels only
const DEFAULT_CHART_DATA = [
  { date: 'Oct 01', views: 34200, watchTime: 1820, subscribers: 120 },
  { date: 'Oct 04', views: 42100, watchTime: 2190, subscribers: 195 },
  { date: 'Oct 07', views: 38900, watchTime: 1980, subscribers: 160 },
  { date: 'Oct 10', views: 56400, watchTime: 3120, subscribers: 310 },
  { date: 'Oct 13', views: 68900, watchTime: 3840, subscribers: 420 },
  { date: 'Oct 16', views: 61200, watchTime: 3410, subscribers: 380 },
  { date: 'Oct 19', views: 78500, watchTime: 4620, subscribers: 560 },
  { date: 'Oct 22', views: 92400, watchTime: 5410, subscribers: 690 },
  { date: 'Oct 25', views: 88100, watchTime: 5120, subscribers: 610 },
  { date: 'Oct 28', views: 104200, watchTime: 6240, subscribers: 780 },
];

const DEFAULT_RECENT_VIDEOS: RecentVideoItem[] = [
  {
    id: 'vid-1',
    title: 'Why 90% of AI Agents Fail in Production (System Architecture)',
    published: '3 days ago',
    views: 142850,
    formattedViews: '142,850',
    avd: '8:42 (62%)',
    ctr: '8.4%',
    ctrStatus: 'high' as const,
  },
  {
    id: 'vid-2',
    title: 'We Built an Autonomous YouTube Studio in 48 Hours',
    published: '1 week ago',
    views: 98420,
    formattedViews: '98,420',
    avd: '7:15 (54%)',
    ctr: '6.9%',
    ctrStatus: 'high' as const,
  },
  {
    id: 'vid-3',
    title: 'Stop Using Basic Prompting: Vector Graph Search Explained',
    published: '2 weeks ago',
    views: 76190,
    formattedViews: '76,190',
    avd: '5:30 (41%)',
    ctr: '4.8%',
    ctrStatus: 'normal' as const,
  },
  {
    id: 'vid-4',
    title: 'Python vs Rust for Real-time Video Ingestion Pipelines',
    published: '3 weeks ago',
    views: 64300,
    formattedViews: '64,300',
    avd: '6:50 (49%)',
    ctr: '5.2%',
    ctrStatus: 'normal' as const,
  },
  {
    id: 'vid-5',
    title: 'The Clean Monorepo Architecture Blueprint for 2026',
    published: '1 month ago',
    views: 112040,
    formattedViews: '112,040',
    avd: '9:12 (68%)',
    ctr: '7.8%',
    ctrStatus: 'high' as const,
  },
];

const DEFAULT_PIPELINE_ITEMS = [
  {
    title: 'Building a Multi-Agent YouTube Production Engine',
    format: 'Long-form' as const,
    stage: 'Scripting' as const,
    scheduledDate: 'Tomorrow, 14:00',
  },
  {
    title: '3 Mistakes Ruining Your Video Retention Hook',
    format: 'Short' as const,
    stage: 'Ready' as const,
    scheduledDate: 'Oct 20, 18:30',
  },
  {
    title: 'Creator Economy Monetization Math Breakdown',
    format: 'Long-form' as const,
    stage: 'Editing' as const,
    scheduledDate: 'Oct 22, 16:00',
  },
  {
    title: 'FastAPI vs Node for YouTube Data Webhooks',
    format: 'Long-form' as const,
    stage: 'Idea' as const,
    scheduledDate: 'Oct 26',
  },
];

export const DashboardPage: React.FC = () => {
  const { dataState, setDataState, selectedChannelId, dateRange, setDateRange, syncTelemetry, connectedChannel } = useAppMode();
  const navigate = useNavigate();
  const [metricTab, setMetricTab] = useState<'views' | 'watchTime' | 'subscribers'>('views');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const [overviewData, setOverviewData] = useState<DashboardOverviewData | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [apiError, setApiError] = useState<NormalizedApiError | null>(null);

  const isDemo = isDemoChannel(selectedChannelId);
  const activeChannelIdRef = useRef<string>(selectedChannelId);
  const retryControllerRef = useRef<AbortController | null>(null);
  const days = parseInt(dateRange, 10) || 28;

  useEffect(() => {
    activeChannelIdRef.current = selectedChannelId;
  }, [selectedChannelId]);

  // Clean up any in-flight retry when component unmounts
  useEffect(() => {
    return () => {
      if (retryControllerRef.current) {
        retryControllerRef.current.abort();
      }
    };
  }, []);

  const fetchOverview = useCallback(
    (targetChannel: string, lookbackDays: number) => {
      if (retryControllerRef.current) {
        retryControllerRef.current.abort();
      }
      const controller = new AbortController();
      retryControllerRef.current = controller;

      setLoading(true);
      setApiError(null);
      dashboardSync.setIsSyncing(true);

      const req = getDashboardOverview(targetChannel, lookbackDays, controller.signal);
      if (!req || typeof req.then !== 'function') {
        setLoading(false);
        dashboardSync.setIsSyncing(false);
        return Promise.resolve();
      }

      return req
        .then((res) => {
          if (controller.signal.aborted || activeChannelIdRef.current !== targetChannel) {
            return;
          }
          setOverviewData(res.data);
          setLastSyncedAt(res.last_synced_at ?? null);
          dashboardSync.setLastSyncedAt(res.last_synced_at ?? null);
          if (res.data_state) {
            setDataState(res.data_state);
          }
        })
        .catch((err: unknown) => {
          if (
            controller.signal.aborted ||
            axios.isCancel(err) ||
            activeChannelIdRef.current !== targetChannel
          ) {
            return;
          }
          const normalized = normalizeApiError(err);
          console.warn('[DashboardPage] Overview request failed:', normalized);
          setApiError(normalized);
          if (normalized.kind === 'unavailable') {
            setDataState('UNAVAILABLE');
          }
        })
        .finally(() => {
          if (retryControllerRef.current === controller) {
            setLoading(false);
            dashboardSync.setIsSyncing(false);
          }
        });
    },
    [setDataState]
  );

  useEffect(() => {
    fetchOverview(selectedChannelId, days);
  }, [fetchOverview, selectedChannelId, days]);

  const handleManualRetry = useCallback(() => {
    fetchOverview(activeChannelIdRef.current, days);
  }, [fetchOverview, days]);

  const handleSyncNow = useCallback(async () => {
    if (loading) return;
    if (!isDemo && connectedChannel) {
      setLoading(true);
      dashboardSync.setIsSyncing(true);
      setApiError(null);
      try {
        await syncTelemetry();
        await fetchOverview(activeChannelIdRef.current, days);
      } catch (err) {
        const normalized = normalizeApiError(err);
        console.warn('[DashboardPage] Sync telemetry failed:', normalized);
        setApiError(normalized);
        if (normalized.kind === 'unavailable') {
          setDataState('UNAVAILABLE');
        }
        setLoading(false);
        dashboardSync.setIsSyncing(false);
      }
    } else {
      fetchOverview(activeChannelIdRef.current, days);
    }
  }, [loading, isDemo, connectedChannel, syncTelemetry, fetchOverview, days, setDataState]);

  // Listen to manual sync triggers from Topbar/DataStateBanner/ChannelsPage
  useEffect(() => {
    const unsubscribe = dashboardSync.subscribeSyncTrigger(() => {
      fetchOverview(activeChannelIdRef.current, days);
    });
    return unsubscribe;
  }, [fetchOverview, days]);

  // Prevent displaying stale metrics after channel switches
  const channelData = overviewData?.channelId === selectedChannelId ? overviewData : null;

  // Active chart configurations
  const metricConfigs = {
    views: {
      label: 'Views',
      dataKey: 'views',
      formatter: (v: number) => `${(v / 1000).toFixed(1)}k`,
      fullFormatter: (v: number) => `${v.toLocaleString()} views`,
      stroke: '#6366F1',
    },
    watchTime: {
      label: 'Watch Time (hrs)',
      dataKey: 'watchTime',
      formatter: (v: number) => `${v}h`,
      fullFormatter: (v: number) => `${v.toLocaleString()} hours`,
      stroke: '#38BDF8',
    },
    subscribers: {
      label: 'Net Subscribers',
      dataKey: 'subscribers',
      formatter: (v: number) => `+${v}`,
      fullFormatter: (v: number) => `+${v.toLocaleString()} subs`,
      stroke: '#34D399',
    },
  };

  const currentMetric = metricConfigs[metricTab];

  // DISTINCT STATE HANDLING FOR LIVE CHANNELS
  if (!isDemo) {
    // State 1: 401 Unauthorized / Session Expired
    if (apiError && (apiError.kind === 'unauthorized' || apiError.status === 401)) {
      return (
        <div className="max-w-4xl mx-auto py-16" data-testid="error-unauthorized">
          <ErrorState
            title="Session Expired / Authentication Required"
            message={apiError.message || 'Your session has expired or authentication is invalid. Please sign in again.'}
            onRetry={handleManualRetry}
          />
        </div>
      );
    }

    // State 2: 404 Channel Not Found (generic message as backend 404 semantics are unconfirmed)
    if (apiError && (apiError.kind === 'not_found' || apiError.status === 404)) {
      return (
        <div className="max-w-4xl mx-auto py-16" data-testid="error-not-found">
          <ErrorState
            title="Channel Not Found"
            message={apiError.message || 'The requested channel could not be found. Please select a valid channel.'}
            onRetry={handleManualRetry}
          />
        </div>
      );
    }

    // State 3: Network Error / Timeout (when no prior data exists)
    if (apiError && apiError.kind === 'network' && !channelData) {
      return (
        <div className="max-w-4xl mx-auto py-16" data-testid="error-network">
          <ErrorState
            title="Network Connection Error"
            message={apiError.message || 'Failed to reach creator telemetry service. Please check your network connection.'}
            onRetry={handleManualRetry}
          />
        </div>
      );
    }

    // State 4: UNAVAILABLE without existing channel data
    if ((dataState === 'UNAVAILABLE' || apiError?.kind === 'unavailable') && !channelData) {
      return (
        <div className="max-w-4xl mx-auto py-16" data-testid="error-unavailable">
          <ErrorState
            title="Creator Telemetry Disconnected"
            message="Unable to reach the YouTube Data Ingestion Pipeline. Ensure backend worker services are online."
            onRetry={handleManualRetry}
          />
        </div>
      );
    }

    // State 5: Generic failure without data
    if (apiError && !channelData) {
      return (
        <div className="max-w-4xl mx-auto py-16" data-testid="error-generic">
          <ErrorState
            title="Telemetry Stream Error"
            message={apiError.message || 'An unexpected error occurred while loading channel telemetry.'}
            onRetry={handleManualRetry}
          />
        </div>
      );
    }

    // State 6: Empty valid response (data is null or empty)
    if (!loading && !apiError && !channelData) {
      return (
        <div className="max-w-xl mx-auto py-16 text-center space-y-3" data-testid="empty-state">
          <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700/60 flex items-center justify-center mx-auto text-zinc-400">
            <AlertCircle className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-200">No Telemetry Recorded</h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            No analytics telemetry has been recorded yet for this channel.
          </p>
          <button
            onClick={handleManualRetry}
            disabled={loading}
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700/80 transition-colors cursor-pointer"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            <span>Refresh Metrics</span>
          </button>
        </div>
      );
    }
  } else {
    // For DEMO channel, if UNAVAILABLE:
    if (dataState === 'UNAVAILABLE' && !channelData) {
      return (
        <div className="max-w-4xl mx-auto py-16">
          <ErrorState
            title="Creator Telemetry Disconnected"
            message="Unable to reach the YouTube Data Ingestion Pipeline. Ensure backend worker services are online."
            onRetry={handleManualRetry}
          />
        </div>
      );
    }
  }

  // KPI calculations:
  // LIVE channel: NEVER render DEFAULT_CHART_DATA, DEFAULT_RECENT_VIDEOS, DEFAULT_PIPELINE_ITEMS
  // or hardcoded KPI strings like '1,428,900', '+18.4%'.
  // DEMO channel: render existing demo fallbacks.
  const kpis = channelData?.kpis;

  const totalViewsValue = isDemo
    ? (kpis?.totalViews.formattedValue ?? '1,428,900')
    : (kpis?.totalViews ? kpis.totalViews.formattedValue : '—');
  const totalViewsChange = isDemo
    ? (kpis?.totalViews.formattedChange ?? '+18.4%')
    : kpis?.totalViews?.formattedChange;
  const totalViewsTrend = isDemo
    ? (kpis?.totalViews.trend ?? 'up')
    : (kpis?.totalViews?.trend ?? 'neutral');
  const totalViewsPeriod = isDemo
    ? (kpis?.totalViews.changePeriod ?? 'vs previous 28d')
    : (kpis?.totalViews?.changePeriod ?? 'vs previous 28d');
  const totalViewsSparkline = isDemo
    ? (kpis?.totalViews.sparklinePoints ?? [28, 32, 30, 42, 45, 50, 48, 62, 70, 68, 82])
    : (kpis?.totalViews?.sparklinePoints ?? []);

  const netSubscribersValue = isDemo
    ? (kpis?.netSubscribers.formattedValue ?? '+4,820')
    : (kpis?.netSubscribers ? kpis.netSubscribers.formattedValue : '—');
  const netSubscribersChange = isDemo
    ? (kpis?.netSubscribers.formattedChange ?? '+12.6%')
    : kpis?.netSubscribers?.formattedChange;
  const netSubscribersTrend = isDemo
    ? (kpis?.netSubscribers.trend ?? 'up')
    : (kpis?.netSubscribers?.trend ?? 'neutral');
  const netSubscribersPeriod = isDemo
    ? (kpis?.netSubscribers.changePeriod ?? 'vs previous 28d')
    : (kpis?.netSubscribers?.changePeriod ?? 'vs previous 28d');
  const netSubscribersSparkline = isDemo
    ? (kpis?.netSubscribers.sparklinePoints ?? [10, 14, 12, 19, 22, 25, 29, 31, 38, 42, 48])
    : (kpis?.netSubscribers?.sparklinePoints ?? []);

  const watchTimeValue = isDemo
    ? (kpis?.watchTimeHours.formattedValue ?? '48,250')
    : (kpis?.watchTimeHours ? kpis.watchTimeHours.formattedValue : '—');
  const watchTimeChange = isDemo
    ? (kpis?.watchTimeHours.formattedChange ?? '+24.1%')
    : kpis?.watchTimeHours?.formattedChange;
  const watchTimeTrend = isDemo
    ? (kpis?.watchTimeHours.trend ?? 'up')
    : (kpis?.watchTimeHours?.trend ?? 'neutral');
  const watchTimePeriod = isDemo
    ? (kpis?.watchTimeHours.changePeriod ?? 'vs previous 28d')
    : (kpis?.watchTimeHours?.changePeriod ?? 'vs previous 28d');
  const watchTimeSparkline = isDemo
    ? (kpis?.watchTimeHours.sparklinePoints ?? [35, 38, 42, 40, 52, 58, 62, 60, 72, 79, 85])
    : (kpis?.watchTimeHours?.sparklinePoints ?? []);

  // Revenue: if estimatedPartnerRevenue is null/undefined, render "Not available".
  // Never render $0 or a default number for missing revenue.
  const revenueValue = kpis?.estimatedPartnerRevenue
    ? kpis.estimatedPartnerRevenue.formattedValue
    : isDemo
    ? '$3,842.10'
    : 'Not available';
  const revenueChange = kpis?.estimatedPartnerRevenue
    ? kpis.estimatedPartnerRevenue.formattedChange
    : isDemo
    ? '-2.1%'
    : undefined;
  const revenueTrend = kpis?.estimatedPartnerRevenue
    ? kpis.estimatedPartnerRevenue.trend
    : isDemo
    ? 'down'
    : 'neutral';
  const revenuePeriod = kpis?.estimatedPartnerRevenue
    ? kpis.estimatedPartnerRevenue.changePeriod
    : isDemo
    ? 'RPM $3.42'
    : undefined;
  const revenueSparkline = kpis?.estimatedPartnerRevenue
    ? kpis.estimatedPartnerRevenue.sparklinePoints
    : isDemo
    ? [45, 48, 50, 47, 44, 46, 42, 40, 43, 41, 39]
    : [];

  const chartData = channelData?.velocityChart ?? (isDemo ? DEFAULT_CHART_DATA : []);
  const recentVideos = channelData?.recentVideos ?? (isDemo ? DEFAULT_RECENT_VIDEOS : []);
  const pipelineItems = channelData?.contentPipeline ?? (isDemo ? DEFAULT_PIPELINE_ITEMS : []);
  const actionableInsights = channelData?.actionableInsights ?? [];

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* UNAVAILABLE Banner with Retry */}
      {(dataState === 'UNAVAILABLE' || apiError?.kind === 'unavailable') && (
        <div
          data-testid="unavailable-banner"
          className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>Creator telemetry service unavailable. Showing offline snapshot.</span>
          </div>
          <button
            onClick={handleManualRetry}
            disabled={loading}
            type="button"
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-500/20 text-rose-200 font-medium transition-colors',
              loading ? 'opacity-60 cursor-not-allowed' : 'hover:bg-rose-500/30 cursor-pointer'
            )}
          >
            <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
            <span>{loading ? 'Retrying...' : 'Retry Connection'}</span>
          </button>
        </div>
      )}

      {/* STALE Banner (no demo fallback) */}
      {dataState === 'STALE' && (
        <div
          data-testid="stale-banner"
          className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>Upstream sync delayed. Displaying cached channel snapshot.</span>
          </div>
          <button
            onClick={handleSyncNow}
            disabled={loading}
            type="button"
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/20 text-amber-200 font-medium transition-colors',
              loading ? 'opacity-60 cursor-not-allowed' : 'hover:bg-amber-500/30 cursor-pointer'
            )}
          >
            <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
            <span>{loading ? 'Syncing...' : 'Sync Now'}</span>
          </button>
        </div>
      )}

      {/* API Connection Warning Banner (if request fails while cached data is displayed) */}
      {apiError && dataState !== 'UNAVAILABLE' && apiError.kind !== 'unavailable' && (
        <div
          data-testid="api-error-banner"
          className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>{apiError.message}</span>
          </div>
          <button
            onClick={handleManualRetry}
            disabled={loading}
            type="button"
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/20 text-amber-200 font-medium transition-colors',
              loading
                ? 'opacity-60 cursor-not-allowed'
                : 'hover:bg-amber-500/30 cursor-pointer'
            )}
          >
            <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
            <span>{loading ? 'Retrying...' : 'Retry Connection'}</span>
          </button>
        </div>
      )}

      {/* ROW 1: 4 Precision Metric Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title={kpis?.totalViews.title ?? 'Total Views'}
          value={totalViewsValue}
          change={totalViewsChange}
          trend={totalViewsTrend}
          changePeriod={totalViewsPeriod}
          icon={<Eye />}
          sparklinePoints={totalViewsSparkline}
          loading={loading}
        />
        <KpiCard
          title={kpis?.netSubscribers.title ?? 'Net Subscribers'}
          value={netSubscribersValue}
          change={netSubscribersChange}
          trend={netSubscribersTrend}
          changePeriod={netSubscribersPeriod}
          icon={<Users />}
          sparklinePoints={netSubscribersSparkline}
          loading={loading}
        />
        <KpiCard
          title={kpis?.watchTimeHours.title ?? 'Watch Time (hrs)'}
          value={watchTimeValue}
          change={watchTimeChange}
          trend={watchTimeTrend}
          changePeriod={watchTimePeriod}
          icon={<Clock />}
          sparklinePoints={watchTimeSparkline}
          loading={loading}
        />
        <KpiCard
          title={kpis?.estimatedPartnerRevenue?.title ?? 'Est. Partner Revenue'}
          value={revenueValue}
          change={revenueChange}
          trend={revenueTrend}
          changePeriod={revenuePeriod}
          icon={<DollarSign />}
          sparklinePoints={revenueSparkline}
          loading={loading}
        />
      </section>

      {/* ROW 2: Primary Performance Chart (8 cols) + Evidence-Based Triage (4 cols) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Recharts Primary Metric Chart */}
        <div className="lg:col-span-8 p-5 rounded-lg bg-[#141418] border border-white/[0.06] flex flex-col justify-between">
          {/* Chart Header & Metric Switcher Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Channel Growth Velocity
              </div>
              <div className="text-sm text-zinc-300 font-medium mt-0.5">
                {isDemo
                  ? `Aggregate ${dateRange} performance trajectory`
                  : chartData.length === 1
                  ? '1 baseline telemetry snapshot recorded • Multi-day trend expands with subsequent daily syncs'
                  : `Aggregate ${dateRange} performance trajectory`}
              </div>
            </div>

            {/* Range Selector & Segmented Metric Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              <div
                className="flex items-center bg-[#09090B] border border-zinc-800 rounded-md p-0.5 text-xs font-mono"
                data-testid="dashboard-date-range-selector"
              >
                {(['7d', '28d', '90d', '365d'] as const).map((range) => (
                  <button
                    key={range}
                    onClick={() => setDateRange(range)}
                    type="button"
                    data-testid={`date-range-option-${range}`}
                    className={cn(
                      'px-2 py-1 rounded text-[11px] transition-colors cursor-pointer',
                      dateRange === range
                        ? 'bg-zinc-800 text-zinc-100 font-medium shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-300'
                    )}
                  >
                    {range}
                  </button>
                ))}
              </div>

              <div className="flex items-center bg-[#09090B] border border-zinc-800 rounded-md p-0.5 text-xs">
                {(['views', 'watchTime', 'subscribers'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setMetricTab(tab)}
                    type="button"
                    className={cn(
                      'px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer',
                      metricTab === tab
                        ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-300'
                    )}
                  >
                    {metricConfigs[tab].label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Interactive Recharts Canvas / Empty State / Insufficient History State */}
          <div className="h-72 w-full">
            {chartData.length === 0 ? (
              <div className="h-full w-full flex flex-col items-center justify-center text-zinc-500 font-mono text-xs border border-dashed border-zinc-800 rounded-md">
                No velocity chart telemetry recorded for this channel.
              </div>
            ) : chartData.length === 1 && !isDemo ? (
              <div
                className="h-full w-full flex flex-col items-center justify-center p-6 bg-zinc-900/30 border border-zinc-800/80 rounded-md text-center space-y-3"
                data-testid="insufficient-history-state"
              >
                <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700/60 flex items-center justify-center mx-auto text-zinc-400">
                  <Clock className="w-5 h-5 text-indigo-400" />
                </div>
                <div className="space-y-1.5 max-w-md">
                  <div className="text-xs font-semibold text-zinc-200">
                    Insufficient History for Growth Trajectory
                  </div>
                  <p className="text-[11px] text-zinc-300 leading-relaxed font-sans">
                    Current baseline recorded:{' '}
                    <strong className="text-zinc-100 font-mono">
                      {overviewData?.kpis.totalViews.formattedValue ?? chartData[0].views.toLocaleString()} views
                    </strong>
                    {chartData[0].date ? ` (${chartData[0].date})` : ''}
                    {lastSyncedAt ? (
                      <span className="text-zinc-400 block text-[10px] font-mono mt-0.5">
                        Recorded:{' '}
                        {new Date(lastSyncedAt).toLocaleString(undefined, {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[11px] text-zinc-500 leading-relaxed font-sans">
                    Multi-day growth trajectories and velocity curves expand automatically after subsequent daily sync snapshots are recorded.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSyncNow}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700/80 transition-colors cursor-pointer disabled:opacity-50"
                  data-testid="sync-now-insufficient-history"
                >
                  <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
                  <span>{loading ? 'Syncing...' : 'Sync Now'}</span>
                </button>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="metricGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={currentMetric.stroke} stopOpacity={0.12} />
                      <stop offset="95%" stopColor={currentMetric.stroke} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272A" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="#71717A"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#27272A' }}
                  />
                  <YAxis
                    stroke="#71717A"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={currentMetric.formatter}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const val = payload[0].value as number;
                        return (
                          <div className="bg-[#141418] border border-zinc-800 p-2.5 rounded-md shadow-xl text-xs space-y-1">
                            <div className="text-zinc-400 font-mono text-[11px]">{label}</div>
                            <div className="text-zinc-100 font-semibold tabular-nums text-sm">
                              {currentMetric.fullFormatter(val)}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey={currentMetric.dataKey}
                    stroke={currentMetric.stroke}
                    strokeWidth={1.5}
                    fillOpacity={1}
                    fill="url(#metricGradient)"
                    dot={{ r: 4, fill: currentMetric.stroke }}
                    activeDot={{ r: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Right: Evidence-Based Triage Panel (4 cols) */}
        <div className="lg:col-span-4 p-5 rounded-lg bg-[#141418] border border-white/[0.06] flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Actionable Insights
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400 border border-zinc-700/60">
                Evidence-Backed
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              Diagnostic anomalies identified from telemetry models
            </p>
          </div>

          <div className="space-y-3">
            {actionableInsights.length > 0 ? (
              actionableInsights.map((insight) => (
                <div
                  key={insight.id}
                  className="p-3 rounded-md bg-[#09090B] border border-zinc-800/80 space-y-1.5 hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs font-medium text-zinc-200">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      {insight.title}
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono">
                      {insight.badgeLabel}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-zinc-400">{insight.description}</p>
                  <Link
                    to={insight.actionUrl}
                    className="inline-flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white font-medium pt-1"
                  >
                    <span>{insight.actionText}</span>
                    <ArrowRight className="w-3 h-3 text-zinc-500" />
                  </Link>
                </div>
              ))
            ) : isDemo ? (
              <>
                {/* Diagnostic Item 1 */}
                <div className="p-3 rounded-md bg-[#09090B] border border-zinc-800/80 space-y-1.5 hover:border-zinc-700 transition-colors">
                  <div className="flex items-center justify-between text-xs font-medium text-zinc-200">
                    <span className="flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-amber-400" />
                      High Retention Outlier
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono">+38% Hook</span>
                  </div>
                  <p className="text-[11px] font-mono text-zinc-400">
                    'AI Agents Fail in Prod' held 72% at 0:30 vs 44% baseline.
                  </p>
                  <Link
                    to="/shorts-generator"
                    className="inline-flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white font-medium pt-1"
                  >
                    <span>Clip into High-CTR Short</span>
                    <ArrowRight className="w-3 h-3 text-zinc-500" />
                  </Link>
                </div>

                {/* Diagnostic Item 2 */}
                <div className="p-3 rounded-md bg-[#09090B] border border-zinc-800/80 space-y-1.5 hover:border-zinc-700 transition-colors">
                  <div className="flex items-center justify-between text-xs font-medium text-zinc-200">
                    <span className="flex items-center gap-1.5">
                      <Image className="w-3.5 h-3.5 text-indigo-400" />
                      Thumbnail CTR Decay
                    </span>
                    <span className="text-[10px] text-rose-400 font-mono">-2.4% CTR</span>
                  </div>
                  <p className="text-[11px] font-mono text-zinc-400">
                    Impressions up 220% on 'Vector Search' but CTR dropped to 4.8%.
                  </p>
                  <Link
                    to="/thumbnail-analyzer"
                    className="inline-flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white font-medium pt-1"
                  >
                    <span>Audit Thumbnail Contrast</span>
                    <ArrowRight className="w-3 h-3 text-zinc-500" />
                  </Link>
                </div>

                {/* Diagnostic Item 3 */}
                <div className="p-3 rounded-md bg-[#09090B] border border-zinc-800/80 space-y-1.5 hover:border-zinc-700 transition-colors">
                  <div className="flex items-center justify-between text-xs font-medium text-zinc-200">
                    <span className="flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                      Unexploited Keyword Gap
                    </span>
                    <span className="text-[10px] text-indigo-400 font-mono">High Demand</span>
                  </div>
                  <p className="text-[11px] font-mono text-zinc-400">
                    Competitors gaining search share on 'Local LLM Agent RAG'.
                  </p>
                  <Link
                    to="/script-generator"
                    className="inline-flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white font-medium pt-1"
                  >
                    <span>Generate Hook in Script Studio</span>
                    <ArrowRight className="w-3 h-3 text-zinc-500" />
                  </Link>
                </div>
              </>
            ) : (
              <div className="p-4 text-center text-zinc-500 font-mono text-xs">
                No diagnostic anomalies identified for this channel.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ROW 3: Recent Video Performance Table (7 cols) + Content Pipeline & Quick Launchers (5 cols) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Recent Video Table (7 cols) */}
        <div className="lg:col-span-7 p-5 rounded-lg bg-[#141418] border border-white/[0.06] flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Recent Video Performance
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">
                Top recent uploads ranked by velocity and click-through
              </div>
            </div>
            <Link
              to="/analytics"
              className="text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              View all videos
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800/80 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                  <th className="pb-2.5 font-medium">Video</th>
                  <th className="pb-2.5 font-medium text-right">Views</th>
                  <th className="pb-2.5 font-medium text-right">AVD</th>
                  <th className="pb-2.5 font-medium text-right">CTR</th>
                  <th className="pb-2.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {recentVideos.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-zinc-500 font-mono text-xs">
                      No recent video uploads recorded for this channel.
                    </td>
                  </tr>
                ) : (
                  recentVideos.map((vid) => (
                    <tr key={vid.id} className="hover:bg-zinc-900/40 transition-colors group">
                      {/* Video with thumbnail */}
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-3">
                          {vid.thumbnailUrl ? (
                            <img
                              src={vid.thumbnailUrl}
                              alt={vid.title}
                              className="w-14 h-8 shrink-0 rounded object-cover border border-zinc-700/50"
                            />
                          ) : (
                            <div className="w-14 h-8 shrink-0 rounded bg-zinc-800 border border-zinc-700/50 flex items-center justify-center text-[9px] font-mono text-zinc-500">
                              16:9
                            </div>
                          )}
                          <div className="min-w-0 max-w-[240px]">
                            <div
                              className="text-zinc-200 font-medium truncate group-hover:text-white transition-colors"
                              title={vid.title}
                            >
                              {vid.title}
                            </div>
                            <div className="text-[11px] text-zinc-500">{vid.published}</div>
                          </div>
                        </div>
                      </td>

                      {/* Views */}
                      <td className="py-3 text-right font-mono text-zinc-200 tabular-nums">
                        {vid.formattedViews ?? vid.views.toLocaleString('en-US')}
                      </td>

                      {/* AVD */}
                      <td className="py-3 text-right font-mono text-zinc-400 tabular-nums">
                        {vid.avd}
                      </td>

                      {/* CTR */}
                      <td className="py-3 text-right">
                        <span
                          className={cn(
                            'inline-flex font-mono text-[11px] px-1.5 py-0.5 rounded border tabular-nums',
                            vid.ctrStatus === 'high'
                              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                              : 'text-zinc-400 bg-zinc-800/80 border-zinc-700/60'
                          )}
                        >
                          {vid.ctr}
                        </span>
                      </td>

                      {/* Action Menu */}
                      <td className="py-3 text-right relative">
                        <button
                          onClick={() =>
                            setActiveMenuId(activeMenuId === vid.id ? null : vid.id)
                          }
                          type="button"
                          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>

                        {activeMenuId === vid.id && (
                          <div className="absolute right-0 top-8 z-20 w-44 rounded-md bg-[#18181B] border border-zinc-800 shadow-xl py-1 text-left text-xs">
                            <button
                              onClick={() => {
                                setActiveMenuId(null);
                                navigate('/thumbnail-analyzer');
                              }}
                              type="button"
                              className="w-full px-3 py-1.5 text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center gap-2 cursor-pointer"
                            >
                              <Image className="w-3.5 h-3.5 text-zinc-400" />
                              <span>Analyze Thumbnail</span>
                            </button>
                            <button
                              onClick={() => {
                                setActiveMenuId(null);
                                navigate('/script-generator');
                              }}
                              type="button"
                              className="w-full px-3 py-1.5 text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center gap-2 cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5 text-zinc-400" />
                              <span>Generate Follow-up</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Pipeline Summary & Quick Tool Launchers (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Content Pipeline Summary */}
          <div className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                  Content Pipeline
                </div>
                <div className="text-xs text-zinc-500">Upcoming production schedule</div>
              </div>
              <Link
                to="/content-planner"
                className="text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Calendar
              </Link>
            </div>

            <div className="space-y-2">
              {pipelineItems.length === 0 ? (
                <div className="p-4 text-center text-zinc-500 font-mono text-xs">
                  No upcoming content scheduled.
                </div>
              ) : (
                pipelineItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-md bg-[#09090B] border border-zinc-800/80 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="text-zinc-200 font-medium truncate">{item.title}</div>
                      <div className="text-[11px] text-zinc-500">{item.scheduledDate}</div>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 text-[10px] font-mono px-2 py-0.5 rounded border uppercase',
                        item.stage === 'Ready' &&
                          'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
                        item.stage === 'Editing' &&
                          'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
                        item.stage === 'Scripting' &&
                          'text-amber-400 bg-amber-500/10 border-amber-500/20',
                        item.stage === 'Idea' &&
                          'text-zinc-400 bg-zinc-800/80 border-zinc-700/60'
                      )}
                    >
                      {item.stage}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Studio Quick Actions */}
          <div className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-3">
            <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Studio Quick Launchers
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <Link
                to="/thumbnail-analyzer"
                className="p-3 rounded-md bg-[#09090B] border border-zinc-800 hover:border-zinc-700 transition-colors flex items-center gap-2 text-zinc-200 group"
              >
                <Image className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300" />
                <span className="truncate font-medium">Thumbnail Audit</span>
              </Link>
              <Link
                to="/video-ideas"
                className="p-3 rounded-md bg-[#09090B] border border-zinc-800 hover:border-zinc-700 transition-colors flex items-center gap-2 text-zinc-200 group"
              >
                <Sparkles className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300" />
                <span className="truncate font-medium">Idea Research</span>
              </Link>
              <Link
                to="/competitors"
                className="p-3 rounded-md bg-[#09090B] border border-zinc-800 hover:border-zinc-700 transition-colors flex items-center gap-2 text-zinc-200 group"
              >
                <TrendingUp className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300" />
                <span className="truncate font-medium">Competitors</span>
              </Link>
              <Link
                to="/shorts-generator"
                className="p-3 rounded-md bg-[#09090B] border border-zinc-800 hover:border-zinc-700 transition-colors flex items-center gap-2 text-zinc-200 group"
              >
                <Scissors className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300" />
                <span className="truncate font-medium">Shorts Clipper</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default DashboardPage;
