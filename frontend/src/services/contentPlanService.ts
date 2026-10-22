import apiClient from './apiClient';
import { ensureAuthenticatedSession } from './youtubeService';
import type {
  ContentCalendarResponse,
  ContentPlanItem,
  CreateContentPlanPayload,
  UpdateContentPlanPayload,
} from '../types/contentPlan';

/**
 * Fetches unified calendar items (planned content + confirmed published YouTube videos).
 */
export async function getCalendar(
  params?: {
    channelId?: string;
    startDate?: string;
    endDate?: string;
    includePublished?: boolean;
  },
  signal?: AbortSignal
): Promise<ContentCalendarResponse> {
  await ensureAuthenticatedSession();
  const queryParams: Record<string, string | boolean> = {};
  if (params?.channelId) queryParams.channel_id = params.channelId;
  if (params?.startDate) queryParams.start_date = params.startDate;
  if (params?.endDate) queryParams.end_date = params.endDate;
  if (params?.includePublished !== undefined) queryParams.include_published = params.includePublished;

  const response = await apiClient.get<ContentCalendarResponse>('/content-plans/calendar', {
    params: queryParams,
    signal,
  });
  return response.data;
}

/**
 * Retrieves planned content items with optional channel/stage filtering.
 */
export async function listPlans(
  params?: {
    channelId?: string;
    stage?: string;
    startDate?: string;
    endDate?: string;
  },
  signal?: AbortSignal
): Promise<ContentPlanItem[]> {
  await ensureAuthenticatedSession();
  const queryParams: Record<string, string> = {};
  if (params?.channelId) queryParams.channel_id = params.channelId;
  if (params?.stage) queryParams.stage = params.stage;
  if (params?.startDate) queryParams.start_date = params.startDate;
  if (params?.endDate) queryParams.end_date = params.endDate;

  const response = await apiClient.get<ContentPlanItem[]>('/content-plans', {
    params: queryParams,
    signal,
  });
  return response.data;
}

/**
 * Creates a new planned content item in the calendar.
 */
export async function createPlan(
  payload: CreateContentPlanPayload,
  signal?: AbortSignal
): Promise<ContentPlanItem> {
  await ensureAuthenticatedSession();
  const response = await apiClient.post<ContentPlanItem>('/content-plans', payload, {
    signal,
  });
  return response.data;
}

/**
 * Updates an existing planned content item.
 */
export async function updatePlan(
  id: string,
  payload: UpdateContentPlanPayload,
  signal?: AbortSignal
): Promise<ContentPlanItem> {
  await ensureAuthenticatedSession();
  const response = await apiClient.patch<ContentPlanItem>(`/content-plans/${id}`, payload, {
    signal,
  });
  return response.data;
}

/**
 * Deletes a planned content item.
 */
export async function deletePlan(
  id: string,
  signal?: AbortSignal
): Promise<{ success: boolean; message: string }> {
  await ensureAuthenticatedSession();
  const response = await apiClient.delete<{ success: boolean; message: string }>(`/content-plans/${id}`, {
    signal,
  });
  return response.data;
}

export default {
  getCalendar,
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
};
