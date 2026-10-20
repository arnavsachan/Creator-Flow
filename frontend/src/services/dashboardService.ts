import apiClient from './apiClient';
import type { DashboardOverviewResponse } from '../types/dashboard';

/**
 * Fetches aggregated dashboard overview metrics from the FastAPI backend.
 * Reuses the existing apiClient instance configured in apiClient.ts.
 *
 * @param channelId Optional channel identifier (e.g. 'demo-channel-1')
 * @param signal Optional AbortSignal for request cancellation
 */
export async function getDashboardOverview(
  channelId?: string,
  days?: number,
  signal?: AbortSignal
): Promise<DashboardOverviewResponse> {
  const params: Record<string, string | number> = {};
  if (channelId) params.channel_id = channelId;
  if (days) params.days = days;
  const response = await apiClient.get<DashboardOverviewResponse>('/dashboard/overview', {
    params: Object.keys(params).length > 0 ? params : undefined,
    signal,
  });
  return response.data;
}

export default {
  getDashboardOverview,
};
