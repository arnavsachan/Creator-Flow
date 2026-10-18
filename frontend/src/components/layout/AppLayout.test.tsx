import { describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppModeProvider } from '../../context/AppModeContext';
import { AppLayout } from './AppLayout';
import { dashboardSync } from '../../services/dashboardSync';

describe('AppLayout and DataStateBanner', () => {
  it('renders "Not synced yet / unknown" initially with no fabricated timestamp like "Just now"', () => {
    dashboardSync.setLastSyncedAt(null);

    render(
      <MemoryRouter>
        <AppModeProvider initialDataState="LIVE" initialChannelId="uc-live-001">
          <AppLayout />
        </AppModeProvider>
      </MemoryRouter>
    );

    // Must not show fabricated 'Just now'
    expect(screen.queryByText(/Synced Just now/i)).not.toBeInTheDocument();
    // Must show explicit not synced yet / unknown state
    expect(screen.getByText('Not synced yet / unknown')).toBeInTheDocument();
  });

  it('displays real last_synced_at when notified by sync coordinator', () => {
    dashboardSync.setLastSyncedAt(null);

    render(
      <MemoryRouter>
        <AppModeProvider initialDataState="LIVE" initialChannelId="uc-live-001">
          <AppLayout />
        </AppModeProvider>
      </MemoryRouter>
    );

    act(() => {
      dashboardSync.setLastSyncedAt('2026-10-19T03:00:00Z');
    });

    expect(screen.getByText('Synced 2026-10-19T03:00:00Z')).toBeInTheDocument();
  });

  it('triggers real sync without fake 800ms timer and without switching to DEMO when UNAVAILABLE', () => {
    dashboardSync.setLastSyncedAt(null);
    const syncSpy = vi.fn();
    const unsub = dashboardSync.subscribeSyncTrigger(syncSpy);

    render(
      <MemoryRouter>
        <AppModeProvider initialDataState="UNAVAILABLE" initialChannelId="uc-live-001">
          <AppLayout />
        </AppModeProvider>
      </MemoryRouter>
    );

    // Reconnect stream button in banner
    const reconnectButton = screen.getByText('Reconnect Stream');
    act(() => {
      reconnectButton.click();
    });

    // Verify it called the coordinator directly without waiting 800ms
    expect(syncSpy).toHaveBeenCalledTimes(1);

    // Verify OFFLINE badge is still present in the banner and did NOT switch to DEMO
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('OFFLINE');
    expect(banner).not.toHaveTextContent('DEMO');

    unsub();
  });
});
