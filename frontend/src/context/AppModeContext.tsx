import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { DataState } from '../types/dataStates';
import type { ConnectedChannel } from '../types/youtube';
import { getConnectionStatus, syncChannel } from '../services/youtubeService';
import { dashboardSync } from '../services/dashboardSync';
import { isDemoChannel } from '../utils/channelMode';

export type DateRangeOption = '7d' | '28d' | '90d' | '365d';

interface AppModeContextType {
  dataState: DataState;
  setDataState: (state: DataState) => void;
  selectedChannelId: string;
  setSelectedChannelId: (channelId: string) => void;
  connectedChannel: ConnectedChannel | null;
  refreshConnection: () => Promise<void>;
  syncTelemetry: () => Promise<ConnectedChannel | null>;
  dateRange: DateRangeOption;
  setDateRange: (range: DateRangeOption) => void;
}

const AppModeContext = createContext<AppModeContextType | undefined>(undefined);

interface AppModeProviderProps {
  children: React.ReactNode;
  initialDataState?: DataState;
  initialChannelId?: string;
  initialDateRange?: DateRangeOption;
}

export const AppModeProvider: React.FC<AppModeProviderProps> = ({
  children,
  initialDataState = 'DEMO',
  initialChannelId = 'demo-channel-1',
  initialDateRange,
}) => {
  const [dataState, setDataState] = useState<DataState>(() => {
    const saved = localStorage.getItem('app_data_state') as DataState | null;
    return saved ?? initialDataState;
  });

  const [selectedChannelId, setSelectedChannelIdState] = useState<string>(() => {
    const saved = localStorage.getItem('selected_channel_id');
    return saved || initialChannelId;
  });

  const [connectedChannel, setConnectedChannel] = useState<ConnectedChannel | null>(null);
  const [dateRange, setDateRangeState] = useState<DateRangeOption>(() => {
    if (initialDateRange) return initialDateRange;
    const saved = localStorage.getItem('app_date_range') as DateRangeOption | null;
    return saved && ['7d', '28d', '90d', '365d'].includes(saved) ? saved : '28d';
  });

  const setDateRange = useCallback((range: DateRangeOption) => {
    setDateRangeState(range);
    localStorage.setItem('app_date_range', range);
  }, []);

  const setSelectedChannelId = useCallback((channelId: string) => {
    setSelectedChannelIdState(channelId);
    localStorage.setItem('selected_channel_id', channelId);
    if (isDemoChannel(channelId)) {
      setDataState('DEMO');
      localStorage.setItem('app_data_state', 'DEMO');
    } else {
      setDataState('LIVE');
      localStorage.setItem('app_data_state', 'LIVE');
    }
  }, []);

  const refreshConnection = useCallback(async () => {
    try {
      const statusRes = await getConnectionStatus();
      if (statusRes?.connected && statusRes?.channel) {
        setConnectedChannel(statusRes.channel);
        dashboardSync.setLastSyncedAt(statusRes.channel.lastSyncedAt ?? null);
        const currentSaved = localStorage.getItem('selected_channel_id');
        // If no explicit channel chosen or if the saved channel is the live channel, select it
        if (!currentSaved || currentSaved === statusRes.channel.channelId) {
          setSelectedChannelIdState(statusRes.channel.channelId);
          setDataState('LIVE');
          localStorage.setItem('selected_channel_id', statusRes.channel.channelId);
          localStorage.setItem('app_data_state', 'LIVE');
        } else if (isDemoChannel(currentSaved)) {
          setSelectedChannelIdState(currentSaved);
          setDataState('DEMO');
        }
      } else {
        setConnectedChannel(null);
        dashboardSync.setLastSyncedAt(null);
        const currentSaved = localStorage.getItem('selected_channel_id');
        if (currentSaved && !isDemoChannel(currentSaved)) {
          setSelectedChannelIdState('demo-channel-1');
          setDataState('DEMO');
          localStorage.setItem('selected_channel_id', 'demo-channel-1');
          localStorage.setItem('app_data_state', 'DEMO');
        }
      }
    } catch (err: unknown) {
      console.warn('[AppModeContext] Could not verify channel connection on mount:', err);
    }
  }, []);

  const syncTelemetry = useCallback(async (): Promise<ConnectedChannel | null> => {
    if (!connectedChannel) return null;
    dashboardSync.setIsSyncing(true);
    try {
      const updated = await syncChannel();
      setConnectedChannel(updated);
      dashboardSync.setLastSyncedAt(updated.lastSyncedAt ?? null);
      dashboardSync.triggerSync();
      return updated;
    } finally {
      dashboardSync.setIsSyncing(false);
    }
  }, [connectedChannel]);

  useEffect(() => {
    refreshConnection();
  }, [refreshConnection]);

  return (
    <AppModeContext.Provider
      value={{
        dataState,
        setDataState,
        selectedChannelId,
        setSelectedChannelId,
        connectedChannel,
        refreshConnection,
        syncTelemetry,
        dateRange,
        setDateRange,
      }}
    >
      {children}
    </AppModeContext.Provider>
  );
};

export const useAppMode = (): AppModeContextType => {
  const context = useContext(AppModeContext);
  if (!context) {
    throw new Error('useAppMode must be used within an AppModeProvider');
  }
  return context;
};

export default AppModeProvider;
