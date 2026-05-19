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
  | 'prewarming'
  | 'initializing-worker'
  | 'loading-language'
  | 'recognizing'
  | 'complete'
  | 'error';

export interface WorkerStatus {
  state: 'idle' | 'prewarming' | 'ready' | 'error';
  progress: number;
  phase: OCRPhase;
  error?: string;
}

interface UseOCRReturn {
  isProcessing: boolean;
  progress: number;
  result: OCRResult | null;
  error: string | null;
  mode: OCRMode;
  phase: OCRPhase;
  workerStatus: WorkerStatus;
  prewarmWorker: (language?: string) => void;
  extractText: (imageData: string | Blob, language?: string, preferredMode?: OCRMode) => Promise<OCRResult>;
  cancel: () => Promise<void>;
  clearResult: () => void;
}

// ===== Tesseract internal types =====

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
// Keeps one worker alive and reuses it across OCR calls.
// Supports pre-warming: start initialization early so the worker
// is ready by the time the user clicks "Extract".

type StatusCallback = (status: WorkerStatus) => void;

class TesseractWorkerManager {
  private worker: Worker | null = null;
  private currentLang: string | null = null;
  private initializing: Promise<Worker> | null = null;
  private _isTerminated = false;
  private _status: WorkerStatus = { state: 'idle', progress: 0, phase: 'idle' };
  private statusCallbacks: Set<StatusCallback> = new Set();

  // Realistic timeouts for Chrome extensions:
  // - WASM compilation of 2.8MB binary takes 30-90s in Chrome extension popup
  // - Language data loading takes 5-15s
  // - Total initialization can take 45-120s on first run
  private static INIT_TIMEOUT = 120_000; // 2 min — realistic for first-run in extension
  private static RECOGNIZE_TIMEOUT = 120_000; // 2 min for recognition (large images)

  get isReady(): boolean {
    return this.worker !== null && !this._isTerminated;
  }

  get status(): WorkerStatus {
    return { ...this._status };
  }

  onStatusChange(cb: StatusCallback): () => void {
    this.statusCallbacks.add(cb);
    return () => this.statusCallbacks.delete(cb);
  }

  private updateStatus(partial: Partial<WorkerStatus>) {
    this._status = { ...this._status, ...partial };
    this.statusCallbacks.forEach((cb) => cb(this._status));
  }

  /**
   * Pre-warm the worker by starting initialization early.
   * Call this when the OCR panel mounts so the engine is ready
   * when the user clicks "Extract".
   */
  prewarm(language: string = 'eng'): void {
    if (this.worker && !this._isTerminated && this.currentLang === language) {
      console.log('[SmartCapture OCR] Worker already ready, skipping prewarm');
      this.updateStatus({ state: 'ready', progress: 100, phase: 'complete' });
      return;
    }

    if (this.initializing) {
      console.log('[SmartCapture OCR] Worker already initializing, skipping prewarm');
      return;
    }

    console.log('[SmartCapture OCR] Pre-warming Tesseract worker...');
    this.updateStatus({ state: 'prewarming', progress: 0, phase: 'prewarming' });

    // Fire and forget — errors will be reported via status
    this.getWorker(language, (phase, progress) => {
      this.updateStatus({
        state: 'prewarming',
        progress,
        phase,
      });
    })
      .then(() => {
        console.log('[SmartCapture OCR] Pre-warm complete!');
        this.updateStatus({ state: 'ready', progress: 100, phase: 'complete' });
      })
      .catch((err) => {
        console.error('[SmartCapture OCR] Pre-warm failed:', extractErrorMessage(err));
        this.updateStatus({
          state: 'error',
          progress: 0,
          phase: 'error',
          error: extractErrorMessage(err),
        });
      });
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
        TesseractWorkerManager.INIT_TIMEOUT,
        `Tesseract initialization timed out after ${TesseractWorkerManager.INIT_TIMEOUT / 1000}s. ` +
        `This can happen on first run when the WASM engine needs to compile (~2.8MB). ` +
        `Please try again — subsequent runs will be faster as the engine is cached.`
      );
      this.currentLang = language;
      this._isTerminated = false;
      console.log('[SmartCapture OCR] Worker created successfully');
      return this.worker;
    } catch (err) {
      console.error('[SmartCapture OCR] Worker creation failed:', err);
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
   */
  private async _tryCreateWorkerStrategies(
    language: string,
    onPhase?: (phase: OCRPhase, progress: number) => void
  ): Promise<Worker> {
    const isExtension = isChromeExtension();

    const strategies: Array<{ name: string; options: Record<string, unknown> }> = [];

    if (isExtension) {
      // Strategy 1: Chrome Extension — local files, workerBlobURL=true (Blob Worker)
      // This creates a Worker from a Blob containing importScripts(workerPath).
      // Blob Workers can importScripts from chrome-extension:// URLs.
      strategies.push({
        name: 'Extension Blob Worker (local files)',
        options: {
          workerBlobURL: true,
          workerPath: chrome.runtime.getURL('tesseract/worker.min.js'),
          corePath: chrome.runtime.getURL('tesseract/tesseract-core-simd-lstm.wasm.js'),
          langPath: chrome.runtime.getURL('tesseract/langs/'),
        },
      });

      // Strategy 2: Chrome Extension — local files, workerBlobURL=false (direct Worker)
      strategies.push({
        name: 'Extension Direct Worker (local files)',
        options: {
          workerBlobURL: false,
          workerPath: chrome.runtime.getURL('tesseract/worker.min.js'),
          corePath: chrome.runtime.getURL('tesseract/tesseract-core-simd-lstm.wasm.js'),
          langPath: chrome.runtime.getURL('tesseract/langs/'),
        },
      });
    } else {
      // Strategy for web app: local public files
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

    // Last resort: CDN approach
    strategies.push({
      name: 'CDN Default',
      options: {},
    });

    let lastError: unknown = null;

    for (const strategy of strategies) {
      console.log(`[SmartCapture OCR] Trying strategy: ${strategy.name}`);
      onPhase?.('initializing-worker', 2);

      try {
        const loggerFn = (m: { status: string; progress: number }) => {
          const status = m.status;
          const progress = Math.round(m.progress * 100);

          console.log(`[SmartCapture OCR] Tesseract status: ${status} ${progress}%`);

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

        console.log(`[SmartCapture OCR] Strategy "${strategy.name}" succeeded!`);
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
      `Tips: Keep the popup open during initialization (takes 30-90s on first run). ` +
      `Subsequent runs reuse the engine and are much faster.`
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
    this.updateStatus({ state: 'idle', progress: 0, phase: 'idle' });
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

// ===== Local OCR via Tesseract.js =====

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
  const [mode, setMode] = useState<OCRMode>('local');
  const [phase, setPhase] = useState<OCRPhase>('idle');
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus>({ state: 'idle', progress: 0, phase: 'idle' });
  const cancelRef = useRef(false);

  // Listen to worker manager status changes
  useEffect(() => {
    const manager = getWorkerManager();
    const unsub = manager.onStatusChange((status) => {
      setWorkerStatus(status);
    });
    return unsub;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelRef.current = true;
    };
  }, []);

  /**
   * Pre-warm the Tesseract worker. Call this when the OCR panel opens
   * so the engine starts loading immediately, rather than waiting for
   * the user to click "Extract".
   */
  const prewarmWorker = useCallback((language: string = 'eng') => {
    const manager = getWorkerManager();
    manager.prewarm(language);
  }, []);

  const extractText = useCallback(
    async (
      imageData: string | Blob,
      language: string = 'eng',
      preferredMode: OCRMode = 'local'
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
          setMode('local');
          ocrResult = await extractTextViaTesseract(imageInput, language, updatePhase);
        } else if (preferredMode === 'server') {
          setMode('server');
          setPhase('recognizing');
          setProgress(10);
          ocrResult = await extractTextViaServer(imageInput, language);
          setProgress(100);
          setPhase('complete');
        } else {
          // Auto mode: try local first (user preference), fall back to server
          setMode('auto');
          try {
            ocrResult = await extractTextViaTesseract(imageInput, language, updatePhase);
            setMode('local');
          } catch (localErr: unknown) {
            console.warn(
              '[SmartCapture OCR] Local OCR failed, falling back to server:',
              extractErrorMessage(localErr)
            );
            if (cancelRef.current) throw new Error('OCR was cancelled');

            setPhase('recognizing');
            setProgress(10);
            try {
              ocrResult = await extractTextViaServer(imageInput, language);
              setMode('server');
              setProgress(100);
              setPhase('complete');
            } catch (serverErr: unknown) {
              const localMsg = extractErrorMessage(localErr);
              const serverMsg = extractErrorMessage(serverErr);
              throw new Error(
                `Both OCR methods failed.\nLocal Tesseract: ${localMsg}\nAI Vision: ${serverMsg}`
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
    workerStatus,
    prewarmWorker,
    extractText,
    cancel,
    clearResult,
  };
}
