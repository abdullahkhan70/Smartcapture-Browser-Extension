/**
 * SmartCapture Pro - OCR Hook (Multi-Engine Architecture)
 *
 * Supports multiple OCR engines for maximum flexibility:
 *
 * 1. Cloud OCR (OCR.space API) — Primary mode for MVP
 *    - High accuracy, no WASM/Worker issues
 *    - Requires internet + free API key (25K requests/month free)
 *    - Best for: Getting OCR working immediately
 *
 * 2. DOM Extraction — Truly offline, for web page screenshots
 *    - Extracts text from the page DOM via content script
 *    - 100% client-side, no server, no WASM
 *    - Best for: Screenshots of web pages with visible text
 *
 * 3. AI Vision (VLM server) — Requires local server
 *    - Uses z-ai-web-dev-sdk VLM for text extraction
 *    - High accuracy but requires Next.js server running
 *
 * 4. Local OCR (Tesseract.js) — Experimental / currently unreliable
 *    - Uses WASM engine in offscreen document
 *    - May hang during initialization in Chrome extension context
 *    - Best for: Future use when WASM issues are resolved
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
  method?: 'server' | 'local' | 'cloud' | 'dom';
}

export type OCRMode = 'cloud' | 'dom' | 'server' | 'local';

/** Detailed phase of the OCR process for granular progress feedback */
export type OCRPhase =
  | 'idle'
  | 'prewarming'
  | 'initializing-worker'
  | 'loading-language'
  | 'recognizing'
  | 'extracting-dom'
  | 'uploading'
  | 'complete'
  | 'error';

export interface WorkerStatus {
  state: 'idle' | 'prewarming' | 'ready' | 'error';
  progress: number;
  phase: OCRPhase;
  error?: string;
}

export interface OCRCloudConfig {
  apiKey: string;
  provider: 'ocr.space';
}

interface UseOCRReturn {
  isProcessing: boolean;
  progress: number;
  result: OCRResult | null;
  error: string | null;
  mode: OCRMode;
  phase: OCRPhase;
  workerStatus: WorkerStatus;
  cloudConfig: OCRCloudConfig | null;
  setCloudConfig: (config: OCRCloudConfig) => void;
  prewarmWorker: (language?: string) => void;
  extractText: (imageData: string | Blob, language?: string, preferredMode?: OCRMode) => Promise<OCRResult>;
  cancel: () => Promise<void>;
  clearResult: () => void;
}

// ===== Constants =====

const OCR_SPACE_API_URL = 'https://api.ocr.space/parse/image';
const OCR_SPACE_FREE_KEY_STORAGE = 'ocr-space-api-key';

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

/** Parse text into OCRParagraph format */
function textToParagraphs(fullText: string, confidence: number): OCRParagraph[] {
  return fullText
    .split(/\n\s*\n/)
    .filter((p) => p.trim().length > 0)
    .map((text) => ({
      text: text.trim(),
      confidence,
      bbox: { x: 0, y: 0, width: 0, height: 0 },
      words: text.trim().split(/\s+/).filter(Boolean).map((w) => ({
        text: w,
        confidence,
        bbox: { x: 0, y: 0, width: 0, height: 0 },
      })),
    }));
}

// ===== Cloud OCR via OCR.space API =====

async function extractTextViaCloud(
  imageData: string,
  language: string = 'eng',
  apiKey: string
): Promise<OCRResult> {
  const startTime = Date.now();

  if (!apiKey) {
    throw new Error(
      'OCR.space API key is required. Get a free key at https://ocr.space/ocrapi/freekey'
    );
  }

  const formData = new FormData();
  formData.append('base64Image', imageData);
  formData.append('language', language === 'eng' ? 'eng' : language);
  formData.append('apikey', apiKey);
  formData.append('scale', 'true');
  formData.append('isTable', 'true');
  formData.append('OCREngine', '2'); // Engine 2 is better for screenshots

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(OCR_SPACE_API_URL, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorMsg = `OCR.space API error (HTTP ${response.status})`;
      try {
        const errorData = await response.json();
        if (errorData.ErrorMessage) {
          errorMsg = Array.isArray(errorData.ErrorMessage)
            ? errorData.ErrorMessage.join(', ')
            : errorData.ErrorMessage;
        }
      } catch { /* Response body not JSON */ }
      throw new Error(errorMsg);
    }

    const result = await response.json();

    if (result.IsErroredOnProcessing) {
      const errMsg = result.ErrorMessage
        ? (Array.isArray(result.ErrorMessage) ? result.ErrorMessage.join(', ') : result.ErrorMessage)
        : 'OCR.space processing error';
      throw new Error(errMsg);
    }

    const parsedResults = result.ParsedResults || [];
    if (parsedResults.length === 0) {
      throw new Error('No text detected in the image');
    }

    // Combine text from all parsed results
    const fullText = parsedResults
      .map((r: { ParsedText?: string }) => r.ParsedText || '')
      .filter(Boolean)
      .join('\n\n')
      .trim();

    if (!fullText) {
      throw new Error('No text could be extracted from the image');
    }

    // Get average confidence from OCR.space results
    const avgConfidence = parsedResults.reduce(
      (sum: number, r: { TextOrientation?: string; FileParseExitCode?: number }) => {
        // OCR.space Engine 2 doesn't provide per-word confidence
        // Exit code 1 = success, estimate confidence based on that
        return sum + (r.FileParseExitCode === 1 ? 92 : 70);
      },
      0
    ) / parsedResults.length;

    const confidence = Math.round(avgConfidence);
    const paragraphs = textToParagraphs(fullText, confidence);
    const wordCount = fullText.split(/\s+/).filter((w: string) => w.length > 0).length;

    return {
      text: fullText,
      confidence,
      paragraphs,
      wordCount,
      processingTime: Date.now() - startTime,
      method: 'cloud',
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ===== DOM Text Extraction (Truly Offline) =====

async function extractTextViaDOM(): Promise<OCRResult> {
  const startTime = Date.now();

  if (!isChromeExtension()) {
    throw new Error('DOM extraction is only available in the Chrome extension');
  }

  // Get the active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error('No active tab found for DOM extraction');
  }

  // Execute content script to extract visible text from the page
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      // This function runs in the context of the web page
      const extractVisibleText = (): string => {
        const body = document.body;
        if (!body) return '';

        // Create a tree walker to extract visible text nodes
        const walker = document.createTreeWalker(
          body,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) => {
              // Skip hidden elements
              const parent = node.parentElement;
              if (!parent) return NodeFilter.FILTER_REJECT;

              const style = window.getComputedStyle(parent);
              if (
                style.display === 'none' ||
                style.visibility === 'hidden' ||
                style.opacity === '0' ||
                parent.tagName === 'SCRIPT' ||
                parent.tagName === 'STYLE' ||
                parent.tagName === 'NOSCRIPT' ||
                parent.tagName === 'SVG' ||
                parent.tagName === 'PATH'
              ) {
                return NodeFilter.FILTER_REJECT;
              }

              // Skip very small text (likely decorative)
              const fontSize = parseFloat(style.fontSize);
              if (fontSize < 6) return NodeFilter.FILTER_REJECT;

              // Skip text that's just whitespace
              if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;

              return NodeFilter.FILTER_ACCEPT;
            },
          }
        );

        const textBlocks: { tag: string; text: string }[] = [];
        let currentBlock = '';
        let lastTag = '';

        while (walker.nextNode()) {
          const node = walker.currentNode;
          const text = node.textContent?.trim() || '';
          if (!text) continue;

          const parent = node.parentElement;
          const tag = parent?.tagName || '';
          const isBlock = parent ? (
            ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TR', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'NAV', 'FIGCAPTION', 'DT', 'DD'].includes(tag)
          ) : false;

          if (isBlock && tag !== lastTag && currentBlock) {
            textBlocks.push({ tag: lastTag, text: currentBlock.trim() });
            currentBlock = '';
          }

          currentBlock += (currentBlock ? ' ' : '') + text;
          lastTag = tag;
        }

        if (currentBlock.trim()) {
          textBlocks.push({ tag: lastTag, text: currentBlock.trim() });
        }

        // Filter out very short blocks (likely navigation, labels, etc.)
        // but keep them if they look like headings
        const filtered = textBlocks.filter(
          (block) => block.text.length > 2 || block.tag.startsWith('H')
        );

        return filtered.map((b) => b.text).join('\n\n');
      };

      return extractVisibleText();
    },
  });

  const fullText = results?.[0]?.result as string;

  if (!fullText || !fullText.trim()) {
    throw new Error('No text found on the current page. DOM extraction only works for web pages with visible text content.');
  }

  const confidence = 97; // DOM extraction is very accurate for visible text
  const paragraphs = textToParagraphs(fullText, confidence);
  const wordCount = fullText.split(/\s+/).filter((w: string) => w.length > 0).length;

  return {
    text: fullText,
    confidence,
    paragraphs,
    wordCount,
    processingTime: Date.now() - startTime,
    method: 'dom',
  };
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

// ===== API Key Storage =====

async function loadCloudApiKey(): Promise<string> {
  if (!isChromeExtension()) return '';
  try {
    const result = await chrome.storage.local.get(OCR_SPACE_FREE_KEY_STORAGE);
    return (result[OCR_SPACE_FREE_KEY_STORAGE] as string) || '';
  } catch {
    return '';
  }
}

async function saveCloudApiKey(key: string): Promise<void> {
  if (!isChromeExtension()) return;
  try {
    await chrome.storage.local.set({ [OCR_SPACE_FREE_KEY_STORAGE]: key });
  } catch {
    // Storage might not be available
  }
}

// ===== Main Hook =====

export function useOCR(): UseOCRReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<OCRResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<OCRMode>('cloud');
  const [phase, setPhase] = useState<OCRPhase>('idle');
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus>({
    state: 'idle',
    progress: 0,
    phase: 'idle',
  });
  const [cloudConfig, setCloudConfigState] = useState<OCRCloudConfig | null>(null);
  const cancelRef = useRef(false);
  const offscreenReadyRef = useRef(false);

  // Load cloud API key on mount
  useEffect(() => {
    if (!isChromeExtension()) return;

    loadCloudApiKey().then((key) => {
      if (key) {
        setCloudConfigState({ apiKey: key, provider: 'ocr.space' });
      }
    });
  }, []);

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

  // On mount, check offscreen status (for local mode)
  useEffect(() => {
    if (!isChromeExtension()) return;

    const init = async () => {
      try {
        await ensureOffscreenReady();
        offscreenReadyRef.current = true;

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
   * Set cloud OCR configuration and persist the API key.
   */
  const setCloudConfig = useCallback((config: OCRCloudConfig) => {
    setCloudConfigState(config);
    saveCloudApiKey(config.apiKey);
  }, []);

  /**
   * Pre-warm the Tesseract worker in the offscreen document.
   */
  const prewarmWorker = useCallback((language: string = 'eng') => {
    if (!isChromeExtension()) return;

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
      preferredMode: OCRMode = 'cloud'
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

      const startTime = Date.now();

      try {
        // ===== CLOUD MODE (OCR.space) =====
        if (preferredMode === 'cloud') {
          setMode('cloud');
          setPhase('uploading');
          setProgress(10);

          const apiKey = cloudConfig?.apiKey || await loadCloudApiKey();
          if (!apiKey) {
            throw new Error(
              'OCR.space API key is required for Cloud OCR mode. Get a free key at https://ocr.space/ocrapi/freekey and enter it in settings.'
            );
          }

          // Normalize input to data URL string
          let imageInput: string;
          if (imageData instanceof Blob) {
            imageInput = await blobToDataURL(imageData);
          } else {
            imageInput = imageData;
          }

          setProgress(20);
          const ocrResult = await extractTextViaCloud(imageInput, language, apiKey);
          setProgress(100);
          setPhase('complete');
          setResult(ocrResult);
          setIsProcessing(false);
          return ocrResult;
        }

        // ===== DOM EXTRACTION MODE =====
        if (preferredMode === 'dom') {
          setMode('dom');
          setPhase('extracting-dom');
          setProgress(10);

          const ocrResult = await extractTextViaDOM();
          setProgress(100);
          setPhase('complete');
          setResult(ocrResult);
          setIsProcessing(false);
          return ocrResult;
        }

        // ===== SERVER MODE (VLM) =====
        if (preferredMode === 'server') {
          setMode('server');
          setPhase('recognizing');
          setProgress(10);

          let imageInput: string;
          if (imageData instanceof Blob) {
            imageInput = await blobToDataURL(imageData);
          } else {
            imageInput = imageData;
          }

          const ocrResult = await extractTextViaServer(imageInput, language);
          setProgress(100);
          setPhase('complete');
          setResult(ocrResult);
          setIsProcessing(false);
          return ocrResult;
        }

        // ===== LOCAL MODE (Tesseract.js offscreen) =====
        setMode('local');
        setPhase('prewarming');

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

        // Wait for result via the message listener
        return new Promise<OCRResult>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('OCR timed out after 3 minutes'));
            setIsProcessing(false);
            setPhase('error');
          }, 180_000);

          const checkInterval = setInterval(() => {
            if (cancelRef.current) {
              clearTimeout(timeout);
              clearInterval(checkInterval);
              reject(new Error('OCR was cancelled'));
              setIsProcessing(false);
              return;
            }
          }, 500);

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
    [isProcessing, cloudConfig]
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
    cloudConfig,
    setCloudConfig,
    prewarmWorker,
    extractText,
    cancel,
    clearResult,
  };
}
