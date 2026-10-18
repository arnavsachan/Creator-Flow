import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import type { DashboardOverviewData } from '../types/dashboard';
import { cn } from '../utils/cn';

// Baseline fallback data for offline / initial rendering
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

const DEFAULT_RECENT_VIDEOS = [
  {
    id: 'vid-1',
    title: 'Why 90% of AI Agents Fail in Production (System Architecture)',
    published: '3 days ago',
    views: '142,850',
    avd: '8:42 (62%)',
    ctr: '8.4%',
    ctrStatus: 'high' as const,
  },
  {
    id: 'vid-2',
    title: 'We Built an Autonomous YouTube Studio in 48 Hours',
    published: '1 week ago',
    views: '98,420',
    avd: '7:15 (54%)',
    ctr: '6.9%',
    ctrStatus: 'high' as const,
  },
  {
    id: 'vid-3',
    title: 'Stop Using Basic Prompting: Vector Graph Search Explained',
    published: '2 weeks ago',
    views: '76,190',
    avd: '5:30 (41%)',
    ctr: '4.8%',
    ctrStatus: 'normal' as const,
  },
  {
    id: 'vid-4',
    title: 'Python vs Rust for Real-time Video Ingestion Pipelines',
    published: '3 weeks ago',
    views: '64,300',
    avd: '6:50 (49%)',
    ctr: '5.2%',
    ctrStatus: 'normal' as const,
  },
  {
    id: 'vid-5',
    title: 'The Clean Monorepo Architecture Blueprint for 2026',
    published: '1 month ago',
    views: '112,040',
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
  const { dataState, setDataState, selectedChannelId } = useAppMode();
  const navigate = useNavigate();
  const [metricTab, setMetricTab] = useState<'views' | 'watchTime' | 'subscribers'>('views');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Phase 1.5 Real API Integration State
  const [overviewData, setOverviewData] = useState<DashboardOverviewData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const retryControllerRef = useRef<AbortController | null>(null);

  // Clean up any in-flight manual retry when component unmounts
  useEffect(() => {
    return () => {
      if (retryControllerRef.current) {
        retryControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    async function loadData() {
      setLoading(true);
      setApiError(null);
      try {
        const response = await getDashboardOverview(selectedChannelId, controller.signal);
        if (isMounted) {
          setOverviewData(response.data);
          if (response.data_state) {
            setDataState(response.data_state);
          }
          setLoading(false);
        }
      } catch (err: unknown) {
        // If aborted by channel switch or unmount, ignore without logging or updating state
        if (controller.signal.aborted) {
          return;
        }
        if (isMounted) {
          console.warn('[DashboardPage] API overview request failed:', err);
          setApiError('Backend overview API unreachable. Falling back to cached local data.');
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [selectedChannelId, setDataState]);

  const handleManualRetry = () => {
    if (loading) return; // Prevent duplicate retry requests while loading

    if (retryControllerRef.current) {
      retryControllerRef.current.abort();
    }
    const controller = new AbortController();
    retryControllerRef.current = controller;

    setLoading(true);
    setApiError(null);

    getDashboardOverview(selectedChannelId, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setOverviewData(res.data);
          if (res.data_state) {
            setDataState(res.data_state);
          }
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        console.warn('[DashboardPage] Manual retry failed:', err);
        setApiError('Retry failed. Operating with baseline demo metrics.');
        setLoading(false);
      });
  };

  if (dataState === 'UNAVAILABLE') {
    return (
      <div className="max-w-4xl mx-auto py-16">
        <ErrorState
          title="Creator Telemetry Disconnected"
          message="Unable to reach the YouTube Data Ingestion Pipeline. Ensure backend worker services are online or revert to DEMO mode."
          onRetry={() => setDataState('DEMO')}
        />
      </div>
    );
  }

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

  // Prevent displaying stale metrics after channel switches:
  // If overviewData was fetched for another channel, fall back to null during transition
  const channelData = overviewData?.channel_id === selectedChannelId ? overviewData : null;
  const m = channelData?.metrics;
  const chartData = channelData?.chart_data ?? DEFAULT_CHART_DATA;
  const recentVideos = channelData?.recent_videos ?? DEFAULT_RECENT_VIDEOS;
  const pipelineItems = channelData?.pipeline_items ?? DEFAULT_PIPELINE_ITEMS;

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* API Connection Warning Banner (if request fails) */}
      {apiError && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>{apiError}</span>
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
          title={m?.totalViews.title ?? 'Total Views'}
          value={m?.totalViews.value ?? '1,428,900'}
          change={m?.totalViews.change ?? '+18.4%'}
          trend={m?.totalViews.trend ?? 'up'}
          changePeriod={m?.totalViews.changePeriod ?? 'vs previous 28d'}
          icon={<Eye />}
          sparklinePoints={m?.totalViews.sparklinePoints ?? [28, 32, 30, 42, 45, 50, 48, 62, 70, 68, 82]}
          loading={loading}
        />
        <KpiCard
          title={m?.netSubscribers.title ?? 'Net Subscribers'}
          value={m?.netSubscribers.value ?? '+4,820'}
          change={m?.netSubscribers.change ?? '+12.6%'}
          trend={m?.netSubscribers.trend ?? 'up'}
          changePeriod={m?.netSubscribers.changePeriod ?? 'vs previous 28d'}
          icon={<Users />}
          sparklinePoints={m?.netSubscribers.sparklinePoints ?? [10, 14, 12, 19, 22, 25, 29, 31, 38, 42, 48]}
          loading={loading}
        />
        <KpiCard
          title={m?.watchTime.title ?? 'Watch Time (hrs)'}
          value={m?.watchTime.value ?? '48,250'}
          change={m?.watchTime.change ?? '+24.1%'}
          trend={m?.watchTime.trend ?? 'up'}
          changePeriod={m?.watchTime.changePeriod ?? 'vs previous 28d'}
          icon={<Clock />}
          sparklinePoints={m?.watchTime.sparklinePoints ?? [35, 38, 42, 40, 52, 58, 62, 60, 72, 79, 85]}
          loading={loading}
        />
        <KpiCard
          title={m?.estimatedRevenue.title ?? 'Est. Partner Revenue'}
          value={m?.estimatedRevenue.value ?? '$3,842.10'}
          change={m?.estimatedRevenue.change ?? '-2.1%'}
          trend={m?.estimatedRevenue.trend ?? 'down'}
          changePeriod={m?.estimatedRevenue.changePeriod ?? 'RPM $3.42'}
          icon={<DollarSign />}
          sparklinePoints={m?.estimatedRevenue.sparklinePoints ?? [45, 48, 50, 47, 44, 46, 42, 40, 43, 41, 39]}
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
                Aggregate 28-day performance trajectory
              </div>
            </div>

            {/* Segmented Metric Tabs */}
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

          {/* Interactive Recharts Canvas */}
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                />
              </AreaChart>
            </ResponsiveContainer>
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
                      {/* Video with 16:9 placeholder thumbnail */}
                      <td className="py-3 pr-3">
                        <div className="flex items-center gap-3">
                          <div className="w-14 h-8 shrink-0 rounded bg-zinc-800 border border-zinc-700/50 flex items-center justify-center text-[9px] font-mono text-zinc-500">
                            16:9
                          </div>
                          <div className="min-w-0 max-w-[240px]">
                            <div className="text-zinc-200 font-medium truncate group-hover:text-white transition-colors">
                              {vid.title}
                            </div>
                            <div className="text-[11px] text-zinc-500">{vid.published}</div>
                          </div>
                        </div>
                      </td>

                      {/* Views */}
                      <td className="py-3 text-right font-mono text-zinc-200 tabular-nums">
                        {vid.views}
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
