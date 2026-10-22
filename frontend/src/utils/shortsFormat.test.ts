import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  formatFileSize,
  formatRelativeTime,
  truncateFilename,
} from './shortsFormat';

describe('shortsFormat utility functions', () => {
  describe('formatDuration', () => {
    it('formats 0 and invalid numbers as 00:00', () => {
      expect(formatDuration(0)).toBe('00:00');
      expect(formatDuration(-10)).toBe('00:00');
      expect(formatDuration(NaN)).toBe('00:00');
    });

    it('formats seconds under one minute', () => {
      expect(formatDuration(5)).toBe('00:05');
      expect(formatDuration(45)).toBe('00:45');
    });

    it('formats standard mm:ss durations', () => {
      expect(formatDuration(65)).toBe('01:05');
      expect(formatDuration(599)).toBe('09:59');
      expect(formatDuration(1800)).toBe('30:00');
    });

    it('formats durations over an hour as h:mm:ss', () => {
      expect(formatDuration(3600)).toBe('1:00:00');
      expect(formatDuration(3665)).toBe('1:01:05');
      expect(formatDuration(7325)).toBe('2:02:05');
    });
  });

  describe('formatFileSize', () => {
    it('formats 0 or negative bytes as 0.0 MB', () => {
      expect(formatFileSize(0)).toBe('0.0 MB');
      expect(formatFileSize(-100)).toBe('0.0 MB');
      expect(formatFileSize(NaN)).toBe('0.0 MB');
    });

    it('formats megabytes with 1 decimal place', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
      expect(formatFileSize(15.75 * 1024 * 1024)).toBe('15.8 MB');
      expect(formatFileSize(500 * 1024 * 1024)).toBe('500.0 MB');
    });
  });

  describe('formatRelativeTime', () => {
    const fixedNow = new Date('2026-10-20T12:00:00Z').getTime();

    it('formats recent timestamps as just now', () => {
      expect(formatRelativeTime('2026-10-20T11:59:45Z', fixedNow)).toBe('just now');
      expect(formatRelativeTime(null, fixedNow)).toBe('just now');
      expect(formatRelativeTime('invalid-date', fixedNow)).toBe('just now');
    });

    it('formats minutes ago', () => {
      expect(formatRelativeTime('2026-10-20T11:58:30Z', fixedNow)).toBe('1 min ago');
      expect(formatRelativeTime('2026-10-20T11:45:00Z', fixedNow)).toBe('15 mins ago');
    });

    it('formats hours ago', () => {
      expect(formatRelativeTime('2026-10-20T10:45:00Z', fixedNow)).toBe('1 hour ago');
      expect(formatRelativeTime('2026-10-20T08:00:00Z', fixedNow)).toBe('4 hours ago');
    });

    it('formats days ago', () => {
      expect(formatRelativeTime('2026-10-19T12:00:00Z', fixedNow)).toBe('1 day ago');
      expect(formatRelativeTime('2026-10-15T12:00:00Z', fixedNow)).toBe('5 days ago');
    });
  });

  describe('truncateFilename', () => {
    it('leaves short filenames untouched', () => {
      expect(truncateFilename('short.mp4', 20)).toBe('short.mp4');
      expect(truncateFilename('video.mov')).toBe('video.mov');
    });

    it('truncates long filenames preserving the extension', () => {
      const longName = 'my_extremely_detailed_tutorial_recording_2026.mp4';
      const truncated = truncateFilename(longName, 24);
      expect(truncated.endsWith('.mp4')).toBe(true);
      expect(truncated.includes('...')).toBe(true);
      expect(truncated.length).toBeLessThanOrEqual(24);
    });

    it('truncates names without extensions with trailing ellipsis', () => {
      const longName = 'this_is_a_very_long_file_name_without_extension';
      const truncated = truncateFilename(longName, 15);
      expect(truncated).toBe('this_is_a_ve...');
      expect(truncated.length).toBe(15);
    });
  });
});
