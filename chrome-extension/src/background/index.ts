/**
 * SmartCapture Pro - Background Service Worker
 * Orchestrates full-page and visible-area screenshot capture.
 * Handles message routing, keyboard shortcuts, and storage integration.
 *
 * Capture flow:
 * 1. Receive capture request
 * 2. Scroll to top for consistent starting point
 * 3. Hide fixed/sticky elements (changes layout)
 * 4. Get page dimensions AFTER hiding (accurate scrollHeight)
 * 5. Calculate scroll positions (no overlap needed since fixed elements are hidden)
 * 6. For each scroll position:
 *    a. Send CAPTURE_PROGRESS to popup
 *    b. Scroll to position via content script
 *    c. Wait for layout stabilization
 *    d. Capture viewport via chrome.tabs.captureVisibleTab
 *    e. Check for cancellation
 * 7. Show fixed elements
 * 8. Stitch all viewport captures using OffscreenCanvas
 * 9. Generate thumbnail
 * 10. Save to storage
 * 11. Send CAPTURE_COMPLETE to popup
 */

import {
  MessageType,
  ChromeMessage,
  Capture,
  CaptureFormat,
  CaptureProgress,
  PageDimensions,
  PageInfo,
  SelectionRegion,
} from '../lib/types';
import {
  calculateScrollPositions,
  stitchCaptures,
  generateThumbnail,
  blobToDataURL,
  createCaptureProgress,
  generateCaptureId,
  buildCaptureObject,
  CaptureSlice,
  StitchOptions,
} from '../lib/capture';
import { CAPTURE_DELAY, SCROLL_SETTLE_DELAY } from '../lib/constants';

// ===== Logging =====

function log(message: string, data?: unknown): void {
  console.log(`[SmartCapture BG] ${message}`, data ?? '');
}

function logError(message: string, error?: unknown): void {
  console.error(`[SmartCapture BG] ${message}`, error);
}

// ===== State =====

let activeTabId: number | null = null;
let isCapturing = false;
let captureCancelled = false;

// Simple in-memory storage for captures (service worker has no persistent IndexedDB in MV3)
// We'll store captures in chrome.storage.local as a lightweight approach
const capturesCache: Capture[] = [];

// ===== Helpers =====

async function getCurrentTab(): Promise<chrome.tabs.Tab | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      activeTabId = tab.id;
    }
    return tab ?? null;
  } catch {
    return null;
  }
}

function sendTabMessage(tabId: number, message: ChromeMessage, timeoutMs = 30000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Message ${message.type} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}

/**
 * Send a message to the popup (if open)
 */
function sendToPopup(message: ChromeMessage): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup may not be open, ignore errors
  });
}

/**
 * Wait for a specified delay
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ===== Offscreen Document Management =====

/**
 * Create the offscreen document for Tesseract.js OCR engine.
 * The offscreen document persists independently of the popup,
 * allowing the WASM engine to stay initialized across popup sessions.
 */
async function ensureOffscreenDocument(): Promise<void> {
  try {
    // Check if offscreen document already exists
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });

    if (existingContexts.length > 0) {
      log('Offscreen document already exists');
      return;
    }

    log('Creating offscreen document for OCR engine...');
    await chrome.offscreen.createDocument({
      url: 'src/offscreen/offscreen.html',
      reasons: ['WORKERS'],
      justification: 'Tesseract.js OCR engine requires Web Workers and WASM, which only work in a document context (not in service workers or popups).',
    });
    log('Offscreen document created successfully');
  } catch (err) {
    // Document might already exist (race condition), that's fine
    logError('Offscreen document creation (may already exist):', err);
  }
}

// ===== Crop Image =====

/**
 * Crop a captured image (data URL) to the specified region using OffscreenCanvas.
 * Accounts for device pixel ratio.
 */
async function cropImage(dataUrl: string, region: SelectionRegion, dpr: number): Promise<string> {
  const img = await createImageBitmap(await fetch(dataUrl).then((r) => r.blob()));
  const canvas = new OffscreenCanvas(
    Math.round(region.width * dpr),
    Math.round(region.height * dpr)
  );
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2D context');
  ctx.drawImage(
    img,
    Math.round(region.x * dpr),
    Math.round(region.y * dpr),
    Math.round(region.width * dpr),
    Math.round(region.height * dpr),
    0,
    0,
    Math.round(region.width * dpr),
    Math.round(region.height * dpr)
  );
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ===== Capture Viewport =====

/**
 * Capture the current visible tab area using chrome.tabs.captureVisibleTab.
 * Returns a data URL of the captured image.
 */
async function captureViewport(
  format: CaptureFormat = 'png'
): Promise<string> {
  // Check for cancellation
  if (captureCancelled) {
    throw new Error('Capture cancelled');
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(
      undefined as unknown as number, // Use current window
      { format: format === 'jpeg' ? 'jpeg' : 'png' },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!dataUrl) {
          reject(new Error('Failed to capture viewport - empty result'));
        } else {
          resolve(dataUrl);
        }
      }
    );
  });
}

// ===== Full Page Capture =====

/**
 * Orchestrate a full-page capture across multiple scroll positions.
 */
async function startFullPageCapture(
  format: CaptureFormat,
  quality: number,
  smartScroll: boolean
): Promise<void> {
  if (isCapturing) {
    log('Capture already in progress, ignoring request');
    return;
  }

  isCapturing = true;
  captureCancelled = false;
  log('Starting full page capture', { format, quality, smartScroll });

  try {
    const tab = await getCurrentTab();
    if (!tab?.id) {
      throw new Error('No active tab found');
    }

    const tabId = tab.id;

    // Send initial progress
    sendToPopup({
      type: MessageType.CAPTURE_PROGRESS,
      payload: createCaptureProgress('capturing', 0, 1),
    });

    // Step 1: Show capture overlay on the content page
    log('Step 1: Showing capture overlay on content page...');
    try {
      await sendTabMessage(tabId, { type: MessageType.SHOW_CAPTURE_OVERLAY });
    } catch {
      log('Content script not available for overlay, continuing without it');
    }

    // Step 2: Pre-scroll the page to trigger lazy-loaded content
    log('Step 2: Pre-scrolling for lazy content...');
    sendToPopup({
      type: MessageType.CAPTURE_PROGRESS,
      payload: createCaptureProgress('capturing', 0, 1),
    });
    try {
      await sendTabMessage(tabId, { type: MessageType.UPDATE_CAPTURE_OVERLAY, payload: { progress: 5, step: 'Pre-scrolling page...' } });
    } catch { /* overlay may not be available */ }
    // Pre-scroll with explicit timeout — infinite scroll pages (Twitter, LinkedIn)
    // can trap us in an endless loading loop
    try {
      await Promise.race([
        sendTabMessage(tabId, { type: MessageType.PRE_SCROLL_PAGE }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Pre-scroll timed out (10s)')), 10000)),
      ]);
    } catch (e) {
      log('Pre-scroll timed out or failed, continuing capture', e instanceof Error ? e.message : e);
    }
    await delay(300);

    // Step 3: Scroll to top for a consistent starting point
    log('Step 3: Scrolling to top...');
    try {
      await sendTabMessage(tabId, { type: MessageType.UPDATE_CAPTURE_OVERLAY, payload: { progress: 10, step: 'Scrolling to top...' } });
    } catch { /* overlay may not be available */ }
    await sendTabMessage(tabId, {
      type: MessageType.SCROLL_TO_POSITION,
      payload: { x: 0, y: 0 },
    });
    await delay(200);

    // Step 4: Disable scroll-snap only (fixed elements remain visible)
    log('Step 4: Disabling scroll-snap...');
    try {
      await sendTabMessage(tabId, { type: MessageType.UPDATE_CAPTURE_OVERLAY, payload: { progress: 15, step: 'Preparing page...' } });
    } catch { /* overlay may not be available */ }
    await sendTabMessage(tabId, { type: MessageType.DISABLE_SCROLL_SNAP });
    await delay(200);

    // Step 5: Get page dimensions WITH fixed elements still visible
    // This ensures dimensions.fixedElements has real data for overlap calculation
    log('Step 5: Getting page dimensions (with fixed elements)...');
    try {
      await sendTabMessage(tabId, { type: MessageType.UPDATE_CAPTURE_OVERLAY, payload: { progress: 20, step: 'Measuring page...' } });
    } catch { /* overlay may not be available */ }
    // Use shorter timeout for page dimensions — detectFixedElements() on heavy
    // pages (Twitter, Facebook) with huge DOMs can be slow
    let dimensions: PageDimensions;
    try {
      dimensions = await sendTabMessage(tabId, {
        type: MessageType.GET_PAGE_DIMENSIONS,
      }, 15000) as PageDimensions;
    } catch (dimError) {
      logError('Page dimensions measurement failed/timed out, retrying with fallback...', dimError);
      // Retry once with a longer timeout
      dimensions = await sendTabMessage(tabId, {
        type: MessageType.GET_PAGE_DIMENSIONS,
      }, 20000) as PageDimensions;
    }

    if (!dimensions) {
      throw new Error('Failed to get page dimensions. Make sure you are on a valid web page.');
    }

    log('Page dimensions (fixed elements visible)', dimensions);

    // Step 5b: Calculate scroll positions WITH fixed element overlap.
    // Since fixed elements are visible, they appear in every viewport capture.
    // The overlap ensures the pixel-matching stitcher can correctly align slices
    // and trim the duplicate fixed header/footer from inner slices.
    const positions = calculateScrollPositions(
      dimensions.scrollWidth,
      dimensions.scrollHeight,
      dimensions.viewportWidth,
      dimensions.viewportHeight,
      dimensions.fixedElements // Real data — fixed elements are still visible
    );

    log(`Step 5: Calculated ${positions.length} scroll positions`);

    // Step 6: Get page info
    const pageInfo = await sendTabMessage(tabId, {
      type: MessageType.GET_PAGE_INFO,
    }) as PageInfo;
    try {
      await sendTabMessage(tabId, { type: MessageType.UPDATE_CAPTURE_OVERLAY, payload: { progress: 25, step: `Capturing ${positions.length} sections...` } });
    } catch { /* overlay may not be available */ }

    if (!pageInfo) {
      throw new Error('Failed to get page info');
    }

    // Step 7: Capture each viewport position
    log('Step 6: Capturing viewports...');
    const slices: CaptureSlice[] = [];

    for (let i = 0; i < positions.length; i++) {
      // Check for cancellation before each capture
      if (captureCancelled) {
        log('Capture cancelled during viewport capture');
        throw new Error('Capture cancelled by user');
      }

      const pos = positions[i];

      // Send progress to popup AND content page overlay
      sendToPopup({
        type: MessageType.CAPTURE_PROGRESS,
        payload: createCaptureProgress('capturing', i + 1, positions.length),
      });
      // Update content page overlay
      const overlayProgress = 25 + Math.round(((i + 1) / positions.length) * 65);
      try {
        await sendTabMessage(tabId, {
          type: MessageType.UPDATE_CAPTURE_OVERLAY,
          payload: { progress: overlayProgress, step: `Capturing section ${i + 1} of ${positions.length}...` },
        });
      } catch { /* overlay may not be available */ }

      // Scroll to position and get the ACTUAL scroll position back
      // (browser may not land exactly on target due to scroll-snap, sub-pixel rounding, etc.)
      const scrollResult = await sendTabMessage(tabId, {
        type: MessageType.SCROLL_TO_POSITION,
        payload: { x: pos.x, y: pos.y },
      }) as { success: boolean; scrollX: number; scrollY: number };

      // Wait additional time for rendering to fully settle after scroll
      // (image loading is now handled in content script's scrollToPosition)
      await delay(SCROLL_SETTLE_DELAY);

      // HIDE the content page overlay BEFORE captureVisibleTab so it's not in the screenshot
      try {
        await sendTabMessage(tabId, { type: MessageType.HIDE_CAPTURE_OVERLAY });
      } catch { /* overlay may not be available */ }
      // Brief wait for overlay fade-out animation
      await delay(50);

      // For slices 1+: hide fixed/sticky elements so they don't repeat in stitching.
      // Slice 0 keeps fixed elements visible (they appear once in the final image).
      // We use visibility:hidden (not display:none) to avoid layout shifts.
      if (i > 0) {
        try {
          await sendTabMessage(tabId, { type: MessageType.HIDE_FIXED_ELEMENTS });
        } catch { /* content script may not be accessible */ }
        await delay(100); // Wait for visibility change to render + style recalculation + paint
      }

      // Capture current viewport (overlay is hidden, fixed elements hidden for i>0)
      const imageData = await captureViewport(format);

      // For slices 1+: restore fixed/sticky elements immediately after capture
      if (i > 0) {
        try {
          await sendTabMessage(tabId, { type: MessageType.SHOW_FIXED_ELEMENTS });
        } catch { /* content script may not be accessible */ }
      }

      // RE-SHOW the content page overlay after capture
      try {
        await sendTabMessage(tabId, { type: MessageType.SHOW_CAPTURE_OVERLAY });
        // Immediately update overlay with current progress
        const overlayProg = 25 + Math.round(((i + 1) / positions.length) * 65);
        await sendTabMessage(tabId, {
          type: MessageType.UPDATE_CAPTURE_OVERLAY,
          payload: { progress: overlayProg, step: `Captured section ${i + 1} of ${positions.length}` },
        });
      } catch { /* overlay may not be available */ }

      // Use the ACTUAL scroll position (not the requested one) for pixel-accurate stitching
      const actualX = scrollResult?.scrollX ?? pos.x;
      const actualY = scrollResult?.scrollY ?? pos.y;

      slices.push({
        imageData,
        x: actualX,
        y: actualY,
        width: dimensions.viewportWidth,
        height: dimensions.viewportHeight,
      });

      log(`Captured viewport ${i + 1}/${positions.length} at requested(${pos.x}, ${pos.y}) actual(${actualX}, ${actualY})`);
    }

    // Step 7.5: RE-MEASURE page dimensions to check if page grew during capture.
    // Lazy-loaded content, infinite scroll, or dynamic elements may have expanded
    // the page. If the page is now taller than what we captured, we need additional slices.
    //
    // IMPORTANT: Limit growth detection rounds to prevent infinite scroll pages
    // (LinkedIn, Twitter, Facebook) from trapping us in endless capture loops:
    // page grows → capture more → scroll triggers more loading → page grows more → ...
    log('Step 5.5: Checking for page growth...');
    const MAX_GROWTH_ROUNDS = 2; // Only check for growth 2 times max
    const MAX_GROWTH_PERCENTAGE = 0.5; // Only re-capture if page grew by more than 50%

    for (let growthRound = 0; growthRound < MAX_GROWTH_ROUNDS; growthRound++) {
      const newDimensions = await sendTabMessage(tabId, {
        type: MessageType.GET_PAGE_DIMENSIONS,
      }) as PageDimensions;

      if (!newDimensions || newDimensions.scrollHeight <= dimensions.scrollHeight) {
        break; // No more growth, we're done
      }

      const originalHeight = dimensions.scrollHeight;
      const newHeight = newDimensions.scrollHeight;
      const growth = newHeight - originalHeight;
      const growthPercentage = growth / originalHeight;

      // Skip if growth is too small (< 50% increase) — likely just minor layout shifts
      if (growthPercentage < MAX_GROWTH_PERCENTAGE) {
        log(`Page growth too small (${Math.round(growthPercentage * 100)}%), skipping additional capture`);
        break;
      }

      log(`Page grew during capture (round ${growthRound + 1}/${MAX_GROWTH_ROUNDS}): ${originalHeight} → ${newHeight} (+${growth}px, +${Math.round(growthPercentage * 100)}%). Capturing additional slices...`);

      // Recalculate positions for the new bottom portion
      const additionalPositions = calculateScrollPositions(
        newDimensions.scrollWidth,
        newHeight,
        dimensions.viewportWidth,
        dimensions.viewportHeight,
        [] // Fixed elements are still hidden
      );

      // Only capture positions that are beyond what we already have
      const maxCoveredY = Math.max(...slices.map(s => s.y));
      const newPositions = additionalPositions.filter(p => p.y > maxCoveredY - dimensions.viewportHeight * 0.2);

      for (let i = 0; i < newPositions.length; i++) {
        if (captureCancelled) throw new Error('Capture cancelled by user');

        const pos = newPositions[i];
        const totalProgress = positions.length + i + 1;
        const totalExpected = positions.length + newPositions.length;

        sendToPopup({
          type: MessageType.CAPTURE_PROGRESS,
          payload: createCaptureProgress('capturing', totalProgress, totalExpected),
        });

        // Update content page overlay with progress for additional captures
        const growthOverlayProgress = 90 + Math.round(((i + 1) / newPositions.length) * 2);
        try {
          await sendTabMessage(tabId, {
            type: MessageType.UPDATE_CAPTURE_OVERLAY,
            payload: { progress: Math.min(growthOverlayProgress, 92), step: `Capturing additional section ${i + 1} of ${newPositions.length}...` },
          });
        } catch { /* overlay may not be available */ }

        const scrollResult = await sendTabMessage(tabId, {
          type: MessageType.SCROLL_TO_POSITION,
          payload: { x: pos.x, y: pos.y },
        }) as { success: boolean; scrollX: number; scrollY: number };

        await delay(SCROLL_SETTLE_DELAY);

        // HIDE overlay before capture to prevent it from appearing in screenshot
        try {
          await sendTabMessage(tabId, { type: MessageType.HIDE_CAPTURE_OVERLAY });
        } catch { /* overlay may not be available */ }
        await delay(50);

        // Hide fixed elements for additional slices (all additional slices are > 0)
        try {
          await sendTabMessage(tabId, { type: MessageType.HIDE_FIXED_ELEMENTS });
        } catch { /* content script may not be accessible */ }
        await delay(100); // Wait for visibility change to render

        const imageData = await captureViewport(format);

        // Restore fixed elements immediately after capture
        try {
          await sendTabMessage(tabId, { type: MessageType.SHOW_FIXED_ELEMENTS });
        } catch { /* content script may not be accessible */ }

        // RE-SHOW overlay after capture
        try {
          await sendTabMessage(tabId, { type: MessageType.SHOW_CAPTURE_OVERLAY });
          await sendTabMessage(tabId, {
            type: MessageType.UPDATE_CAPTURE_OVERLAY,
            payload: { progress: Math.min(growthOverlayProgress, 92), step: `Captured additional section ${i + 1} of ${newPositions.length}` },
          });
        } catch { /* overlay may not be available */ }

        const actualX = scrollResult?.scrollX ?? pos.x;
        const actualY = scrollResult?.scrollY ?? pos.y;

        slices.push({
          imageData,
          x: actualX,
          y: actualY,
          width: dimensions.viewportWidth,
          height: dimensions.viewportHeight,
        });

        log(`Captured additional viewport ${i + 1}/${newPositions.length} at y=${actualY}`);
      }

      // Update dimensions to new measurements for next growth check
      dimensions.scrollHeight = newHeight;
    }

    // Step 8: Restore scroll-snap and hide overlay
    // Fixed elements were never hidden, so no need to show them
    log('Step 7: Restoring scroll-snap...');
    try {
      await sendTabMessage(tabId, { type: MessageType.UPDATE_CAPTURE_OVERLAY, payload: { progress: 92, step: 'Restoring page...' } });
    } catch { /* overlay may not be available */ }
    await sendTabMessage(tabId, { type: MessageType.RESTORE_SCROLL_SNAP });
    // Hide content page overlay now that capture is done
    try {
      await sendTabMessage(tabId, { type: MessageType.HIDE_CAPTURE_OVERLAY });
    } catch { /* overlay may not be available */ }

    // Send stitching progress to popup
    sendToPopup({
      type: MessageType.CAPTURE_PROGRESS,
      payload: createCaptureProgress('stitching', 0, 1),
    });

    // Step 9: Stitch all captures into a single image
    log('Step 8: Stitching captures...');

    // stitchCaptures now calculates canvas size from actual bitmap dimensions internally.
    // We pass the best known dimensions as reference, but actual bitmap sizes take precedence.
    const stitchOptions: StitchOptions = {
      pageWidth: dimensions.scrollWidth,
      pageHeight: dimensions.scrollHeight,
      devicePixelRatio: dimensions.devicePixelRatio,
      format,
      quality,
      fixedElements: dimensions.fixedElements,
    };

    const stitchedBlobs = await stitchCaptures(slices, stitchOptions);
    const isMultiPage = stitchedBlobs.length > 1;

    if (isMultiPage) {
      log(`Stitched image split into ${stitchedBlobs.length} segments (total ${(stitchedBlobs.reduce((s, b) => s + b.size, 0) / 1024 / 1024).toFixed(2)}MB)`);
    } else {
      log(`Stitched image size: ${stitchedBlobs[0].size} bytes`);
    }

    // Step 10: Generate thumbnail (from first blob — shows the top of the page)
    sendToPopup({
      type: MessageType.CAPTURE_PROGRESS,
      payload: createCaptureProgress('processing', 0, 1),
    });

    const thumbnailBlob = await generateThumbnail(stitchedBlobs[0]);

    // Convert blobs to data URLs for storage
    const imageDataURL = await blobToDataURL(stitchedBlobs[0]);
    const thumbnailDataURL = await blobToDataURL(thumbnailBlob);

    // Convert additional page blobs to data URLs (for multi-page captures)
    const additionalPageURLs: string[] = [];
    for (let i = 1; i < stitchedBlobs.length; i++) {
      additionalPageURLs.push(await blobToDataURL(stitchedBlobs[i]));
    }

    // Step 11: Build capture object
    const capture = buildCaptureObject(
      imageDataURL,
      thumbnailDataURL,
      dimensions,
      pageInfo,
      format
    );

    // Add multi-page metadata if applicable
    if (isMultiPage) {
      capture.pages = additionalPageURLs;
      capture.pageCount = stitchedBlobs.length;
      log(`Capture is multi-page: ${stitchedBlobs.length} segments`);
    }

    // Step 12: Save to local cache and chrome storage
    log('Step 9: Saving capture...');
    capturesCache.unshift(capture);

    // Persist to chrome.storage.local (has size limits but works in service worker)
    try {
      // Store captures as array of metadata (without large imageData) + separate data
      const captureMeta = {
        id: capture.id,
        url: capture.url,
        title: capture.title,
        thumbnail: capture.thumbnail,
        timestamp: capture.timestamp,
        format: capture.format,
        width: capture.width,
        height: capture.height,
        annotations: capture.annotations,
        ocrText: capture.ocrText,
        pageCount: capture.pageCount,
      };
      await chrome.storage.local.set({
        [`capture-meta-${capture.id}`]: captureMeta,
        [`capture-data-${capture.id}`]: capture.imageData,
        'capture-ids': capturesCache.map((c) => c.id),
      });

      // Store additional page data separately (if multi-page capture)
      if (isMultiPage) {
        const pageEntries: Record<string, string> = {};
        for (let i = 0; i < additionalPageURLs.length; i++) {
          pageEntries[`capture-page-${capture.id}-${i}`] = additionalPageURLs[i];
        }
        pageEntries[`capture-page-count-${capture.id}`] = String(stitchedBlobs.length);
        await chrome.storage.local.set(pageEntries);
      }
    } catch (storageErr) {
      logError('Failed to persist capture to storage', storageErr);
      // Still continue - capture is in memory
    }

    log('Capture complete!', { id: capture.id, width: capture.width, height: capture.height });

    sendToPopup({
      type: MessageType.CAPTURE_COMPLETE,
      payload: { capture },
    });

    sendToPopup({
      type: MessageType.CAPTURE_PROGRESS,
      payload: createCaptureProgress('complete', 1, 1),
    });
  } catch (error) {
    logError('Capture failed', error);

    // Cleanup: restore page state and hide overlay
    if (activeTabId) {
      try {
        await sendTabMessage(activeTabId, { type: MessageType.HIDE_CAPTURE_OVERLAY });
      } catch {
        // Content script may not be accessible
      }
      try {
        await sendTabMessage(activeTabId, { type: MessageType.RESTORE_SCROLL_SNAP });
      } catch {
        // Content script may not be accessible
      }
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown capture error';

    sendToPopup({
      type: MessageType.CAPTURE_ERROR,
      payload: {
        error: errorMessage,
        code: captureCancelled ? 'CANCELLED' : 'CAPTURE_FAILED',
      },
    });

    sendToPopup({
      type: MessageType.CAPTURE_PROGRESS,
      payload: createCaptureProgress('error', 0, 0),
    });
  } finally {
    isCapturing = false;
    captureCancelled = false;
  }
}

// ===== Visible Area Capture =====

/**
 * Capture only the current visible viewport area.
 */
async function startVisibleCapture(
  format: CaptureFormat,
  quality: number
): Promise<void> {
  if (isCapturing) {
    log('Capture already in progress, ignoring request');
    return;
  }

  isCapturing = true;
  captureCancelled = false;
  log('Starting visible area capture', { format, quality });

  try {
    const tab = await getCurrentTab();
    if (!tab?.id) {
      throw new Error('No active tab found');
    }

    const tabId = tab.id;

    // Send initial progress to popup
    sendToPopup({
      type: MessageType.CAPTURE_PROGRESS,
      payload: createCaptureProgress('capturing', 0, 1),
    });

    // Disable scroll-snap (fixed elements remain visible)
    await sendTabMessage(tabId, { type: MessageType.DISABLE_SCROLL_SNAP });
    await delay(100);

    // Get page info and dimensions (fixed elements are visible)
    const [pageInfo, dimensions] = await Promise.all([
      sendTabMessage(tabId, { type: MessageType.GET_PAGE_INFO }) as Promise<PageInfo>,
      sendTabMessage(tabId, { type: MessageType.GET_PAGE_DIMENSIONS }) as Promise<PageDimensions>,
    ]);

    if (!pageInfo || !dimensions) {
      throw new Error('Failed to get page info or dimensions');
    }

    // Report progress to popup
    sendToPopup({
      type: MessageType.CAPTURE_PROGRESS,
      payload: createCaptureProgress('capturing', 1, 1),
    });

    // HIDE overlay before capture to prevent it from appearing in screenshot
    try {
      await sendTabMessage(tabId, { type: MessageType.HIDE_CAPTURE_OVERLAY });
    } catch { /* overlay may not be available */ }
    await delay(50);

    // Capture current viewport (overlay is now hidden)
    const imageData = await captureViewport(format);

    // RE-SHOW overlay after capture
    try {
      await sendTabMessage(tabId, { type: MessageType.SHOW_CAPTURE_OVERLAY });
    } catch { /* overlay may not be available */ }

    // Restore scroll-snap
    await sendTabMessage(tabId, { type: MessageType.RESTORE_SCROLL_SNAP });

    // Hide overlay now that visible capture is done
    try {
      await sendTabMessage(tabId, { type: MessageType.HIDE_CAPTURE_OVERLAY });
    } catch { /* overlay may not be available */ }

    // Report processing progress
    sendToPopup({
      type: MessageType.CAPTURE_PROGRESS,
      payload: createCaptureProgress('processing', 0, 1),
    });

    // Generate thumbnail
    const imageBlob = await fetch(imageData).then((r) => r.blob());
    const thumbnailBlob = await generateThumbnail(imageBlob);

    // Convert to data URLs
    const thumbnailDataURL = await blobToDataURL(thumbnailBlob);

    // Build capture object - use viewport dimensions
    const capture: Capture = {
      id: generateCaptureId(),
      url: pageInfo.url,
      title: pageInfo.title,
      imageData,
      thumbnail: thumbnailDataURL,
      timestamp: pageInfo.timestamp,
      format,
      width: dimensions.viewportWidth,
      height: dimensions.viewportHeight,
      annotations: [],
    };

    // Save capture
    capturesCache.unshift(capture);

    try {
      const captureMeta = {
        id: capture.id,
        url: capture.url,
        title: capture.title,
        thumbnail: capture.thumbnail,
        timestamp: capture.timestamp,
        format: capture.format,
        width: capture.width,
        height: capture.height,
        annotations: capture.annotations,
        ocrText: capture.ocrText,
      };
      await chrome.storage.local.set({
        [`capture-meta-${capture.id}`]: captureMeta,
        [`capture-data-${capture.id}`]: capture.imageData,
        'capture-ids': capturesCache.map((c) => c.id),
      });
    } catch (storageErr) {
      logError('Failed to persist capture to storage', storageErr);
    }

    log('Visible area capture complete!', { id: capture.id });

    sendToPopup({
      type: MessageType.CAPTURE_COMPLETE,
      payload: { capture },
    });

    sendToPopup({
      type: MessageType.CAPTURE_PROGRESS,
      payload: createCaptureProgress('complete', 1, 1),
    });
  } catch (error) {
    logError('Visible capture failed', error);

    // Cleanup: restore page state and hide overlay
    if (activeTabId) {
      try {
        await sendTabMessage(activeTabId, { type: MessageType.HIDE_CAPTURE_OVERLAY });
      } catch {
        // Content script may not be accessible
      }
      try {
        await sendTabMessage(activeTabId, { type: MessageType.RESTORE_SCROLL_SNAP });
      } catch {
        // Content script may not be accessible
      }
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown capture error';

    sendToPopup({
      type: MessageType.CAPTURE_ERROR,
      payload: {
        error: errorMessage,
        code: captureCancelled ? 'CANCELLED' : 'CAPTURE_FAILED',
      },
    });
  } finally {
    isCapturing = false;
    captureCancelled = false;
  }
}

// ===== Storage Integration for Background =====

/**
 * Get all captures from cache/storage
 */
async function getAllCaptures(): Promise<Capture[]> {
  try {
    const result = await chrome.storage.local.get('capture-ids');
    const ids: string[] = result['capture-ids'] || [];

    if (ids.length === 0) return [];

    // Load all metadata
    const keys = ids.map((id) => `capture-meta-${id}`);
    const metaResult = await chrome.storage.local.get(keys);

    const captures: Capture[] = [];
    for (const id of ids) {
      const meta = metaResult[`capture-meta-${id}`];
      if (meta) {
        // For listing, we return captures without imageData to save memory
        // imageData will be loaded on demand when viewing
        captures.push({
          ...meta,
          imageData: '', // Placeholder - load on demand
        });
      }
    }

    return captures.sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return capturesCache;
  }
}

/**
 * Load full capture data (including imageData) by ID.
 * For multi-page captures, also loads additional page data.
 */
async function getFullCapture(id: string): Promise<Capture | null> {
  // Check cache first
  const cached = capturesCache.find((c) => c.id === id);
  if (cached?.imageData) return cached;

  try {
    const result = await chrome.storage.local.get([
      `capture-meta-${id}`,
      `capture-data-${id}`,
      `capture-page-count-${id}`,
    ]);
    const meta = result[`capture-meta-${id}`];
    const data = result[`capture-data-${id}`];

    if (meta && data) {
      const capture: Capture = { ...meta, imageData: data };

      // Load additional pages if multi-page capture
      if (meta.pageCount && meta.pageCount > 1) {
        const pageCount = meta.pageCount;
        const pageKeys = [];
        for (let i = 0; i < pageCount - 1; i++) {
          pageKeys.push(`capture-page-${id}-${i}`);
        }
        const pageResult = await chrome.storage.local.get(pageKeys);
        const pages: string[] = [];
        for (let i = 0; i < pageCount - 1; i++) {
          const pageData = pageResult[`capture-page-${id}-${i}`];
          if (pageData) pages.push(pageData);
        }
        if (pages.length > 0) {
          capture.pages = pages;
          capture.pageCount = pageCount;
        }
      }

      return capture;
    }
  } catch {
    // Fall through
  }

  return null;
}

/**
 * Delete a capture by ID (including multi-page data)
 */
async function deleteCaptureById(id: string): Promise<void> {
  // Remove from cache
  const idx = capturesCache.findIndex((c) => c.id === id);
  if (idx >= 0) capturesCache.splice(idx, 1);

  // Remove from chrome.storage.local
  try {
    // First check if this is a multi-page capture
    const countResult = await chrome.storage.local.get(`capture-page-count-${id}`);
    const pageCount = countResult[`capture-page-count-${id}`]
      ? parseInt(countResult[`capture-page-count-${id}`], 10)
      : 0;

    const keysToRemove = [
      `capture-meta-${id}`,
      `capture-data-${id}`,
      `capture-page-count-${id}`,
    ];

    // Also remove all page data keys
    if (pageCount > 1) {
      for (let i = 0; i < pageCount - 1; i++) {
        keysToRemove.push(`capture-page-${id}-${i}`);
      }
    }

    await chrome.storage.local.remove(keysToRemove);

    // Update capture-ids list
    const result = await chrome.storage.local.get('capture-ids');
    const ids: string[] = (result['capture-ids'] || []).filter((cid: string) => cid !== id);
    await chrome.storage.local.set({ 'capture-ids': ids });
  } catch {
    // Ignore storage errors
  }
}

// ===== Message Listener =====

chrome.runtime.onMessage.addListener(
  async (message: ChromeMessage, _sender, sendResponse) => {
    log('Message received', message.type);

    switch (message.type) {
      case MessageType.CAPTURE_START: {
        const { format, quality, fullPage, smartScroll } = message.payload;
        if (fullPage) {
          startFullPageCapture(format, quality, smartScroll);
        } else {
          startVisibleCapture(format, quality);
        }
        sendResponse({ started: true });
        return true;
      }

      case MessageType.CAPTURE_VISIBLE: {
        const { format } = message.payload;
        startVisibleCapture(format, 90);
        sendResponse({ started: true });
        return true;
      }

      case MessageType.CANCEL_CAPTURE: {
        captureCancelled = true;
        isCapturing = false;
        log('Capture cancellation requested');
        sendResponse({ cancelled: true });
        return false;
      }

      case MessageType.START_SELECTION_MODE: {
        const tab = await getCurrentTab();
        if (!tab?.id) {
          sendResponse({ cancelled: true, reason: 'No active tab' });
          return false;
        }
        try {
          const selectionResult = await sendTabMessage(tab.id, {
            type: MessageType.START_SELECTION_MODE,
          }) as { type: string; payload: SelectionRegion } | { cancelled: true; reason?: string };

          if (!selectionResult || 'cancelled' in selectionResult) {
            sendResponse({ cancelled: true });
            return false;
          }

          const region = selectionResult.payload;
          log('Selection received', region);

          // Start visible capture, then crop
          if (isCapturing) {
            sendResponse({ cancelled: true, reason: 'Capture already in progress' });
            return false;
          }

          isCapturing = true;
          captureCancelled = false;

          // Send initial progress
          sendToPopup({
            type: MessageType.CAPTURE_PROGRESS,
            payload: createCaptureProgress('capturing', 0, 1),
          });

          // Disable scroll-snap (fixed elements remain visible)
          await sendTabMessage(tab.id, { type: MessageType.DISABLE_SCROLL_SNAP });
          await delay(50);

          // Get page dimensions for DPR
          const dimensions = await sendTabMessage(tab.id, {
            type: MessageType.GET_PAGE_DIMENSIONS,
          }) as PageDimensions;
          const dpr = dimensions?.devicePixelRatio ?? 1;

          // HIDE overlay before capture to prevent it from appearing in screenshot
          try {
            await sendTabMessage(tab.id, { type: MessageType.HIDE_CAPTURE_OVERLAY });
          } catch { /* overlay may not be available */ }
          await delay(50);

          // Capture the full visible area (overlay is now hidden)
          const imageData = await captureViewport('png');

          // RE-SHOW overlay after capture
          try {
            await sendTabMessage(tab.id, { type: MessageType.SHOW_CAPTURE_OVERLAY });
          } catch { /* overlay may not be available */ }

          // Restore scroll-snap
          await sendTabMessage(tab.id, { type: MessageType.RESTORE_SCROLL_SNAP });

          // Hide overlay now that selection capture is done
          try {
            await sendTabMessage(tab.id, { type: MessageType.HIDE_CAPTURE_OVERLAY });
          } catch { /* overlay may not be available */ }

          // Crop the captured image to the selection region
          const croppedDataUrl = await cropImage(imageData, region, dpr);

          // Get page info
          const pageInfo = await sendTabMessage(tab.id, {
            type: MessageType.GET_PAGE_INFO,
          }) as PageInfo;

          // Generate thumbnail
          const imageBlob = await fetch(croppedDataUrl).then((r) => r.blob());
          const thumbnailBlob = await generateThumbnail(imageBlob);
          const thumbnailDataURL = await blobToDataURL(thumbnailBlob);

          // Build and save capture
          const capture: Capture = {
            id: generateCaptureId(),
            url: pageInfo?.url ?? '',
            title: pageInfo?.title ?? 'Selection Capture',
            imageData: croppedDataUrl,
            thumbnail: thumbnailDataURL,
            timestamp: pageInfo?.timestamp ?? Date.now(),
            format: 'png',
            width: region.width,
            height: region.height,
            annotations: [],
          };

          capturesCache.unshift(capture);
          try {
            const captureMeta = {
              id: capture.id, url: capture.url, title: capture.title,
              thumbnail: capture.thumbnail, timestamp: capture.timestamp,
              format: capture.format, width: capture.width, height: capture.height,
              annotations: capture.annotations, ocrText: capture.ocrText,
            };
            await chrome.storage.local.set({
              [`capture-meta-${capture.id}`]: captureMeta,
              [`capture-data-${capture.id}`]: capture.imageData,
              'capture-ids': capturesCache.map((c) => c.id),
            });
          } catch (storageErr) {
            logError('Failed to persist capture to storage', storageErr);
          }

          sendToPopup({
            type: MessageType.CAPTURE_COMPLETE,
            payload: { capture },
          });
          sendToPopup({
            type: MessageType.CAPTURE_PROGRESS,
            payload: createCaptureProgress('complete', 1, 1),
          });

          sendResponse({ started: true });
        } catch (error) {
          logError('Selection capture failed', error);
          // Cleanup: hide overlay and restore scroll-snap
          try {
            await sendTabMessage(tab.id, { type: MessageType.HIDE_CAPTURE_OVERLAY });
          } catch { /* overlay may not be available */ }
          try {
            await sendTabMessage(tab.id, { type: MessageType.RESTORE_SCROLL_SNAP });
          } catch { /* content script may not be accessible */ }
          const errorMessage = error instanceof Error ? error.message : 'Selection capture failed';
          sendToPopup({
            type: MessageType.CAPTURE_ERROR,
            payload: { error: errorMessage, code: 'CAPTURE_FAILED' },
          });
          sendResponse({ cancelled: true, reason: errorMessage });
        } finally {
          isCapturing = false;
          captureCancelled = false;
        }
        return true;
      }

      case MessageType.GET_CAPTURES: {
        getAllCaptures().then((captures) => {
          sendResponse({ captures });
        });
        return true; // async response
      }

      case MessageType.GET_FULL_CAPTURE: {
        const { id } = message.payload;
        getFullCapture(id).then((capture) => {
          sendResponse(capture);
        });
        return true; // async response
      }

      case MessageType.GET_SETTINGS: {
        // Default settings (would integrate with IndexedDB if available in service worker)
        sendResponse({
          defaultFormat: 'png',
          defaultQuality: 90,
          theme: 'dark',
          captureDelay: 100,
          preScrollEnabled: true,
          autoCropEnabled: true,
          smartScrollEnabled: true,
          fixedElementHandling: true,
        });
        return false;
      }

      case MessageType.UPDATE_SETTINGS: {
        // Store settings in chrome.storage.local
        chrome.storage.local
          .set({ 'user-settings': message.payload })
          .then(() => sendResponse({ success: true }))
          .catch(() => sendResponse({ success: false }));
        return true;
      }

      case MessageType.DELETE_CAPTURE: {
        const { id } = message.payload;
        deleteCaptureById(id).then(() => {
          sendResponse({ deleted: true });
        });
        return true;
      }

      case MessageType.OCR_ENSURE_OFFSCREEN: {
        log('Ensuring offscreen document exists for OCR...');
        try {
          await ensureOffscreenDocument();
          sendResponse({ ready: true });
        } catch (err) {
          logError('Failed to ensure offscreen document:', err);
          sendResponse({ ready: false, error: err instanceof Error ? err.message : String(err) });
        }
        return true;
      }

      // OCR messages are handled by the offscreen document, not the background.
      // We just ignore them here so they don't trigger the "Unknown message type" log.
      case MessageType.OCR_PREWARM:
      case MessageType.OCR_RECOGNIZE:
      case MessageType.OCR_GET_STATUS:
      case MessageType.OCR_CANCEL:
      case MessageType.OCR_STATUS_UPDATE:
      case MessageType.OCR_PROGRESS:
      case MessageType.OCR_RESULT:
      case MessageType.OCR_ERROR:
        // These are handled by the offscreen document or popup
        return false;

      default:
        log('Unknown message type', message.type);
        return false;
    }
  }
);

// ===== Command Listener (Keyboard Shortcuts) =====

chrome.commands.onCommand.addListener(async (command) => {
  log('Keyboard command triggered', command);

  switch (command) {
    case 'capture-full-page': {
      const tab = await getCurrentTab();
      if (tab?.id) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['src/content/index.js'],
          });
        } catch {
          // Content script may already be injected
        }
        startFullPageCapture('png', 90, true);
      }
      break;
    }

    case 'capture-visible': {
      const tab = await getCurrentTab();
      if (tab?.id) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['src/content/index.js'],
          });
        } catch {
          // Content script may already be injected
        }
        startVisibleCapture('png', 90);
      }
      break;
    }
  }
});

// ===== Extension Lifecycle =====

// ===== OCR Offscreen Keep-Alive =====

/**
 * Keep the offscreen document alive by periodically pinging it.
 * MV3 service workers can be killed by Chrome after 5 minutes of inactivity,
 * which would also kill the offscreen document. This alarm keeps it alive.
 */
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'ocr-keep-alive') {
    // Check if offscreen document is still alive
    chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    }).then((contexts) => {
      if (contexts.length > 0) {
        log('OCR keep-alive: offscreen document is alive');
      } else {
        log('OCR keep-alive: offscreen document was killed, recreating...');
        ensureOffscreenDocument();
      }
    }).catch(() => {
      log('OCR keep-alive: failed to check, recreating offscreen...');
      ensureOffscreenDocument();
    });
  }
});

/**
 * Create the offscreen document and start the OCR engine pre-warming.
 * Called on install and startup so the engine is ready before the user needs it.
 */
async function prewarmOCREngine(): Promise<void> {
  log('Pre-warming OCR engine via offscreen document...');
  await ensureOffscreenDocument();

  // Give the offscreen document a moment to load, then send pre-warm command
  // The offscreen document also auto-prewarms on load, but this is a safety net
  setTimeout(() => {
    chrome.runtime.sendMessage({ type: 'OCR_PREWARM', payload: { language: 'eng' } }).catch(() => {
      // Offscreen may not be ready yet, that's fine — it auto-prewarms on load
    });
  }, 1000);
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    log('SmartCapture Pro installed');
    // Initialize default settings
    chrome.storage.local.set({
      'user-settings': {
        defaultFormat: 'png',
        defaultQuality: 90,
        theme: 'dark',
        captureDelay: 100,
        preScrollEnabled: true,
        autoCropEnabled: true,
        smartScrollEnabled: true,
        fixedElementHandling: true,
      },
    });
    // Create offscreen document and pre-warm OCR engine on install
    prewarmOCREngine();
    // Set up keep-alive alarm (every 4 minutes — well within Chrome's 5-min SW timeout)
    chrome.alarms.create('ocr-keep-alive', { periodInMinutes: 4 });
  } else if (details.reason === 'update') {
    log('SmartCapture Pro updated', `Previous version: ${details.previousVersion}`);
    // Also prewarm on update
    prewarmOCREngine();
    chrome.alarms.create('ocr-keep-alive', { periodInMinutes: 4 });
  }
});

chrome.runtime.onStartup.addListener(() => {
  log('SmartCapture Pro service worker started');
  // Create offscreen document and pre-warm OCR engine on browser startup
  prewarmOCREngine();
  // Re-establish keep-alive alarm
  chrome.alarms.create('ocr-keep-alive', { periodInMinutes: 4 });
});

log('Background service worker loaded');
