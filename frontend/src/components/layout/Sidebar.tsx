import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  Calendar,
  FileText,
  Film,
  Image,
  LayoutDashboard,
  Lightbulb,
  Scissors,
  Settings,
  Target,
  Tv,
  Users,
} from 'lucide-react';
import { cn } from '../../utils/cn';

interface NavSection {
  label: string;
  items: {
    label: string;
    to: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
  }[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'WORKSPACE',
    items: [
      { label: 'Overview', to: '/', icon: LayoutDashboard },
      { label: 'Analytics', to: '/analytics', icon: BarChart3 },
      { label: 'Audience', to: '/audience-insights', icon: Users },
      { label: 'Content Library', to: '/content-library', icon: Film },
      { label: 'Channels', to: '/channels', icon: Tv },
    ],
  },
  {
    label: 'CREATION SUITE',
    items: [
      { label: 'Video Ideas & SEO', to: '/video-ideas', icon: Lightbulb },
      { label: 'Script Studio', to: '/script-generator', icon: FileText },
      { label: 'Thumbnail Lab', to: '/thumbnail-analyzer', icon: Image },
      { label: 'Shorts Clipper', to: '/shorts-generator', icon: Scissors },
    ],
  },
  {
    label: 'INTELLIGENCE',
    items: [
      { label: 'Competitors', to: '/competitors', icon: Target },
      { label: 'Content Calendar', to: '/content-planner', icon: Calendar },
    ],
  },
  {
    label: 'SYSTEM',
    items: [{ label: 'Settings', to: '/settings', icon: Settings }],
  },
];

export const Sidebar: React.FC = () => {
  return (
    <aside className="w-60 shrink-0 bg-[#09090B] border-r border-zinc-800/80 flex flex-col justify-between select-none">
      {/* Top Header / Wordmark */}
      <div>
        <div className="h-14 px-5 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* Minimal monochrome geometric mark */}
            <div className="w-5 h-5 rounded bg-zinc-100 flex items-center justify-center text-zinc-950 font-bold text-xs">
              C
            </div>
            <span className="font-semibold text-sm tracking-tight text-zinc-100">
              CreatorBuddy
            </span>
          </div>
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
            v0.2
          </span>
        </div>

        {/* Navigation Sections */}
        <nav className="p-3 space-y-5 overflow-y-auto max-h-[calc(100vh-140px)]">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="space-y-1">
              <div className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors',
                          isActive
                            ? 'bg-zinc-800/70 text-zinc-100 font-medium'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 font-normal'
                        )
                      }
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon className="w-4 h-4 shrink-0 text-zinc-400" />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                          {item.badge}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Bottom Footer / Compact Usage Meters */}
      <div className="p-4 border-t border-zinc-800/80 bg-[#09090B] space-y-3">
        {/* API Quota Meter */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-500">API Quota</span>
            <span className="font-mono text-zinc-400 tabular-nums">1,420 / 10k</span>
          </div>
          <div className="w-full h-1 rounded-full bg-zinc-800 overflow-hidden">
            <div className="h-full bg-zinc-400 rounded-full" style={{ width: '14.2%' }} />
          </div>
        </div>

        {/* AI Credits Meter */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-500">AI Credits</span>
            <span className="font-mono text-zinc-400 tabular-nums">18 / 25</span>
          </div>
          <div className="w-full h-1 rounded-full bg-zinc-800 overflow-hidden">
            <div className="h-full bg-zinc-400 rounded-full" style={{ width: '72%' }} />
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
