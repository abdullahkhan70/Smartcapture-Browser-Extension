/**
 * SmartCapture Pro - useGallery Hook
 * React hook that manages gallery state by merging captures from
 * IndexedDB (popup-side) and chrome.storage.local (background-side).
 * Supports lazy loading of full capture data (imageData) on demand.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Capture } from '@/lib/types';
import { storage } from '@/lib/storage';
import { getCaptures, getFullCapture } from '@/lib/messages';
import { useAppStore } from '@/store';
import { deleteCapture as deleteCaptureFromBg } from '@/lib/messages';

export type SortOption = 'newest' | 'oldest' | 'url';

interface UseGalleryReturn {
  captures: Capture[];
  filteredCaptures: Capture[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  sortOption: SortOption;
  setSearchQuery: (query: string) => void;
  setSortOption: (sort: SortOption) => void;
  refresh: () => Promise<void>;
  deleteCapture: (id: string) => Promise<void>;
  searchCaptures: (query: string) => Promise<Capture[]>;
  loadFullCapture: (id: string) => Promise<Capture | null>;
}

export function useGallery(): UseGalleryReturn {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('newest');

  const storeCaptures = useAppStore((state) => state.captures);
  const setStoreCaptures = useAppStore((state) => state.setCaptures);
  const removeStoreCapture = useAppStore((state) => state.removeCapture);

  /**
   * Merge captures from IndexedDB and background chrome.storage.local.
   * IndexedDB captures have full imageData (if saved during CAPTURE_COMPLETE).
   * Background captures may have imageData as empty string (lazy load on demand).
   * IndexedDB takes priority — it has the full data.
   */
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 1. Load from IndexedDB (primary source — has full imageData)
      let idbCaptures: Capture[] = [];
      try {
        await storage.init();
        idbCaptures = await storage.getAllCaptures();
      } catch (err) {
        console.warn('[useGallery] IndexedDB load failed, falling back to background:', err);
      }

      // 2. Also load metadata from background chrome.storage.local
      let bgCaptures: Capture[] = [];
      try {
        const result = await getCaptures();
        if (result?.captures) {
          bgCaptures = result.captures;
        }
      } catch (err) {
        console.warn('[useGallery] Background query failed:', err);
      }

      // 3. Merge: use IndexedDB as base, add any background-only captures
      const idbIds = new Set(idbCaptures.map((c) => c.id));
      const merged: Capture[] = [...idbCaptures];

      for (const bgCapture of bgCaptures) {
        if (!idbIds.has(bgCapture.id)) {
          // This capture exists in background but not IndexedDB
          // Save it to IndexedDB for future fast access
          merged.push(bgCapture);
          try {
            await storage.addCapture(bgCapture).catch(async () => {
              await storage.updateCapture(bgCapture.id, bgCapture);
            });
          } catch {
            // Best effort — don't block the UI
          }
        }
      }

      // 4. Sort by timestamp (newest first)
      merged.sort((a, b) => b.timestamp - a.timestamp);

      setCaptures(merged);
      setStoreCaptures(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load captures');
    } finally {
      setIsLoading(false);
    }
  }, [setStoreCaptures]);

  /**
   * Delete a capture from both IndexedDB, Zustand store, and background chrome.storage.local
   */
  const deleteCapture = useCallback(async (id: string) => {
    try {
      // Delete from IndexedDB
      try {
        await storage.deleteCapture(id);
      } catch (err) {
        console.warn('[useGallery] IndexedDB delete failed:', err);
      }

      // Delete from background chrome.storage.local
      try {
        await deleteCaptureFromBg(id);
      } catch (err) {
        console.warn('[useGallery] Background delete failed:', err);
      }

      // Remove from local state and store
      setCaptures((prev) => prev.filter((c) => c.id !== id));
      removeStoreCapture(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete capture');
    }
  }, [removeStoreCapture]);

  /**
   * Lazy load full capture data (including imageData) from background.
   * Used when a gallery item has no imageData and user wants to view it.
   */
  const loadFullCapture = useCallback(async (id: string): Promise<Capture | null> => {
    try {
      // First check IndexedDB — it may have full data
      try {
        await storage.init();
        const idbCapture = await storage.getCapture(id);
        if (idbCapture?.imageData) {
          // Update local state with the full data
          setCaptures((prev) =>
            prev.map((c) => (c.id === id ? idbCapture : c))
          );
          return idbCapture;
        }
      } catch {
        // Fall through to background
      }

      // Ask background for full data
      const fullCapture = await getFullCapture(id);
      if (fullCapture?.imageData) {
        // Update local state
        setCaptures((prev) =>
          prev.map((c) => (c.id === id ? fullCapture : c))
        );

        // Also save to IndexedDB for future fast access
        try {
          await storage.addCapture(fullCapture).catch(async () => {
            await storage.updateCapture(id, fullCapture);
          });
        } catch {
          // Best effort
        }

        return fullCapture;
      }

      return null;
    } catch (err) {
      console.error('[useGallery] Failed to load full capture:', err);
      return null;
    }
  }, []);

  const searchCaptures = useCallback(async (query: string): Promise<Capture[]> => {
    try {
      // Search in local captures state (which is merged from both sources)
      const lowerQuery = query.toLowerCase().trim();
      if (!lowerQuery) return captures;

      return captures.filter((c) => {
        const titleMatch = c.title.toLowerCase().includes(lowerQuery);
        const urlMatch = c.url.toLowerCase().includes(lowerQuery);
        const ocrMatch = c.ocrText?.toLowerCase().includes(lowerQuery) ?? false;
        return titleMatch || urlMatch || ocrMatch;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      return [];
    }
  }, [captures]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Sync with store captures if they have new entries not in our local state
  useEffect(() => {
    if (storeCaptures.length > captures.length) {
      // Store has more captures (e.g., just captured) — merge
      const localIds = new Set(captures.map((c) => c.id));
      const newCaptures = storeCaptures.filter((c) => !localIds.has(c.id));
      if (newCaptures.length > 0) {
        setCaptures((prev) => {
          const merged = [...newCaptures, ...prev];
          merged.sort((a, b) => b.timestamp - a.timestamp);
          return merged;
        });
      }
    }
  }, [storeCaptures, captures]);

  const filteredCaptures = useMemo(() => {
    let result = [...captures];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.url.toLowerCase().includes(q) ||
          (c.ocrText && c.ocrText.toLowerCase().includes(q))
      );
    }

    // Sort
    switch (sortOption) {
      case 'newest':
        result.sort((a, b) => b.timestamp - a.timestamp);
        break;
      case 'oldest':
        result.sort((a, b) => a.timestamp - b.timestamp);
        break;
      case 'url':
        result.sort((a, b) => a.url.localeCompare(b.url));
        break;
    }

    return result;
  }, [captures, searchQuery, sortOption]);

  return {
    captures,
    filteredCaptures,
    isLoading,
    error,
    searchQuery,
    sortOption,
    setSearchQuery,
    setSortOption,
    refresh,
    deleteCapture,
    searchCaptures,
    loadFullCapture,
  };
}
