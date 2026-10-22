import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  Check,
  Clock,
  ExternalLink,
  Eye,
  Film,
  Info,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Target,
  ThumbsUp,
  Trash2,
  TrendingUp,
  Tv,
  Users,
  X,
} from 'lucide-react';
import { useAppMode } from '../context/AppModeContext';
import { dashboardSync } from '../services/dashboardSync';
import {
  compareCompetitor,
  deleteCompetitor,
  getCompetitorUploads,
  getCompetitors,
  saveCompetitor,
  searchCompetitors,
} from '../services/competitorService';
import { ErrorState } from '../components/states/ErrorState';
import type {
  CompetitorComparisonResponse,
  CompetitorResponse,
  CompetitorSearchResultItem,
  CompetitorUploadsResponse,
} from '../types/competitor';

export interface CompetitorAvatarProps {
  url?: string | null;
  title: string;
  size?: 'sm' | 'md';
  className?: string;
  testId?: string;
}

export const CompetitorAvatar: React.FC<CompetitorAvatarProps> = ({
  url,
  title,
  size = 'md',
  className = '',
  testId,
}) => {
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    setHasError(false);
  }, [url]);

  const sizeClasses = size === 'sm' ? 'w-10 h-10 text-xs' : 'w-11 h-11 text-xs';
  const initial = title && title.trim().length > 0 ? title.trim().charAt(0).toUpperCase() : null;

  if (url && !hasError) {
    return (
      <img
        src={url}
        alt={title}
        referrerPolicy="no-referrer"
        onError={() => setHasError(true)}
        className={`${sizeClasses} rounded-full border border-zinc-700 object-cover shrink-0 ${className}`}
        data-testid={testId ? `${testId}-img` : undefined}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses} rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-zinc-300 shrink-0 select-none ${className}`}
      data-testid={testId ? `${testId}-fallback` : undefined}
      aria-label={`${title} avatar`}
    >
      {initial ? initial : <Tv className="w-4 h-4 text-zinc-400" />}
    </div>
  );
};

export interface VideoThumbnailProps {
  url?: string | null;
  title: string;
  className?: string;
  testId?: string;
}

export const VideoThumbnail: React.FC<VideoThumbnailProps> = ({
  url,
  title,
  className = '',
  testId,
}) => {
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    setHasError(false);
  }, [url]);

  if (url && !hasError) {
    return (
      <img
        src={url}
        alt={title}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setHasError(true)}
        className={`w-full h-full object-cover ${className}`}
        data-testid={testId ? `${testId}-img` : undefined}
      />
    );
  }

  return (
    <div
      className={`w-full h-full flex items-center justify-center text-zinc-600 ${className}`}
      data-testid={testId ? `${testId}-fallback` : undefined}
      aria-label={`${title} thumbnail placeholder`}
    >
      <Film className="w-6 h-6" />
    </div>
  );
};

export const CompetitorsPage: React.FC = () => {
  const { selectedChannelId, dataState } = useAppMode();

  // Competitor list state
  const [competitors, setCompetitors] = useState<CompetitorResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // Search state
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<CompetitorSearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isQuotaError, setIsQuotaError] = useState<boolean>(false);
  const [savingChannelId, setSavingChannelId] = useState<string | null>(null);

  // Selected competitor for comparison and uploads inspection
  const [selectedCompetitor, setSelectedCompetitor] = useState<CompetitorResponse | null>(null);
  const [comparisonData, setComparisonData] = useState<CompetitorComparisonResponse | null>(null);
  const [loadingComparison, setLoadingComparison] = useState<boolean>(false);

  // Uploads view state
  const [activeUploadsComp, setActiveUploadsComp] = useState<CompetitorResponse | null>(null);
  const [uploadsData, setUploadsData] = useState<CompetitorUploadsResponse | null>(null);
  const [loadingUploads, setLoadingUploads] = useState<boolean>(false);

  // Deletion confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Track initial load with ref to avoid lint cascading renders
  const hasLoadedRef = useRef<boolean>(false);

  // Subscribe to global sync trigger
  useEffect(() => {
    const unsubscribe = dashboardSync.subscribeSyncTrigger(() => {
      setRefreshKey((k) => k + 1);
    });
    return unsubscribe;
  }, []);

  // Debounce search input (350ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Execute channel search when debouncedQuery changes
  useEffect(() => {
    if (!debouncedQuery) {
      setSearchResults([]);
      setIsSearching(false);
      setSearchError(null);
      setIsQuotaError(false);
      return;
    }

    let ignore = false;
    setIsSearching(true);
    setSearchError(null);
    setIsQuotaError(false);

    searchCompetitors({
      q: debouncedQuery,
      channelId: selectedChannelId,
      maxResults: 6,
    })
      .then((res) => {
        if (!ignore) {
          setSearchResults(res.results || []);
          setIsSearching(false);
          if (res.dataState === 'SERVICE_DISABLED') {
            setSearchError(res.message || 'YouTube Data API v3 is not enabled in your Google Cloud Project.');
          }
        }
      })
      .catch((err: any) => {
        if (!ignore) {
          const msg = err?.message || 'Failed to search YouTube channels.';
          setSearchError(msg);
          if (err?.status === 429 || msg.toLowerCase().includes('quota')) {
            setIsQuotaError(true);
          }
          setIsSearching(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [debouncedQuery, selectedChannelId]);

  // Load tracked competitors
  useEffect(() => {
    let ignore = false;
    if (!hasLoadedRef.current) {
      setLoading(true);
    }
    setApiError(null);

    getCompetitors(selectedChannelId)
      .then((res) => {
        if (!ignore) {
          hasLoadedRef.current = true;
          setCompetitors(res);
          setLoading(false);
          // If a competitor was selected, keep selection updated or auto-select first
          if (res.length > 0) {
            setSelectedCompetitor((prev) => {
              if (prev && res.some((c) => c.id === prev.id)) {
                return res.find((c) => c.id === prev.id) || res[0];
              }
              return res[0];
            });
          } else {
            setSelectedCompetitor(null);
          }
        }
      })
      .catch((err: any) => {
        if (!ignore) {
          console.warn('[CompetitorsPage] Failed to fetch competitors:', err);
          setApiError(err?.message || 'Failed to load tracked competitors.');
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [selectedChannelId, refreshKey]);

  // Load comparison data when selectedCompetitor or channel changes
  useEffect(() => {
    if (!selectedCompetitor) {
      setComparisonData(null);
      return;
    }

    let ignore = false;
    setLoadingComparison(true);

    compareCompetitor(selectedCompetitor.id, selectedChannelId)
      .then((res) => {
        if (!ignore) {
          setComparisonData(res);
          setLoadingComparison(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          console.warn('[CompetitorsPage] Comparison failed:', err);
          setLoadingComparison(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [selectedCompetitor, selectedChannelId, refreshKey]);

  // Load uploads when activeUploadsComp is selected
  useEffect(() => {
    if (!activeUploadsComp) {
      setUploadsData(null);
      return;
    }

    let ignore = false;
    setLoadingUploads(true);

    getCompetitorUploads(activeUploadsComp.id, 12)
      .then((res) => {
        if (!ignore) {
          setUploadsData(res);
          setLoadingUploads(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          console.warn('[CompetitorsPage] Failed to load competitor uploads:', err);
          setLoadingUploads(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [activeUploadsComp, refreshKey]);

  const handleAddCompetitor = async (channel: CompetitorSearchResultItem) => {
    setSavingChannelId(channel.channelId);
    try {
      const created = await saveCompetitor({
        channelId: channel.channelId,
        title: channel.title,
        customUrl: channel.customUrl,
        thumbnailUrl: channel.thumbnailUrl,
        primaryChannelId: selectedChannelId,
      });

      // Update local state
      setCompetitors((prev) => [created, ...prev.filter((c) => c.channelId !== created.channelId)]);
      setSelectedCompetitor(created);

      // Mark as tracked in search results
      setSearchResults((prev) =>
        prev.map((r) => (r.channelId === channel.channelId ? { ...r, isTracked: true } : r))
      );
    } catch (err: any) {
      console.error('[CompetitorsPage] Failed to add competitor:', err);
      alert(err?.message || 'Failed to add competitor.');
    } finally {
      setSavingChannelId(null);
    }
  };

  const handleDeleteCompetitor = async (competitorId: string) => {
    setDeletingId(competitorId);
    try {
      await deleteCompetitor(competitorId);
      setCompetitors((prev) => prev.filter((c) => c.id !== competitorId));
      if (selectedCompetitor?.id === competitorId) {
        setSelectedCompetitor(null);
      }
      if (activeUploadsComp?.id === competitorId) {
        setActiveUploadsComp(null);
      }
    } catch (err: any) {
      console.error('[CompetitorsPage] Failed to delete competitor:', err);
      alert(err?.message || 'Failed to remove competitor.');
    } finally {
      setDeletingId(null);
    }
  };

  const isLive = dataState === 'LIVE';

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
              <Target className="w-5 h-5 text-indigo-400" />
              <span>Competitor Intelligence & Peer Benchmarking</span>
            </h2>

            {isLive ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-950 text-emerald-400 border border-emerald-800/80">
                LIVE TELEMETRY
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-950 text-amber-400 border border-amber-800/80">
                SAMPLE / DEMO MODE
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Search public YouTube channels, track peer uploads, and compare public statistics using official YouTube Data API v3 endpoints.
          </p>
        </div>

        {/* Quick Refresh Button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading || isSearching}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh competitor data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Quota Notice Banner */}
      {isQuotaError && (
        <div
          className="p-4 rounded-lg bg-rose-950/40 border border-rose-800/80 flex items-start gap-3 text-rose-200"
          data-testid="quota-error-banner"
        >
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="text-xs font-semibold text-rose-100">YouTube Data API Quota Limit Exceeded</div>
            <p className="text-xs text-rose-300/90 leading-relaxed">
              Google Cloud YouTube Data API rate limit or daily quota (10,000 units/day) has been reached. Please retry after quota resets.
            </p>
          </div>
        </div>
      )}

      {/* Search & Channel Discovery Box */}
      <div className="bg-[#141418] p-4 rounded-lg border border-white/[0.06] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-zinc-400" />
            <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
              Search & Track Competitor Channels
            </h3>
          </div>
          <span className="text-[11px] text-zinc-500 font-mono">
            Supports channel names, handles (@mkbhd), or youtube.com URLs
          </span>
        </div>

        <div className="relative">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by channel name, @handle, or YouTube URL..."
            data-testid="competitor-search-input"
            className="w-full pl-9 pr-9 py-2 bg-zinc-900 border border-zinc-800 rounded-md text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          {searchInput && (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setSearchResults([]);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Search Loading Indicator */}
        {isSearching && (
          <div className="flex items-center gap-2 text-xs text-zinc-400 py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            <span>Searching public YouTube channels via Data API v3...</span>
          </div>
        )}

        {/* Search Error Notice */}
        {searchError && (
          <div className="p-3 rounded bg-amber-950/40 border border-amber-800/60 flex items-center gap-2 text-xs text-amber-300">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{searchError}</span>
          </div>
        )}

        {/* Search Results Grid */}
        {searchResults.length > 0 && (
          <div className="pt-2 space-y-2 border-t border-zinc-800" data-testid="search-results-list">
            <div className="text-[11px] text-zinc-400 font-medium">
              Search Results ({searchResults.length})
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {searchResults.map((ch) => {
                const isAlreadyTracked = ch.isTracked || competitors.some((c) => c.channelId === ch.channelId);
                const isSaving = savingChannelId === ch.channelId;

                return (
                  <div
                    key={ch.channelId}
                    data-testid={`search-result-${ch.channelId}`}
                    className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-all flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-start gap-3">
                      <CompetitorAvatar
                        url={ch.thumbnailUrl}
                        title={ch.title}
                        size="sm"
                        testId={`search-avatar-${ch.channelId}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-zinc-100 truncate">{ch.title}</div>
                        {ch.customUrl && (
                          <div className="text-[11px] font-mono text-indigo-400 truncate">{ch.customUrl}</div>
                        )}
                        <p className="text-[11px] text-zinc-400 line-clamp-1 mt-0.5">
                          {ch.description || 'Public YouTube Creator Channel'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80 text-[11px] font-mono text-zinc-400">
                      <div>
                        {ch.hiddenSubscriberCount || ch.subscriberCount === null || ch.subscriberCount === undefined ? (
                          <span className="text-zinc-500">Subs Hidden</span>
                        ) : (
                          <span>{ch.subscriberCount.toLocaleString('en-US')} subs</span>
                        )}
                      </div>
                      <div>
                        <span>{ch.videoCount.toLocaleString('en-US')} videos</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isAlreadyTracked || isSaving}
                      onClick={() => handleAddCompetitor(ch)}
                      data-testid={`add-competitor-btn-${ch.channelId}`}
                      className={`w-full py-1.5 px-3 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                        isAlreadyTracked
                          ? 'bg-zinc-800/80 text-zinc-400 border border-zinc-700/60 cursor-default'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                      }`}
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : isAlreadyTracked ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Tracked</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3 h-3" />
                          <span>Track Competitor</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div
          className="p-16 rounded-lg bg-[#141418] border border-white/[0.06] flex flex-col items-center justify-center gap-3 text-zinc-400 text-xs"
          data-testid="competitors-loading"
        >
          <Loader2 className="w-6 h-6 animate-spin text-zinc-300" />
          <span>Loading tracked competitors...</span>
        </div>
      ) : apiError && competitors.length === 0 ? (
        <div className="py-12" data-testid="competitors-error">
          <ErrorState
            title="Unable to Load Competitors"
            message={apiError}
            onRetry={() => setRefreshKey((k) => k + 1)}
          />
        </div>
      ) : competitors.length === 0 ? (
        <div
          className="py-16 text-center text-zinc-400 space-y-3 border border-dashed border-zinc-800 rounded-lg p-6 bg-[#141418]"
          data-testid="competitors-empty"
        >
          <Target className="w-10 h-10 mx-auto text-zinc-600" />
          <h3 className="text-sm font-semibold text-zinc-200">No Tracked Competitors Yet</h3>
          <p className="text-xs text-zinc-500 max-w-md mx-auto">
            Use the search box above to find and track your first peer or competitor channel. Once added, you can compare channel metrics and inspect recent uploads.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Tracked Competitors Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-4 h-4 text-zinc-400" />
                <span>Tracked Competitors ({competitors.length})</span>
              </span>
              <span className="text-[11px] text-zinc-500 font-mono">
                Click a competitor to compare metrics or view latest uploads
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="competitors-grid">
              {competitors.map((comp) => {
                const isSelected = selectedCompetitor?.id === comp.id;
                const isViewingUploads = activeUploadsComp?.id === comp.id;

                return (
                  <div
                    key={comp.id}
                    data-testid={`competitor-card-${comp.id}`}
                    className={`p-4 rounded-lg bg-[#141418] border transition-all flex flex-col justify-between gap-3 ${
                      isSelected
                        ? 'border-indigo-500/80 shadow-md shadow-indigo-950/20'
                        : 'border-white/[0.06] hover:border-zinc-700/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <CompetitorAvatar
                          url={comp.thumbnailUrl}
                          title={comp.title}
                          size="md"
                          testId={`competitor-avatar-${comp.id}`}
                        />
                        <div className="min-w-0">
                          <h4 className="text-xs font-semibold text-zinc-100 truncate" title={comp.title}>
                            {comp.title}
                          </h4>
                          {comp.customUrl && (
                            <span className="text-[11px] font-mono text-indigo-400 truncate block">
                              {comp.customUrl}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteCompetitor(comp.id)}
                        disabled={deletingId === comp.id}
                        data-testid={`delete-competitor-${comp.id}`}
                        className="text-zinc-500 hover:text-rose-400 p-1 transition-colors cursor-pointer"
                        title="Remove competitor"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {comp.description && (
                      <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                        {comp.description}
                      </p>
                    )}

                    {/* Stats Row */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-800/80 text-center font-mono text-[11px]">
                      <div className="bg-zinc-900/60 p-1.5 rounded border border-zinc-800/60">
                        <div className="text-[10px] text-zinc-500 uppercase">Subs</div>
                        <div className="text-zinc-200 font-medium">
                          {comp.hiddenSubscriberCount || comp.subscriberCount === null || comp.subscriberCount === undefined
                            ? 'Hidden'
                            : comp.subscriberCount.toLocaleString('en-US')}
                        </div>
                      </div>
                      <div className="bg-zinc-900/60 p-1.5 rounded border border-zinc-800/60">
                        <div className="text-[10px] text-zinc-500 uppercase">Views</div>
                        <div className="text-zinc-200 font-medium truncate" title={comp.viewCount.toLocaleString('en-US')}>
                          {comp.viewCount >= 1000000
                            ? `${(comp.viewCount / 1000000).toFixed(1)}M`
                            : comp.viewCount.toLocaleString('en-US')}
                        </div>
                      </div>
                      <div className="bg-zinc-900/60 p-1.5 rounded border border-zinc-800/60">
                        <div className="text-[10px] text-zinc-500 uppercase">Videos</div>
                        <div className="text-zinc-200 font-medium">{comp.videoCount.toLocaleString('en-US')}</div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCompetitor(comp);
                          setActiveUploadsComp(null);
                        }}
                        data-testid={`compare-btn-${comp.id}`}
                        className={`flex-1 py-1.5 px-2.5 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                          isSelected && !activeUploadsComp
                            ? 'bg-indigo-600 text-white'
                            : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800'
                        }`}
                      >
                        <ArrowUpDown className="w-3.5 h-3.5" />
                        <span>Compare</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveUploadsComp(isViewingUploads ? null : comp);
                        }}
                        data-testid={`uploads-btn-${comp.id}`}
                        className={`flex-1 py-1.5 px-2.5 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                          isViewingUploads
                            ? 'bg-zinc-800 text-white border border-zinc-700'
                            : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800'
                        }`}
                      >
                        <Film className="w-3.5 h-3.5" />
                        <span>{isViewingUploads ? 'Hide Uploads' : 'Latest Uploads'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Uploads Drawer / View (when activeUploadsComp is open) */}
          {activeUploadsComp && (
            <div className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-4" data-testid="competitor-uploads-section">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <Film className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">
                    Recent Uploads: {activeUploadsComp.title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveUploadsComp(null)}
                  className="text-zinc-500 hover:text-zinc-300 text-xs flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Close Uploads</span>
                </button>
              </div>

              {loadingUploads ? (
                <div className="py-8 flex items-center justify-center gap-2 text-xs text-zinc-400">
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-300" />
                  <span>Fetching latest uploads from YouTube Data API...</span>
                </div>
              ) : uploadsData?.videos && uploadsData.videos.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {uploadsData.videos.map((vid) => (
                    <div
                      key={vid.videoId}
                      className="rounded-md bg-zinc-900/80 border border-zinc-800 overflow-hidden flex flex-col justify-between"
                    >
                      <div className="relative aspect-video w-full bg-zinc-950 overflow-hidden">
                        <VideoThumbnail
                          url={vid.thumbnailUrl}
                          title={vid.title}
                          testId={`video-thumb-${vid.videoId}`}
                        />
                        {vid.duration && (
                          <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 text-zinc-100 font-mono text-[10px] font-medium flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5 text-zinc-400" />
                            <span>{vid.duration}</span>
                          </div>
                        )}
                      </div>

                      <div className="p-3 space-y-2 flex-1 flex flex-col justify-between">
                        <div className="space-y-1">
                          <div className="flex items-start justify-between gap-1.5">
                            <h5 className="text-xs font-semibold text-zinc-100 line-clamp-2 leading-snug" title={vid.title}>
                              {vid.title}
                            </h5>
                            <a
                              href={vid.youtubeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-zinc-500 hover:text-zinc-300 shrink-0 p-0.5"
                              title="Watch on YouTube"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono">
                            {vid.relativePublished}
                          </div>
                        </div>

                        <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[11px] font-mono text-zinc-400">
                          <div className="flex items-center gap-1" title="Views">
                            <Eye className="w-3 h-3 text-zinc-500" />
                            <span>{vid.viewCount.toLocaleString('en-US')}</span>
                          </div>
                          <div className="flex items-center gap-1" title="Likes">
                            <ThumbsUp className="w-3 h-3 text-zinc-500" />
                            <span>{vid.likeCount !== null && vid.likeCount !== undefined ? vid.likeCount.toLocaleString('en-US') : '—'}</span>
                          </div>
                          <div className="flex items-center gap-1" title="Comments">
                            <MessageSquare className="w-3 h-3 text-zinc-500" />
                            <span>{vid.commentCount !== null && vid.commentCount !== undefined ? vid.commentCount.toLocaleString('en-US') : '—'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-zinc-500">
                  No public uploads found for this competitor.
                </div>
              )}
            </div>
          )}

          {/* Side-by-Side Comparison Section */}
          {selectedCompetitor && (
            <div className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-5" data-testid="comparison-section">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">
                    Head-to-Head Comparison: {comparisonData?.userChannelTitle || 'My Channel'} vs {selectedCompetitor.title}
                  </h3>
                </div>
                <div className="text-[11px] font-mono text-zinc-400">
                  Source: Public YouTube Data API v3
                </div>
              </div>

              {loadingComparison ? (
                <div className="py-8 flex items-center justify-center gap-2 text-xs text-zinc-400">
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-300" />
                  <span>Calculating head-to-head metrics...</span>
                </div>
              ) : comparisonData ? (
                <div className="space-y-4">
                  {/* Metric Comparison Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-zinc-800 text-[11px] text-zinc-400 font-mono">
                          <th className="py-2.5 px-3">Metric</th>
                          <th className="py-2.5 px-3">{comparisonData.userChannelTitle} (You)</th>
                          <th className="py-2.5 px-3">{comparisonData.competitorTitle} (Competitor)</th>
                          <th className="py-2.5 px-3">Variance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60 font-mono">
                        {comparisonData.metrics.map((m) => {
                          const diff = m.diffPct;
                          const isPositive = diff !== null && diff !== undefined && diff > 0;
                          const isNegative = diff !== null && diff !== undefined && diff < 0;

                          return (
                            <tr key={m.metricKey} className="hover:bg-zinc-900/40 transition-colors">
                              <td className="py-3 px-3 font-sans font-medium text-zinc-200">
                                <div>{m.label}</div>
                                {m.note && (
                                  <div className="text-[10px] text-zinc-500 font-mono">{m.note}</div>
                                )}
                              </td>
                              <td className="py-3 px-3 text-zinc-100 font-semibold">
                                {typeof m.userValue === 'number'
                                  ? m.userValue.toLocaleString('en-US')
                                  : m.userValue ?? '—'}
                              </td>
                              <td className="py-3 px-3 text-zinc-300">
                                {typeof m.competitorValue === 'number'
                                  ? m.competitorValue.toLocaleString('en-US')
                                  : m.competitorValue ?? '—'}
                              </td>
                              <td className="py-3 px-3">
                                {diff !== null && diff !== undefined ? (
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                                      isPositive
                                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/80'
                                        : isNegative
                                        ? 'bg-rose-950 text-rose-400 border border-rose-800/80'
                                        : 'bg-zinc-800 text-zinc-400'
                                    }`}
                                  >
                                    {isPositive ? `+${diff}%` : `${diff}%`}
                                  </span>
                                ) : (
                                  <span className="text-zinc-500">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Privacy Disclosure Notice */}
                  <div
                    className="p-3.5 rounded-lg bg-zinc-900/90 border border-zinc-800 flex items-start gap-3 text-zinc-400"
                    data-testid="data-disclosure-notice"
                  >
                    <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                    <div className="space-y-1 text-xs">
                      <div className="font-semibold text-zinc-200">
                        Public vs Private Telemetry Disclosure
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        {comparisonData.privateDataDisclosure}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CompetitorsPage;
