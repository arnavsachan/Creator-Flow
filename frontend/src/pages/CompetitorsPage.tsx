import { Flame } from 'lucide-react';

const COMPETITORS = [
  {
    name: 'Tech Lead Pro',
    subs: '420K',
    velocity: '+18.4k/mo',
    outlierVideo: 'How We Scaled to 10M Requests with Go',
    outlierMultiplier: '3.4x Channel Average',
    overlapScore: '84% Audience Overlap',
  },
  {
    name: 'ByteByte Architecture',
    subs: '890K',
    velocity: '+32.1k/mo',
    outlierVideo: 'Database Sharding Visualized',
    outlierMultiplier: '4.1x Channel Average',
    overlapScore: '78% Audience Overlap',
  },
  {
    name: 'Cloud Engineer Zero',
    subs: '185K',
    velocity: '+9.2k/mo',
    outlierVideo: 'Kubernetes is Overkill for 99% of Startups',
    outlierMultiplier: '2.8x Channel Average',
    overlapScore: '65% Audience Overlap',
  },
];

export const CompetitorsPage: React.FC = () => {
  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100 tracking-tight">
            Competitor Intelligence & Outlier Radar
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Real-time tracking of peer uploads, velocity anomalies, and high-demand keyword vacuums.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {COMPETITORS.map((c) => (
          <div
            key={c.name}
            className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] hover:border-zinc-700/80 transition-all space-y-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300">
                  {c.name.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-semibold text-zinc-100">{c.name}</div>
                  <div className="text-[11px] text-zinc-500 font-mono">
                    {c.subs} subs • <span className="text-emerald-400">{c.velocity}</span>
                  </div>
                </div>
              </div>

              <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                {c.overlapScore}
              </span>
            </div>

            {/* Outlier Video Alert */}
            <div className="p-3 rounded-md bg-[#09090B] border border-zinc-800/80 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <Flame className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="truncate">
                  <span className="text-zinc-400">Outlier Topic: </span>
                  <span className="text-zinc-200 font-medium">{c.outlierVideo}</span>
                </div>
              </div>
              <span className="text-[11px] font-mono text-emerald-400 shrink-0 font-semibold">
                {c.outlierMultiplier}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CompetitorsPage;
