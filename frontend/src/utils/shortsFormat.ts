/**
 * Utility functions for formatting durations, file sizes, relative timestamps,
 * and filenames on the Shorts Clipper page.
 */

/**
 * Format seconds into mm:ss (or h:mm:ss when >= 1 hour).
 */
export function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Format byte count as MB (rounded to 1 decimal place).
 */
export function formatFileSize(bytes: number): string {
  if (isNaN(bytes) || bytes <= 0) return '0.0 MB';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

/**
 * Format an ISO date/time string into a human-readable relative time (e.g. "2 min ago").
 */
export function formatRelativeTime(
  isoDateString: string | null | undefined,
  nowMs: number = Date.now()
): string {
  if (!isoDateString) return 'just now';
  const date = new Date(isoDateString);
  const time = date.getTime();
  if (isNaN(time)) return 'just now';

  const diffSec = Math.max(0, Math.floor((nowMs - time) / 1000));
  if (diffSec < 45) {
    return 'just now';
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return diffMin <= 1 ? '1 min ago' : `${diffMin} mins ago`;
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return diffHours <= 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) {
    return diffDays <= 1 ? '1 day ago' : `${diffDays} days ago`;
  }
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return diffMonths <= 1 ? '1 month ago' : `${diffMonths} months ago`;
  }
  const diffYears = Math.floor(diffDays / 365);
  return diffYears <= 1 ? '1 year ago' : `${diffYears} years ago`;
}

/**
 * Truncate long filenames with ellipsis, preserving file extension when possible.
 */
export function truncateFilename(filename: string, maxLength: number = 24): string {
  if (!filename || filename.length <= maxLength) return filename;

  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex > 0 && filename.length - dotIndex <= 6) {
    const ext = filename.slice(dotIndex);
    const available = maxLength - ext.length - 3;
    if (available > 3) {
      return `${filename.slice(0, available)}...${ext}`;
    }
  }

  return `${filename.slice(0, maxLength - 3)}...`;
}
