import React from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '../../utils/cn';
import { LoadingSkeleton } from '../states/LoadingSkeleton';

export interface KpiCardProps {
  title: string;
  value?: string | number | null;
  change?: string | number | null;
  changePeriod?: string | null;
  trend?: 'up' | 'down' | 'neutral';
  icon?: React.ReactNode;
  sparklinePoints?: number[];
  loading?: boolean;
  className?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  change,
  changePeriod = 'vs previous 28d',
  trend = 'neutral',
  icon,
  sparklinePoints,
  loading = false,
  className,
}) => {
  if (loading) {
    return (
      <div
        className={cn(
          'p-4 rounded-lg bg-[#141418] border border-white/[0.06] space-y-3',
          className
        )}
      >
        <div className="flex justify-between items-center">
          <LoadingSkeleton variant="text" className="w-20 h-3.5" />
          <LoadingSkeleton variant="circular" className="w-4 h-4" />
        </div>
        <LoadingSkeleton variant="text" className="w-28 h-7" />
        <LoadingSkeleton variant="text" className="w-36 h-3" />
        <div className="pt-1">
          <LoadingSkeleton variant="text" className="w-full h-4" />
        </div>
      </div>
    );
  }

  const hasSparkline = Boolean(sparklinePoints && sparklinePoints.length >= 2);
  const width = 120;
  const height = 24;

  let points = '';
  if (hasSparkline && sparklinePoints) {
    const min = Math.min(...sparklinePoints);
    const max = Math.max(...sparklinePoints);
    const range = max - min || 1;
    points = sparklinePoints
      .map((pt, i) => {
        const x = (i / (sparklinePoints.length - 1)) * width;
        const y = height - ((pt - min) / range) * (height - 4) - 2;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  const strokeColor =
    trend === 'up'
      ? '#34d399' // emerald-400
      : trend === 'down'
      ? '#fb7185' // rose-400
      : '#71717a'; // zinc-500

  const displayValue = value === null || value === undefined ? 'Not available' : value;
  const isUnavailable = displayValue === 'Not available';

  return (
    <div
      className={cn(
        'p-4 rounded-lg bg-[#141418] border border-white/[0.06] hover:border-zinc-700/80 transition-all duration-150 flex flex-col justify-between group',
        className
      )}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
          {title}
        </span>
        {icon && (
          <div className="text-zinc-500 group-hover:text-zinc-400 transition-colors [&>svg]:w-3.5 [&>svg]:h-3.5">
            {icon}
          </div>
        )}
      </div>

      {/* Main Metric Value */}
      <div className="space-y-1">
        <div
          className={cn(
            'tracking-tight font-semibold tabular-nums',
            isUnavailable ? 'text-lg font-normal text-zinc-400' : 'text-2xl text-zinc-50'
          )}
        >
          {displayValue}
        </div>

        {/* Delta Badge & Comparison */}
        <div className="flex items-center gap-1.5 flex-wrap text-xs pt-0.5">
          {change != null && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded border font-mono tabular-nums',
                trend === 'up' && 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
                trend === 'down' && 'text-rose-400 bg-rose-500/10 border-rose-500/20',
                trend === 'neutral' && 'text-zinc-400 bg-zinc-800/80 border-zinc-700/50'
              )}
            >
              {trend === 'up' && <ArrowUpRight className="w-3 h-3" />}
              {trend === 'down' && <ArrowDownRight className="w-3 h-3" />}
              {trend === 'neutral' && <Minus className="w-3 h-3" />}
              {change}
            </span>
          )}
          {changePeriod && (
            <span className="text-zinc-500 text-[11px] truncate">{changePeriod}</span>
          )}
        </div>
      </div>

      {/* Subtle Bottom Sparkline */}
      {hasSparkline && (
        <div className="pt-3 mt-2 border-t border-white/[0.04] flex items-center justify-between">
          <span className="text-[10px] font-mono text-zinc-600 uppercase">28d Trend</span>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-24 h-4 overflow-visible"
            aria-hidden="true"
          >
            <polyline
              fill="none"
              stroke={strokeColor}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={points}
              opacity="0.8"
            />
          </svg>
        </div>
      )}
    </div>
  );
};

export default KpiCard;
