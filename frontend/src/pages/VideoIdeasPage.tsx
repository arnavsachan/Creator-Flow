import React, { useState } from 'react';
import { ArrowUpRight, Search } from 'lucide-react';

const IDEAS = [
  {
    id: 1,
    title: 'Why Most Engineers Fail System Design Interviews in 2026',
    score: 94,
    searchVol: 'High (48k/mo)',
    competition: 'Low',
    angle: 'Counter-intuitive career breakdown',
    ctrForecast: '8.8%',
  },
  {
    id: 2,
    title: 'Local LLMs on Apple Silicon: Speed, VRAM & Real Limits',
    score: 91,
    searchVol: 'Very High (110k/mo)',
    competition: 'Medium',
    angle: 'Hands-on benchmark shootout',
    ctrForecast: '8.2%',
  },
  {
    id: 3,
    title: 'How SQLite Became the Most Important Database for AI Agents',
    score: 88,
    searchVol: 'Rising (+64%)',
    competition: 'Low',
    angle: 'Architectural paradigm shift',
    ctrForecast: '7.5%',
  },
  {
    id: 4,
    title: 'I Automated 100 YouTube Shorts with Python — Did it Work?',
    score: 85,
    searchVol: 'High (72k/mo)',
    competition: 'High',
    angle: 'Transparent reality case study',
    ctrForecast: '7.1%',
  },
];

export const VideoIdeasPage: React.FC = () => {
  const [query, setQuery] = useState('');

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100 tracking-tight">
            Video Ideas & SEO Opportunity Lab
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Algorithmic topic discovery, keyword volume forecasts, and predicted click-through curves.
          </p>
        </div>
      </div>

      {/* Query Bar */}
      <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] flex items-center gap-3">
        <Search className="w-4 h-4 text-zinc-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter a creator niche or seed topic (e.g. AI Agents, Fullstack Architecture, Rust)..."
          className="bg-transparent text-xs text-zinc-100 w-full focus:outline-none placeholder:text-zinc-600 font-sans"
        />
        <button
          type="button"
          className="px-3 py-1.5 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-medium transition-colors shrink-0 cursor-pointer"
        >
          Generate Concepts
        </button>
      </div>

      {/* Ideas List */}
      <div className="space-y-3">
        {IDEAS.map((idea) => (
          <div
            key={idea.id}
            className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] hover:border-zinc-700/80 transition-all space-y-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                  SCORE {idea.score}/100
                </span>
                <span className="text-xs text-zinc-400 font-medium">{idea.angle}</span>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono text-zinc-400">
                <span>Vol: <strong className="text-zinc-200">{idea.searchVol}</strong></span>
                <span>Comp: <strong className="text-zinc-200">{idea.competition}</strong></span>
                <span className="text-emerald-400 font-semibold">Est. CTR: {idea.ctrForecast}</span>
              </div>
            </div>

            <div className="text-sm font-semibold text-zinc-100">{idea.title}</div>

            <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-xs">
              <span className="text-zinc-500 font-mono text-[11px]">Ranked #1 for viral velocity</span>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-zinc-300 hover:text-white font-medium cursor-pointer"
              >
                <span>Draft Hook in Script Studio</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default VideoIdeasPage;
