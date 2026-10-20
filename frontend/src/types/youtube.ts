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

export interface AnalyticsTelemetryResponse {
  channelId: string;
  dataState: string;
  isLive: boolean;
  title: string;
  totalViews: number;
  totalSubscribers: number;
  totalVideos: number;
  trafficSources?: TrafficSourceItem[] | null;
  retentionChart?: RetentionPoint[] | null;
  scopeLimitationNotice?: string | null;
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
  returningViewersRate?: string | null;
  subscriberConversionRate?: string | null;
  optimalReleaseWindow?: string | null;
  topCountries?: GeographicViewerItem[] | null;
  scopeLimitationNotice?: string | null;
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
