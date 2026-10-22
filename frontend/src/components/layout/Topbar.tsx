import React from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronDown, RefreshCw, Tv } from 'lucide-react';
import { useAppMode } from '../../context/AppModeContext';
import type { DataState } from '../../types/dataStates';
import { cn } from '../../utils/cn';

interface TopbarProps {
  onRefresh?: () => void;
  isSyncing?: boolean;
}

export const Topbar: React.FC<TopbarProps> = ({ onRefresh, isSyncing = false }) => {
  const location = useLocation();
  const {
    dataState,
    setDataState,
    selectedChannelId,
    setSelectedChannelId,
    connectedChannel,
    dateRange,
    setDateRange,
  } = useAppMode();

  const states: DataState[] = ['DEMO', 'LIVE', 'STALE', 'UNAVAILABLE'];

  // Map route to breadcrumb label
  const getPageTitle = (path: string): string => {
    switch (path) {
      case '/':
        return 'Overview';
      case '/analytics':
        return 'Analytics & Telemetry';
      case '/audience-insights':
        return 'Audience Insights';
      case '/channels':
        return 'Connected Channels';
      case '/content-library':
        return 'Content Library';
      case '/video-ideas':
        return 'Video Ideas & SEO';
      case '/script-generator':
        return 'Script Studio';
      case '/thumbnail-analyzer':
        return 'Thumbnail Lab';
      case '/shorts-generator':
        return 'Shorts Clipper';
      case '/competitors':
        return 'Competitor Intelligence';
      case '/content-planner':
        return 'Content Calendar';
      case '/settings':
        return 'Settings';
      default:
        return 'Workspace';
    }
  };

  return (
    <header className="h-14 px-6 border-b border-zinc-800/80 bg-[#09090B]/90 backdrop-blur-sm flex items-center justify-between gap-4 sticky top-0 z-30 select-none">
      {/* Left: Breadcrumbs & Channel Selector */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-zinc-500 font-medium hidden sm:inline">Workspace</span>
        <span className="text-zinc-600 hidden sm:inline">/</span>
        <h1 className="text-xs font-semibold text-zinc-100 tracking-tight">
          {getPageTitle(location.pathname)}
        </h1>

        <div className="h-4 w-px bg-zinc-800 hidden md:block" />

        {/* Channel Switcher Pill */}
        <div className="relative flex items-center">
          <div className="flex items-center gap-1.5 border border-zinc-800 bg-zinc-900 text-xs text-zinc-200 rounded-md px-2.5 py-1.5 hover:border-zinc-700 transition-colors">
            <Tv className="w-3.5 h-3.5 text-zinc-400" />
            <select
              value={selectedChannelId}
              onChange={(e) => setSelectedChannelId(e.target.value)}
              className="appearance-none bg-transparent text-xs text-zinc-200 focus:outline-none cursor-pointer pr-4 font-medium"
            >
              {connectedChannel ? (
                <>
                  <optgroup label="Connected Channel (Live)">
                    <option value={connectedChannel.channelId} className="bg-zinc-900 text-emerald-400 font-medium">
                      {connectedChannel.title} (Live)
                    </option>
                  </optgroup>
                  <optgroup label="Simulated Sandbox (Demo Profiles)">
                    <option value="demo-channel-1" className="bg-zinc-900 text-zinc-400">
                      [Demo] Tech Pulse (Simulated)
                    </option>
                    <option value="demo-channel-2" className="bg-zinc-900 text-zinc-400">
                      [Demo] Gaming Frontier (Simulated)
                    </option>
                  </optgroup>
                </>
              ) : (
                <optgroup label="Simulated Sandbox Profiles">
                  <option value="demo-channel-1" className="bg-zinc-900 text-zinc-200">
                    [Demo] Tech Pulse (Simulated)
                  </option>
                  <option value="demo-channel-2" className="bg-zinc-900 text-zinc-200">
                    [Demo] Gaming Frontier (Simulated)
                  </option>
                </optgroup>
              )}
            </select>
            <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Right: Date Range, State Toolbar, and Sync */}
      <div className="flex items-center gap-3">
        {/* Date Range Segmented Control */}
        <div
          data-testid="topbar-date-range-selector"
          className="flex items-center bg-zinc-900 border border-zinc-800/80 rounded-md p-0.5 text-xs font-mono"
        >
          {(['7d', '28d', '90d', '365d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              type="button"
              data-testid={`topbar-date-range-${range}`}
              className={cn(
                'px-2 py-1 rounded text-[11px] transition-colors cursor-pointer',
                dateRange === range
                  ? 'bg-zinc-800 text-zinc-100 font-medium shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              )}
            >
              {range}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-zinc-800 hidden lg:block" />

        {/* Compact 4-State Switcher (Developer Toolbar Toggle) */}
        <div className="flex items-center bg-zinc-900 border border-zinc-800/80 rounded-md p-0.5 text-xs">
          {states.map((st) => (
            <button
              key={st}
              onClick={() => setDataState(st)}
              type="button"
              className={cn(
                'px-2 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer',
                dataState === st
                  ? 'bg-zinc-800 text-zinc-100 font-medium'
                  : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              {st}
            </button>
          ))}
        </div>

        {/* Sync Button */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            type="button"
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
            title="Sync telemetry data"
          >
            <RefreshCw className={cn('w-3 h-3', isSyncing && 'animate-spin')} />
            <span className="hidden sm:inline">Sync</span>
          </button>
        )}
      </div>
    </header>
  );
};

export default Topbar;
