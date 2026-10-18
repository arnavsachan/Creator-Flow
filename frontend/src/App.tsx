import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppModeProvider } from './context/AppModeContext';
import { AppLayout } from './components/layout/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AudiencePage } from './pages/AudiencePage';
import { ChannelsPage } from './pages/ChannelsPage';
import { VideoIdeasPage } from './pages/VideoIdeasPage';
import { ScriptStudioPage } from './pages/ScriptStudioPage';
import { ThumbnailLabPage } from './pages/ThumbnailLabPage';
import { ShortsClipperPage } from './pages/ShortsClipperPage';
import { CompetitorsPage } from './pages/CompetitorsPage';
import { ContentPlannerPage } from './pages/ContentPlannerPage';
import { SettingsPage } from './pages/SettingsPage';

export const App: React.FC = () => {
  return (
    <AppModeProvider initialDataState="DEMO">
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/audience-insights" element={<AudiencePage />} />
            <Route path="/channels" element={<ChannelsPage />} />
            <Route path="/video-ideas" element={<VideoIdeasPage />} />
            <Route path="/script-generator" element={<ScriptStudioPage />} />
            <Route path="/thumbnail-analyzer" element={<ThumbnailLabPage />} />
            <Route path="/shorts-generator" element={<ShortsClipperPage />} />
            <Route path="/competitors" element={<CompetitorsPage />} />
            <Route path="/content-planner" element={<ContentPlannerPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<DashboardPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppModeProvider>
  );
};

export default App;
