import { describe, expect, it } from 'vitest';
import { isDemoChannel } from './channelMode';

describe('isDemoChannel', () => {
  it('returns true when channel id starts with demo-', () => {
    expect(isDemoChannel('demo-channel-1')).toBe(true);
    expect(isDemoChannel('demo-channel-2')).toBe(true);
    expect(isDemoChannel('demo-xyz')).toBe(true);
  });

  it('returns false for live channels or empty/null values', () => {
    expect(isDemoChannel('uc-live-001')).toBe(false);
    expect(isDemoChannel('channel-123')).toBe(false);
    expect(isDemoChannel('')).toBe(false);
    expect(isDemoChannel(null)).toBe(false);
    expect(isDemoChannel(undefined)).toBe(false);
  });
});
