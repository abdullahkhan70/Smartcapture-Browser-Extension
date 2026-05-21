/**
 * SmartCapture Pro - Daily Quota Hook
 *
 * Tracks daily usage of OCR and Visual Diff features.
 * Each feature has a limit (default 10/day) that resets at midnight.
 * Uses chrome.storage.local to persist usage across popup closes.
 *
 * Quota keys stored in chrome.storage.local:
 *   smartcapture-quota-ocr:  { date: 'YYYY-MM-DD', count: number }
 *   smartcapture-quota-diff: { date: 'YYYY-MM-DD', count: number }
 */

import { useState, useCallback, useEffect } from 'react';

// ===== Types =====

export type QuotaFeature = 'ocr' | 'diff';

export interface QuotaState {
  ocr: { used: number; limit: number };
  diff: { used: number; limit: number };
}

export interface QuotaInfo {
  used: number;
  limit: number;
  remaining: number;
  isExhausted: boolean;
}

// ===== Constants =====

const DAILY_LIMIT_OCR = 10;
const DAILY_LIMIT_DIFF = 10;

const STORAGE_KEYS: Record<QuotaFeature, string> = {
  ocr: 'smartcapture-quota-ocr',
  diff: 'smartcapture-quota-diff',
};

// ===== Helpers =====

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function isChromeStorageAvailable(): boolean {
  try {
    return !!(typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local);
  } catch {
    return false;
  }
}

interface StoredQuota {
  date: string;
  count: number;
}

async function readStoredQuota(feature: QuotaFeature): Promise<number> {
  if (!isChromeStorageAvailable()) return 0;

  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS[feature]], (result) => {
      const stored: StoredQuota | undefined = result[STORAGE_KEYS[feature]];
      if (!stored) {
        resolve(0);
        return;
      }
      // Reset if the date has changed (new day)
      if (stored.date !== getTodayDate()) {
        resolve(0);
        return;
      }
      resolve(stored.count);
    });
  });
}

async function writeStoredQuota(feature: QuotaFeature, count: number): Promise<void> {
  if (!isChromeStorageAvailable()) return;

  const data: StoredQuota = { date: getTodayDate(), count };
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS[feature]]: data }, () => resolve());
  });
}

// ===== Hook =====

export function useQuota() {
  const [quotaState, setQuotaState] = useState<QuotaState>({
    ocr: { used: 0, limit: DAILY_LIMIT_OCR },
    diff: { used: 0, limit: DAILY_LIMIT_DIFF },
  });

  const [isLoaded, setIsLoaded] = useState(false);

  // Load stored quotas on mount
  useEffect(() => {
    async function loadQuotas() {
      const [ocrUsed, diffUsed] = await Promise.all([
        readStoredQuota('ocr'),
        readStoredQuota('diff'),
      ]);
      setQuotaState({
        ocr: { used: ocrUsed, limit: DAILY_LIMIT_OCR },
        diff: { used: diffUsed, limit: DAILY_LIMIT_DIFF },
      });
      setIsLoaded(true);
    }
    loadQuotas();
  }, []);

  const getQuotaInfo = useCallback((feature: QuotaFeature): QuotaInfo => {
    const { used, limit } = quotaState[feature];
    return {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      isExhausted: used >= limit,
    };
  }, [quotaState]);

  const incrementUsage = useCallback(async (feature: QuotaFeature): Promise<boolean> => {
    const current = quotaState[feature];
    if (current.used >= current.limit) {
      return false; // quota exhausted
    }

    const newUsed = current.used + 1;
    await writeStoredQuota(feature, newUsed);

    setQuotaState((prev) => ({
      ...prev,
      [feature]: { ...prev[feature], used: newUsed },
    }));

    return true; // successfully incremented
  }, [quotaState]);

  const checkQuota = useCallback((feature: QuotaFeature): boolean => {
    return quotaState[feature].used < quotaState[feature].limit;
  }, [quotaState]);

  return {
    quotaState,
    isLoaded,
    getQuotaInfo,
    incrementUsage,
    checkQuota,
  };
}
