import React, { useState } from 'react';
import {
  Activity,
  BarChart3,
  Check,
  CheckCircle,
  Eye,
  Layers,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useAppMode } from '../context/AppModeContext';
import { DataStateBanner } from '../components/states/DataStateBanner';
import { ErrorState } from '../components/states/ErrorState';
import { KpiCard } from '../components/ui/KpiCard';

export const DashboardPreview: React.FC = () => {
  const { dataState, setDataState, selectedChannelId } = useAppMode();
  const [simulateLoading, setSimulateLoading] = useState(false);
  const [lastSynced, setLastSynced] = useState<string>('Just now');

  const handleRefresh = () => {
    setSimulateLoading(true);
    setTimeout(() => {
      setSimulateLoading(false);
      setLastSynced(new Date().toLocaleTimeString());
    }, 900);
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#0B0F19]">
      {/* Dynamic Data State Alert Bar */}
      <DataStateBanner
        state={dataState}
        lastSyncedAt={lastSynced}
        onRefresh={handleRefresh}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Welcome Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase tracking-wider">
                Phase 1 Scaffolding
              </span>
              <span className="text-xs text-slate-400 font-mono">
                Channel: {selectedChannelId}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-1">
              Creator Studio Overview
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Frontend architectural foundation for CreatorBuddy AI with reactive data states.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setSimulateLoading(!simulateLoading)}
              type="button"
              className="px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 transition-colors cursor-pointer"
            >
              {simulateLoading ? 'Stop Shimmer' : 'Toggle Skeleton'}
            </button>
            <div className="h-6 w-px bg-slate-800" />
            <div className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-500/20 px-3 py-1.5 rounded-lg">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Tailwind v4 & Vite Verified</span>
            </div>
          </div>
        </div>

        {/* Conditional Rendering for UNAVAILABLE state */}
        {dataState === 'UNAVAILABLE' ? (
          <ErrorState
            title="Channel Analytics Feed Unavailable"
            message="The upstream metrics service could not be reached. Ensure the backend API service (Phase 2) is running or switch to DEMO mode in the top bar."
            onRetry={() => setDataState('DEMO')}
          />
        ) : (
          <>
            {/* KPI Metrics Grid */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-400" />
                  <span>Channel Performance Metrics</span>
                </h2>
                <span className="text-xs text-slate-500 font-mono">
                  State: <strong className="text-indigo-300">{dataState}</strong>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                  title="Total Views"
                  value="1,428,900"
                  change="+18.4%"
                  trend="up"
                  changePeriod="vs last 28 days"
                  icon={<Eye className="w-5 h-5" />}
                  loading={simulateLoading}
                />
                <KpiCard
                  title="Subscribers"
                  value="48.2K"
                  change="+1,240"
                  trend="up"
                  changePeriod="+8.2% this month"
                  icon={<Users className="w-5 h-5" />}
                  loading={simulateLoading}
                />
                <KpiCard
                  title="Avg Retention"
                  value="54.8%"
                  change="-1.2%"
                  trend="down"
                  changePeriod="vs channel avg"
                  icon={<Activity className="w-5 h-5" />}
                  loading={simulateLoading}
                />
                <KpiCard
                  title="Est. Revenue"
                  value="$3,840.50"
                  change="+24.1%"
                  trend="up"
                  changePeriod="CPM $4.12"
                  icon={<TrendingUp className="w-5 h-5" />}
                  loading={simulateLoading}
                />
              </div>
            </section>

            {/* Architecture Verification Section */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4">
              {/* Architecture Blueprint */}
              <div className="lg:col-span-2 p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    <span>Phase 1 Architecture Deliverables</span>
                  </h3>
                  <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                    100% Complete
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start gap-3">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-200">
                        Vite + React + TS Clean Init
                      </div>
                      <div className="text-slate-400 mt-0.5">
                        Modern bundling with `@tailwindcss/vite` and base CSS reset.
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start gap-3">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-200">
                        Envelope & Data States
                      </div>
                      <div className="text-slate-400 mt-0.5">
                        Strict `DataState` union (`DEMO`, `LIVE`, `STALE`, `UNAVAILABLE`).
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start gap-3">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-200">
                        AppModeContext & State Sync
                      </div>
                      <div className="text-slate-400 mt-0.5">
                        Global channel selector and live/demo mode synchronization.
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start gap-3">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-200">
                        Configured Axios apiClient
                      </div>
                      <div className="text-slate-400 mt-0.5">
                        15s timeout with interceptors for Phase 2 backend connection.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Next Phase Preview Card */}
              <div className="p-6 rounded-2xl bg-gradient-to-b from-indigo-950/30 to-slate-900/40 border border-indigo-500/20 flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
                    <Sparkles className="w-4 h-4" />
                    <span>Next Milestone</span>
                  </div>
                  <h4 className="text-lg font-bold text-white">
                    Phase 2: Backend Architecture
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Setting up FastAPI / backend service in `D:\Innotech\backend` with health probes, environment configs, and YouTube OAuth credentials.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] text-slate-300 font-mono">
                  Endpoint: /api/v1/health<br />
                  Target: 127.0.0.1:8000
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
};

export default DashboardPreview;
