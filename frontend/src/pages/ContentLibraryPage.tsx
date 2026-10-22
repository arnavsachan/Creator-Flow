import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  Film,
  Loader2,
  MessageSquare,
  Search,
  Sparkles,
  Tag,
  ThumbsUp,
  Tv,
  X,
} from 'lucide-react';
import { useAppMode } from '../context/AppModeContext';
import { getChannelDetails, getContentLibrary, startOAuth } from '../services/youtubeService';
import { dashboardSync } from '../services/dashboardSync';
import { ErrorState } from '../components/states/ErrorState';
import type {
  ChannelDetailsResponse,
  ContentLibraryResponse,
  ContentVideoItem,
} from '../types/youtube';

type SortOrder = 'date' | 'views' | 'likes' | 'title';

export const ContentLibraryPage: React.FC = () => {
  const { selectedChannelId } = useAppMode();

  // Channel details & content library state
  const [channelDetails, setChannelDetails] = useState<ChannelDetailsResponse | null>(null);
  const [libraryData, setLibraryData] = useState<ContentLibraryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingVideos, setLoadingVideos] = useState<boolean>(false);
  const [authorizing, setAuthorizing] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isQuotaError, setIsQuotaError] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const hasLoadedRef = useRef<boolean>(false);

  // Search, filter, and sort state
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('date');

  // Pagination page token & stack
  const [currentPageToken, setCurrentPageToken] = useState<string | undefined>(undefined);
  const [tokenHistory, setTokenHistory] = useState<string[]>([]);

  // Subscribe to global sync events
  useEffect(() => {
    const unsubscribe = dashboardSync.subscribeSyncTrigger(() => {
      setRefreshKey((k) => k + 1);
    });
    return unsubscribe;
  }, []);

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
      // Reset page token when search term changes
      setCurrentPageToken(undefined);
      setTokenHistory([]);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Reset pagination when sort order or channel changes
  useEffect(() => {
    setCurrentPageToken(undefined);
    setTokenHistory([]);
  }, [sortOrder, selectedChannelId]);

  // Load Channel Details
  useEffect(() => {
    let ignore = false;
    getChannelDetails(selectedChannelId)
      .then((res) => {
        if (!ignore) {
          setChannelDetails(res);
        }
      })
      .catch((err) => {
        if (!ignore) {
          console.warn('[ContentLibraryPage] Failed to load channel details:', err);
        }
      });

    return () => {
      ignore = true;
    };
  }, [selectedChannelId, refreshKey]);

  // Load Content Library Videos
  useEffect(() => {
    let ignore = false;
    if (!hasLoadedRef.current) {
      setLoading(true);
    } else {
      setLoadingVideos(true);
    }
    setApiError(null);
    setIsQuotaError(false);

    getContentLibrary({
      channelId: selectedChannelId,
      pageToken: currentPageToken,
      maxResults: 24,
      q: debouncedQuery || undefined,
      order: sortOrder,
    })
      .then((res) => {
        if (!ignore) {
          hasLoadedRef.current = true;
          setLibraryData(res);
          setLoading(false);
          setLoadingVideos(false);
        }
      })
      .catch((err: any) => {
        if (!ignore) {
          console.warn('[ContentLibraryPage] Failed to load content library:', err);
          const errorMsg: string = err?.message || 'Failed to fetch uploaded videos from YouTube Data API.';
          setApiError(errorMsg);
          if (
            err?.status === 429 ||
            errorMsg.toLowerCase().includes('quota') ||
            errorMsg.toLowerCase().includes('rate limit')
          ) {
            setIsQuotaError(true);
          }
          setLoading(false);
          setLoadingVideos(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [selectedChannelId, currentPageToken, debouncedQuery, sortOrder, refreshKey]);

  const handleAuthorizeDataApi = async () => {
    setAuthorizing(true);
    try {
      if (channelDetails?.authorizationUrl) {
        window.location.href = channelDetails.authorizationUrl;
        return;
      }
      if (libraryData?.authorizationUrl) {
        window.location.href = libraryData.authorizationUrl;
        return;
      }
      const res = await startOAuth();
      if (res.authorizationUrl) {
        window.location.href = res.authorizationUrl;
      }
    } catch (err) {
      console.error('[ContentLibraryPage] Failed to start OAuth authorization:', err);
      setAuthorizing(false);
    }
  };

  const handleNextPage = () => {
    if (libraryData?.nextPageToken) {
      setTokenHistory((prev) => [...prev, currentPageToken || '']);
      setCurrentPageToken(libraryData.nextPageToken);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrevPage = () => {
    if (tokenHistory.length > 0) {
      const prevToken = tokenHistory[tokenHistory.length - 1];
      setTokenHistory((prev) => prev.slice(0, -1));
      setCurrentPageToken(prevToken || undefined);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (libraryData?.prevPageToken) {
      setCurrentPageToken(libraryData.prevPageToken);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setDebouncedQuery('');
    setCurrentPageToken(undefined);
    setTokenHistory([]);
  };

  const isLive = libraryData?.isLive ?? channelDetails?.isLive ?? false;
  const isServiceDisabled =
    libraryData?.dataState === 'SERVICE_DISABLED' || channelDetails?.dataState === 'SERVICE_DISABLED';
  const isAuthRequired =
    libraryData?.dataState === 'AUTHORIZATION_REQUIRED' ||
    channelDetails?.dataState === 'AUTHORIZATION_REQUIRED' ||
    channelDetails?.hasDataScope === false;

  const videos: ContentVideoItem[] = libraryData?.videos || [];

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
              <Film className="w-5 h-5 text-zinc-300" />
              <span>YouTube Content Library</span>
            </h2>

            {isLive ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-950 text-emerald-400 border border-emerald-800/80">
                LIVE TELEMETRY
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-950 text-amber-400 border border-amber-800/80">
                DEMO / SAMPLE DATA
              </span>
            )}

            {isLive && !isServiceDisabled && !isAuthRequired && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-950 text-indigo-400 border border-indigo-800/80 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-indigo-400" />
                <span>YOUTUBE DATA API v3</span>
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            {channelDetails?.title
              ? `Browse, filter, and inspect public video uploads for ${channelDetails.title}.`
              : 'Public video uploads, durations, and statistics fetched via YouTube Data API v3 uploads playlist.'}
          </p>
        </div>

        {/* Quick Refresh */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading || loadingVideos}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh video catalog"
          >
            <Loader2 className={`w-3.5 h-3.5 ${loadingVideos ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Channel Summary Card (if details available) */}
      {channelDetails && !isAuthRequired && !isServiceDisabled && (
        <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            {channelDetails.thumbnailUrl ? (
              <img
                src={channelDetails.thumbnailUrl}
                alt={channelDetails.title}
                className="w-12 h-12 rounded-full border border-zinc-700/80 object-cover shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                <Tv className="w-6 h-6 text-zinc-400" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-zinc-100 truncate">{channelDetails.title}</h3>
                {channelDetails.customUrl && (
                  <span className="text-xs font-mono text-zinc-400">{channelDetails.customUrl}</span>
                )}
              </div>
              <p className="text-xs text-zinc-400 line-clamp-1 mt-0.5 max-w-xl">
                {channelDetails.description || 'Official creator channel connected via Google OAuth.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6 shrink-0 text-right self-stretch md:self-auto justify-between md:justify-end border-t md:border-t-0 pt-3 md:pt-0 border-zinc-800/80">
            <div>
              <div className="text-[11px] text-zinc-500 uppercase font-medium">Subscribers</div>
              <div className="text-sm font-semibold font-mono text-zinc-200">
                {channelDetails.subscriberCount.toLocaleString('en-US')}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-zinc-500 uppercase font-medium">Videos</div>
              <div className="text-sm font-semibold font-mono text-zinc-200">
                {channelDetails.videoCount.toLocaleString('en-US')}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-zinc-500 uppercase font-medium">Lifetime Views</div>
              <div className="text-sm font-semibold font-mono text-zinc-200">
                {channelDetails.viewCount.toLocaleString('en-US')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* API Disabled Notice Banner */}
      {isServiceDisabled && (
        <div
          className="p-4 rounded-lg bg-amber-950/40 border border-amber-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-amber-200"
          data-testid="api-disabled-banner"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-xs font-semibold text-amber-100">YouTube Data API v3 Not Enabled</div>
              <p className="text-xs text-amber-300/90 leading-relaxed">
                YouTube Data API v3 is disabled in your Google Cloud Project. Please enable it in the Google Cloud
                Console to query public channel uploads, metadata, durations, and statistics.
              </p>
            </div>
          </div>
          <a
            href="https://console.developers.google.com/apis/api/youtube.googleapis.com/overview"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 px-3.5 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <span>Enable in Google Cloud</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* Quota Error Notice Banner */}
      {isQuotaError && (
        <div
          className="p-4 rounded-lg bg-rose-950/40 border border-rose-800/80 flex items-start gap-3 text-rose-200"
          data-testid="quota-error-banner"
        >
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="text-xs font-semibold text-rose-100">YouTube Data API Quota Limit Exceeded</div>
            <p className="text-xs text-rose-300/90 leading-relaxed">
              Google Cloud YouTube Data API v3 rate limit or daily quota (10,000 units/day) has been reached. Please try
              again after quota resets at midnight Pacific Time.
            </p>
          </div>
        </div>
      )}

      {/* Re-authorization / Missing Scope Banner */}
      {isAuthRequired && (
        <div
          className="p-4 rounded-lg bg-indigo-950/40 border border-indigo-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-zinc-300"
          data-testid="authorize-banner"
        >
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-xs font-semibold text-zinc-100">
                Grant YouTube Data API Read Permissions
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Reading video uploads and durations requires the{' '}
                <code className="text-indigo-300 font-mono text-[11px]">youtube.readonly</code> OAuth scope. Re-authorize
                your Google connection to view full uploaded content.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAuthorizeDataApi}
            disabled={authorizing}
            data-testid="authorize-data-api-button"
            className="shrink-0 px-3.5 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            <span>{authorizing ? 'Redirecting to Google...' : 'Authorize YouTube Access'}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search, Filter & Sort Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#141418] p-3 rounded-lg border border-white/[0.06]">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by title, description, or tags..."
            data-testid="search-input"
            className="w-full pl-9 pr-8 py-1.5 bg-zinc-900 border border-zinc-800 rounded-md text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors"
          />
          {searchInput && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-2 justify-end">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <ArrowUpDown className="w-3.5 h-3.5 text-zinc-500" />
            <span className="hidden sm:inline">Sort:</span>
          </div>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            data-testid="sort-select"
            className="bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 cursor-pointer"
          >
            <option value="date">Newest First (Upload Date)</option>
            <option value="views">Most Views</option>
            <option value="likes">Most Likes</option>
            <option value="title">Title (A–Z)</option>
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div
          className="p-16 rounded-lg bg-[#141418] border border-white/[0.06] flex flex-col items-center justify-center gap-3 text-zinc-400 text-xs"
          data-testid="content-library-loading"
        >
          <Loader2 className="w-6 h-6 animate-spin text-zinc-300" />
          <span>Fetching uploaded videos from YouTube Data API...</span>
        </div>
      ) : apiError && !libraryData ? (
        <div className="py-12" data-testid="content-library-error">
          <ErrorState
            title="Unable to Load Content Library"
            message={apiError}
            onRetry={() => setRefreshKey((k) => k + 1)}
          />
        </div>
      ) : videos.length === 0 ? (
        <div
          className="py-16 text-center text-zinc-400 space-y-3 border border-dashed border-zinc-800 rounded-lg p-6"
          data-testid="content-library-empty"
        >
          <Film className="w-10 h-10 mx-auto text-zinc-600" />
          <h3 className="text-sm font-semibold text-zinc-200">
            {debouncedQuery ? `No videos match "${debouncedQuery}"` : 'No Uploaded Videos Found'}
          </h3>
          <p className="text-xs text-zinc-500 max-w-md mx-auto">
            {debouncedQuery
              ? 'Try modifying your search keywords or clear the filter to view all channel uploads.'
              : 'This channel currently has no public uploads in its default uploads playlist.'}
          </p>
          {debouncedQuery && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear Search Filter</span>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Results count indicator */}
          <div className="flex items-center justify-between text-xs text-zinc-500 px-1">
            <span>
              Showing <span className="font-mono text-zinc-300 font-medium">{videos.length}</span>{' '}
              {debouncedQuery ? `results for "${debouncedQuery}"` : 'uploaded videos'}
              {libraryData?.totalResults ? (
                <span>
                  {' '}
                  (of <span className="font-mono text-zinc-400">{libraryData.totalResults}</span> total)
                </span>
              ) : null}
            </span>
            {loadingVideos && (
              <span className="flex items-center gap-1 text-[11px] text-zinc-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Updating slice...</span>
              </span>
            )}
          </div>

          {/* Videos Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="videos-grid">
            {videos.map((vid) => (
              <div
                key={vid.videoId}
                data-testid={`video-card-${vid.videoId}`}
                className="rounded-lg bg-[#141418] border border-white/[0.06] hover:border-zinc-700/80 transition-all flex flex-col justify-between overflow-hidden group"
              >
                {/* Thumbnail Container */}
                <div className="relative aspect-video w-full bg-zinc-900 overflow-hidden">
                  {vid.thumbnailUrl ? (
                    <img
                      src={vid.thumbnailUrl}
                      alt={vid.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600">
                      <Film className="w-8 h-8" />
                    </div>
                  )}

                  {/* Duration Badge */}
                  {vid.duration && (
                    <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-xs text-zinc-100 font-mono text-[11px] font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3 text-zinc-400" />
                      <span>{vid.duration}</span>
                    </div>
                  )}

                  {/* HD / 4K Definition Badge */}
                  {vid.definition && (
                    <div className="absolute top-2 left-2 px-1 py-0.5 rounded bg-black/70 backdrop-blur-xs text-zinc-300 font-mono text-[9px] uppercase font-semibold">
                      {vid.definition}
                    </div>
                  )}
                </div>

                {/* Video Info Body */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <h4
                        className="text-xs font-semibold text-zinc-100 line-clamp-2 group-hover:text-zinc-50 leading-snug"
                        title={vid.title}
                      >
                        {vid.title}
                      </h4>
                      <a
                        href={`https://www.youtube.com/watch?v=${vid.videoId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-zinc-500 hover:text-zinc-300 shrink-0 p-1"
                        title="Watch on YouTube"
                        aria-label={`Watch ${vid.title} on YouTube`}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                      <span>{vid.relativePublished}</span>
                      {vid.privacyStatus && (
                        <>
                          <span>•</span>
                          <span className="capitalize">{vid.privacyStatus}</span>
                        </>
                      )}
                    </div>

                    {vid.description && (
                      <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                        {vid.description}
                      </p>
                    )}
                  </div>

                  {/* Public Statistics Row */}
                  <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs font-mono text-zinc-400">
                    <div className="flex items-center gap-1.5" title="Views">
                      <Eye className="w-3.5 h-3.5 text-zinc-500" />
                      <span>{vid.viewCount.toLocaleString('en-US')}</span>
                    </div>

                    <div className="flex items-center gap-1.5" title="Likes">
                      <ThumbsUp className="w-3.5 h-3.5 text-zinc-500" />
                      <span>{vid.likeCount !== null && vid.likeCount !== undefined ? vid.likeCount.toLocaleString('en-US') : '—'}</span>
                    </div>

                    <div className="flex items-center gap-1.5" title="Comments">
                      <MessageSquare className="w-3.5 h-3.5 text-zinc-500" />
                      <span>{vid.commentCount !== null && vid.commentCount !== undefined ? vid.commentCount.toLocaleString('en-US') : '—'}</span>
                    </div>
                  </div>

                  {/* Tags Row */}
                  {vid.tags && vid.tags.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      <Tag className="w-3 h-3 text-zinc-600 shrink-0" />
                      {vid.tags.slice(0, 3).map((tag, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 font-sans truncate max-w-[120px]"
                        >
                          #{tag}
                        </span>
                      ))}
                      {vid.tags.length > 3 && (
                        <span className="text-[10px] text-zinc-600">+{vid.tags.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          {(libraryData?.nextPageToken || tokenHistory.length > 0 || libraryData?.prevPageToken) && (
            <div className="flex items-center justify-between pt-4 border-t border-zinc-800" data-testid="pagination-controls">
              <button
                type="button"
                onClick={handlePrevPage}
                disabled={tokenHistory.length === 0 && !libraryData?.prevPageToken}
                data-testid="prev-page-btn"
                className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-xs font-medium text-zinc-300 hover:text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>

              <div className="text-xs text-zinc-500 font-mono">
                Page {tokenHistory.length + 1}
              </div>

              <button
                type="button"
                onClick={handleNextPage}
                disabled={!libraryData?.nextPageToken}
                data-testid="next-page-btn"
                className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-xs font-medium text-zinc-300 hover:text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ContentLibraryPage;
