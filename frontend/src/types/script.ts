export type HookArchetype = 'negative' | 'curiosity' | 'story';
export type ContentFormat = 'long_form' | 'short';

export interface HookVariation {
  archetype: HookArchetype;
  hookText: string;
  estimatedRetentionScore: number;
  rationale: string;
}

export interface GenerateHooksPayload {
  topic: string;
  audiencePersona?: string;
  tone?: string;
  channelId?: string;
}

export interface GenerateHooksResponse {
  topic: string;
  hooks: HookVariation[];
  disclaimer: string;
}

export interface ScriptSection {
  timecode: string;
  sectionType: string;
  content: string;
  visualCue?: string;
}

export interface GenerateScriptPayload {
  topic: string;
  targetDuration?: string;
  tone?: string;
  audiencePersona?: string;
  hookType?: HookArchetype;
  selectedHook?: string;
  format?: ContentFormat;
  channelId?: string;
}

export interface GenerateScriptResponse {
  title: string;
  topic: string;
  targetDuration: string;
  tone: string;
  audiencePersona?: string;
  hookType: string;
  hookText: string;
  fullScript: string;
  estimatedRetentionScore: number;
  sections?: ScriptSection[];
  disclaimer: string;
}

export interface AuditRetentionPayload {
  scriptText: string;
  targetDuration?: string;
  channelId?: string;
}

export interface RetentionAuditResponse {
  estimatedRetentionScore: number;
  retentionTier: string;
  wordCount: number;
  estimatedDurationSeconds: number;
  formattedDuration: string;
  pacingWpm: number;
  hookDetected: boolean;
  first30sAnalysis: string;
  strengths: string[];
  dropOffRisks: string[];
  pacingRecommendations: string[];
  disclaimer: string;
}

export interface SaveScriptPayload {
  title: string;
  topic: string;
  targetDuration?: string;
  tone?: string;
  audiencePersona?: string;
  hookType?: string;
  hookText?: string;
  fullScript: string;
  estimatedRetentionScore?: number;
  pacingBreakdown?: string;
  channelId?: string;
}

export interface SavedScript {
  id: string;
  userId: string;
  channelId?: string | null;
  title: string;
  topic: string;
  targetDuration: string;
  tone: string;
  audiencePersona?: string | null;
  hookType: string;
  hookText?: string | null;
  fullScript: string;
  estimatedRetentionScore?: number | null;
  pacingBreakdown?: string | null;
  createdAt: string;
  updatedAt: string;
}
