import apiClient from './apiClient';
import type {
  AnalyticsTelemetryResponse,
  AudienceTelemetryResponse,
  ChannelHistoryResponse,
  ChannelVideosResponse,
  ConnectedChannel,
  ConnectionStatusResponse,
  DisconnectResponse,
  OAuthStartResponse,
} from '../types/youtube';

/**
 * Ensures an application user session is available.
 * If no auth token is stored in localStorage, creates/retrieves a demo session.
 */
export async function ensureAuthenticatedSession(): Promise<string> {
  const existingToken = localStorage.getItem('auth_token');
  if (existingToken) {
    return existingToken;
  }
  const response = await apiClient.post<{ access_token: string }>('/auth/demo-session');
  const token = response.data.access_token;
  localStorage.setItem('auth_token', token);
  return token;
}

/**
 * Checks YouTube connection status for the current authenticated user.
 */
export async function getConnectionStatus(signal?: AbortSignal): Promise<ConnectionStatusResponse> {
  await ensureAuthenticatedSession();
  const response = await apiClient.get<ConnectionStatusResponse>('/youtube/connection-status', {
    signal,
  });
  return response.data;
}

/**
 * Initiates the YouTube OAuth flow and returns the Google authorization URL.
 */
export async function startOAuth(signal?: AbortSignal): Promise<OAuthStartResponse> {
  await ensureAuthenticatedSession();
  const response = await apiClient.get<OAuthStartResponse>('/youtube/oauth/start', {
    signal,
  });
  return response.data;
}

/**
 * Disconnects the active YouTube channel and revokes credentials.
 */
export async function disconnectChannel(signal?: AbortSignal): Promise<DisconnectResponse> {
  await ensureAuthenticatedSession();
  const response = await apiClient.post<DisconnectResponse>('/youtube/disconnect', {}, { signal });
  return response.data;
}

/**
 * Synchronizes metrics from YouTube Data API for the connected channel.
 */
export async function syncChannel(signal?: AbortSignal): Promise<ConnectedChannel> {
  await ensureAuthenticatedSession();
  const response = await apiClient.post<ConnectedChannel>('/youtube/sync', {}, { signal });
  return response.data;
}

/**
 * Fetches analytics telemetry for a channel (live or demo).
 */
export async function getChannelAnalytics(
  channelId?: string,
  signal?: AbortSignal
): Promise<AnalyticsTelemetryResponse> {
  await ensureAuthenticatedSession();
  const params = channelId ? { channel_id: channelId } : undefined;
  const response = await apiClient.get<AnalyticsTelemetryResponse>('/youtube/analytics', {
    params,
    signal,
  });
  return response.data;
}

/**
 * Fetches audience telemetry for a channel (live or demo).
 */
export async function getChannelAudience(
  channelId?: string,
  signal?: AbortSignal
): Promise<AudienceTelemetryResponse> {
  await ensureAuthenticatedSession();
  const params = channelId ? { channel_id: channelId } : undefined;
  const response = await apiClient.get<AudienceTelemetryResponse>('/youtube/audience', {
    params,
    signal,
  });
  return response.data;
}

/**
 * Fetches historical telemetry snapshots for a channel.
 */
export async function getChannelHistory(
  channelId?: string,
  days: number = 28,
  signal?: AbortSignal
): Promise<ChannelHistoryResponse> {
  await ensureAuthenticatedSession();
  const params: Record<string, string | number> = { days };
  if (channelId) {
    params.channel_id = channelId;
  }
  const response = await apiClient.get<ChannelHistoryResponse>('/youtube/history', {
    params,
    signal,
  });
  return response.data;
}

/**
 * Fetches recent public videos and statistics for a channel.
 */
export async function getChannelVideos(
  channelId?: string,
  limit: number = 20,
  signal?: AbortSignal
): Promise<ChannelVideosResponse> {
  await ensureAuthenticatedSession();
  const params: Record<string, string | number> = { limit };
  if (channelId) {
    params.channel_id = channelId;
  }
  const response = await apiClient.get<ChannelVideosResponse>('/youtube/videos', {
    params,
    signal,
  });
  return response.data;
}

export default {
  ensureAuthenticatedSession,
  getConnectionStatus,
  startOAuth,
  disconnectChannel,
  syncChannel,
  getChannelAnalytics,
  getChannelAudience,
  getChannelHistory,
  getChannelVideos,
};
