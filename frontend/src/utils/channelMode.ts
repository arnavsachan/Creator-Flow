/**
 * Determines whether a channel is considered a DEMO channel.
 * Returns true if id starts with 'demo-'; everything else is treated as LIVE.
 *
 * NOTE: This is a temporary rule until the backend provides a dedicated
 * `source` field (e.g. source: 'LIVE' | 'DEMO').
 */
export function isDemoChannel(channelId?: string | null): boolean {
  return typeof channelId === 'string' && channelId.startsWith('demo-');
}

export default isDemoChannel;
