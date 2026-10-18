import React from 'react';
import { cn } from '../../utils/cn';

interface LoadingSkeletonProps {
  className?: string;
  variant?: 'rectangular' | 'circular' | 'text' | 'card';
  count?: number;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  className,
  variant = 'rectangular',
  count = 1,
}) => {
  const getVariantClasses = () => {
    switch (variant) {
      case 'circular':
        return 'rounded-full w-8 h-8';
      case 'text':
        return 'h-3.5 w-full rounded';
      case 'card':
        return 'h-28 w-full rounded-lg';
      case 'rectangular':
      default:
        return 'rounded-md';
    }
  };

  const skeletons = Array.from({ length: count });

  return (
    <>
      {skeletons.map((_, index) => (
        <div
          key={index}
          className={cn(
            'relative overflow-hidden bg-zinc-900/60 border border-zinc-800/60',
            'before:absolute before:inset-0 before:-translate-x-full',
            'before:animate-[shimmer_2s_infinite]',
            'before:bg-gradient-to-r before:from-transparent before:via-zinc-800/30 before:to-transparent',
            getVariantClasses(),
            className
          )}
          aria-hidden="true"
        />
      ))}
    </>
  );
};

export default LoadingSkeleton;
