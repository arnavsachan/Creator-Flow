import { Plus } from 'lucide-react';

interface ScheduledCard {
  title: string;
  format: 'Long-form' | 'Short';
  stage: 'Idea' | 'Scripting' | 'Editing' | 'Ready';
  date: string;
}

const COLUMNS: { name: string; stage: ScheduledCard['stage']; color: string }[] = [
  { name: 'Concept Backlog', stage: 'Idea', color: 'border-zinc-800' },
  { name: 'Scripting & Research', stage: 'Scripting', color: 'border-amber-500/20' },
  { name: 'Post-Production', stage: 'Editing', color: 'border-indigo-500/20' },
  { name: 'Ready for Upload', stage: 'Ready', color: 'border-emerald-500/20' },
];

const ITEMS: ScheduledCard[] = [
  { title: 'Vector Database Benchmarking 2026', format: 'Long-form', stage: 'Idea', date: 'Oct 28' },
  { title: 'How We Scaled SQLite to 10k QPS', format: 'Long-form', stage: 'Scripting', date: 'Oct 24' },
  { title: 'Top 3 System Design Traps', format: 'Short', stage: 'Editing', date: 'Oct 22' },
  { title: 'Why 90% of AI Agents Fail', format: 'Long-form', stage: 'Ready', date: 'Oct 20' },
];

export const ContentPlannerPage: React.FC = () => {
  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100 tracking-tight">
            Content Planner & Release Pipeline
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Production Kanban stages, scheduled upload dates, and pipeline bottlenecks.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-medium transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Pipeline Item</span>
        </button>
      </div>

      {/* Kanban Board Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {COLUMNS.map((col) => {
          const colItems = ITEMS.filter((item) => item.stage === col.stage);
          return (
            <div key={col.name} className="space-y-3">
              <div className="flex items-center justify-between text-xs text-zinc-400 font-medium px-1">
                <span>{col.name}</span>
                <span className="font-mono text-[10px] text-zinc-500">({colItems.length})</span>
              </div>

              <div className="space-y-2">
                {colItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] hover:border-zinc-700/80 transition-all space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                        {item.format}
                      </span>
                      <span className="text-[11px] font-mono text-zinc-500">{item.date}</span>
                    </div>

                    <div className="font-medium text-zinc-200 leading-snug">{item.title}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ContentPlannerPage;
