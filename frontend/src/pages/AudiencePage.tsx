import { Clock, Globe2, Heart, UserCheck } from 'lucide-react';

const TOP_COUNTRIES = [
  { country: 'United States', share: '44.2%', viewers: '631,500' },
  { country: 'India', share: '18.4%', viewers: '262,900' },
  { country: 'United Kingdom', share: '9.1%', viewers: '130,000' },
  { country: 'Germany', share: '6.5%', viewers: '92,800' },
  { country: 'Canada', share: '5.8%', viewers: '82,800' },
];

export const AudiencePage: React.FC = () => {
  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="pb-4 border-b border-zinc-800">
        <h2 className="text-lg font-semibold text-zinc-100 tracking-tight">
          Audience Demographics & Cohort Analysis
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          Audience loyalty indices, active time windows, and geographic distribution.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] space-y-1">
          <div className="flex items-center justify-between text-xs text-zinc-400 uppercase font-medium">
            <span>Returning Viewers</span>
            <UserCheck className="w-4 h-4 text-zinc-500" />
          </div>
          <div className="text-2xl font-semibold text-zinc-50 font-mono">68.4%</div>
          <p className="text-[11px] text-emerald-400 font-mono">+4.1% loyalty increase</p>
        </div>

        <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] space-y-1">
          <div className="flex items-center justify-between text-xs text-zinc-400 uppercase font-medium">
            <span>Subscriber Conversion</span>
            <Heart className="w-4 h-4 text-zinc-500" />
          </div>
          <div className="text-2xl font-semibold text-zinc-50 font-mono">3.8%</div>
          <p className="text-[11px] text-zinc-400 font-mono">Top 10% in Tech niche</p>
        </div>

        <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] space-y-1">
          <div className="flex items-center justify-between text-xs text-zinc-400 uppercase font-medium">
            <span>Optimal Release Window</span>
            <Clock className="w-4 h-4 text-zinc-500" />
          </div>
          <div className="text-2xl font-semibold text-zinc-50 font-mono">16:00 UTC</div>
          <p className="text-[11px] text-zinc-400 font-mono">Wednesdays & Thursdays</p>
        </div>
      </div>

      {/* Geography Breakdown */}
      <div className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Geographic Concentration
            </div>
            <div className="text-xs text-zinc-500">Distribution of unique viewers by territory</div>
          </div>
          <Globe2 className="w-4 h-4 text-zinc-500" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {TOP_COUNTRIES.map((c) => (
            <div key={c.country} className="p-3 rounded-md bg-[#09090B] border border-zinc-800 space-y-1 font-mono">
              <div className="text-xs font-sans font-medium text-zinc-200">{c.country}</div>
              <div className="text-base font-semibold text-zinc-100">{c.share}</div>
              <div className="text-[11px] text-zinc-500">{c.viewers} viewers</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AudiencePage;
