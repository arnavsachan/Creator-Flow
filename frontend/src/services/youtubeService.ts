import apiClient from './apiClient';
import type {
  AnalyticsOverviewReportResponse,
  AnalyticsTelemetryResponse,
  AudienceTelemetryResponse,
  ChannelDetailsResponse,
  ChannelHistoryResponse,
  ChannelVideosResponse,
  ConnectedChannel,
  ConnectionStatusResponse,
  ContentLibraryParams,
  ContentLibraryResponse,
  DisconnectResponse,
  GeographicAudienceReportResponse,
  OAuthStartResponse,
  TrafficSourcesReportResponse,
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
 * If includeAnalytics is true, requests the yt-analytics.readonly scope.
 */
export async function startOAuth(
  options?: { includeAnalytics?: boolean },
  signal?: AbortSignal
): Promise<OAuthStartResponse> {
  await ensureAuthenticatedSession();
  const params = options?.includeAnalytics ? { include_analytics: true } : undefined;
  const response = await apiClient.get<OAuthStartResponse>('/youtube/oauth/start', {
    params,
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

/**
 * Fetches rich connected channel details from YouTube Data API v3.
 */
export async function getChannelDetails(
  channelId?: string,
  signal?: AbortSignal
): Promise<ChannelDetailsResponse> {
  await ensureAuthenticatedSession();
  const params: Record<string, string> = {};
  if (channelId) {
    params.channel_id = channelId;
  }
  const response = await apiClient.get<ChannelDetailsResponse>('/youtube/channel/details', {
    params,
    signal,
  });
  return response.data;
}

/**
 * Fetches uploaded video list with duration, publish dates, metadata, and public statistics
 * using the uploads playlist approach with pagination and search/filtering support.
 */
export async function getContentLibrary(
  params?: ContentLibraryParams,
  signal?: AbortSignal
): Promise<ContentLibraryResponse> {
  await ensureAuthenticatedSession();
  const queryParams: Record<string, string | number> = {};
  if (params?.channelId) queryParams.channel_id = params.channelId;
  if (params?.pageToken) queryParams.page_token = params.pageToken;
  if (params?.maxResults) queryParams.max_results = params.maxResults;
  if (params?.q) queryParams.q = params.q;
  if (params?.order) queryParams.order = params.order;

  const response = await apiClient.get<ContentLibraryResponse>('/youtube/content-library', {
    params: queryParams,
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
  getAnalyticsOverview,
  getTrafficSources,
  getAudienceGeography,
  getChannelDetails,
  getContentLibrary,
};
