import React, { useState, useMemo, useCallback } from 'react';
import {
  FileText,
  Copy,
  Check,
  Loader2,
  Download,
  ArrowLeft,
  AlertCircle,
  RotateCcw,
  X,
  Clock,
  Hash,
  Sparkles,
  Monitor,
  Wifi,
  Cpu,
  BookOpen,
  Eye,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import { Capture } from '@/lib/types';
import { useAppStore } from '@/store';
import { useOCR, OCRResult, OCRParagraph, OCRMode, OCRPhase } from '@/hooks/useOCR';
import { exportAsText } from '@/lib/export';
import { storage } from '@/lib/storage';

interface OCRPanelProps {
  capture: Capture;
}

/** Human-readable labels for each OCR phase */
const PHASE_INFO: Record<OCRPhase, { label: string; description: string; icon: React.ReactNode }> = {
  idle: { label: 'Ready', description: '', icon: null },
  'initializing-worker': {
    label: 'Loading OCR Engine',
    description: 'Initializing Tesseract WASM engine (this may take 30s+)...',
    icon: <Cpu size={12} className="animate-pulse text-primary" />,
  },
  'loading-language': {
    label: 'Loading Language Data',
    description: 'Loading English language model...',
    icon: <BookOpen size={12} className="animate-pulse text-primary" />,
  },
  recognizing: {
    label: 'Recognizing Text',
    description: 'Extracting text from image...',
    icon: <Eye size={12} className="animate-pulse text-primary" />,
  },
  complete: { label: 'Complete', description: '', icon: null },
  error: { label: 'Error', description: '', icon: null },
};

export function OCRPanel({ capture }: OCRPanelProps) {
  const goBack = useAppStore((s) => s.goBack);
  const updateCapture = useAppStore((s) => s.updateCapture);
  const [cachedParagraphs, setCachedParagraphs] = useState<OCRParagraph[]>(() => {
    if (capture.ocrText) {
      return [{ text: capture.ocrText, confidence: 92, bbox: { x: 0, y: 0, width: 0, height: 0 }, words: [] }];
    }
    return [];
  });
  const [copied, setCopied] = useState(false);
  const [cachedResult, setCachedResult] = useState<OCRResult | null>(null);
  const [selectedMode, setSelectedMode] = useState<OCRMode>('server');

  const {
    isProcessing,
    progress,
    result,
    error,
    mode: activeMode,
    phase,
    extractText,
    cancel,
    clearResult,
  } = useOCR();

  // Use live OCR result or cached paragraphs
  const ocrParagraphs = useMemo(() => {
    if (result && result.paragraphs.length > 0) return result.paragraphs;
    return cachedParagraphs;
  }, [result, cachedParagraphs]);

  const wordCount = useMemo(() => {
    return ocrParagraphs.reduce(
      (sum, p) => sum + p.text.split(/\s+/).filter(Boolean).length,
      0
    );
  }, [ocrParagraphs]);

  const fullText = useMemo(() => {
    return ocrParagraphs.map((p) => p.text).join('\n\n');
  }, [ocrParagraphs]);

  const processingTime = useMemo(() => {
    if (result) return result.processingTime;
    if (cachedResult) return cachedResult.processingTime;
    return null;
  }, [result, cachedResult]);

  const overallConfidence = useMemo(() => {
    if (result) return result.confidence;
    if (cachedResult) return cachedResult.confidence;
    if (ocrParagraphs.length > 0) {
      return Math.round(
        ocrParagraphs.reduce((sum, p) => sum + p.confidence, 0) /
          ocrParagraphs.length
      );
    }
    return 0;
  }, [result, cachedResult, ocrParagraphs]);

  const usedMethod = useMemo(() => {
    if (result?.method) return result.method;
    if (cachedResult?.method) return cachedResult.method;
    return null;
  }, [result, cachedResult]);

  const handleExtract = useCallback(async () => {
    if (!capture.imageData) return;

    try {
      const ocrResult = await extractText(capture.imageData, 'eng', selectedMode);

      setCachedParagraphs(ocrResult.paragraphs);
      setCachedResult(ocrResult);

      if (capture.id) {
        await storage.updateOCRText(capture.id, ocrResult.text);
        updateCapture(capture.id, { ocrText: ocrResult.text });
      }
    } catch {
      // Error is already set in the hook
    }
  }, [capture.imageData, capture.id, extractText, updateCapture, selectedMode]);

  const handleCancel = useCallback(async () => {
    await cancel();
    clearResult();
  }, [cancel, clearResult]);

  const handleCopy = useCallback(async () => {
    if (!fullText) return;
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }, [fullText]);

  const handleExportTxt = useCallback(() => {
    if (!fullText) return;
    const date = new Date(capture.timestamp)
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    exportAsText(fullText, `ocr-${date}.txt`);
  }, [fullText, capture.timestamp]);

  const [localError, setLocalError] = useState<string | null>(null);

  const handleRetry = useCallback(() => {
    clearResult();
    setLocalError(null);
  }, [clearResult]);

  React.useEffect(() => {
    if (error) setLocalError(error);
  }, [error]);

  const clearError = useCallback(() => {
    setLocalError(null);
    clearResult();
  }, [clearResult]);

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 90) return '#22C55E';
    if (confidence >= 70) return '#F59E0B';
    return '#EF4444';
  };

  const getConfidenceLabel = (confidence: number): string => {
    if (confidence >= 90) return 'High';
    if (confidence >= 70) return 'Medium';
    return 'Low';
  };

  const formatTime = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getModeLabel = (m: OCRMode | null): string => {
    if (!m) return '';
    switch (m) {
      case 'server': return 'AI Vision';
      case 'local': return 'Tesseract';
      default: return 'Auto';
    }
  };

  const getModeIcon = (m: OCRMode | null) => {
    if (!m) return null;
    switch (m) {
      case 'server': return <Sparkles size={9} />;
      case 'local': return <Monitor size={9} />;
      default: return <Wifi size={9} />;
    }
  };

  const currentPhaseInfo = PHASE_INFO[phase];

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={goBack}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-smooth cursor-pointer"
          >
            <ArrowLeft size={16} />
          </button>
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <FileText size={16} className="text-primary" />
            OCR Text Extraction
          </h3>
        </div>
        {ocrParagraphs.length > 0 && (
          <div className="flex items-center gap-1">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium
                bg-surface-elevated text-text-secondary hover:text-text-primary hover:bg-surface-hover
                transition-smooth cursor-pointer"
            >
              {copied ? <Check size={11} className="text-[#22C55E]" /> : <Copy size={11} />}
              {copied ? 'Copied' : 'Copy All'}
            </button>
            <button
              onClick={handleExportTxt}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium
                bg-surface-elevated text-text-secondary hover:text-text-primary hover:bg-surface-hover
                transition-smooth cursor-pointer"
            >
              <Download size={11} />
              TXT
            </button>
          </div>
        )}
      </div>

      {/* Error State */}
      {localError && !isProcessing && (
        <div
          className="rounded-xl p-4 mb-3"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
          }}
        >
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="text-[#EF4444] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[#EF4444] mb-1">
                Extraction Failed
              </p>
              <p className="text-[11px] text-text-secondary leading-relaxed break-words whitespace-pre-line">
                {localError}
              </p>
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={handleRetry}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-semibold
                    bg-[#EF4444] text-white hover:bg-red-600 transition-smooth cursor-pointer"
                >
                  <RotateCcw size={10} />
                  Retry
                </button>
                <button
                  onClick={clearError}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-medium
                    text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                >
                  <X size={10} />
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Extract Button (Empty State) */}
      {ocrParagraphs.length === 0 && !isProcessing && !localError && (
        <div className="space-y-3">
          {/* OCR Mode Selector */}
          <div
            className="flex items-center gap-1 p-1 rounded-lg"
            style={{ backgroundColor: 'rgba(30, 41, 59, 0.5)' }}
          >
            {([
              { value: 'server' as OCRMode, label: 'AI Vision', icon: <Sparkles size={10} /> },
              { value: 'auto' as OCRMode, label: 'Auto', icon: <Wifi size={10} /> },
              { value: 'local' as OCRMode, label: 'Local', icon: <Monitor size={10} /> },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSelectedMode(opt.value)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-medium transition-smooth cursor-pointer flex-1 justify-center ${
                  selectedMode === opt.value
                    ? 'bg-primary text-white'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>

          {/* Mode-specific info */}
          {selectedMode === 'local' && (
            <div
              className="flex items-start gap-2 px-3 py-2 rounded-lg"
              style={{
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
              }}
            >
              <AlertTriangle size={12} className="text-[#F59E0B] shrink-0 mt-0.5" />
              <p className="text-[10px] text-[#F59E0B] leading-relaxed">
                Local OCR may be slow or get stuck in Chrome extensions due to browser security restrictions. AI Vision mode is recommended for best results.
              </p>
            </div>
          )}

          {selectedMode === 'server' && (
            <div
              className="flex items-start gap-2 px-3 py-2 rounded-lg"
              style={{
                backgroundColor: 'rgba(34, 197, 94, 0.08)',
                border: '1px solid rgba(34, 197, 94, 0.15)',
              }}
            >
              <Zap size={12} className="text-[#22C55E] shrink-0 mt-0.5" />
              <p className="text-[10px] text-[#22C55E] leading-relaxed">
                Fast &amp; reliable AI-powered text extraction. Requires the SmartCapture server running locally.
              </p>
            </div>
          )}

          <button
            onClick={handleExtract}
            className="flex items-center justify-center gap-2 w-full h-10 rounded-lg text-sm font-semibold text-white
              bg-primary hover:bg-primary-dark active:bg-primary-dark transition-smooth cursor-pointer shadow-sm"
          >
            {selectedMode === 'server' ? <Sparkles size={16} /> : <FileText size={16} />}
            Extract Text from Image
          </button>
          <p className="text-center text-[10px] text-text-muted py-3">
            {selectedMode === 'server'
              ? 'AI Vision uses advanced AI for high-accuracy text extraction.'
              : selectedMode === 'local'
                ? 'Local OCR uses Tesseract.js — all processing happens in your browser. May be slow or get stuck.'
                : 'Auto tries AI Vision first, falls back to Local Tesseract.js if needed.'}
          </p>
        </div>
      )}

      {/* Progress Bar with Phase Details */}
      {isProcessing && (
        <div className="space-y-3 mb-3">
          {/* Phase indicator */}
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ backgroundColor: 'rgba(30, 41, 59, 0.5)' }}
          >
            {currentPhaseInfo.icon}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-text-primary">
                {currentPhaseInfo.label}
              </p>
              {currentPhaseInfo.description && (
                <p className="text-[10px] text-text-muted mt-0.5 truncate">
                  {currentPhaseInfo.description}
                </p>
              )}
            </div>
            <span className="text-xs text-primary font-mono tabular-nums">
              {progress}%
            </span>
          </div>

          {/* Progress bar */}
          <div
            className="w-full h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: 'rgba(51, 65, 85, 0.8)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-300 gradient-primary"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Phase steps indicator */}
          <div className="flex items-center gap-1 justify-center">
            {(['initializing-worker', 'loading-language', 'recognizing'] as OCRPhase[]).map((p, i) => {
              const phaseOrder = ['initializing-worker', 'loading-language', 'recognizing'];
              const currentIdx = phaseOrder.indexOf(phase);
              const thisIdx = i;
              const isDone = currentIdx > thisIdx;
              const isCurrent = phase === p;

              return (
                <React.Fragment key={p}>
                  {i > 0 && (
                    <div
                      className="h-px w-4"
                      style={{
                        backgroundColor: isDone
                          ? 'var(--color-primary, #06b6d4)'
                          : 'rgba(51, 65, 85, 0.6)',
                      }}
                    />
                  )}
                  <div className="flex items-center gap-1">
                    <div
                      className="w-1.5 h-1.5 rounded-full transition-all duration-300"
                      style={{
                        backgroundColor: isDone
                          ? 'var(--color-primary, #06b6d4)'
                          : isCurrent
                            ? 'var(--color-primary, #06b6d4)'
                            : 'rgba(51, 65, 85, 0.6)',
                        boxShadow: isCurrent
                          ? '0 0 6px var(--color-primary, #06b6d4)'
                          : 'none',
                      }}
                    />
                    <span
                      className={`text-[9px] transition-colors ${
                        isDone
                          ? 'text-primary'
                          : isCurrent
                            ? 'text-text-primary'
                            : 'text-text-muted'
                      }`}
                    >
                      {p === 'initializing-worker'
                        ? 'Engine'
                        : p === 'loading-language'
                          ? 'Language'
                          : 'Recognizing'}
                    </span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>

          {/* Timeout warning for local mode */}
          {activeMode === 'local' && phase === 'initializing-worker' && (
            <p className="text-center text-[10px] text-[#F59E0B]">
              Tesseract initialization can take 30+ seconds in Chrome extensions.
              Consider using AI Vision mode instead.
            </p>
          )}

          <button
            onClick={handleCancel}
            className="text-[10px] text-text-muted hover:text-error transition-colors cursor-pointer flex items-center gap-1 mx-auto mt-1"
          >
            <X size={10} />
            Cancel
          </button>
        </div>
      )}

      {/* OCR Results */}
      {ocrParagraphs.length > 0 && (
        <div className="space-y-2">
          {/* Stats Row */}
          <div
            className="flex items-center gap-3 px-3 py-2 rounded-lg"
            style={{ backgroundColor: 'rgba(30, 41, 59, 0.3)' }}
          >
            <div className="flex items-center gap-1">
              <Hash size={10} className="text-text-muted" />
              <span className="text-[10px] text-text-muted">{wordCount} words</span>
            </div>
            {processingTime && (
              <div className="flex items-center gap-1">
                <Clock size={10} className="text-text-muted" />
                <span className="text-[10px] text-text-muted">{formatTime(processingTime)}</span>
              </div>
            )}
            {usedMethod && (
              <div className="flex items-center gap-1">
                {getModeIcon(usedMethod)}
                <span className="text-[10px] text-text-muted">{getModeLabel(usedMethod)}</span>
              </div>
            )}
            <div className="flex items-center gap-1 ml-auto">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: getConfidenceColor(overallConfidence) }}
              />
              <span
                className="text-[10px] font-medium"
                style={{ color: getConfidenceColor(overallConfidence) }}
              >
                {overallConfidence}% confidence
              </span>
            </div>
          </div>

          {/* Results Area */}
          <div
            className="rounded-xl overflow-y-auto scrollbar-thin p-3 space-y-3"
            style={{
              backgroundColor: 'rgba(30, 41, 59, 0.5)',
              border: '1px solid rgba(255,255,255,0.05)',
              maxHeight: '300px',
            }}
          >
            {ocrParagraphs.map((para, index) => (
              <div
                key={index}
                className="pl-3 py-1"
                style={{ borderLeft: `3px solid ${getConfidenceColor(para.confidence)}` }}
              >
                <p className="text-xs text-text-secondary leading-relaxed">{para.text}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: getConfidenceColor(para.confidence) }}
                  />
                  <span
                    className="text-[9px] font-medium"
                    style={{ color: getConfidenceColor(para.confidence) }}
                  >
                    {getConfidenceLabel(para.confidence)} ({para.confidence}%)
                  </span>
                  {para.words.length > 0 && (
                    <span className="text-[9px] text-text-muted">{para.words.length} words</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Info & Re-extract */}
          <div
            className="flex items-center justify-between px-3 py-2 rounded-lg"
            style={{ backgroundColor: 'rgba(30, 41, 59, 0.3)' }}
          >
            <span className="text-[10px] text-text-muted">
              {ocrParagraphs.length} paragraph{ocrParagraphs.length !== 1 ? 's' : ''} detected
            </span>
            <button
              onClick={handleExtract}
              disabled={isProcessing}
              className="flex items-center gap-1 text-[10px] text-primary hover:text-primary-dark transition-colors cursor-pointer disabled:opacity-50"
            >
              {isProcessing ? <Loader2 size={10} className="animate-spin" /> : <FileText size={10} />}
              Re-extract
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
