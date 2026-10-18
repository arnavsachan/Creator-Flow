import React from 'react';
import { Bot, ChevronDown, Radio } from 'lucide-react';
import { useAppMode } from '../../context/AppModeContext';
import type { DataState } from '../../types/dataStates';
import { cn } from '../../utils/cn';

export const Navbar: React.FC = () => {
  const { dataState, setDataState, selectedChannelId, setSelectedChannelId } = useAppMode();

  const states: DataState[] = ['DEMO', 'LIVE', 'STALE', 'UNAVAILABLE'];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-800 bg-[#0B0F19]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base sm:text-lg text-white tracking-tight">
                CreatorBuddy
              </span>
              <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                AI
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Intelligent Copilot & Analytics
            </p>
          </div>
        </div>

        {/* Channel & Data State Controls */}
        <div className="flex items-center gap-3">
          {/* Channel Selector */}
          <div className="relative hidden md:flex items-center">
            <select
              value={selectedChannelId}
              onChange={(e) => setSelectedChannelId(e.target.value)}
              className="appearance-none bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg px-3 py-1.5 pr-8 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="demo-channel-1">Tech Pulse (Demo Channel)</option>
              <option value="demo-channel-2">Gaming Universe (Demo Channel)</option>
              <option value="uc-live-001">Connected: @MrCreator (Live)</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 pointer-events-none" />
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs">
            {states.map((st) => (
              <button
                key={st}
                onClick={() => setDataState(st)}
                type="button"
                className={cn(
                  'px-2.5 py-1 rounded-lg font-medium transition-all duration-150 cursor-pointer',
                  dataState === st
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                )}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Live indicator badge */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300">
            <Radio
              className={cn(
                'w-3 h-3',
                dataState === 'LIVE'
                  ? 'text-emerald-400 animate-pulse'
                  : 'text-amber-400'
              )}
            />
            <span className="font-mono text-[11px]">Phase 1</span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
