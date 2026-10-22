import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModeProvider } from '../context/AppModeContext';
import { ContentPlannerPage } from './ContentPlannerPage';
import * as contentPlanService from '../services/contentPlanService';
import * as youtubeService from '../services/youtubeService';
import type { ContentCalendarResponse } from '../types/contentPlan';

vi.mock('../services/contentPlanService', () => ({
  getCalendar: vi.fn(),
  listPlans: vi.fn(),
  createPlan: vi.fn(),
  updatePlan: vi.fn(),
  deletePlan: vi.fn(),
}));

vi.mock('../services/youtubeService', async (importOriginal) => {
  const actual = await importOriginal<typeof youtubeService>();
  return {
    ...actual,
    getConnectionStatus: vi.fn(),
  };
});

describe('ContentPlannerPage Tests', () => {
  const mockCalendarData: ContentCalendarResponse = {
    total_planned: 2,
    total_published: 1,
    stage_counts: {
      Idea: 0,
      Scripting: 1,
      Editing: 1,
      Ready: 0,
      Published: 1,
    },
    items: [
      {
        id: 'plan-1',
        item_type: 'planned',
        title: 'Multi-Agent Production Deep Dive',
        description: 'Comprehensive walkthrough of worker orchestration',
        content_type: 'Long-form',
        platform: 'youtube',
        stage: 'Scripting',
        date: '2026-10-15T15:00:00Z',
        notes: 'Target 18 mins',
        video_id: null,
        is_live_verified: false,
      },
      {
        id: 'plan-2',
        item_type: 'planned',
        title: 'Building Modern React UIs',
        description: 'Vite and TypeScript masterclass',
        content_type: 'Short',
        platform: 'youtube',
        stage: 'Editing',
        date: '2026-10-22T12:00:00Z',
        notes: null,
        video_id: null,
        is_live_verified: false,
      },
      {
        id: 'pub-vid-1',
        item_type: 'published',
        title: 'We Built an Autonomous YouTube Studio in 48 Hours',
        description: 'Published YouTube video',
        content_type: 'Long-form',
        platform: 'youtube',
        stage: 'Published',
        date: '2026-10-18T14:00:00Z',
        notes: null,
        video_id: 'vid_yt_999',
        is_live_verified: true,
        view_count: 14200,
      },
    ],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    localStorage.setItem('auth_token', 'mock_token');
    localStorage.setItem('selected_channel_id', 'demo-channel-1');

    vi.mocked(youtubeService.getConnectionStatus).mockResolvedValue({
      connected: false,
      channel: null,
    });

    vi.mocked(contentPlanService.getCalendar).mockResolvedValue(mockCalendarData);
    vi.mocked(contentPlanService.createPlan).mockImplementation(async (payload) => ({
      id: 'plan-new-99',
      userId: 'user-1',
      channelId: payload.channel_id ?? null,
      title: payload.title,
      description: payload.description ?? null,
      contentType: (payload.content_type as any) ?? 'Long-form',
      platform: (payload.platform as any) ?? 'youtube',
      stage: (payload.stage as any) ?? 'Idea',
      scheduledAt: payload.scheduled_at,
      notes: payload.notes ?? null,
      videoId: payload.video_id ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    vi.mocked(contentPlanService.updatePlan).mockImplementation(async (id, payload) => ({
      id,
      userId: 'user-1',
      channelId: null,
      title: payload.title ?? 'Updated Title',
      description: payload.description ?? null,
      contentType: (payload.content_type as any) ?? 'Long-form',
      platform: (payload.platform as any) ?? 'youtube',
      stage: (payload.stage as any) ?? 'Editing',
      scheduledAt: payload.scheduled_at ?? '2026-10-15T15:00:00Z',
      notes: payload.notes ?? null,
      videoId: null,
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: new Date().toISOString(),
    }));
    vi.mocked(contentPlanService.deletePlan).mockResolvedValue({
      success: true,
      message: 'Plan deleted successfully',
    });
  });

  it('renders loading state and then calendar items in Month view', async () => {
    render(
      <AppModeProvider initialDataState="DEMO" initialChannelId="demo-channel-1">
        <ContentPlannerPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Content Calendar & Release Pipeline')).toBeInTheDocument();
      expect(screen.getByText('Multi-Agent Production Deep Dive')).toBeInTheDocument();
      expect(screen.getByText('Building Modern React UIs')).toBeInTheDocument();
      expect(screen.getByText('We Built an Autonomous YouTube Studio in 48 Hours')).toBeInTheDocument();
    });

    // Check stage counters
    expect(screen.getByText(/All Stages \(3\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Scripting \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Editing \(1\)/i)).toBeInTheDocument();
  });

  it('distinguishes planned content from confirmed published YouTube videos', async () => {
    render(
      <AppModeProvider initialDataState="DEMO" initialChannelId="demo-channel-1">
        <ContentPlannerPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Multi-Agent Production Deep Dive')).toBeInTheDocument();
      expect(screen.getByText('We Built an Autonomous YouTube Studio in 48 Hours')).toBeInTheDocument();
    });

    // Event elements exist with specific styles
    const plannedEvent = screen.getByTestId('event-plan-1');
    const publishedEvent = screen.getByTestId('event-pub-vid-1');

    expect(plannedEvent).toBeInTheDocument();
    expect(publishedEvent).toBeInTheDocument();
  });

  it('switches between Month, Week, and Pipeline views', async () => {
    render(
      <AppModeProvider initialDataState="DEMO" initialChannelId="demo-channel-1">
        <ContentPlannerPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('view-month-btn')).toBeInTheDocument();
    });

    // Switch to Week view
    const weekBtn = screen.getByTestId('view-week-btn');
    await act(async () => {
      fireEvent.click(weekBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('Sun')).toBeInTheDocument();
      expect(screen.getByText('Sat')).toBeInTheDocument();
    });

    // Switch to Pipeline view
    const pipelineBtn = screen.getByTestId('view-kanban-btn');
    await act(async () => {
      fireEvent.click(pipelineBtn);
    });

    expect(screen.getByTestId('kanban-view')).toBeInTheDocument();
    expect(screen.getByText('Idea / Backlog')).toBeInTheDocument();
    expect(screen.getByText('Post-Production')).toBeInTheDocument();

    // Switch back to Month view
    const monthBtn = screen.getByTestId('view-month-btn');
    await act(async () => {
      fireEvent.click(monthBtn);
    });

    expect(screen.getByTestId('month-view')).toBeInTheDocument();
  });

  it('navigates dates with Prev, Next, and Today buttons', async () => {
    render(
      <AppModeProvider initialDataState="DEMO" initialChannelId="demo-channel-1">
        <ContentPlannerPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('cal-prev-btn')).toBeInTheDocument();
    });

    const prevBtn = screen.getByTestId('cal-prev-btn');
    const nextBtn = screen.getByTestId('cal-next-btn');
    const todayBtn = screen.getByTestId('cal-today-btn');

    // Click Next
    await act(async () => {
      fireEvent.click(nextBtn);
    });
    expect(contentPlanService.getCalendar).toHaveBeenCalledTimes(2);

    // Click Next again (2 months ahead)
    await act(async () => {
      fireEvent.click(nextBtn);
    });
    expect(contentPlanService.getCalendar).toHaveBeenCalledTimes(3);

    // Click Prev (1 month ahead)
    await act(async () => {
      fireEvent.click(prevBtn);
    });
    expect(contentPlanService.getCalendar).toHaveBeenCalledTimes(4);

    // Click Today (resets back to current month, triggering re-fetch)
    await act(async () => {
      fireEvent.click(todayBtn);
    });
    expect(contentPlanService.getCalendar).toHaveBeenCalledTimes(5);
  });

  it('filters by stage and toggles published videos', async () => {
    render(
      <AppModeProvider initialDataState="DEMO" initialChannelId="demo-channel-1">
        <ContentPlannerPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('stage-filter-select')).toBeInTheDocument();
    });

    // Filter by Scripting
    const filterSelect = screen.getByTestId('stage-filter-select');
    await act(async () => {
      fireEvent.change(filterSelect, { target: { value: 'Scripting' } });
    });

    // Should only show Scripting items in filtered view
    expect(screen.getByText('Multi-Agent Production Deep Dive')).toBeInTheDocument();
    expect(screen.queryByText('Building Modern React UIs')).not.toBeInTheDocument();

    // Toggle include published
    const publishedToggle = screen.getByTestId('include-published-checkbox');
    await act(async () => {
      fireEvent.click(publishedToggle);
    });

    expect(contentPlanService.getCalendar).toHaveBeenCalledWith(
      expect.objectContaining({
        includePublished: false,
      })
    );
  });

  it('opens New Plan modal, validates title, and creates plan', async () => {
    render(
      <AppModeProvider initialDataState="DEMO" initialChannelId="demo-channel-1">
        <ContentPlannerPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('new-plan-button')).toBeInTheDocument();
    });

    // Open modal
    await act(async () => {
      fireEvent.click(screen.getByTestId('new-plan-button'));
    });

    expect(screen.getByTestId('plan-modal')).toBeInTheDocument();
    expect(screen.getByText('Plan New Content Item')).toBeInTheDocument();

    // Fill valid data
    const titleInput = screen.getByTestId('input-plan-title');
    const stageSelect = screen.getByTestId('select-plan-stage');
    const saveBtn = screen.getByTestId('save-plan-btn');

    await act(async () => {
      fireEvent.change(titleInput, { target: { value: 'Mastering AI Workflows' } });
      fireEvent.change(stageSelect, { target: { value: 'Editing' } });
    });

    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(contentPlanService.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Mastering AI Workflows',
        stage: 'Editing',
      })
    );
  });

  it('opens existing item modal, edits it, and updates plan', async () => {
    render(
      <AppModeProvider initialDataState="DEMO" initialChannelId="demo-channel-1">
        <ContentPlannerPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Multi-Agent Production Deep Dive')).toBeInTheDocument();
    });

    // Click on item
    await act(async () => {
      fireEvent.click(screen.getByText('Multi-Agent Production Deep Dive'));
    });

    expect(screen.getByTestId('plan-modal')).toBeInTheDocument();
    expect(screen.getByText('Edit Planned Content')).toBeInTheDocument();

    const titleInput = screen.getByTestId('input-plan-title');
    expect(titleInput).toHaveValue('Multi-Agent Production Deep Dive');

    await act(async () => {
      fireEvent.change(titleInput, { target: { value: 'Multi-Agent Production Deep Dive (Updated)' } });
    });

    const saveBtn = screen.getByTestId('save-plan-btn');
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(contentPlanService.updatePlan).toHaveBeenCalledWith(
      'plan-1',
      expect.objectContaining({
        title: 'Multi-Agent Production Deep Dive (Updated)',
      })
    );
  });

  it('deletes planned item when delete button is confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <AppModeProvider initialDataState="DEMO" initialChannelId="demo-channel-1">
        <ContentPlannerPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Multi-Agent Production Deep Dive')).toBeInTheDocument();
    });

    // Open edit modal
    await act(async () => {
      fireEvent.click(screen.getByText('Multi-Agent Production Deep Dive'));
    });

    const deleteBtn = screen.getByTestId('delete-plan-btn');
    expect(deleteBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(deleteBtn);
    });

    expect(confirmSpy).toHaveBeenCalled();
    expect(contentPlanService.deletePlan).toHaveBeenCalledWith('plan-1');

    confirmSpy.mockRestore();
  });

  it('opens YouTube video link when confirmed published item is clicked', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <AppModeProvider initialDataState="DEMO" initialChannelId="demo-channel-1">
        <ContentPlannerPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('We Built an Autonomous YouTube Studio in 48 Hours')).toBeInTheDocument();
    });

    // Click on published video
    await act(async () => {
      fireEvent.click(screen.getByText('We Built an Autonomous YouTube Studio in 48 Hours'));
    });

    expect(openSpy).toHaveBeenCalledWith('https://www.youtube.com/watch?v=vid_yt_999', '_blank');
    openSpy.mockRestore();
  });

  it('handles error state and retries successfully', async () => {
    vi.mocked(contentPlanService.getCalendar).mockRejectedValueOnce({
      status: 500,
      message: 'Database connection failed',
    });

    render(
      <AppModeProvider initialDataState="DEMO" initialChannelId="demo-channel-1">
        <ContentPlannerPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('calendar-error')).toBeInTheDocument();
      expect(screen.getByText(/Database connection failed/i)).toBeInTheDocument();
    });

    // Retry
    vi.mocked(contentPlanService.getCalendar).mockResolvedValue(mockCalendarData);
    const retryBtn = screen.getByRole('button', { name: /retry/i });

    await act(async () => {
      fireEvent.click(retryBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('Multi-Agent Production Deep Dive')).toBeInTheDocument();
    });
  });
});
