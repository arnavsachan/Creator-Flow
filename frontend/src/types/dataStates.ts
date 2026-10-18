export type DataState = 'DEMO' | 'LIVE' | 'STALE' | 'UNAVAILABLE';

export interface EnvelopeResponse<T> {
  data: T | null;
  data_state: DataState;
  last_synced_at: string | null;
  message?: string;
}
