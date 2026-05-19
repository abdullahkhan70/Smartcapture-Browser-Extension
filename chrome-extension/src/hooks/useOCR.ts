/**
 * SmartCapture Pro - OCR Hook (DOM Extraction)
 *
 * Extracts text from web pages using the Chrome Scripting API.
 * Reads visible text directly from the page DOM — fully offline,
 * no server, no WASM, no API key required.
 *
 * Architecture:
 *   Popup (this hook) → chrome.scripting.executeScript → Active Tab DOM
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
  method?: 'dom';
}

export type OCRMode = 'dom';

/** Detailed phase of the OCR process for granular progress feedback */
export type OCRPhase =
  | 'idle'
  | 'extracting-dom'
  | 'complete'
  | 'error';

export interface WorkerStatus {
  state: 'idle' | 'ready';
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
  extractText: (imageData?: string | Blob, language?: string) => Promise<OCRResult>;
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

// ===== Helper Functions =====

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

// ===== DOM Text Extraction =====

async function extractTextViaDOM(): Promise<OCRResult> {
  const startTime = Date.now();

  if (!isChromeExtension()) {
    throw new Error('Text extraction is only available in the Chrome extension');
  }

  // Get the active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error('No active tab found for text extraction');
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
    throw new Error('No text found on the current page. Text extraction only works for web pages with visible text content.');
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

// ===== Main Hook =====

export function useOCR(): UseOCRReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<OCRResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<OCRMode>('dom');
  const [phase, setPhase] = useState<OCRPhase>('idle');
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus>({
    state: 'ready',
    progress: 100,
    phase: 'idle',
  });
  const cancelRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelRef.current = true;
    };
  }, []);

  const extractText = useCallback(
    async (
      _imageData?: string | Blob,
      _language?: string
    ): Promise<OCRResult> => {
      if (isProcessing) {
        throw new Error('Text extraction is already in progress');
      }

      cancelRef.current = false;
      setIsProcessing(true);
      setError(null);
      setProgress(0);
      setResult(null);
      setMode('dom');

      try {
        setPhase('extracting-dom');
        setProgress(10);

        const ocrResult = await extractTextViaDOM();

        if (cancelRef.current) {
          throw new Error('Text extraction was cancelled');
        }

        setProgress(100);
        setPhase('complete');
        setResult(ocrResult);
        setIsProcessing(false);
        return ocrResult;
      } catch (err: unknown) {
        const message = extractErrorMessage(err);
        console.error('[SmartCapture OCR] Full error details:', err);

        if (cancelRef.current) {
          setError('Text extraction was cancelled');
        } else {
          setError(`Extraction failed: ${message}`);
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
    extractText,
    cancel,
    clearResult,
  };
}
