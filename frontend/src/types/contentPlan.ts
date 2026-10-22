export type ContentType = 'Long-form' | 'Short' | 'Community Post' | 'Livestream' | 'Reel';

export type ContentStage = 'Idea' | 'Scripting' | 'Editing' | 'Ready' | 'Published';

export type PlatformType = 'youtube' | 'shorts' | 'twitter' | 'linkedin' | 'tiktok' | 'instagram';

export interface ContentPlanItem {
  id: string;
  userId: string;
  channelId?: string | null;
  title: string;
  description?: string | null;
  contentType: ContentType;
  platform: PlatformType;
  stage: ContentStage;
  scheduledAt: string;
  notes?: string | null;
  videoId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContentCalendarItem {
  id: string;
  item_type: 'planned' | 'published';
  title: string;
  description?: string | null;
  content_type: string;
  platform: string;
  stage: string;
  date: string;
  video_id?: string | null;
  thumbnail_url?: string | null;
  duration?: string | null;
  view_count?: number | null;
  like_count?: number | null;
  notes?: string | null;
  channel_id?: string | null;
  is_live_verified: boolean;
}

export interface ContentCalendarResponse {
  items: ContentCalendarItem[];
  total_planned: number;
  total_published: number;
  stage_counts: Record<string, number>;
  channel_id?: string | null;
}

export interface CreateContentPlanPayload {
  title: string;
  description?: string;
  content_type?: string;
  platform?: string;
  stage?: string;
  scheduled_at: string;
  notes?: string;
  channel_id?: string;
  video_id?: string;
}

export interface UpdateContentPlanPayload {
  title?: string;
  description?: string;
  content_type?: string;
  platform?: string;
  stage?: string;
  scheduled_at?: string;
  notes?: string;
  channel_id?: string;
  video_id?: string;
}
