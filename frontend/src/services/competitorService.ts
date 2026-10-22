import apiClient from './apiClient';
import { ensureAuthenticatedSession } from './youtubeService';
import type {
  CompetitorComparisonResponse,
  CompetitorCreate,
  CompetitorResponse,
  CompetitorSearchResponse,
  CompetitorUploadsResponse,
} from '../types/competitor';

export interface SearchCompetitorsParams {
  q: string;
  pageToken?: string;
  maxResults?: number;
  channelId?: string;
}

/**
 * Searches public YouTube channels by name, handle, or URL via backend Data API proxy.
 */
export async function searchCompetitors(
  params: SearchCompetitorsParams,
  signal?: AbortSignal
): Promise<CompetitorSearchResponse> {
  await ensureAuthenticatedSession();
  const queryParams: Record<string, string | number> = { q: params.q };
  if (params.pageToken) queryParams.page_token = params.pageToken;
  if (params.maxResults) queryParams.max_results = params.maxResults;
  if (params.channelId) queryParams.channel_id = params.channelId;

  const response = await apiClient.get<CompetitorSearchResponse>('/competitors/search', {
    params: queryParams,
    signal,
  });
  return response.data;
}

/**
 * Saves a competitor to the authenticated user's tracked list.
 */
export async function saveCompetitor(
  payload: CompetitorCreate,
  signal?: AbortSignal
): Promise<CompetitorResponse> {
  await ensureAuthenticatedSession();
  const response = await apiClient.post<CompetitorResponse>('/competitors', payload, {
    signal,
  });
  return response.data;
}

/**
 * Lists all tracked competitors for the authenticated user.
 */
export async function getCompetitors(
  channelId?: string,
  signal?: AbortSignal
): Promise<CompetitorResponse[]> {
  await ensureAuthenticatedSession();
  const params: Record<string, string> = {};
  if (channelId) params.channel_id = channelId;

  const response = await apiClient.get<CompetitorResponse[]>('/competitors', {
    params,
    signal,
  });
  return response.data;
}

/**
 * Retrieves details of a single tracked competitor.
 */
export async function getCompetitor(
  competitorId: string,
  signal?: AbortSignal
): Promise<CompetitorResponse> {
  await ensureAuthenticatedSession();
  const response = await apiClient.get<CompetitorResponse>(`/competitors/${competitorId}`, {
    signal,
  });
  return response.data;
}

/**
 * Removes a competitor from the user's tracked list.
 */
export async function deleteCompetitor(
  competitorId: string,
  signal?: AbortSignal
): Promise<void> {
  await ensureAuthenticatedSession();
  await apiClient.delete(`/competitors/${competitorId}`, {
    signal,
  });
}

/**
 * Retrieves the latest public uploads for a competitor channel.
 */
export async function getCompetitorUploads(
  competitorId: string,
  maxResults: number = 12,
  signal?: AbortSignal
): Promise<CompetitorUploadsResponse> {
  await ensureAuthenticatedSession();
  const response = await apiClient.get<CompetitorUploadsResponse>(
    `/competitors/${competitorId}/uploads`,
    {
      params: { max_results: maxResults },
      signal,
    }
  );
  return response.data;
}

/**
 * Compares the user's connected channel with a tracked competitor.
 */
export async function compareCompetitor(
  competitorId: string,
  channelId?: string,
  signal?: AbortSignal
): Promise<CompetitorComparisonResponse> {
  await ensureAuthenticatedSession();
  const params: Record<string, string> = {};
  if (channelId) params.channel_id = channelId;

  const response = await apiClient.get<CompetitorComparisonResponse>(
    `/competitors/${competitorId}/compare`,
    {
      params,
      signal,
    }
  );
  return response.data;
}

export default {
  searchCompetitors,
  saveCompetitor,
  getCompetitors,
  getCompetitor,
  deleteCompetitor,
  getCompetitorUploads,
  compareCompetitor,
};
