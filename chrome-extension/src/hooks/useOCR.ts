/**
 * SmartCapture Pro - OCR Hook (Offscreen Architecture)
 *
 * Communicates with the Tesseract.js OCR engine running in an offscreen document.
 * The offscreen document persists independently of the popup, so the WASM engine
 * stays initialized across popup sessions — instant OCR when the user needs it!
 *
 * Architecture:
 *   Popup (this hook) → chrome.runtime.sendMessage → Offscreen Document (Tesseract.js)
 *   Offscreen Document → chrome.runtime.sendMessage → Popup (status/progress/results)
 */

import { useState, useCallback, useRef, useEffect } from 'react';

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

export type OCRMode = 'local' | 'server';

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

// ===== Ensure Offscreen Document Exists =====

async function ensureOffscreenReady(): Promise<void> {
  if (!isChromeExtension()) return;

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'OCR_ENSURE_OFFSCREEN' as const },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.ready) {
          resolve();
        } else {
          reject(new Error(response?.error || 'Failed to create offscreen document'));
        }
      }
    );
  });
}

// ===== Main Hook =====

export function useOCR(): UseOCRReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<OCRResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<OCRMode>('local');
  const [phase, setPhase] = useState<OCRPhase>('idle');
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus>({
    state: 'idle',
    progress: 0,
    phase: 'idle',
  });
  const cancelRef = useRef(false);
  const offscreenReadyRef = useRef(false);

  // Listen for messages from the offscreen document (OCR status, progress, results)
  useEffect(() => {
    if (!isChromeExtension()) return;

    const handler = (message: { type: string; payload?: unknown }) => {
      switch (message.type) {
        case 'OCR_STATUS_UPDATE': {
          const payload = message.payload as {
            state: WorkerStatus['state'];
            progress: number;
            phase: OCRPhase;
            error?: string;
          };
          setWorkerStatus({
            state: payload.state,
            progress: payload.progress,
            phase: payload.phase,
            error: payload.error,
          });
          // If the engine becomes ready, mark offscreen as ready
          if (payload.state === 'ready') {
            offscreenReadyRef.current = true;
          }
          break;
        }

        case 'OCR_PROGRESS': {
          const payload = message.payload as { progress: number; phase: string };
          if (!cancelRef.current) {
            setPhase(payload.phase as OCRPhase);
            setProgress(payload.progress);
          }
          break;
        }

        case 'OCR_RESULT': {
          const payload = message.payload as OCRResult;
          if (!cancelRef.current) {
            const ocrResult: OCRResult = {
              ...payload,
              processingTime: payload.processingTime || 0,
              method: 'local',
            };
            setResult(ocrResult);
            setPhase('complete');
            setProgress(100);
            setIsProcessing(false);
          }
          break;
        }

        case 'OCR_ERROR': {
          const payload = message.payload as { error: string };
          if (!cancelRef.current) {
            setError(`OCR failed: ${payload.error}`);
            setPhase('error');
            setIsProcessing(false);
          }
          break;
        }
      }
    };

    chrome.runtime.onMessage.addListener(handler);
    return () => {
      chrome.runtime.onMessage.removeListener(handler);
    };
  }, []);

  // On mount, ensure offscreen is ready and get current status
  useEffect(() => {
    if (!isChromeExtension()) return;

    const init = async () => {
      try {
        await ensureOffscreenReady();
        offscreenReadyRef.current = true;

        // Get current worker status from offscreen
        chrome.runtime.sendMessage(
          { type: 'OCR_GET_STATUS' as const },
          (response) => {
            if (response && !chrome.runtime.lastError) {
              const state = response.state as WorkerStatus['state'];
              setWorkerStatus({
                state,
                progress: state === 'ready' ? 100 : 0,
                phase: state === 'ready' ? 'complete' : state === 'prewarming' ? 'prewarming' : 'idle',
              });
            }
          }
        );
      } catch (err) {
        console.warn('[SmartCapture OCR] Failed to ensure offscreen:', err);
      }
    };

    init();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelRef.current = true;
    };
  }, []);

  /**
   * Pre-warm the Tesseract worker in the offscreen document.
   */
  const prewarmWorker = useCallback((language: string = 'eng') => {
    if (!isChromeExtension()) return;

    // Ensure offscreen exists first, then prewarm
    ensureOffscreenReady()
      .then(() => {
        chrome.runtime.sendMessage({
          type: 'OCR_PREWARM' as const,
          payload: { language },
        });
      })
      .catch((err) => {
        console.warn('[SmartCapture OCR] Failed to prewarm:', err);
        setWorkerStatus({
          state: 'error',
          progress: 0,
          phase: 'error',
          error: extractErrorMessage(err),
        });
      });
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
      setMode(preferredMode);

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

      const startTime = Date.now();

      try {
        if (preferredMode === 'server') {
          // Server mode: direct API call
          setMode('server');
          setPhase('recognizing');
          setProgress(10);
          const ocrResult = await extractTextViaServer(imageInput, language);
          setProgress(100);
          setPhase('complete');
          setResult(ocrResult);
          setIsProcessing(false);
          return ocrResult;
        }

        // Local mode: use offscreen document
        setMode('local');
        setPhase('prewarming');

        // Ensure offscreen document is ready
        try {
          await ensureOffscreenReady();
          offscreenReadyRef.current = true;
        } catch (err) {
          throw new Error(
            `OCR engine is not available. The offscreen document could not be created: ${extractErrorMessage(err)}`
          );
        }

        if (cancelRef.current) {
          throw new Error('OCR was cancelled');
        }

        // Send OCR request to offscreen document
        setPhase('recognizing');
        setProgress(0);

        chrome.runtime.sendMessage({
          type: 'OCR_RECOGNIZE' as const,
          payload: { imageData: imageInput, language },
        });

        // Wait for result via the message listener (OCR_RESULT or OCR_ERROR)
        // The result will come asynchronously through the chrome.runtime.onMessage listener
        return new Promise<OCRResult>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('OCR timed out after 3 minutes'));
            setIsProcessing(false);
            setPhase('error');
          }, 180_000);

          // Poll for result by checking the result state
          const checkInterval = setInterval(() => {
            if (cancelRef.current) {
              clearTimeout(timeout);
              clearInterval(checkInterval);
              reject(new Error('OCR was cancelled'));
              setIsProcessing(false);
              return;
            }
          }, 500);

          // The actual result will be set by the message listener
          // We use a custom event pattern to resolve the promise
          const resultHandler = (message: { type: string; payload?: unknown }) => {
            if (message.type === 'OCR_RESULT') {
              clearTimeout(timeout);
              clearInterval(checkInterval);
              chrome.runtime.onMessage.removeListener(resultHandler);
              const payload = message.payload as OCRResult;
              const ocrResult: OCRResult = {
                ...payload,
                processingTime: Date.now() - startTime,
                method: 'local',
              };
              resolve(ocrResult);
            } else if (message.type === 'OCR_ERROR') {
              clearTimeout(timeout);
              clearInterval(checkInterval);
              chrome.runtime.onMessage.removeListener(resultHandler);
              const payload = message.payload as { error: string };
              reject(new Error(payload.error));
            }
          };

          chrome.runtime.onMessage.addListener(resultHandler);
        });
      } catch (err: unknown) {
        const message = extractErrorMessage(err);
        console.error('[SmartCapture OCR] Full error details:', err);

        if (cancelRef.current) {
          setError('OCR was cancelled');
        } else {
          setError(`OCR failed: ${message}`);
        }
        setPhase('error');
        setIsProcessing(false);
        throw err;
      }
    },
    [isProcessing]
  );

  const cancel = useCallback(async () => {
    cancelRef.current = true;

    if (isChromeExtension()) {
      try {
        chrome.runtime.sendMessage({
          type: 'OCR_CANCEL' as const,
        });
      } catch {
        // Offscreen may not be available
      }
    }

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
