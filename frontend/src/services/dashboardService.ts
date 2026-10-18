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
  signal?: AbortSignal
): Promise<DashboardOverviewResponse> {
  const params = channelId ? { channel_id: channelId } : undefined;
  const response = await apiClient.get<DashboardOverviewResponse>('/dashboard/overview', {
    params,
    signal,
  });
  return response.data;
}

export default {
  getDashboardOverview,
};
