import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Globe2, Heart, Loader2, Sparkles, Tv, UserCheck, Users, Video } from 'lucide-react';
import { useAppMode } from '../context/AppModeContext';
import { getChannelAudience, startOAuth } from '../services/youtubeService';
import { dashboardSync } from '../services/dashboardSync';
import { ErrorState } from '../components/states/ErrorState';
import type { AudienceTelemetryResponse } from '../types/youtube';

export const AudiencePage: React.FC = () => {
  const { selectedChannelId } = useAppMode();
  const [selectedPeriod, setSelectedPeriod] = useState('28d');
  const [data, setData] = useState<AudienceTelemetryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authorizing, setAuthorizing] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  const days = parseInt(selectedPeriod, 10) || 28;

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

    getChannelAudience(selectedChannelId, days)
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
  }, [selectedChannelId, days, refreshKey]);

  const handleAuthorizeAnalytics = async () => {
    setAuthorizing(true);
    try {
      if (data?.authorizationUrl) {
        window.location.href = data.authorizationUrl;
        return;
      }
      const res = await startOAuth({ includeAnalytics: true });
      if (res.authorizationUrl) {
        window.location.href = res.authorizationUrl;
      }
    } catch (err) {
      console.error('[AudiencePage] Failed to start analytics authorization:', err);
      setAuthorizing(false);
    }
  };

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
            {data?.hasAnalyticsScope && data?.isLive && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-950 text-indigo-400 border border-indigo-800/80 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-indigo-400" />
                <span>ANALYTICS API VERIFIED</span>
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            {data?.title
              ? `Audience scale and demographic telemetry for ${data.title}`
              : 'Audience loyalty indices, active time windows, and geographic distribution.'}
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

          {/* Optional Scope Upgrade Banner for Live Channels without Analytics Scope */}
          {data?.isLive && !data?.hasAnalyticsScope && (
            <div
              className="p-4 rounded-lg bg-indigo-950/40 border border-indigo-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-zinc-300"
              data-testid="authorize-audience-banner"
            >
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-zinc-100">
                    Unlock Geographic & Demographic Telemetry
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Territory distribution and viewer cohorts require the{' '}
                    <code className="text-indigo-300 font-mono text-[11px]">yt-analytics.readonly</code> OAuth scope.
                    Authorize analytics to view country-level audience concentration.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleAuthorizeAnalytics}
                disabled={authorizing}
                data-testid="authorize-audience-button"
                className="shrink-0 px-3.5 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {authorizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>{authorizing ? 'Connecting...' : 'Authorize Analytics'}</span>
              </button>
            </div>
          )}

          {/* Scope Limitation Notice */}
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
                {data?.returningViewersRate ? '+4.1% loyalty increase' : 'Requires YouTube Partner Analytics API'}
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
                {data?.subscriberConversionRate ? 'Top 10% in Tech niche' : 'Requires YouTube Partner Analytics API'}
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
                {data?.optimalReleaseWindow ? 'Wednesdays & Thursdays' : 'Requires YouTube Partner Analytics API'}
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
                <div className="text-xs text-zinc-500">Distribution of viewers by territory ({selectedPeriod})</div>
              </div>
              <Globe2 className="w-4 h-4 text-zinc-500" />
            </div>

            {data?.topCountries && data.topCountries.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {data.topCountries.map((c) => (
                  <div key={c.country} className="p-3 rounded-md bg-[#09090B] border border-zinc-800 space-y-1 font-mono">
                    <div className="text-xs font-sans font-medium text-zinc-200">{c.country}</div>
                    <div className="text-base font-semibold text-zinc-100">{c.share}</div>
                    <div className="text-[11px] text-zinc-500">{c.viewers} viewers</div>
                  </div>
                ))}
              </div>
            ) : data?.hasAnalyticsScope ? (
              <div className="py-8 text-center text-xs text-zinc-500 space-y-1">
                <p>No viewer territory records returned for this period.</p>
                <span className="text-[10px] text-zinc-600 font-mono block">
                  Viewer volume by country may be below Google's privacy thresholds.
                </span>
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
