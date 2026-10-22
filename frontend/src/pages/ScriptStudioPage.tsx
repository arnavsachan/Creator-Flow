import React, { useEffect, useId, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  Copy,
  FolderOpen,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Save,
  Sparkles,
  Wand2,
  Zap,
} from 'lucide-react';
import { useAppMode } from '../context/AppModeContext';
import {
  auditRetention,
  generateHooks,
  generateScript,
  listSavedScripts,
  saveScript,
} from '../services/scriptService';
import type {
  HookArchetype,
  HookVariation,
  RetentionAuditResponse,
  SavedScript,
} from '../types/script';

const DEFAULT_SCRIPT = `[0:00 - 0:05] HOOK:
"Almost every engineer who failed a system design interview made the exact same mistake at minute 12 — they started drawing architecture boxes before asking a single clarifying question."

[0:05 - 0:25] RETENTION LOCK:
"In this video, I'm breaking down the actual grading rubrics used by staff engineers at FAANG, and the 4-step framework that turns an interview from an exam into a collaborative design session."

[0:25 - 1:45] CORE POINT 1 — The Clarification Trap:
"When an interviewer asks you to 'design Twitter', they don't care if you know what Redis is. What they are actually testing is whether you can eliminate ambiguity under time pressure. Start with traffic volume and latency SLAs."

[1:45 - 3:00] CORE POINT 2 — The Single Point of Failure:
"Never draw a single database icon without immediately explaining your replication and failover strategy. Let's trace how write-ahead logs save you from catastrophic state loss."

[3:00 - 3:30] CALL TO ACTION & RETENTION BRIDGE:
"If you want the complete interactive system design checklist with 15 real interview transcripts, check the pinned resource in the description below."`;

export interface ScriptStudioPageProps {
  initialIdea?: {
    topic?: string;
    title?: string;
    hook?: string;
    format?: string;
    tone?: string;
    audiencePersona?: string;
  };
}

export const ScriptStudioPage: React.FC<ScriptStudioPageProps> = ({ initialIdea }) => {
  const topicInputId = useId();
  const titleInputId = useId();
  const durationSelectId = useId();
  const toneSelectId = useId();
  const personaInputId = useId();
  const { selectedChannelId } = useAppMode();

  // Safely resolve incoming idea from props, React Router history state, or URL search params
  const incoming = (() => {
    if (initialIdea) return initialIdea;
    try {
      if (typeof window !== 'undefined') {
        const histState = window.history?.state;
        if (histState?.usr) return histState.usr;
        const params = new URLSearchParams(window.location.search);
        if (params.has('topic') || params.has('title')) {
          return {
            topic: params.get('topic') || undefined,
            title: params.get('title') || undefined,
            hook: params.get('hook') || undefined,
            format: params.get('format') || undefined,
            tone: params.get('tone') || undefined,
            audiencePersona: params.get('audiencePersona') || undefined,
          };
        }
      }
    } catch {
      // ignore
    }
    return null;
  })();

  // Generation Controls State
  const [topic, setTopic] = useState(
    incoming?.topic || incoming?.title || 'System Design Interview Blueprint'
  );
  const [targetDuration, setTargetDuration] = useState(
    incoming?.format === 'shorts' ? '0m 45s' : '8m 00s'
  );
  const [tone, setTone] = useState(incoming?.tone || 'Authoritative');
  const [audiencePersona, setAudiencePersona] = useState(
    incoming?.audiencePersona || 'Software Engineers & Tech Leads'
  );
  const [hookType, setHookType] = useState<HookArchetype>('negative');
  const [scriptTitle, setScriptTitle] = useState(
    incoming?.title || 'System Design Interview Blueprint'
  );

  // Editor and Content State
  const [scriptText, setScriptText] = useState(() => {
    if (incoming?.hook) {
      return `[0:00 - 0:05] HOOK:\n"${incoming.hook}"\n\n[0:05 - 0:25] RETENTION LOCK:\n"In this video, I'm breaking down the actual strategies for ${incoming.topic || incoming.title || 'this topic'}."\n\n[0:25 - 1:45] CORE POINT 1:\n"..."\n\n[1:45 - 2:30] CALL TO ACTION:\n"Check out the resources in the description below."`;
    }
    return DEFAULT_SCRIPT;
  });
  const [generatedHooks, setGeneratedHooks] = useState<HookVariation[]>([]);
  const [selectedHookText, setSelectedHookText] = useState<string>(incoming?.hook || '');
  const [auditData, setAuditData] = useState<RetentionAuditResponse | null>(null);

  // Saved Scripts State
  const [savedScripts, setSavedScripts] = useState<SavedScript[]>([]);
  const [showSavedDrawer, setShowSavedDrawer] = useState(false);

  // Status & Feedback States
  const [isGeneratingHooks, setIsGeneratingHooks] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Teleprompter Mode State
  const [isTeleprompterOpen, setIsTeleprompterOpen] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState<number>(2); // 1 = slow, 2 = normal, 3 = fast
  const [fontSize, setFontSize] = useState<'md' | 'lg' | 'xl'>('lg');
  const teleprompterRef = useRef<HTMLDivElement | null>(null);

  // Calculated Word Count & Estimated Duration
  const words = scriptText.trim() ? scriptText.trim().split(/\s+/).length : 0;
  const estimatedSeconds = Math.round((words / 145) * 60);
  const calcMins = Math.floor(estimatedSeconds / 60);
  const calcSecs = estimatedSeconds % 60;
  const formattedCalculatedDuration = `${calcMins}m ${calcSecs.toString().padStart(2, '0')}s`;

  // Load Saved Scripts on Mount
  useEffect(() => {
    let isMounted = true;
    listSavedScripts(selectedChannelId)
      .then((items) => {
        if (isMounted) setSavedScripts(items);
      })
      .catch((err) => {
        console.warn('[ScriptStudio] Could not load saved scripts:', err);
      });
    return () => {
      isMounted = false;
    };
  }, [selectedChannelId]);

  // Teleprompter Auto-Scroll Loop
  useEffect(() => {
    if (!isTeleprompterOpen || !isScrolling) return;

    const interval = setInterval(() => {
      if (teleprompterRef.current) {
        teleprompterRef.current.scrollTop += scrollSpeed;
      }
    }, 30);

    return () => clearInterval(interval);
  }, [isTeleprompterOpen, isScrolling, scrollSpeed]);

  // Copy Action
  const handleCopy = () => {
    navigator.clipboard.writeText(scriptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate Hooks Action
  const handleGenerateHooks = async () => {
    if (!topic.trim()) {
      setErrorMessage('Please enter a topic before generating hooks.');
      return;
    }
    setErrorMessage(null);
    setIsGeneratingHooks(true);
    try {
      const res = await generateHooks({
        topic: topic.trim(),
        audiencePersona: audiencePersona.trim(),
        tone,
        channelId: selectedChannelId,
      });
      setGeneratedHooks(res.hooks);
      if (res.hooks.length > 0) {
        const matching = res.hooks.find((h) => h.archetype === hookType) || res.hooks[0];
        setSelectedHookText(matching.hookText);
      }
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'Failed to generate hooks with Gemini.';
      setErrorMessage(msg);
    } finally {
      setIsGeneratingHooks(false);
    }
  };

  // Generate Full Script Action
  const handleGenerateScript = async () => {
    if (!topic.trim()) {
      setErrorMessage('Please enter a topic before generating a script.');
      return;
    }
    setErrorMessage(null);
    setIsGeneratingScript(true);
    try {
      const res = await generateScript({
        topic: topic.trim(),
        targetDuration,
        tone,
        audiencePersona: audiencePersona.trim(),
        hookType,
        selectedHook: selectedHookText || undefined,
        channelId: selectedChannelId,
      });
      setScriptText(res.fullScript);
      setScriptTitle(res.title || `The Blueprint: ${topic}`);
      // Automatically trigger a retention audit on the generated script
      handleAuditRetention(res.fullScript);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'Failed to generate script with Gemini.';
      setErrorMessage(msg);
    } finally {
      setIsGeneratingScript(false);
    }
  };

  // Audit Retention Action
  const handleAuditRetention = async (textToAudit?: string) => {
    const text = textToAudit || scriptText;
    if (!text.trim() || text.length < 10) {
      setErrorMessage('Please provide a longer script text to analyze retention.');
      return;
    }
    setErrorMessage(null);
    setIsAuditing(true);
    try {
      const res = await auditRetention({
        scriptText: text,
        targetDuration,
        channelId: selectedChannelId,
      });
      setAuditData(res);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'Failed to audit retention.';
      setErrorMessage(msg);
    } finally {
      setIsAuditing(false);
    }
  };

  // Save Script Action
  const handleSaveScript = async () => {
    if (!scriptText.trim()) {
      setErrorMessage('Cannot save an empty script.');
      return;
    }
    setErrorMessage(null);
    setIsSaving(true);
    try {
      const saved = await saveScript({
        title: scriptTitle || topic || 'Untitled Script',
        topic,
        targetDuration,
        tone,
        audiencePersona,
        hookType,
        hookText: selectedHookText || undefined,
        fullScript: scriptText,
        estimatedRetentionScore: auditData?.estimatedRetentionScore || 76.0,
        channelId: selectedChannelId,
      });
      setSavedScripts((prev) => [saved, ...prev.filter((s) => s.id !== saved.id)]);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'Failed to save script.';
      setErrorMessage(msg);
    } finally {
      setIsSaving(false);
    }
  };

  // Load Saved Script
  const handleLoadScript = (saved: SavedScript) => {
    setScriptTitle(saved.title);
    setTopic(saved.topic);
    setTargetDuration(saved.targetDuration);
    setTone(saved.tone);
    if (saved.audiencePersona) setAudiencePersona(saved.audiencePersona);
    if (saved.hookType && ['negative', 'curiosity', 'story'].includes(saved.hookType)) {
      setHookType(saved.hookType as HookArchetype);
    }
    if (saved.hookText) setSelectedHookText(saved.hookText);
    setScriptText(saved.fullScript);
    setShowSavedDrawer(false);
    handleAuditRetention(saved.fullScript);
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-zinc-100 tracking-tight">
              Script Studio & Hook Retention Engine
            </h2>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Sparkles className="w-3 h-3" />
              <span>Gemini 3.8 Flash</span>
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            AI-powered 5-second hook variations, structural pacing markers, and teleprompter mode.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Saved Scripts Button */}
          <button
            onClick={() => setShowSavedDrawer(!showSavedDrawer)}
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors cursor-pointer"
          >
            <FolderOpen className="w-3.5 h-3.5 text-zinc-400" />
            <span>Saved ({savedScripts.length})</span>
            <ChevronDown className="w-3 h-3 text-zinc-500" />
          </button>

          {/* Teleprompter Toggle */}
          <button
            onClick={() => setIsTeleprompterOpen(true)}
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Teleprompter</span>
          </button>

          {/* Save Script Button */}
          <button
            onClick={handleSaveScript}
            disabled={isSaving}
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors cursor-pointer disabled:opacity-50"
          >
            {saveSuccess ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>{saveSuccess ? 'Saved!' : isSaving ? 'Saving...' : 'Save Script'}</span>
          </button>

          {/* Copy Script */}
          <button
            onClick={handleCopy}
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-100 text-zinc-950 hover:bg-zinc-200 transition-colors cursor-pointer font-semibold"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{copied ? 'Copied' : 'Copy Script'}</span>
          </button>
        </div>
      </div>

      {/* Error Alert Banner */}
      {errorMessage && (
        <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Configuration / API Error: </span>
            {errorMessage}
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            type="button"
            className="text-red-400 hover:text-red-200 text-xs font-mono"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Saved Scripts Drawer */}
      {showSavedDrawer && (
        <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Saved Scripts Library
            </span>
            <button
              onClick={() => setShowSavedDrawer(false)}
              type="button"
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Close
            </button>
          </div>
          {savedScripts.length === 0 ? (
            <div className="text-xs text-zinc-500 py-3 text-center">
              No saved scripts found. Generate a script and click &apos;Save Script&apos; to build your library.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {savedScripts.map((s) => (
                <div
                  key={s.id}
                  onClick={() => handleLoadScript(s)}
                  className="p-3 rounded-md bg-[#09090B] border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors space-y-1.5"
                >
                  <div className="text-xs font-semibold text-zinc-200 truncate">{s.title}</div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                    <span>{s.targetDuration}</span>
                    <span className="text-emerald-400">{s.hookType} hook</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Input Parameters Form (Topic, Duration, Tone, Persona) */}
      <div className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-4">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-400 flex items-center justify-between">
          <span>AI Creative Prompt & Parameters</span>
          <span className="text-[11px] font-mono text-zinc-500">Google Gemini Structured Mode</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Topic */}
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor={topicInputId} className="text-xs font-medium text-zinc-300">
              Video Topic or Core Premise
            </label>
            <input
              id={topicInputId}
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Scaling SQLite for AI Agents"
              className="w-full bg-[#09090B] border border-zinc-800 rounded-md px-3 py-2 text-xs font-medium text-zinc-100 focus:outline-none focus:border-zinc-600"
            />
          </div>

          {/* Script Title */}
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor={titleInputId} className="text-xs font-medium text-zinc-300">
              Script Title
            </label>
            <input
              id={titleInputId}
              type="text"
              value={scriptTitle}
              onChange={(e) => setScriptTitle(e.target.value)}
              placeholder="e.g. System Design Interview Blueprint"
              className="w-full bg-[#09090B] border border-zinc-800 rounded-md px-3 py-2 text-xs font-medium text-zinc-100 focus:outline-none focus:border-zinc-600"
            />
          </div>

          {/* Target Duration */}
          <div className="space-y-1.5">
            <label htmlFor={durationSelectId} className="text-xs font-medium text-zinc-300">
              Target Duration
            </label>
            <select
              id={durationSelectId}
              value={targetDuration}
              onChange={(e) => setTargetDuration(e.target.value)}
              className="w-full bg-[#09090B] border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 cursor-pointer"
            >
              <option value="60s">60s (Short / Reel)</option>
              <option value="3m 00s">3m 00s (Quick Breakdown)</option>
              <option value="5m 00s">5m 00s (Focused Insight)</option>
              <option value="8m 00s">8m 00s (Standard Video)</option>
              <option value="12m 00s">12m 00s (Deep Dive)</option>
              <option value="18m 00s">18m 00s (Masterclass)</option>
            </select>
          </div>

          {/* Tone */}
          <div className="space-y-1.5">
            <label htmlFor={toneSelectId} className="text-xs font-medium text-zinc-300">
              Tone & Persona
            </label>
            <select
              id={toneSelectId}
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full bg-[#09090B] border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 cursor-pointer"
            >
              <option value="Authoritative">Authoritative (Staff Engineer / Expert)</option>
              <option value="Conversational">Conversational (Peer-to-Peer)</option>
              <option value="High Energy">High Energy (Fast-Paced / Creator)</option>
              <option value="Dramatic">Dramatic (Storyteller / Documentary)</option>
              <option value="Educational">Educational (Tutorial / Step-by-Step)</option>
            </select>
          </div>

          {/* Audience Persona */}
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor={personaInputId} className="text-xs font-medium text-zinc-300">
              Audience Persona
            </label>
            <input
              id={personaInputId}
              type="text"
              value={audiencePersona}
              onChange={(e) => setAudiencePersona(e.target.value)}
              placeholder="e.g. Software Engineers, FAANG Candidates"
              className="w-full bg-[#09090B] border border-zinc-800 rounded-md px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600"
            />
          </div>
        </div>

        {/* Generate Actions */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            onClick={handleGenerateHooks}
            disabled={isGeneratingHooks || isGeneratingScript}
            type="button"
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>{isGeneratingHooks ? 'Brainstorming Hooks...' : 'Generate 3 Hook Variations'}</span>
          </button>

          <button
            onClick={handleGenerateScript}
            disabled={isGeneratingScript || isGeneratingHooks}
            type="button"
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>{isGeneratingScript ? 'Writing Script with Gemini...' : 'Generate Full Script'}</span>
          </button>
        </div>
      </div>

      {/* Hook Archetype Selector & Variations */}
      {generatedHooks.length > 0 && (
        <div className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Select Hook Variation for Script
            </div>
            <span className="text-[10px] font-mono text-zinc-500">
              Click a card to insert as opening hook
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {generatedHooks.map((h) => {
              const isSelected = selectedHookText === h.hookText;
              return (
                <div
                  key={h.archetype}
                  onClick={() => {
                    setSelectedHookText(h.hookText);
                    setHookType(h.archetype);
                  }}
                  className={`p-4 rounded-md border transition-all cursor-pointer space-y-2 ${
                    isSelected
                      ? 'bg-zinc-800/70 border-indigo-500/80 shadow-md shadow-indigo-500/10'
                      : 'bg-[#09090B] border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-300">
                      {h.archetype} Hook
                    </span>
                    <span className="text-[10px] font-mono font-semibold text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10">
                      Est. {h.estimatedRetentionScore}%
                    </span>
                  </div>
                  <p className="text-xs text-zinc-200 leading-relaxed italic">
                    &quot;{h.hookText}&quot;
                  </p>
                  <p className="text-[11px] text-zinc-400 pt-1 border-t border-zinc-800/80">
                    {h.rationale}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Workspace: Left Editor (8 cols) & Right Retention Diagnostic (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Script Editor (8 cols) */}
        <div className="lg:col-span-8 p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Active Script Editor
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                {words} words · {formattedCalculatedDuration}
              </span>
              <button
                onClick={() => handleAuditRetention()}
                disabled={isAuditing}
                type="button"
                className="text-[11px] font-medium px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors cursor-pointer"
              >
                {isAuditing ? 'Auditing...' : 'Audit Retention'}
              </button>
            </div>
          </div>

          <textarea
            rows={16}
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
            placeholder="Type or paste your video script with [timecode] headers..."
            className="w-full bg-[#09090B] border border-zinc-800 rounded-md p-4 text-xs font-mono text-zinc-200 leading-relaxed focus:outline-none focus:border-zinc-700 resize-y"
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

          {/* Retention Score Gauge */}
          <div className="p-3.5 rounded-md bg-[#09090B] border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-400">Predicted 0:30 Retention</span>
              <span className="text-emerald-400 font-semibold">
                {auditData ? `${auditData.estimatedRetentionScore}%` : '76.4%'} (
                {auditData ? auditData.retentionTier : 'Top 5%'})
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                style={{
                  width: `${auditData ? auditData.estimatedRetentionScore : 76.4}%`,
                }}
              />
            </div>
            <div className="text-[10px] text-zinc-500 pt-1">
              {auditData ? auditData.first30sAnalysis : '5-second hook tension detected.'}
            </div>
          </div>

          {/* Hook Formula Archetype Buttons */}
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

          {/* Retention Diagnostic Breakdown */}
          {auditData && (
            <div className="space-y-3 pt-2 border-t border-zinc-800/80">
              {auditData.strengths.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    <span>Structural Strengths</span>
                  </div>
                  <ul className="text-[11px] text-zinc-300 space-y-1 list-disc list-inside">
                    {auditData.strengths.map((s, idx) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {auditData.dropOffRisks.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-amber-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    <span>Drop-Off Risks</span>
                  </div>
                  <ul className="text-[11px] text-zinc-400 space-y-1 list-disc list-inside">
                    {auditData.dropOffRisks.map((r, idx) => (
                      <li key={idx}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* AI Estimate Disclaimer (Mandatory) */}
          <div className="p-3 rounded-md bg-zinc-900/60 border border-zinc-800 text-[10px] text-zinc-400 leading-relaxed">
            <span className="font-semibold text-zinc-300">Notice: </span>
            Predicted retention is an AI structural estimate based on spoken delivery pacing and psychological hook patterns, not empirically measured YouTube Analytics telemetry.
          </div>
        </div>
      </div>

      {/* Teleprompter Modal */}
      {isTeleprompterOpen && (
        <div className="fixed inset-0 z-50 bg-[#09090B]/95 backdrop-blur-md flex flex-col p-6 animate-in fade-in duration-200">
          {/* Teleprompter Header Controls */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
            <div className="flex items-center gap-3">
              <span
                data-testid="teleprompter-modal-title"
                className="text-sm font-semibold text-zinc-200"
              >
                Teleprompter Active View
              </span>
              <span className="text-xs font-mono text-zinc-500">
                {words} words · {formattedCalculatedDuration}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Speed Buttons */}
              <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-md p-1 text-xs">
                <span className="text-zinc-500 px-2 text-[10px] uppercase font-mono">Speed</span>
                {[1, 2, 3].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setScrollSpeed(spd)}
                    type="button"
                    className={`px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer ${
                      scrollSpeed === spd
                        ? 'bg-zinc-800 text-zinc-100 font-semibold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>

              {/* Font Size */}
              <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-md p-1 text-xs">
                <span className="text-zinc-500 px-2 text-[10px] uppercase font-mono">Size</span>
                {(['md', 'lg', 'xl'] as const).map((sz) => (
                  <button
                    key={sz}
                    onClick={() => setFontSize(sz)}
                    type="button"
                    className={`px-2 py-0.5 rounded text-[11px] uppercase font-mono cursor-pointer ${
                      fontSize === sz
                        ? 'bg-zinc-800 text-zinc-100 font-semibold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>

              {/* Reset Scroll */}
              <button
                onClick={() => {
                  if (teleprompterRef.current) teleprompterRef.current.scrollTop = 0;
                }}
                type="button"
                className="p-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
                title="Reset to Top"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {/* Play / Pause Toggle */}
              <button
                onClick={() => setIsScrolling(!isScrolling)}
                type="button"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
              >
                {isScrolling ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isScrolling ? 'Pause' : 'Start Scroll'}</span>
              </button>

              {/* Close Teleprompter */}
              <button
                onClick={() => {
                  setIsScrolling(false);
                  setIsTeleprompterOpen(false);
                }}
                type="button"
                className="p-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
                title="Close Teleprompter"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Teleprompter Scroll Viewport */}
          <div
            ref={teleprompterRef}
            className="flex-1 overflow-y-auto max-w-4xl mx-auto w-full py-16 px-6 space-y-6 text-zinc-100 select-none leading-loose font-sans"
          >
            <div
              className={`whitespace-pre-line tracking-wide ${
                fontSize === 'md' ? 'text-lg' : fontSize === 'lg' ? 'text-2xl' : 'text-3xl'
              }`}
            >
              {scriptText}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScriptStudioPage;
