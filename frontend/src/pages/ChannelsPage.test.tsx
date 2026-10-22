import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AppModeProvider } from '../context/AppModeContext';
import { ChannelsPage } from './ChannelsPage';
import * as youtubeService from '../services/youtubeService';

vi.mock('../services/youtubeService', () => ({
  getConnectionStatus: vi.fn(),
  startOAuth: vi.fn(),
  disconnectChannel: vi.fn(),
  syncChannel: vi.fn(),
  default: {
    getConnectionStatus: vi.fn(),
    startOAuth: vi.fn(),
    disconnectChannel: vi.fn(),
    syncChannel: vi.fn(),
  },
}));

const mockGetConnectionStatus = vi.mocked(youtubeService.getConnectionStatus);
const mockStartOAuth = vi.mocked(youtubeService.startOAuth);
const mockDisconnectChannel = vi.mocked(youtubeService.disconnectChannel);

describe('ChannelsPage Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders unconnected empty state when no channel is connected', async () => {
    mockGetConnectionStatus.mockResolvedValueOnce({
      connected: false,
      channel: null,
    });

    render(
      <AppModeProvider>
        <ChannelsPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('No YouTube Channel Connected')).toBeInTheDocument();
    });

    expect(
      screen.getByText('Connected Channels & OAuth Profiles')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connect youtube/i })).toBeInTheDocument();
  });

  it('initiates OAuth flow when Connect button is clicked', async () => {
    mockGetConnectionStatus.mockResolvedValueOnce({
      connected: false,
      channel: null,
    });
    mockStartOAuth.mockResolvedValueOnce({
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?test=1',
      state: 'state_123',
    });

    render(
      <AppModeProvider>
        <ChannelsPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('No YouTube Channel Connected')).toBeInTheDocument();
    });

    const connectBtn = screen.getByRole('button', { name: /connect youtube/i });
    fireEvent.click(connectBtn);

    await waitFor(() => {
      expect(mockStartOAuth).toHaveBeenCalledTimes(1);
    });
  });

  it('renders connected channel telemetry when channel is authenticated', async () => {
    mockGetConnectionStatus.mockResolvedValueOnce({
      connected: true,
      channel: {
        id: 'chan_123',
        channelId: 'UC_TEST_CHANNEL_456',
        title: 'Veritasium Tech Lab',
        customUrl: '@VeritasiumTech',
        thumbnailUrl: null,
        subscriberCount: 245000,
        videoCount: 180,
        viewCount: 15400000,
        status: 'connected',
        connectedAt: '2026-10-20T10:00:00Z',
        lastSyncedAt: '2026-10-20T12:00:00Z',
      },
    });

    render(
      <AppModeProvider>
        <ChannelsPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Veritasium Tech Lab')).toBeInTheDocument();
    });

    expect(screen.getByText('245,000')).toBeInTheDocument(); // exact subscribers
    expect(screen.getByText('180')).toBeInTheDocument(); // videos
    expect(screen.getByText('15,400,000')).toBeInTheDocument(); // exact unrounded views
    expect(screen.getByText('UC_TEST_CHANNEL_456')).toBeInTheDocument();
    expect(screen.getByText(/OAuth 2.0 Authenticated/i)).toBeInTheDocument();

    // Verify demo profiles are NOT in the primary view
    expect(screen.queryByText('Tech Pulse')).not.toBeInTheDocument();
    expect(screen.queryByText('Gaming Frontier')).not.toBeInTheDocument();
    expect(screen.getByTestId('toggle-sandbox-profiles')).toBeInTheDocument();

    // When developer explicitly expands sandbox profiles, they become visible
    fireEvent.click(screen.getByTestId('toggle-sandbox-profiles'));
    expect(screen.getByText('Tech Pulse')).toBeInTheDocument();
    expect(screen.getByText('Gaming Frontier')).toBeInTheDocument();
    expect(screen.getByText('Simulated Sandbox Only')).toBeInTheDocument();
  });

  it('renders sample demonstration channels clearly labeled as simulated when unconnected', async () => {
    mockGetConnectionStatus.mockResolvedValueOnce({
      connected: false,
      channel: null,
    });

    render(
      <AppModeProvider>
        <ChannelsPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('No YouTube Channel Connected')).toBeInTheDocument();
    });

    expect(screen.getByText('Sample Demonstration Channels (Sandbox Testing)')).toBeInTheDocument();
    expect(screen.getByText('Simulated Data Only')).toBeInTheDocument();
    expect(screen.getByText('Tech Pulse')).toBeInTheDocument();
    expect(screen.getByText('Gaming Frontier')).toBeInTheDocument();
  });

  it('opens disconnect modal and successfully disconnects channel', async () => {
    mockGetConnectionStatus.mockResolvedValueOnce({
      connected: true,
      channel: {
        id: 'chan_123',
        channelId: 'UC_TEST_DISCONNECT',
        title: 'Channel To Disconnect',
        customUrl: '@ToDisconnect',
        thumbnailUrl: null,
        subscriberCount: 5000,
        videoCount: 20,
        viewCount: 50000,
        status: 'connected',
        connectedAt: '2026-10-20T10:00:00Z',
        lastSyncedAt: '2026-10-20T12:00:00Z',
      },
    });
    mockDisconnectChannel.mockResolvedValueOnce({
      success: true,
      message: 'Channel disconnected',
    });

    render(
      <AppModeProvider>
        <ChannelsPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Channel To Disconnect')).toBeInTheDocument();
    });

    // Click Disconnect button
    const disconnectBtn = screen.getByRole('button', { name: /disconnect/i });
    fireEvent.click(disconnectBtn);

    // Modal appears
    expect(screen.getByText('Disconnect YouTube Channel?')).toBeInTheDocument();
    expect(
      screen.getByText(/will revoke OAuth access tokens with Google/i)
    ).toBeInTheDocument();

    // Confirm disconnect
    const confirmBtn = screen.getByRole('button', { name: /confirm disconnect/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockDisconnectChannel).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByText('No YouTube Channel Connected')).toBeInTheDocument();
    });
  });

  it('renders expired channel warning banner and triggers reconnect flow when clicked', async () => {
    mockGetConnectionStatus.mockResolvedValueOnce({
      connected: false,
      channel: {
        id: 'chan_expired',
        channelId: 'UC_EXPIRED_123',
        title: 'Expired Creator Channel',
        customUrl: '@ExpiredCreator',
        thumbnailUrl: null,
        subscriberCount: 12000,
        videoCount: 45,
        viewCount: 980000,
        status: 'expired',
        connectedAt: '2026-10-10T00:00:00Z',
        lastSyncedAt: '2026-10-15T00:00:00Z',
      },
    });
    mockStartOAuth.mockResolvedValueOnce({
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?test=reconnect',
      state: 'state_reconnect',
    });

    render(
      <AppModeProvider>
        <ChannelsPage />
      </AppModeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Expired Creator Channel')).toBeInTheDocument();
    });

    // Check EXPIRED badge and warning banner
    expect(screen.getByText('EXPIRED')).toBeInTheDocument();
    expect(
      screen.getByText(/YouTube OAuth authorization has expired or was revoked/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Authorization Expired — Reconnect Required/i)
    ).toBeInTheDocument();

    // Click Reconnect button
    const reconnectBtn = screen.getByRole('button', { name: /reconnect now/i });
    fireEvent.click(reconnectBtn);

    await waitFor(() => {
      expect(mockStartOAuth).toHaveBeenCalledTimes(1);
    });
  });
});
