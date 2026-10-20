import React, { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertCircle, Download, Eye, Filter, Loader2, Tv, Users, Video } from 'lucide-react';
import { useAppMode } from '../context/AppModeContext';
import { getChannelAnalytics } from '../services/youtubeService';
import { dashboardSync } from '../services/dashboardSync';
import { ErrorState } from '../components/states/ErrorState';
import type { AnalyticsTelemetryResponse } from '../types/youtube';

export const AnalyticsPage: React.FC = () => {
  const { selectedChannelId } = useAppMode();
  const [selectedPeriod, setSelectedPeriod] = useState('28d');
  const [data, setData] = useState<AnalyticsTelemetryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // Subscribe to global sync events
  useEffect(() => {
    const unsubscribe = dashboardSync.subscribeSyncTrigger(() => {
      setRefreshKey((k) => k + 1);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setApiError(null);

    getChannelAnalytics(selectedChannelId)
      .then((res) => {
        if (!ignore) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          console.warn('[AnalyticsPage] Failed to load analytics:', err);
          setApiError(err?.message || 'Failed to fetch channel analytics telemetry.');
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [selectedChannelId, refreshKey]);

  const handleExportCsv = () => {
    if (!data) return;
    const syncedTimestamp = dashboardSync.getLastSyncedAt() || new Date().toISOString();
    const rows = [
      ['Metric', 'Value', 'Source', 'Sync Timestamp'],
      ['Channel Title', `"${data.title.replace(/"/g, '""')}"`, data.isLive ? 'Live YouTube Channel' : 'Simulated Sandbox', syncedTimestamp],
      ['Channel ID', `"${data.channelId}"`, data.isLive ? 'YouTube Data API v3' : 'Simulated Sandbox', syncedTimestamp],
      ['Lifetime Views', data.totalViews.toString(), data.isLive ? 'YouTube Data API v3 (Verified)' : 'Simulated Sandbox', syncedTimestamp],
      ['Total Subscribers', data.totalSubscribers.toString(), data.isLive ? 'YouTube Data API v3 (Verified)' : 'Simulated Sandbox', syncedTimestamp],
      ['Public Uploads', data.totalVideos.toString(), data.isLive ? 'YouTube Data API v3 (Verified)' : 'Simulated Sandbox', syncedTimestamp],
      ['Inbound Traffic Sources', 'Unavailable', 'Requires YouTube Analytics API (yt-analytics.readonly)', syncedTimestamp],
      ['Audience Retention Curves', 'Unavailable', 'Requires YouTube Analytics API (yt-analytics.readonly)', syncedTimestamp],
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `youtube-channel-${data.channelId}-telemetry.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-zinc-100 tracking-tight">
              Channel Telemetry & Deep Analytics
            </h2>
            {data?.isLive ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-950 text-emerald-400 border border-emerald-800/80">
                LIVE TELEMETRY
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-950 text-amber-400 border border-amber-800/80">
                DEMO / SAMPLE DATA
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            {data?.title
              ? `Channel metrics and traffic telemetry for ${data.title}`
              : 'Traffic discovery vectors, retention curves, and device distribution metrics.'}
            {data?.isLive && (
              <span className="text-zinc-500 block text-[11px] mt-0.5 font-mono">
                Verified channel metrics shown • Lookback window ({selectedPeriod}) applies to granular telemetry when Analytics API reports are authorized.
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#141418] border border-zinc-800 rounded-md p-0.5 text-xs">
            {['7d', '28d', '90d'].map((p) => (
              <button
                key={p}
                onClick={() => setSelectedPeriod(p)}
                type="button"
                className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                  selectedPeriod === p ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!data || loading}
            data-testid="export-csv-button"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 rounded-lg bg-[#141418] border border-white/[0.06] flex items-center justify-center gap-3 text-zinc-400 text-xs">
          <Loader2 className="w-4 h-4 animate-spin text-zinc-300" />
          <span>Loading channel analytics...</span>
        </div>
      ) : apiError && !data ? (
        <div className="py-12" data-testid="analytics-error">
          <ErrorState
            title="Channel Analytics Unavailable"
            message={apiError}
            onRetry={() => setRefreshKey((k) => k + 1)}
          />
        </div>
      ) : !data ? (
        <div className="py-16 text-center text-zinc-400 space-y-2 border border-dashed border-zinc-800 rounded-lg" data-testid="analytics-empty">
          <Tv className="w-8 h-8 mx-auto text-zinc-500" />
          <h3 className="text-sm font-semibold text-zinc-200">No Analytics Telemetry</h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            No analytics data found for this channel. Connect or sync your YouTube channel to load live metrics.
          </p>
        </div>
      ) : (
        <>
          {/* Summary KPIs Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] space-y-1">
              <div className="flex items-center justify-between text-xs text-zinc-400 uppercase font-medium">
                <span>Lifetime Views</span>
                <Eye className="w-4 h-4 text-zinc-500" />
              </div>
              <div className="text-2xl font-semibold text-zinc-50 font-mono">
                {data?.totalViews !== undefined ? data.totalViews.toLocaleString('en-US') : '—'}
              </div>
              <p className="text-[11px] text-zinc-400 font-sans">
                {data?.isLive ? 'Verified via YouTube Data API v3' : 'Sample demo channel telemetry'}
              </p>
            </div>

            <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] space-y-1">
              <div className="flex items-center justify-between text-xs text-zinc-400 uppercase font-medium">
                <span>Total Subscribers</span>
                <Users className="w-4 h-4 text-zinc-500" />
              </div>
              <div className="text-2xl font-semibold text-zinc-50 font-mono">
                {data?.totalSubscribers !== undefined ? data.totalSubscribers.toLocaleString('en-US') : '—'}
              </div>
              <p className="text-[11px] text-zinc-400 font-sans">
                {data?.isLive ? 'Current public subscriber count' : 'Simulated audience scale'}
              </p>
            </div>

            <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] space-y-1">
              <div className="flex items-center justify-between text-xs text-zinc-400 uppercase font-medium">
                <span>Public Uploads</span>
                <Video className="w-4 h-4 text-zinc-500" />
              </div>
              <div className="text-2xl font-semibold text-zinc-50 font-mono">
                {data?.totalVideos !== undefined ? data.totalVideos.toLocaleString('en-US') : '—'}
              </div>
              <p className="text-[11px] text-zinc-400 font-sans">
                {data?.isLive ? 'Published videos on channel' : 'Simulated content count'}
              </p>
            </div>
          </div>

          {/* Scope Limitation Disclosure for Live Channels */}
          {data?.scopeLimitationNotice && (
            <div className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800 flex items-start gap-3 text-zinc-300">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="text-xs font-semibold text-zinc-200">
                  Granular Traffic Vectors & Retention API Limitation
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {data.scopeLimitationNotice}
                </p>
              </div>
            </div>
          )}

          {/* Traffic Sources & Retention Curve Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Traffic Sources Table (6 cols) */}
            <div className="lg:col-span-6 p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                    Discovery Vectors
                  </div>
                  <div className="text-xs text-zinc-500">Breakdown of inbound traffic algorithms</div>
                </div>
                <Filter className="w-4 h-4 text-zinc-500" />
              </div>

              {data?.trafficSources ? (
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500 font-mono text-[10px] uppercase">
                      <th className="pb-2">Source</th>
                      <th className="pb-2 text-right">Views</th>
                      <th className="pb-2 text-right">Share</th>
                      <th className="pb-2 text-right">Trend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/40 font-mono">
                    {data.trafficSources.map((item) => (
                      <tr key={item.source} className="hover:bg-zinc-900/30 transition-colors">
                        <td className="py-2.5 text-zinc-200 font-sans font-medium">{item.source}</td>
                        <td className="py-2.5 text-right text-zinc-300 tabular-nums">{item.views.toLocaleString()}</td>
                        <td className="py-2.5 text-right text-zinc-400 tabular-nums">{item.percentage}</td>
                        <td className="py-2.5 text-right text-emerald-400 tabular-nums">{item.change}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-12 text-center text-xs text-zinc-500 space-y-2">
                  <Tv className="w-6 h-6 mx-auto text-zinc-600" />
                  <p>Inbound traffic vectors require YouTube Analytics Reporting API permissions.</p>
                  <span className="text-[10px] text-zinc-600 font-mono block">
                    Unavailable under standard youtube.readonly Data scope (subject to Google's privacy thresholds)
                  </span>
                </div>
              )}
            </div>

            {/* Retention Curve Chart (6 cols) */}
            <div className="lg:col-span-6 p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-4">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                  Audience Retention Decay Curve
                </div>
                <div className="text-xs text-zinc-500">Long-form retention benchmark vs Shorts</div>
              </div>

              {data?.retentionChart ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.retentionChart} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272A" vertical={false} />
                      <XAxis dataKey="timestamp" stroke="#71717A" fontSize={11} tickLine={false} />
                      <YAxis stroke="#71717A" fontSize={11} tickLine={false} tickFormatter={(v) => `${v}%`} />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-[#141418] border border-zinc-800 p-2 rounded text-xs space-y-1">
                                <div className="text-zinc-400 font-mono">{label}</div>
                                <div className="text-indigo-400 font-mono">Long-form: {payload[0]?.value}%</div>
                                <div className="text-sky-400 font-mono">Shorts: {payload[1]?.value}%</div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="longForm" fill="#6366F1" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="shortForm" fill="#38BDF8" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-zinc-500 space-y-2">
                  <div className="w-6 h-6 mx-auto text-zinc-600 font-mono font-bold">%</div>
                  <p>Audience retention curves require YouTube Analytics Reporting API permissions.</p>
                  <span className="text-[10px] text-zinc-600 font-mono block">
                    Unavailable under standard youtube.readonly Data scope (subject to Google's privacy thresholds)
                  </span>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AnalyticsPage;
