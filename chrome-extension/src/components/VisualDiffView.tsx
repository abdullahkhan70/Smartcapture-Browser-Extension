import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  Columns2,
  Layers,
  SlidersHorizontal,
  AlertCircle,
  Loader2,
  ZoomIn,
} from 'lucide-react';
import { useAppStore } from '@/store';
import { Badge } from './ui/Badge';
import pixelmatch from 'pixelmatch';

// ===== Types =====

interface DiffRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'addition' | 'removal' | 'modification';
}

interface DiffResult {
  diffCanvas: HTMLCanvasElement;
  diffCount: number;
  totalPixels: number;
  percentage: number;
  regions: DiffRegion[];
  width: number;
  height: number;
}

interface VisualDiffViewProps {
  imageBefore: string;
  imageAfter: string;
}

type ViewMode = 'side-by-side' | 'overlay';

// ===== Helper Functions =====

function loadHTMLImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

function computeDiff(
  img1: HTMLImageElement,
  img2: HTMLImageElement,
  sensitivity: number
): DiffResult {
  // Use the minimum dimensions to ensure pixelmatch compatibility
  const width = Math.min(img1.width, img2.width);
  const height = Math.min(img1.height, img2.height);

  // Create canvases for both images
  const canvas1 = document.createElement('canvas');
  canvas1.width = width;
  canvas1.height = height;
  const ctx1 = canvas1.getContext('2d')!;
  ctx1.drawImage(img1, 0, 0, width, height);
  const data1 = ctx1.getImageData(0, 0, width, height);

  const canvas2 = document.createElement('canvas');
  canvas2.width = width;
  canvas2.height = height;
  const ctx2 = canvas2.getContext('2d')!;
  ctx2.drawImage(img2, 0, 0, width, height);
  const data2 = ctx2.getImageData(0, 0, width, height);

  // Create diff output canvas
  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = width;
  diffCanvas.height = height;
  const diffCtx = diffCanvas.getContext('2d')!;

  // Draw the "after" image as base for the diff view
  diffCtx.drawImage(img2, 0, 0, width, height);
  const outputData = diffCtx.getImageData(0, 0, width, height);

  // Convert sensitivity (1-100) to pixelmatch threshold (0-1)
  // Higher sensitivity = lower threshold = more differences detected
  const threshold = Math.max(0, Math.min(1, (100 - sensitivity) / 200));

  const diffCount = pixelmatch(
    data1.data,
    data2.data,
    outputData.data,
    width,
    height,
    {
      threshold,
      alpha: 0.1,
      diffColor: [255, 50, 50], // Red highlights for differences
      diffMask: true, // Output only the diff pixels
    }
  );

  // Extract diff regions using connected component analysis (simplified)
  const regions = extractDiffRegions(outputData, width, height);

  // Put the diff data on the diff canvas
  diffCtx.putImageData(outputData, 0, 0);

  return {
    diffCanvas,
    diffCount,
    totalPixels: width * height,
    percentage: (diffCount / (width * height)) * 100,
    regions,
    width,
    height,
  };
}

function extractDiffRegions(
  imageData: ImageData,
  width: number,
  height: number
): DiffRegion[] {
  const data = imageData.data;
  const visited = new Uint8Array(width * height);
  const regions: DiffRegion[] = [];

  // Sample grid for faster region detection (every 4th pixel)
  const step = 4;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      const isDiff = data[idx] > 50 || data[idx + 1] > 50 || data[idx + 2] > 50;

      if (!isDiff || visited[y * width + x]) continue;

      // Simple flood fill to find region bounds
      let minX = x, maxX = x, minY = y, maxY = y;
      const stack: [number, number][] = [[x, y]];
      let pixels = 0;
      const maxPixels = 50000; // Limit to prevent performance issues

      while (stack.length > 0 && pixels < maxPixels) {
        const [cx, cy] = stack.pop()!;
        const ci = cy * width + cx;

        if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;
        if (visited[ci]) continue;

        const cIdx = ci * 4;
        const cIsDiff =
          data[cIdx] > 50 || data[cIdx + 1] > 50 || data[cIdx + 2] > 50;

        if (!cIsDiff) continue;

        visited[ci] = 1;
        pixels++;

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        // Add neighbors (with step)
        stack.push([cx + step, cy]);
        stack.push([cx - step, cy]);
        stack.push([cx, cy + step]);
        stack.push([cx, cy - step]);
      }

      if (pixels > 10) {
        // Merge with nearby regions
        const rw = maxX - minX + step;
        const rh = maxY - minY + step;
        const region: DiffRegion = {
          x: minX,
          y: minY,
          width: rw,
          height: rh,
          type: 'modification',
        };

        // Try to merge with existing regions
        let merged = false;
        for (const existing of regions) {
          if (
            region.x < existing.x + existing.width + 20 &&
            region.x + region.width + 20 > existing.x &&
            region.y < existing.y + existing.height + 20 &&
            region.y + region.height + 20 > existing.y
          ) {
            // Merge
            const newX = Math.min(region.x, existing.x);
            const newY = Math.min(region.y, existing.y);
            existing.x = newX;
            existing.y = newY;
            existing.width =
              Math.max(region.x + region.width, existing.x + existing.width) - newX;
            existing.height =
              Math.max(region.y + region.height, existing.y + existing.height) - newY;
            merged = true;
            break;
          }
        }

        if (!merged) {
          regions.push(region);
        }
      }
    }
  }

  return regions.slice(0, 50); // Limit regions
}

// ===== Component =====

export function VisualDiffView({ imageBefore, imageAfter }: VisualDiffViewProps) {
  const goBack = useAppStore((s) => s.goBack);
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [sensitivity, setSensitivity] = useState(50);
  const [isComputing, setIsComputing] = useState(false);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const diffCanvasRef = useRef<HTMLCanvasElement>(null);
  const beforeCanvasRef = useRef<HTMLCanvasElement>(null);
  const afterCanvasRef = useRef<HTMLCanvasElement>(null);

  // Compute diff when images or sensitivity change
  const computeAndSetDiff = useCallback(async () => {
    setIsComputing(true);
    setError(null);

    try {
      const [img1, img2] = await Promise.all([
        loadHTMLImage(imageBefore),
        loadHTMLImage(imageAfter),
      ]);

      const result = computeDiff(img1, img2, sensitivity);
      setDiffResult(result);

      // Draw diff result onto the visible canvas
      if (diffCanvasRef.current) {
        const ctx = diffCanvasRef.current.getContext('2d')!;
        diffCanvasRef.current.width = result.width;
        diffCanvasRef.current.height = result.height;
        ctx.drawImage(result.diffCanvas, 0, 0);
      }

      // Draw before image
      if (beforeCanvasRef.current) {
        const ctx = beforeCanvasRef.current.getContext('2d')!;
        beforeCanvasRef.current.width = result.width;
        beforeCanvasRef.current.height = result.height;
        ctx.drawImage(img1, 0, 0, result.width, result.height);
      }

      // Draw after image
      if (afterCanvasRef.current) {
        const ctx = afterCanvasRef.current.getContext('2d')!;
        afterCanvasRef.current.width = result.width;
        afterCanvasRef.current.height = result.height;
        ctx.drawImage(img2, 0, 0, result.width, result.height);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to compute diff';
      setError(message);
    } finally {
      setIsComputing(false);
    }
  }, [imageBefore, imageAfter, sensitivity]);

  useEffect(() => {
    computeAndSetDiff();
  }, [computeAndSetDiff]);

  const formatPercentage = (pct: number): string => {
    if (pct < 0.01) return '<0.01%';
    if (pct < 1) return `${pct.toFixed(2)}%`;
    return `${pct.toFixed(1)}%`;
  };

  return (
    <div className="flex flex-col h-full" style={{ maxHeight: '540px' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
        <div className="flex items-center gap-2">
          <button
            onClick={goBack}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-smooth cursor-pointer"
          >
            <ArrowLeft size={14} />
          </button>
          <span className="text-xs font-semibold text-text-primary">
            Visual Diff
          </span>
        </div>

        {diffResult && !isComputing && (
          <div className="flex items-center gap-2">
            <Badge variant="error">
              {formatPercentage(diffResult.percentage)} changed
            </Badge>
            <Badge variant="default">
              {diffResult.diffCount.toLocaleString()} pixels
            </Badge>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
        {/* View Mode Toggle */}
        <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
          <button
            onClick={() => setViewMode('side-by-side')}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium transition-smooth cursor-pointer
              ${viewMode === 'side-by-side'
                ? 'bg-primary text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
              }`}
          >
            <Columns2 size={12} />
            Side
          </button>
          <button
            onClick={() => setViewMode('overlay')}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium transition-smooth cursor-pointer
              ${viewMode === 'overlay'
                ? 'bg-primary text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
              }`}
          >
            <Layers size={12} />
            Diff
          </button>
        </div>

        {/* Sensitivity Slider */}
        <div className="flex items-center gap-1.5 flex-1 ml-2">
          <SlidersHorizontal size={11} className="text-text-muted shrink-0" />
          <input
            type="range"
            min="1"
            max="100"
            value={sensitivity}
            onChange={(e) => setSensitivity(parseInt(e.target.value, 10))}
            className="w-full"
          />
          <span className="text-[10px] text-text-muted font-mono w-5 text-right shrink-0">
            {sensitivity}
          </span>
        </div>

        {/* Zoom */}
        <button
          onClick={() => setZoom((z) => Math.min(z + 0.25, 2))}
          className="flex items-center justify-center w-6 h-6 rounded-md text-text-muted
            hover:text-text-primary hover:bg-surface-elevated transition-smooth cursor-pointer shrink-0"
        >
          <ZoomIn size={12} />
        </button>
        <span className="text-[10px] text-text-muted font-mono shrink-0">
          {Math.round(zoom * 100)}%
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto scrollbar-thin relative" style={{ backgroundColor: '#0F172A' }}>
        {/* Loading State */}
        {isComputing && (
          <div className="absolute inset-0 flex items-center justify-center z-10" style={{ backgroundColor: 'rgba(15, 23, 42, 0.8)' }}>
            <div className="flex flex-col items-center gap-2">
              <Loader2 size={24} className="animate-spin text-primary" />
              <span className="text-xs text-text-secondary">Computing differences...</span>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !isComputing && (
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <AlertCircle size={24} className="text-[#EF4444] mx-auto mb-2" />
              <p className="text-xs text-text-secondary mb-2">{error}</p>
              <button
                onClick={computeAndSetDiff}
                className="text-xs text-primary hover:text-primary-dark cursor-pointer"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Side by Side Mode */}
        {viewMode === 'side-by-side' && !isComputing && !error && (
          <div className="flex flex-col" style={{ minWidth: '300px' }}>
            {/* Before */}
            <div className="p-2">
              <div className="flex items-center gap-1 mb-1">
                <div className="w-2 h-2 rounded-full bg-[#F59E0B]" />
                <span className="text-[9px] text-text-muted font-medium uppercase tracking-wider">Before</span>
              </div>
              <div
                className="rounded-lg overflow-auto scrollbar-thin"
                style={{
                  border: '1px solid rgba(255,255,255,0.05)',
                  maxHeight: '200px',
                }}
              >
                <canvas
                  ref={beforeCanvasRef}
                  style={{
                    width: '100%',
                    height: 'auto',
                    imageRendering: zoom > 1 ? 'pixelated' : 'auto',
                  }}
                />
              </div>
            </div>

            {/* After */}
            <div className="p-2">
              <div className="flex items-center gap-1 mb-1">
                <div className="w-2 h-2 rounded-full bg-[#22C55E]" />
                <span className="text-[9px] text-text-muted font-medium uppercase tracking-wider">After</span>
              </div>
              <div
                className="rounded-lg overflow-auto scrollbar-thin"
                style={{
                  border: '1px solid rgba(255,255,255,0.05)',
                  maxHeight: '200px',
                }}
              >
                <canvas
                  ref={afterCanvasRef}
                  style={{
                    width: '100%',
                    height: 'auto',
                    imageRendering: zoom > 1 ? 'pixelated' : 'auto',
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Overlay Diff Mode */}
        {viewMode === 'overlay' && !isComputing && !error && (
          <div className="p-2">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-[#EF4444]" />
              <span className="text-[9px] text-text-muted font-medium uppercase tracking-wider">
                Difference Map
              </span>
              <span className="text-[9px] text-text-muted ml-auto">
                Red = changed pixels
              </span>
            </div>
            <div
              className="rounded-lg overflow-auto scrollbar-thin"
              style={{
                border: '1px solid rgba(255,255,255,0.05)',
                maxHeight: '400px',
              }}
            >
              <canvas
                ref={diffCanvasRef}
                style={{
                  width: '100%',
                  height: 'auto',
                  imageRendering: zoom > 1 ? 'pixelated' : 'auto',
                }}
              />
            </div>

            {/* Region List */}
            {diffResult && diffResult.regions.length > 0 && (
              <div className="mt-3">
                <span className="text-[9px] text-text-muted font-medium uppercase tracking-wider">
                  Change Regions ({diffResult.regions.length})
                </span>
                <div className="mt-1 space-y-1 max-h-24 overflow-y-auto scrollbar-thin">
                  {diffResult.regions.slice(0, 10).map((region, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-2 py-1 rounded"
                      style={{ backgroundColor: 'rgba(30, 41, 59, 0.5)' }}
                    >
                      <span className="text-[9px] text-text-secondary font-mono">
                        ({region.x}, {region.y})
                      </span>
                      <span className="text-[9px] text-text-muted font-mono">
                        {region.width}×{region.height}
                      </span>
                    </div>
                  ))}
                  {diffResult.regions.length > 10 && (
                    <span className="text-[9px] text-text-muted text-center block">
                      +{diffResult.regions.length - 10} more regions
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* No diff (images identical) */}
        {diffResult && diffResult.percentage === 0 && !isComputing && !error && (
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <div className="w-10 h-10 rounded-full bg-[#22C55E]/10 flex items-center justify-center mx-auto mb-2">
                <Check size={20} className="text-[#22C55E]" />
              </div>
              <p className="text-xs font-medium text-text-primary">Images are identical</p>
              <p className="text-[10px] text-text-muted mt-1">
                No differences detected at current sensitivity ({sensitivity})
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Inline Check icon (avoid extra import)
function Check({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
