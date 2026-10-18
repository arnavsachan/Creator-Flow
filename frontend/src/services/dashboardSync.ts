type Listener<T> = (value: T) => void;
type SyncTriggerListener = () => Promise<void> | void;

/**
 * Coordinates synchronization state between AppLayout and DashboardPage.
 * Eliminates fabricated timestamps and fake sync timers while ensuring
 * manual sync triggers real API requests without switching data mode.
 */
class DashboardSyncCoordinator {
  private lastSyncedAt: string | null = null;
  private isSyncing: boolean = false;
  private syncedAtListeners = new Set<Listener<string | null>>();
  private syncingListeners = new Set<Listener<boolean>>();
  private syncTriggerListeners = new Set<SyncTriggerListener>();

  getLastSyncedAt(): string | null {
    return this.lastSyncedAt;
  }

  setLastSyncedAt(timestamp: string | null): void {
    this.lastSyncedAt = timestamp;
    this.syncedAtListeners.forEach((listener) => {
      try {
        listener(timestamp);
      } catch (err) {
        console.error('[DashboardSync] Error notifying syncedAt listener:', err);
      }
    });
  }

  subscribeLastSyncedAt(listener: Listener<string | null>): () => void {
    this.syncedAtListeners.add(listener);
    listener(this.lastSyncedAt);
    return () => {
      this.syncedAtListeners.delete(listener);
    };
  }

  getIsSyncing(): boolean {
    return this.isSyncing;
  }

  setIsSyncing(syncing: boolean): void {
    this.isSyncing = syncing;
    this.syncingListeners.forEach((listener) => {
      try {
        listener(syncing);
      } catch (err) {
        console.error('[DashboardSync] Error notifying syncing listener:', err);
      }
    });
  }

  subscribeIsSyncing(listener: Listener<boolean>): () => void {
    this.syncingListeners.add(listener);
    listener(this.isSyncing);
    return () => {
      this.syncingListeners.delete(listener);
    };
  }

  triggerSync(): void {
    this.syncTriggerListeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('[DashboardSync] Error in sync trigger listener:', err);
      }
    });
  }

  subscribeSyncTrigger(listener: SyncTriggerListener): () => void {
    this.syncTriggerListeners.add(listener);
    return () => {
      this.syncTriggerListeners.delete(listener);
    };
  }
}

export const dashboardSync = new DashboardSyncCoordinator();
export default dashboardSync;
