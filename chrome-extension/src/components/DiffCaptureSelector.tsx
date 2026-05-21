/**
 * SmartCapture Pro - Diff Capture Selector
 *
 * A two-step selection UI where the user picks "Before" and "After"
 * captures from the gallery to compare via Visual Diff.
 *
 * Includes:
 * - Progress indicator showing how far along the selection process is
 * - Daily quota check (10 visual diffs per day)
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  Search,
  GitCompare,
  Check,
  ArrowRight,
  X,
  ImageOff,
  Loader2,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { useAppStore } from '@/store';
import { useGallery } from '@/hooks/useGallery';
import { Capture } from '@/lib/types';
import { storage } from '@/lib/storage';

type SelectionStep = 'before' | 'after';

interface DiffCaptureSelectorProps {
  /** If provided, this capture is pre-selected as "before" */
  preselectedCapture?: Capture;
}

export function DiffCaptureSelector({ preselectedCapture }: DiffCaptureSelectorProps) {
  const goBack = useAppStore((s) => s.goBack);
  const setDiffImages = useAppStore((s) => s.setDiffImages);
  const setView = useAppStore((s) => s.setView);
  const quotaInfo = useAppStore((s) => s.getQuotaInfo('diff'));
  const incrementQuotaUsage = useAppStore((s) => s.incrementQuotaUsage);

  const {
    filteredCaptures,
    isLoading,
    searchQuery,
    setSearchQuery,
    loadFullCapture,
  } = useGallery();

  const [step, setStep] = useState<SelectionStep>(
    preselectedCapture ? 'after' : 'before'
  );
  const [beforeCapture, setBeforeCapture] = useState<Capture | null>(
    preselectedCapture || null
  );
  const [afterCapture, setAfterCapture] = useState<Capture | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);

  const displayedCaptures = useMemo(() => {
    return filteredCaptures.slice(0, 30);
  }, [filteredCaptures]);

  // Overall selection progress: 0% → 50% → 100%
  const selectionProgress = useMemo(() => {
    if (beforeCapture && afterCapture) return 100;
    if (beforeCapture) return 50;
    return 0;
  }, [beforeCapture, afterCapture]);

  // Load full capture data (including imageData) when selecting
  const selectCapture = useCallback(async (capture: Capture) => {
    setLoadingId(capture.id);
    setLoadingProgress(10);
    try {
      let full = capture;
      if (!capture.imageData) {
        setLoadingProgress(30);
        const loaded = await loadFullCapture(capture.id);
        setLoadingProgress(80);
        if (loaded) full = loaded;
      }
      setLoadingProgress(100);
      if (step === 'before') {
        setBeforeCapture(full);
        setStep('after');
      } else {
        setAfterCapture(full);
      }
    } finally {
      setLoadingId(null);
      setLoadingProgress(0);
    }
  }, [step, loadFullCapture]);

  const handleCompare = useCallback(async () => {
    if (!beforeCapture?.imageData || !afterCapture?.imageData) return;
    if (quotaInfo.isExhausted) return;

    // Ensure we have the full imageData for both captures
    let beforeData = beforeCapture.imageData;
    let afterData = afterCapture.imageData;

    // If either is missing full data, try loading from storage
    if (!beforeData || beforeData.length < 100) {
      try {
        await storage.init();
        const loaded = await storage.getCapture(beforeCapture.id);
        if (loaded?.imageData) beforeData = loaded.imageData;
      } catch { /* use what we have */ }
    }
    if (!afterData || afterData.length < 100) {
      try {
        await storage.init();
        const loaded = await storage.getCapture(afterCapture.id);
        if (loaded?.imageData) afterData = loaded.imageData;
      } catch { /* use what we have */ }
    }

    // Increment quota usage
    incrementQuotaUsage('diff');

    setDiffImages(beforeData, afterData);
    setView('diff');
  }, [beforeCapture, afterCapture, setDiffImages, setView, quotaInfo.isExhausted, incrementQuotaUsage]);

  const clearSelection = useCallback((which: 'before' | 'after') => {
    if (which === 'before') {
      setBeforeCapture(null);
      setStep('before');
      setAfterCapture(null);
    } else {
      setAfterCapture(null);
      setStep('after');
    }
  }, []);

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const canCompare = beforeCapture && afterCapture && !quotaInfo.isExhausted;
  const isCaptureSelected = (id: string) =>
    beforeCapture?.id === id || afterCapture?.id === id;

  return (
    <div className="p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={goBack}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-smooth cursor-pointer"
          >
            <ArrowLeft size={16} />
          </button>
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <GitCompare size={16} className="text-[#F59E0B]" />
            Visual Diff
          </h3>
        </div>

        <div className="flex items-center gap-2">
          {/* Quota indicator */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md"
            style={{
              backgroundColor: quotaInfo.isExhausted ? 'rgba(239, 68, 68, 0.12)' : 'rgba(30, 41, 59, 0.5)',
              border: quotaInfo.isExhausted ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <span className="text-[9px] font-mono font-medium"
              style={{ color: quotaInfo.isExhausted ? '#EF4444' : quotaInfo.remaining <= 3 ? '#F59E0B' : '#64748B' }}
            >
              {quotaInfo.used}/{quotaInfo.limit}
            </span>
          </div>

          {/* Selection Progress */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-medium" style={{
              color: selectionProgress === 100 ? '#22C55E' : selectionProgress === 50 ? '#F59E0B' : '#64748B'
            }}>
              {selectionProgress}%
            </span>
            <div className="w-16 h-1.5 rounded-full bg-surface-elevated overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${selectionProgress}%`,
                  backgroundColor: selectionProgress === 100 ? '#22C55E' : selectionProgress === 50 ? '#F59E0B' : '#334155',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Quota Exhausted Message */}
      {quotaInfo.isExhausted && (
        <div
          className="rounded-xl p-4"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
          }}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-[#EF4444] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[#EF4444] mb-1">
                You have reached today's quota
              </p>
              <p className="text-[11px] text-text-secondary leading-relaxed">
                You've used all {quotaInfo.limit} visual diff comparisons for today. Your quota will reset at midnight.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {/* Step 1: Before */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg flex-1"
          style={{
            backgroundColor: step === 'before' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(30, 41, 59, 0.5)',
            border: step === 'before' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{
              backgroundColor: beforeCapture ? '#22C55E' : step === 'before' ? '#F59E0B' : '#334155',
              color: beforeCapture ? '#fff' : step === 'before' ? '#000' : '#64748B',
            }}
          >
            {beforeCapture ? <Check size={12} /> : '1'}
          </div>
          <span className={`text-[10px] font-medium ${step === 'before' ? 'text-[#F59E0B]' : beforeCapture ? 'text-[#22C55E]' : 'text-text-muted'}`}>
            {beforeCapture ? beforeCapture.title?.slice(0, 18) || 'Selected' : 'Before'}
          </span>
          {beforeCapture && (
            <button
              onClick={() => clearSelection('before')}
              className="ml-auto text-text-muted hover:text-[#EF4444] cursor-pointer"
            >
              <X size={10} />
            </button>
          )}
        </div>

        <ArrowRight size={12} className="text-text-muted shrink-0" />

        {/* Step 2: After */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg flex-1"
          style={{
            backgroundColor: step === 'after' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(30, 41, 59, 0.5)',
            border: step === 'after' ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{
              backgroundColor: afterCapture ? '#22C55E' : step === 'after' ? '#F59E0B' : '#334155',
              color: afterCapture ? '#fff' : step === 'after' ? '#000' : '#64748B',
            }}
          >
            {afterCapture ? <Check size={12} /> : '2'}
          </div>
          <span className={`text-[10px] font-medium ${step === 'after' ? 'text-[#F59E0B]' : afterCapture ? 'text-[#22C55E]' : 'text-text-muted'}`}>
            {afterCapture ? afterCapture.title?.slice(0, 18) || 'Selected' : 'After'}
          </span>
          {afterCapture && (
            <button
              onClick={() => clearSelection('after')}
              className="ml-auto text-text-muted hover:text-[#EF4444] cursor-pointer"
            >
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          type="text"
          placeholder="Search captures..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-8 py-2 bg-surface-card border rounded-lg text-sm text-text-primary placeholder:text-text-muted
            focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/25 transition-smooth"
          style={{ borderColor: 'rgba(255,255,255,0.1)' }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Instruction */}
      <p className="text-[10px] text-text-muted text-center">
        {quotaInfo.isExhausted
          ? 'Daily quota reached — come back tomorrow'
          : step === 'before'
            ? 'Select the first capture (before)'
            : 'Select the second capture (after) to compare'}
      </p>

      {/* Capture List */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-1.5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="rounded-lg animate-shimmer"
              style={{ height: '80px', backgroundColor: '#1E293B' }}
            />
          ))}
        </div>
      ) : displayedCaptures.length === 0 ? (
        <div className="text-center py-6">
          <ImageOff size={20} className="text-text-muted opacity-40 mx-auto mb-2" />
          <p className="text-xs text-text-muted">
            {searchQuery ? 'No captures found' : 'No captures yet'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 max-h-72 overflow-y-auto scrollbar-thin">
          {displayedCaptures.map((capture) => {
            const selected = isCaptureSelected(capture.id);
            const isBefore = beforeCapture?.id === capture.id;
            const isAfter = afterCapture?.id === capture.id;
            const isLoadingThis = loadingId === capture.id;

            return (
              <button
                key={capture.id}
                onClick={() => !selected && !quotaInfo.isExhausted && selectCapture(capture)}
                disabled={selected || quotaInfo.isExhausted}
                className={`relative rounded-lg overflow-hidden cursor-pointer transition-smooth group
                  ${selected ? 'ring-2 ring-primary' : 'hover:ring-1 hover:ring-primary/30'}
                  ${quotaInfo.isExhausted ? 'opacity-50' : ''}`}
                style={{
                  backgroundColor: '#1E293B',
                  border: selected
                    ? 'none'
                    : '1px solid rgba(255,255,255,0.05)',
                }}
              >
                {/* Loading overlay with progress */}
                {isLoadingThis && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 rounded-lg gap-1.5">
                    <Loader2 size={14} className="text-primary animate-spin" />
                    <span className="text-[9px] font-mono text-primary font-medium">
                      {loadingProgress}%
                    </span>
                    <div className="w-10 h-0.5 rounded-full bg-surface-elevated overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-200"
                        style={{ width: `${loadingProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Selection badge */}
                {selected && (
                  <div
                    className="absolute top-1 left-1 z-10 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase"
                    style={{
                      backgroundColor: isBefore ? '#F59E0B' : '#22C55E',
                      color: '#000',
                    }}
                  >
                    {isBefore ? 'Before' : 'After'}
                  </div>
                )}

                {/* Thumbnail */}
                <div className="relative" style={{ paddingBottom: '62.5%' }}>
                  <div className="absolute inset-0 bg-surface-elevated overflow-hidden">
                    {capture.thumbnail ? (
                      <img
                        src={capture.thumbnail}
                        alt={capture.title}
                        className="w-full h-full object-cover"
                      />
                    ) : capture.imageData ? (
                      <img
                        src={capture.imageData}
                        alt={capture.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageOff size={12} className="text-text-muted opacity-30" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Info */}
                <div className="p-1.5">
                  <p className="text-[9px] font-medium text-text-primary truncate leading-tight">
                    {capture.title}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock size={7} className="text-text-muted" />
                    <span className="text-[8px] text-text-muted">
                      {formatTime(capture.timestamp)}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Compare Button */}
      <button
        onClick={handleCompare}
        disabled={!canCompare}
        className="flex items-center justify-center gap-2 w-full h-10 rounded-lg text-sm font-semibold text-white
          bg-primary hover:bg-primary-dark active:bg-primary-dark transition-smooth cursor-pointer shadow-sm
          disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <GitCompare size={16} />
        {quotaInfo.isExhausted ? 'Daily Quota Reached' : canCompare ? 'Compare Captures' : 'Select Two Captures'}
      </button>
    </div>
  );
}
