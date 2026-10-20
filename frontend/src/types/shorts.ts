import type { EnvelopeResponse } from './dataStates';

export type AspectRatio =
  | 'original'
  | 'vertical_9_16'
  | 'square_1_1'
  | 'portrait_4_5'
  | 'landscape_16_9';
export type JobStatus = 'uploaded' | 'failed';
export type ClipStatus = 'queued' | 'processing' | 'done' | 'failed';

export interface ShortsClip {
  id: string;
  jobId: string;
  startSeconds: number;
  endSeconds: number;
  aspect: AspectRatio;
  status: ClipStatus;
  errorCode: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface ShortsJob {
  id: string;
  ownerId: string | null;
  originalFilename: string;
  sizeBytes: number;
  durationSeconds: number;
  width: number;
  height: number;
  status: JobStatus;
  errorCode: string | null;
  createdAt: string;
  clips: ShortsClip[];
}

export interface CreateClipRequest {
  start_seconds: number;
  end_seconds: number;
  aspect: AspectRatio;
}

export type ShortsJobResponse = EnvelopeResponse<ShortsJob>;
export type ShortsJobListResponse = EnvelopeResponse<ShortsJob[]>;
export type ShortsClipResponse = EnvelopeResponse<ShortsClip>;
