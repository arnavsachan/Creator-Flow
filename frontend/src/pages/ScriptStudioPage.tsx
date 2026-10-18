import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export const ScriptStudioPage: React.FC = () => {
  const [hookType, setHookType] = useState<'negative' | 'curiosity' | 'story'>('negative');
  const [copied, setCopied] = useState(false);

  const sampleScript = `[0:00 - 0:05] HOOK:
"Almost every engineer who failed a system design interview made the exact same mistake at minute 12 — they started drawing architecture boxes before asking a single clarifying question."

[0:05 - 0:25] RETENTION LOCK:
"In this video, I'm breaking down the actual grading rubrics used by staff engineers at FAANG, and the 4-step framework that turns an interview from an exam into a collaborative design session."

[0:25 - 1:15] CORE POINT 1 — The Clarification Trap:
"When an interviewer asks you to 'design Twitter', they don't care if you know what Redis is. What they are actually testing is whether you can eliminate ambiguity under time pressure..."`;

  const handleCopy = () => {
    navigator.clipboard.writeText(sampleScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100 tracking-tight">
            Script Studio & Hook Retention Engine
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            5-second hook retention analysis, structural pacing markers, and teleprompter view.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Script'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Script Editor / Teleprompter (8 cols) */}
        <div className="lg:col-span-8 p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Active Script: System Design Interview Blueprint
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
              Est. Duration: 8m 45s
            </span>
          </div>

          <textarea
            rows={14}
            value={sampleScript}
            readOnly
            className="w-full bg-[#09090B] border border-zinc-800 rounded-md p-4 text-xs font-mono text-zinc-200 leading-relaxed focus:outline-none focus:border-zinc-700 resize-none"
          />
        </div>

        {/* Right: Hook Diagnostic & Retention Indicators (4 cols) */}
        <div className="lg:col-span-4 p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Hook Retention Diagnostic
            </div>
            <div className="text-xs text-zinc-500">First 30 seconds retention curve probability</div>
          </div>

          <div className="p-3.5 rounded-md bg-[#09090B] border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-400">Predicted 0:30 Retention</span>
              <span className="text-emerald-400 font-semibold">76.4% (Top 5%)</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div className="h-full bg-emerald-400 rounded-full" style={{ width: '76.4%' }} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-zinc-400">Hook Formula Archetype</div>
            <div className="grid grid-cols-3 gap-1.5">
              {(['negative', 'curiosity', 'story'] as const).map((h) => (
                <button
                  key={h}
                  onClick={() => setHookType(h)}
                  type="button"
                  className={`px-2 py-1.5 rounded text-[11px] font-medium uppercase border transition-colors cursor-pointer ${
                    hookType === h
                      ? 'bg-zinc-800 text-zinc-100 border-zinc-700'
                      : 'bg-[#09090B] text-zinc-500 border-zinc-800 hover:text-zinc-300'
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScriptStudioPage;
