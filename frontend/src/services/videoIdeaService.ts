import apiClient from './apiClient';
import { ensureAuthenticatedSession } from './youtubeService';
import type {
  GenerateIdeasPayload,
  GenerateIdeasResponse,
  GenerateSeoPayload,
  GenerateSeoResponse,
  SaveIdeaPayload,
  SavedIdea,
  UpdateIdeaPayload,
} from '../types/videoIdea';

/**
 * Generates distinct video concepts with hooks and keywords using Gemini AI.
 */
export async function generateVideoIdeas(
  payload: GenerateIdeasPayload,
  signal?: AbortSignal
): Promise<GenerateIdeasResponse> {
  await ensureAuthenticatedSession();
  const response = await apiClient.post<GenerateIdeasResponse>(
    '/ideas/generate',
    payload,
    { signal }
  );
  return response.data;
}

/**
 * Generates an SEO optimization kit (titles, description, tags, keywords, thumbnail text) using Gemini AI.
 */
export async function generateSeoKit(
  payload: GenerateSeoPayload,
  signal?: AbortSignal
): Promise<GenerateSeoResponse> {
  await ensureAuthenticatedSession();
  const response = await apiClient.post<GenerateSeoResponse>(
    '/ideas/generate-seo',
    payload,
    { signal }
  );
  return response.data;
}

/**
 * Persists a video idea for the authenticated user.
 */
export async function saveVideoIdea(
  payload: SaveIdeaPayload,
  signal?: AbortSignal
): Promise<SavedIdea> {
  await ensureAuthenticatedSession();
  const response = await apiClient.post<SavedIdea>('/ideas', payload, { signal });
  return response.data;
}

/**
 * Lists all saved ideas for the user with optional filters.
 */
export async function listSavedIdeas(
  params?: {
    channelId?: string;
    isFavorite?: boolean;
    search?: string;
  },
  signal?: AbortSignal
): Promise<SavedIdea[]> {
  await ensureAuthenticatedSession();
  const queryParams: Record<string, any> = {};
  if (params?.channelId) queryParams.channel_id = params.channelId;
  if (params?.isFavorite !== undefined) queryParams.is_favorite = params.isFavorite;
  if (params?.search) queryParams.search = params.search;

  const response = await apiClient.get<SavedIdea[]>('/ideas', {
    params: queryParams,
    signal,
  });
  return response.data;
}

/**
 * Retrieves a single saved video idea by ID.
 */
export async function getSavedIdea(
  id: string,
  signal?: AbortSignal
): Promise<SavedIdea> {
  await ensureAuthenticatedSession();
  const response = await apiClient.get<SavedIdea>(`/ideas/${id}`, { signal });
  return response.data;
}

/**
 * Updates editable fields, favorite status, or notes on a saved idea.
 */
export async function updateSavedIdea(
  id: string,
  payload: UpdateIdeaPayload,
  signal?: AbortSignal
): Promise<SavedIdea> {
  await ensureAuthenticatedSession();
  const response = await apiClient.patch<SavedIdea>(`/ideas/${id}`, payload, { signal });
  return response.data;
}

/**
 * Deletes a saved video idea.
 */
export async function deleteSavedIdea(
  id: string,
  signal?: AbortSignal
): Promise<void> {
  await ensureAuthenticatedSession();
  await apiClient.delete(`/ideas/${id}`, { signal });
}

export default {
  generateVideoIdeas,
  generateSeoKit,
  saveVideoIdea,
  listSavedIdeas,
  getSavedIdea,
  updateSavedIdea,
  deleteSavedIdea,
};
