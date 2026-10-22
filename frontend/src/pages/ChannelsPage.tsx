import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Tv,
  Unlink,
  X,
} from 'lucide-react';
import { useAppMode } from '../context/AppModeContext';
import {
  disconnectChannel,
  getConnectionStatus,
  startOAuth,
  syncChannel,
} from '../services/youtubeService';
import { dashboardSync } from '../services/dashboardSync';
import type { ConnectedChannel } from '../types/youtube';


interface BannerState {
  type: 'success' | 'error';
  title: string;
  message: string;
}

function parseInitialBanner(): BannerState | null {
  if (typeof window === 'undefined') return null;
  const searchParams = new URLSearchParams(window.location.search);
  const successParam = searchParams.get('success');
  const errorParam = searchParams.get('error');
  const messageParam = searchParams.get('message');

  if (successParam === 'connected') {
    return {
      type: 'success',
      title: 'YouTube Channel Connected',
      message: 'Your official YouTube channel was connected successfully via Google OAuth 2.0.',
    };
  }
  if (errorParam) {
    let title = 'Connection Failed';
    if (errorParam === 'channel_already_connected') {
      title = 'Channel Already Connected';
    } else if (errorParam === 'no_channel_found') {
      title = 'No YouTube Channel Found';
    } else if (errorParam === 'access_denied') {
      title = 'Access Denied';
    }
    return {
      type: 'error',
      title,
      message: messageParam || 'Failed to authorize with Google or connect channel.',
    };
  }
  return null;
}

export const ChannelsPage: React.FC = () => {
  const { selectedChannelId, setSelectedChannelId, refreshConnection } = useAppMode();

  const [connectedChannel, setConnectedChannel] = useState<ConnectedChannel | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [connecting, setConnecting] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [disconnecting, setDisconnecting] = useState<boolean>(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState<boolean>(false);
  const [showSandboxProfiles, setShowSandboxProfiles] = useState<boolean>(false);
  const [banner, setBanner] = useState<BannerState | null>(parseInitialBanner);

  useEffect(() => {
    let ignore = false;
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.has('success') || searchParams.has('error')) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    getConnectionStatus()
      .then((data) => {
        if (!ignore) {
          if (data.connected && data.channel) {
            setConnectedChannel(data.channel);
            const channelIdParam = searchParams.get('channel_id');
            if (channelIdParam) {
              setSelectedChannelId(channelIdParam);
            }
          } else if (data.channel && data.channel.status === 'expired') {
            setConnectedChannel(data.channel);
          } else {
            setConnectedChannel(null);
          }
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          console.warn('Failed to load connection status:', err);
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [setSelectedChannelId]);

  const handleConnectClick = async () => {
    setConnecting(true);
    setBanner(null);
    try {
      const { authorizationUrl } = await startOAuth();
      window.location.href = authorizationUrl;
    } catch (err: any) {
      setConnecting(false);
      setBanner({
        type: 'error',
        title: 'OAuth Error',
        message: err.message || 'Could not initiate Google OAuth. Please check server configuration.',
      });
    }
  };

  const handleSyncClick = async () => {
    if (!connectedChannel) return;
    setSyncing(true);
    try {
      const updated = await syncChannel();
      setConnectedChannel(updated);
      dashboardSync.setLastSyncedAt(updated.lastSyncedAt ?? null);
      dashboardSync.triggerSync();
      await refreshConnection();
      setBanner({
        type: 'success',
        title: 'Channel Synchronized',
        message: 'Latest YouTube subscriber, video, and view counts were successfully refreshed.',
      });
    } catch (err: any) {
      setBanner({
        type: 'error',
        title: 'Sync Error',
        message: err?.message || 'Failed to sync latest telemetry from YouTube.',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnectConfirm = async () => {
    setDisconnecting(true);
    try {
      await disconnectChannel();
      setConnectedChannel(null);
      dashboardSync.setLastSyncedAt(null);
      setShowDisconnectModal(false);
      setSelectedChannelId('demo-channel-1');
      await refreshConnection();
      setBanner({
        type: 'success',
        title: 'Channel Disconnected',
        message: 'YouTube channel was disconnected and credentials revoked successfully.',
      });
    } catch (err: any) {
      setBanner({
        type: 'error',
        title: 'Disconnect Error',
        message: err?.message || 'Failed to disconnect channel.',
      });
    } finally {
      setDisconnecting(false);
    }
  };


  const DEMO_CHANNELS = [
    {
      id: 'demo-channel-1',
      name: 'Tech Pulse',
      handle: '@TechPulseOfficial',
      subs: '48.2K',
      videos: 142,
      status: 'Active (Demo)',
    },
    {
      id: 'demo-channel-2',
      name: 'Gaming Frontier',
      handle: '@GamingFrontierHQ',
      subs: '124.5K',
      videos: 310,
      status: 'Active (Demo)',
    },
  ];

  return (
    <div className="max-w-[1400px] mx-auto space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100 tracking-tight">
            Connected Channels & OAuth Profiles
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Manage authenticated YouTube creator accounts, Google OAuth 2.0 privileges, and telemetry synchronization.
          </p>
        </div>
        {!connectedChannel && (
          <button
            type="button"
            onClick={handleConnectClick}
            disabled={connecting}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
          >
            {connecting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            <span>{connecting ? 'Redirecting to Google...' : 'Connect YouTube'}</span>
          </button>
        )}
      </div>

      {/* Notifications / Alert Banner */}
      {banner && (
        <div
          className={`p-4 rounded-lg border flex items-start justify-between gap-3 ${
            banner.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
              : 'bg-red-950/40 border-red-500/40 text-red-200'
          }`}
        >
          <div className="flex items-start gap-3">
            {banner.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            )}
            <div>
              <div className="text-sm font-medium">{banner.title}</div>
              <div className="text-xs opacity-90 mt-0.5">{banner.message}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-zinc-400 hover:text-zinc-200 transition-colors p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Primary YouTube Channel Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Live YouTube Channel (OAuth 2.0)
          </h3>
          {connectedChannel && (
            <div className="flex items-center gap-2">
              {connectedChannel.status === 'expired' ? (
                <button
                  type="button"
                  onClick={handleConnectClick}
                  disabled={connecting}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${connecting ? 'animate-spin' : ''}`} />
                  <span>{connecting ? 'Redirecting...' : 'Reconnect Channel'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSyncClick}
                  disabled={syncing}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  <span>{syncing ? 'Syncing...' : 'Sync Telemetry'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowDisconnectModal(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-red-950/60 hover:bg-red-900/60 border border-red-800/50 text-red-300 text-xs font-medium transition-colors cursor-pointer"
              >
                <Unlink className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="p-8 rounded-lg bg-[#141418] border border-white/[0.06] flex items-center justify-center gap-3 text-zinc-400 text-xs">
            <Loader2 className="w-4 h-4 animate-spin text-zinc-300" />
            <span>Verifying YouTube connection status...</span>
          </div>
        ) : connectedChannel ? (
          <div
            onClick={() => setSelectedChannelId(connectedChannel.channelId)}
            className={`p-6 rounded-lg bg-[#141418] border transition-all cursor-pointer space-y-5 ${
              selectedChannelId === connectedChannel.channelId
                ? 'border-emerald-500/80 bg-zinc-900/80 ring-1 ring-emerald-500/50'
                : 'border-white/[0.08] hover:border-zinc-600'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                {connectedChannel.thumbnailUrl ? (
                  <img
                    src={connectedChannel.thumbnailUrl}
                    alt={connectedChannel.title}
                    className="w-14 h-14 rounded-full border border-zinc-700 object-cover"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-red-950/50 border border-red-700/50 flex items-center justify-center text-red-400">
                    <Tv className="w-7 h-7" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-zinc-100">
                      {connectedChannel.title}
                    </span>
                    {connectedChannel.status === 'expired' ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-950 text-amber-400 border border-amber-800/80">
                        EXPIRED
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-950 text-emerald-400 border border-emerald-800/80">
                        LIVE
                      </span>
                    )}
                    {selectedChannelId === connectedChannel.channelId && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-200 border border-zinc-700">
                        CURRENTLY ACTIVE
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-400 font-mono mt-0.5">
                    {connectedChannel.customUrl || connectedChannel.channelId}
                  </div>
                </div>
              </div>

              <div className="text-right text-xs">
                <span className="text-zinc-500 block">External Channel ID</span>
                <span className="text-zinc-300 font-mono text-[11px]">{connectedChannel.channelId}</span>
              </div>
            </div>

            {connectedChannel.status === 'expired' && (
              <div className="p-3.5 rounded-md bg-amber-950/40 border border-amber-800/60 flex items-center justify-between gap-3 text-xs text-amber-200">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>YouTube OAuth authorization has expired or was revoked. Reconnect your account to restore live metrics.</span>
                </div>
                <button
                  type="button"
                  onClick={handleConnectClick}
                  disabled={connecting}
                  className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {connecting ? 'Redirecting...' : 'Reconnect Now'}
                </button>
              </div>
            )}

            {/* Metrics Grid */}
            <div className="pt-4 border-t border-zinc-800 grid grid-cols-3 gap-4">
              <div className="p-3 rounded bg-zinc-900/50 border border-white/[0.03]">
                <div className="text-xs text-zinc-500">Subscribers</div>
                <div className="text-base font-semibold text-zinc-100 font-mono mt-0.5">
                  {connectedChannel.subscriberCount.toLocaleString('en-US')}
                </div>
                <div className="text-[10px] text-zinc-500 font-sans mt-0.5">Public count</div>
              </div>
              <div className="p-3 rounded bg-zinc-900/50 border border-white/[0.03]">
                <div className="text-xs text-zinc-500">Total Uploads</div>
                <div className="text-base font-semibold text-zinc-100 font-mono mt-0.5">
                  {connectedChannel.videoCount.toLocaleString('en-US')}
                </div>
                <div className="text-[10px] text-zinc-500 font-sans mt-0.5">Public videos</div>
              </div>
              <div className="p-3 rounded bg-zinc-900/50 border border-white/[0.03]">
                <div className="text-xs text-zinc-500">Total Views</div>
                <div className="text-base font-semibold text-zinc-100 font-mono mt-0.5">
                  {connectedChannel.viewCount.toLocaleString('en-US')}
                </div>
                <div className="text-[10px] text-zinc-500 font-sans mt-0.5">YouTube Data API v3</div>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1">
              <span>Status: <strong className={connectedChannel.status === 'expired' ? 'text-amber-400 font-medium' : 'text-emerald-400 font-medium'}>
                {connectedChannel.status === 'expired' ? 'Authorization Expired — Reconnect Required' : 'OAuth 2.0 Authenticated'}
              </strong></span>
              <span>
                Last Synced:{' '}
                {new Date(connectedChannel.lastSyncedAt).toLocaleString(undefined, {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </span>
            </div>
          </div>
        ) : (
          <div className="p-8 rounded-lg bg-[#141418] border border-dashed border-zinc-700/80 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-950/40 border border-red-800/40 mx-auto flex items-center justify-center text-red-400">
              <Tv className="w-6 h-6" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <div className="text-sm font-semibold text-zinc-200">
                No YouTube Channel Connected
              </div>
              <p className="text-xs text-zinc-400">
                Connect your YouTube creator account using Google OAuth 2.0 to access live telemetry, views, and audience analytics.
              </p>
            </div>
            <button
              type="button"
              onClick={handleConnectClick}
              disabled={connecting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {connecting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ExternalLink className="w-3.5 h-3.5" />
              )}
              <span>{connecting ? 'Redirecting to Google...' : 'Connect Channel with Google'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Sandbox / Demo Channels Section */}
      {connectedChannel ? (
        <div className="pt-4 border-t border-zinc-800/80">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowSandboxProfiles((prev) => !prev)}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1.5 cursor-pointer font-mono"
              data-testid="toggle-sandbox-profiles"
            >
              <span>
                {showSandboxProfiles
                  ? '▾ Hide Developer Sandbox Profiles'
                  : '▸ Show Developer Sandbox Profiles (Simulated)'}
              </span>
            </button>
            {showSandboxProfiles && (
              <span className="text-[10px] text-amber-500/90 font-mono px-2 py-0.5 rounded bg-amber-950/40 border border-amber-800/40">
                Simulated Sandbox Only
              </span>
            )}
          </div>

          {showSandboxProfiles && (
            <div className="mt-4 space-y-3" data-testid="sandbox-profiles-section">
              <p className="text-xs text-zinc-500">
                These are simulated creator profiles for offline development and testing. Selecting one will temporarily switch the active workspace to simulated telemetry.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {DEMO_CHANNELS.map((ch) => {
                  const isSelected = selectedChannelId === ch.id;
                  return (
                    <div
                      key={ch.id}
                      onClick={() => setSelectedChannelId(ch.id)}
                      className={`p-5 rounded-lg bg-[#141418] border transition-all cursor-pointer flex flex-col justify-between space-y-4 ${
                        isSelected
                          ? 'border-zinc-500/80 bg-zinc-900/60 ring-1 ring-zinc-500/50'
                          : 'border-white/[0.06] hover:border-zinc-700/80'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
                            <Tv className="w-5 h-5 text-zinc-300" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5">
                              {ch.name}
                              <CheckCircle2 className="w-3.5 h-3.5 text-zinc-400" />
                            </div>
                            <div className="text-xs text-zinc-500 font-mono">{ch.handle}</div>
                          </div>
                        </div>
                        {isSelected && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-200 border border-zinc-700">
                            ACTIVE
                          </span>
                        )}
                      </div>

                      <div className="pt-2 border-t border-zinc-800/80 grid grid-cols-2 gap-2 text-xs font-mono">
                        <div>
                          <span className="text-zinc-500">Subscribers</span>
                          <div className="text-zinc-200 font-medium">{ch.subs}</div>
                        </div>
                        <div>
                          <span className="text-zinc-500">Uploads</span>
                          <div className="text-zinc-200 font-medium">{ch.videos}</div>
                        </div>
                      </div>

                      <div className="text-[11px] text-zinc-400 flex items-center justify-between">
                        <span className="text-amber-500/90">{ch.status}</span>
                        <span className="text-zinc-600 font-mono text-[10px]">{ch.id}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3 pt-4 border-t border-zinc-800/80" data-testid="sandbox-profiles-section">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Sample Demonstration Channels (Sandbox Testing)
            </h3>
            <span className="text-[10px] text-amber-500/90 font-mono px-2 py-0.5 rounded bg-amber-950/40 border border-amber-800/40">
              Simulated Data Only
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            No live YouTube channel connected. You can test workspace features using the simulated sample profiles below:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DEMO_CHANNELS.map((ch) => {
              const isSelected = selectedChannelId === ch.id;
              return (
                <div
                  key={ch.id}
                  onClick={() => setSelectedChannelId(ch.id)}
                  className={`p-5 rounded-lg bg-[#141418] border transition-all cursor-pointer flex flex-col justify-between space-y-4 ${
                    isSelected
                      ? 'border-zinc-500/80 bg-zinc-900/60 ring-1 ring-zinc-500/50'
                      : 'border-white/[0.06] hover:border-zinc-700/80'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
                        <Tv className="w-5 h-5 text-zinc-300" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5">
                          {ch.name}
                          <CheckCircle2 className="w-3.5 h-3.5 text-zinc-400" />
                        </div>
                        <div className="text-xs text-zinc-500 font-mono">{ch.handle}</div>
                      </div>
                    </div>
                    {isSelected && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-200 border border-zinc-700">
                        ACTIVE
                      </span>
                    )}
                  </div>

                  <div className="pt-2 border-t border-zinc-800/80 grid grid-cols-2 gap-2 text-xs font-mono">
                    <div>
                      <span className="text-zinc-500">Subscribers</span>
                      <div className="text-zinc-200 font-medium">{ch.subs}</div>
                    </div>
                    <div>
                      <span className="text-zinc-500">Uploads</span>
                      <div className="text-zinc-200 font-medium">{ch.videos}</div>
                    </div>
                  </div>

                  <div className="text-[11px] text-zinc-400 flex items-center justify-between">
                    <span className="text-amber-500/90">{ch.status}</span>
                    <span className="text-zinc-600 font-mono text-[10px]">{ch.id}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Disconnect Confirmation Modal */}
      {showDisconnectModal && connectedChannel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#18181b] border border-zinc-700 rounded-lg max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-950/60 border border-red-800/60 flex items-center justify-center text-red-400 shrink-0">
                <Unlink className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-zinc-100">
                  Disconnect YouTube Channel?
                </h4>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  Disconnecting <strong className="text-zinc-200">{connectedChannel.title}</strong> will revoke OAuth access tokens with Google and remove stored credentials from the server.
                </p>
              </div>
            </div>

            <div className="p-3 rounded bg-zinc-900 border border-white/[0.04] text-[11px] text-zinc-400 space-y-1">
              <div>• Credentials will be immediately revoked with Google.</div>
              <div>• Stored OAuth tokens are permanently deleted.</div>
              <div>• Permitted historical channel metrics will remain preserved.</div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDisconnectModal(false)}
                disabled={disconnecting}
                className="px-3 py-1.5 rounded text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDisconnectConfirm}
                disabled={disconnecting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
              >
                {disconnecting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{disconnecting ? 'Disconnecting...' : 'Confirm Disconnect'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChannelsPage;
