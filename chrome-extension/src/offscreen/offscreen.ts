/**
 * SmartCapture Pro - Offscreen OCR Engine
 *
 * Runs Tesseract.js in a persistent offscreen document.
 * This solves the core problem: Tesseract.js Web Worker + WASM initialization
 * fails/hangs in Chrome extension popups, but works in offscreen documents.
 *
 * KEY FIX: We use workerBlobURL: false (Direct Worker) as the PRIMARY strategy.
 * The Blob Worker approach (workerBlobURL: true) creates a blob with importScripts()
 * which silently hangs in the Chrome extension offscreen context — it never resolves.
 * The Direct Worker creates new Worker(chrome-extension://...) which works correctly.
 *
 * Messaging protocol:
 * - Receives: OCR_PREWARM, OCR_RECOGNIZE, OCR_GET_STATUS, OCR_CANCEL
 * - Sends: OCR_STATUS_UPDATE, OCR_PROGRESS, OCR_RESULT, OCR_ERROR
 */

import { createWorker, Worker as TesseractWorker } from 'tesseract.js';

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

// Tesseract internal types
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

/**
 * Wraps a promise with a timeout. If the promise doesn't resolve within
 * the timeout period, rejects with a timeout error.
 */
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

// ===== Worker Lifecycle =====

/**
 * Initialize the Tesseract worker with the given language.
 *
 * CRITICAL: We use workerBlobURL: false (Direct Worker) as the ONLY strategy.
 * The Blob Worker approach (workerBlobURL: true) creates a blob with
 * importScripts("chrome-extension://...") which silently hangs in the
 * Chrome extension offscreen document context — it never resolves.
 *
 * The Direct Worker creates new Worker(chrome-extension://...) which works
 * correctly because the Worker runs in the extension's context and can
 * load resources from the same origin.
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
    // Build extension resource URLs
    const workerPath = chrome.runtime.getURL('tesseract/worker.min.js');
    const corePath = chrome.runtime.getURL('tesseract/tesseract-core-simd-lstm.wasm.js');
    const langPath = chrome.runtime.getURL('tesseract/langs/');

    log('Extension resource URLs:');
    log('  workerPath:', workerPath);
    log('  corePath:', corePath);
    log('  langPath:', langPath);

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
    // This is the only strategy that works reliably in Chrome extension offscreen documents.
    // workerBlobURL: false creates new Worker(chrome-extension://...) directly.
    log('Attempting Direct Worker strategy (workerBlobURL: false)...');

    try {
      worker = await withTimeout(
        createWorker(language, 1, {
          workerBlobURL: false,
          workerPath,
          corePath,
          langPath,
          logger: loggerFn,
        }),
        90_000, // 90 second timeout for WASM compilation
        'Direct Worker createWorker'
      );

      log('Direct Worker strategy SUCCEEDED!');
      currentLang = language;
      initAttempts = 0; // Reset on success
      sendStatusUpdate('ready', 100, 'complete');
      log('Tesseract worker is READY — OCR can be performed instantly!');
      return;
    } catch (directErr) {
      logError('Direct Worker strategy failed:', directErr);
      // Clean up the failed worker
      if (worker) {
        try { await worker.terminate(); } catch { /* ignore */ }
        worker = null;
      }
    }

    // STRATEGY 2: CDN Fallback
    // Uses the CDN-hosted Tesseract files. Works if internet is available.
    // This is a last resort — it's slower but more likely to succeed.
    log('Attempting CDN Fallback strategy...');

    try {
      worker = await withTimeout(
        createWorker(language, 1, {
          logger: loggerFn,
        }),
        120_000, // 2 minute timeout — CDN is slower
        'CDN Fallback createWorker'
      );

      log('CDN Fallback strategy SUCCEEDED!');
      currentLang = language;
      initAttempts = 0;
      sendStatusUpdate('ready', 100, 'complete');
      log('Tesseract worker is READY (via CDN) — OCR can be performed!');
      return;
    } catch (cdnErr) {
      logError('CDN Fallback strategy failed:', cdnErr);
      if (worker) {
        try { await worker.terminate(); } catch { /* ignore */ }
        worker = null;
      }
    }

    // All strategies failed
    const errorMsg = `All initialization strategies failed (attempt ${initAttempts}/${MAX_INIT_ATTEMPTS}). ` +
      'The Direct Worker and CDN strategies both failed. ' +
      'Please ensure the extension has access to tesseract files and/or internet.';
    logError(errorMsg);
    sendStatusUpdate('error', 0, 'error', errorMsg);

    // If we haven't exceeded max retries, schedule a retry
    if (initAttempts < MAX_INIT_ATTEMPTS) {
      const retryDelay = initAttempts * 5000; // 5s, 10s, 15s
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
      sendResponse({ alive: true, workerReady: !!worker, isInitializing, isRecognizing });
      return false;
    }

    default:
      // Not an OCR message, ignore
      return false;
  }
});

// ===== Auto Pre-warm on Load =====

log('Offscreen document loaded. Pre-warming Tesseract engine...');
log('Chrome extension context:', {
  runtimeId: chrome.runtime.id,
  manifestVersion: chrome.runtime.getManifest().manifest_version,
});

// Start initialization immediately — the engine will be ready when the user needs it
initializeWorker('eng');
