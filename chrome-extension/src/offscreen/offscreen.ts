/**
 * SmartCapture Pro - Offscreen OCR Engine
 *
 * Runs Tesseract.js in a persistent offscreen document.
 * This solves the core problem: Tesseract.js Web Worker + WASM initialization
 * fails/hangs in Chrome extension popups, but works perfectly in offscreen documents.
 *
 * Benefits:
 * - Engine persists across popup sessions (no re-initialization)
 * - Full HTML page context (Web Workers + WASM work properly)
 * - Pre-warmed on extension install (instant OCR when user needs it)
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

// ===== Logging =====

function log(msg: string, data?: unknown): void {
  console.log(`[SmartCapture OCR Offscreen] ${msg}`, data ?? '');
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

// ===== Worker Lifecycle =====

/**
 * Initialize the Tesseract worker with the given language.
 * Tries multiple strategies to handle different Chrome extension contexts.
 */
async function initializeWorker(language: string = 'eng'): Promise<void> {
  // Already ready with the same language
  if (worker && currentLang === language && !isRecognizing) {
    log('Worker already ready, skipping init');
    sendStatusUpdate('ready', 100, 'complete');
    return;
  }

  // Already initializing
  if (isInitializing) {
    log('Worker already initializing, skipping');
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
  sendStatusUpdate('prewarming', 0, 'prewarming');
  log(`Initializing Tesseract worker for language: ${language}`);

  try {
    // Strategy 1: Blob Worker with local extension files
    // This creates a Worker from a Blob containing importScripts(workerPath).
    // Blob Workers can importScripts from chrome-extension:// URLs.
    const strategies: Array<{
      name: string;
      options: Record<string, unknown>;
    }> = [
      {
        name: 'Blob Worker (local extension files)',
        options: {
          workerBlobURL: true,
          workerPath: chrome.runtime.getURL('tesseract/worker.min.js'),
          corePath: chrome.runtime.getURL('tesseract/tesseract-core-simd-lstm.wasm.js'),
          langPath: chrome.runtime.getURL('tesseract/langs/'),
        },
      },
      {
        name: 'Direct Worker (local extension files)',
        options: {
          workerBlobURL: false,
          workerPath: chrome.runtime.getURL('tesseract/worker.min.js'),
          corePath: chrome.runtime.getURL('tesseract/tesseract-core-simd-lstm.wasm.js'),
          langPath: chrome.runtime.getURL('tesseract/langs/'),
        },
      },
      {
        // CDN fallback — works if internet is available
        name: 'CDN Default',
        options: {},
      },
    ];

    let lastError: unknown = null;

    for (const strategy of strategies) {
      log(`Trying strategy: ${strategy.name}`);

      try {
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

        worker = await createWorker(language, 1, {
          ...strategy.options,
          logger: loggerFn,
        });

        log(`Strategy "${strategy.name}" succeeded!`);
        currentLang = language;
        sendStatusUpdate('ready', 100, 'complete');
        log('Tesseract worker is ready!');
        return;
      } catch (err) {
        logError(`Strategy "${strategy.name}" failed:`, err);
        lastError = err;
        // Continue to next strategy
      }
    }

    // All strategies failed
    const errorMsg = lastError instanceof Error ? lastError.message : String(lastError);
    logError(`All strategies failed. Last error: ${errorMsg}`);
    sendStatusUpdate('error', 0, 'error', errorMsg);
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
      await initializeWorker(language);
    }

    if (!worker) {
      sendError('OCR engine failed to initialize. Please try again.');
      return;
    }

    sendProgress(0, 'recognizing');

    const result = await worker.recognize(imageData) as TesseractRecognizeResult;
    const { data } = result;

    // Parse structured results
    const paragraphs = parseParagraphs(data);
    const wordCount = data.text
      .split(/\s+/)
      .filter((w: string) => w.length > 0).length;

    const ocrResult: OCRResultPayload = {
      text: data.text.trim(),
      confidence: Math.round(data.confidence),
      paragraphs,
      wordCount,
      method: 'local',
    };

    log(`OCR complete! ${wordCount} words, ${paragraphs.length} paragraphs, ${Date.now() - startTime}ms`);
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
  sendStatusUpdate('idle', 0, 'idle');
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
      log(`Received OCR_RECOGNIZE`);
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
      log(`Received OCR_GET_STATUS, responding:`, status);
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

    default:
      // Not an OCR message, ignore
      return false;
  }
});

// ===== Auto Pre-warm on Load =====

log('Offscreen document loaded. Pre-warming Tesseract engine...');
initializeWorker('eng');
