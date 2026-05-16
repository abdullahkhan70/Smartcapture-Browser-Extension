import React, { useState } from 'react';

interface DownloadFormatPopupProps {
  onSelect: (format: 'png' | 'jpeg', quality: number) => void;
  onClose: () => void;
}

export function DownloadFormatPopup({ onSelect, onClose }: DownloadFormatPopupProps) {
  const [selectedFormat, setSelectedFormat] = useState<'png' | 'jpeg'>('png');
  const [quality, setQuality] = useState(95);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const q = selectedFormat === 'jpeg' ? quality / 100 : 1;
      await onSelect(selectedFormat, q);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="ed-overlay-backdrop flex items-center justify-center" onClick={handleBackdropClick}>
      <div
        className="ed-animate-scale-in w-[380px] bg-ed-bg-secondary rounded-ed-lg border border-ed-border
          shadow-ed-modal overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-ed-border">
          <div>
            <h3 className="text-sm font-semibold text-ed-text-primary">Download Image</h3>
            <p className="text-[11px] text-ed-text-muted mt-0.5">Choose a format to save your annotated screenshot</p>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-ed cursor-pointer ed-transition
              text-ed-text-muted hover:text-ed-text-primary hover:bg-ed-bg-hover"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Format Selection */}
        <div className="p-5 space-y-5">
          <div className="space-y-2.5">
            <label className="text-[10px] font-bold text-ed-text-muted uppercase tracking-widest">Format</label>
            <div className="grid grid-cols-2 gap-2.5">
              {/* PNG */}
              <button
                onClick={() => setSelectedFormat('png')}
                className={`flex flex-col items-center gap-2 p-3.5 rounded-ed-lg cursor-pointer ed-transition border
                  ${selectedFormat === 'png'
                    ? 'bg-ed-accent/10 border-ed-accent/40'
                    : 'bg-ed-bg/60 border-ed-border hover:border-ed-text-muted/20'
                  }`}
              >
                <div
                  className={`flex items-center justify-center rounded-ed w-11 h-11
                    ${selectedFormat === 'png' ? 'bg-ed-accent/15' : 'bg-surface-elevated/40'}`}
                >
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                    <rect x="3" y="3" width="16" height="16" rx="3"
                      stroke={selectedFormat === 'png' ? '#00a8ff' : '#64748b'} strokeWidth="1.5"/>
                    <path d="M3 15L7 10L10 13L14 8L19 14"
                      stroke={selectedFormat === 'png' ? '#00a8ff' : '#64748b'} strokeWidth="1.2"
                      strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="7.5" cy="7.5" r="1.5"
                      fill={selectedFormat === 'png' ? '#00a8ff' : '#64748b'}/>
                  </svg>
                </div>
                <div className="text-center">
                  <span className={`text-xs font-semibold ${selectedFormat === 'png' ? 'text-ed-accent' : 'text-ed-text-primary'}`}>
                    PNG
                  </span>
                  <p className="text-[9px] text-ed-text-muted mt-0.5">Lossless quality</p>
                </div>
              </button>

              {/* JPEG */}
              <button
                onClick={() => setSelectedFormat('jpeg')}
                className={`flex flex-col items-center gap-2 p-3.5 rounded-ed-lg cursor-pointer ed-transition border
                  ${selectedFormat === 'jpeg'
                    ? 'bg-ed-accent/10 border-ed-accent/40'
                    : 'bg-ed-bg/60 border-ed-border hover:border-ed-text-muted/20'
                  }`}
              >
                <div
                  className={`flex items-center justify-center rounded-ed w-11 h-11
                    ${selectedFormat === 'jpeg' ? 'bg-ed-accent/15' : 'bg-surface-elevated/40'}`}
                >
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                    <rect x="3" y="3" width="16" height="16" rx="3"
                      stroke={selectedFormat === 'jpeg' ? '#00a8ff' : '#64748b'} strokeWidth="1.5"/>
                    <path d="M3 15L7 10L10 13L14 8L19 14"
                      stroke={selectedFormat === 'jpeg' ? '#00a8ff' : '#64748b'} strokeWidth="1.2"
                      strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="7.5" cy="7.5" r="1.5"
                      fill={selectedFormat === 'jpeg' ? '#00a8ff' : '#64748b'}/>
                    <path d="M14 3H19V8"
                      stroke={selectedFormat === 'jpeg' ? '#00a8ff' : '#64748b'} strokeWidth="1.2"
                      strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="text-center">
                  <span className={`text-xs font-semibold ${selectedFormat === 'jpeg' ? 'text-ed-accent' : 'text-ed-text-primary'}`}>
                    JPEG
                  </span>
                  <p className="text-[9px] text-ed-text-muted mt-0.5">Smaller file size</p>
                </div>
              </button>
            </div>
          </div>

          {/* Quality Slider (JPEG only) */}
          {selectedFormat === 'jpeg' && (
            <div className="space-y-2.5 ed-animate-fade-in">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-ed-text-muted uppercase tracking-widest">Quality</label>
                <span className="text-[11px] font-semibold text-ed-text-primary tabular-nums">{quality}%</span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
              />
              <div className="flex justify-between">
                <span className="text-[9px] text-ed-text-muted">Smaller file</span>
                <span className="text-[9px] text-ed-text-muted">Better quality</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-t border-ed-border">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-4 rounded-ed-lg text-xs font-semibold cursor-pointer ed-transition
              text-ed-text-secondary hover:text-ed-text-primary hover:bg-ed-bg-hover border border-ed-border"
          >
            Cancel
          </button>
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-ed-lg text-xs font-semibold
              cursor-pointer ed-transition text-white disabled:opacity-60 bg-ed-accent hover:bg-ed-accent-hover shadow-ed-glow-sm"
          >
            {isDownloading ? (
              <>
                <div className="w-3.5 h-3.5 rounded-full ed-animate-spin border-2 border-white/30" style={{ borderTopColor: '#fff' }} />
                Saving...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 2V9M7 9L4.5 6.5M7 9L9.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 10.5V11C2 11.55 2.45 12 3 12H11C11.55 12 12 11.55 12 11V10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Download as {selectedFormat.toUpperCase()}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
