import React, { createContext, useContext, useState } from 'react';
import type { DataState } from '../types/dataStates';

interface AppModeContextType {
  dataState: DataState;
  setDataState: (state: DataState) => void;
  selectedChannelId: string;
  setSelectedChannelId: (channelId: string) => void;
}

const AppModeContext = createContext<AppModeContextType | undefined>(undefined);

interface AppModeProviderProps {
  children: React.ReactNode;
  initialDataState?: DataState;
  initialChannelId?: string;
}

export const AppModeProvider: React.FC<AppModeProviderProps> = ({
  children,
  initialDataState = 'DEMO',
  initialChannelId = 'demo-channel-1',
}) => {
  const [dataState, setDataState] = useState<DataState>(initialDataState);
  const [selectedChannelId, setSelectedChannelId] = useState<string>(initialChannelId);

  return (
    <AppModeContext.Provider
      value={{
        dataState,
        setDataState,
        selectedChannelId,
        setSelectedChannelId,
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
