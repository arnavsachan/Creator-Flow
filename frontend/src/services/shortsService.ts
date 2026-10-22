import apiClient, { type NormalizedApiError } from './apiClient';
import type {
  CreateClipRequest,
  GenerateHighlightsRequest,
  GenerateHighlightsResponse,
  HighlightsData,
  HighlightsResponse,
  ShortsClip,
  ShortsClipResponse,
  ShortsJob,
  ShortsJobListResponse,
  ShortsJobResponse,
  TranscriptData,
  TranscriptResponse,
} from '../types/shorts';

export const ERROR_MESSAGES: Record<string, string> = {
  FILE_TOO_LARGE: 'File exceeds the maximum upload limit (500MB).',
  UNSUPPORTED_FORMAT: 'Unsupported format. Allowed formats: .mp4, .mov, .mkv, .webm.',
  INVALID_MEDIA: 'Invalid or unreadable video file. Please verify the media file.',
  DURATION_EXCEEDED: 'Video exceeds maximum duration limit (60 minutes).',
  INVALID_RANGE: 'Invalid clip time range. Ensure 0 <= start < end <= duration and length <= 180s.',
  JOB_NOT_FOUND: 'Video job not found.',
  CLIP_NOT_FOUND: 'Clip not found.',
  PROCESSING_FAILED: 'Video trimming failed. Please try again.',
  CLIP_BUSY: 'Wait until this clip finishes processing before deleting.',
  INVALID_ASPECT: 'Invalid output aspect ratio selected.',
  FEATURE_DISABLED: 'Shorts Clipper is disabled in this environment.',
  TRANSCRIPTION_UNAVAILABLE: 'Local speech transcription package is not installed on this machine.',
  TRANSCRIPTION_BUSY: 'Another transcription is currently in progress. Please wait.',
  NO_AUDIO_STREAM: 'Video does not contain an audio stream to transcribe.',
  MODEL_DOWNLOAD_FAILED: 'Failed to download speech recognition model. Please check your internet connection.',
  INTERRUPTED: 'Process was interrupted by a previous server restart. Please retry.',
  AI_NOT_CONFIGURED: 'AI is not configured on this server.',
  AI_AUTH_FAILED: 'AI authentication failed. Please verify provider credentials.',
  AI_RATE_LIMITED: 'AI service rate limit reached. Please try again shortly.',
  AI_TIMEOUT: 'AI request timed out. Please try again.',
  AI_UNAVAILABLE: 'AI service is currently unavailable. Please try again.',
  AI_BAD_RESPONSE: 'AI returned an invalid response. Please retry.',
  TRANSCRIPT_REQUIRED: 'A completed transcript is required before finding highlights.',
  HIGHLIGHTS_BUSY: 'Another highlight analysis is currently in progress. Please wait.',
  SUGGESTION_NOT_FOUND: 'One or more selected highlight suggestions were not found.',
};

export function getFriendlyErrorMessage(err: unknown): string {
  const apiError = err as NormalizedApiError | undefined;
  if (!apiError) return 'An unexpected error occurred.';

  // Check if error code or message matches known stable codes
  const code = apiError.code || apiError.message;
  if (code && ERROR_MESSAGES[code]) {
    return ERROR_MESSAGES[code];
  }

  // Check if detail message starts with or contains known code
  for (const [key, msg] of Object.entries(ERROR_MESSAGES)) {
    if (apiError.message?.includes(key)) {
      return msg;
    }
  }

  return apiError.message || 'An unexpected error occurred.';
}

export function getSourcePreviewUrl(jobId: string): string {
  const base = (apiClient.defaults.baseURL || '').replace(/\/+$/, '');
  return `${base}/shorts/jobs/${jobId}/source`;
}

export function getClipDownloadUrl(jobId: string, clipId: string): string {
  const base = (apiClient.defaults.baseURL || '').replace(/\/+$/, '');
  return `${base}/shorts/jobs/${jobId}/clips/${clipId}/download`;
}

export async function uploadJob(
  file: File,
  onUploadProgress?: (progressEventProgress: number) => void,
  signal?: AbortSignal
): Promise<ShortsJob> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiClient.post<ShortsJobResponse>('/shorts/jobs', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    signal,
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total && onUploadProgress) {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onUploadProgress(percent);
      }
    },
  });

  if (!response.data.data) {
    throw new Error('Upload succeeded but server returned empty job data.');
  }
  return response.data.data;
}

export async function listJobs(signal?: AbortSignal): Promise<ShortsJob[]> {
  const response = await apiClient.get<ShortsJobListResponse>('/shorts/jobs', { signal });
  return response.data.data || [];
}

export async function getJob(jobId: string, signal?: AbortSignal): Promise<ShortsJob> {
  const response = await apiClient.get<ShortsJobResponse>(`/shorts/jobs/${jobId}`, { signal });
  if (!response.data.data) {
    throw new Error('Job not found.');
  }
  return response.data.data;
}

export async function createClip(
  jobId: string,
  request: CreateClipRequest,
  signal?: AbortSignal
): Promise<ShortsClip> {
  const response = await apiClient.post<ShortsClipResponse>(
    `/shorts/jobs/${jobId}/clips`,
    request,
    { signal }
  );
  if (!response.data.data) {
    throw new Error('Clip creation succeeded but server returned empty data.');
  }
  return response.data.data;
}

export async function getClip(
  jobId: string,
  clipId: string,
  signal?: AbortSignal
): Promise<ShortsClip> {
  const response = await apiClient.get<ShortsClipResponse>(
    `/shorts/jobs/${jobId}/clips/${clipId}`,
    { signal }
  );
  if (!response.data.data) {
    throw new Error('Clip not found.');
  }
  return response.data.data;
}

export async function deleteJob(jobId: string, signal?: AbortSignal): Promise<void> {
  await apiClient.delete(`/shorts/jobs/${jobId}`, { signal });
}

export async function deleteClip(
  jobId: string,
  clipId: string,
  signal?: AbortSignal
): Promise<void> {
  await apiClient.delete(`/shorts/jobs/${jobId}/clips/${clipId}`, { signal });
}

export async function startTranscription(
  jobId: string,
  signal?: AbortSignal
): Promise<TranscriptData> {
  const response = await apiClient.post<TranscriptResponse>(
    `/shorts/jobs/${jobId}/transcribe`,
    {},
    { signal }
  );
  if (!response.data.data) {
    throw new Error('Transcription start succeeded but server returned empty data.');
  }
  return response.data.data;
}

export async function getTranscript(
  jobId: string,
  signal?: AbortSignal
): Promise<TranscriptData> {
  const response = await apiClient.get<TranscriptResponse>(
    `/shorts/jobs/${jobId}/transcript`,
    { signal }
  );
  if (!response.data.data) {
    throw new Error('Transcript request succeeded but server returned empty data.');
  }
  return response.data.data;
}

export async function startHighlights(
  jobId: string,
  signal?: AbortSignal
): Promise<HighlightsData> {
  const response = await apiClient.post<HighlightsResponse>(
    `/shorts/jobs/${jobId}/highlights`,
    {},
    { signal }
  );
  if (!response.data.data) {
    throw new Error('Highlights request succeeded but server returned empty data.');
  }
  return response.data.data;
}

export async function getHighlights(
  jobId: string,
  signal?: AbortSignal
): Promise<HighlightsData> {
  const response = await apiClient.get<HighlightsResponse>(
    `/shorts/jobs/${jobId}/highlights`,
    { signal }
  );
  if (!response.data.data) {
    throw new Error('Highlights request succeeded but server returned empty data.');
  }
  return response.data.data;
}

export async function generateHighlightClips(
  jobId: string,
  request: GenerateHighlightsRequest,
  signal?: AbortSignal
): Promise<ShortsClip[]> {
  const response = await apiClient.post<GenerateHighlightsResponse>(
    `/shorts/jobs/${jobId}/highlights/generate`,
    request,
    { signal }
  );
  return response.data.data || [];
}
