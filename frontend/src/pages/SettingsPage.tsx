import React, { useState } from 'react';
import { Check, Key, Save, Server, Sliders } from 'lucide-react';
import { useAppMode } from '../context/AppModeContext';

export const SettingsPage: React.FC = () => {
  const { dataState, setDataState } = useAppMode();
  const [saved, setSaved] = useState(false);
  const [apiUrl, setApiUrl] = useState('http://127.0.0.1:8000/api/v1');
  const [quotaLimit, setQuotaLimit] = useState('10000');

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-[1000px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100 tracking-tight">
            System Preferences & Integrations
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Configure backend telemetry endpoints, YouTube Data API tokens, and AI model parameters.
          </p>
        </div>
        <button
          onClick={handleSave}
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-medium transition-colors cursor-pointer"
        >
          {saved ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Save className="w-3.5 h-3.5" />}
          <span>{saved ? 'Saved' : 'Save Preferences'}</span>
        </button>
      </div>

      <div className="space-y-4">
        {/* Backend Endpoint Config */}
        <div className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-400">
            <Server className="w-4 h-4 text-zinc-500" />
            <span>Telemetry & Backend Ingestion API</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="text-zinc-400 font-medium">Backend Base URL</label>
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                className="w-full bg-[#09090B] border border-zinc-800 rounded-md px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-700"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-zinc-400 font-medium">Daily API Quota Limit (Units)</label>
              <input
                type="text"
                value={quotaLimit}
                onChange={(e) => setQuotaLimit(e.target.value)}
                className="w-full bg-[#09090B] border border-zinc-800 rounded-md px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-zinc-700"
              />
            </div>
          </div>
        </div>

        {/* Environment Mode */}
        <div className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-400">
            <Sliders className="w-4 h-4 text-zinc-500" />
            <span>Developer Sandbox & Mock Data State</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs">
              <div className="font-medium text-zinc-200">Current Data State Mode</div>
              <div className="text-zinc-500 mt-0.5">Toggle between synthetic demo sandbox and live API streaming.</div>
            </div>

            <div className="flex items-center bg-[#09090B] border border-zinc-800 rounded-md p-0.5 text-xs">
              {(['DEMO', 'LIVE', 'STALE', 'UNAVAILABLE'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setDataState(st)}
                  type="button"
                  className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors cursor-pointer ${
                    dataState === st ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Security / Tokens */}
        <div className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-400">
            <Key className="w-4 h-4 text-zinc-500" />
            <span>YouTube Data API v3 OAuth Credentials</span>
          </div>

          <div className="p-3 rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-400 font-mono flex items-center justify-between">
            <span>OAuth 2.0 Web Application Client</span>
            <span className="text-[10px] text-emerald-400">Configured in backend/.env</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
