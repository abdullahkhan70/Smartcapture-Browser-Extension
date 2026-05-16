import { useState, useEffect, useCallback } from 'react';
import { Settings } from '@/lib/types';
import { DEFAULT_SETTINGS } from '@/lib/constants';
import { storage } from '@/lib/storage';
import { useAppStore } from '@/store';

interface UseSettingsReturn {
  settings: Settings;
  isLoading: boolean;
  error: string | null;
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
  resetSettings: () => Promise<void>;
}

export function useSettings(): UseSettingsReturn {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const settings = useAppStore((state) => state.settings);
  const setStoreSettings = useAppStore((state) => state.setSettings);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        await storage.init();
        const savedSettings = await storage.getSettings();
        setStoreSettings(savedSettings);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [setStoreSettings]);

  const updateSettings = useCallback(async (updates: Partial<Settings>) => {
    try {
      const updated = await storage.updateSettings(updates);
      setStoreSettings(updated);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
    }
  }, [setStoreSettings]);

  const resetSettings = useCallback(async () => {
    try {
      const restored = await storage.updateSettings(DEFAULT_SETTINGS);
      setStoreSettings(restored);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset settings');
    }
  }, [setStoreSettings]);

  return {
    settings,
    isLoading,
    error,
    updateSettings,
    resetSettings,
  };
}
