import React, { useEffect, useState } from 'react';
import { AlertCircle, Clock, Globe2, Heart, Loader2, Tv, UserCheck, Users, Video } from 'lucide-react';
import { useAppMode } from '../context/AppModeContext';
import { getChannelAudience } from '../services/youtubeService';
import { dashboardSync } from '../services/dashboardSync';
import { ErrorState } from '../components/states/ErrorState';
import type { AudienceTelemetryResponse } from '../types/youtube';

export const AudiencePage: React.FC = () => {
  const { selectedChannelId } = useAppMode();
  const [data, setData] = useState<AudienceTelemetryResponse | null>(null);
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

    getChannelAudience(selectedChannelId)
      .then((res) => {
        if (!ignore) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          console.warn('[AudiencePage] Failed to load audience telemetry:', err);
          setApiError(err?.message || 'Failed to fetch channel audience demographics.');
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [selectedChannelId, refreshKey]);

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-zinc-100 tracking-tight">
              Audience Demographics & Cohort Analysis
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
              ? `Audience scale and demographic telemetry for ${data.title}`
              : 'Audience loyalty indices, active time windows, and geographic distribution.'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="p-12 rounded-lg bg-[#141418] border border-white/[0.06] flex items-center justify-center gap-3 text-zinc-400 text-xs">
          <Loader2 className="w-4 h-4 animate-spin text-zinc-300" />
          <span>Loading audience demographics...</span>
        </div>
      ) : apiError && !data ? (
        <div className="py-12" data-testid="audience-error">
          <ErrorState
            title="Audience Demographics Unavailable"
            message={apiError}
            onRetry={() => setRefreshKey((k) => k + 1)}
          />
        </div>
      ) : !data ? (
        <div className="py-16 text-center text-zinc-400 space-y-2 border border-dashed border-zinc-800 rounded-lg" data-testid="audience-empty">
          <Tv className="w-8 h-8 mx-auto text-zinc-500" />
          <h3 className="text-sm font-semibold text-zinc-200">No Audience Demographics</h3>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            No audience data recorded for this channel. Connect or sync your YouTube channel to view metrics.
          </p>
        </div>
      ) : (
        <>
          {/* Summary KPIs Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] space-y-1">
              <div className="flex items-center justify-between text-xs text-zinc-400 uppercase font-medium">
                <span>Total Subscribers</span>
                <Users className="w-4 h-4 text-zinc-500" />
              </div>
              <div className="text-2xl font-semibold text-zinc-50 font-mono">
                {data?.subscribers !== undefined ? data.subscribers.toLocaleString('en-US') : '—'}
              </div>
              <p className="text-[11px] text-zinc-400 font-sans">
                {data?.isLive ? 'Public YouTube subscriber count' : 'Simulated audience scale'}
              </p>
            </div>

            <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] space-y-1">
              <div className="flex items-center justify-between text-xs text-zinc-400 uppercase font-medium">
                <span>Lifetime Channel Reach</span>
                <Globe2 className="w-4 h-4 text-zinc-500" />
              </div>
              <div className="text-2xl font-semibold text-zinc-50 font-mono">
                {data?.totalViews !== undefined ? data.totalViews.toLocaleString('en-US') : '—'}
              </div>
              <p className="text-[11px] text-zinc-400 font-sans">
                {data?.isLive ? 'Total views across published videos' : 'Simulated lifetime reach'}
              </p>
            </div>

            <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] space-y-1">
              <div className="flex items-center justify-between text-xs text-zinc-400 uppercase font-medium">
                <span>Public Uploads</span>
                <Video className="w-4 h-4 text-zinc-500" />
              </div>
              <div className="text-2xl font-semibold text-zinc-50 font-mono">
                {data?.uploads !== undefined ? data.uploads.toLocaleString('en-US') : '—'}
              </div>
              <p className="text-[11px] text-zinc-400 font-sans">
                {data?.isLive ? 'Audience-facing public videos' : 'Simulated video catalog'}
              </p>
            </div>
          </div>

          {/* Scope Limitation Disclosure for Live Channels */}
          {data?.scopeLimitationNotice && (
            <div className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800 flex items-start gap-3 text-zinc-300">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="text-xs font-semibold text-zinc-200">
                  Audience Cohort Breakdown & Geography Limitation
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {data.scopeLimitationNotice}
                </p>
              </div>
            </div>
          )}

          {/* Loyalty & Conversion Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] space-y-1">
              <div className="flex items-center justify-between text-xs text-zinc-400 uppercase font-medium">
                <span>Returning Viewers</span>
                <UserCheck className="w-4 h-4 text-zinc-500" />
              </div>
              <div className="text-2xl font-semibold text-zinc-50 font-mono">
                {data?.returningViewersRate ?? 'Unavailable'}
              </div>
              <p className="text-[11px] text-zinc-400 font-sans">
                {data?.returningViewersRate ? '+4.1% loyalty increase' : 'Requires YouTube Analytics API'}
              </p>
            </div>

            <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] space-y-1">
              <div className="flex items-center justify-between text-xs text-zinc-400 uppercase font-medium">
                <span>Subscriber Conversion</span>
                <Heart className="w-4 h-4 text-zinc-500" />
              </div>
              <div className="text-2xl font-semibold text-zinc-50 font-mono">
                {data?.subscriberConversionRate ?? 'Unavailable'}
              </div>
              <p className="text-[11px] text-zinc-400 font-sans">
                {data?.subscriberConversionRate ? 'Top 10% in Tech niche' : 'Requires YouTube Analytics API'}
              </p>
            </div>

            <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] space-y-1">
              <div className="flex items-center justify-between text-xs text-zinc-400 uppercase font-medium">
                <span>Optimal Release Window</span>
                <Clock className="w-4 h-4 text-zinc-500" />
              </div>
              <div className="text-2xl font-semibold text-zinc-50 font-mono">
                {data?.optimalReleaseWindow ?? 'Unavailable'}
              </div>
              <p className="text-[11px] text-zinc-400 font-sans">
                {data?.optimalReleaseWindow ? 'Wednesdays & Thursdays' : 'Requires YouTube Analytics API'}
              </p>
            </div>
          </div>

          {/* Geography Breakdown */}
          <div className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                  Geographic Concentration
                </div>
                <div className="text-xs text-zinc-500">Distribution of unique viewers by territory</div>
              </div>
              <Globe2 className="w-4 h-4 text-zinc-500" />
            </div>

            {data?.topCountries ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {data.topCountries.map((c) => (
                  <div key={c.country} className="p-3 rounded-md bg-[#09090B] border border-zinc-800 space-y-1 font-mono">
                    <div className="text-xs font-sans font-medium text-zinc-200">{c.country}</div>
                    <div className="text-base font-semibold text-zinc-100">{c.share}</div>
                    <div className="text-[11px] text-zinc-500">{c.viewers} viewers</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-zinc-500 space-y-1">
                <p>Viewer territory breakdown requires YouTube Analytics Reporting API permissions.</p>
                <span className="text-[10px] text-zinc-600 font-mono block">
                  Unavailable under standard youtube.readonly Data scope (subject to Google's strict privacy thresholds)
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AudiencePage;
