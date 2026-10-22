import { describe, expect, it, vi, beforeEach } from 'vitest';
import apiClient from './apiClient';
import { getChannelDetails, getContentLibrary } from './youtubeService';

vi.mock('./apiClient', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const validJwt =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzEyMyIsImV4cCI6OTk5OTk5OTk5OX0.c2lnbmF0dXJl';

describe('youtubeService - YouTube Data API v3', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('auth_token', validJwt);
    (apiClient.post as any).mockResolvedValue({
      data: { access_token: validJwt },
    });
  });

  describe('getChannelDetails', () => {
    it('calls /youtube/channel/details with channel_id param', async () => {
      const mockResponse = {
        data: {
          channelId: 'UC_DEMO_1',
          dataState: 'LIVE',
          isLive: true,
          title: 'Creator Studio',
          description: 'Official channel description',
          subscriberCount: 50000,
          videoCount: 120,
          viewCount: 1500000,
          topicCategories: ['https://en.wikipedia.org/wiki/Technology'],
          uploadsPlaylistId: 'UU_DEMO_1',
          hasDataScope: true,
        },
      };

      (apiClient.get as any).mockResolvedValueOnce(mockResponse);

      const result = await getChannelDetails('UC_DEMO_1');

      expect(apiClient.get).toHaveBeenCalledWith('/youtube/channel/details', {
        params: { channel_id: 'UC_DEMO_1' },
        signal: undefined,
      });
      expect(result.channelId).toBe('UC_DEMO_1');
      expect(result.title).toBe('Creator Studio');
      expect(result.subscriberCount).toBe(50000);
      expect(result.topicCategories).toContain('https://en.wikipedia.org/wiki/Technology');
    });

    it('handles default call without channelId', async () => {
      (apiClient.get as any).mockResolvedValueOnce({
        data: { channelId: 'demo-channel-1', dataState: 'DEMO' },
      });

      const result = await getChannelDetails();
      expect(apiClient.get).toHaveBeenCalledWith('/youtube/channel/details', {
        params: {},
        signal: undefined,
      });
      expect(result.channelId).toBe('demo-channel-1');
    });
  });

  describe('getContentLibrary', () => {
    it('calls /youtube/content-library with pagination, query, and order parameters', async () => {
      const mockResponse = {
        data: {
          channelId: 'UC_DEMO_1',
          dataState: 'LIVE',
          isLive: true,
          videos: [
            {
              videoId: 'vid_123',
              channelId: 'UC_DEMO_1',
              title: 'Building AI Production Agents',
              description: 'Step by step guide',
              publishedAt: '2026-10-18T10:00:00Z',
              relativePublished: '3 days ago',
              duration: '14:28',
              durationIso: 'PT14M28S',
              durationSeconds: 868,
              viewCount: 184500,
              likeCount: 9820,
              commentCount: 642,
              tags: ['AI', 'Agents'],
              hasCaption: true,
            },
          ],
          nextPageToken: 'PAGE_TOKEN_2',
          prevPageToken: null,
          totalResults: 42,
          resultsPerPage: 10,
          q: 'AI',
          order: 'views',
        },
      };

      (apiClient.get as any).mockResolvedValueOnce(mockResponse);

      const result = await getContentLibrary({
        channelId: 'UC_DEMO_1',
        pageToken: 'PAGE_TOKEN_1',
        maxResults: 10,
        q: 'AI',
        order: 'views',
      });

      expect(apiClient.get).toHaveBeenCalledWith('/youtube/content-library', {
        params: {
          channel_id: 'UC_DEMO_1',
          page_token: 'PAGE_TOKEN_1',
          max_results: 10,
          q: 'AI',
          order: 'views',
        },
        signal: undefined,
      });

      expect(result.videos).toHaveLength(1);
      const v = result.videos[0];
      expect(v.videoId).toBe('vid_123');
      expect(v.duration).toBe('14:28');
      expect(v.durationSeconds).toBe(868);
      expect(v.viewCount).toBe(184500);
      expect(result.nextPageToken).toBe('PAGE_TOKEN_2');
    });
  });
});
