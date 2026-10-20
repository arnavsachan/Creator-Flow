import React, { useRef, useState } from 'react';
import { AlertCircle, Loader2, Upload } from 'lucide-react';

interface ShortsUploadDropzoneProps {
  hasActiveJob: boolean;
  uploadProgress: number | null;
  uploadError: string | null;
  onFileSelect: (file: File) => void;
}

export const ShortsUploadDropzone: React.FC<ShortsUploadDropzoneProps> = ({
  hasActiveJob,
  uploadProgress,
  uploadError,
  onFileSelect,
}) => {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const isUploading = uploadProgress !== null;

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp4,.mov,.mkv,.webm"
        className="hidden"
        disabled={isUploading}
        aria-label="Upload video file"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            onFileSelect(e.target.files[0]);
            e.target.value = '';
          }
        }}
      />

      {hasActiveJob ? (
        /* Collapsed slim bar for active job */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`px-4 py-2.5 rounded-lg border transition-colors ${
            isDragging
              ? 'border-emerald-500/50 bg-emerald-500/5'
              : 'border-white/[0.06] bg-[#141418]'
          } flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium border border-zinc-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none"
            >
              {isUploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
              ) : (
                <Upload className="w-3.5 h-3.5 text-zinc-300" />
              )}
              <span>{isUploading ? `Uploading (${uploadProgress}%)` : 'Upload new video'}</span>
            </button>
            <span className="text-xs text-zinc-400">
              MP4, MOV, MKV, WebM up to 500MB (max 60m)
            </span>
          </div>

          {isUploading && (
            <div
              className="w-full sm:w-48 bg-zinc-800 h-1.5 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={uploadProgress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="bg-emerald-500 h-full transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}

          {uploadError && (
            <div
              className="flex items-center gap-1.5 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-md"
              role="alert"
              aria-live="polite"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}
        </div>
      ) : (
        /* Large dropzone for empty state */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`p-8 rounded-lg border transition-colors ${
            isDragging
              ? 'border-emerald-500/50 bg-emerald-500/5'
              : 'border-white/[0.06] bg-[#141418]'
          } flex flex-col items-center justify-center text-center space-y-3`}
        >
          <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400">
            {isUploading ? (
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
            ) : (
              <Upload className="w-6 h-6" />
            )}
          </div>

          <div className="space-y-1">
            <div className="text-sm font-medium text-zinc-200">
              {isUploading ? (
                <span>Uploading & Validating Video ({uploadProgress}%)</span>
              ) : (
                <span>Drag & drop video here or browse file</span>
              )}
            </div>
            <div className="text-xs text-zinc-500">
              Supports MP4, MOV, MKV, WebM up to 500MB (max duration 60 mins).
            </div>
          </div>

          {isUploading ? (
            <div
              className="w-full max-w-xs bg-zinc-800 h-2 rounded-full overflow-hidden mt-2"
              role="progressbar"
              aria-valuenow={uploadProgress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="bg-emerald-500 h-full transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-950 text-xs font-semibold transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none"
            >
              Select Video File
            </button>
          )}

          {uploadError && (
            <div
              className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-md mt-2"
              role="alert"
              aria-live="polite"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
