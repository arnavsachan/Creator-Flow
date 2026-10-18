import { CheckCircle2, Plus, Tv } from 'lucide-react';
import { useAppMode } from '../context/AppModeContext';

export const ChannelsPage: React.FC = () => {
  const { selectedChannelId, setSelectedChannelId } = useAppMode();

  const CHANNELS = [
    {
      id: 'demo-channel-1',
      name: 'Tech Pulse',
      handle: '@TechPulseOfficial',
      subs: '48.2K',
      videos: 142,
      status: 'Active (Demo)',
      verified: true,
    },
    {
      id: 'demo-channel-2',
      name: 'Gaming Frontier',
      handle: '@GamingFrontierHQ',
      subs: '124.5K',
      videos: 310,
      status: 'Active (Demo)',
      verified: true,
    },
    {
      id: 'uc-live-001',
      name: 'Creator Daily',
      handle: '@CreatorDaily',
      subs: '8.4K',
      videos: 28,
      status: 'Connected (OAuth 2.0)',
      verified: true,
    },
  ];

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100 tracking-tight">
            Connected Channels & Profiles
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Manage authenticated YouTube creator accounts and data synchronization privileges.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-medium transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Connect Channel</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {CHANNELS.map((ch) => {
          const isSelected = selectedChannelId === ch.id;
          return (
            <div
              key={ch.id}
              onClick={() => setSelectedChannelId(ch.id)}
              className={`p-5 rounded-lg bg-[#141418] border transition-all cursor-pointer flex flex-col justify-between space-y-4 ${
                isSelected
                  ? 'border-zinc-500/80 bg-zinc-900/60'
                  : 'border-white/[0.06] hover:border-zinc-700/80'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
                    <Tv className="w-5 h-5 text-zinc-300" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5">
                      {ch.name}
                      <CheckCircle2 className="w-3.5 h-3.5 text-zinc-400" />
                    </div>
                    <div className="text-xs text-zinc-500 font-mono">{ch.handle}</div>
                  </div>
                </div>
                {isSelected && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-200 border border-zinc-700">
                    ACTIVE
                  </span>
                )}
              </div>

              <div className="pt-2 border-t border-zinc-800/80 grid grid-cols-2 gap-2 text-xs font-mono">
                <div>
                  <span className="text-zinc-500">Subscribers</span>
                  <div className="text-zinc-200 font-medium">{ch.subs}</div>
                </div>
                <div>
                  <span className="text-zinc-500">Uploads</span>
                  <div className="text-zinc-200 font-medium">{ch.videos}</div>
                </div>
              </div>

              <div className="text-[11px] text-zinc-400 flex items-center justify-between">
                <span>{ch.status}</span>
                <span className="text-zinc-600 font-mono text-[10px]">{ch.id}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ChannelsPage;
