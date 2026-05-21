/**
 * SmartCapture Pro - Visual Diff View
 *
 * Three comparison modes:
 * 1. Side-by-Side — Before & After with diff rectangles drawn on both
 * 2. Overlay — After image with color-coded change region bounding boxes
 * 3. Onion Skin (Slider) — Draggable slider revealing before/after
 *
 * All modes draw diff region rectangles on the images so users can
 * clearly see where the differences are.
 *
 * Fixes applied:
 * - Canvas redraw when switching view modes (viewMode dependency)
 * - Diff rectangles drawn on before & after images in side-by-side & slider modes
 * - Region coordinates replaced with visual rectangle highlighting
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Columns2,
  Layers,
  MoveHorizontal,
  SlidersHorizontal,
  AlertCircle,
  Loader2,
  ZoomIn,
  ZoomOut,
  Download,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAppStore } from '@/store';
import { useDiff, DiffResult, DiffRegion, ChangeSeverity, DiffPhase } from '@/hooks/useDiff';
import { Badge } from './ui/Badge';

// ===== Types =====

type ViewMode = 'side-by-side' | 'overlay' | 'onion-skin';

// ===== Severity Config =====

const SEVERITY_CONFIG: Record<ChangeSeverity, { color: string; bg: string; label: string; icon: string }> = {
  major: { color: '#EF4444', bg: 'rgba(239, 68, 68, 0.1)', label: 'Major', icon: '●' },
  moderate: { color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.1)', label: 'Moderate', icon: '●' },
  minor: { color: '#0EA5E9', bg: 'rgba(14, 165, 233, 0.1)', label: 'Minor', icon: '●' },
};

// ===== Helper: Draw rectangles on a canvas =====

function drawRectanglesOnCanvas(
  sourceCanvas: HTMLCanvasElement,
  regions: DiffRegion[],
  scale: number = 1
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = sourceCanvas.width;
  canvas.height = sourceCanvas.height;
  const ctx = canvas.getContext('2d')!;

  // Draw the source image
  ctx.drawImage(sourceCanvas, 0, 0);

  if (regions.length === 0) return canvas;

  const severityColors: Record<ChangeSeverity, { stroke: string; fill: string; label: string }> = {
    major: { stroke: '#EF4444', fill: 'rgba(239, 68, 68, 0.12)', label: 'Major' },
    moderate: { stroke: '#F59E0B', fill: 'rgba(245, 158, 11, 0.10)', label: 'Moderate' },
    minor: { stroke: '#0EA5E9', fill: 'rgba(14, 165, 233, 0.08)', label: 'Minor' },
  };

  for (const region of regions) {
    const colors = severityColors[region.severity];
    const x = region.x * scale;
    const y = region.y * scale;
    const w = region.width * scale;
    const h = region.height * scale;

    // Fill
    ctx.fillStyle = colors.fill;
    ctx.fillRect(x, y, w, h);

    // Stroke
    ctx.strokeStyle = colors.stroke;
    ctx.lineWidth = Math.max(1, 1.5 * scale);
    ctx.strokeRect(x, y, w, h);

    // Severity label
    if (w > 40 * scale && h > 20 * scale) {
      const fontSize = Math.max(9, Math.min(12, 10 * scale));
      ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      const labelText = colors.label;
      const textWidth = ctx.measureText(labelText).width;
      const labelPadX = 4 * scale;
      const labelPadY = 2 * scale;
      const labelH = fontSize + labelPadY * 2;

      ctx.fillStyle = colors.stroke;
      ctx.fillRect(x, y, textWidth + labelPadX * 2, labelH);

      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(labelText, x + labelPadX, y + labelPadY + fontSize - 1);
    }
  }

  return canvas;
}

// ===== Component =====

export function VisualDiffView() {
  const goBack = useAppStore((s) => s.goBack);
  const diffCaptureBefore = useAppStore((s) => s.diffCaptureBefore);
  const diffCaptureAfter = useAppStore((s) => s.diffCaptureAfter);

  const [viewMode, setViewMode] = useState<ViewMode>('overlay');
  const [sensitivity, setSensitivity] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [showRegionList, setShowRegionList] = useState(true);
  const [highlightedRegion, setHighlightedRegion] = useState<number | null>(null);

  const {
    diffResult,
    phase,
    progress,
    error,
    computeDiff,
    exportDiffImage,
  } = useDiff();

  // Canvas refs for display
  const overlayDisplayRef = useRef<HTMLCanvasElement>(null);
  const beforeDisplayRef = useRef<HTMLCanvasElement>(null);
  const afterDisplayRef = useRef<HTMLCanvasElement>(null);
  const onionBeforeRef = useRef<HTMLCanvasElement>(null);
  const onionAfterRef = useRef<HTMLCanvasElement>(null);
  const onionContainerRef = useRef<HTMLDivElement>(null);

  // Onion skin state
  const [splitPosition, setSplitPosition] = useState(50); // percentage

  // Compute diff when images are available or sensitivity changes
  useEffect(() => {
    if (diffCaptureBefore && diffCaptureAfter) {
      computeDiff(diffCaptureBefore, diffCaptureAfter, sensitivity);
    }
  }, [diffCaptureBefore, diffCaptureAfter, sensitivity, computeDiff]);

  // Draw canvases when diff result is ready OR view mode changes
  // This fixes the bug where switching view modes showed blank canvases
  useEffect(() => {
    if (!diffResult) return;

    const drawToCanvas = (
      canvasRef: React.RefObject<HTMLCanvasElement | null>,
      sourceCanvas: HTMLCanvasElement
    ) => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      canvas.width = sourceCanvas.width;
      canvas.height = sourceCanvas.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(sourceCanvas, 0, 0);
    };

    // Overlay canvas — already has rectangles drawn by useDiff
    drawToCanvas(overlayDisplayRef, diffResult.overlayCanvas);

    // Before canvas — draw with diff rectangles
    const beforeWithRects = drawRectanglesOnCanvas(diffResult.beforeCanvas, diffResult.regions, 1);
    drawToCanvas(beforeDisplayRef, beforeWithRects);

    // After canvas — draw with diff rectangles
    const afterWithRects = drawRectanglesOnCanvas(diffResult.afterCanvas, diffResult.regions, 1);
    drawToCanvas(afterDisplayRef, afterWithRects);

    // Onion skin canvases — also with rectangles for clear visibility
    const onionBeforeWithRects = drawRectanglesOnCanvas(diffResult.beforeCanvas, diffResult.regions, 1);
    drawToCanvas(onionBeforeRef, onionBeforeWithRects);

    const onionAfterWithRects = drawRectanglesOnCanvas(diffResult.afterCanvas, diffResult.regions, 1);
    drawToCanvas(onionAfterRef, onionAfterWithRects);

  }, [diffResult, viewMode]); // viewMode is key: triggers redraw when switching modes

  // Onion skin mouse/touch drag
  const isDragging = useRef(false);

  const handleOnionMouseDown = useCallback(() => {
    isDragging.current = true;
  }, []);

  const handleOnionMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !onionContainerRef.current) return;
    const rect = onionContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSplitPosition(pct);
  }, []);

  const handleOnionTouchMove = useCallback((e: React.TouchEvent) => {
    if (!onionContainerRef.current) return;
    const rect = onionContainerRef.current.getBoundingClientRect();
    const x = e.touches[0].clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSplitPosition(pct);
  }, []);

  const handleOnionMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // Format helpers
  const formatPercentage = (pct: number): string => {
    if (pct < 0.01) return '<0.01%';
    if (pct < 1) return `${pct.toFixed(2)}%`;
    return `${pct.toFixed(1)}%`;
  };

  // Stats from diffResult
  const stats = diffResult?.stats;
  const regions = diffResult?.regions || [];
  const severityCounts = useMemo(() => {
    const counts = { major: 0, moderate: 0, minor: 0 };
    for (const r of regions) counts[r.severity]++;
    return counts;
  }, [regions]);

  // No images selected
  if (!diffCaptureBefore || !diffCaptureAfter) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-surface-elevated flex items-center justify-center mb-3">
          <AlertCircle size={20} className="text-text-muted" />
        </div>
        <p className="text-sm text-text-secondary mb-2">No images selected for comparison</p>
        <button
          onClick={goBack}
          className="text-xs text-primary hover:text-primary-dark transition-colors cursor-pointer"
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ maxHeight: '580px' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
        <div className="flex items-center gap-2">
          <button
            onClick={goBack}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-smooth cursor-pointer"
          >
            <ArrowLeft size={14} />
          </button>
          <span className="text-xs font-semibold text-text-primary">Visual Diff</span>
        </div>

        <div className="flex items-center gap-1.5">
          {stats && phase === 'complete' && (
            <>
              <Badge variant="error">{formatPercentage(stats.percentage)}</Badge>
              <Badge variant="default">{stats.regionCount} regions</Badge>
            </>
          )}
        </div>
      </div>

      {/* Controls Bar — scrollable horizontally on small screens */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 border-b shrink-0 overflow-x-auto scrollbar-thin"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}
      >
        {/* View Mode Toggle */}
        <div className="flex items-center rounded-lg overflow-hidden shrink-0" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
          {([
            { mode: 'side-by-side' as ViewMode, icon: <Columns2 size={11} />, label: 'Side' },
            { mode: 'overlay' as ViewMode, icon: <Layers size={11} />, label: 'Overlay' },
            { mode: 'onion-skin' as ViewMode, icon: <MoveHorizontal size={11} />, label: 'Slider' },
          ]).map(({ mode, icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium transition-smooth cursor-pointer whitespace-nowrap
                ${viewMode === mode
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
                }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {/* Sensitivity */}
        <div className="flex items-center gap-1 min-w-[80px] shrink-0">
          <SlidersHorizontal size={10} className="text-text-muted shrink-0" />
          <input
            type="range"
            min="1"
            max="100"
            value={sensitivity}
            onChange={(e) => setSensitivity(parseInt(e.target.value, 10))}
            className="w-full h-1"
          />
          <span className="text-[9px] text-text-muted font-mono w-5 text-right shrink-0">
            {sensitivity}
          </span>
        </div>

        {/* Zoom */}
        <button
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
          className="flex items-center justify-center w-5 h-5 rounded text-text-muted
            hover:text-text-primary hover:bg-surface-elevated transition-smooth cursor-pointer shrink-0"
        >
          <ZoomOut size={10} />
        </button>
        <span className="text-[9px] text-text-muted font-mono shrink-0 w-7 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
          className="flex items-center justify-center w-5 h-5 rounded text-text-muted
            hover:text-text-primary hover:bg-surface-elevated transition-smooth cursor-pointer shrink-0"
        >
          <ZoomIn size={10} />
        </button>

        {/* Export */}
        {diffResult && phase === 'complete' && (
          <button
            onClick={() => exportDiffImage('overlay')}
            className="flex items-center justify-center w-6 h-6 rounded-md text-text-muted
              hover:text-primary hover:bg-surface-elevated transition-smooth cursor-pointer shrink-0"
            title="Export diff image"
          >
            <Download size={12} />
          </button>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto scrollbar-thin relative" style={{ backgroundColor: '#0F172A' }}>
        {/* Loading / Computing */}
        {(phase === 'loading' || phase === 'computing') && (
          <div className="absolute inset-0 flex items-center justify-center z-10" style={{ backgroundColor: 'rgba(15, 23, 42, 0.85)' }}>
            <div className="flex flex-col items-center gap-2">
              <Loader2 size={24} className="animate-spin text-primary" />
              <span className="text-xs text-text-secondary">
                {phase === 'loading' ? 'Loading images...' : 'Computing differences...'}
              </span>
              {phase === 'computing' && (
                <div className="w-32 h-1.5 rounded-full bg-surface-elevated overflow-hidden">
                  <div
                    className="h-full rounded-full gradient-primary transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
              {phase === 'computing' && (
                <span className="text-[10px] text-text-muted font-mono">{progress}%</span>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {phase === 'error' && error && (
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <AlertCircle size={24} className="text-[#EF4444] mx-auto mb-2" />
              <p className="text-xs text-text-secondary mb-2">{error}</p>
              <button
                onClick={() => diffCaptureBefore && diffCaptureAfter && computeDiff(diffCaptureBefore, diffCaptureAfter, sensitivity)}
                className="text-xs text-primary hover:text-primary-dark cursor-pointer"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Identical */}
        {diffResult && stats && stats.percentage === 0 && phase === 'complete' && (
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <div className="w-10 h-10 rounded-full bg-[#22C55E]/10 flex items-center justify-center mx-auto mb-2">
                <Check size={20} className="text-[#22C55E]" />
              </div>
              <p className="text-xs font-medium text-text-primary">Images are identical</p>
              <p className="text-[10px] text-text-muted mt-1">
                No differences at sensitivity {sensitivity}
              </p>
            </div>
          </div>
        )}

        {/* Side-by-Side Mode — Before & After with diff rectangles */}
        {viewMode === 'side-by-side' && diffResult && stats && phase === 'complete' && stats.percentage > 0 && (
          <div className="flex flex-col p-2 gap-2" style={{ minWidth: '300px' }}>
            {/* Before */}
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#F59E0B' }} />
                <span className="text-[9px] text-text-muted font-medium uppercase tracking-wider">Before</span>
              </div>
              <div
                className="rounded-lg overflow-auto scrollbar-thin"
                style={{
                  border: '1px solid rgba(255,255,255,0.05)',
                  maxHeight: '180px',
                }}
              >
                <canvas
                  ref={beforeDisplayRef}
                  style={{
                    width: `${zoom * 100}%`,
                    height: 'auto',
                    imageRendering: zoom > 1 ? 'pixelated' : 'auto',
                  }}
                />
              </div>
            </div>

            {/* After */}
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#22C55E' }} />
                <span className="text-[9px] text-text-muted font-medium uppercase tracking-wider">After</span>
              </div>
              <div
                className="rounded-lg overflow-auto scrollbar-thin"
                style={{
                  border: '1px solid rgba(255,255,255,0.05)',
                  maxHeight: '180px',
                }}
              >
                <canvas
                  ref={afterDisplayRef}
                  style={{
                    width: `${zoom * 100}%`,
                    height: 'auto',
                    imageRendering: zoom > 1 ? 'pixelated' : 'auto',
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Overlay Mode */}
        {viewMode === 'overlay' && diffResult && stats && phase === 'complete' && stats.percentage > 0 && (
          <div className="p-2">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#EF4444' }} />
              <span className="text-[9px] text-text-muted font-medium uppercase tracking-wider">
                Change Regions
              </span>
              <div className="flex items-center gap-1 ml-auto">
                {severityCounts.major > 0 && (
                  <span className="text-[8px] font-medium px-1 rounded" style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#EF4444' }}>
                    {severityCounts.major} major
                  </span>
                )}
                {severityCounts.moderate > 0 && (
                  <span className="text-[8px] font-medium px-1 rounded" style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>
                    {severityCounts.moderate} mod
                  </span>
                )}
                {severityCounts.minor > 0 && (
                  <span className="text-[8px] font-medium px-1 rounded" style={{ backgroundColor: 'rgba(14,165,233,0.15)', color: '#0EA5E9' }}>
                    {severityCounts.minor} minor
                  </span>
                )}
              </div>
            </div>
            <div
              className="rounded-lg overflow-auto scrollbar-thin"
              style={{
                border: '1px solid rgba(255,255,255,0.05)',
                maxHeight: '320px',
              }}
            >
              <canvas
                ref={overlayDisplayRef}
                style={{
                  width: `${zoom * 100}%`,
                  height: 'auto',
                  imageRendering: zoom > 1 ? 'pixelated' : 'auto',
                }}
              />
            </div>

            {/* Region List */}
            {regions.length > 0 && (
              <div className="mt-2">
                <button
                  onClick={() => setShowRegionList(!showRegionList)}
                  className="flex items-center gap-1 text-[9px] text-text-muted font-medium uppercase tracking-wider cursor-pointer hover:text-text-secondary transition-colors w-full"
                >
                  <span>Regions ({regions.length})</span>
                  {showRegionList ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                </button>

                {showRegionList && (
                  <div className="mt-1 space-y-0.5 max-h-28 overflow-y-auto scrollbar-thin">
                    {regions.slice(0, 15).map((region, i) => {
                      const config = SEVERITY_CONFIG[region.severity];
                      const isHighlighted = highlightedRegion === i;
                      return (
                        <button
                          key={i}
                          onClick={() => setHighlightedRegion(isHighlighted ? null : i)}
                          className={`w-full flex items-center justify-between px-2 py-1 rounded transition-smooth cursor-pointer
                            ${isHighlighted ? 'ring-1 ring-primary/40' : ''}`}
                          style={{
                            backgroundColor: isHighlighted ? 'rgba(14,165,233,0.1)' : 'rgba(30, 41, 59, 0.5)',
                          }}
                        >
                          <div className="flex items-center gap-1.5">
                            <span
                              className="text-[8px] font-bold"
                              style={{ color: config.color }}
                            >
                              {config.icon}
                            </span>
                            <span className="text-[9px] text-text-secondary font-mono">
                              ({region.x}, {region.y})
                            </span>
                            <span
                              className="text-[8px] font-medium px-1 rounded"
                              style={{ backgroundColor: config.bg, color: config.color }}
                            >
                              {config.label}
                            </span>
                          </div>
                          <span className="text-[9px] text-text-muted font-mono">
                            {region.width}×{region.height}
                          </span>
                        </button>
                      );
                    })}
                    {regions.length > 15 && (
                      <span className="text-[9px] text-text-muted text-center block">
                        +{regions.length - 15} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Onion Skin Mode — Before/After with diff rectangles */}
        {viewMode === 'onion-skin' && diffResult && stats && phase === 'complete' && stats.percentage > 0 && (
          <div className="p-2">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#F59E0B' }} />
                <span className="text-[9px] text-text-muted">Before</span>
              </div>
              <span className="text-[9px] text-text-muted font-mono">{Math.round(splitPosition)}%</span>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-text-muted">After</span>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#22C55E' }} />
              </div>
            </div>

            <div
              ref={onionContainerRef}
              className="relative rounded-lg overflow-hidden cursor-col-resize select-none"
              style={{
                border: '1px solid rgba(255,255,255,0.05)',
                maxHeight: '350px',
              }}
              onMouseDown={handleOnionMouseDown}
              onMouseMove={handleOnionMouseMove}
              onMouseUp={handleOnionMouseUp}
              onMouseLeave={handleOnionMouseUp}
              onTouchMove={handleOnionTouchMove}
              onTouchEnd={handleOnionMouseUp}
            >
              {/* After image (full width, bottom layer) — with diff rectangles */}
              <canvas
                ref={onionAfterRef}
                className="w-full"
                style={{
                  height: 'auto',
                  display: 'block',
                }}
              />

              {/* Before image (clipped to split position) — with diff rectangles */}
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${splitPosition}%` }}
              >
                <canvas
                  ref={onionBeforeRef}
                  style={{
                    width: onionContainerRef.current ? `${onionContainerRef.current.offsetWidth}px` : '100%',
                    height: 'auto',
                    display: 'block',
                  }}
                />
              </div>

              {/* Split line */}
              <div
                className="absolute top-0 bottom-0 w-0.5 z-10"
                style={{
                  left: `${splitPosition}%`,
                  backgroundColor: '#fff',
                  boxShadow: '0 0 8px rgba(255,255,255,0.5)',
                }}
              >
                {/* Handle circle */}
                <div
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{
                    backgroundColor: '#fff',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                  }}
                >
                  <MoveHorizontal size={10} className="text-slate-900" />
                </div>
              </div>
            </div>

            <p className="text-[9px] text-text-muted text-center mt-1.5">
              Drag the slider to compare before & after
            </p>
          </div>
        )}
      </div>

      {/* Bottom Stats Bar */}
      {diffResult && stats && phase === 'complete' && (
        <div
          className="flex items-center gap-3 px-3 py-1.5 border-t shrink-0"
          style={{ borderColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(30, 41, 59, 0.3)' }}
        >
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-text-muted">Changed:</span>
            <span className="text-[10px] font-semibold" style={{ color: stats.percentage > 5 ? '#EF4444' : stats.percentage > 1 ? '#F59E0B' : '#22C55E' }}>
              {formatPercentage(stats.percentage)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-text-muted">Pixels:</span>
            <span className="text-[10px] text-text-secondary font-mono">
              {stats.diffCount.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-text-muted">Size:</span>
            <span className="text-[10px] text-text-secondary font-mono">
              {stats.width}×{stats.height}
            </span>
          </div>
          {!stats.dimensionsMatch && (
            <span className="text-[9px] text-[#F59E0B] font-medium">⚠ Size mismatch</span>
          )}
        </div>
      )}
    </div>
  );
}
