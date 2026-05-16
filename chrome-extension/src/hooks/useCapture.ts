/**
 * SmartCapture Pro - useCapture Hook
 * React hook that manages capture state, progress tracking,
 * and communication with the background service worker.
 *
 * KEY FIX: Updates the Zustand store (isCapturing, captureProgress) so the
 * App.tsx capture progress overlay can display section-by-section progress.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { CaptureProgress, CaptureFormat, Capture, MessageType } from '@/lib/types';
import {
  startCapture,
  captureVisible,
  cancelCapture as sendCancelCapture,
} from '@/lib/messages';
import { useAppStore } from '@/store';
import { storage } from '@/lib/storage';

// ===== Types =====

interface UseCaptureOptions {
  format?: CaptureFormat;
  quality?: number;
  smartScroll?: boolean;
}

interface UseCaptureReturn {
  isCapturing: boolean;
  progress: CaptureProgress;
  error: string | null;
  startFullPageCapture: (options?: UseCaptureOptions) => Promise<void>;
  startVisibleCapture: (options?: UseCaptureOptions) => Promise<void>;
  cancel: () => void;
  clearError: () => void;
}

// ===== Constants =====

const defaultProgress: CaptureProgress = {
  status: 'idle',
  current: 0,
  total: 0,
  percentage: 0,
};

// ===== Hook =====

export function useCapture(): UseCaptureReturn {
  const [isCapturing, setIsCapturing] = useState(false);
  const [progress, setProgress] = useState<CaptureProgress>(defaultProgress);
  const [error, setError] = useState<string | null>(null);
  const captureRef = useRef(false);

  const addCapture = useAppStore((s) => s.addCapture);
  const setSelectedCapture = useAppStore((s) => s.setSelectedCapture);
  const setView = useAppStore((s) => s.setView);
  const storeSetIsCapturing = useAppStore((s) => s.setIsCapturing);
  const storeSetCaptureProgress = useAppStore((s) => s.setCaptureProgress);

  /**
   * Persist a capture to IndexedDB for cross-session access.
   * Uses put() to handle re-inserts gracefully (same ID = overwrite).
   */
  const persistCaptureToIDB = useCallback(async (capture: Capture) => {
    try {
      await storage.init();
      await storage.addCapture(capture).catch(async () => {
        // If addCapture fails (duplicate key), use update instead
        await storage.updateCapture(capture.id, capture);
      });
    } catch (err) {
      console.warn('[SmartCapture] Failed to persist capture to IndexedDB:', err);
    }
  }, []);

  /**
   * Helper: sync local state to both local useState AND Zustand store
   */
  const syncCapturingState = useCallback((capturing: boolean, prog: CaptureProgress) => {
    setIsCapturing(capturing);
    setProgress(prog);
    // Also update Zustand store so App.tsx overlay can read it
    storeSetIsCapturing(capturing);
    storeSetCaptureProgress(prog);
  }, [storeSetIsCapturing, storeSetCaptureProgress]);

  // Listen for capture progress, completion, and error messages
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      return;
    }

    const listener = (
      message: { type: string; payload?: CaptureProgress | { capture: Capture } | { error: string; code?: string } },
    ) => {
      if (!captureRef.current && message.type !== MessageType.CAPTURE_COMPLETE && message.type !== MessageType.CAPTURE_ERROR) {
        return;
      }

      switch (message.type) {
        case MessageType.CAPTURE_PROGRESS: {
          const payload = message.payload as CaptureProgress;
          setProgress(payload);
          // Update Zustand store progress so the overlay shows it
          storeSetCaptureProgress(payload);
          break;
        }
        case MessageType.CAPTURE_COMPLETE: {
          const payload = message.payload as { capture: Capture };
          const capture = payload.capture;

          const completeProgress: CaptureProgress = { status: 'complete', current: 1, total: 1, percentage: 100 };
          setIsCapturing(false);
          setProgress(completeProgress);
          setError(null);
          captureRef.current = false;

          // Update Zustand store
          storeSetIsCapturing(false);
          storeSetCaptureProgress(completeProgress);

          // Add to Zustand store and navigate to preview
          if (capture) {
            addCapture(capture);
            setSelectedCapture(capture);
            setView('preview');

            // Persist to IndexedDB for cross-session access
            persistCaptureToIDB(capture);
          }
          break;
        }
        case MessageType.CAPTURE_ERROR: {
          const payload = message.payload as { error: string; code?: string };
          setIsCapturing(false);
          setError(payload?.error ?? 'Capture failed');
          setProgress(defaultProgress);
          captureRef.current = false;

          // Update Zustand store
          storeSetIsCapturing(false);
          storeSetCaptureProgress(defaultProgress);
          break;
        }
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [addCapture, setSelectedCapture, setView, persistCaptureToIDB, storeSetIsCapturing, storeSetCaptureProgress]);

  /**
   * Start a full-page capture
   */
  const startFullPageCapture = useCallback(
    async (options?: UseCaptureOptions) => {
      if (captureRef.current) return;

      captureRef.current = true;
      const initProgress: CaptureProgress = { status: 'capturing', current: 0, total: 0, percentage: 0 };
      setIsCapturing(true);
      setProgress(initProgress);
      setError(null);

      // Update Zustand store so the popup overlay shows
      storeSetIsCapturing(true);
      storeSetCaptureProgress(initProgress);

      try {
        await startCapture({
          format: options?.format ?? 'png',
          quality: options?.quality ?? 90,
          fullPage: true,
          smartScroll: options?.smartScroll ?? true,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start capture';
        setError(message);
        setIsCapturing(false);
        setProgress(defaultProgress);
        captureRef.current = false;
        storeSetIsCapturing(false);
        storeSetCaptureProgress(defaultProgress);
      }
    },
    [storeSetIsCapturing, storeSetCaptureProgress]
  );

  /**
   * Start a visible-area-only capture
   */
  const startVisibleCapture = useCallback(
    async (options?: UseCaptureOptions) => {
      if (captureRef.current) return;

      captureRef.current = true;
      const initProgress: CaptureProgress = { status: 'capturing', current: 0, total: 1, percentage: 0 };
      setIsCapturing(true);
      setProgress(initProgress);
      setError(null);

      // Update Zustand store
      storeSetIsCapturing(true);
      storeSetCaptureProgress(initProgress);

      try {
        await captureVisible(options?.format ?? 'png');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start capture';
        setError(message);
        setIsCapturing(false);
        setProgress(defaultProgress);
        captureRef.current = false;
        storeSetIsCapturing(false);
        storeSetCaptureProgress(defaultProgress);
      }
    },
    [storeSetIsCapturing, storeSetCaptureProgress]
  );

  /**
   * Cancel an in-progress capture
   */
  const cancel = useCallback(async () => {
    await sendCancelCapture();
    captureRef.current = false;
    setIsCapturing(false);
    setProgress(defaultProgress);
    setError(null);
    storeSetIsCapturing(false);
    storeSetCaptureProgress(defaultProgress);
  }, [storeSetIsCapturing, storeSetCaptureProgress]);

  /**
   * Clear the current error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isCapturing,
    progress,
    error,
    startFullPageCapture,
    startVisibleCapture,
    cancel,
    clearError,
  };
}
