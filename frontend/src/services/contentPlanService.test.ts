import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCalendar,
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
} from './contentPlanService';
import apiClient from './apiClient';

vi.mock('./apiClient', () => {
  const mockClient = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
  return {
    default: mockClient,
    apiClient: mockClient,
  };
});

vi.mock('./youtubeService', () => ({
  ensureAuthenticatedSession: vi.fn().mockResolvedValue('mock_token'),
}));

describe('contentPlanService Tests', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('calls getCalendar with proper query parameters', async () => {
    const mockResponse = {
      items: [
        {
          id: 'p1',
          item_type: 'planned',
          title: 'Test Plan',
          description: 'Desc',
          content_type: 'Long-form',
          platform: 'youtube',
          stage: 'Idea',
          date: '2026-10-15T14:00:00Z',
          is_live_verified: false,
        },
      ],
      total_planned: 1,
      total_published: 0,
      stage_counts: { Idea: 1 },
      channel_id: 'ch1',
    };

    vi.mocked(apiClient.get).mockResolvedValue({ data: mockResponse } as any);

    const result = await getCalendar({
      channelId: 'ch1',
      startDate: '2026-10-01T00:00:00Z',
      endDate: '2026-10-31T23:59:59Z',
      includePublished: true,
    });

    expect(apiClient.get).toHaveBeenCalledWith('/content-plans/calendar', {
      params: {
        channel_id: 'ch1',
        start_date: '2026-10-01T00:00:00Z',
        end_date: '2026-10-31T23:59:59Z',
        include_published: true,
      },
      signal: undefined,
    });
    expect(result.total_planned).toBe(1);
    expect(result.items[0].title).toBe('Test Plan');
  });

  it('calls createPlan with payload', async () => {
    const mockCreated = {
      id: 'p2',
      userId: 'u1',
      channelId: 'ch1',
      title: 'New Video Plan',
      description: 'Test description',
      contentType: 'Long-form',
      platform: 'youtube',
      stage: 'Idea',
      scheduledAt: '2026-10-25T14:00:00Z',
      notes: 'Notes here',
      videoId: null,
      createdAt: '2026-10-20T00:00:00Z',
      updatedAt: '2026-10-20T00:00:00Z',
    };

    vi.mocked(apiClient.post).mockResolvedValue({ data: mockCreated } as any);

    const result = await createPlan({
      title: 'New Video Plan',
      description: 'Test description',
      content_type: 'Long-form',
      platform: 'youtube',
      stage: 'Idea',
      scheduled_at: '2026-10-25T14:00:00Z',
      notes: 'Notes here',
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/content-plans',
      expect.objectContaining({
        title: 'New Video Plan',
        scheduled_at: '2026-10-25T14:00:00Z',
      }),
      { signal: undefined }
    );
    expect(result.id).toBe('p2');
    expect(result.title).toBe('New Video Plan');
  });

  it('calls updatePlan with patch payload', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: {
        id: 'p2',
        title: 'Updated Plan',
        stage: 'Editing',
      },
    } as any);

    const result = await updatePlan('p2', {
      title: 'Updated Plan',
      stage: 'Editing',
    });

    expect(apiClient.patch).toHaveBeenCalledWith(
      '/content-plans/p2',
      {
        title: 'Updated Plan',
        stage: 'Editing',
      },
      { signal: undefined }
    );
    expect(result.title).toBe('Updated Plan');
  });

  it('calls deletePlan with plan id', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({
      data: {
        success: true,
        message: 'Deleted successfully',
      },
    } as any);

    const result = await deletePlan('p2');

    expect(apiClient.delete).toHaveBeenCalledWith('/content-plans/p2', { signal: undefined });
    expect(result.success).toBe(true);
  });

  it('calls listPlans with filter parameters', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [{ id: 'p1', title: 'Plan 1' }],
    } as any);

    const result = await listPlans({ channelId: 'ch1', stage: 'Idea' });
    expect(apiClient.get).toHaveBeenCalledWith('/content-plans', {
      params: { channel_id: 'ch1', stage: 'Idea' },
      signal: undefined,
    });
    expect(result).toHaveLength(1);
  });
});
