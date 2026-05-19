// src/offscreen/offscreen.ts
var worker = null;
var currentLang = null;
var isInitializing = false;
var isRecognizing = false;
var initAttempts = 0;
var MAX_INIT_ATTEMPTS = 3;
function log(msg, data) {
  console.log(`[SmartCapture OCR Offscreen] ${msg}`, data !== void 0 ? data : "");
}
function logError(msg, err) {
  console.error(`[SmartCapture OCR Offscreen] ${msg}`, err);
}
function parseParagraphs(data) {
  if (!data.paragraphs || data.paragraphs.length === 0) {
    const textParagraphs = data.text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
    return textParagraphs.map((text) => ({
      text: text.trim(),
      confidence: data.confidence,
      bbox: { x: 0, y: 0, width: 0, height: 0 },
      words: []
    }));
  }
  return data.paragraphs.map((para) => {
    const lines = para.lines || [];
    const allWords = lines.flatMap(
      (line) => (line.words || []).map((word) => ({
        text: word.text,
        confidence: word.confidence,
        bbox: {
          x: word.bbox.x0,
          y: word.bbox.y0,
          width: word.bbox.x1 - word.bbox.x0,
          height: word.bbox.y1 - word.bbox.y0
        }
      }))
    );
    let bbox = { x: 0, y: 0, width: 0, height: 0 };
    if (lines.length > 0) {
      const minX = Math.min(...lines.map((l) => l.bbox.x0));
      const minY = Math.min(...lines.map((l) => l.bbox.y0));
      const maxX = Math.max(...lines.map((l) => l.bbox.x1));
      const maxY = Math.max(...lines.map((l) => l.bbox.y1));
      bbox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    const avgConfidence = allWords.length > 0 ? Math.round(allWords.reduce((sum, w) => sum + w.confidence, 0) / allWords.length) : para.confidence;
    return {
      text: para.text.trim(),
      confidence: avgConfidence,
      bbox,
      words: allWords
    };
  }).filter((p) => p.text.length > 0);
}
function sendStatusUpdate(state, progress, phase, error) {
  try {
    chrome.runtime.sendMessage({
      type: "OCR_STATUS_UPDATE",
      payload: { state, progress, phase, error }
    });
  } catch {
  }
}
function sendProgress(progress, phase) {
  try {
    chrome.runtime.sendMessage({
      type: "OCR_PROGRESS",
      payload: { progress, phase }
    });
  } catch {
  }
}
function sendResult(result) {
  try {
    chrome.runtime.sendMessage({
      type: "OCR_RESULT",
      payload: result
    });
  } catch {
  }
}
function sendError(error) {
  try {
    chrome.runtime.sendMessage({
      type: "OCR_ERROR",
      payload: { error }
    });
  } catch {
  }
}
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms / 1e3}s`));
    }, ms);
    promise.then((result) => {
      clearTimeout(timer);
      resolve(result);
    }).catch((err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
async function verifyTesseractFiles() {
  const requiredFiles = [
    "tesseract/worker.min.js",
    "tesseract/tesseract-core-simd-lstm.wasm.js",
    "tesseract/tesseract-core-simd-lstm.wasm",
    "tesseract/langs/eng.traineddata.gz"
  ];
  const missing = [];
  for (const file of requiredFiles) {
    const url = chrome.runtime.getURL(file);
    try {
      const response = await fetch(url, { method: "HEAD" });
      if (!response.ok) {
        missing.push(`${file} (HTTP ${response.status})`);
        logError(`File check FAILED: ${file} - HTTP ${response.status}`);
      } else {
        log(`File check OK: ${file} (${url})`);
      }
    } catch (err) {
      missing.push(`${file} (fetch error)`);
      logError(`File check FAILED: ${file} - fetch error`, err);
    }
  }
  return { ok: missing.length === 0, missing };
}
function verifyTesseractLoaded() {
  if (typeof Tesseract !== "undefined" && typeof Tesseract.createWorker === "function") {
    log("Tesseract.js library loaded successfully");
    return true;
  }
  logError("Tesseract.js library NOT loaded! The <script> tag may have failed.");
  return false;
}
async function initializeWorker(language = "eng") {
  if (worker && currentLang === language && !isRecognizing) {
    log("Worker already ready, skipping init");
    sendStatusUpdate("ready", 100, "complete");
    return;
  }
  if (isInitializing) {
    log("Worker already initializing, skipping duplicate request");
    return;
  }
  if (worker && currentLang !== language) {
    log("Language changed, terminating old worker");
    try {
      await worker.terminate();
    } catch {
    }
    worker = null;
    currentLang = null;
  }
  isInitializing = true;
  initAttempts++;
  sendStatusUpdate("prewarming", 0, "prewarming");
  log(`Initializing Tesseract worker (attempt ${initAttempts}/${MAX_INIT_ATTEMPTS}) for language: ${language}`);
  try {
    if (!verifyTesseractLoaded()) {
      throw new Error(
        "Tesseract.js library is not loaded. The offscreen.html <script> tag may have failed to load tesseract.min.js. Ensure tesseract/tesseract.min.js exists in the extension files."
      );
    }
    log("Step 1: Verifying Tesseract files are accessible...");
    const fileCheck = await verifyTesseractFiles();
    if (!fileCheck.ok) {
      logError(`Missing Tesseract files: ${fileCheck.missing.join(", ")}`);
    } else {
      log("All Tesseract files verified OK");
    }
    const loggerFn = (m) => {
      const status = m.status;
      const progress = Math.round(m.progress * 100);
      log(`Tesseract status: ${status} ${progress}%`);
      if (status === "loading tesseract core" || status === "initializing tesseract" || status === "initializing api") {
        sendStatusUpdate("prewarming", Math.min(progress, 99), "initializing-worker");
      } else if (status === "loading language traineddata" || status === "loaded language traineddata") {
        sendStatusUpdate("prewarming", Math.min(progress, 99), "loading-language");
      } else if (status === "recognizing text") {
        sendProgress(progress, "recognizing");
      }
    };
    if (fileCheck.ok) {
      log("Strategy 1: Direct Worker with local extension files (workerBlobURL: false)...");
      const workerPath = chrome.runtime.getURL("tesseract/worker.min.js");
      const corePath = chrome.runtime.getURL("tesseract/tesseract-core-simd-lstm.wasm.js");
      const langPath = chrome.runtime.getURL("tesseract/langs/");
      log("  workerPath:", workerPath);
      log("  corePath:", corePath);
      log("  langPath:", langPath);
      try {
        worker = await withTimeout(
          Tesseract.createWorker(language, 1, {
            workerBlobURL: false,
            workerPath,
            corePath,
            langPath,
            logger: loggerFn
          }),
          12e4,
          // 2 minute timeout — WASM compilation can be slow
          "Strategy 1: Direct Worker createWorker"
        );
        log("Strategy 1 SUCCEEDED! Tesseract worker is ready.");
        currentLang = language;
        initAttempts = 0;
        sendStatusUpdate("ready", 100, "complete");
        return;
      } catch (err) {
        logError("Strategy 1 FAILED:", err);
        if (worker) {
          try {
            await worker.terminate();
          } catch {
          }
          worker = null;
        }
      }
    } else {
      log("Skipping Strategy 1 \u2014 tesseract files not accessible");
    }
    log("Strategy 2: CDN worker path with local Worker creation (workerBlobURL: false)...");
    try {
      const localWorkerPath = chrome.runtime.getURL("tesseract/worker.min.js");
      worker = await withTimeout(
        Tesseract.createWorker(language, 1, {
          workerBlobURL: false,
          workerPath: localWorkerPath,
          corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@v5.1.1/tesseract-core-simd-lstm.wasm.js",
          langPath: "https://tessdata.projectnaptha.com/4.0.0/",
          logger: loggerFn
        }),
        18e4,
        // 3 minute timeout — CDN download + WASM compilation
        "Strategy 2: CDN worker path createWorker"
      );
      log("Strategy 2 SUCCEEDED! Tesseract worker is ready (via CDN core/lang).");
      currentLang = language;
      initAttempts = 0;
      sendStatusUpdate("ready", 100, "complete");
      return;
    } catch (err) {
      logError("Strategy 2 FAILED:", err);
      if (worker) {
        try {
          await worker.terminate();
        } catch {
        }
        worker = null;
      }
    }
    log("Strategy 3: Full CDN fallback...");
    try {
      const localWorkerPath = chrome.runtime.getURL("tesseract/worker.min.js");
      if (!localWorkerPath) {
        throw new Error("Cannot get local worker path \u2014 tesseract/worker.min.js not in extension");
      }
      worker = await withTimeout(
        Tesseract.createWorker(language, 1, {
          workerBlobURL: false,
          workerPath: localWorkerPath,
          logger: loggerFn
        }),
        18e4,
        // 3 minute timeout
        "Strategy 3: Full CDN createWorker"
      );
      log("Strategy 3 SUCCEEDED! Tesseract worker is ready (full CDN).");
      currentLang = language;
      initAttempts = 0;
      sendStatusUpdate("ready", 100, "complete");
      return;
    } catch (err) {
      logError("Strategy 3 FAILED:", err);
      if (worker) {
        try {
          await worker.terminate();
        } catch {
        }
        worker = null;
      }
    }
    const errorMsg = `All OCR initialization strategies failed (attempt ${initAttempts}/${MAX_INIT_ATTEMPTS}). Please ensure the extension has access to tesseract files and/or internet connection.`;
    logError(errorMsg);
    sendStatusUpdate("error", 0, "error", errorMsg);
    if (initAttempts < MAX_INIT_ATTEMPTS) {
      const retryDelay = initAttempts * 5e3;
      log(`Scheduling retry in ${retryDelay / 1e3}s...`);
      setTimeout(() => {
        if (!worker && !isInitializing) {
          initializeWorker(language);
        }
      }, retryDelay);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logError("Worker initialization error:", err);
    sendStatusUpdate("error", 0, "error", errorMsg);
  } finally {
    isInitializing = false;
  }
}
async function recognizeImage(imageData, language = "eng") {
  if (isRecognizing) {
    sendError("OCR is already in progress");
    return;
  }
  isRecognizing = true;
  const startTime = Date.now();
  try {
    if (!worker || currentLang !== language) {
      log("Worker not ready, initializing first...");
      await initializeWorker(language);
    }
    if (!worker) {
      sendError("OCR engine failed to initialize. Please try again.");
      return;
    }
    sendProgress(0, "recognizing");
    const result = await withTimeout(
      worker.recognize(imageData),
      18e4,
      // 3 minute timeout for OCR recognition
      "OCR recognize"
    );
    const { data } = result;
    const paragraphs = parseParagraphs(data);
    const wordCount = data.text.split(/\s+/).filter((w) => w.length > 0).length;
    const processingTime = Date.now() - startTime;
    const ocrResult = {
      text: data.text.trim(),
      confidence: Math.round(data.confidence),
      paragraphs,
      wordCount,
      method: "local",
      processingTime
    };
    log(`OCR complete! ${wordCount} words, ${paragraphs.length} paragraphs, ${processingTime}ms`);
    sendResult(ocrResult);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logError("OCR recognition error:", err);
    sendError(errorMsg);
  } finally {
    isRecognizing = false;
  }
}
async function cancelOCR() {
  log("Cancelling OCR...");
  if (worker) {
    try {
      await worker.terminate();
    } catch {
    }
    worker = null;
    currentLang = null;
  }
  isRecognizing = false;
  isInitializing = false;
  initAttempts = 0;
  sendStatusUpdate("idle", 0, "idle");
}
async function reinitializeWorker(language = "eng") {
  log("Reinitializing worker...");
  if (worker) {
    try {
      await worker.terminate();
    } catch {
    }
    worker = null;
    currentLang = null;
  }
  isInitializing = false;
  initAttempts = 0;
  await initializeWorker(language);
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case "OCR_PREWARM": {
      const language = message.payload?.language || "eng";
      log(`Received OCR_PREWARM for language: ${language}`);
      initializeWorker(language);
      sendResponse({ received: true });
      return false;
    }
    case "OCR_RECOGNIZE": {
      const { imageData, language = "eng" } = message.payload || {};
      log("Received OCR_RECOGNIZE");
      recognizeImage(imageData, language);
      sendResponse({ received: true });
      return false;
    }
    case "OCR_GET_STATUS": {
      const status = {
        state: worker ? "ready" : isInitializing ? "prewarming" : "idle",
        language: currentLang,
        isRecognizing
      };
      log("Received OCR_GET_STATUS, responding:", status);
      sendResponse(status);
      return false;
    }
    case "OCR_CANCEL": {
      log("Received OCR_CANCEL");
      cancelOCR().then(() => {
        sendResponse({ cancelled: true });
      });
      return true;
    }
    case "OCR_REINITIALIZE": {
      const language = message.payload?.language || "eng";
      log("Received OCR_REINITIALIZE");
      reinitializeWorker(language).then(() => {
        sendResponse({ reinitializing: true });
      });
      return true;
    }
    case "OCR_PING": {
      sendResponse({
        alive: true,
        workerReady: !!worker,
        isInitializing,
        isRecognizing,
        tesseractLoaded: typeof Tesseract !== "undefined"
      });
      return false;
    }
    default:
      return false;
  }
});
log("Offscreen document loaded. Checking environment...");
log("Chrome extension context:", {
  runtimeId: chrome.runtime.id,
  manifestVersion: chrome.runtime.getManifest().manifest_version
});
if (typeof Tesseract !== "undefined") {
  log("Tesseract.js library detected. Starting engine pre-warm...");
  initializeWorker("eng");
} else {
  logError(
    "Tesseract.js library NOT detected! The <script> tag in offscreen.html may have failed. Ensure tesseract/tesseract.min.js exists in the extension files and is listed in web_accessible_resources."
  );
  sendStatusUpdate("error", 0, "error", "Tesseract.js library failed to load. Check extension files.");
}
