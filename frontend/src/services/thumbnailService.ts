import apiClient from './apiClient';
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

/**
 * Submits an uploaded thumbnail to the backend scoring endpoint.
 *
 * @param file Browser File object (JPEG, PNG, WebP)
 * @param options Optional paired title and topic for alignment analysis
 * @param signal Optional AbortSignal for request cancellation
 */
export async function scoreThumbnail(
  file: File,
  options?: { title?: string; topic?: string },
  signal?: AbortSignal
): Promise<ThumbnailScoringResponse> {
  validateThumbnailFile(file);
  const base64Data = await fileToBase64(file);

  const payload: ThumbnailScoringRequest = {
    imageBase64: base64Data,
    filename: file.name,
    title: options?.title?.trim() || undefined,
    topic: options?.topic?.trim() || undefined,
  };

  const response = await apiClient.post<ThumbnailScoringResponse>(
    '/thumbnails/score',
    payload,
    { signal }
  );
  return response.data;
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

  const response = await apiClient.post<TitleScoringResponse>(
    '/thumbnails/score-title',
    {
      ...payload,
      title: trimmedTitle,
    },
    { signal }
  );
  return response.data;
}

export default {
  validateThumbnailFile,
  fileToBase64,
  scoreThumbnail,
  scoreTitle,
};
