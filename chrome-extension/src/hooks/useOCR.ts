import { useState, useCallback, useRef, useEffect } from 'react';
import { createWorker, Worker } from 'tesseract.js';

// ===== OCR Types =====

export interface OCRWord {
  text: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
}

export interface OCRParagraph {
  text: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  words: OCRWord[];
}

export interface OCRResult {
  text: string;
  confidence: number;
  paragraphs: OCRParagraph[];
  wordCount: number;
  processingTime: number;
  method?: 'server' | 'local';
}

export type OCRMode = 'auto' | 'server' | 'local';

/** Detailed phase of the OCR process for granular progress feedback */
export type OCRPhase =
  | 'idle'
  | 'initializing-worker'
  | 'loading-language'
  | 'recognizing'
  | 'complete'
  | 'error';

interface UseOCRReturn {
  isProcessing: boolean;
  progress: number;
  result: OCRResult | null;
  error: string | null;
  mode: OCRMode;
  phase: OCRPhase;
  extractText: (imageData: string | Blob, language?: string, preferredMode?: OCRMode) => Promise<OCRResult>;
  cancel: () => Promise<void>;
  clearResult: () => void;
}

// ===== Tesseract internal types (subset we need) =====

interface TesseractLine {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  words: TesseractWord[];
}

interface TesseractWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
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

// ===== Environment Detection =====

function isChromeExtension(): boolean {
  try {
    return !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL);
  } catch {
    return false;
  }
}

/** Server URL for the VLM OCR API */
function getServerOCREndpoint(): string {
  if (isChromeExtension()) {
    return 'http://localhost:3000/api/ocr';
  }
  return '/api/ocr';
}

// ===== Helper Functions =====

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Extract a meaningful error message from ANY thrown value.
 */
function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message || err.toString();
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
    return `DOMException [${err.name}]: ${err.message}`;
  }
  if (typeof err === 'string') return err;
  if (typeof err === 'number') return `Error code: ${err}`;
  if (err !== null && err !== undefined && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    for (const key of ['message', 'error', 'statusText', 'description']) {
      const val = obj[key];
      if (val && typeof val === 'string') return val;
    }
    try {
      const str = typeof obj.toString === 'function' ? obj.toString() : '';
      if (str && str !== '[object Object]') return str;
    } catch { /* ignore */ }
    try {
      const json = JSON.stringify(err);
      if (json && json !== '{}') return json;
    } catch { /* circular reference */ }
  }
  if (err === null) return 'null error';
  if (err === undefined) return 'undefined error';
  return `Unknown OCR error (${typeof err})`;
}

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
        (line.words || []).map((word): OCRWord => ({
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

// ===== Tesseract Worker Manager (singleton) =====

class TesseractWorkerManager {
  private worker: Worker | null = null;
  private currentLang: string | null = null;
  private initializing: Promise<Worker> | null = null;
  private _isTerminated = false;

  // Shorter timeouts — Tesseract in Chrome extensions often hangs,
  // so we fail fast and fall back to server
  private static PER_STRATEGY_TIMEOUT = 30_000; // 30s per strategy attempt
  private static RECOGNIZE_TIMEOUT = 60_000; // 60s for recognition

  get isReady(): boolean {
    return this.worker !== null && !this._isTerminated;
  }

  /**
   * Get or create a Tesseract worker. Reuses existing worker if language matches.
   */
  async getWorker(
    language: string = 'eng',
    onPhase?: (phase: OCRPhase, progress: number) => void
  ): Promise<Worker> {
    // If already initialized with the same language, reuse
    if (this.worker && !this._isTerminated && this.currentLang === language) {
      console.log('[SmartCapture OCR] Reusing existing worker');
      return this.worker;
    }

    // If initialization is already in progress, wait for it
    if (this.initializing) {
      console.log('[SmartCapture OCR] Waiting for existing initialization...');
      return this.initializing;
    }

    // Terminate old worker if language changed
    if (this.worker && this.currentLang !== language) {
      console.log('[SmartCapture OCR] Language changed, terminating old worker');
      await this.terminate();
    }

    // Try multiple strategies for worker creation
    this.initializing = this._tryCreateWorkerStrategies(language, onPhase);

    try {
      this.worker = await this._withTimeout(
        this.initializing,
        TesseractWorkerManager.PER_STRATEGY_TIMEOUT,
        `Tesseract initialization timed out after ${TesseractWorkerManager.PER_STRATEGY_TIMEOUT / 1000}s. This is common in Chrome extensions — try "AI Vision" mode instead.`
      );
      this.currentLang = language;
      this._isTerminated = false;
      console.log('[SmartCapture OCR] Worker created successfully');
      return this.worker;
    } catch (err) {
      console.error('[SmartCapture OCR] All worker creation strategies failed:', err);
      this.worker = null;
      this.currentLang = null;
      this.initializing = null;
      throw err;
    } finally {
      this.initializing = null;
    }
  }

  /**
   * Try multiple strategies to create a Tesseract worker.
   * Each strategy has its own timeout so we fail fast.
   */
  private async _tryCreateWorkerStrategies(
    language: string,
    onPhase?: (phase: OCRPhase, progress: number) => void
  ): Promise<Worker> {
    const isExtension = isChromeExtension();

    // Define strategies in order of preference
    const strategies: Array<{ name: string; options: Record<string, unknown> }> = [];

    if (isExtension) {
      // Strategy 1: Chrome Extension with local bundled files + workerBlobURL=false
      strategies.push({
        name: 'Extension Local Files (workerBlobURL=false)',
        options: {
          workerBlobURL: false,
          workerPath: chrome.runtime.getURL('tesseract/worker.min.js'),
          corePath: chrome.runtime.getURL('tesseract/tesseract-core-simd-lstm.wasm.js'),
          langPath: chrome.runtime.getURL('tesseract/langs/'),
        },
      });
    }

    // Strategy 2: Local public files with workerBlobURL=false (for web app context)
    if (!isExtension) {
      strategies.push({
        name: 'Public Local Files (workerBlobURL=false)',
        options: {
          workerBlobURL: false,
          workerPath: '/tesseract/worker.min.js',
          corePath: '/tesseract/tesseract-core-simd-lstm.wasm.js',
          langPath: '/tesseract/langs/',
        },
      });
    }

    // Strategy 3: Default CDN approach (works in regular web pages without CSP)
    strategies.push({
      name: 'CDN Default (workerBlobURL=true)',
      options: {},
    });

    let lastError: unknown = null;

    for (const strategy of strategies) {
      console.log(`[SmartCapture OCR] Trying strategy: ${strategy.name}`);
      onPhase?.('initializing-worker', 5);

      try {
        const loggerFn = (m: { status: string; progress: number }) => {
          const status = m.status;
          const progress = Math.round(m.progress * 100);

          if (
            status === 'loading tesseract core' ||
            status === 'initializing tesseract' ||
            status === 'initializing api'
          ) {
            onPhase?.('initializing-worker', Math.min(progress, 99));
          } else if (
            status === 'loading language traineddata' ||
            status === 'loaded language traineddata'
          ) {
            onPhase?.('loading-language', Math.min(progress, 99));
          } else if (status === 'recognizing text') {
            onPhase?.('recognizing', progress);
          }
        };

        const worker = await createWorker(language, 1, {
          ...strategy.options,
          logger: loggerFn,
        });

        console.log(`[SmartCapture OCR] Strategy "${strategy.name}" succeeded`);
        onPhase?.('loading-language', 100);
        return worker;
      } catch (err) {
        console.warn(
          `[SmartCapture OCR] Strategy "${strategy.name}" failed:`,
          extractErrorMessage(err)
        );
        lastError = err;
        // Continue to next strategy
      }
    }

    // All strategies failed
    throw new Error(
      `Tesseract.js failed to initialize after trying ${strategies.length} strategies. ` +
      `Last error: ${extractErrorMessage(lastError)}. ` +
      `This is a known issue in Chrome extensions. Please use "AI Vision" mode instead, which is faster and more reliable.`
    );
  }

  /**
   * Run OCR recognition with a timeout.
   */
  async recognize(imageData: string): Promise<TesseractRecognizeResult> {
    if (!this.worker) {
      throw new Error('Worker not initialized. Call getWorker() first.');
    }

    const result = await this._withTimeout(
      this.worker.recognize(imageData) as Promise<TesseractRecognizeResult>,
      TesseractWorkerManager.RECOGNIZE_TIMEOUT,
      `OCR recognition timed out after ${TesseractWorkerManager.RECOGNIZE_TIMEOUT / 1000}s`
    );

    return result;
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.terminate();
      } catch {
        // Worker may already be terminated
      }
    }
    this.worker = null;
    this.currentLang = null;
    this._isTerminated = true;
    this.initializing = null;
  }

  private _withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), ms);
      promise.then(
        (val) => { clearTimeout(timer); resolve(val); },
        (err) => { clearTimeout(timer); reject(err); }
      );
    });
  }
}

// Global singleton — survives across component re-renders
let workerManager: TesseractWorkerManager | null = null;

function getWorkerManager(): TesseractWorkerManager {
  if (!workerManager) {
    workerManager = new TesseractWorkerManager();
  }
  return workerManager;
}

// ===== Server-side OCR via VLM API =====

async function extractTextViaServer(
  imageData: string,
  language: string = 'eng'
): Promise<OCRResult> {
  const startTime = Date.now();
  const endpoint = getServerOCREndpoint();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageData, language }),
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorMsg = `Server OCR failed (HTTP ${response.status})`;
      try {
        const errorData = await response.json();
        if (errorData.error) errorMsg = errorData.error;
      } catch { /* Response body not JSON */ }
      throw new Error(errorMsg);
    }

    const result = await response.json();
    return {
      ...result,
      processingTime: Date.now() - startTime,
      method: 'server',
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ===== Local OCR via Tesseract.js (with worker reuse) =====

async function extractTextViaTesseract(
  imageData: string,
  language: string = 'eng',
  onPhase?: (phase: OCRPhase, progress: number) => void
): Promise<OCRResult> {
  const startTime = Date.now();
  const manager = getWorkerManager();

  // Phase 1 & 2: Initialize worker + load language (reuses existing if available)
  onPhase?.('initializing-worker', 0);
  const worker = await manager.getWorker(language, onPhase);
  onPhase?.('loading-language', 100);

  // Phase 3: Recognize text
  onPhase?.('recognizing', 0);
  const recognizeResult = await manager.recognize(imageData);
  const { data } = recognizeResult;

  // Parse structured results
  const paragraphs = parseParagraphs(data);
  const wordCount = data.text
    .split(/\s+/)
    .filter((w: string) => w.length > 0).length;

  const ocrResult: OCRResult = {
    text: data.text.trim(),
    confidence: Math.round(data.confidence),
    paragraphs,
    wordCount,
    processingTime: Date.now() - startTime,
    method: 'local',
  };

  onPhase?.('complete', 100);
  return ocrResult;
}

// ===== Main Hook =====

export function useOCR(): UseOCRReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<OCRResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<OCRMode>('auto');
  const [phase, setPhase] = useState<OCRPhase>('idle');
  const cancelRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelRef.current = true;
    };
  }, []);

  const extractText = useCallback(
    async (
      imageData: string | Blob,
      language: string = 'eng',
      preferredMode: OCRMode = 'server'
    ): Promise<OCRResult> => {
      if (isProcessing) {
        throw new Error('OCR is already in progress');
      }

      cancelRef.current = false;
      setIsProcessing(true);
      setError(null);
      setProgress(0);
      setResult(null);
      setPhase('initializing-worker');

      // Normalize input to data URL string
      let imageInput: string;
      try {
        if (imageData instanceof Blob) {
          imageInput = await blobToDataURL(imageData);
        } else {
          imageInput = imageData;
        }
      } catch (err: unknown) {
        const message = extractErrorMessage(err);
        console.error('[SmartCapture OCR] Failed to read image data:', err);
        setError(`OCR failed: Unable to read image data — ${message}`);
        setPhase('error');
        setIsProcessing(false);
        throw err;
      }

      // Helper to update phase + progress together
      const updatePhase = (newPhase: OCRPhase, newProgress: number) => {
        if (cancelRef.current) return;
        setPhase(newPhase);
        setProgress(newProgress);
      };

      try {
        let ocrResult: OCRResult;

        if (preferredMode === 'local') {
          // Force local Tesseract.js only
          setMode('local');
          ocrResult = await extractTextViaTesseract(imageInput, language, updatePhase);
        } else if (preferredMode === 'server') {
          // Force server-side VLM only
          setMode('server');
          setPhase('recognizing');
          setProgress(10);
          ocrResult = await extractTextViaServer(imageInput, language);
          setProgress(100);
          setPhase('complete');
        } else {
          // Auto mode: try server first (more reliable), fall back to local
          setMode('auto');
          try {
            setPhase('recognizing');
            setProgress(10);
            ocrResult = await extractTextViaServer(imageInput, language);
            setMode('server');
            setProgress(100);
            setPhase('complete');
          } catch (serverErr: unknown) {
            console.warn(
              '[SmartCapture OCR] Server OCR failed, falling back to local Tesseract:',
              extractErrorMessage(serverErr)
            );
            if (cancelRef.current) throw new Error('OCR was cancelled');

            try {
              ocrResult = await extractTextViaTesseract(imageInput, language, updatePhase);
              setMode('local');
            } catch (localErr: unknown) {
              const serverMsg = extractErrorMessage(serverErr);
              const localMsg = extractErrorMessage(localErr);
              throw new Error(
                `Both OCR methods failed.\nAI Vision: ${serverMsg}\nLocal Tesseract: ${localMsg}`
              );
            }
          }
        }

        if (cancelRef.current) {
          throw new Error('OCR was cancelled');
        }

        setResult(ocrResult);
        setPhase('complete');
        return ocrResult;
      } catch (err: unknown) {
        const message = extractErrorMessage(err);
        console.error('[SmartCapture OCR] Full error details:', err);
        console.error('[SmartCapture OCR] Error type:', typeof err);
        console.error('[SmartCapture OCR] Error message:', message);

        if (cancelRef.current) {
          setError('OCR was cancelled');
        } else {
          setError(`OCR failed: ${message}`);
        }
        setPhase('error');
        throw err;
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing]
  );

  const cancel = useCallback(async () => {
    cancelRef.current = true;

    // Terminate the Tesseract worker to immediately stop processing
    const manager = getWorkerManager();
    await manager.terminate();

    setIsProcessing(false);
    setProgress(0);
    setPhase('idle');
  }, []);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
    setPhase('idle');
    setProgress(0);
  }, []);

  return {
    isProcessing,
    progress,
    result,
    error,
    mode,
    phase,
    extractText,
    cancel,
    clearResult,
  };
}
