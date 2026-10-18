import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAppMode } from '../../context/AppModeContext';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { DataStateBanner } from '../states/DataStateBanner';

export const AppLayout: React.FC = () => {
  const { dataState, setDataState } = useAppMode();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>('Just now');

  const handleSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      setLastSyncedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      if (dataState === 'UNAVAILABLE') {
        setDataState('DEMO');
      }
    }, 800);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#09090B] text-zinc-50 antialiased font-sans">
      {/* Fixed Left Navigation */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Slim State Banner (h-8) */}
        <DataStateBanner
          state={dataState}
          lastSyncedAt={lastSyncedAt}
          onRefresh={handleSync}
        />

        {/* Global Topbar Header (h-14) */}
        <Topbar onRefresh={handleSync} isSyncing={isSyncing} />

        {/* Scrollable Viewport */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-[#09090B] p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
