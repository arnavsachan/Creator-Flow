export interface ConnectedChannel {
  id: string;
  channelId: string;
  title: string;
  customUrl?: string | null;
  thumbnailUrl?: string | null;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  status: 'connected' | 'disconnected' | 'expired';
  hasAnalyticsScope?: boolean;
  connectedAt: string;
  lastSyncedAt: string;
}

export interface ConnectionStatusResponse {
  connected: boolean;
  channel: ConnectedChannel | null;
}

export interface OAuthStartResponse {
  authorizationUrl: string;
  state: string;
  includeAnalytics?: boolean;
}

export interface DisconnectResponse {
  success: boolean;
  message: string;
}

export interface TrafficSourceItem {
  source: string;
  views: number;
  percentage: string;
  change: string;
}

export interface RetentionPoint {
  timestamp: string;
  longForm: number;
  shortForm: number;
}

export interface AnalyticsDayPoint {
  date: string;
  views: number;
  estimatedMinutesWatched: number;
  averageViewDurationSeconds: number;
  subscribersGained: number;
  subscribersLost: number;
}

export interface AnalyticsOverviewReportResponse {
  channelId: string;
  dataState: string;
  isLive: boolean;
  hasAnalyticsScope: boolean;
  startDate: string;
  endDate: string;
  days: number;
  totalViews: number;
  totalEstimatedMinutesWatched: number;
  averageViewDurationSeconds: number;
  netSubscribers: number;
  timeSeries: AnalyticsDayPoint[];
  authorizationUrl?: string | null;
  message?: string | null;
}

export interface TrafficSourcesReportResponse {
  channelId: string;
  dataState: string;
  isLive: boolean;
  hasAnalyticsScope: boolean;
  startDate: string;
  endDate: string;
  days: number;
  totalViews: number;
  trafficSources: TrafficSourceItem[];
  authorizationUrl?: string | null;
  message?: string | null;
}

export interface GeographicAudienceReportResponse {
  channelId: string;
  dataState: string;
  isLive: boolean;
  hasAnalyticsScope: boolean;
  startDate: string;
  endDate: string;
  days: number;
  totalViews: number;
  topCountries: GeographicViewerItem[];
  authorizationUrl?: string | null;
  message?: string | null;
}

export interface AnalyticsTelemetryResponse {
  channelId: string;
  dataState: string;
  isLive: boolean;
  title: string;
  totalViews: number;
  totalSubscribers: number;
  totalVideos: number;
  hasAnalyticsScope?: boolean;
  trafficSources?: TrafficSourceItem[] | null;
  retentionChart?: RetentionPoint[] | null;
  timeSeries?: AnalyticsDayPoint[] | null;
  scopeLimitationNotice?: string | null;
  authorizationUrl?: string | null;
}

export interface GeographicViewerItem {
  country: string;
  share: string;
  viewers: string;
}

export interface AudienceTelemetryResponse {
  channelId: string;
  dataState: string;
  isLive: boolean;
  title: string;
  subscribers: number;
  totalViews: number;
  uploads: number;
  hasAnalyticsScope?: boolean;
  returningViewersRate?: string | null;
  subscriberConversionRate?: string | null;
  optimalReleaseWindow?: string | null;
  topCountries?: GeographicViewerItem[] | null;
  scopeLimitationNotice?: string | null;
  authorizationUrl?: string | null;
}

export interface ChannelSnapshotItem {
  id: string;
  channelId: string;
  snapshotAt: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  syncStatus: string;
  errorMessage?: string | null;
}

export interface ChannelHistoryResponse {
  channelId: string;
  dataState: string;
  days: number;
  snapshots: ChannelSnapshotItem[];
  message?: string | null;
}

export interface ChannelVideoItem {
  id: string;
  channelId: string;
  videoId: string;
  title: string;
  publishedAt: string;
  relativePublished: string;
  thumbnailUrl?: string | null;
  viewCount: number;
  likeCount?: number | null;
  commentCount?: number | null;
  lastSyncedAt: string;
}

export interface ChannelVideosResponse {
  channelId: string;
  dataState: string;
  videos: ChannelVideoItem[];
  message?: string | null;
}
