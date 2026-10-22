import apiClient from './apiClient';
import type {
  AnalyticsOverviewReportResponse,
  AnalyticsTelemetryResponse,
  AudienceTelemetryResponse,
  ChannelHistoryResponse,
  ChannelVideosResponse,
  ConnectedChannel,
  ConnectionStatusResponse,
  DisconnectResponse,
  GeographicAudienceReportResponse,
  OAuthStartResponse,
  TrafficSourcesReportResponse,
} from '../types/youtube';

/**
 * Safely parses and validates that a JWT string is well-formed and unexpired.
 * Includes a 30-second clock skew buffer.
 */
export function isJwtActive(token: string | null): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const parsed = JSON.parse(jsonPayload);
    if (typeof parsed.exp === 'number') {
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (nowSeconds >= parsed.exp - 30) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensures an application user session is available and unexpired.
 * If no auth token is stored in localStorage or if the stored token is expired/invalid,
 * clears the stale token and creates/retrieves a fresh demo session.
 */
export async function ensureAuthenticatedSession(forceRefresh = false): Promise<string> {
  const existingToken = localStorage.getItem('auth_token');
  if (!forceRefresh && isJwtActive(existingToken)) {
    return existingToken!;
  }
  try {
    localStorage.removeItem('auth_token');
  } catch {
    // Guard against private browsing storage restrictions
  }
  const response = await apiClient.post<{ access_token: string }>('/auth/demo-session');
  const token = response.data.access_token;
  try {
    localStorage.setItem('auth_token', token);
  } catch {
    // Guard against private browsing storage restrictions
  }
  return token;
}

/**
 * Checks YouTube connection status for the current authenticated user.
 * Automatically recovers if the stored application token was rejected.
 */
export async function getConnectionStatus(signal?: AbortSignal): Promise<ConnectionStatusResponse> {
  await ensureAuthenticatedSession();
  try {
    const response = await apiClient.get<ConnectionStatusResponse>('/youtube/connection-status', {
      signal,
    });
    return response.data;
  } catch (err: any) {
    if (err?.kind === 'unauthorized' || err?.status === 401) {
      await ensureAuthenticatedSession(true);
      const retryRes = await apiClient.get<ConnectionStatusResponse>('/youtube/connection-status', {
        signal,
      });
      return retryRes.data;
    }
    throw err;
  }
}

/**
 * Initiates the YouTube OAuth flow and returns the Google authorization URL.
 * If includeAnalytics is true, requests the yt-analytics.readonly scope.
 * Automatically recovers if the stored application token was rejected.
 */
export async function startOAuth(
  options?: { includeAnalytics?: boolean },
  signal?: AbortSignal
): Promise<OAuthStartResponse> {
  await ensureAuthenticatedSession();
  const params = options?.includeAnalytics ? { include_analytics: true } : undefined;
  try {
    const response = await apiClient.get<OAuthStartResponse>('/youtube/oauth/start', {
      params,
      signal,
    });
    return response.data;
  } catch (err: any) {
    if (err?.kind === 'unauthorized' || err?.status === 401) {
      await ensureAuthenticatedSession(true);
      const retryRes = await apiClient.get<OAuthStartResponse>('/youtube/oauth/start', {
        params,
        signal,
      });
      return retryRes.data;
    }
    throw err;
  }
}

/**
 * Disconnects the active YouTube channel and revokes credentials.
 */
export async function disconnectChannel(signal?: AbortSignal): Promise<DisconnectResponse> {
  await ensureAuthenticatedSession();
  try {
    const response = await apiClient.post<DisconnectResponse>('/youtube/disconnect', {}, { signal });
    return response.data;
  } catch (err: any) {
    if (err?.kind === 'unauthorized' || err?.status === 401) {
      await ensureAuthenticatedSession(true);
      const retryRes = await apiClient.post<DisconnectResponse>('/youtube/disconnect', {}, { signal });
      return retryRes.data;
    }
    throw err;
  }
}

/**
 * Synchronizes metrics from YouTube Data API for the connected channel.
 */
export async function syncChannel(signal?: AbortSignal): Promise<ConnectedChannel> {
  await ensureAuthenticatedSession();
  try {
    const response = await apiClient.post<ConnectedChannel>('/youtube/sync', {}, { signal });
    return response.data;
  } catch (err: any) {
    if (err?.kind === 'unauthorized' && String(err?.message || '').toLowerCase().includes('token')) {
      await ensureAuthenticatedSession(true);
      const retryRes = await apiClient.post<ConnectedChannel>('/youtube/sync', {}, { signal });
      return retryRes.data;
    }
    throw err;
  }
}

/**
 * Fetches analytics telemetry for a channel (live or demo).
 */
export async function getChannelAnalytics(
  channelId?: string,
  days: number = 28,
  signal?: AbortSignal
): Promise<AnalyticsTelemetryResponse> {
  await ensureAuthenticatedSession();
  const params: Record<string, string | number> = { days };
  if (channelId) {
    params.channel_id = channelId;
  }
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
  days: number = 28,
  signal?: AbortSignal
): Promise<AudienceTelemetryResponse> {
  await ensureAuthenticatedSession();
  const params: Record<string, string | number> = { days };
  if (channelId) {
    params.channel_id = channelId;
  }
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

/**
 * Fetches daily time-series report from YouTube Analytics API.
 */
export async function getAnalyticsOverview(
  channelId?: string,
  days: number = 28,
  signal?: AbortSignal
): Promise<AnalyticsOverviewReportResponse> {
  await ensureAuthenticatedSession();
  const params: Record<string, string | number> = { days };
  if (channelId) {
    params.channel_id = channelId;
  }
  const response = await apiClient.get<AnalyticsOverviewReportResponse>('/youtube/analytics/overview', {
    params,
    signal,
  });
  return response.data;
}

/**
 * Fetches traffic discovery vectors from YouTube Analytics API.
 */
export async function getTrafficSources(
  channelId?: string,
  days: number = 28,
  signal?: AbortSignal
): Promise<TrafficSourcesReportResponse> {
  await ensureAuthenticatedSession();
  const params: Record<string, string | number> = { days };
  if (channelId) {
    params.channel_id = channelId;
  }
  const response = await apiClient.get<TrafficSourcesReportResponse>('/youtube/analytics/traffic-sources', {
    params,
    signal,
  });
  return response.data;
}

/**
 * Fetches country-level audience geography from YouTube Analytics API.
 */
export async function getAudienceGeography(
  channelId?: string,
  days: number = 28,
  signal?: AbortSignal
): Promise<GeographicAudienceReportResponse> {
  await ensureAuthenticatedSession();
  const params: Record<string, string | number> = { days };
  if (channelId) {
    params.channel_id = channelId;
  }
  const response = await apiClient.get<GeographicAudienceReportResponse>('/youtube/audience/geography', {
    params,
    signal,
  });
  return response.data;
}

export default {
  isJwtActive,
  ensureAuthenticatedSession,
  getConnectionStatus,
  startOAuth,
  disconnectChannel,
  syncChannel,
  getChannelAnalytics,
  getChannelAudience,
  getChannelHistory,
  getChannelVideos,
  getAnalyticsOverview,
  getTrafficSources,
  getAudienceGeography,
};
