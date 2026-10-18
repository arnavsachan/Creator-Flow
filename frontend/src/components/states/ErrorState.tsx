import React from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { cn } from '../../utils/cn';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Telemetry Stream Disconnected',
  message = 'Failed to fetch current creator metrics from the upstream API. Check network connectivity or retry the stream.',
  onRetry,
  className,
  compact = false,
}) => {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-lg border border-zinc-800 bg-[#0F0F12] text-center flex flex-col items-center justify-center p-6 text-zinc-300',
        compact ? 'p-4 gap-2' : 'p-8 gap-3 max-w-lg mx-auto',
        className
      )}
    >
      <div className="w-9 h-9 rounded-md bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
        <AlertCircle className="w-4 h-4" />
      </div>

      <div className="space-y-1">
        <h3 className="font-medium text-zinc-100 text-sm tracking-tight">{title}</h3>
        <p className="text-xs text-zinc-400 leading-relaxed">{message}</p>
      </div>

      {onRetry && (
        <button
          onClick={onRetry}
          type="button"
          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700/80 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Retry Connection</span>
        </button>
      )}
    </div>
  );
};

export default ErrorState;
