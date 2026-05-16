import { useState, useCallback, useRef } from 'react';
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
}

interface UseOCRReturn {
  isProcessing: boolean;
  progress: number;
  result: OCRResult | null;
  error: string | null;
  extractText: (imageData: string | Blob, language?: string) => Promise<OCRResult>;
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

// ===== Helper Functions =====

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function parseParagraphs(data: TesseractData): OCRParagraph[] {
  if (!data.paragraphs || data.paragraphs.length === 0) {
    // Fallback: split text into paragraphs by double newlines
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

      // Calculate paragraph-level bbox from lines
      let bbox = { x: 0, y: 0, width: 0, height: 0 };
      if (lines.length > 0) {
        const minX = Math.min(...lines.map((l) => l.bbox.x0));
        const minY = Math.min(...lines.map((l) => l.bbox.y0));
        const maxX = Math.max(...lines.map((l) => l.bbox.x1));
        const maxY = Math.max(...lines.map((l) => l.bbox.y1));
        bbox = {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
        };
      }

      // Average word confidence for paragraph confidence
      const avgConfidence =
        allWords.length > 0
          ? Math.round(
              allWords.reduce((sum, w) => sum + w.confidence, 0) / allWords.length
            )
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

// ===== Main Hook =====

export function useOCR(): UseOCRReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<OCRResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const extractText = useCallback(
    async (imageData: string | Blob, language: string = 'eng'): Promise<OCRResult> => {
      // Prevent duplicate processing
      if (isProcessing) {
        throw new Error('OCR is already in progress');
      }

      setIsProcessing(true);
      setError(null);
      setProgress(0);
      setResult(null);

      try {
        // Create Tesseract worker with progress logging
        // Use local bundled files to avoid CSP issues in Chrome Extension MV3
        const worker = await createWorker(language, 1, {
          workerPath: chrome.runtime.getURL('tesseract/worker.min.js'),
          corePath: chrome.runtime.getURL('tesseract/tesseract-core-simd-lstm.wasm.js'),
          langPath: chrome.runtime.getURL('tesseract/langs/'),
          logger: (m: { status: string; progress: number }) => {
            if (m.status === 'recognizing text') {
              setProgress(Math.round(m.progress * 100));
            }
          },
        });
        workerRef.current = worker;

        const startTime = Date.now();

        // Normalize input to data URL string
        let imageInput: string;
        if (imageData instanceof Blob) {
          imageInput = await blobToDataURL(imageData);
        } else {
          imageInput = imageData;
        }

        // Run recognition
        const recognizeResult = (await worker.recognize(
          imageInput
        )) as TesseractRecognizeResult;
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
        };

        setResult(ocrResult);

        // Clean up worker to avoid memory leaks
        await worker.terminate();
        workerRef.current = null;

        return ocrResult;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Unknown OCR error';
        setError(`OCR failed: ${message}`);
        throw err;
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing]
  );

  const cancel = useCallback(async () => {
    if (workerRef.current) {
      try {
        await workerRef.current.terminate();
      } catch {
        // Worker may already be terminated
      }
      workerRef.current = null;
    }
    setIsProcessing(false);
    setProgress(0);
  }, []);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return {
    isProcessing,
    progress,
    result,
    error,
    extractText,
    cancel,
    clearResult,
  };
}
