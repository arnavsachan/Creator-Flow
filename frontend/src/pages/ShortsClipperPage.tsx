import { Scissors, Smartphone } from 'lucide-react';

const CLIPS = [
  {
    id: 1,
    title: 'The Exact 12-Minute Mistake in System Design',
    timestamp: '11:42 - 12:35 (53s)',
    viralPotential: '94% Viral Probability',
    hookScore: '9.2/10',
    status: 'Ready to Render',
  },
  {
    id: 2,
    title: 'Why SQLite is Crushing Vector DBs for Local RAG',
    timestamp: '04:18 - 05:08 (50s)',
    viralPotential: '88% Viral Probability',
    hookScore: '8.7/10',
    status: 'Ready to Render',
  },
  {
    id: 3,
    title: 'The Truth About FAANG Salary Negotiations',
    timestamp: '18:10 - 19:00 (50s)',
    viralPotential: '82% Viral Probability',
    hookScore: '8.1/10',
    status: 'Queued',
  },
];

export const ShortsClipperPage: React.FC = () => {
  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100 tracking-tight">
            AI Shorts & Viral Highlight Extractor
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Automatic long-form transcript scan for high-retention spikes and 9:16 vertical re-framing.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {CLIPS.map((clip) => (
          <div
            key={clip.id}
            className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] flex flex-col justify-between space-y-4"
          >
            {/* 9:16 Vertical Preview Placeholder */}
            <div className="w-full aspect-[9/16] max-h-72 mx-auto rounded-md bg-[#09090B] border border-zinc-800 flex flex-col items-center justify-center text-zinc-500 relative">
              <Smartphone className="w-8 h-8 text-zinc-600 mb-2" />
              <span className="text-[11px] font-mono text-zinc-400">9:16 Vertical Cut</span>
              <span className="text-[10px] font-mono text-zinc-600">{clip.timestamp}</span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-emerald-400 font-semibold">
                  {clip.viralPotential}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  Hook {clip.hookScore}
                </span>
              </div>
              <div className="text-xs font-semibold text-zinc-100 leading-snug">
                {clip.title}
              </div>
            </div>

            <button
              type="button"
              className="w-full py-2 px-3 rounded-md bg-zinc-900 border border-zinc-800 text-xs font-medium text-zinc-200 hover:text-white hover:border-zinc-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Export Vertical Cut</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ShortsClipperPage;
