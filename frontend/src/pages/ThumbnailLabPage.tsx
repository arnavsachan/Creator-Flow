import { Image as ImageIcon, UploadCloud } from 'lucide-react';

const THUMBNAILS = [
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

export const ThumbnailLabPage: React.FC = () => {
  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100 tracking-tight">
            Thumbnail Lab & Vision Contrast Audit
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Mobile feed simulation, contrast ratio scoring, and glanceability diagnostics.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-medium transition-colors cursor-pointer"
        >
          <UploadCloud className="w-3.5 h-3.5" />
          <span>Upload Thumbnail Variant</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {THUMBNAILS.map((thumb) => (
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
  );
};

export default ThumbnailLabPage;
