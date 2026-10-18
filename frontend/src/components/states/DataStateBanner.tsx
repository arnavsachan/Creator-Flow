import React from 'react';
import { RotateCw } from 'lucide-react';
import type { DataState } from '../../types/dataStates';
import { cn } from '../../utils/cn';

interface DataStateBannerProps {
  state: DataState;
  lastSyncedAt?: string | null;
  onRefresh?: () => void;
  className?: string;
}

export const DataStateBanner: React.FC<DataStateBannerProps> = ({
  state,
  lastSyncedAt = 'Just now',
  onRefresh,
  className,
}) => {
  const getBannerDetails = () => {
    switch (state) {
      case 'LIVE':
        return {
          dotColor: 'bg-emerald-400',
          pulse: true,
          label: 'Live Stream',
          desc: 'Connected to active channel metrics via YouTube API',
          badgeText: 'LIVE',
          badgeClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
          borderClass: 'border-emerald-950/30',
        };
      case 'STALE':
        return {
          dotColor: 'bg-amber-400',
          pulse: false,
          label: 'Cached Snapshot',
          desc: `Upstream sync delayed. Displaying snapshot from ${lastSyncedAt || '2h ago'}`,
          badgeText: 'STALE',
          badgeClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
          borderClass: 'border-amber-950/30',
        };
      case 'UNAVAILABLE':
        return {
          dotColor: 'bg-rose-400',
          pulse: false,
          label: 'Service Offline',
          desc: 'Channel metrics connection timeout. Check API credentials or upstream health.',
          badgeText: 'OFFLINE',
          badgeClass: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
          borderClass: 'border-rose-950/30',
        };
      case 'DEMO':
      default:
        return {
          dotColor: 'bg-zinc-400',
          pulse: false,
          label: 'Demo Environment',
          desc: 'Synthetic sandbox dataset. Connect YouTube OAuth to activate live telemetry.',
          badgeText: 'DEMO',
          badgeClass: 'text-zinc-300 bg-zinc-800/80 border-zinc-700/60',
          borderClass: 'border-zinc-800/60',
        };
    }
  };

  const details = getBannerDetails();

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'h-8 px-4 w-full bg-[#09090B] border-b border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-400 select-none transition-colors',
        details.borderClass,
        className
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="relative flex h-2 w-2 shrink-0">
          {details.pulse && (
            <span
              className={cn(
                'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
                details.dotColor
              )}
            />
          )}
          <span className={cn('relative inline-flex rounded-full h-2 w-2', details.dotColor)} />
        </span>

        <span
          className={cn(
            'px-1.5 py-0.5 rounded text-[10px] font-mono font-medium uppercase border',
            details.badgeClass
          )}
        >
          {details.badgeText}
        </span>

        <span className="truncate text-zinc-300 hidden sm:inline">
          {details.desc}
        </span>
      </div>

      <div className="flex items-center gap-3 shrink-0 text-zinc-500">
        {state !== 'UNAVAILABLE' && lastSyncedAt && (
          <span className="hidden md:inline font-mono">
            Synced {lastSyncedAt}
          </span>
        )}

        {state === 'UNAVAILABLE' ? (
          <button
            onClick={onRefresh}
            type="button"
            className="text-[10px] font-medium text-rose-300 hover:text-rose-200 underline decoration-rose-500/50 underline-offset-2 cursor-pointer"
          >
            Reconnect Stream
          </button>
        ) : (
          onRefresh && (
            <button
              onClick={onRefresh}
              type="button"
              className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              title="Trigger manual sync"
            >
              <RotateCw className="w-3 h-3" />
              <span className="hidden sm:inline">Sync</span>
            </button>
          )
        )}
      </div>
    </div>
  );
};

export default DataStateBanner;
