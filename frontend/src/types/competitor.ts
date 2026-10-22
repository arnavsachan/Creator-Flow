export interface CompetitorSearchResultItem {
  channelId: string;
  title: string;
  description?: string;
  customUrl?: string | null;
  thumbnailUrl?: string | null;
  subscriberCount?: number | null;
  hiddenSubscriberCount: boolean;
  videoCount: number;
  viewCount: number;
  isTracked: boolean;
}

export interface CompetitorSearchResponse {
  query: string;
  results: CompetitorSearchResultItem[];
  nextPageToken?: string | null;
  prevPageToken?: string | null;
  totalResults: number;
  dataState: 'LIVE' | 'DEMO' | 'AUTHORIZATION_REQUIRED' | 'SERVICE_DISABLED';
  authorizationUrl?: string | null;
  message?: string | null;
}

export interface CompetitorCreate {
  channelId: string;
  title?: string | null;
  customUrl?: string | null;
  thumbnailUrl?: string | null;
  primaryChannelId?: string | null;
  notes?: string | null;
}

export interface CompetitorResponse {
  id: string;
  userId: string;
  channelId: string;
  title: string;
  customUrl?: string | null;
  description?: string | null;
  thumbnailUrl?: string | null;
  subscriberCount?: number | null;
  hiddenSubscriberCount: boolean;
  videoCount: number;
  viewCount: number;
  primaryChannelId?: string | null;
  notes?: string | null;
  lastSyncedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompetitorVideoItem {
  videoId: string;
  channelId: string;
  title: string;
  description?: string;
  publishedAt: string;
  relativePublished: string;
  thumbnailUrl?: string | null;
  duration?: string | null;
  durationSeconds?: number | null;
  viewCount: number;
  likeCount?: number | null;
  commentCount?: number | null;
  youtubeUrl: string;
}

export interface CompetitorUploadsResponse {
  competitorId: string;
  channelId: string;
  channelTitle: string;
  videos: CompetitorVideoItem[];
  totalResults: number;
  nextPageToken?: string | null;
  message?: string | null;
}

export interface ChannelMetricComparison {
  metricKey: string;
  label: string;
  userValue?: number | string | null;
  competitorValue?: number | string | null;
  diffPct?: number | null;
  note?: string | null;
}

export interface CompetitorComparisonResponse {
  userChannelId: string;
  userChannelTitle: string;
  competitorId: string;
  competitorChannelId: string;
  competitorTitle: string;
  metrics: ChannelMetricComparison[];
  userRecentVideos: CompetitorVideoItem[];
  competitorRecentVideos: CompetitorVideoItem[];
  privateDataDisclosure: string;
}
