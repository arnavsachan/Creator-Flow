import React, { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, Filter } from 'lucide-react';

const TRAFFIC_SOURCES = [
  { source: 'YouTube Search', views: 540200, percentage: '37.8%', change: '+14.2%' },
  { source: 'Browse Features (Homepage)', views: 412900, percentage: '28.9%', change: '+8.6%' },
  { source: 'Suggested Videos', views: 289400, percentage: '20.3%', change: '+22.1%' },
  { source: 'External & Socials (X, Reddit)', views: 114800, percentage: '8.0%', change: '-2.4%' },
  { source: 'Direct / Channel URL', views: 71600, percentage: '5.0%', change: '+1.1%' },
];

const RETENTION_CHART = [
  { timestamp: '0:00', longForm: 100, shortForm: 100 },
  { timestamp: '0:30', longForm: 74, shortForm: 82 },
  { timestamp: '1:00', longForm: 68, shortForm: 65 },
  { timestamp: '2:30', longForm: 61, shortForm: 48 },
  { timestamp: '5:00', longForm: 55, shortForm: 35 },
  { timestamp: '8:00', longForm: 48, shortForm: 22 },
  { timestamp: '10:00', longForm: 42, shortForm: 15 },
];

export const AnalyticsPage: React.FC = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('28d');

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100 tracking-tight">
            Channel Telemetry & Deep Analytics
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Traffic discovery vectors, retention curves, and device distribution metrics.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#141418] border border-zinc-800 rounded-md p-0.5 text-xs">
            {['7d', '28d', '90d'].map((p) => (
              <button
                key={p}
                onClick={() => setSelectedPeriod(p)}
                type="button"
                className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                  selectedPeriod === p ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Grid: Traffic Sources & Retention Curve */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Traffic Sources Table (6 cols) */}
        <div className="lg:col-span-6 p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Discovery Vectors
              </div>
              <div className="text-xs text-zinc-500">Breakdown of inbound traffic algorithms</div>
            </div>
            <Filter className="w-4 h-4 text-zinc-500" />
          </div>

          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 font-mono text-[10px] uppercase">
                <th className="pb-2">Source</th>
                <th className="pb-2 text-right">Views</th>
                <th className="pb-2 text-right">Share</th>
                <th className="pb-2 text-right">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40 font-mono">
              {TRAFFIC_SOURCES.map((item) => (
                <tr key={item.source} className="hover:bg-zinc-900/30 transition-colors">
                  <td className="py-2.5 text-zinc-200 font-sans font-medium">{item.source}</td>
                  <td className="py-2.5 text-right text-zinc-300 tabular-nums">{item.views.toLocaleString()}</td>
                  <td className="py-2.5 text-right text-zinc-400 tabular-nums">{item.percentage}</td>
                  <td className="py-2.5 text-right text-emerald-400 tabular-nums">{item.change}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Retention Curve Chart (6 cols) */}
        <div className="lg:col-span-6 p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Audience Retention Decay Curve
            </div>
            <div className="text-xs text-zinc-500">Long-form retention benchmark vs Shorts</div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={RETENTION_CHART} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272A" vertical={false} />
                <XAxis dataKey="timestamp" stroke="#71717A" fontSize={11} tickLine={false} />
                <YAxis stroke="#71717A" fontSize={11} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-[#141418] border border-zinc-800 p-2 rounded text-xs space-y-1">
                          <div className="text-zinc-400 font-mono">{label}</div>
                          <div className="text-indigo-400 font-mono">Long-form: {payload[0]?.value}%</div>
                          <div className="text-sky-400 font-mono">Shorts: {payload[1]?.value}%</div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="longForm" fill="#6366F1" radius={[3, 3, 0, 0]} />
                <Bar dataKey="shortForm" fill="#38BDF8" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPage;
