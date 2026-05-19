/**
 * SmartCapture Pro - Offscreen OCR Engine (v2)
 *
 * Runs Tesseract.js in a persistent offscreen document.
 * 
 * KEY FIXES from v1:
 * 1. Tesseract.js is loaded via <script> tag in HTML (not bundled) — avoids
 *    bundling issues and reduces offscreen.js from 59KB to ~5KB
 * 2. Worker is created with workerBlobURL: false AND we verify files exist first
 * 3. CDN fallback also uses workerBlobURL: false (v1 used default true, which
 *    creates a Blob Worker with importScripts that hangs in Chrome extensions)
 * 4. Pre-flight checks verify tesseract files are accessible before init
 * 5. Comprehensive logging at every step for debugging
 *
 * Messaging protocol:
 * - Receives: OCR_PREWARM, OCR_RECOGNIZE, OCR_GET_STATUS, OCR_CANCEL
 * - Sends: OCR_STATUS_UPDATE, OCR_PROGRESS, OCR_RESULT, OCR_ERROR
 */

// ===== Types =====

interface OCRParagraph {
  text: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  words: Array<{
    text: string;
    confidence: number;
    bbox: { x: number; y: number; width: number; height: number };
  }>;
}

interface OCRResultPayload {
  text: string;
  confidence: number;
  paragraphs: OCRParagraph[];
  wordCount: number;
  method: 'local';
  processingTime?: number;
}

// Tesseract internal types (from the global Tesseract object)
interface TesseractLine {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  words: Array<{
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
  }>;
}

interface TesseractParagraph {
  text: string;
  confidence: number;
  lines: TesseractLine[];
}

interface TesseractData {
  text: string;
  confidence: number;
  paragraphs: TesseractParagraph[];
}

interface TesseractRecognizeResult {
  data: TesseractData;
}

// Global Tesseract type (loaded via script tag)
declare const Tesseract: {
  createWorker: (
    langs?: string | string[],
    oem?: number,
    options?: Record<string, unknown>,
    config?: Record<string, unknown>
  ) => Promise<TesseractWorker>;
};

interface TesseractWorker {
  recognize: (image: string | Blob | ArrayBuffer | Uint8Array) => Promise<TesseractRecognizeResult>;
  terminate: () => Promise<void>;
}

// ===== State =====

let worker: TesseractWorker | null = null;
let currentLang: string | null = null;
let isInitializing = false;
let isRecognizing = false;
let initAttempts = 0;
const MAX_INIT_ATTEMPTS = 3;

// ===== Logging =====

function log(msg: string, data?: unknown): void {
  console.log(`[SmartCapture OCR Offscreen] ${msg}`, data !== undefined ? data : '');
}

function logError(msg: string, err?: unknown): void {
  console.error(`[SmartCapture OCR Offscreen] ${msg}`, err);
}

// ===== Helper Functions =====

function parseParagraphs(data: TesseractData): OCRParagraph[] {
  if (!data.paragraphs || data.paragraphs.length === 0) {
    const textParagraphs = data.text
      .split(/\n\s*\n/)
      .filter((p) => p.trim().length > 0);

    return textParagraphs.map((text) => ({
      text: text.trim(),
      confidence: data.confidence,
      bbox: { x: 0, y: 0, width: 0, height: 0 },
      words: [],
    }));
  }

  return data.paragraphs
    .map((para): OCRParagraph => {
      const lines = para.lines || [];
      const allWords = lines.flatMap((line) =>
        (line.words || []).map((word) => ({
          text: word.text,
          confidence: word.confidence,
          bbox: {
            x: word.bbox.x0,
            y: word.bbox.y0,
            width: word.bbox.x1 - word.bbox.x0,
            height: word.bbox.y1 - word.bbox.y0,
          },
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

      const avgConfidence =
        allWords.length > 0
          ? Math.round(allWords.reduce((sum, w) => sum + w.confidence, 0) / allWords.length)
          : para.confidence;

      return {
        text: para.text.trim(),
        confidence: avgConfidence,
        bbox,
        words: allWords,
      };
    })
    .filter((p) => p.text.length > 0);
}

// ===== Message Sending =====

function sendStatusUpdate(
  state: 'idle' | 'prewarming' | 'ready' | 'error',
  progress: number,
  phase: string,
  error?: string
): void {
  try {
    chrome.runtime.sendMessage({
      type: 'OCR_STATUS_UPDATE',
      payload: { state, progress, phase, error },
    });
  } catch {
    // Receiving end may not exist (popup closed)
  }
}

function sendProgress(progress: number, phase: string): void {
  try {
    chrome.runtime.sendMessage({
      type: 'OCR_PROGRESS',
      payload: { progress, phase },
    });
  } catch {
    // Receiving end may not exist
  }
}

function sendResult(result: OCRResultPayload): void {
  try {
    chrome.runtime.sendMessage({
      type: 'OCR_RESULT',
      payload: result,
    });
  } catch {
    // Receiving end may not exist
  }
}

function sendError(error: string): void {
  try {
    chrome.runtime.sendMessage({
      type: 'OCR_ERROR',
      payload: { error },
    });
  } catch {
    // Receiving end may not exist
  }
}

// ===== Timeout Wrapper =====

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms / 1000}s`));
    }, ms);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// ===== Pre-flight Checks =====

/**
 * Verify that the Tesseract files are accessible from the extension.
 * Returns true if all required files exist, false otherwise.
 */
async function verifyTesseractFiles(): Promise<{ ok: boolean; missing: string[] }> {
  const requiredFiles = [
    'tesseract/worker.min.js',
    'tesseract/tesseract-core-simd-lstm.wasm.js',
    'tesseract/tesseract-core-simd-lstm.wasm',
    'tesseract/langs/eng.traineddata.gz',
  ];

  const missing: string[] = [];

  for (const file of requiredFiles) {
    const url = chrome.runtime.getURL(file);
    try {
      const response = await fetch(url, { method: 'HEAD' });
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

/**
 * Verify that the global Tesseract object is available.
 */
function verifyTesseractLoaded(): boolean {
  if (typeof Tesseract !== 'undefined' && typeof Tesseract.createWorker === 'function') {
    log('Tesseract.js library loaded successfully');
    return true;
  }
  logError('Tesseract.js library NOT loaded! The <script> tag may have failed.');
  return false;
}

// ===== Worker Lifecycle =====

/**
 * Initialize the Tesseract worker.
 *
 * CRITICAL INSIGHT about Chrome extension Workers:
 * 
 * 1. workerBlobURL: true (default) creates a Blob with importScripts("url") — 
 *    this HANGS silently in Chrome extension offscreen Workers because importScripts
 *    from a Blob URL doesn't work with chrome-extension:// URLs.
 * 
 * 2. workerBlobURL: false creates new Worker(url) directly — this works because
 *    the Worker runs in the extension's context and can load resources from the
 *    same origin. The Worker can then use importScripts inside itself to load
 *    the core WASM files from chrome-extension:// URLs.
 * 
 * 3. CDN URLs with new Worker(cdnUrl) are BLOCKED by Chrome extension CSP.
 *    We can only use CDN for the workerPath parameter (which the internal Worker
 *    loads via importScripts), not for the Worker URL itself.
 */
async function initializeWorker(language: string = 'eng'): Promise<void> {
  // Already ready with the same language
  if (worker && currentLang === language && !isRecognizing) {
    log('Worker already ready, skipping init');
    sendStatusUpdate('ready', 100, 'complete');
    return;
  }

  // Already initializing — don't start a second init
  if (isInitializing) {
    log('Worker already initializing, skipping duplicate request');
    return;
  }

  // Terminate old worker if language changed
  if (worker && currentLang !== language) {
    log('Language changed, terminating old worker');
    try {
      await worker.terminate();
    } catch {
      // Worker may already be terminated
    }
    worker = null;
    currentLang = null;
  }

  isInitializing = true;
  initAttempts++;
  sendStatusUpdate('prewarming', 0, 'prewarming');
  log(`Initializing Tesseract worker (attempt ${initAttempts}/${MAX_INIT_ATTEMPTS}) for language: ${language}`);

  try {
    // Step 0: Verify Tesseract library is loaded
    if (!verifyTesseractLoaded()) {
      throw new Error(
        'Tesseract.js library is not loaded. The offscreen.html <script> tag may have failed to load tesseract.min.js. ' +
        'Ensure tesseract/tesseract.min.js exists in the extension files.'
      );
    }

    // Step 1: Verify tesseract files are accessible
    log('Step 1: Verifying Tesseract files are accessible...');
    const fileCheck = await verifyTesseractFiles();
    if (!fileCheck.ok) {
      logError(`Missing Tesseract files: ${fileCheck.missing.join(', ')}`);
      // Don't throw — we'll try CDN fallback
    } else {
      log('All Tesseract files verified OK');
    }

    // Logger function to track Tesseract's internal progress
    const loggerFn = (m: { status: string; progress: number }) => {
      const status = m.status;
      const progress = Math.round(m.progress * 100);
      log(`Tesseract status: ${status} ${progress}%`);

      if (
        status === 'loading tesseract core' ||
        status === 'initializing tesseract' ||
        status === 'initializing api'
      ) {
        sendStatusUpdate('prewarming', Math.min(progress, 99), 'initializing-worker');
      } else if (
        status === 'loading language traineddata' ||
        status === 'loaded language traineddata'
      ) {
        sendStatusUpdate('prewarming', Math.min(progress, 99), 'loading-language');
      } else if (status === 'recognizing text') {
        sendProgress(progress, 'recognizing');
      }
    };

    // STRATEGY 1: Direct Worker with local extension files (PRIMARY)
    // workerBlobURL: false creates new Worker(chrome-extension://...) directly.
    // This is the ONLY strategy that works reliably in Chrome extension offscreen documents.
    if (fileCheck.ok) {
      log('Strategy 1: Direct Worker with local extension files (workerBlobURL: false)...');

      const workerPath = chrome.runtime.getURL('tesseract/worker.min.js');
      const corePath = chrome.runtime.getURL('tesseract/tesseract-core-simd-lstm.wasm.js');
      const langPath = chrome.runtime.getURL('tesseract/langs/');

      log('  workerPath:', workerPath);
      log('  corePath:', corePath);
      log('  langPath:', langPath);

      try {
        worker = await withTimeout(
          Tesseract.createWorker(language, 1, {
            workerBlobURL: false,
            workerPath,
            corePath,
            langPath,
            logger: loggerFn,
          }),
          120_000, // 2 minute timeout — WASM compilation can be slow
          'Strategy 1: Direct Worker createWorker'
        );

        log('Strategy 1 SUCCEEDED! Tesseract worker is ready.');
        currentLang = language;
        initAttempts = 0;
        sendStatusUpdate('ready', 100, 'complete');
        return;
      } catch (err) {
        logError('Strategy 1 FAILED:', err);
        if (worker) {
          try { await worker.terminate(); } catch { /* ignore */ }
          worker = null;
        }
      }
    } else {
      log('Skipping Strategy 1 — tesseract files not accessible');
    }

    // STRATEGY 2: CDN Worker Path with workerBlobURL: false
    // Uses CDN for workerPath, corePath, and langPath, but still creates the
    // Worker from a local file (not a Blob URL). This works because:
    // - The Worker is created from chrome-extension:// URL (same-origin, allowed by CSP)
    // - Inside the Worker, importScripts loads from CDN (allowed because importScripts
    //   in a Worker can load cross-origin scripts)
    log('Strategy 2: CDN worker path with local Worker creation (workerBlobURL: false)...');

    try {
      // Get the local worker script path (must be local for Worker creation)
      const localWorkerPath = chrome.runtime.getURL('tesseract/worker.min.js');

      worker = await withTimeout(
        Tesseract.createWorker(language, 1, {
          workerBlobURL: false,
          workerPath: localWorkerPath,
          corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@v5.1.1/tesseract-core-simd-lstm.wasm.js',
          langPath: 'https://tessdata.projectnaptha.com/4.0.0/',
          logger: loggerFn,
        }),
        180_000, // 3 minute timeout — CDN download + WASM compilation
        'Strategy 2: CDN worker path createWorker'
      );

      log('Strategy 2 SUCCEEDED! Tesseract worker is ready (via CDN core/lang).');
      currentLang = language;
      initAttempts = 0;
      sendStatusUpdate('ready', 100, 'complete');
      return;
    } catch (err) {
      logError('Strategy 2 FAILED:', err);
      if (worker) {
        try { await worker.terminate(); } catch { /* ignore */ }
        worker = null;
      }
    }

    // STRATEGY 3: Full CDN fallback with workerBlobURL: false
    // Last resort — use CDN for everything. We still use workerBlobURL: false
    // because the Blob Worker approach hangs in Chrome extensions.
    // NOTE: This requires the local worker.min.js to exist (for Worker creation),
    // but uses CDN for core and language data.
    log('Strategy 3: Full CDN fallback...');

    try {
      const localWorkerPath = chrome.runtime.getURL('tesseract/worker.min.js');
      
      if (!localWorkerPath) {
        throw new Error('Cannot get local worker path — tesseract/worker.min.js not in extension');
      }

      worker = await withTimeout(
        Tesseract.createWorker(language, 1, {
          workerBlobURL: false,
          workerPath: localWorkerPath,
          logger: loggerFn,
        }),
        180_000, // 3 minute timeout
        'Strategy 3: Full CDN createWorker'
      );

      log('Strategy 3 SUCCEEDED! Tesseract worker is ready (full CDN).');
      currentLang = language;
      initAttempts = 0;
      sendStatusUpdate('ready', 100, 'complete');
      return;
    } catch (err) {
      logError('Strategy 3 FAILED:', err);
      if (worker) {
        try { await worker.terminate(); } catch { /* ignore */ }
        worker = null;
      }
    }

    // All strategies failed
    const errorMsg = `All OCR initialization strategies failed (attempt ${initAttempts}/${MAX_INIT_ATTEMPTS}). ` +
      'Please ensure the extension has access to tesseract files and/or internet connection.';
    logError(errorMsg);
    sendStatusUpdate('error', 0, 'error', errorMsg);

    // Schedule retry if we haven't exceeded max attempts
    if (initAttempts < MAX_INIT_ATTEMPTS) {
      const retryDelay = initAttempts * 5000;
      log(`Scheduling retry in ${retryDelay / 1000}s...`);
      setTimeout(() => {
        if (!worker && !isInitializing) {
          initializeWorker(language);
        }
      }, retryDelay);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logError('Worker initialization error:', err);
    sendStatusUpdate('error', 0, 'error', errorMsg);
  } finally {
    isInitializing = false;
  }
}

/**
 * Run OCR recognition on an image.
 */
async function recognizeImage(imageData: string, language: string = 'eng'): Promise<void> {
  if (isRecognizing) {
    sendError('OCR is already in progress');
    return;
  }

  isRecognizing = true;
  const startTime = Date.now();

  try {
    // Ensure worker is ready
    if (!worker || currentLang !== language) {
      log('Worker not ready, initializing first...');
      await initializeWorker(language);
    }

    if (!worker) {
      sendError('OCR engine failed to initialize. Please try again.');
      return;
    }

    sendProgress(0, 'recognizing');

    const result = await withTimeout(
      worker.recognize(imageData) as Promise<TesseractRecognizeResult>,
      180_000, // 3 minute timeout for OCR recognition
      'OCR recognize'
    );

    const { data } = result;

    // Parse structured results
    const paragraphs = parseParagraphs(data);
    const wordCount = data.text
      .split(/\s+/)
      .filter((w: string) => w.length > 0).length;

    const processingTime = Date.now() - startTime;

    const ocrResult: OCRResultPayload = {
      text: data.text.trim(),
      confidence: Math.round(data.confidence),
      paragraphs,
      wordCount,
      method: 'local',
      processingTime,
    };

    log(`OCR complete! ${wordCount} words, ${paragraphs.length} paragraphs, ${processingTime}ms`);
    sendResult(ocrResult);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logError('OCR recognition error:', err);
    sendError(errorMsg);
  } finally {
    isRecognizing = false;
  }
}

/**
 * Cancel ongoing OCR and terminate the worker.
 */
async function cancelOCR(): Promise<void> {
  log('Cancelling OCR...');

  if (worker) {
    try {
      await worker.terminate();
    } catch {
      // Worker may already be terminated
    }
    worker = null;
    currentLang = null;
  }

  isRecognizing = false;
  isInitializing = false;
  initAttempts = 0;
  sendStatusUpdate('idle', 0, 'idle');
}

/**
 * Reinitialize the worker if it's in an error state.
 */
async function reinitializeWorker(language: string = 'eng'): Promise<void> {
  log('Reinitializing worker...');
  if (worker) {
    try {
      await worker.terminate();
    } catch { /* ignore */ }
    worker = null;
    currentLang = null;
  }
  isInitializing = false;
  initAttempts = 0;
  await initializeWorker(language);
}

// ===== Message Listener =====

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'OCR_PREWARM': {
      const language = message.payload?.language || 'eng';
      log(`Received OCR_PREWARM for language: ${language}`);
      initializeWorker(language);
      sendResponse({ received: true });
      return false;
    }

    case 'OCR_RECOGNIZE': {
      const { imageData, language = 'eng' } = message.payload || {};
      log('Received OCR_RECOGNIZE');
      recognizeImage(imageData, language);
      sendResponse({ received: true });
      return false;
    }

    case 'OCR_GET_STATUS': {
      const status = {
        state: worker ? 'ready' : isInitializing ? 'prewarming' : 'idle',
        language: currentLang,
        isRecognizing,
      };
      log('Received OCR_GET_STATUS, responding:', status);
      sendResponse(status);
      return false;
    }

    case 'OCR_CANCEL': {
      log('Received OCR_CANCEL');
      cancelOCR().then(() => {
        sendResponse({ cancelled: true });
      });
      return true; // async response
    }

    case 'OCR_REINITIALIZE': {
      const language = message.payload?.language || 'eng';
      log('Received OCR_REINITIALIZE');
      reinitializeWorker(language).then(() => {
        sendResponse({ reinitializing: true });
      });
      return true; // async response
    }

    case 'OCR_PING': {
      // Simple health check — used by background to verify offscreen is alive
      sendResponse({
        alive: true,
        workerReady: !!worker,
        isInitializing,
        isRecognizing,
        tesseractLoaded: typeof Tesseract !== 'undefined',
      });
      return false;
    }

    default:
      // Not an OCR message, ignore
      return false;
  }
});

// ===== Auto Pre-warm on Load =====

log('Offscreen document loaded. Checking environment...');
log('Chrome extension context:', {
  runtimeId: chrome.runtime.id,
  manifestVersion: chrome.runtime.getManifest().manifest_version,
});

// Check if Tesseract library loaded via <script> tag
if (typeof Tesseract !== 'undefined') {
  log('Tesseract.js library detected. Starting engine pre-warm...');
  // Start initialization immediately — the engine will be ready when the user needs it
  initializeWorker('eng');
} else {
  logError(
    'Tesseract.js library NOT detected! The <script> tag in offscreen.html may have failed. ' +
    'Ensure tesseract/tesseract.min.js exists in the extension files and is listed in web_accessible_resources.'
  );
  sendStatusUpdate('error', 0, 'error', 'Tesseract.js library failed to load. Check extension files.');
}
