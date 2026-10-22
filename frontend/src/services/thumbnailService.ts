import apiClient, { normalizeApiError } from './apiClient';
import type {
  ThumbnailScoringRequest,
  ThumbnailScoringResponse,
  TitleScoringRequest,
  TitleScoringResponse,
} from '../types/thumbnails';

export const MAX_THUMBNAIL_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Validates file type and size according to Creator-Flow conventions.
 * Throws a human-readable Error if validation fails.
 */
export function validateThumbnailFile(file: File): void {
  if (!file) {
    throw new Error('Please select an image file to upload.');
  }

  if (file.size === 0) {
    throw new Error('The selected image file is empty (0 bytes).');
  }

  if (file.size > MAX_THUMBNAIL_FILE_SIZE) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(
      `File size (${sizeMb} MB) exceeds maximum allowed limit of 10 MB. Please upload a smaller image.`
    );
  }

  // Check MIME type or filename extension
  const hasValidMime = ALLOWED_IMAGE_TYPES.includes(file.type.toLowerCase());
  const hasValidExt = /\.(jpe?g|png|webp)$/i.test(file.name);

  if (!hasValidMime && !hasValidExt) {
    throw new Error(
      'Unsupported file format. Please upload a JPEG, PNG, or WebP image.'
    );
  }
}

/**
 * Converts a browser File object to a Base64 data URL string.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read image as data URL.'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

export const THUMBNAIL_SCORING_TIMEOUT_MS = 30000; // 30s coordinated budget (25s Gemini SDK + 5s network/serialization buffer)
export const TITLE_SCORING_TIMEOUT_MS = 20000; // 20s coordinated budget (15s Gemini SDK + 5s network/serialization buffer)

/**
 * Submits an uploaded thumbnail to the backend scoring endpoint.
 *
 * @param file Browser File object (JPEG, PNG, WebP)
 * @param options Optional paired title and topic for alignment analysis
 * @param signal Optional AbortSignal for request cancellation
 */
export async function scoreThumbnail(
  file: File,
  options?: { title?: string; topic?: string; allowFallback?: boolean },
  signal?: AbortSignal
): Promise<ThumbnailScoringResponse> {
  validateThumbnailFile(file);
  const base64Data = await fileToBase64(file);

  const payload: ThumbnailScoringRequest = {
    imageBase64: base64Data,
    filename: file.name,
    title: options?.title?.trim() || undefined,
    topic: options?.topic?.trim() || undefined,
    allowFallback: options?.allowFallback ?? false,
  };

  try {
    const response = await apiClient.post<ThumbnailScoringResponse>(
      '/thumbnails/score',
      payload,
      { signal, timeout: THUMBNAIL_SCORING_TIMEOUT_MS }
    );
    return response.data;
  } catch (err: any) {
    const backendDetail = err?.response?.data?.detail;
    if (backendDetail && typeof backendDetail === 'string') {
      const customErr = new Error(backendDetail);
      if (err.response.status === 504) {
        (customErr as any).isTimeout = true;
      }
      throw customErr;
    }

    const isTimeout =
      err?.code === 'ECONNABORTED' ||
      err?.message?.toLowerCase().includes('timeout') ||
      err?.response?.status === 504;

    if (isTimeout) {
      const timeoutError = new Error(
        'Thumbnail scoring request timed out. The AI model is taking longer than expected. Your image is preserved—please click Analyze to retry.'
      );
      (timeoutError as any).code = 'ECONNABORTED';
      (timeoutError as any).isTimeout = true;
      throw timeoutError;
    }

    const normalized = normalizeApiError(err);
    throw new Error(normalized.message);
  }
}

/**
 * Submits a proposed video title to the backend title scoring endpoint.
 *
 * @param payload Title scoring request with title and optional topic/description
 * @param signal Optional AbortSignal for request cancellation
 */
export async function scoreTitle(
  payload: TitleScoringRequest,
  signal?: AbortSignal
): Promise<TitleScoringResponse> {
  const trimmedTitle = payload.title?.trim();
  if (!trimmedTitle) {
    throw new Error('Please enter a video title to score.');
  }

  if (trimmedTitle.length > 200) {
    throw new Error('Title cannot exceed 200 characters.');
  }

  try {
    const response = await apiClient.post<TitleScoringResponse>(
      '/thumbnails/score-title',
      {
        ...payload,
        title: trimmedTitle,
        allowFallback: payload.allowFallback ?? false,
      },
      { signal, timeout: TITLE_SCORING_TIMEOUT_MS }
    );
    return response.data;
  } catch (err: any) {
    const backendDetail = err?.response?.data?.detail;
    if (backendDetail && typeof backendDetail === 'string') {
      const customErr = new Error(backendDetail);
      if (err.response.status === 504) {
        (customErr as any).isTimeout = true;
      }
      throw customErr;
    }

    const isTimeout =
      err?.code === 'ECONNABORTED' ||
      err?.message?.toLowerCase().includes('timeout') ||
      err?.response?.status === 504;

    if (isTimeout) {
      const timeoutError = new Error(
        'Title scoring request timed out. Please click Evaluate to retry.'
      );
      (timeoutError as any).code = 'ECONNABORTED';
      (timeoutError as any).isTimeout = true;
      throw timeoutError;
    }

    const normalized = normalizeApiError(err);
    throw new Error(normalized.message);
  }
}

export default {
  validateThumbnailFile,
  fileToBase64,
  scoreThumbnail,
  scoreTitle,
};
