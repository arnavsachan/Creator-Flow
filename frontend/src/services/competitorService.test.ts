import { describe, expect, it, vi, beforeEach } from 'vitest';
import apiClient from './apiClient';
import {
  compareCompetitor,
  deleteCompetitor,
  getCompetitor,
  getCompetitors,
  getCompetitorUploads,
  saveCompetitor,
  searchCompetitors,
} from './competitorService';

vi.mock('./apiClient', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('./youtubeService', () => ({
  ensureAuthenticatedSession: vi.fn().mockResolvedValue('mock_token'),
}));

describe('competitorService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('searchCompetitors calls /competitors/search with parameters', async () => {
    const mockResponse = {
      data: {
        query: 'Tech',
        results: [
          {
            channelId: 'UC_123',
            title: 'Tech Reviewer',
            subscriberCount: 50000,
            videoCount: 120,
            viewCount: 2000000,
            isTracked: false,
          },
        ],
        totalResults: 1,
        dataState: 'LIVE',
      },
    };

    (apiClient.get as any).mockResolvedValueOnce(mockResponse);

    const result = await searchCompetitors({ q: 'Tech', maxResults: 10 });

    expect(apiClient.get).toHaveBeenCalledWith('/competitors/search', {
      params: { q: 'Tech', max_results: 10 },
      signal: undefined,
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].channelId).toBe('UC_123');
  });

  it('saveCompetitor calls POST /competitors with payload', async () => {
    const mockCreated = {
      data: {
        id: 'comp_1',
        userId: 'user_1',
        channelId: 'UC_123',
        title: 'Tech Reviewer',
        subscriberCount: 50000,
        videoCount: 120,
        viewCount: 2000000,
        hiddenSubscriberCount: false,
        createdAt: '2026-10-22T10:00:00Z',
        updatedAt: '2026-10-22T10:00:00Z',
      },
    };

    (apiClient.post as any).mockResolvedValueOnce(mockCreated);

    const result = await saveCompetitor({
      channelId: 'UC_123',
      title: 'Tech Reviewer',
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/competitors',
      { channelId: 'UC_123', title: 'Tech Reviewer' },
      { signal: undefined }
    );
    expect(result.id).toBe('comp_1');
    expect(result.channelId).toBe('UC_123');
  });

  it('getCompetitors calls GET /competitors with optional channelId', async () => {
    const mockList = {
      data: [
        {
          id: 'comp_1',
          channelId: 'UC_123',
          title: 'Competitor A',
        },
      ],
    };

    (apiClient.get as any).mockResolvedValueOnce(mockList);

    const result = await getCompetitors('chan_user_1');

    expect(apiClient.get).toHaveBeenCalledWith('/competitors', {
      params: { channel_id: 'chan_user_1' },
      signal: undefined,
    });
    expect(result).toHaveLength(1);
  });

  it('getCompetitor calls GET /competitors/:id', async () => {
    const mockCompetitor = {
      data: {
        id: 'comp_1',
        title: 'Competitor 1',
      },
    };

    (apiClient.get as any).mockResolvedValueOnce(mockCompetitor);

    const result = await getCompetitor('comp_1');

    expect(apiClient.get).toHaveBeenCalledWith('/competitors/comp_1', {
      signal: undefined,
    });
    expect(result.id).toBe('comp_1');
  });

  it('deleteCompetitor calls DELETE /competitors/:id', async () => {
    (apiClient.delete as any).mockResolvedValueOnce({ data: null });

    await deleteCompetitor('comp_1');

    expect(apiClient.delete).toHaveBeenCalledWith('/competitors/comp_1', {
      signal: undefined,
    });
  });

  it('getCompetitorUploads calls GET /competitors/:id/uploads', async () => {
    const mockUploads = {
      data: {
        competitorId: 'comp_1',
        channelId: 'UC_123',
        channelTitle: 'Tech Reviewer',
        videos: [
          {
            videoId: 'vid_1',
            title: 'Test Video 1',
            publishedAt: '2026-10-20T10:00:00Z',
            relativePublished: '2 days ago',
            duration: '12:30',
            durationSeconds: 750,
            viewCount: 15000,
            youtubeUrl: 'https://www.youtube.com/watch?v=vid_1',
          },
        ],
        totalResults: 1,
      },
    };

    (apiClient.get as any).mockResolvedValueOnce(mockUploads);

    const result = await getCompetitorUploads('comp_1', 10);

    expect(apiClient.get).toHaveBeenCalledWith('/competitors/comp_1/uploads', {
      params: { max_results: 10 },
      signal: undefined,
    });
    expect(result.videos).toHaveLength(1);
    expect(result.videos[0].duration).toBe('12:30');
  });

  it('compareCompetitor calls GET /competitors/:id/compare', async () => {
    const mockCompare = {
      data: {
        userChannelId: 'my_chan',
        userChannelTitle: 'My Channel',
        competitorId: 'comp_1',
        competitorChannelId: 'UC_123',
        competitorTitle: 'Competitor 1',
        metrics: [
          {
            metricKey: 'subscribers',
            label: 'Public Subscribers',
            userValue: 50000,
            competitorValue: 80000,
            diffPct: -37.5,
          },
        ],
        privateDataDisclosure: 'Private metrics protected',
      },
    };

    (apiClient.get as any).mockResolvedValueOnce(mockCompare);

    const result = await compareCompetitor('comp_1', 'my_chan');

    expect(apiClient.get).toHaveBeenCalledWith('/competitors/comp_1/compare', {
      params: { channel_id: 'my_chan' },
      signal: undefined,
    });
    expect(result.metrics).toHaveLength(1);
    expect(result.competitorTitle).toBe('Competitor 1');
  });
});
