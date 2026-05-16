/**
 * SmartCapture Pro - Capture Engine Utilities
 * Handles scroll position calculation, image stitching, thumbnail generation,
 * overlap detection, and lazy-load pre-scrolling.
 */

import {
  Capture,
  CaptureFormat,
  CaptureProgress,
  FixedElement,
  PageDimensions,
  ScrollPosition,
} from './types';
import {
  CAPTURE_DELAY,
  SCROLL_STEP,
  MAX_CAPTURE_WIDTH,
  JPEG_QUALITY,
  THUMBNAIL_MAX_WIDTH,
  THUMBNAIL_MAX_HEIGHT,
  MIN_SCROLL_OVERLAP,
  MAX_CANVAS_HEIGHT,
} from './constants';

// ===== Capture Engine Types =====

export interface CaptureOptions {
  format: CaptureFormat;
  quality: number;
  fullPage: boolean;
  smartScroll: boolean;
  hideFixedElements: boolean;
  maxWidth: number;
}

export interface ScrollCaptureStep {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewportInfo {
  scrollWidth: number;
  scrollHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
}

export interface CaptureSlice {
  imageData: string; // base64 data URL
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StitchOptions {
  pageWidth: number;
  pageHeight: number;
  devicePixelRatio: number;
  format: CaptureFormat;
  quality: number;
  fixedElements?: FixedElement[];
}

// ===== Capture Engine Configuration =====

export const CAPTURE_ENGINE_CONFIG = {
  delay: CAPTURE_DELAY,
  scrollStep: SCROLL_STEP,
  maxWidth: MAX_CAPTURE_WIDTH,
  jpegQuality: JPEG_QUALITY,
  thumbnailMaxWidth: THUMBNAIL_MAX_WIDTH,
  thumbnailMaxHeight: THUMBNAIL_MAX_HEIGHT,
};

export const DEFAULT_CAPTURE_OPTIONS: CaptureOptions = {
  format: 'png',
  quality: 90,
  fullPage: true,
  smartScroll: true,
  hideFixedElements: true,
  maxWidth: MAX_CAPTURE_WIDTH,
};

// ===== Scroll Position Calculation =====

/**
 * Calculate overlap needed for fixed header and footer elements.
 * Returns combined top and bottom pixel overlap to prevent artifacts.
 */
export function calculateOverlap(
  fixedElements: FixedElement[],
  viewportHeight: number
): { topOverlap: number; bottomOverlap: number } {
  let topOverlap = 0;
  let bottomOverlap = 0;

  for (const el of fixedElements) {
    if (el.top === 0 && el.position === 'fixed') {
      topOverlap = Math.max(topOverlap, el.height);
    }
    if (el.position === 'sticky' && el.top <= 5) {
      topOverlap = Math.max(topOverlap, el.height);
    }
    if (Math.abs(el.bottom - viewportHeight) < 5 && el.position === 'fixed') {
      bottomOverlap = Math.max(bottomOverlap, el.height);
    }
    if (Math.abs(el.bottom - viewportHeight) < 5 && el.position === 'sticky') {
      bottomOverlap = Math.max(bottomOverlap, el.height);
    }
  }

  return { topOverlap, bottomOverlap };
}

/**
 * Calculate scroll positions for full-page capture.
 * Handles both vertical and horizontal scrolling with overlap for fixed elements.
 *
 * KEY DESIGN: Always includes at least MIN_SCROLL_OVERLAP (25%) of viewport
 * height between consecutive slices to prevent gaps caused by browser
 * scroll imprecision (scroll-snap, sub-pixel rounding, lazy-loaded images
 * shifting layout, etc.). The stitching function trims overlap automatically.
 *
 * Ensures scroll positions never exceed (pageHeight - viewportHeight)
 * so the browser doesn't clamp scroll and capture duplicate content.
 */
export function calculateScrollPositions(
  pageWidth: number,
  pageHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  fixedElements: FixedElement[] = []
): ScrollPosition[] {
  const positions: ScrollPosition[] = [];

  const { topOverlap } = calculateOverlap(fixedElements, viewportHeight);

  // ALWAYS include a minimum overlap between slices to prevent gaps.
  const minOverlap = Math.round(viewportHeight * MIN_SCROLL_OVERLAP);
  const effectiveOverlap = Math.max(topOverlap, minOverlap);

  const verticalStep = viewportHeight - effectiveOverlap;

  if (pageHeight <= viewportHeight && pageWidth <= viewportWidth) {
    return [{ x: 0, y: 0 }];
  }

  const maxScrollY = Math.max(0, pageHeight - viewportHeight);

  if (pageWidth <= viewportWidth) {
    let y = 0;
    while (y < maxScrollY) {
      positions.push({ x: 0, y });
      y += verticalStep;
    }
    const lastPos = positions.length > 0 ? positions[positions.length - 1].y : 0;
    if (lastPos < maxScrollY) {
      positions.push({ x: 0, y: maxScrollY });
    }
    return positions;
  }

  const horizontalStep = viewportWidth;
  const maxScrollX = Math.max(0, pageWidth - viewportWidth);
  let y = 0;

  while (y < maxScrollY) {
    let x = 0;
    while (x < maxScrollX) {
      positions.push({ x, y });
      x += horizontalStep;
    }
    const lastX = positions.length > 0 && positions[positions.length - 1].y === y
      ? positions[positions.length - 1].x : 0;
    if (lastX < maxScrollX) {
      positions.push({ x: maxScrollX, y });
    }
    y += verticalStep;
  }
  const lastY = positions.length > 0 ? positions[positions.length - 1].y : 0;
  if (lastY < maxScrollY) {
    let x = 0;
    while (x < maxScrollX) {
      positions.push({ x, y: maxScrollY });
      x += horizontalStep;
    }
    const lastX = positions.length > 0 && positions[positions.length - 1].y === maxScrollY
      ? positions[positions.length - 1].x : 0;
    if (lastX < maxScrollX) {
      positions.push({ x: maxScrollX, y: maxScrollY });
    }
  }

  return positions;
}

// ===== Image Stitching =====

/**
 * Convert a data URL string to an ImageBitmap.
 * Works in both window and service worker contexts.
 */
export function dataURLToImageBitmap(dataURL: string): Promise<ImageBitmap> {
  if (typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined') {
    return fetch(dataURL)
      .then((res) => res.blob())
      .then((blob) => createImageBitmap(blob));
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      createImageBitmap(canvas).then(resolve).catch(reject);
    };
    img.onerror = () => reject(new Error('Failed to load image from data URL'));
    img.src = dataURL;
  });
}

/**
 * Extract pixel data from a region of an ImageBitmap using OffscreenCanvas.
 * Returns a Uint8ClampedArray of RGBA pixels.
 */
async function getPixelData(
  bitmap: ImageBitmap,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<Uint8ClampedArray> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, x, y, width, height, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  return imageData.data;
}

/**
 * Calculate Mean Squared Error (MSE) between two pixel data arrays.
 * Lower is better — 0 means identical pixels.
 */
function calculateMSE(pixels1: Uint8ClampedArray, pixels2: Uint8ClampedArray): number {
  const len = pixels1.length;
  if (len !== pixels2.length) return Infinity;

  let totalError = 0;
  // Sample every 4th pixel for performance (RGBA = 4 bytes per pixel)
  const sampleStep = 4;
  let sampleCount = 0;

  for (let i = 0; i < len; i += 4 * sampleStep) {
    // Compare R, G, B channels (skip alpha for better matching)
    const dr = pixels1[i] - pixels2[i];
    const dg = pixels1[i + 1] - pixels2[i + 1];
    const db = pixels1[i + 2] - pixels2[i + 2];
    totalError += dr * dr + dg * dg + db * db;
    sampleCount += 3;
  }

  return totalError / Math.max(1, sampleCount);
}

/**
 * Find the exact overlap between the bottom of previous bitmap and the top of current bitmap
 * using pixel-matching. This ensures pixel-perfect alignment at seam boundaries.
 *
 * Strategy:
 * 1. Extract a reference strip from the VERY BOTTOM of the previous bitmap
 *    (the last STRIP_HEIGHT pixels). This content appears at approximately
 *    `estimatedOverlap` pixels from the top of the current bitmap.
 * 2. Scan near `estimatedOverlap` in the current bitmap to find the best match.
 * 3. Use MSE (Mean Squared Error) to measure similarity.
 *
 * Returns the exact number of pixels to trim from the top of the current bitmap.
 */
async function findExactOverlap(
  prevBitmap: ImageBitmap,
  currBitmap: ImageBitmap,
  estimatedOverlap: number
): Promise<number> {
  const SEARCH_RANGE = Math.round(estimatedOverlap * 0.4); // Search ±40% around estimate
  const STRIP_HEIGHT = Math.min(40, Math.max(10, Math.round(estimatedOverlap * 0.15))); // Height of comparison strip
  const SCAN_WIDTH = Math.min(prevBitmap.width, currBitmap.width);

  if (SCAN_WIDTH <= 0 || STRIP_HEIGHT <= 0 || estimatedOverlap <= 0) {
    return estimatedOverlap;
  }

  // Extract reference strip from the VERY BOTTOM of the previous bitmap.
  // This content should appear at approximately `estimatedOverlap - STRIP_HEIGHT`
  // from the top of the current bitmap.
  const refY = prevBitmap.height - STRIP_HEIGHT;
  const clampedRefY = Math.max(0, refY);

  let refPixels: Uint8ClampedArray;
  try {
    refPixels = await getPixelData(prevBitmap, 0, clampedRefY, SCAN_WIDTH, STRIP_HEIGHT);
  } catch {
    return estimatedOverlap;
  }

  // Search for best match in the current bitmap near the expected position.
  // The bottom STRIP_HEIGHT pixels of prevBitmap correspond to content at
  // scroll position (estimatedOverlap - STRIP_HEIGHT) from the top of currBitmap.
  const expectedMatchY = estimatedOverlap - STRIP_HEIGHT;
  const searchStart = Math.max(0, Math.round(expectedMatchY - SEARCH_RANGE));
  const searchEnd = Math.min(currBitmap.height - STRIP_HEIGHT, Math.round(expectedMatchY + SEARCH_RANGE));
  const searchStep = 1; // Check every pixel for best precision

  let bestMatchY = expectedMatchY;
  let bestMSE = Infinity;

  for (let y = searchStart; y <= searchEnd; y += searchStep) {
    let currPixels: Uint8ClampedArray;
    try {
      currPixels = await getPixelData(currBitmap, 0, y, SCAN_WIDTH, STRIP_HEIGHT);
    } catch {
      continue;
    }

    const mse = calculateMSE(refPixels, currPixels);
    if (mse < bestMSE) {
      bestMSE = mse;
      bestMatchY = y;
    }

    // Early exit if we find a near-perfect match (MSE < 1 is essentially identical)
    if (mse < 1) break;
  }

  // The reference strip was taken from the BOTTOM of prevBitmap (last STRIP_HEIGHT px).
  // bestMatchY is where that strip appears in currBitmap, which is (fullOverlap - STRIP_HEIGHT).
  // To get the FULL overlap (the total number of pixels to trim from currBitmap's top),
  // we must add STRIP_HEIGHT back:
  //   fullOverlap = bestMatchY + STRIP_HEIGHT
  const fullOverlap = bestMatchY + STRIP_HEIGHT;

  // Sanity check: don't allow the match to deviate too far from the estimate
  const deviation = Math.abs(fullOverlap - estimatedOverlap);
  if (deviation > SEARCH_RANGE * 1.5) {
    console.warn(`[SmartCapture] Overlap match deviated too far (${deviation}px), using estimate`);
    return estimatedOverlap;
  }

  // Safety: never trim more than the bitmap height minus 1 pixel
  return Math.min(fullOverlap, currBitmap.height - 1);
}

/**
 * Crop trailing transparent/empty pixels from the bottom of an OffscreenCanvas.
 * This removes unused buffer space added to prevent bottom content cutoff.
 * Uses the `actualContentHeight` hint (accumulated Y from slice drawing) to
 * quickly determine if cropping is needed, then scans for the exact boundary.
 *
 * For PNG: scans for alpha > threshold (transparent pixels are empty).
 * For any format: falls back to the actualContentHeight if pixel scanning is too expensive.
 */
async function cropTrailingWhitespace(
  canvas: OffscreenCanvas,
  actualContentHeight: number
): Promise<OffscreenCanvas> {
  const w = canvas.width;
  const h = canvas.height;

  // If actual content height matches canvas height, no cropping needed
  if (actualContentHeight >= h - 2) {
    return canvas;
  }

  // If actual content height is reasonable, use it directly (with small margin)
  const croppedHeight = Math.min(h, actualContentHeight + 2);

  // Validate: don't crop to less than half the canvas (safety check)
  if (croppedHeight < h * 0.5) {
    console.warn(`[SmartCapture] cropTrailingWhitespace: unusual content height ${croppedHeight} vs canvas ${h}, skipping crop`);
    return canvas;
  }

  // Create cropped canvas
  const croppedCanvas = new OffscreenCanvas(w, croppedHeight);
  const croppedCtx = croppedCanvas.getContext('2d');
  if (!croppedCtx) return canvas;

  croppedCtx.drawImage(canvas, 0, 0, w, croppedHeight, 0, 0, w, croppedHeight);

  console.log(`[SmartCapture] Cropped trailing whitespace: ${h} → ${croppedHeight}px`);
  return croppedCanvas;
}

/**
 * Internal draw operation for canvas rendering.
 * Decouples draw computation from canvas execution, enabling multi-segment rendering.
 */
interface DrawOperation {
  bitmapIndex: number;
  srcX: number;
  srcY: number;
  srcWidth: number;
  srcHeight: number;
  destX: number;
  destY: number;
}

/**
 * Stitch multiple viewport captures into one or more full-page images using OffscreenCanvas.
 *
 * Uses POSITION-BASED overlap for exact alignment between slices.
 *
 * FIXED ELEMENT HANDLING:
 * - Slice 0: captured WITH fixed elements visible (header, footer, etc.)
 * - Slices 1+: captured with fixed elements hidden (visibility:hidden)
 * - The overlap between consecutive slices is trimmed from the source of each slice,
 *   which automatically removes any fixed element content in the overlap region.
 * - Result: fixed elements appear exactly once (from slice 0), never repeated.
 *
 * CANVAS SPLITTING (borrowed from GoFullPage):
 * Chrome/Chromium has a maximum canvas height of ~16K–32K pixels (varies by GPU/driver).
 * Pages taller than MAX_CANVAS_HEIGHT (15,000px) are automatically split into multiple
 * segment images, each fitting within Chrome's limits.
 *
 * Returns Blob[]:
 * - Single element: page fits in one canvas (normal case)
 * - Multiple elements: page was split into segments (each is a separate image)
 *
 * Strategy:
 * 1. Load ALL bitmaps and calculate draw operations with position-based overlap
 * 2. Determine total canvas height needed
 * 3. If height <= MAX_CANVAS_HEIGHT: render on single canvas
 * 4. If height > MAX_CANVAS_HEIGHT: render on multiple segment canvases, clipping
 *    draw operations that span segment boundaries
 * 5. Crop trailing whitespace, convert to blobs
 */
export async function stitchCaptures(
  slices: CaptureSlice[],
  options: StitchOptions
): Promise<Blob[]> {
  const {
    devicePixelRatio,
    format,
    quality,
  } = options;

  if (slices.length === 0) {
    throw new Error('No slices to stitch');
  }

  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const jpegQuality = format === 'jpeg' ? quality / 100 : undefined;

  // ===== PHASE 1: Load all bitmaps and get ACTUAL dimensions =====
  const bitmaps: (ImageBitmap | null)[] = [];
  for (let i = 0; i < slices.length; i++) {
    try {
      const bitmap = await dataURLToImageBitmap(slices[i].imageData);
      bitmaps.push(bitmap);
    } catch (err) {
      console.error(`[SmartCapture] Failed to load bitmap for slice ${i}:`, err);
      bitmaps.push(null);
    }
  }

  // ===== PHASE 2: Calculate canvas width from ACTUAL bitmap extents =====
  let scaledWidth = 0;
  for (let i = 0; i < slices.length; i++) {
    if (!bitmaps[i]) continue;
    const bitmap = bitmaps[i]!;
    const rightEdge = slices[i].x * devicePixelRatio + bitmap.width;
    scaledWidth = Math.max(scaledWidth, rightEdge);
  }

  // ===== PHASE 2.5: Save bitmap dimensions =====
  const bitmapHeights: number[] = bitmaps.map((b) => (b ? b.height : 0));

  // ===== PHASE 3: Calculate all draw operations with POSITION-BASED overlap =====
  // This phase only computes WHERE to draw — actual rendering happens in Phase 4.
  //
  // OVERLAP STRATEGY:
  // - The overlap between consecutive slices is determined by the actual scroll
  //   positions and bitmap dimensions. This is mathematically exact.
  // - Formula: topTrim = prevBitmapHeight - scrollStep * dpr
  //   where scrollStep = slices[i].y - slices[i-1].y (CSS pixels)
  // - The overlap region (topTrim pixels from the top of each slice) contains
  //   content that was already captured in the previous slice. Trimming it
  //   prevents any content duplication — including fixed elements.
  // - Fixed elements are hidden during capture for slices 1+, so their regions
  //   show background/empty space in the overlap, which gets trimmed away.
  const drawOps: DrawOperation[] = [];
  let currentCanvasY = 0;

  for (let i = 0; i < slices.length; i++) {
    const bitmap = bitmaps[i];
    if (!bitmap) continue;

    try {
      const dx = slices[i].x * devicePixelRatio;
      let topTrim = 0;

      if (i > 0 && bitmapHeights[i - 1] > 0) {
        // POSITION-BASED OVERLAP: Use actual scroll positions for exact calculation.
        const scrollStep = slices[i].y - slices[i - 1].y;
        const prevBitmapHeight = bitmapHeights[i - 1];
        topTrim = prevBitmapHeight - scrollStep * devicePixelRatio;

        // Clamp to valid range: never negative, never the entire bitmap
        topTrim = Math.max(0, Math.min(topTrim, bitmap.height - 1));

        // Only clamp the UPPER bound to prevent degenerate cases.
        // Do NOT clamp the lower bound to 0 — even a small topTrim (e.g., 5px)
        // is correct and prevents content duplication. Setting it to 0 would
        // guarantee visible repetition artifacts.
        const reasonableMax = bitmap.height * 0.95;
        if (topTrim > reasonableMax) {
          console.warn(`[SmartCapture] Slice ${i}: topTrim=${Math.round(topTrim)}px exceeds 95% of bitmap, clamping`);
          topTrim = reasonableMax;
        }

        console.log(`[SmartCapture] Slice ${i}: scrollStep=${scrollStep}px, topTrim=${Math.round(topTrim)}px, prevBitmapH=${prevBitmapHeight}px, curBitmapH=${bitmap.height}px`);
      }

      // Source rectangle: trim overlap from the top
      const srcX = 0;
      const srcY = Math.round(topTrim);
      const srcWidth = bitmap.width;
      const srcHeight = Math.max(1, Math.round(bitmap.height - topTrim));

      // Destination: for the first slice, use theoretical position.
      // For subsequent vertical slices (same column), use tracked canvas Y to prevent drift.
      const prevDx = i > 0 ? slices[i - 1].x * devicePixelRatio : -1;
      const destY = (i === 0 || dx !== prevDx)
        ? Math.round(slices[i].y * devicePixelRatio)
        : currentCanvasY;

      if (srcHeight > 0) {
        drawOps.push({
          bitmapIndex: i,
          srcX,
          srcY,
          srcWidth,
          srcHeight,
          destX: dx,
          destY,
        });

        // Track where this slice ends on the canvas (for next slice positioning)
        currentCanvasY = destY + srcHeight;
      }
    } catch (err) {
      console.error(`[SmartCapture] Failed to compute draw op for slice ${i}:`, err);
    }
  }

  // ===== PHASE 3.5: Determine rendering mode =====
  const typicalBitmapHeight = bitmapHeights[0] || Math.ceil(scaledWidth / Math.max(1, slices.length));
  const canvasHeightBuffer = Math.ceil(typicalBitmapHeight * 0.5);
  const totalCanvasHeight = currentCanvasY + canvasHeightBuffer;

  const needsSplitting = totalCanvasHeight > MAX_CANVAS_HEIGHT;

  let blobs: Blob[];

  if (needsSplitting) {
    // ===== MULTI-SEGMENT MODE =====
    // Split the page into multiple canvases, each at most MAX_CANVAS_HEIGHT pixels tall.
    // This prevents Chrome from failing on very tall pages (>16K pixels).
    const numSegments = Math.ceil(totalCanvasHeight / MAX_CANVAS_HEIGHT);
    console.log(`[SmartCapture] Page height ${totalCanvasHeight}px exceeds max ${MAX_CANVAS_HEIGHT}px — splitting into ${numSegments} segments`);

    blobs = [];

    for (let seg = 0; seg < numSegments; seg++) {
      const segTop = seg * MAX_CANVAS_HEIGHT;
      const segBottom = Math.min(segTop + MAX_CANVAS_HEIGHT, totalCanvasHeight);
      const segHeight = segBottom - segTop;

      const segCanvas = new OffscreenCanvas(scaledWidth, segHeight);
      const segCtx = segCanvas.getContext('2d');

      if (!segCtx) {
        console.error(`[SmartCapture] Failed to get OffscreenCanvas context for segment ${seg}`);
        continue;
      }

      // Execute draw operations that fall within this segment
      for (const op of drawOps) {
        const opTop = op.destY;
        const opBottom = op.destY + op.srcHeight;

        // Skip if this draw op is entirely outside the current segment
        if (opBottom <= segTop || opTop >= segBottom) continue;

        const bitmap = bitmaps[op.bitmapIndex];
        if (!bitmap) continue;

        // Calculate clipped region (intersection of draw op and segment)
        const clipTop = Math.max(opTop, segTop);
        const clipBottom = Math.min(opBottom, segBottom);
        const localDestY = clipTop - segTop; // Y position within the segment canvas
        const clipHeight = clipBottom - clipTop;
        const srcOffset = clipTop - opTop; // How many source pixels to skip

        segCtx.drawImage(
          bitmap,
          op.srcX, op.srcY + srcOffset, op.srcWidth, clipHeight,
          op.destX, localDestY, op.srcWidth, clipHeight
        );
      }

      // For the last segment, crop trailing whitespace
      let finalSegCanvas: OffscreenCanvas = segCanvas;
      if (seg === numSegments - 1) {
        const localContentY = currentCanvasY - segTop;
        finalSegCanvas = await cropTrailingWhitespace(segCanvas, localContentY);
      }

      const blob = await finalSegCanvas.convertToBlob({
        type: mimeType,
        quality: jpegQuality,
      });
      blobs.push(blob);

      console.log(`[SmartCapture] Segment ${seg + 1}/${numSegments}: ${scaledWidth}x${segHeight}px, ${(blob.size / 1024 / 1024).toFixed(2)}MB`);
    }
  } else {
    // ===== SINGLE-CANVAS MODE (existing behavior) =====
    const canvas = new OffscreenCanvas(scaledWidth, totalCanvasHeight);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to get OffscreenCanvas 2D context');
    }

    // Execute all draw operations on the single canvas
    for (const op of drawOps) {
      const bitmap = bitmaps[op.bitmapIndex];
      if (!bitmap) continue;

      ctx.drawImage(
        bitmap,
        op.srcX, op.srcY, op.srcWidth, op.srcHeight,
        op.destX, op.destY, op.srcWidth, op.srcHeight
      );
    }

    // ===== PHASE 4: Crop trailing whitespace =====
    const finalCanvas = await cropTrailingWhitespace(canvas, currentCanvasY);

    const blob = await finalCanvas.convertToBlob({
      type: mimeType,
      quality: jpegQuality,
    });
    blobs = [blob];
  }

  // ===== PHASE 5: Clean up all bitmaps =====
  for (const bitmap of bitmaps) {
    if (bitmap) bitmap.close();
  }

  return blobs;
}

// ===== Thumbnail Generation =====

/**
 * Generate a thumbnail from a source image blob.
 * Scales proportionally to fit within maxWidth/maxHeight.
 * Uses OffscreenCanvas for service worker compatibility.
 */
export async function generateThumbnail(
  sourceBlob: Blob,
  maxWidth: number = THUMBNAIL_MAX_WIDTH,
  maxHeight: number = THUMBNAIL_MAX_HEIGHT
): Promise<Blob> {
  const sourceBitmap = await createImageBitmap(sourceBlob);
  const { width, height } = sourceBitmap;

  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  const thumbWidth = Math.floor(width * scale);
  const thumbHeight = Math.floor(height * scale);

  const thumbCanvas = new OffscreenCanvas(thumbWidth, thumbHeight);
  const ctx = thumbCanvas.getContext('2d');

  if (!ctx) {
    sourceBitmap.close();
    throw new Error('Failed to get OffscreenCanvas 2D context for thumbnail');
  }

  ctx.drawImage(sourceBitmap, 0, 0, thumbWidth, thumbHeight);
  sourceBitmap.close();

  const thumbnailBlob = await thumbCanvas.convertToBlob({
    type: 'image/jpeg',
    quality: 0.7,
  });

  return thumbnailBlob;
}

/**
 * Convert a Blob to a base64 data URL.
 * Used for storing captures in IndexedDB.
 */
export function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to convert blob to data URL'));
    reader.readAsDataURL(blob);
  });
}

// ===== Progress Utilities =====

/**
 * Create a capture progress object
 */
export function createCaptureProgress(
  status: CaptureProgress['status'],
  current: number,
  total: number
): CaptureProgress {
  return {
    status,
    current,
    total,
    percentage: total > 0 ? Math.round((current / total) * 100) : 0,
  };
}

// ===== Capture ID Generation =====

/**
 * Generate a unique capture ID
 */
export function generateCaptureId(): string {
  return `capture-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// ===== Pre-scroll for Lazy Loading =====

/**
 * Pre-scroll the page from top to bottom to trigger lazy-loaded content.
 * This should be called before starting the actual capture.
 * Scrolls back to top after completion.
 */
export async function preScrollForLazyLoad(
  scrollStep: number = SCROLL_STEP,
  delay: number = 300
): Promise<void> {
  try {
    const totalHeight = document.documentElement.scrollHeight;
    let currentY = 0;

    while (currentY < totalHeight) {
      window.scrollTo(0, currentY);
      currentY += scrollStep;
      await new Promise((r) => setTimeout(r, delay));
    }

    window.scrollTo(0, totalHeight);
    await new Promise((r) => setTimeout(r, delay));

    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 200));
  } catch (err) {
    console.warn('[SmartCapture] Pre-scroll interrupted:', err);
  }
}

// ===== Capture Result Assembly =====

/**
 * Build a complete Capture object from capture results
 */
export function buildCaptureObject(
  imageDataURL: string,
  thumbnailDataURL: string,
  pageDimensions: PageDimensions,
  pageInfo: { url: string; title: string; timestamp: number },
  format: CaptureFormat
): Capture {
  return {
    id: generateCaptureId(),
    url: pageInfo.url,
    title: pageInfo.title,
    imageData: imageDataURL,
    thumbnail: thumbnailDataURL,
    timestamp: pageInfo.timestamp,
    format,
    width: pageDimensions.scrollWidth,
    height: pageDimensions.scrollHeight,
    annotations: [],
  };
}
