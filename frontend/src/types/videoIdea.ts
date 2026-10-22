export type ContentFormat = 'long_form' | 'shorts';

export interface GeneratedIdeaItem {
  title: string;
  summary: string;
  targetAudience: string;
  hook: string;
  primaryKeyword: string;
  relatedKeywords: string[];
  contentFormat: string;
  callToAction: string;
  angle: string;
  estimatedScore: number;
  scoreExplanation: string;
}

export interface GenerateIdeasPayload {
  topic: string;
  niche?: string;
  targetAudience?: string;
  language?: string;
  platform?: string;
  contentFormat?: ContentFormat;
  tone?: string;
  contentGoals?: string;
  channelId?: string;
  count?: number;
}

export interface GenerateIdeasResponse {
  topic: string;
  ideas: GeneratedIdeaItem[];
  disclaimer: string;
}

export interface TitleVariation {
  title: string;
  style: string;
  rationale: string;
}

export interface GenerateSeoPayload {
  title: string;
  topic?: string;
  summary?: string;
  targetAudience?: string;
  contentFormat?: string;
  language?: string;
  channelId?: string;
}

export interface GenerateSeoResponse {
  title: string;
  titleVariations: TitleVariation[];
  description: string;
  tags: string[];
  hashtags: string[];
  primaryKeyword: string;
  secondaryKeywords: string[];
  thumbnailTextSuggestions: string[];
  estimatedSeoScore: number;
  scoreExplanation: string;
  optimizationRationale: string;
  disclaimer: string;
}

export interface SaveIdeaPayload {
  title: string;
  summary?: string;
  topic: string;
  niche?: string;
  targetAudience?: string;
  language?: string;
  platform?: string;
  contentFormat?: string;
  tone?: string;
  contentGoals?: string;
  hook?: string;
  primaryKeyword?: string;
  relatedKeywords?: string[];
  callToAction?: string;
  estimatedScore?: number;
  angle?: string;
  isFavorite?: boolean;
  status?: string;
  seoData?: Record<string, any>;
  notes?: string;
  channelId?: string;
}

export interface UpdateIdeaPayload {
  title?: string;
  summary?: string;
  topic?: string;
  niche?: string;
  targetAudience?: string;
  language?: string;
  platform?: string;
  contentFormat?: string;
  tone?: string;
  contentGoals?: string;
  hook?: string;
  primaryKeyword?: string;
  relatedKeywords?: string[];
  callToAction?: string;
  estimatedScore?: number;
  angle?: string;
  isFavorite?: boolean;
  status?: string;
  seoData?: Record<string, any>;
  notes?: string;
}

export interface SavedIdea {
  id: string;
  userId: string;
  channelId?: string | null;
  title: string;
  summary?: string | null;
  topic: string;
  niche?: string | null;
  targetAudience?: string | null;
  language: string;
  platform: string;
  contentFormat: string;
  tone?: string | null;
  contentGoals?: string | null;
  hook?: string | null;
  primaryKeyword?: string | null;
  relatedKeywords: string[];
  callToAction?: string | null;
  estimatedScore?: number | null;
  angle?: string | null;
  isFavorite: boolean;
  status: string;
  seoData?: Record<string, any> | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}
