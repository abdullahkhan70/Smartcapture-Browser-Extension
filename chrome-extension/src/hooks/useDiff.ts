/**
 * SmartCapture Pro - Visual Diff Hook
 *
 * Provides pixel-level comparison between two screenshots using pixelmatch.
 * Supports sensitivity control, region detection, and diff image export.
 *
 * Architecture:
 *   useDiff hook → pixelmatch (client-side) → Canvas API for rendering
 */

import { useState, useCallback, useRef } from 'react';
import pixelmatch from 'pixelmatch';

// ===== Types =====

export type ChangeSeverity = 'minor' | 'moderate' | 'major';

export interface DiffRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  pixelCount: number;
  density: number; // 0-1, fraction of pixels changed in the region
  severity: ChangeSeverity;
}

export interface DiffStats {
  diffCount: number;
  totalPixels: number;
  percentage: number;
  regionCount: number;
  width: number;
  height: number;
  dimensionsMatch: boolean;
}

export interface DiffResult {
  /** Canvas with "after" image + colored bounding boxes around change regions */
  overlayCanvas: HTMLCanvasElement;
  /** Canvas with raw diff mask (red pixels on transparent) */
  maskCanvas: HTMLCanvasElement;
  /** Canvas with "before" image */
  beforeCanvas: HTMLCanvasElement;
  /** Canvas with "after" image */
  afterCanvas: HTMLCanvasElement;
  stats: DiffStats;
  regions: DiffRegion[];
}

export type DiffPhase = 'idle' | 'loading' | 'computing' | 'complete' | 'error';

interface UseDiffReturn {
  diffResult: DiffResult | null;
  phase: DiffPhase;
  progress: number;
  error: string | null;
  computeDiff: (imageBefore: string, imageAfter: string, sensitivity?: number) => Promise<DiffResult>;
  exportDiffImage: (format?: 'overlay' | 'mask' | 'side-by-side') => void;
  clearResult: () => void;
}

// ===== Helpers =====

function loadHTMLImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

/** Classify region severity based on pixel density and size */
function classifySeverity(density: number, pixelCount: number): ChangeSeverity {
  // Large regions with high density = major
  if (pixelCount > 5000 && density > 0.3) return 'major';
  // Medium regions = moderate
  if (pixelCount > 1000 || density > 0.15) return 'moderate';
  // Small or sparse = minor
  return 'minor';
}

/** Extract change regions from the diff mask using connected-component flood fill */
function extractDiffRegions(
  maskData: ImageData,
  width: number,
  height: number
): DiffRegion[] {
  const data = maskData.data;
  const visited = new Uint8Array(width * height);
  const regions: DiffRegion[] = [];

  // Sample grid for performance (every 3rd pixel)
  const step = 3;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      const isDiff = data[idx] > 50 || data[idx + 1] > 50 || data[idx + 2] > 50;

      if (!isDiff || visited[y * width + x]) continue;

      // Flood fill to find region bounds
      let minX = x, maxX = x, minY = y, maxY = y;
      const stack: [number, number][] = [[x, y]];
      let pixels = 0;
      const maxPixels = 80000;

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

        stack.push([cx + step, cy]);
        stack.push([cx - step, cy]);
        stack.push([cx, cy + step]);
        stack.push([cx, cy - step]);
      }

      if (pixels > 10) {
        const rw = maxX - minX + step;
        const rh = maxY - minY + step;
        const area = rw * rh;
        const density = Math.min(1, pixels / area);

        const region: DiffRegion = {
          x: minX,
          y: minY,
          width: rw,
          height: rh,
          pixelCount: pixels,
          density,
          severity: classifySeverity(density, pixels),
        };

        // Merge with nearby regions
        let merged = false;
        for (const existing of regions) {
          const gap = 25;
          if (
            region.x < existing.x + existing.width + gap &&
            region.x + region.width + gap > existing.x &&
            region.y < existing.y + existing.height + gap &&
            region.y + region.height + gap > existing.y
          ) {
            const newX = Math.min(region.x, existing.x);
            const newY = Math.min(region.y, existing.y);
            existing.x = newX;
            existing.y = newY;
            existing.width = Math.max(region.x + region.width, existing.x + existing.width) - newX;
            existing.height = Math.max(region.y + region.height, existing.y + existing.height) - newY;
            existing.pixelCount += region.pixelCount;
            existing.density = Math.max(existing.density, region.density);
            existing.severity = classifySeverity(existing.density, existing.pixelCount);
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

  // Sort by severity (major first), then by area
  const severityOrder: Record<ChangeSeverity, number> = { major: 0, moderate: 1, minor: 2 };
  regions.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return (b.width * b.height) - (a.width * a.height);
  });

  return regions.slice(0, 30); // Limit to top 30 regions
}

/** Draw bounding boxes around change regions on the overlay canvas */
function drawRegionBoxes(
  ctx: CanvasRenderingContext2D,
  regions: DiffRegion[],
  scale: number
) {
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
}

// ===== Main Hook =====

export function useDiff(): UseDiffReturn {
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [phase, setPhase] = useState<DiffPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const computeDiff = useCallback(
    async (
      imageBefore: string,
      imageAfter: string,
      sensitivity: number = 50
    ): Promise<DiffResult> => {
      cancelRef.current = false;
      setPhase('loading');
      setProgress(5);
      setError(null);

      try {
        // Load both images
        const [img1, img2] = await Promise.all([
          loadHTMLImage(imageBefore),
          loadHTMLImage(imageAfter),
        ]);

        if (cancelRef.current) throw new Error('Diff computation cancelled');

        setPhase('computing');
        setProgress(20);

        // Use the minimum dimensions for comparison
        const width = Math.min(img1.width, img2.width);
        const height = Math.min(img1.height, img2.height);
        const dimensionsMatch = img1.width === img2.width && img1.height === img2.height;

        // Create before canvas
        const beforeCanvas = document.createElement('canvas');
        beforeCanvas.width = width;
        beforeCanvas.height = height;
        const beforeCtx = beforeCanvas.getContext('2d')!;
        beforeCtx.drawImage(img1, 0, 0, width, height);
        const data1 = beforeCtx.getImageData(0, 0, width, height);

        // Create after canvas
        const afterCanvas = document.createElement('canvas');
        afterCanvas.width = width;
        afterCanvas.height = height;
        const afterCtx = afterCanvas.getContext('2d')!;
        afterCtx.drawImage(img2, 0, 0, width, height);
        const data2 = afterCtx.getImageData(0, 0, width, height);

        if (cancelRef.current) throw new Error('Diff computation cancelled');
        setProgress(40);

        // Create diff mask canvas
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = width;
        maskCanvas.height = height;
        const maskCtx = maskCanvas.getContext('2d')!;
        const outputData = maskCtx.createImageData(width, height);

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
            diffColor: [255, 50, 50],
            diffMask: true,
          }
        );

        if (cancelRef.current) throw new Error('Diff computation cancelled');
        setProgress(70);

        // Put mask data
        maskCtx.putImageData(outputData, 0, 0);

        // Extract change regions
        const regions = extractDiffRegions(outputData, width, height);

        setProgress(85);

        // Create overlay canvas (after image + region bounding boxes)
        const overlayCanvas = document.createElement('canvas');
        overlayCanvas.width = width;
        overlayCanvas.height = height;
        const overlayCtx = overlayCanvas.getContext('2d')!;

        // Draw "after" image as base
        overlayCtx.drawImage(img2, 0, 0, width, height);

        // Semi-transparent overlay to dim unchanged areas
        if (diffCount > 0) {
          overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.15)';
          overlayCtx.fillRect(0, 0, width, height);

          // Draw region bounding boxes
          drawRegionBoxes(overlayCtx, regions, 1);
        }

        setProgress(100);

        const stats: DiffStats = {
          diffCount,
          totalPixels: width * height,
          percentage: (diffCount / (width * height)) * 100,
          regionCount: regions.length,
          width,
          height,
          dimensionsMatch,
        };

        const result: DiffResult = {
          overlayCanvas,
          maskCanvas,
          beforeCanvas,
          afterCanvas,
          stats,
          regions,
        };

        setDiffResult(result);
        setPhase('complete');
        return result;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to compute diff';
        if (!cancelRef.current) {
          setError(message);
          setPhase('error');
        }
        throw err;
      }
    },
    []
  );

  const exportDiffImage = useCallback(
    (format: 'overlay' | 'mask' | 'side-by-side' = 'overlay') => {
      if (!diffResult) return;

      let exportCanvas: HTMLCanvasElement;

      if (format === 'side-by-side') {
        const { beforeCanvas, afterCanvas, overlayCanvas, stats } = diffResult;
        const padding = 20;
        const labelH = 24;
        const totalW = stats.width * 2 + padding * 3;
        const totalH = stats.height + labelH + padding * 2;

        exportCanvas = document.createElement('canvas');
        exportCanvas.width = totalW;
        exportCanvas.height = totalH;
        const ctx = exportCanvas.getContext('2d')!;

        // Background
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(0, 0, totalW, totalH);

        // Before label
        ctx.font = '600 12px -apple-system, sans-serif';
        ctx.fillStyle = '#F59E0B';
        ctx.fillText('BEFORE', padding, padding + 14);

        // After label
        ctx.fillStyle = '#22C55E';
        ctx.fillText('AFTER', stats.width + padding * 2, padding + 14);

        // Before image
        ctx.drawImage(beforeCanvas, padding, padding + labelH);

        // After image with overlay
        ctx.drawImage(overlayCanvas, stats.width + padding * 2, padding + labelH);

        // Stats bar
        ctx.font = '500 10px -apple-system, sans-serif';
        ctx.fillStyle = '#94A3B8';
        const pct = stats.percentage < 0.01 ? '<0.01%' : `${stats.percentage.toFixed(1)}%`;
        ctx.fillText(
          `${pct} changed · ${stats.diffCount.toLocaleString()} pixels · ${stats.regionCount} regions`,
          padding,
          totalH - 6
        );
      } else {
        exportCanvas = format === 'overlay' ? diffResult.overlayCanvas : diffResult.maskCanvas;
      }

      // Download
      exportCanvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `diff-${format}-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 'image/png');
    },
    [diffResult]
  );

  const clearResult = useCallback(() => {
    setDiffResult(null);
    setPhase('idle');
    setProgress(0);
    setError(null);
  }, []);

  return {
    diffResult,
    phase,
    progress,
    error,
    computeDiff,
    exportDiffImage,
    clearResult,
  };
}
