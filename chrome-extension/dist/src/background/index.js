// src/lib/constants.ts
var MIN_SCROLL_OVERLAP = 0.25;
var SCROLL_SETTLE_DELAY = 200;
var MAX_CANVAS_HEIGHT = 15e3;
var THUMBNAIL_MAX_WIDTH = 300;
var THUMBNAIL_MAX_HEIGHT = 200;

// src/lib/capture.ts
function calculateOverlap(fixedElements, viewportHeight) {
  let topOverlap = 0;
  let bottomOverlap = 0;
  for (const el of fixedElements) {
    if (el.top === 0 && el.position === "fixed") {
      topOverlap = Math.max(topOverlap, el.height);
    }
    if (el.position === "sticky" && el.top <= 5) {
      topOverlap = Math.max(topOverlap, el.height);
    }
    if (Math.abs(el.bottom - viewportHeight) < 5 && el.position === "fixed") {
      bottomOverlap = Math.max(bottomOverlap, el.height);
    }
    if (Math.abs(el.bottom - viewportHeight) < 5 && el.position === "sticky") {
      bottomOverlap = Math.max(bottomOverlap, el.height);
    }
  }
  return { topOverlap, bottomOverlap };
}
function calculateScrollPositions(pageWidth, pageHeight, viewportWidth, viewportHeight, fixedElements = []) {
  const positions = [];
  const { topOverlap } = calculateOverlap(fixedElements, viewportHeight);
  const minOverlap = Math.round(viewportHeight * MIN_SCROLL_OVERLAP);
  const effectiveOverlap = Math.max(topOverlap, minOverlap);
  const verticalStep = viewportHeight - effectiveOverlap;
  if (pageHeight <= viewportHeight && pageWidth <= viewportWidth) {
    return [{ x: 0, y: 0 }];
  }
  const maxScrollY = Math.max(0, pageHeight - viewportHeight);
  if (pageWidth <= viewportWidth) {
    let y2 = 0;
    while (y2 < maxScrollY) {
      positions.push({ x: 0, y: y2 });
      y2 += verticalStep;
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
    const lastX = positions.length > 0 && positions[positions.length - 1].y === y ? positions[positions.length - 1].x : 0;
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
    const lastX = positions.length > 0 && positions[positions.length - 1].y === maxScrollY ? positions[positions.length - 1].x : 0;
    if (lastX < maxScrollX) {
      positions.push({ x: maxScrollX, y: maxScrollY });
    }
  }
  return positions;
}
function dataURLToImageBitmap(dataURL) {
  if (typeof OffscreenCanvas !== "undefined" && typeof createImageBitmap !== "undefined") {
    return fetch(dataURL).then((res) => res.blob()).then((blob) => createImageBitmap(blob));
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      createImageBitmap(canvas).then(resolve).catch(reject);
    };
    img.onerror = () => reject(new Error("Failed to load image from data URL"));
    img.src = dataURL;
  });
}
async function cropTrailingWhitespace(canvas, actualContentHeight) {
  const w = canvas.width;
  const h = canvas.height;
  if (actualContentHeight >= h - 2) {
    return canvas;
  }
  const croppedHeight = Math.min(h, actualContentHeight + 2);
  if (croppedHeight < h * 0.5) {
    console.warn(`[SmartCapture] cropTrailingWhitespace: unusual content height ${croppedHeight} vs canvas ${h}, skipping crop`);
    return canvas;
  }
  const croppedCanvas = new OffscreenCanvas(w, croppedHeight);
  const croppedCtx = croppedCanvas.getContext("2d");
  if (!croppedCtx) return canvas;
  croppedCtx.drawImage(canvas, 0, 0, w, croppedHeight, 0, 0, w, croppedHeight);
  console.log(`[SmartCapture] Cropped trailing whitespace: ${h} \u2192 ${croppedHeight}px`);
  return croppedCanvas;
}
async function stitchCaptures(slices, options) {
  const {
    devicePixelRatio,
    format,
    quality
  } = options;
  if (slices.length === 0) {
    throw new Error("No slices to stitch");
  }
  const mimeType = format === "jpeg" ? "image/jpeg" : "image/png";
  const jpegQuality = format === "jpeg" ? quality / 100 : void 0;
  const bitmaps = [];
  for (let i = 0; i < slices.length; i++) {
    try {
      const bitmap = await dataURLToImageBitmap(slices[i].imageData);
      bitmaps.push(bitmap);
    } catch (err) {
      console.error(`[SmartCapture] Failed to load bitmap for slice ${i}:`, err);
      bitmaps.push(null);
    }
  }
  let scaledWidth = 0;
  for (let i = 0; i < slices.length; i++) {
    if (!bitmaps[i]) continue;
    const bitmap = bitmaps[i];
    const rightEdge = slices[i].x * devicePixelRatio + bitmap.width;
    scaledWidth = Math.max(scaledWidth, rightEdge);
  }
  const bitmapHeights = bitmaps.map((b) => b ? b.height : 0);
  const drawOps = [];
  let currentCanvasY = 0;
  for (let i = 0; i < slices.length; i++) {
    const bitmap = bitmaps[i];
    if (!bitmap) continue;
    try {
      const dx = slices[i].x * devicePixelRatio;
      let topTrim = 0;
      if (i > 0 && bitmapHeights[i - 1] > 0) {
        const scrollStep = slices[i].y - slices[i - 1].y;
        const prevBitmapHeight = bitmapHeights[i - 1];
        topTrim = prevBitmapHeight - scrollStep * devicePixelRatio;
        topTrim = Math.max(0, Math.min(topTrim, bitmap.height - 1));
        const reasonableMax = bitmap.height * 0.95;
        if (topTrim > reasonableMax) {
          console.warn(`[SmartCapture] Slice ${i}: topTrim=${Math.round(topTrim)}px exceeds 95% of bitmap, clamping`);
          topTrim = reasonableMax;
        }
        console.log(`[SmartCapture] Slice ${i}: scrollStep=${scrollStep}px, topTrim=${Math.round(topTrim)}px, prevBitmapH=${prevBitmapHeight}px, curBitmapH=${bitmap.height}px`);
      }
      const srcX = 0;
      const srcY = Math.round(topTrim);
      const srcWidth = bitmap.width;
      const srcHeight = Math.max(1, Math.round(bitmap.height - topTrim));
      const prevDx = i > 0 ? slices[i - 1].x * devicePixelRatio : -1;
      const destY = i === 0 || dx !== prevDx ? Math.round(slices[i].y * devicePixelRatio) : currentCanvasY;
      if (srcHeight > 0) {
        drawOps.push({
          bitmapIndex: i,
          srcX,
          srcY,
          srcWidth,
          srcHeight,
          destX: dx,
          destY
        });
        currentCanvasY = destY + srcHeight;
      }
    } catch (err) {
      console.error(`[SmartCapture] Failed to compute draw op for slice ${i}:`, err);
    }
  }
  const typicalBitmapHeight = bitmapHeights[0] || Math.ceil(scaledWidth / Math.max(1, slices.length));
  const canvasHeightBuffer = Math.ceil(typicalBitmapHeight * 0.5);
  const totalCanvasHeight = currentCanvasY + canvasHeightBuffer;
  const needsSplitting = totalCanvasHeight > MAX_CANVAS_HEIGHT;
  let blobs;
  if (needsSplitting) {
    const numSegments = Math.ceil(totalCanvasHeight / MAX_CANVAS_HEIGHT);
    console.log(`[SmartCapture] Page height ${totalCanvasHeight}px exceeds max ${MAX_CANVAS_HEIGHT}px \u2014 splitting into ${numSegments} segments`);
    blobs = [];
    for (let seg = 0; seg < numSegments; seg++) {
      const segTop = seg * MAX_CANVAS_HEIGHT;
      const segBottom = Math.min(segTop + MAX_CANVAS_HEIGHT, totalCanvasHeight);
      const segHeight = segBottom - segTop;
      const segCanvas = new OffscreenCanvas(scaledWidth, segHeight);
      const segCtx = segCanvas.getContext("2d");
      if (!segCtx) {
        console.error(`[SmartCapture] Failed to get OffscreenCanvas context for segment ${seg}`);
        continue;
      }
      for (const op of drawOps) {
        const opTop = op.destY;
        const opBottom = op.destY + op.srcHeight;
        if (opBottom <= segTop || opTop >= segBottom) continue;
        const bitmap = bitmaps[op.bitmapIndex];
        if (!bitmap) continue;
        const clipTop = Math.max(opTop, segTop);
        const clipBottom = Math.min(opBottom, segBottom);
        const localDestY = clipTop - segTop;
        const clipHeight = clipBottom - clipTop;
        const srcOffset = clipTop - opTop;
        segCtx.drawImage(
          bitmap,
          op.srcX,
          op.srcY + srcOffset,
          op.srcWidth,
          clipHeight,
          op.destX,
          localDestY,
          op.srcWidth,
          clipHeight
        );
      }
      let finalSegCanvas = segCanvas;
      if (seg === numSegments - 1) {
        const localContentY = currentCanvasY - segTop;
        finalSegCanvas = await cropTrailingWhitespace(segCanvas, localContentY);
      }
      const blob = await finalSegCanvas.convertToBlob({
        type: mimeType,
        quality: jpegQuality
      });
      blobs.push(blob);
      console.log(`[SmartCapture] Segment ${seg + 1}/${numSegments}: ${scaledWidth}x${segHeight}px, ${(blob.size / 1024 / 1024).toFixed(2)}MB`);
    }
  } else {
    const canvas = new OffscreenCanvas(scaledWidth, totalCanvasHeight);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get OffscreenCanvas 2D context");
    }
    for (const op of drawOps) {
      const bitmap = bitmaps[op.bitmapIndex];
      if (!bitmap) continue;
      ctx.drawImage(
        bitmap,
        op.srcX,
        op.srcY,
        op.srcWidth,
        op.srcHeight,
        op.destX,
        op.destY,
        op.srcWidth,
        op.srcHeight
      );
    }
    const finalCanvas = await cropTrailingWhitespace(canvas, currentCanvasY);
    const blob = await finalCanvas.convertToBlob({
      type: mimeType,
      quality: jpegQuality
    });
    blobs = [blob];
  }
  for (const bitmap of bitmaps) {
    if (bitmap) bitmap.close();
  }
  return blobs;
}
async function generateThumbnail(sourceBlob, maxWidth = THUMBNAIL_MAX_WIDTH, maxHeight = THUMBNAIL_MAX_HEIGHT) {
  const sourceBitmap = await createImageBitmap(sourceBlob);
  const { width, height } = sourceBitmap;
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  const thumbWidth = Math.floor(width * scale);
  const thumbHeight = Math.floor(height * scale);
  const thumbCanvas = new OffscreenCanvas(thumbWidth, thumbHeight);
  const ctx = thumbCanvas.getContext("2d");
  if (!ctx) {
    sourceBitmap.close();
    throw new Error("Failed to get OffscreenCanvas 2D context for thumbnail");
  }
  ctx.drawImage(sourceBitmap, 0, 0, thumbWidth, thumbHeight);
  sourceBitmap.close();
  const thumbnailBlob = await thumbCanvas.convertToBlob({
    type: "image/jpeg",
    quality: 0.7
  });
  return thumbnailBlob;
}
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to convert blob to data URL"));
    reader.readAsDataURL(blob);
  });
}
function createCaptureProgress(status, current, total) {
  return {
    status,
    current,
    total,
    percentage: total > 0 ? Math.round(current / total * 100) : 0
  };
}
function generateCaptureId() {
  return `capture-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
function buildCaptureObject(imageDataURL, thumbnailDataURL, pageDimensions, pageInfo, format) {
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
    annotations: []
  };
}

// src/background/index.ts
function log(message, data) {
  console.log(`[SmartCapture BG] ${message}`, data ?? "");
}
function logError(message, error) {
  console.error(`[SmartCapture BG] ${message}`, error);
}
var activeTabId = null;
var isCapturing = false;
var captureCancelled = false;
var capturesCache = [];
async function getCurrentTab() {
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
function sendTabMessage(tabId, message, timeoutMs = 3e4) {
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
function sendToPopup(message) {
  chrome.runtime.sendMessage(message).catch(() => {
  });
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function cropImage(dataUrl, region, dpr) {
  const img = await createImageBitmap(await fetch(dataUrl).then((r) => r.blob()));
  const canvas = new OffscreenCanvas(
    Math.round(region.width * dpr),
    Math.round(region.height * dpr)
  );
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get 2D context");
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
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
async function captureViewport(format = "png") {
  if (captureCancelled) {
    throw new Error("Capture cancelled");
  }
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(
      void 0,
      // Use current window
      { format: format === "jpeg" ? "jpeg" : "png" },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!dataUrl) {
          reject(new Error("Failed to capture viewport - empty result"));
        } else {
          resolve(dataUrl);
        }
      }
    );
  });
}
async function startFullPageCapture(format, quality, smartScroll) {
  if (isCapturing) {
    log("Capture already in progress, ignoring request");
    return;
  }
  isCapturing = true;
  captureCancelled = false;
  log("Starting full page capture", { format, quality, smartScroll });
  try {
    const tab = await getCurrentTab();
    if (!tab?.id) {
      throw new Error("No active tab found");
    }
    const tabId = tab.id;
    sendToPopup({
      type: "CAPTURE_PROGRESS" /* CAPTURE_PROGRESS */,
      payload: createCaptureProgress("capturing", 0, 1)
    });
    log("Step 1: Showing capture overlay on content page...");
    try {
      await sendTabMessage(tabId, { type: "SHOW_CAPTURE_OVERLAY" /* SHOW_CAPTURE_OVERLAY */ });
    } catch {
      log("Content script not available for overlay, continuing without it");
    }
    log("Step 2: Pre-scrolling for lazy content...");
    sendToPopup({
      type: "CAPTURE_PROGRESS" /* CAPTURE_PROGRESS */,
      payload: createCaptureProgress("capturing", 0, 1)
    });
    try {
      await sendTabMessage(tabId, { type: "UPDATE_CAPTURE_OVERLAY" /* UPDATE_CAPTURE_OVERLAY */, payload: { progress: 5, step: "Pre-scrolling page..." } });
    } catch {
    }
    try {
      await Promise.race([
        sendTabMessage(tabId, { type: "PRE_SCROLL_PAGE" /* PRE_SCROLL_PAGE */ }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Pre-scroll timed out (10s)")), 1e4))
      ]);
    } catch (e) {
      log("Pre-scroll timed out or failed, continuing capture", e instanceof Error ? e.message : e);
    }
    await delay(300);
    log("Step 3: Scrolling to top...");
    try {
      await sendTabMessage(tabId, { type: "UPDATE_CAPTURE_OVERLAY" /* UPDATE_CAPTURE_OVERLAY */, payload: { progress: 10, step: "Scrolling to top..." } });
    } catch {
    }
    await sendTabMessage(tabId, {
      type: "SCROLL_TO_POSITION" /* SCROLL_TO_POSITION */,
      payload: { x: 0, y: 0 }
    });
    await delay(200);
    log("Step 4: Disabling scroll-snap...");
    try {
      await sendTabMessage(tabId, { type: "UPDATE_CAPTURE_OVERLAY" /* UPDATE_CAPTURE_OVERLAY */, payload: { progress: 15, step: "Preparing page..." } });
    } catch {
    }
    await sendTabMessage(tabId, { type: "DISABLE_SCROLL_SNAP" /* DISABLE_SCROLL_SNAP */ });
    await delay(200);
    log("Step 5: Getting page dimensions (with fixed elements)...");
    try {
      await sendTabMessage(tabId, { type: "UPDATE_CAPTURE_OVERLAY" /* UPDATE_CAPTURE_OVERLAY */, payload: { progress: 20, step: "Measuring page..." } });
    } catch {
    }
    let dimensions;
    try {
      dimensions = await sendTabMessage(tabId, {
        type: "GET_PAGE_DIMENSIONS" /* GET_PAGE_DIMENSIONS */
      }, 15e3);
    } catch (dimError) {
      logError("Page dimensions measurement failed/timed out, retrying with fallback...", dimError);
      dimensions = await sendTabMessage(tabId, {
        type: "GET_PAGE_DIMENSIONS" /* GET_PAGE_DIMENSIONS */
      }, 2e4);
    }
    if (!dimensions) {
      throw new Error("Failed to get page dimensions. Make sure you are on a valid web page.");
    }
    log("Page dimensions (fixed elements visible)", dimensions);
    const positions = calculateScrollPositions(
      dimensions.scrollWidth,
      dimensions.scrollHeight,
      dimensions.viewportWidth,
      dimensions.viewportHeight,
      dimensions.fixedElements
      // Real data — fixed elements are still visible
    );
    log(`Step 5: Calculated ${positions.length} scroll positions`);
    const pageInfo = await sendTabMessage(tabId, {
      type: "GET_PAGE_INFO" /* GET_PAGE_INFO */
    });
    try {
      await sendTabMessage(tabId, { type: "UPDATE_CAPTURE_OVERLAY" /* UPDATE_CAPTURE_OVERLAY */, payload: { progress: 25, step: `Capturing ${positions.length} sections...` } });
    } catch {
    }
    if (!pageInfo) {
      throw new Error("Failed to get page info");
    }
    log("Step 6: Capturing viewports...");
    const slices = [];
    for (let i = 0; i < positions.length; i++) {
      if (captureCancelled) {
        log("Capture cancelled during viewport capture");
        throw new Error("Capture cancelled by user");
      }
      const pos = positions[i];
      sendToPopup({
        type: "CAPTURE_PROGRESS" /* CAPTURE_PROGRESS */,
        payload: createCaptureProgress("capturing", i + 1, positions.length)
      });
      const overlayProgress = 25 + Math.round((i + 1) / positions.length * 65);
      try {
        await sendTabMessage(tabId, {
          type: "UPDATE_CAPTURE_OVERLAY" /* UPDATE_CAPTURE_OVERLAY */,
          payload: { progress: overlayProgress, step: `Capturing section ${i + 1} of ${positions.length}...` }
        });
      } catch {
      }
      const scrollResult = await sendTabMessage(tabId, {
        type: "SCROLL_TO_POSITION" /* SCROLL_TO_POSITION */,
        payload: { x: pos.x, y: pos.y }
      });
      await delay(SCROLL_SETTLE_DELAY);
      try {
        await sendTabMessage(tabId, { type: "HIDE_CAPTURE_OVERLAY" /* HIDE_CAPTURE_OVERLAY */ });
      } catch {
      }
      await delay(50);
      if (i > 0) {
        try {
          await sendTabMessage(tabId, { type: "HIDE_FIXED_ELEMENTS" /* HIDE_FIXED_ELEMENTS */ });
        } catch {
        }
        await delay(100);
      }
      const imageData = await captureViewport(format);
      if (i > 0) {
        try {
          await sendTabMessage(tabId, { type: "SHOW_FIXED_ELEMENTS" /* SHOW_FIXED_ELEMENTS */ });
        } catch {
        }
      }
      try {
        await sendTabMessage(tabId, { type: "SHOW_CAPTURE_OVERLAY" /* SHOW_CAPTURE_OVERLAY */ });
        const overlayProg = 25 + Math.round((i + 1) / positions.length * 65);
        await sendTabMessage(tabId, {
          type: "UPDATE_CAPTURE_OVERLAY" /* UPDATE_CAPTURE_OVERLAY */,
          payload: { progress: overlayProg, step: `Captured section ${i + 1} of ${positions.length}` }
        });
      } catch {
      }
      const actualX = scrollResult?.scrollX ?? pos.x;
      const actualY = scrollResult?.scrollY ?? pos.y;
      slices.push({
        imageData,
        x: actualX,
        y: actualY,
        width: dimensions.viewportWidth,
        height: dimensions.viewportHeight
      });
      log(`Captured viewport ${i + 1}/${positions.length} at requested(${pos.x}, ${pos.y}) actual(${actualX}, ${actualY})`);
    }
    log("Step 5.5: Checking for page growth...");
    const MAX_GROWTH_ROUNDS = 2;
    const MAX_GROWTH_PERCENTAGE = 0.5;
    for (let growthRound = 0; growthRound < MAX_GROWTH_ROUNDS; growthRound++) {
      const newDimensions = await sendTabMessage(tabId, {
        type: "GET_PAGE_DIMENSIONS" /* GET_PAGE_DIMENSIONS */
      });
      if (!newDimensions || newDimensions.scrollHeight <= dimensions.scrollHeight) {
        break;
      }
      const originalHeight = dimensions.scrollHeight;
      const newHeight = newDimensions.scrollHeight;
      const growth = newHeight - originalHeight;
      const growthPercentage = growth / originalHeight;
      if (growthPercentage < MAX_GROWTH_PERCENTAGE) {
        log(`Page growth too small (${Math.round(growthPercentage * 100)}%), skipping additional capture`);
        break;
      }
      log(`Page grew during capture (round ${growthRound + 1}/${MAX_GROWTH_ROUNDS}): ${originalHeight} \u2192 ${newHeight} (+${growth}px, +${Math.round(growthPercentage * 100)}%). Capturing additional slices...`);
      const additionalPositions = calculateScrollPositions(
        newDimensions.scrollWidth,
        newHeight,
        dimensions.viewportWidth,
        dimensions.viewportHeight,
        []
        // Fixed elements are still hidden
      );
      const maxCoveredY = Math.max(...slices.map((s) => s.y));
      const newPositions = additionalPositions.filter((p) => p.y > maxCoveredY - dimensions.viewportHeight * 0.2);
      for (let i = 0; i < newPositions.length; i++) {
        if (captureCancelled) throw new Error("Capture cancelled by user");
        const pos = newPositions[i];
        const totalProgress = positions.length + i + 1;
        const totalExpected = positions.length + newPositions.length;
        sendToPopup({
          type: "CAPTURE_PROGRESS" /* CAPTURE_PROGRESS */,
          payload: createCaptureProgress("capturing", totalProgress, totalExpected)
        });
        const growthOverlayProgress = 90 + Math.round((i + 1) / newPositions.length * 2);
        try {
          await sendTabMessage(tabId, {
            type: "UPDATE_CAPTURE_OVERLAY" /* UPDATE_CAPTURE_OVERLAY */,
            payload: { progress: Math.min(growthOverlayProgress, 92), step: `Capturing additional section ${i + 1} of ${newPositions.length}...` }
          });
        } catch {
        }
        const scrollResult = await sendTabMessage(tabId, {
          type: "SCROLL_TO_POSITION" /* SCROLL_TO_POSITION */,
          payload: { x: pos.x, y: pos.y }
        });
        await delay(SCROLL_SETTLE_DELAY);
        try {
          await sendTabMessage(tabId, { type: "HIDE_CAPTURE_OVERLAY" /* HIDE_CAPTURE_OVERLAY */ });
        } catch {
        }
        await delay(50);
        try {
          await sendTabMessage(tabId, { type: "HIDE_FIXED_ELEMENTS" /* HIDE_FIXED_ELEMENTS */ });
        } catch {
        }
        await delay(100);
        const imageData = await captureViewport(format);
        try {
          await sendTabMessage(tabId, { type: "SHOW_FIXED_ELEMENTS" /* SHOW_FIXED_ELEMENTS */ });
        } catch {
        }
        try {
          await sendTabMessage(tabId, { type: "SHOW_CAPTURE_OVERLAY" /* SHOW_CAPTURE_OVERLAY */ });
          await sendTabMessage(tabId, {
            type: "UPDATE_CAPTURE_OVERLAY" /* UPDATE_CAPTURE_OVERLAY */,
            payload: { progress: Math.min(growthOverlayProgress, 92), step: `Captured additional section ${i + 1} of ${newPositions.length}` }
          });
        } catch {
        }
        const actualX = scrollResult?.scrollX ?? pos.x;
        const actualY = scrollResult?.scrollY ?? pos.y;
        slices.push({
          imageData,
          x: actualX,
          y: actualY,
          width: dimensions.viewportWidth,
          height: dimensions.viewportHeight
        });
        log(`Captured additional viewport ${i + 1}/${newPositions.length} at y=${actualY}`);
      }
      dimensions.scrollHeight = newHeight;
    }
    log("Step 7: Restoring scroll-snap...");
    try {
      await sendTabMessage(tabId, { type: "UPDATE_CAPTURE_OVERLAY" /* UPDATE_CAPTURE_OVERLAY */, payload: { progress: 92, step: "Restoring page..." } });
    } catch {
    }
    await sendTabMessage(tabId, { type: "RESTORE_SCROLL_SNAP" /* RESTORE_SCROLL_SNAP */ });
    try {
      await sendTabMessage(tabId, { type: "HIDE_CAPTURE_OVERLAY" /* HIDE_CAPTURE_OVERLAY */ });
    } catch {
    }
    sendToPopup({
      type: "CAPTURE_PROGRESS" /* CAPTURE_PROGRESS */,
      payload: createCaptureProgress("stitching", 0, 1)
    });
    log("Step 8: Stitching captures...");
    const stitchOptions = {
      pageWidth: dimensions.scrollWidth,
      pageHeight: dimensions.scrollHeight,
      devicePixelRatio: dimensions.devicePixelRatio,
      format,
      quality,
      fixedElements: dimensions.fixedElements
    };
    const stitchedBlobs = await stitchCaptures(slices, stitchOptions);
    const isMultiPage = stitchedBlobs.length > 1;
    if (isMultiPage) {
      log(`Stitched image split into ${stitchedBlobs.length} segments (total ${(stitchedBlobs.reduce((s, b) => s + b.size, 0) / 1024 / 1024).toFixed(2)}MB)`);
    } else {
      log(`Stitched image size: ${stitchedBlobs[0].size} bytes`);
    }
    sendToPopup({
      type: "CAPTURE_PROGRESS" /* CAPTURE_PROGRESS */,
      payload: createCaptureProgress("processing", 0, 1)
    });
    const thumbnailBlob = await generateThumbnail(stitchedBlobs[0]);
    const imageDataURL = await blobToDataURL(stitchedBlobs[0]);
    const thumbnailDataURL = await blobToDataURL(thumbnailBlob);
    const additionalPageURLs = [];
    for (let i = 1; i < stitchedBlobs.length; i++) {
      additionalPageURLs.push(await blobToDataURL(stitchedBlobs[i]));
    }
    const capture = buildCaptureObject(
      imageDataURL,
      thumbnailDataURL,
      dimensions,
      pageInfo,
      format
    );
    if (isMultiPage) {
      capture.pages = additionalPageURLs;
      capture.pageCount = stitchedBlobs.length;
      log(`Capture is multi-page: ${stitchedBlobs.length} segments`);
    }
    log("Step 9: Saving capture...");
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
        pageCount: capture.pageCount
      };
      await chrome.storage.local.set({
        [`capture-meta-${capture.id}`]: captureMeta,
        [`capture-data-${capture.id}`]: capture.imageData,
        "capture-ids": capturesCache.map((c) => c.id)
      });
      if (isMultiPage) {
        const pageEntries = {};
        for (let i = 0; i < additionalPageURLs.length; i++) {
          pageEntries[`capture-page-${capture.id}-${i}`] = additionalPageURLs[i];
        }
        pageEntries[`capture-page-count-${capture.id}`] = String(stitchedBlobs.length);
        await chrome.storage.local.set(pageEntries);
      }
    } catch (storageErr) {
      logError("Failed to persist capture to storage", storageErr);
    }
    log("Capture complete!", { id: capture.id, width: capture.width, height: capture.height });
    sendToPopup({
      type: "CAPTURE_COMPLETE" /* CAPTURE_COMPLETE */,
      payload: { capture }
    });
    sendToPopup({
      type: "CAPTURE_PROGRESS" /* CAPTURE_PROGRESS */,
      payload: createCaptureProgress("complete", 1, 1)
    });
  } catch (error) {
    logError("Capture failed", error);
    if (activeTabId) {
      try {
        await sendTabMessage(activeTabId, { type: "HIDE_CAPTURE_OVERLAY" /* HIDE_CAPTURE_OVERLAY */ });
      } catch {
      }
      try {
        await sendTabMessage(activeTabId, { type: "RESTORE_SCROLL_SNAP" /* RESTORE_SCROLL_SNAP */ });
      } catch {
      }
    }
    const errorMessage = error instanceof Error ? error.message : "Unknown capture error";
    sendToPopup({
      type: "CAPTURE_ERROR" /* CAPTURE_ERROR */,
      payload: {
        error: errorMessage,
        code: captureCancelled ? "CANCELLED" : "CAPTURE_FAILED"
      }
    });
    sendToPopup({
      type: "CAPTURE_PROGRESS" /* CAPTURE_PROGRESS */,
      payload: createCaptureProgress("error", 0, 0)
    });
  } finally {
    isCapturing = false;
    captureCancelled = false;
  }
}
async function startVisibleCapture(format, quality) {
  if (isCapturing) {
    log("Capture already in progress, ignoring request");
    return;
  }
  isCapturing = true;
  captureCancelled = false;
  log("Starting visible area capture", { format, quality });
  try {
    const tab = await getCurrentTab();
    if (!tab?.id) {
      throw new Error("No active tab found");
    }
    const tabId = tab.id;
    sendToPopup({
      type: "CAPTURE_PROGRESS" /* CAPTURE_PROGRESS */,
      payload: createCaptureProgress("capturing", 0, 1)
    });
    await sendTabMessage(tabId, { type: "DISABLE_SCROLL_SNAP" /* DISABLE_SCROLL_SNAP */ });
    await delay(100);
    const [pageInfo, dimensions] = await Promise.all([
      sendTabMessage(tabId, { type: "GET_PAGE_INFO" /* GET_PAGE_INFO */ }),
      sendTabMessage(tabId, { type: "GET_PAGE_DIMENSIONS" /* GET_PAGE_DIMENSIONS */ })
    ]);
    if (!pageInfo || !dimensions) {
      throw new Error("Failed to get page info or dimensions");
    }
    sendToPopup({
      type: "CAPTURE_PROGRESS" /* CAPTURE_PROGRESS */,
      payload: createCaptureProgress("capturing", 1, 1)
    });
    try {
      await sendTabMessage(tabId, { type: "HIDE_CAPTURE_OVERLAY" /* HIDE_CAPTURE_OVERLAY */ });
    } catch {
    }
    await delay(50);
    const imageData = await captureViewport(format);
    try {
      await sendTabMessage(tabId, { type: "SHOW_CAPTURE_OVERLAY" /* SHOW_CAPTURE_OVERLAY */ });
    } catch {
    }
    await sendTabMessage(tabId, { type: "RESTORE_SCROLL_SNAP" /* RESTORE_SCROLL_SNAP */ });
    try {
      await sendTabMessage(tabId, { type: "HIDE_CAPTURE_OVERLAY" /* HIDE_CAPTURE_OVERLAY */ });
    } catch {
    }
    sendToPopup({
      type: "CAPTURE_PROGRESS" /* CAPTURE_PROGRESS */,
      payload: createCaptureProgress("processing", 0, 1)
    });
    const imageBlob = await fetch(imageData).then((r) => r.blob());
    const thumbnailBlob = await generateThumbnail(imageBlob);
    const thumbnailDataURL = await blobToDataURL(thumbnailBlob);
    const capture = {
      id: generateCaptureId(),
      url: pageInfo.url,
      title: pageInfo.title,
      imageData,
      thumbnail: thumbnailDataURL,
      timestamp: pageInfo.timestamp,
      format,
      width: dimensions.viewportWidth,
      height: dimensions.viewportHeight,
      annotations: []
    };
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
        ocrText: capture.ocrText
      };
      await chrome.storage.local.set({
        [`capture-meta-${capture.id}`]: captureMeta,
        [`capture-data-${capture.id}`]: capture.imageData,
        "capture-ids": capturesCache.map((c) => c.id)
      });
    } catch (storageErr) {
      logError("Failed to persist capture to storage", storageErr);
    }
    log("Visible area capture complete!", { id: capture.id });
    sendToPopup({
      type: "CAPTURE_COMPLETE" /* CAPTURE_COMPLETE */,
      payload: { capture }
    });
    sendToPopup({
      type: "CAPTURE_PROGRESS" /* CAPTURE_PROGRESS */,
      payload: createCaptureProgress("complete", 1, 1)
    });
  } catch (error) {
    logError("Visible capture failed", error);
    if (activeTabId) {
      try {
        await sendTabMessage(activeTabId, { type: "HIDE_CAPTURE_OVERLAY" /* HIDE_CAPTURE_OVERLAY */ });
      } catch {
      }
      try {
        await sendTabMessage(activeTabId, { type: "RESTORE_SCROLL_SNAP" /* RESTORE_SCROLL_SNAP */ });
      } catch {
      }
    }
    const errorMessage = error instanceof Error ? error.message : "Unknown capture error";
    sendToPopup({
      type: "CAPTURE_ERROR" /* CAPTURE_ERROR */,
      payload: {
        error: errorMessage,
        code: captureCancelled ? "CANCELLED" : "CAPTURE_FAILED"
      }
    });
  } finally {
    isCapturing = false;
    captureCancelled = false;
  }
}
async function getAllCaptures() {
  try {
    const result = await chrome.storage.local.get("capture-ids");
    const ids = result["capture-ids"] || [];
    if (ids.length === 0) return [];
    const keys = ids.map((id) => `capture-meta-${id}`);
    const metaResult = await chrome.storage.local.get(keys);
    const captures = [];
    for (const id of ids) {
      const meta = metaResult[`capture-meta-${id}`];
      if (meta) {
        captures.push({
          ...meta,
          imageData: ""
          // Placeholder - load on demand
        });
      }
    }
    return captures.sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return capturesCache;
  }
}
async function getFullCapture(id) {
  const cached = capturesCache.find((c) => c.id === id);
  if (cached?.imageData) return cached;
  try {
    const result = await chrome.storage.local.get([
      `capture-meta-${id}`,
      `capture-data-${id}`,
      `capture-page-count-${id}`
    ]);
    const meta = result[`capture-meta-${id}`];
    const data = result[`capture-data-${id}`];
    if (meta && data) {
      const capture = { ...meta, imageData: data };
      if (meta.pageCount && meta.pageCount > 1) {
        const pageCount = meta.pageCount;
        const pageKeys = [];
        for (let i = 0; i < pageCount - 1; i++) {
          pageKeys.push(`capture-page-${id}-${i}`);
        }
        const pageResult = await chrome.storage.local.get(pageKeys);
        const pages = [];
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
  }
  return null;
}
async function deleteCaptureById(id) {
  const idx = capturesCache.findIndex((c) => c.id === id);
  if (idx >= 0) capturesCache.splice(idx, 1);
  try {
    const countResult = await chrome.storage.local.get(`capture-page-count-${id}`);
    const pageCount = countResult[`capture-page-count-${id}`] ? parseInt(countResult[`capture-page-count-${id}`], 10) : 0;
    const keysToRemove = [
      `capture-meta-${id}`,
      `capture-data-${id}`,
      `capture-page-count-${id}`
    ];
    if (pageCount > 1) {
      for (let i = 0; i < pageCount - 1; i++) {
        keysToRemove.push(`capture-page-${id}-${i}`);
      }
    }
    await chrome.storage.local.remove(keysToRemove);
    const result = await chrome.storage.local.get("capture-ids");
    const ids = (result["capture-ids"] || []).filter((cid) => cid !== id);
    await chrome.storage.local.set({ "capture-ids": ids });
  } catch {
  }
}
chrome.runtime.onMessage.addListener(
  async (message, _sender, sendResponse) => {
    log("Message received", message.type);
    switch (message.type) {
      case "CAPTURE_START" /* CAPTURE_START */: {
        const { format, quality, fullPage, smartScroll } = message.payload;
        if (fullPage) {
          startFullPageCapture(format, quality, smartScroll);
        } else {
          startVisibleCapture(format, quality);
        }
        sendResponse({ started: true });
        return true;
      }
      case "CAPTURE_VISIBLE" /* CAPTURE_VISIBLE */: {
        const { format } = message.payload;
        startVisibleCapture(format, 90);
        sendResponse({ started: true });
        return true;
      }
      case "CANCEL_CAPTURE" /* CANCEL_CAPTURE */: {
        captureCancelled = true;
        isCapturing = false;
        log("Capture cancellation requested");
        sendResponse({ cancelled: true });
        return false;
      }
      case "START_SELECTION_MODE" /* START_SELECTION_MODE */: {
        const tab = await getCurrentTab();
        if (!tab?.id) {
          sendResponse({ cancelled: true, reason: "No active tab" });
          return false;
        }
        try {
          const selectionResult = await sendTabMessage(tab.id, {
            type: "START_SELECTION_MODE" /* START_SELECTION_MODE */
          });
          if (!selectionResult || "cancelled" in selectionResult) {
            sendResponse({ cancelled: true });
            return false;
          }
          const region = selectionResult.payload;
          log("Selection received", region);
          if (isCapturing) {
            sendResponse({ cancelled: true, reason: "Capture already in progress" });
            return false;
          }
          isCapturing = true;
          captureCancelled = false;
          sendToPopup({
            type: "CAPTURE_PROGRESS" /* CAPTURE_PROGRESS */,
            payload: createCaptureProgress("capturing", 0, 1)
          });
          await sendTabMessage(tab.id, { type: "DISABLE_SCROLL_SNAP" /* DISABLE_SCROLL_SNAP */ });
          await delay(50);
          const dimensions = await sendTabMessage(tab.id, {
            type: "GET_PAGE_DIMENSIONS" /* GET_PAGE_DIMENSIONS */
          });
          const dpr = dimensions?.devicePixelRatio ?? 1;
          try {
            await sendTabMessage(tab.id, { type: "HIDE_CAPTURE_OVERLAY" /* HIDE_CAPTURE_OVERLAY */ });
          } catch {
          }
          await delay(50);
          const imageData = await captureViewport("png");
          try {
            await sendTabMessage(tab.id, { type: "SHOW_CAPTURE_OVERLAY" /* SHOW_CAPTURE_OVERLAY */ });
          } catch {
          }
          await sendTabMessage(tab.id, { type: "RESTORE_SCROLL_SNAP" /* RESTORE_SCROLL_SNAP */ });
          try {
            await sendTabMessage(tab.id, { type: "HIDE_CAPTURE_OVERLAY" /* HIDE_CAPTURE_OVERLAY */ });
          } catch {
          }
          const croppedDataUrl = await cropImage(imageData, region, dpr);
          const pageInfo = await sendTabMessage(tab.id, {
            type: "GET_PAGE_INFO" /* GET_PAGE_INFO */
          });
          const imageBlob = await fetch(croppedDataUrl).then((r) => r.blob());
          const thumbnailBlob = await generateThumbnail(imageBlob);
          const thumbnailDataURL = await blobToDataURL(thumbnailBlob);
          const capture = {
            id: generateCaptureId(),
            url: pageInfo?.url ?? "",
            title: pageInfo?.title ?? "Selection Capture",
            imageData: croppedDataUrl,
            thumbnail: thumbnailDataURL,
            timestamp: pageInfo?.timestamp ?? Date.now(),
            format: "png",
            width: region.width,
            height: region.height,
            annotations: []
          };
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
              ocrText: capture.ocrText
            };
            await chrome.storage.local.set({
              [`capture-meta-${capture.id}`]: captureMeta,
              [`capture-data-${capture.id}`]: capture.imageData,
              "capture-ids": capturesCache.map((c) => c.id)
            });
          } catch (storageErr) {
            logError("Failed to persist capture to storage", storageErr);
          }
          sendToPopup({
            type: "CAPTURE_COMPLETE" /* CAPTURE_COMPLETE */,
            payload: { capture }
          });
          sendToPopup({
            type: "CAPTURE_PROGRESS" /* CAPTURE_PROGRESS */,
            payload: createCaptureProgress("complete", 1, 1)
          });
          sendResponse({ started: true });
        } catch (error) {
          logError("Selection capture failed", error);
          try {
            await sendTabMessage(tab.id, { type: "HIDE_CAPTURE_OVERLAY" /* HIDE_CAPTURE_OVERLAY */ });
          } catch {
          }
          try {
            await sendTabMessage(tab.id, { type: "RESTORE_SCROLL_SNAP" /* RESTORE_SCROLL_SNAP */ });
          } catch {
          }
          const errorMessage = error instanceof Error ? error.message : "Selection capture failed";
          sendToPopup({
            type: "CAPTURE_ERROR" /* CAPTURE_ERROR */,
            payload: { error: errorMessage, code: "CAPTURE_FAILED" }
          });
          sendResponse({ cancelled: true, reason: errorMessage });
        } finally {
          isCapturing = false;
          captureCancelled = false;
        }
        return true;
      }
      case "GET_CAPTURES" /* GET_CAPTURES */: {
        getAllCaptures().then((captures) => {
          sendResponse({ captures });
        });
        return true;
      }
      case "GET_FULL_CAPTURE" /* GET_FULL_CAPTURE */: {
        const { id } = message.payload;
        getFullCapture(id).then((capture) => {
          sendResponse(capture);
        });
        return true;
      }
      case "GET_SETTINGS" /* GET_SETTINGS */: {
        sendResponse({
          defaultFormat: "png",
          defaultQuality: 90,
          theme: "dark",
          captureDelay: 100,
          preScrollEnabled: true,
          autoCropEnabled: true,
          smartScrollEnabled: true,
          fixedElementHandling: true
        });
        return false;
      }
      case "UPDATE_SETTINGS" /* UPDATE_SETTINGS */: {
        chrome.storage.local.set({ "user-settings": message.payload }).then(() => sendResponse({ success: true })).catch(() => sendResponse({ success: false }));
        return true;
      }
      case "DELETE_CAPTURE" /* DELETE_CAPTURE */: {
        const { id } = message.payload;
        deleteCaptureById(id).then(() => {
          sendResponse({ deleted: true });
        });
        return true;
      }
      default:
        log("Unknown message type", message.type);
        return false;
    }
  }
);
chrome.commands.onCommand.addListener(async (command) => {
  log("Keyboard command triggered", command);
  switch (command) {
    case "capture-full-page": {
      const tab = await getCurrentTab();
      if (tab?.id) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["src/content/index.js"]
          });
        } catch {
        }
        startFullPageCapture("png", 90, true);
      }
      break;
    }
    case "capture-visible": {
      const tab = await getCurrentTab();
      if (tab?.id) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["src/content/index.js"]
          });
        } catch {
        }
        startVisibleCapture("png", 90);
      }
      break;
    }
  }
});
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    log("SmartCapture Pro installed");
    chrome.storage.local.set({
      "user-settings": {
        defaultFormat: "png",
        defaultQuality: 90,
        theme: "dark",
        captureDelay: 100,
        preScrollEnabled: true,
        autoCropEnabled: true,
        smartScrollEnabled: true,
        fixedElementHandling: true
      }
    });
  } else if (details.reason === "update") {
    log("SmartCapture Pro updated", `Previous version: ${details.previousVersion}`);
  }
});
chrome.runtime.onStartup.addListener(() => {
  log("SmartCapture Pro service worker started");
});
log("Background service worker loaded");
