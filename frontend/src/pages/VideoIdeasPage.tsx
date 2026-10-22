import React, { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Bookmark,
  Check,
  Copy,
  FolderOpen,
  Lightbulb,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Wand2,
} from 'lucide-react';
import { useAppMode } from '../context/AppModeContext';
import {
  deleteSavedIdea,
  generateSeoKit,
  generateVideoIdeas,
  listSavedIdeas,
  saveVideoIdea,
  updateSavedIdea,
} from '../services/videoIdeaService';
import type {
  ContentFormat,
  GeneratedIdeaItem,
  GenerateSeoResponse,
  SavedIdea,
} from '../types/videoIdea';
import { cn } from '../utils/cn';
import { ErrorState } from '../components/states/ErrorState';

type ActiveTab = 'ideas' | 'seo' | 'saved';

export const VideoIdeasPage: React.FC = () => {
  const navigate = useNavigate();
  const { selectedChannelId } = useAppMode();

  // Active navigation tab
  const [activeTab, setActiveTab] = useState<ActiveTab>('ideas');

  // Input Form IDs
  const topicId = useId();
  const nicheId = useId();
  const audienceId = useId();
  const formatId = useId();
  const toneId = useId();
  const goalsId = useId();
  const languageId = useId();
  const seoTitleId = useId();
  const seoTopicId = useId();

  // Ideas Generator Form State
  const [topic, setTopic] = useState('');
  const [niche, setNiche] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [contentFormat, setContentFormat] = useState<ContentFormat>('long_form');
  const [platform, setPlatform] = useState('YouTube');
  const [language, setLanguage] = useState('English');
  const [tone, setTone] = useState('');
  const [contentGoals, setContentGoals] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Ideas Generation Execution State
  const [isGeneratingIdeas, setIsGeneratingIdeas] = useState(false);
  const [ideasError, setIdeasError] = useState<string | null>(null);
  const [generatedIdeas, setGeneratedIdeas] = useState<GeneratedIdeaItem[]>([]);
  const [ideasDisclaimer, setIdeasDisclaimer] = useState<string | null>(null);

  // SEO Assistant Form & Execution State
  const [seoTitle, setSeoTitle] = useState('');
  const [seoTopic, setSeoTopic] = useState('');
  const [seoSummary, setSeoSummary] = useState('');
  const [seoAudience, setSeoAudience] = useState('');
  const [seoFormat, setSeoFormat] = useState('long_form');
  const [isGeneratingSeo, setIsGeneratingSeo] = useState(false);
  const [seoError, setSeoError] = useState<string | null>(null);
  const [seoResult, setSeoResult] = useState<GenerateSeoResponse | null>(null);
  const [editableDescription, setEditableDescription] = useState('');

  // Saved Ideas State
  const [savedIdeas, setSavedIdeas] = useState<SavedIdea[]>([]);
  const [savedFilter, setSavedFilter] = useState<'all' | 'favorites'>('all');
  const [savedSearchQuery, setSavedSearchQuery] = useState('');
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);

  // Notification / Feedback State
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savingIdeaTitle, setSavingIdeaTitle] = useState<string | null>(null);
  const [savedSuccessMessage, setSavedSuccessMessage] = useState<string | null>(null);

  // Load Saved Ideas on Mount & Channel Change
  const fetchSaved = async () => {
    setIsLoadingSaved(true);
    setSavedError(null);
    try {
      const items = await listSavedIdeas({
        channelId: selectedChannelId || undefined,
        isFavorite: savedFilter === 'favorites' ? true : undefined,
        search: savedSearchQuery.trim() || undefined,
      });
      setSavedIdeas(items);
    } catch (err: any) {
      console.warn('[VideoIdeasPage] Failed to fetch saved ideas:', err);
      setSavedError('Unable to load saved ideas. Please check connectivity.');
    } finally {
      setIsLoadingSaved(false);
    }
  };

  useEffect(() => {
    fetchSaved();
  }, [selectedChannelId, savedFilter, savedSearchQuery]);

  // Copy helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((curr) => (curr === id ? null : curr));
    }, 2000);
  };

  // Generate Ideas Handler
  const handleGenerateIdeas = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedTopic = topic.trim();
    if (!trimmedTopic || trimmedTopic.length < 2) {
      setIdeasError('Please enter a topic or seed keyword (at least 2 characters).');
      return;
    }

    setIdeasError(null);
    setIsGeneratingIdeas(true);

    try {
      const res = await generateVideoIdeas({
        topic: trimmedTopic,
        niche: niche.trim() || undefined,
        targetAudience: targetAudience.trim() || undefined,
        language,
        platform,
        contentFormat,
        tone: tone.trim() || undefined,
        contentGoals: contentGoals.trim() || undefined,
        channelId: selectedChannelId || undefined,
        count: 4,
      });

      setGeneratedIdeas(res.ideas);
      setIdeasDisclaimer(res.disclaimer);
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ||
        err?.message ||
        'Failed to generate ideas with Gemini. Please verify configuration and retry.';
      setIdeasError(message);
    } finally {
      setIsGeneratingIdeas(false);
    }
  };

  // Generate SEO Kit Handler
  const handleGenerateSeo = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedTitle = seoTitle.trim();
    if (!trimmedTitle || trimmedTitle.length < 2) {
      setSeoError('Please enter a video title to optimize (at least 2 characters).');
      return;
    }

    setSeoError(null);
    setIsGeneratingSeo(true);

    try {
      const res = await generateSeoKit({
        title: trimmedTitle,
        topic: seoTopic.trim() || undefined,
        summary: seoSummary.trim() || undefined,
        targetAudience: seoAudience.trim() || undefined,
        contentFormat: seoFormat,
        channelId: selectedChannelId || undefined,
      });

      setSeoResult(res);
      setEditableDescription(res.description);
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ||
        err?.message ||
        'Failed to generate SEO kit with Gemini. Please retry.';
      setSeoError(message);
    } finally {
      setIsGeneratingSeo(false);
    }
  };

  // Save Idea Handler
  const handleSaveIdea = async (idea: GeneratedIdeaItem) => {
    setSavingIdeaTitle(idea.title);
    try {
      const saved = await saveVideoIdea({
        title: idea.title,
        summary: idea.summary,
        topic: topic || idea.title,
        niche,
        targetAudience: idea.targetAudience,
        language,
        platform,
        contentFormat: idea.contentFormat,
        tone,
        contentGoals,
        hook: idea.hook,
        primaryKeyword: idea.primaryKeyword,
        relatedKeywords: idea.relatedKeywords,
        callToAction: idea.callToAction,
        estimatedScore: idea.estimatedScore,
        angle: idea.angle,
        channelId: selectedChannelId || undefined,
      });
      setSavedIdeas((prev) => [saved, ...prev]);
      setSavedSuccessMessage(`Saved "${idea.title.slice(0, 32)}..." to your ideas!`);
      setTimeout(() => setSavedSuccessMessage(null), 3000);
    } catch (err: any) {
      console.error('[VideoIdeasPage] Could not save idea:', err);
      alert('Failed to save idea. Please retry.');
    } finally {
      setSavingIdeaTitle(null);
    }
  };

  // Toggle Favorite
  const handleToggleFavorite = async (item: SavedIdea) => {
    try {
      const updated = await updateSavedIdea(item.id, {
        isFavorite: !item.isFavorite,
      });
      setSavedIdeas((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, isFavorite: updated.isFavorite } : i))
      );
    } catch (err) {
      console.error('[VideoIdeasPage] Failed to toggle favorite:', err);
    }
  };

  // Delete Saved Idea
  const handleDeleteSavedIdea = async (id: string) => {
    try {
      await deleteSavedIdea(id);
      setSavedIdeas((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      console.error('[VideoIdeasPage] Failed to delete idea:', err);
      alert('Failed to delete idea.');
    }
  };

  // Send Idea to Script Studio
  const handleSendToScriptStudio = (idea: {
    title: string;
    topic?: string;
    hook?: string;
    format?: string;
    tone?: string;
    targetAudience?: string;
  }) => {
    navigate('/script-generator', {
      state: {
        title: idea.title,
        topic: idea.topic || topic || idea.title,
        hook: idea.hook,
        format: idea.format || contentFormat,
        tone: idea.tone || tone,
        audiencePersona: idea.targetAudience || targetAudience,
      },
    });
  };

  // Send Idea to SEO Assistant Tab
  const handleSendToSeoTab = (idea: GeneratedIdeaItem) => {
    setSeoTitle(idea.title);
    setSeoTopic(topic || idea.primaryKeyword);
    setSeoSummary(idea.summary);
    setSeoAudience(idea.targetAudience);
    setSeoFormat(idea.contentFormat);
    setActiveTab('seo');
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-amber-400" />
              <span>Video Ideas & SEO Opportunity Lab</span>
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
              Gemini 3.8 Flash
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Algorithmic topic discovery, AI keyword suggestions, and SEO metadata kit.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1.5 p-1 bg-[#141418] border border-white/[0.06] rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('ideas')}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer',
              activeTab === 'ideas'
                ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
            )}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Idea Generator</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('seo')}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer',
              activeTab === 'seo'
                ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
            )}
          >
            <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>SEO Assistant</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('saved')}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer',
              activeTab === 'saved'
                ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200'
            )}
          >
            <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
            <span>Saved Ideas ({savedIdeas.length})</span>
          </button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {savedSuccessMessage && (
        <div
          role="status"
          className="p-3 bg-emerald-950/50 border border-emerald-800/80 rounded-lg flex items-center gap-2 text-xs text-emerald-300"
        >
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{savedSuccessMessage}</span>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 1: VIDEO IDEAS GENERATOR                                  */}
      {/* ============================================================ */}
      {activeTab === 'ideas' && (
        <div className="space-y-6">
          {/* Query & Parameter Form */}
          <form
            onSubmit={handleGenerateIdeas}
            className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-4 shadow-sm"
          >
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id={topicId}
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Enter a creator niche or seed topic (e.g. SQLite for AI Agents, Next.js 15, Rust Microservices)..."
                  disabled={isGeneratingIdeas}
                  className="bg-zinc-900 border border-zinc-800 rounded-md pl-9 pr-3 py-2 text-xs text-zinc-100 w-full focus:outline-none focus:border-zinc-600 placeholder:text-zinc-500 font-sans"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className={cn(
                    'px-3 py-2 rounded-md border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer',
                    showAdvancedFilters
                      ? 'bg-zinc-800 border-zinc-700 text-zinc-200'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  )}
                  aria-expanded={showAdvancedFilters}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Filters</span>
                  {(niche.trim() || targetAudience.trim() || tone.trim() || contentGoals.trim()) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  )}
                </button>

                <button
                  type="submit"
                  disabled={isGeneratingIdeas}
                  className="px-4 py-2 rounded-md bg-zinc-100 hover:bg-zinc-200 disabled:opacity-50 text-zinc-950 text-xs font-medium transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isGeneratingIdeas ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Generating Ideas...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Generate Concepts</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Quick Inspiration Pills */}
            <div className="flex items-center gap-2 flex-wrap pt-1 text-[11px] text-zinc-400">
              <span className="text-zinc-500">Seed suggestions:</span>
              {[
                'SQLite for AI Agents',
                'Local LLM Benchmark',
                'System Design 2026',
                'Automated YouTube Shorts',
              ].map((seed) => (
                <button
                  key={seed}
                  type="button"
                  onClick={() => {
                    setTopic(seed);
                  }}
                  className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 transition-colors cursor-pointer"
                >
                  {seed}
                </button>
              ))}
            </div>

            {/* Collapsible Advanced Parameters */}
            {showAdvancedFilters && (
              <div className="pt-4 border-t border-zinc-800/70 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div>
                  <label htmlFor={nicheId} className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Channel / Niche
                  </label>
                  <input
                    id={nicheId}
                    type="text"
                    value={niche}
                    onChange={(e) => setNiche(e.target.value)}
                    placeholder="e.g. Cooking, Fitness, Tech (Optional)"
                    className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:border-zinc-600"
                  />
                </div>

                <div>
                  <label htmlFor={audienceId} className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Target Audience
                  </label>
                  <input
                    id={audienceId}
                    type="text"
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    placeholder="e.g. Home Cooks, Beginners (Optional - auto-inferred)"
                    className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:border-zinc-600"
                  />
                </div>

                <div>
                  <label htmlFor={formatId} className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Content Format
                  </label>
                  <select
                    id={formatId}
                    value={contentFormat}
                    onChange={(e) => setContentFormat(e.target.value as ContentFormat)}
                    className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:border-zinc-600"
                  >
                    <option value="long_form">Long-form Video (8m - 15m)</option>
                    <option value="shorts">YouTube Shorts (&lt;60s)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Platform
                  </label>
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:border-zinc-600"
                  >
                    <option value="YouTube">YouTube</option>
                    <option value="Shorts">YouTube Shorts</option>
                    <option value="TikTok">TikTok</option>
                  </select>
                </div>

                <div>
                  <label htmlFor={toneId} className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Delivery Tone
                  </label>
                  <select
                    id={toneId}
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:border-zinc-600"
                  >
                    <option value="">Auto (Natural for topic)</option>
                    <option value="Conversational & Insightful">Conversational & Insightful</option>
                    <option value="Authoritative & Rigorous">Authoritative & Rigorous</option>
                    <option value="Provocative & Contrarian">Provocative & Contrarian</option>
                    <option value="Fast-Paced & Energetic">Fast-Paced & Energetic</option>
                    <option value="Educational & Step-by-Step">Educational & Step-by-Step</option>
                  </select>
                </div>

                <div>
                  <label htmlFor={goalsId} className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Content Goals
                  </label>
                  <input
                    id={goalsId}
                    type="text"
                    value={contentGoals}
                    onChange={(e) => setContentGoals(e.target.value)}
                    placeholder="e.g. Audience Growth, Entertainment, Tutorials (Optional)"
                    className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:border-zinc-600"
                  />
                </div>

                <div>
                  <label htmlFor={languageId} className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Language
                  </label>
                  <input
                    id={languageId}
                    type="text"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:border-zinc-600"
                  />
                </div>
              </div>
            )}
          </form>

          {/* Error State */}
          {ideasError && (
            <ErrorState
              title="Idea Generation Error"
              message={ideasError}
              onRetry={handleGenerateIdeas}
              compact
            />
          )}

          {/* Loading Skeleton */}
          {isGeneratingIdeas && (
            <div className="space-y-3" role="status" aria-label="Loading video concepts">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] animate-pulse space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="h-5 w-28 bg-zinc-800 rounded" />
                    <div className="h-4 w-48 bg-zinc-800 rounded" />
                  </div>
                  <div className="h-6 w-3/4 bg-zinc-800 rounded" />
                  <div className="h-12 w-full bg-zinc-900 rounded" />
                </div>
              ))}
            </div>
          )}

          {/* Generated Ideas List */}
          {!isGeneratingIdeas && generatedIdeas.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
                <span>
                  Showing {generatedIdeas.length} concepts for{' '}
                  <strong className="text-zinc-200">"{topic}"</strong>
                </span>
                <span className="text-zinc-500 font-mono text-[11px]">
                  Estimated Heuristic Appeal Scores
                </span>
              </div>

              <div className="space-y-3">
                {generatedIdeas.map((idea, idx) => {
                  const copyKey = `idea-${idx}`;
                  const isCopied = copiedId === copyKey;
                  const isSavingThis = savingIdeaTitle === idea.title;

                  return (
                    <div
                      key={idx}
                      className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] hover:border-zinc-700/80 transition-all space-y-3.5 group shadow-xs"
                    >
                      {/* Top Metric Row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold"
                            title="Heuristic score based on topic appeal, title curiosity, and clear audience intent. This is an AI estimate, not a guaranteed YouTube ranking."
                          >
                            EST. APPEAL {idea.estimatedScore}/100
                          </span>
                          <span className="text-xs text-zinc-400 font-medium">
                            {idea.angle}
                          </span>
                          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400 border border-zinc-700/60">
                            {idea.contentFormat === 'shorts' ? 'Shorts' : 'Long-form'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                          <span className="text-zinc-500">Audience:</span>
                          <span className="text-zinc-300 font-medium">{idea.targetAudience}</span>
                        </div>
                      </div>

                      {/* Video Title */}
                      <div className="text-base font-semibold text-zinc-100 group-hover:text-white leading-snug">
                        {idea.title}
                      </div>

                      {/* Concept Summary */}
                      <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-900/60 p-3 rounded border border-zinc-800/70">
                        {idea.summary}
                      </p>

                      {/* Hook & Keywords Row */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        {/* Hook */}
                        <div className="p-2.5 rounded bg-zinc-900/40 border border-zinc-800/60 space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-amber-400 font-medium">5-Second Spoken Hook</span>
                            <button
                              type="button"
                              onClick={() => handleCopy(idea.hook, `hook-${idx}`)}
                              className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1 cursor-pointer"
                            >
                              {copiedId === `hook-${idx}` ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              <span className="text-[10px]">Copy</span>
                            </button>
                          </div>
                          <p className="text-zinc-200 italic font-mono text-[11px]">"{idea.hook}"</p>
                        </div>

                        {/* AI Keywords */}
                        <div className="p-2.5 rounded bg-zinc-900/40 border border-zinc-800/60 space-y-1.5">
                          <div className="text-[11px] text-zinc-400 flex items-center justify-between">
                            <span className="text-indigo-400 font-medium">AI Keyword Suggestions</span>
                            <span className="text-zinc-500 text-[10px] font-mono">Creative suggestions</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded bg-indigo-950/60 border border-indigo-800/60 text-indigo-300 text-[10px] font-medium">
                              Primary: {idea.primaryKeyword}
                            </span>
                            {idea.relatedKeywords.map((kw, kidx) => (
                              <span
                                key={kidx}
                                className="px-1.5 py-0.5 rounded bg-zinc-800/80 border border-zinc-700/60 text-zinc-300 text-[10px]"
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Bottom Action Footer */}
                      <div className="pt-3 border-t border-zinc-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <span className="text-zinc-500 font-mono text-[11px]">
                          CTA: "{idea.callToAction}"
                        </span>

                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Copy Idea */}
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(
                                `Title: ${idea.title}\nConcept: ${idea.summary}\nHook: ${idea.hook}\nPrimary Keyword: ${idea.primaryKeyword}`,
                                copyKey
                              )
                            }
                            className="px-2.5 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            {isCopied ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>

                          {/* Save Idea */}
                          <button
                            type="button"
                            onClick={() => handleSaveIdea(idea)}
                            disabled={isSavingThis}
                            className="px-2.5 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <Bookmark className="w-3.5 h-3.5 text-amber-400" />
                            <span>{isSavingThis ? 'Saving...' : 'Save Idea'}</span>
                          </button>

                          {/* Optimize in SEO Assistant */}
                          <button
                            type="button"
                            onClick={() => handleSendToSeoTab(idea)}
                            className="px-2.5 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-indigo-300 hover:text-indigo-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Wand2 className="w-3.5 h-3.5" />
                            <span>Optimize SEO</span>
                          </button>

                          {/* Draft in Script Studio */}
                          <button
                            type="button"
                            onClick={() =>
                              handleSendToScriptStudio({
                                title: idea.title,
                                topic: topic || idea.primaryKeyword,
                                hook: idea.hook,
                                format: idea.contentFormat,
                                tone,
                                targetAudience: idea.targetAudience,
                              })
                            }
                            className="px-3 py-1.5 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-950 font-medium inline-flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <span>Draft in Script Studio</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {ideasDisclaimer && (
                <p className="text-[11px] text-zinc-500 font-mono text-center pt-2">
                  * {ideasDisclaimer}
                </p>
              )}
            </div>
          )}

          {/* Empty State before first generation */}
          {!isGeneratingIdeas && generatedIdeas.length === 0 && (
            <div className="p-12 rounded-lg bg-[#141418] border border-white/[0.06] text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 mx-auto flex items-center justify-center text-zinc-400">
                <Sparkles className="w-5 h-5 text-amber-400" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-100">Ready to discover your next breakout video?</h3>
              <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                Enter your niche or seed topic above and click <strong>Generate Concepts</strong>.
                Gemini will craft multi-angle ideas with hooks, keyword suggestions, and estimated appeal heuristics.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 2: SEO ASSISTANT                                          */}
      {/* ============================================================ */}
      {activeTab === 'seo' && (
        <div className="space-y-6">
          {/* SEO Input Form */}
          <form
            onSubmit={handleGenerateSeo}
            className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-4 shadow-sm"
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                  Generate Complete YouTube SEO Kit
                </h3>
              </div>
              <span className="text-[11px] text-zinc-500 font-mono">
                Optimizes Title, Description, Tags, and Thumbnail Text
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <label htmlFor={seoTitleId} className="block font-medium text-zinc-300">
                  Video Title or Working Headline *
                </label>
                <input
                  id={seoTitleId}
                  type="text"
                  value={seoTitle}
                  onChange={(e) => setSeoTitle(e.target.value)}
                  placeholder="e.g. Why SQLite is the Best Database for Local AI"
                  disabled={isGeneratingSeo}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-zinc-100 focus:outline-none focus:border-zinc-600"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor={seoTopicId} className="block font-medium text-zinc-300">
                  Topic / Seed Keyword
                </label>
                <input
                  id={seoTopicId}
                  type="text"
                  value={seoTopic}
                  onChange={(e) => setSeoTopic(e.target.value)}
                  placeholder="e.g. SQLite AI Agents, Local RAG"
                  disabled={isGeneratingSeo}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-zinc-100 focus:outline-none focus:border-zinc-600"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-medium text-zinc-300">Target Audience Persona</label>
                <input
                  type="text"
                  value={seoAudience}
                  onChange={(e) => setSeoAudience(e.target.value)}
                  placeholder="e.g. Senior Software Engineers"
                  disabled={isGeneratingSeo}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-zinc-100 focus:outline-none focus:border-zinc-600"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-medium text-zinc-300">Content Format</label>
                <select
                  value={seoFormat}
                  onChange={(e) => setSeoFormat(e.target.value)}
                  disabled={isGeneratingSeo}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-zinc-100 focus:outline-none focus:border-zinc-600"
                >
                  <option value="long_form">Long-form Video</option>
                  <option value="shorts">YouTube Shorts</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={isGeneratingSeo}
                className="px-4 py-2 rounded-md bg-zinc-100 hover:bg-zinc-200 disabled:opacity-50 text-zinc-950 text-xs font-medium transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
              >
                {isGeneratingSeo ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Generating SEO Kit...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>Generate SEO Kit</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* SEO Error State */}
          {seoError && (
            <ErrorState
              title="SEO Generation Error"
              message={seoError}
              onRetry={handleGenerateSeo}
              compact
            />
          )}

          {/* Loading Indicator */}
          {isGeneratingSeo && (
            <div className="p-8 rounded-lg bg-[#141418] border border-white/[0.06] text-center space-y-3">
              <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin mx-auto" />
              <p className="text-xs text-zinc-300">Analyzing keyword search intent and structuring video metadata...</p>
            </div>
          )}

          {/* SEO Output Display */}
          {!isGeneratingSeo && seoResult && (
            <div className="space-y-6">
              {/* Score Header */}
              <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-mono font-bold text-sm">
                    SEO HEURISTIC SCORE: {seoResult.estimatedSeoScore}/100
                  </div>
                  <div>
                    <div className="text-xs font-medium text-zinc-200">
                      Algorithmic Metadata Optimization
                    </div>
                    <div className="text-[11px] text-zinc-400">{seoResult.scoreExplanation}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      `Title Variations:\n${seoResult.titleVariations.map((t) => `- ${t.title} (${t.style})`).join('\n')}\n\nDescription:\n${editableDescription}\n\nTags:\n${seoResult.tags.join(', ')}\n\nHashtags:\n${seoResult.hashtags.join(' ')}`,
                      'seo-all'
                    )
                  }
                  className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  {copiedId === 'seo-all' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>Copy Complete SEO Pack</span>
                </button>
              </div>

              {/* Title Variations */}
              <div className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Title Variations & Psychological Angles</span>
                  </h4>
                  <span className="text-[11px] text-zinc-500 font-mono">Click to copy title</span>
                </div>

                <div className="space-y-2">
                  {seoResult.titleVariations.map((tv, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 uppercase">
                            {tv.style}
                          </span>
                          <span className="text-xs font-medium text-zinc-100 truncate">{tv.title}</span>
                        </div>
                        <p className="text-[11px] text-zinc-400">{tv.rationale}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopy(tv.title, `tv-${idx}`)}
                          className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium flex items-center gap-1 cursor-pointer"
                        >
                          {copiedId === `tv-${idx}` ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>Copy</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setTopic(tv.title);
                            handleSendToScriptStudio({
                              title: tv.title,
                              topic: tv.title,
                              format: seoFormat,
                            });
                          }}
                          className="px-2.5 py-1 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-medium flex items-center gap-1 cursor-pointer"
                        >
                          <span>Draft</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Thumbnail Text Suggestions */}
              <div className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
                    <Tag className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Thumbnail Text Hooks (2-4 Words Max)</span>
                  </h4>
                  <span className="text-[11px] text-zinc-500 font-mono">
                    High contrast on-screen text cues
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {seoResult.thumbnailTextSuggestions.map((thumbText, idx) => (
                    <div
                      key={idx}
                      className="px-3 py-1.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-100 font-mono font-bold text-xs flex items-center gap-2"
                    >
                      <span>"{thumbText}"</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(thumbText, `thumb-${idx}`)}
                        className="text-zinc-400 hover:text-white cursor-pointer"
                        title="Copy text"
                      >
                        {copiedId === `thumb-${idx}` ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Description & Optimization Rationale */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Description Textarea */}
                <div className="lg:col-span-2 p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                      Structured YouTube Description
                    </h4>
                    <button
                      type="button"
                      onClick={() => handleCopy(editableDescription, 'desc')}
                      className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
                    >
                      {copiedId === 'desc' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>Copy Description</span>
                    </button>
                  </div>

                  <textarea
                    rows={12}
                    value={editableDescription}
                    onChange={(e) => setEditableDescription(e.target.value)}
                    className="w-full p-3 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-200 font-mono leading-relaxed focus:outline-none focus:border-zinc-600"
                  />
                  <p className="text-[11px] text-zinc-500">
                    * YouTube displays the first 2 lines in search snippets. Place your primary hook and keywords at the top.
                  </p>
                </div>

                {/* Keywords & Tags Breakdown */}
                <div className="space-y-4">
                  {/* Tags */}
                  <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-200">Recommended Tags</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(seoResult.tags.join(', '), 'tags')}
                        className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
                      >
                        {copiedId === 'tags' ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>Copy All</span>
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {seoResult.tags.map((t, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Hashtags */}
                  <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-200">Hashtags</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(seoResult.hashtags.join(' '), 'hashtags')}
                        className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
                      >
                        {copiedId === 'hashtags' ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>Copy</span>
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {seoResult.hashtags.map((h, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[11px] text-indigo-400 font-mono"
                        >
                          {h}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Optimization Rationale */}
                  <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] space-y-1.5">
                    <span className="text-xs font-medium text-zinc-200">Strategy Rationale</span>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      {seoResult.optimizationRationale}
                    </p>
                  </div>
                </div>
              </div>

              {seoResult.disclaimer && (
                <p className="text-[11px] text-zinc-500 font-mono text-center">
                  * {seoResult.disclaimer}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 3: SAVED IDEAS                                            */}
      {/* ============================================================ */}
      {activeTab === 'saved' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSavedFilter('all')}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer',
                  savedFilter === 'all'
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-200'
                )}
              >
                All Saved ({savedIdeas.length})
              </button>
              <button
                type="button"
                onClick={() => setSavedFilter('favorites')}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer',
                  savedFilter === 'favorites'
                    ? 'bg-zinc-800 text-amber-400'
                    : 'text-zinc-400 hover:text-zinc-200'
                )}
              >
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span>Favorites</span>
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={savedSearchQuery}
                onChange={(e) => setSavedSearchQuery(e.target.value)}
                placeholder="Search saved ideas..."
                className="w-full pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
              />
            </div>
          </div>

          {/* Error */}
          {savedError && (
            <ErrorState
              title="Saved Ideas Error"
              message={savedError}
              onRetry={fetchSaved}
              compact
            />
          )}

          {/* Loading */}
          {isLoadingSaved && (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="p-4 rounded-lg bg-[#141418] border border-white/[0.06] animate-pulse h-24" />
              ))}
            </div>
          )}

          {/* Saved List */}
          {!isLoadingSaved && savedIdeas.length > 0 && (
            <div className="space-y-3">
              {savedIdeas.map((saved) => (
                <div
                  key={saved.id}
                  className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] hover:border-zinc-700/80 transition-all space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleFavorite(saved)}
                        className="text-zinc-500 hover:text-amber-400 cursor-pointer"
                        title={saved.isFavorite ? 'Unfavorite' : 'Mark as favorite'}
                      >
                        <Star
                          className={cn(
                            'w-4 h-4',
                            saved.isFavorite ? 'fill-amber-400 text-amber-400' : 'text-zinc-600'
                          )}
                        />
                      </button>

                      <div className="text-sm font-semibold text-zinc-100">{saved.title}</div>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
                      {saved.estimatedScore && (
                        <span className="text-emerald-400">SCORE: {saved.estimatedScore}/100</span>
                      )}
                      <span className="text-zinc-500">|</span>
                      <span>{new Date(saved.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {saved.summary && (
                    <p className="text-xs text-zinc-300 leading-relaxed">{saved.summary}</p>
                  )}

                  {saved.hook && (
                    <div className="p-2 rounded bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-300">
                      Hook: "{saved.hook}"
                    </div>
                  )}

                  <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-zinc-500 text-[11px]">
                      <span>Format: {saved.contentFormat}</span>
                      {saved.primaryKeyword && <span>• Keyword: {saved.primaryKeyword}</span>}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSeoTitle(saved.title);
                          setSeoTopic(saved.topic);
                          setSeoSummary(saved.summary || '');
                          setActiveTab('seo');
                        }}
                        className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-indigo-300 text-xs font-medium cursor-pointer"
                      >
                        SEO Kit
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleSendToScriptStudio({
                            title: saved.title,
                            topic: saved.topic,
                            hook: saved.hook || undefined,
                            format: saved.contentFormat,
                            tone: saved.tone || undefined,
                            targetAudience: saved.targetAudience || undefined,
                          })
                        }
                        className="px-2.5 py-1 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-medium flex items-center gap-1 cursor-pointer"
                      >
                        <span>Draft in Script Studio</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteSavedIdea(saved.id)}
                        className="p-1 rounded text-zinc-500 hover:text-rose-400 cursor-pointer transition-colors"
                        title="Delete saved idea"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty Saved Ideas */}
          {!isLoadingSaved && savedIdeas.length === 0 && (
            <div className="p-12 rounded-lg bg-[#141418] border border-white/[0.06] text-center space-y-3">
              <FolderOpen className="w-8 h-8 text-zinc-600 mx-auto" />
              <h3 className="text-sm font-semibold text-zinc-200">No saved ideas yet</h3>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                Generate concepts in the <strong>Idea Generator</strong> tab and click <strong>Save Idea</strong> to bookmark them for later filming.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VideoIdeasPage;
