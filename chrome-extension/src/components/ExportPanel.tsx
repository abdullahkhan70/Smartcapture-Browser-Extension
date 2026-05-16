import React, { useState, useMemo, useCallback } from 'react';
import {
  Download,
  Image,
  Copy,
  Check,
  ArrowLeft,
  Droplets,
  Stamp,
} from 'lucide-react';
import { Capture, CaptureFormat } from '@/lib/types';
import { useAppStore } from '@/store';
import { Badge } from './ui/Badge';
import {
  exportCapture,
  copyToClipboard,
  estimateFileSize,
  ExportOptions,
} from '@/lib/export';

interface ExportPanelProps {
  capture: Capture;
}

export function ExportPanel({ capture }: ExportPanelProps) {
  const goBack = useAppStore((s) => s.goBack);
  const [exportFormat, setExportFormat] = useState<CaptureFormat>(capture.format);
  const [quality, setQuality] = useState(85);
  const [watermark, setWatermark] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  // File info calculations
  const estimatedSize = useMemo(() => {
    if (!capture.imageData) return '--';
    return estimateFileSize(capture.imageData, exportFormat, quality);
  }, [capture.imageData, exportFormat, quality]);

  const aspectRatio = useMemo(() => {
    if (!capture.width || !capture.height) return 'square';
    const ratio = capture.width / capture.height;
    if (ratio > 1.2) return 'landscape';
    if (ratio < 0.8) return 'portrait';
    return 'square';
  }, [capture.width, capture.height]);

  const formatFileSize = (size: string): string => {
    return size;
  };

  const handleExport = useCallback(async () => {
    if (!capture.imageData) return;

    setIsExporting(true);
    setExportError(null);

    try {
      const options: ExportOptions = {
        format: exportFormat,
        quality: quality / 100,
        watermark,
        metadata: {
          url: capture.url,
          title: capture.title,
          date: new Date(capture.timestamp).toLocaleString(),
        },
      };

      await exportCapture(capture.imageData, options);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Export failed';
      setExportError(message);
    } finally {
      setIsExporting(false);
    }
  }, [capture.imageData, capture.url, capture.title, capture.timestamp, exportFormat, quality, watermark]);

  const handleCopyToClipboard = useCallback(async () => {
    if (!capture.imageData) return;

    const success = await copyToClipboard(capture.imageData);
    if (success) {
      setCopiedToClipboard(true);
      setTimeout(() => setCopiedToClipboard(false), 2000);
    }
  }, [capture.imageData]);

  const formats: { id: CaptureFormat; label: string; desc: string; icon: React.ReactNode }[] = [
    {
      id: 'png',
      label: 'PNG',
      desc: 'Lossless quality',
      icon: <Image size={16} />,
    },
    {
      id: 'jpeg',
      label: 'JPEG',
      desc: 'Smaller file size',
      icon: <Image size={16} />,
    },
  ];

  return (
    <div className="p-4 space-y-4">
      {/* Back Button */}
      <button
        onClick={goBack}
        className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
      >
        <ArrowLeft size={14} />
        Back
      </button>

      {/* Preview Thumbnail */}
      {capture.thumbnail && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            border: '1px solid rgba(255,255,255,0.05)',
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            maxHeight: '120px',
          }}
        >
          <div className="overflow-hidden flex items-center justify-center" style={{ maxHeight: '120px' }}>
            <img
              src={capture.thumbnail}
              alt={capture.title}
              className="w-full h-auto object-contain"
            />
          </div>
        </div>
      )}

      {/* Format Selection (Radio Buttons) */}
      <section>
        <h4 className="text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-2">
          Format
        </h4>
        <div className="space-y-1.5">
          {formats.map((format) => (
            <label
              key={format.id}
              className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-smooth
                ${
                  exportFormat === format.id
                    ? 'bg-primary/10 border border-primary/30'
                    : 'bg-surface-card/50 border border-transparent hover:bg-surface-card hover:border-surface-elevated/50'
                }`}
              style={
                exportFormat !== format.id
                  ? { borderColor: 'rgba(255,255,255,0.05)' }
                  : {}
              }
            >
              {/* Radio */}
              <div
                className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                style={{
                  border:
                    exportFormat === format.id
                      ? 'none'
                      : '2px solid rgba(148, 163, 184, 0.4)',
                  backgroundColor:
                    exportFormat === format.id ? '#0EA5E9' : 'transparent',
                }}
              >
                {exportFormat === format.id && (
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                )}
              </div>

              {/* Label */}
              <div className="flex-1">
                <span className="text-xs font-semibold text-text-primary">
                  {format.label}
                </span>
                <span className="text-[10px] text-text-muted ml-1.5">
                  {format.desc}
                </span>
              </div>

              {/* Icon */}
              <div className="text-text-muted">{format.icon}</div>

              {/* Hidden radio input */}
              <input
                type="radio"
                name="format"
                value={format.id}
                checked={exportFormat === format.id}
                onChange={() => setExportFormat(format.id)}
                className="sr-only"
              />
            </label>
          ))}
        </div>
      </section>

      {/* Quality Slider (JPEG only) */}
      {exportFormat === 'jpeg' && (
        <section>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-text-primary font-medium flex items-center gap-1.5">
              <Droplets size={13} className="text-text-muted" />
              Quality
            </span>
            <Badge variant="primary">{quality}%</Badge>
          </div>
          <input
            type="range"
            min="10"
            max="100"
            step="5"
            value={quality}
            onChange={(e) => setQuality(parseInt(e.target.value, 10))}
            className="w-full"
          />
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-text-muted">Smaller file</span>
            <span className="text-[10px] text-text-muted">Better quality</span>
          </div>
        </section>
      )}

      {/* Watermark Toggle */}
      <section>
        <label
          className="flex items-center justify-between p-3 rounded-xl cursor-pointer transition-smooth
            bg-surface-card/50 hover:bg-surface-card"
          style={{ border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <div className="flex items-center gap-2.5">
            <Stamp size={15} className="text-text-muted" />
            <div>
              <span className="text-xs font-medium text-text-primary block">
                Watermark
              </span>
              <span className="text-[10px] text-text-muted">
                Add &quot;SmartCapture Pro&quot; watermark
              </span>
            </div>
          </div>
          <div
            className="relative w-9 h-5 rounded-full transition-colors cursor-pointer shrink-0"
            style={{
              backgroundColor: watermark ? '#0EA5E9' : 'rgba(51, 65, 85, 0.8)',
            }}
            onClick={() => setWatermark(!watermark)}
          >
            <div
              className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform"
              style={{
                left: watermark ? '18px' : '2px',
                transition: 'left 0.2s ease',
              }}
            />
          </div>
        </label>
      </section>

      {/* File Info */}
      <section
        className="rounded-xl p-3"
        style={{
          backgroundColor: 'rgba(30, 41, 59, 0.5)',
          border: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <h4 className="text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-2">
          File Info
        </h4>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">Dimensions</span>
            <span className="text-xs text-text-primary font-mono">
              {capture.width} × {capture.height}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">Aspect Ratio</span>
            <Badge variant="default">{aspectRatio}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">Output Format</span>
            <Badge variant="primary">{exportFormat.toUpperCase()}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">Est. Size</span>
            <span className="text-xs text-text-primary font-mono">
              {formatFileSize(estimatedSize)}
            </span>
          </div>

        </div>
      </section>

      {/* Export Error */}
      {exportError && (
        <div
          className="rounded-xl p-3"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
          }}
        >
          <p className="text-xs text-[#EF4444]">{exportError}</p>
          <button
            onClick={() => setExportError(null)}
            className="text-[10px] text-text-muted hover:text-text-secondary mt-1 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Export Actions */}
      <div className="space-y-2">
        {/* Primary Export Button */}
        <button
          onClick={handleExport}
          disabled={isExporting}
          className="flex items-center justify-center gap-2 w-full h-10 rounded-lg text-sm font-semibold text-white
            bg-primary hover:bg-primary-dark active:bg-primary-dark transition-smooth cursor-pointer
            disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
        >
          {isExporting ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <Download size={16} />
              Export {exportFormat.toUpperCase()}
            </>
          )}
        </button>

        {/* Copy to Clipboard */}
        <button
          onClick={handleCopyToClipboard}
          className="flex items-center justify-center gap-2 w-full h-10 rounded-lg text-sm font-medium
            text-text-primary transition-smooth cursor-pointer"
          style={{
            backgroundColor: '#334155',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          {copiedToClipboard ? (
            <>
              <Check size={16} className="text-[#22C55E]" />
              <span className="text-[#22C55E]">Copied to clipboard!</span>
            </>
          ) : (
            <>
              <Copy size={16} className="text-text-secondary" />
              <span className="text-text-secondary">Copy to Clipboard</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
