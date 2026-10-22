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
  analyticsVerified?: boolean;
  analyticsError?: string | null;
  trafficSources?: TrafficSourceItem[] | null;
  retentionChart?: RetentionPoint[] | null;
  timeSeries?: AnalyticsDayPoint[] | null;
  scopeNotice?: string | null;
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
  days?: number | null;
  hasAnalyticsScope?: boolean;
  analyticsVerified?: boolean;
  analyticsError?: string | null;
  returningViewersRate?: string | null;
  returningViewersState?: string | null;
  returningViewersNotice?: string | null;
  subscriberConversionRate?: string | null;
  subscriberConversionState?: string | null;
  subscriberConversionNotice?: string | null;
  optimalReleaseWindow?: string | null;
  optimalReleaseWindowState?: string | null;
  optimalReleaseWindowNotice?: string | null;
  topCountries?: GeographicViewerItem[] | null;
  scopeNotice?: string | null;
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
  duration?: string | null;
  durationSeconds?: number | null;
  description?: string | null;
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

export interface ChannelDetailsResponse {
  channelId: string;
  dataState: string;
  isLive: boolean;
  title: string;
  description?: string;
  customUrl?: string | null;
  publishedAt?: string | null;
  thumbnailUrl?: string | null;
  thumbnails?: Record<string, string> | null;
  bannerImageUrl?: string | null;
  country?: string | null;
  defaultLanguage?: string | null;
  subscriberCount: number;
  hiddenSubscriberCount: boolean;
  videoCount: number;
  viewCount: number;
  topicCategories: string[];
  keywords?: string | null;
  uploadsPlaylistId?: string | null;
  privacyStatus?: string | null;
  hasDataScope: boolean;
  authorizationUrl?: string | null;
  message?: string | null;
}

export interface ContentVideoItem {
  videoId: string;
  channelId: string;
  channelTitle?: string | null;
  title: string;
  description?: string;
  publishedAt: string;
  relativePublished: string;
  thumbnailUrl?: string | null;
  thumbnails?: Record<string, string> | null;
  duration?: string | null;
  durationIso?: string | null;
  durationSeconds?: number | null;
  viewCount: number;
  likeCount?: number | null;
  commentCount?: number | null;
  tags: string[];
  privacyStatus?: string | null;
  definition?: string | null;
  hasCaption: boolean;
}

export interface ContentLibraryParams {
  channelId?: string;
  pageToken?: string;
  maxResults?: number;
  q?: string;
  order?: 'date' | 'views' | 'likes' | 'title';
}

export interface ContentLibraryResponse {
  channelId: string;
  dataState: string;
  isLive: boolean;
  videos: ContentVideoItem[];
  nextPageToken?: string | null;
  prevPageToken?: string | null;
  totalResults: number;
  resultsPerPage: number;
  q?: string | null;
  order?: string | null;
  authorizationUrl?: string | null;
  message?: string | null;
}
