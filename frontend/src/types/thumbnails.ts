export interface ImageMetadata {
  width: number;
  height: number;
  aspectRatio: string;
  fileFormat: string;
  fileSizeBytes: number;
  isRecommendedResolution: boolean;
}

export type CriterionGrade = 'Excellent' | 'Good' | 'Needs Improvement' | 'Poor';

export interface ThumbnailCriterionScore {
  name: string;
  score: number;
  grade: CriterionGrade;
  reasoning: string;
  suggestions: string[];
}

export interface ThumbnailScoringRequest {
  imageBase64: string;
  filename?: string;
  title?: string;
  topic?: string;
  allowFallback?: boolean;
}

export interface ThumbnailScoringResponse {
  overallScore: number;
  grade: string;
  focalPoint: string;
  contrastRatio: string;
  criteria: ThumbnailCriterionScore[];
  suggestions: string[];
  warnings: string[];
  metadata: ImageMetadata;
  provider: string;
  providerNote: string;
  evaluatedAt: string;
}

export interface TitleCriterionScore {
  name: string;
  score: number;
  grade: CriterionGrade;
  reasoning: string;
  suggestions: string[];
}

export interface TitleScoringRequest {
  title: string;
  topic?: string;
  description?: string;
  thumbnailContext?: string;
  allowFallback?: boolean;
}

export interface TitleScoringResponse {
  overallScore: number;
  grade: string;
  clarityScore: number;
  specificityScore: number;
  curiosityScore: number;
  readabilityScore: number;
  relevanceScore?: number | null;
  criteria: TitleCriterionScore[];
  explanations: string[];
  suggestions: string[];
  alternativeTitles: string[];
  characterCount: number;
  wordCount: number;
  provider: string;
  providerNote: string;
  evaluatedAt: string;
}
