import React, { useState, useRef } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  Image as ImageIcon,
  Layers,
  RefreshCw,
  Sparkles,
  Type,
  UploadCloud,
  Zap,
} from 'lucide-react';
import { scoreThumbnail, scoreTitle, validateThumbnailFile } from '../services/thumbnailService';
import type {
  ThumbnailScoringResponse,
  TitleScoringResponse,
} from '../types/thumbnails';

// Benchmark concepts preserved from original layout
const BENCHMARK_THUMBNAILS = [
  {
    id: 1,
    title: 'Concept A: High Contrast Facial Focal Point',
    ctrScore: 92,
    focalPoint: 'Subject Eyes + Terminal Window',
    contrastRatio: '14.2:1 (AAA)',
    status: 'Recommended',
  },
  {
    id: 2,
    title: 'Concept B: Minimalist Code Architecture Diagram',
    ctrScore: 81,
    focalPoint: 'Center Vector Graph',
    contrastRatio: '9.8:1 (AA)',
    status: 'Alternative',
  },
];

type ActiveTab = 'thumbnail' | 'title' | 'benchmarks';

export const ThumbnailLabPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('thumbnail');

  // --- Thumbnail Scoring State ---
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [thumbTitle, setThumbTitle] = useState('');
  const [thumbTopic, setThumbTopic] = useState('');
  const [isThumbAnalyzing, setIsThumbAnalyzing] = useState(false);
  const [thumbError, setThumbError] = useState<string | null>(null);
  const [thumbResult, setThumbResult] = useState<ThumbnailScoringResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Title Scoring State ---
  const [titleInput, setTitleInput] = useState('');
  const [titleTopic, setTitleTopic] = useState('');
  const [titleDescription, setTitleDescription] = useState('');
  const [isTitleAnalyzing, setIsTitleAnalyzing] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [titleResult, setTitleResult] = useState<TitleScoringResponse | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // --- Handlers: Thumbnail ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setThumbError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      validateThumbnailFile(file);
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } catch (err: any) {
      setThumbError(err.message || 'Invalid image file.');
      setSelectedFile(null);
      setPreviewUrl(null);
    }
  };

  const handleAnalyzeThumbnail = async () => {
    if (!selectedFile) {
      setThumbError('Please select or upload a thumbnail image first.');
      return;
    }

    setIsThumbAnalyzing(true);
    setThumbError(null);

    try {
      const response = await scoreThumbnail(selectedFile, {
        title: thumbTitle,
        topic: thumbTopic,
      });
      setThumbResult(response);
    } catch (err: any) {
      setThumbError(err.message || 'Failed to score thumbnail variant. Please try again.');
    } finally {
      setIsThumbAnalyzing(false);
    }
  };

  const handleResetThumbnail = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setThumbResult(null);
    setThumbError(null);
    setThumbTitle('');
    setThumbTopic('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // --- Handlers: Title ---
  const handleAnalyzeTitle = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = titleInput.trim();
    if (!cleanTitle) {
      setTitleError('Please enter a video title to score.');
      return;
    }

    if (cleanTitle.length > 200) {
      setTitleError('Title cannot exceed 200 characters.');
      return;
    }

    setIsTitleAnalyzing(true);
    setTitleError(null);

    try {
      const response = await scoreTitle({
        title: cleanTitle,
        topic: titleTopic.trim() || undefined,
        description: titleDescription.trim() || undefined,
      });
      setTitleResult(response);
    } catch (err: any) {
      setTitleError(err.message || 'Failed to evaluate video title. Please try again.');
    } finally {
      setIsTitleAnalyzing(false);
    }
  };

  const handleCopyAlternative = (altTitle: string, index: number) => {
    navigator.clipboard.writeText(altTitle);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Score badge helper
  const getScoreBadgeColor = (score: number) => {
    if (score >= 85) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (score >= 70) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
  };

  const getScoreBarColor = (score: number) => {
    if (score >= 85) return 'bg-emerald-500';
    if (score >= 70) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100 tracking-tight">
            Thumbnail Lab & Title Scoring Engine
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Diagnostic contrast audits, CTR glanceability heuristics, and title hook optimization.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[#141418] border border-white/[0.06] text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('thumbnail')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
              activeTab === 'thumbnail'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Thumbnail Audit</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('title')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
              activeTab === 'title'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            <span>Title Scorer</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('benchmarks')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
              activeTab === 'benchmarks'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Benchmarks</span>
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* TAB 1: THUMBNAIL SCORING & VISION AUDIT                         */}
      {/* ============================================================== */}
      {activeTab === 'thumbnail' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Upload & Configuration Form */}
            <div className="lg:col-span-5 space-y-4">
              <div className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Upload Variant
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">
                    JPG, PNG, WEBP (Max 10MB)
                  </span>
                </div>

                {/* Hidden File Input */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  id="thumbnail-upload-input"
                />

                {/* Upload Drag/Drop Box */}
                {!previewUrl ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full aspect-video rounded-md border-2 border-dashed border-zinc-800 hover:border-zinc-700 bg-[#09090B] flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-400 group-hover:text-zinc-200 mb-3 border border-zinc-800">
                      <UploadCloud className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-medium text-zinc-300">
                      Click to choose or drop thumbnail
                    </span>
                    <span className="text-[11px] text-zinc-500 mt-1">
                      1280x720 (16:9) recommended
                    </span>
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="relative aspect-video rounded-md bg-[#09090B] border border-zinc-800 overflow-hidden group">
                      <img
                        src={previewUrl}
                        alt="Thumbnail variant preview"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-2.5 py-1 rounded bg-zinc-900/90 hover:bg-zinc-800 text-xs text-zinc-200 border border-zinc-700 cursor-pointer"
                        >
                          Change Image
                        </button>
                        <button
                          type="button"
                          onClick={handleResetThumbnail}
                          className="px-2.5 py-1 rounded bg-rose-950/80 hover:bg-rose-900 text-xs text-rose-300 border border-rose-800/40 cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 px-1">
                      <span className="truncate max-w-[200px]">{selectedFile?.name}</span>
                      <span>
                        {selectedFile ? (selectedFile.size / 1024).toFixed(0) + ' KB' : ''}
                      </span>
                    </div>
                  </div>
                )}

                {/* Optional Paired Metadata */}
                <div className="space-y-3 pt-3 border-t border-zinc-800/80">
                  <div>
                    <label
                      htmlFor="thumb-title-input"
                      className="block text-xs font-medium text-zinc-300 mb-1"
                    >
                      Paired Video Title <span className="text-zinc-500 font-normal">(Optional)</span>
                    </label>
                    <input
                      id="thumb-title-input"
                      type="text"
                      value={thumbTitle}
                      onChange={(e) => setThumbTitle(e.target.value)}
                      placeholder="e.g. Why You Are Coding Python Wrong in 2026"
                      className="w-full px-3 py-1.5 rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="thumb-topic-input"
                      className="block text-xs font-medium text-zinc-300 mb-1"
                    >
                      Video Topic / Niche <span className="text-zinc-500 font-normal">(Optional)</span>
                    </label>
                    <input
                      id="thumb-topic-input"
                      type="text"
                      value={thumbTopic}
                      onChange={(e) => setThumbTopic(e.target.value)}
                      placeholder="e.g. Software Engineering & AI"
                      className="w-full px-3 py-1.5 rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
                    />
                  </div>
                </div>

                {/* Error Banner */}
                {thumbError && (
                  <div className="p-3 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                    <span>{thumbError}</span>
                  </div>
                )}

                {/* Action Button */}
                <button
                  type="button"
                  onClick={handleAnalyzeThumbnail}
                  disabled={!selectedFile || isThumbAnalyzing}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-zinc-100 hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-950 text-xs font-medium transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  {isThumbAnalyzing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Analyzing Visual Contrast...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Run Diagnostic Scoring</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Right Column: Diagnostic Scoring Results */}
            <div className="lg:col-span-7">
              {!thumbResult && !isThumbAnalyzing && (
                <div className="h-full min-h-[380px] p-8 rounded-lg bg-[#141418] border border-white/[0.06] flex flex-col items-center justify-center text-center text-zinc-500">
                  <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3 text-zinc-400">
                    <Eye className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-semibold text-zinc-200">No Variant Analyzed Yet</h3>
                  <p className="text-xs text-zinc-400 max-w-sm mt-1">
                    Upload a thumbnail variant on the left to inspect 16:9 mobile framing, contrast ratios, text legibility, and clutter density.
                  </p>
                </div>
              )}

              {isThumbAnalyzing && (
                <div className="h-full min-h-[380px] p-8 rounded-lg bg-[#141418] border border-white/[0.06] flex flex-col items-center justify-center text-center">
                  <RefreshCw className="w-8 h-8 text-zinc-400 animate-spin mb-3" />
                  <span className="text-sm font-medium text-zinc-200">
                    Evaluating Thumbnail Diagnostics...
                  </span>
                  <span className="text-xs text-zinc-500 mt-1">
                    Scanning luminance distribution, WCAG contrast ratios, and spatial hierarchy.
                  </span>
                </div>
              )}

              {thumbResult && !isThumbAnalyzing && (
                <div className="space-y-4">
                  {/* Top Score Banner */}
                  <div className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-zinc-400">OVERALL SCORE</span>
                        <span
                          className={`text-xs font-mono px-2 py-0.5 rounded border ${getScoreBadgeColor(
                            thumbResult.overallScore
                          )}`}
                        >
                          {thumbResult.grade}
                        </span>
                      </div>
                      <div className="text-3xl font-bold text-zinc-100 font-mono tracking-tight mt-1">
                        {thumbResult.overallScore}
                        <span className="text-sm font-normal text-zinc-500"> / 100</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs font-mono pt-3 sm:pt-0 sm:border-l sm:border-zinc-800 sm:pl-6">
                      <div>
                        <span className="text-zinc-500 block">Contrast Ratio</span>
                        <span className="text-zinc-200 font-semibold">{thumbResult.contrastRatio}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">Focal Point</span>
                        <span className="text-zinc-200 font-semibold truncate block max-w-[160px]">
                          {thumbResult.focalPoint}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Warnings (if any) */}
                  {thumbResult.warnings && thumbResult.warnings.length > 0 && (
                    <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-1.5">
                      <div className="flex items-center gap-1.5 font-semibold text-amber-200">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        <span>Visual Diagnostics Warnings</span>
                      </div>
                      <ul className="list-disc list-inside space-y-1 pl-1 text-amber-300/90">
                        {thumbResult.warnings.map((warn, idx) => (
                          <li key={idx}>{warn}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Criteria Breakdown */}
                  <div className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
                      Criterion Breakdown
                    </span>
                    <div className="space-y-3">
                      {thumbResult.criteria.map((crit, idx) => (
                        <div key={idx} className="p-3 rounded-md bg-[#09090B] border border-zinc-800/80 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-zinc-200">{crit.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-zinc-400">{crit.grade}</span>
                              <span className="font-mono font-semibold text-zinc-100">{crit.score}</span>
                            </div>
                          </div>
                          {/* Progress bar */}
                          <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${getScoreBarColor(crit.score)}`}
                              style={{ width: `${crit.score}%` }}
                            />
                          </div>
                          <p className="text-[11px] text-zinc-400 leading-relaxed pt-0.5">
                            {crit.reasoning}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Suggestions Checklist */}
                  {thumbResult.suggestions && thumbResult.suggestions.length > 0 && (
                    <div className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-3">
                      <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block">
                        Actionable Improvement Suggestions
                      </span>
                      <ul className="space-y-2">
                        {thumbResult.suggestions.map((sug, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-xs text-zinc-300">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            <span>{sug}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Provider Note */}
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 px-1">
                    <span>Engine: {thumbResult.provider}</span>
                    <span className="truncate max-w-xs">{thumbResult.providerNote}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: TITLE SCORING ENGINE                                     */}
      {/* ============================================================== */}
      {activeTab === 'title' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Title Form */}
            <div className="lg:col-span-5 space-y-4">
              <form onSubmit={handleAnalyzeTitle} className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block">
                  Proposed Video Title
                </span>

                <div className="space-y-1">
                  <div className="relative">
                    <textarea
                      id="video-title-input"
                      rows={3}
                      value={titleInput}
                      onChange={(e) => setTitleInput(e.target.value)}
                      placeholder="e.g. 7 Proven YouTube Automation Secrets in 2026"
                      className="w-full px-3 py-2 rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 resize-none"
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-zinc-500">
                      Ideal length: 45–65 characters
                    </span>
                    <span
                      className={
                        titleInput.length > 70
                          ? 'text-amber-400'
                          : titleInput.length >= 45
                          ? 'text-emerald-400'
                          : 'text-zinc-400'
                      }
                    >
                      {titleInput.length} / 200
                    </span>
                  </div>
                </div>

                <div className="space-y-3 pt-3 border-t border-zinc-800/80">
                  <div>
                    <label
                      htmlFor="video-topic-input"
                      className="block text-xs font-medium text-zinc-300 mb-1"
                    >
                      Video Topic / Niche <span className="text-zinc-500 font-normal">(Optional)</span>
                    </label>
                    <input
                      id="video-topic-input"
                      type="text"
                      value={titleTopic}
                      onChange={(e) => setTitleTopic(e.target.value)}
                      placeholder="e.g. YouTube Automation & Passive Income"
                      className="w-full px-3 py-1.5 rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="video-desc-input"
                      className="block text-xs font-medium text-zinc-300 mb-1"
                    >
                      Video Synopsis / Hook <span className="text-zinc-500 font-normal">(Optional)</span>
                    </label>
                    <textarea
                      id="video-desc-input"
                      rows={2}
                      value={titleDescription}
                      onChange={(e) => setTitleDescription(e.target.value)}
                      placeholder="e.g. Step-by-step breakdown of how creators build scalable channel workflows."
                      className="w-full px-3 py-1.5 rounded-md bg-[#09090B] border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 resize-none"
                    />
                  </div>
                </div>

                {/* Error Banner */}
                {titleError && (
                  <div className="p-3 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                    <span>{titleError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!titleInput.trim() || isTitleAnalyzing}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-zinc-100 hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-950 text-xs font-medium transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  {isTitleAnalyzing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Auditing Title Hook...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5" />
                      <span>Score Video Title</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Right Column: Title Results */}
            <div className="lg:col-span-7">
              {!titleResult && !isTitleAnalyzing && (
                <div className="h-full min-h-[380px] p-8 rounded-lg bg-[#141418] border border-white/[0.06] flex flex-col items-center justify-center text-center text-zinc-500">
                  <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3 text-zinc-400">
                    <Type className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-semibold text-zinc-200">No Title Evaluated Yet</h3>
                  <p className="text-xs text-zinc-400 max-w-sm mt-1">
                    Enter a video title on the left to evaluate clarity, curiosity hook strength, specificity anchors, and mobile feed truncation.
                  </p>
                </div>
              )}

              {isTitleAnalyzing && (
                <div className="h-full min-h-[380px] p-8 rounded-lg bg-[#141418] border border-white/[0.06] flex flex-col items-center justify-center text-center">
                  <RefreshCw className="w-8 h-8 text-zinc-400 animate-spin mb-3" />
                  <span className="text-sm font-medium text-zinc-200">Analyzing Title CTR Potential...</span>
                  <span className="text-xs text-zinc-500 mt-1">
                    Assessing cognitive friction, emotional hooks, and mobile feed truncation.
                  </span>
                </div>
              )}

              {titleResult && !isTitleAnalyzing && (
                <div className="space-y-4">
                  {/* Title Score Overview */}
                  <div className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-zinc-400">TITLE SCORE</span>
                        <span
                          className={`text-xs font-mono px-2 py-0.5 rounded border ${getScoreBadgeColor(
                            titleResult.overallScore
                          )}`}
                        >
                          {titleResult.grade}
                        </span>
                      </div>
                      <div className="text-3xl font-bold text-zinc-100 font-mono tracking-tight mt-1">
                        {titleResult.overallScore}
                        <span className="text-sm font-normal text-zinc-500"> / 100</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs font-mono pt-3 sm:pt-0 sm:border-l sm:border-zinc-800 sm:pl-6">
                      <div>
                        <span className="text-zinc-500 block">Length</span>
                        <span className="text-zinc-200 font-semibold">
                          {titleResult.characterCount} chars ({titleResult.wordCount} words)
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block">Curiosity Hook</span>
                        <span className="text-zinc-200 font-semibold">
                          {titleResult.curiosityScore} / 100
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 5 Criteria Metrics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-md bg-[#141418] border border-white/[0.06] space-y-1">
                      <span className="text-[10px] font-mono text-zinc-500 block">CLARITY</span>
                      <div className="text-lg font-bold font-mono text-zinc-100">
                        {titleResult.clarityScore}
                      </div>
                      <div className="w-full h-1 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className={`h-full ${getScoreBarColor(titleResult.clarityScore)}`}
                          style={{ width: `${titleResult.clarityScore}%` }}
                        />
                      </div>
                    </div>

                    <div className="p-3 rounded-md bg-[#141418] border border-white/[0.06] space-y-1">
                      <span className="text-[10px] font-mono text-zinc-500 block">SPECIFICITY</span>
                      <div className="text-lg font-bold font-mono text-zinc-100">
                        {titleResult.specificityScore}
                      </div>
                      <div className="w-full h-1 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className={`h-full ${getScoreBarColor(titleResult.specificityScore)}`}
                          style={{ width: `${titleResult.specificityScore}%` }}
                        />
                      </div>
                    </div>

                    <div className="p-3 rounded-md bg-[#141418] border border-white/[0.06] space-y-1">
                      <span className="text-[10px] font-mono text-zinc-500 block">CURIOSITY HOOK</span>
                      <div className="text-lg font-bold font-mono text-zinc-100">
                        {titleResult.curiosityScore}
                      </div>
                      <div className="w-full h-1 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className={`h-full ${getScoreBarColor(titleResult.curiosityScore)}`}
                          style={{ width: `${titleResult.curiosityScore}%` }}
                        />
                      </div>
                    </div>

                    <div className="p-3 rounded-md bg-[#141418] border border-white/[0.06] space-y-1">
                      <span className="text-[10px] font-mono text-zinc-500 block">READABILITY</span>
                      <div className="text-lg font-bold font-mono text-zinc-100">
                        {titleResult.readabilityScore}
                      </div>
                      <div className="w-full h-1 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className={`h-full ${getScoreBarColor(titleResult.readabilityScore)}`}
                          style={{ width: `${titleResult.readabilityScore}%` }}
                        />
                      </div>
                    </div>

                    <div className="p-3 rounded-md bg-[#141418] border border-white/[0.06] space-y-1 col-span-2 sm:col-span-1">
                      <span className="text-[10px] font-mono text-zinc-500 block">TOPIC RELEVANCE</span>
                      <div className="text-lg font-bold font-mono text-zinc-100">
                        {titleResult.relevanceScore !== null ? titleResult.relevanceScore : 'N/A'}
                      </div>
                      <div className="w-full h-1 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className={`h-full ${getScoreBarColor(titleResult.relevanceScore || 70)}`}
                          style={{ width: `${titleResult.relevanceScore || 0}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Alternative Title Suggestions */}
                  {titleResult.alternativeTitles && titleResult.alternativeTitles.length > 0 && (
                    <div className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                          Alternative Headline Formulas
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500">1-Click Copy</span>
                      </div>

                      <div className="space-y-2">
                        {titleResult.alternativeTitles.map((alt, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded-md bg-[#09090B] border border-zinc-800/80 flex items-center justify-between gap-3 text-xs"
                          >
                            <span className="text-zinc-200 font-medium">{alt}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyAlternative(alt, idx)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[11px] font-mono transition-colors border border-zinc-800 cursor-pointer shrink-0"
                            >
                              {copiedIndex === idx ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span className="text-emerald-400">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 text-zinc-400" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actionable Suggestions */}
                  {titleResult.suggestions && titleResult.suggestions.length > 0 && (
                    <div className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-3">
                      <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block">
                        Optimization Recommendations
                      </span>
                      <ul className="space-y-2">
                        {titleResult.suggestions.map((sug, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-xs text-zinc-300">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            <span>{sug}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Explanations & Engine Note */}
                  <div className="p-4 rounded-md bg-zinc-900/60 border border-zinc-800/60 text-[11px] text-zinc-400 space-y-1">
                    {titleResult.explanations.map((exp, idx) => (
                      <p key={idx}>{exp}</p>
                    ))}
                    <p className="text-[10px] text-zinc-500 pt-1">
                      Scores are heuristic quality assessments based on creator CTR patterns and do not guarantee actual platform performance.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: BENCHMARK VARIANTS (PRESERVED FROM ORIGINAL LAYOUT)     */}
      {/* ============================================================== */}
      {activeTab === 'benchmarks' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {BENCHMARK_THUMBNAILS.map((thumb) => (
              <div
                key={thumb.id}
                className="p-5 rounded-lg bg-[#141418] border border-white/[0.06] space-y-4"
              >
                {/* 16:9 Thumbnail Canvas Box */}
                <div className="w-full aspect-video rounded-md bg-[#09090B] border border-zinc-800 flex flex-col items-center justify-center text-zinc-500 relative overflow-hidden group">
                  <ImageIcon className="w-8 h-8 text-zinc-600 mb-2" />
                  <span className="text-xs font-mono text-zinc-400">1920 x 1080 Mock Visual</span>
                  <div className="absolute top-3 right-3 text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900/90 text-emerald-400 border border-emerald-500/20">
                    CTR SCORE {thumb.ctrScore}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-zinc-100">{thumb.title}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                      {thumb.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-2 border-t border-zinc-800/80">
                    <div>
                      <span className="text-zinc-500">Focal Point</span>
                      <div className="text-zinc-300">{thumb.focalPoint}</div>
                    </div>
                    <div>
                      <span className="text-zinc-500">Contrast Ratio</span>
                      <div className="text-zinc-300">{thumb.contrastRatio}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ThumbnailLabPage;
