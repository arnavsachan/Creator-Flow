import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Kanban,
  LayoutGrid,
  ListFilter,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { useAppMode } from '../context/AppModeContext';
import {
  createPlan,
  deletePlan,
  getCalendar,
  updatePlan,
} from '../services/contentPlanService';
import { dashboardSync } from '../services/dashboardSync';
import { ErrorState } from '../components/states/ErrorState';
import type {
  ContentCalendarItem,
  CreateContentPlanPayload,
  UpdateContentPlanPayload,
} from '../types/contentPlan';

type ViewMode = 'month' | 'week' | 'kanban';

const STAGE_CONFIG: Record<
  string,
  { label: string; color: string; badgeBg: string; border: string }
> = {
  Idea: {
    label: 'Idea / Backlog',
    color: 'text-zinc-400',
    badgeBg: 'bg-zinc-800/80 text-zinc-300',
    border: 'border-zinc-800',
  },
  Scripting: {
    label: 'Scripting & Research',
    color: 'text-amber-400',
    badgeBg: 'bg-amber-950/60 text-amber-300',
    border: 'border-amber-800/60',
  },
  Editing: {
    label: 'Post-Production',
    color: 'text-indigo-400',
    badgeBg: 'bg-indigo-950/60 text-indigo-300',
    border: 'border-indigo-800/60',
  },
  Ready: {
    label: 'Ready for Upload',
    color: 'text-emerald-400',
    badgeBg: 'bg-emerald-950/60 text-emerald-300',
    border: 'border-emerald-800/60',
  },
  Published: {
    label: 'Confirmed Published',
    color: 'text-rose-400',
    badgeBg: 'bg-rose-950/60 text-rose-300',
    border: 'border-rose-800/60',
  },
};

export const ContentPlannerPage: React.FC = () => {
  const { selectedChannelId, connectedChannel } = useAppMode();

  // Navigation & View State
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // Data State
  const [items, setItems] = useState<ContentCalendarItem[]>([]);
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<ContentCalendarItem | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form Fields
  const [formTitle, setFormTitle] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formContentType, setFormContentType] = useState<string>('Long-form');
  const [formPlatform, setFormPlatform] = useState<string>('youtube');
  const [formStage, setFormStage] = useState<string>('Idea');
  const [formDate, setFormDate] = useState<string>('');
  const [formTime, setFormTime] = useState<string>('14:00');
  const [formNotes, setFormNotes] = useState<string>('');
  const [formVideoId, setFormVideoId] = useState<string>('');

  // Filter State
  const [selectedStageFilter, setSelectedStageFilter] = useState<string>('all');
  const [includePublishedVideos, setIncludePublishedVideos] = useState<boolean>(true);

  // Subscribe to sync events
  useEffect(() => {
    const unsub = dashboardSync.subscribeSyncTrigger(() => {
      setRefreshKey((k) => k + 1);
    });
    return unsub;
  }, []);

  // Compute date range for month view
  const { startDateIso, endDateIso, monthTitle, weekTitle } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // Month Range: start from first day of month - padded to start of week (Sunday)
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const startOfGrid = new Date(firstDay);
    startOfGrid.setDate(firstDay.getDate() - firstDay.getDay());
    startOfGrid.setHours(0, 0, 0, 0);

    const endOfGrid = new Date(lastDay);
    endOfGrid.setDate(lastDay.getDate() + (6 - lastDay.getDay()));
    endOfGrid.setHours(23, 59, 59, 999);

    // Week Range: current week Sunday to Saturday
    const currDay = currentDate.getDay();
    const weekStart = new Date(currentDate);
    weekStart.setDate(currentDate.getDate() - currDay);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const monthFmt = currentDate.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });

    const weekFmt = `${weekStart.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })} – ${weekEnd.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`;

    return {
      startDateIso: startOfGrid.toISOString(),
      endDateIso: endOfGrid.toISOString(),
      monthTitle: monthFmt,
      weekTitle: weekFmt,
    };
  }, [currentDate]);

  // Load calendar items from backend
  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setApiError(null);

    getCalendar({
      channelId: selectedChannelId,
      startDate: startDateIso,
      endDate: endDateIso,
      includePublished: includePublishedVideos,
    })
      .then((res) => {
        if (!ignore) {
          setItems(res.items);
          setStageCounts(res.stage_counts || {});
          setLoading(false);
        }
      })
      .catch((err: any) => {
        if (!ignore) {
          console.warn('[ContentPlannerPage] Failed to fetch calendar:', err);
          setApiError(err?.message || 'Failed to load content calendar.');
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [selectedChannelId, startDateIso, endDateIso, includePublishedVideos, refreshKey]);

  // Filter items based on active stage filter
  const filteredItems = useMemo(() => {
    if (selectedStageFilter === 'all') return items;
    return items.filter((item) => item.stage === selectedStageFilter);
  }, [items, selectedStageFilter]);

  // Navigate functions
  const handlePrev = () => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (viewMode === 'week') {
        d.setDate(d.getDate() - 7);
      } else {
        d.setMonth(d.getMonth() - 1);
      }
      return d;
    });
  };

  const handleNext = () => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (viewMode === 'week') {
        d.setDate(d.getDate() + 7);
      } else {
        d.setMonth(d.getMonth() + 1);
      }
      return d;
    });
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Modal open handlers
  const openCreateModal = (presetDate?: string) => {
    setEditingItem(null);
    setFormTitle('');
    setFormDescription('');
    setFormContentType('Long-form');
    setFormPlatform('youtube');
    setFormStage('Idea');
    setFormDate(presetDate || new Date().toISOString().slice(0, 10));
    setFormTime('14:00');
    setFormNotes('');
    setFormVideoId('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (item: ContentCalendarItem) => {
    // If it's a published video without an underlying plan, clicking opens its YouTube page
    if (item.item_type === 'published') {
      if (item.video_id) {
        window.open(`https://www.youtube.com/watch?v=${item.video_id}`, '_blank');
      }
      return;
    }

    setEditingItem(item);
    setFormTitle(item.title);
    setFormDescription(item.description || '');
    setFormContentType(item.content_type || 'Long-form');
    setFormPlatform(item.platform || 'youtube');
    setFormStage(item.stage || 'Idea');

    const dt = item.date ? new Date(item.date) : new Date();
    const safeDt = isNaN(dt.getTime()) ? new Date() : dt;
    setFormDate(safeDt.toISOString().slice(0, 10));
    const hours = String(safeDt.getHours()).padStart(2, '0');
    const mins = String(safeDt.getMinutes()).padStart(2, '0');
    setFormTime(`${hours}:${mins}`);

    setFormNotes(item.notes || '');
    setFormVideoId(item.video_id || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      setFormError('Title is required.');
      return;
    }
    if (!formDate) {
      setFormError('Scheduled date is required.');
      return;
    }

    setSaving(true);
    setFormError(null);

    const [hours, mins] = formTime.split(':').map((v) => parseInt(v, 10) || 0);
    const scheduledAt = new Date(`${formDate}T00:00:00`);
    scheduledAt.setHours(hours, mins, 0, 0);

    try {
      if (editingItem) {
        const updatePayload: UpdateContentPlanPayload = {
          title: formTitle.trim(),
          description: formDescription.trim() || undefined,
          content_type: formContentType,
          platform: formPlatform,
          stage: formStage,
          scheduled_at: scheduledAt.toISOString(),
          notes: formNotes.trim() || undefined,
          video_id: formVideoId.trim() || undefined,
        };
        await updatePlan(editingItem.id, updatePayload);
      } else {
        const createPayload: CreateContentPlanPayload = {
          title: formTitle.trim(),
          description: formDescription.trim() || undefined,
          content_type: formContentType,
          platform: formPlatform,
          stage: formStage,
          scheduled_at: scheduledAt.toISOString(),
          notes: formNotes.trim() || undefined,
          channel_id: selectedChannelId || undefined,
          video_id: formVideoId.trim() || undefined,
        };
        await createPlan(createPayload);
      }
      setIsModalOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      console.error('[ContentPlannerPage] Save failed:', err);
      setFormError(err?.message || 'Failed to save planned item.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!editingItem) return;
    if (!window.confirm(`Are you sure you want to delete "${editingItem.title}"?`)) {
      return;
    }
    setSaving(true);
    try {
      await deletePlan(editingItem.id);
      setIsModalOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      console.error('[ContentPlannerPage] Delete failed:', err);
      setFormError(err?.message || 'Failed to delete planned item.');
    } finally {
      setSaving(false);
    }
  };

  // Month grid calculation
  const monthGridDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - firstDay.getDay());

    const days: { date: Date; isCurrentMonth: boolean; dateStr: string }[] = [];
    const curr = new Date(start);

    for (let i = 0; i < 42; i++) {
      days.push({
        date: new Date(curr),
        isCurrentMonth: curr.getMonth() === month,
        dateStr: curr.toISOString().slice(0, 10),
      });
      curr.setDate(curr.getDate() + 1);
    }
    return days;
  }, [currentDate]);

  // Week days calculation
  const weekDays = useMemo(() => {
    const currDay = currentDate.getDay();
    const start = new Date(currentDate);
    start.setDate(currentDate.getDate() - currDay);

    const days: { date: Date; dateStr: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push({
        date: d,
        dateStr: d.toISOString().slice(0, 10),
      });
    }
    return days;
  }, [currentDate]);

  // Group items by date string (YYYY-MM-DD)
  const itemsByDate = useMemo(() => {
    const map: Record<string, ContentCalendarItem[]> = {};
    for (const item of filteredItems) {
      if (!item.date) continue;
      try {
        const d = new Date(item.date);
        if (!isNaN(d.getTime())) {
          const dStr = d.toISOString().slice(0, 10);
          if (!map[dStr]) map[dStr] = [];
          map[dStr].push(item);
        }
      } catch {
        // Ignore invalid date
      }
    }
    return map;
  }, [filteredItems]);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-zinc-300" />
              <span>Content Calendar & Release Pipeline</span>
            </h2>
            {selectedChannelId && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700/80">
                Channel: {connectedChannel?.title || selectedChannelId}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Plan, organize, and track production stages and upload schedules for your channel content.
          </p>
        </div>

        {/* View Switcher & Action */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Buttons */}
          <div className="flex items-center bg-[#141418] border border-zinc-800 rounded-md p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('month')}
              data-testid="view-month-btn"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                viewMode === 'month'
                  ? 'bg-zinc-800 text-zinc-100 font-medium'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Month</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('week')}
              data-testid="view-week-btn"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                viewMode === 'week'
                  ? 'bg-zinc-800 text-zinc-100 font-medium'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Week</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              data-testid="view-kanban-btn"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                viewMode === 'kanban'
                  ? 'bg-zinc-800 text-zinc-100 font-medium'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Pipeline</span>
            </button>
          </div>

          {/* New Item Button */}
          <button
            type="button"
            onClick={() => openCreateModal()}
            data-testid="new-plan-button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-medium transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Planned Item</span>
          </button>
        </div>
      </div>

      {/* Control Bar: Date Navigator, Stage Filters & Published Toggle */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-[#141418] p-3 rounded-lg border border-white/[0.06]">
        {/* Date Navigator */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrev}
            data-testid="cal-prev-btn"
            className="p-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors"
            title="Previous"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleToday}
            data-testid="cal-today-btn"
            className="px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 hover:text-zinc-100 font-medium cursor-pointer transition-colors"
          >
            Today
          </button>
          <button
            type="button"
            onClick={handleNext}
            data-testid="cal-next-btn"
            className="p-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors"
            title="Next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <span className="text-xs font-semibold text-zinc-100 ml-2 font-mono">
            {viewMode === 'week' ? weekTitle : monthTitle}
          </span>
        </div>

        {/* Filters and Counters */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Stage Filter */}
          <div className="flex items-center gap-1 text-xs text-zinc-400">
            <ListFilter className="w-3.5 h-3.5 text-zinc-500" />
            <select
              value={selectedStageFilter}
              onChange={(e) => setSelectedStageFilter(e.target.value)}
              data-testid="stage-filter-select"
              className="bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1 text-xs text-zinc-200 focus:outline-none cursor-pointer"
            >
              <option value="all">All Stages ({items.length})</option>
              <option value="Idea">Idea ({stageCounts['Idea'] || 0})</option>
              <option value="Scripting">Scripting ({stageCounts['Scripting'] || 0})</option>
              <option value="Editing">Editing ({stageCounts['Editing'] || 0})</option>
              <option value="Ready">Ready ({stageCounts['Ready'] || 0})</option>
              <option value="Published">Published ({stageCounts['Published'] || 0})</option>
            </select>
          </div>

          {/* Toggle Published YouTube Videos */}
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includePublishedVideos}
              onChange={(e) => setIncludePublishedVideos(e.target.checked)}
              data-testid="include-published-checkbox"
              className="rounded bg-zinc-900 border-zinc-800 text-indigo-500 focus:ring-0 cursor-pointer"
            />
            <span>Show Published Videos</span>
          </label>

          {/* Quick Refresh */}
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
            className="p-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors disabled:opacity-50"
            title="Refresh calendar"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main View Area */}
      {loading && items.length === 0 ? (
        <div
          className="p-20 rounded-lg bg-[#141418] border border-white/[0.06] flex flex-col items-center justify-center gap-3 text-zinc-400 text-xs"
          data-testid="calendar-loading"
        >
          <Loader2 className="w-6 h-6 animate-spin text-zinc-300" />
          <span>Loading scheduled calendar and published videos...</span>
        </div>
      ) : apiError && items.length === 0 ? (
        <div className="py-12" data-testid="calendar-error">
          <ErrorState
            title="Unable to Load Content Calendar"
            message={apiError}
            onRetry={() => setRefreshKey((k) => k + 1)}
          />
        </div>
      ) : viewMode === 'kanban' ? (
        /* KANBAN PIPELINE VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="kanban-view">
          {(['Idea', 'Scripting', 'Editing', 'Ready'] as const).map((stage) => {
            const stageItems = filteredItems.filter((it) => it.stage === stage);
            const cfg = STAGE_CONFIG[stage];
            return (
              <div key={stage} className="space-y-3">
                <div className="flex items-center justify-between text-xs font-medium px-1">
                  <span className={cfg.color}>{cfg.label}</span>
                  <span className="font-mono text-[10px] text-zinc-500">({stageItems.length})</span>
                </div>

                <div className="space-y-2 min-h-[160px] p-2 bg-[#0F0F12] border border-zinc-900 rounded-lg">
                  {stageItems.length === 0 ? (
                    <div className="p-4 text-center text-zinc-600 text-xs font-mono">
                      No items in {stage}
                    </div>
                  ) : (
                    stageItems.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => openEditModal(item)}
                        data-testid={`card-${item.id}`}
                        className="p-3.5 rounded-lg bg-[#141418] border border-white/[0.06] hover:border-zinc-700 transition-all cursor-pointer space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                            {item.content_type}
                          </span>
                          <span className="text-[11px] font-mono text-zinc-500">
                            {new Date(item.date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                        <div className="font-medium text-zinc-200 line-clamp-2 leading-snug">
                          {item.title}
                        </div>
                        {item.notes && (
                          <p className="text-[11px] text-zinc-500 line-clamp-1 italic">
                            {item.notes}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : viewMode === 'week' ? (
        /* WEEK VIEW */
        <div className="space-y-2" data-testid="week-view">
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((d) => {
              const isToday = d.dateStr === todayStr;
              const dayItems = itemsByDate[d.dateStr] || [];
              const dayName = d.date.toLocaleDateString('en-US', { weekday: 'short' });
              const dayNum = d.date.getDate();

              return (
                <div
                  key={d.dateStr}
                  className={`min-h-[380px] p-2.5 rounded-lg bg-[#141418] border flex flex-col justify-between ${
                    isToday ? 'border-indigo-500/50 bg-[#16161F]' : 'border-white/[0.06]'
                  }`}
                >
                  <div>
                    {/* Day Header */}
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800/80">
                      <span className="text-[11px] uppercase font-semibold text-zinc-400">
                        {dayName}
                      </span>
                      <span
                        className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${
                          isToday ? 'bg-indigo-600 text-white' : 'text-zinc-300'
                        }`}
                      >
                        {dayNum}
                      </span>
                    </div>

                    {/* Day Events */}
                    <div className="space-y-1.5">
                      {dayItems.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => openEditModal(item)}
                          data-testid={`event-${item.id}`}
                          className={`p-2 rounded-md border text-[11px] transition-all cursor-pointer ${
                            item.item_type === 'published'
                              ? 'bg-rose-950/30 border-rose-800/50 hover:border-rose-600'
                              : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                            <span>
                              {new Date(item.date).toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            <span
                              className={`px-1 py-0.2 rounded text-[9px] ${
                                item.item_type === 'published'
                                  ? 'bg-rose-900/60 text-rose-300'
                                  : STAGE_CONFIG[item.stage]?.badgeBg || 'bg-zinc-800 text-zinc-400'
                              }`}
                            >
                              {item.item_type === 'published' ? 'Published' : item.stage}
                            </span>
                          </div>
                          <div className="font-medium text-zinc-200 mt-1 line-clamp-2 leading-tight">
                            {item.title}
                          </div>
                          {item.item_type === 'published' && item.view_count != null && (
                            <div className="text-[10px] text-zinc-400 font-mono mt-1">
                              {item.view_count.toLocaleString()} views
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Add button inside day */}
                  <button
                    type="button"
                    onClick={() => openCreateModal(d.dateStr)}
                    className="w-full mt-2 py-1 text-[11px] text-zinc-500 hover:text-zinc-200 border border-dashed border-zinc-800/80 hover:border-zinc-700 rounded transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Plan</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* MONTH VIEW */
        <div className="space-y-2" data-testid="month-view">
          {/* Weekday Labels Header */}
          <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase text-zinc-500 py-1 font-mono">
            <span>Sun</span>
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
          </div>

          {/* Month Grid (6 rows x 7 days = 42 cells) */}
          <div className="grid grid-cols-7 gap-2">
            {monthGridDays.map((d) => {
              const isToday = d.dateStr === todayStr;
              const dayItems = itemsByDate[d.dateStr] || [];

              return (
                <div
                  key={d.dateStr}
                  className={`min-h-[110px] p-2 rounded-lg bg-[#141418] border flex flex-col justify-between transition-colors ${
                    !d.isCurrentMonth
                      ? 'opacity-40 border-zinc-900 bg-[#0E0E12]'
                      : isToday
                      ? 'border-indigo-500/50 bg-[#16161F]'
                      : 'border-white/[0.06] hover:border-zinc-800'
                  }`}
                >
                  <div>
                    {/* Date Number Header */}
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span
                        className={`font-mono text-[11px] font-semibold px-1 rounded ${
                          isToday ? 'bg-indigo-600 text-white' : 'text-zinc-400'
                        }`}
                      >
                        {d.date.getDate()}
                      </span>
                      {dayItems.length > 0 && (
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {dayItems.length} {dayItems.length === 1 ? 'item' : 'items'}
                        </span>
                      )}
                    </div>

                    {/* Events list */}
                    <div className="space-y-1">
                      {dayItems.slice(0, 3).map((item) => (
                        <div
                          key={item.id}
                          onClick={() => openEditModal(item)}
                          data-testid={`event-${item.id}`}
                          className={`px-1.5 py-0.5 rounded text-[11px] truncate font-medium cursor-pointer transition-colors flex items-center justify-between gap-1 ${
                            item.item_type === 'published'
                              ? 'bg-rose-950/40 text-rose-300 border border-rose-800/40 hover:bg-rose-900/50'
                              : 'bg-zinc-900 text-zinc-200 border border-zinc-800 hover:bg-zinc-800'
                          }`}
                          title={`${item.title} (${item.stage})`}
                        >
                          <span className="truncate">{item.title}</span>
                          {item.item_type === 'published' ? (
                            <Video className="w-2.5 h-2.5 shrink-0 text-rose-400" />
                          ) : (
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                item.stage === 'Ready'
                                  ? 'bg-emerald-400'
                                  : item.stage === 'Editing'
                                  ? 'bg-indigo-400'
                                  : item.stage === 'Scripting'
                                  ? 'bg-amber-400'
                                  : 'bg-zinc-500'
                              }`}
                            />
                          )}
                        </div>
                      ))}

                      {dayItems.length > 3 && (
                        <div className="text-[10px] text-zinc-500 font-mono text-center">
                          +{dayItems.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Quick Add on Hover / Click */}
                  <button
                    type="button"
                    onClick={() => openCreateModal(d.dateStr)}
                    className="opacity-0 hover:opacity-100 focus:opacity-100 text-[10px] text-zinc-500 hover:text-zinc-200 transition-opacity flex items-center justify-center gap-0.5 py-0.5 cursor-pointer"
                    title={`Schedule item on ${d.dateStr}`}
                  >
                    <Plus className="w-2.5 h-2.5" />
                    <span>Add</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State Banner if no items at all */}
      {!loading && items.length === 0 && (
        <div
          className="py-12 text-center text-zinc-400 space-y-3 border border-dashed border-zinc-800 rounded-lg p-6"
          data-testid="calendar-empty"
        >
          <CalendarIcon className="w-10 h-10 mx-auto text-zinc-600" />
          <h3 className="text-sm font-semibold text-zinc-200">No Content Planned Yet</h3>
          <p className="text-xs text-zinc-500 max-w-md mx-auto">
            Schedule upcoming video releases, organize scriptwriting deadlines, or connect your YouTube channel to
            synchronize confirmed upload history.
          </p>
          <button
            type="button"
            onClick={() => openCreateModal()}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Plan First Video</span>
          </button>
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
          data-testid="plan-modal"
        >
          <div className="bg-[#141418] border border-zinc-800 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-zinc-300" />
                <h3 className="text-sm font-semibold text-zinc-100">
                  {editingItem ? 'Edit Planned Content' : 'Plan New Content Item'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveItem} className="p-5 space-y-4 text-xs">
              {formError && (
                <div
                  className="p-3 rounded-md bg-rose-950/50 border border-rose-800/80 text-rose-200 text-xs"
                  data-testid="form-error-banner"
                >
                  {formError}
                </div>
              )}

              {/* Title */}
              <div className="space-y-1">
                <label className="text-zinc-300 font-medium">Video Title / Concept *</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g., Scaling SQLite to 10k QPS"
                  required
                  data-testid="input-plan-title"
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-md text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                />
              </div>

              {/* Grid: Stage & Content Type */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-zinc-300 font-medium">Production Stage</label>
                  <select
                    value={formStage}
                    onChange={(e) => setFormStage(e.target.value)}
                    data-testid="select-plan-stage"
                    className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-md text-zinc-200 focus:outline-none cursor-pointer"
                  >
                    <option value="Idea">Idea / Backlog</option>
                    <option value="Scripting">Scripting & Research</option>
                    <option value="Editing">Post-Production (Editing)</option>
                    <option value="Ready">Ready for Upload</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-zinc-300 font-medium">Format</label>
                  <select
                    value={formContentType}
                    onChange={(e) => setFormContentType(e.target.value)}
                    data-testid="select-plan-format"
                    className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-md text-zinc-200 focus:outline-none cursor-pointer"
                  >
                    <option value="Long-form">Long-form Video</option>
                    <option value="Short">Short</option>
                    <option value="Community Post">Community Post</option>
                    <option value="Livestream">Livestream</option>
                  </select>
                </div>
              </div>

              {/* Grid: Scheduled Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-zinc-300 font-medium">Scheduled Date *</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    required
                    data-testid="input-plan-date"
                    className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-md text-zinc-200 focus:outline-none cursor-pointer font-mono text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-zinc-300 font-medium">Scheduled Time</label>
                  <input
                    type="time"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    data-testid="input-plan-time"
                    className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-md text-zinc-200 focus:outline-none cursor-pointer font-mono text-xs"
                  />
                </div>
              </div>

              {/* Description / Outline */}
              <div className="space-y-1">
                <label className="text-zinc-300 font-medium">Description / Outline</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Script outline, key hooks, references..."
                  rows={2}
                  className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-md text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 resize-none text-xs"
                />
              </div>

              {/* Internal Notes */}
              <div className="space-y-1">
                <label className="text-zinc-300 font-medium">Production Notes / B-roll</label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="e.g., Needs voiceover re-recording, sponsor read at 03:20"
                  className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-md text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 text-xs"
                />
              </div>

              {/* Optional Linked YouTube Video ID */}
              <div className="space-y-1">
                <label className="text-zinc-300 font-medium flex items-center justify-between">
                  <span>Linked YouTube Video ID (Optional)</span>
                  <span className="text-[10px] text-zinc-500 font-normal">Connects to published video</span>
                </label>
                <input
                  type="text"
                  value={formVideoId}
                  onChange={(e) => setFormVideoId(e.target.value)}
                  placeholder="e.g., zgMR_yjr7mU"
                  data-testid="input-plan-videoid"
                  className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-md text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 font-mono text-xs"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-zinc-800/80">
                {editingItem ? (
                  <button
                    type="button"
                    onClick={handleDeleteItem}
                    disabled={saving}
                    data-testid="delete-plan-btn"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/60 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    disabled={saving}
                    className="px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    data-testid="save-plan-btn"
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>{editingItem ? 'Save Changes' : 'Create Item'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContentPlannerPage;
