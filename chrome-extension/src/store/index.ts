import { create } from 'zustand';
import { Capture, Settings, CaptureProgress } from '@/lib/types';
import { DEFAULT_SETTINGS } from '@/lib/constants';
import { QuotaState, QuotaFeature, QuotaInfo } from '@/hooks/useQuota';

export type AppView = 'main' | 'gallery' | 'settings' | 'preview' | 'annotate' | 'ocr' | 'export' | 'diff' | 'diff-select';

interface AppState {
  // Navigation
  currentView: AppView;
  previousView: AppView | null;
  viewHistory: AppView[];

  // Captures
  captures: Capture[];
  selectedCapture: Capture | null;
  captureSearchQuery: string;

  // Diff view
  diffCaptureBefore: string | null;
  diffCaptureAfter: string | null;

  // Settings
  settings: Settings;

  // Daily Quota
  quota: QuotaState;
  quotaLoaded: boolean;

  // UI State
  isSidebarOpen: boolean;
  isLoading: boolean;
  isCapturing: boolean;
  captureProgress: CaptureProgress | null;

  // Actions - Navigation
  setView: (view: AppView) => void;
  goBack: () => void;

  // Actions - Captures
  setCaptures: (captures: Capture[]) => void;
  setSelectedCapture: (capture: Capture | null) => void;
  addCapture: (capture: Capture) => void;
  removeCapture: (id: string) => void;
  updateCapture: (id: string, updates: Partial<Capture>) => void;
  setCaptureSearchQuery: (query: string) => void;

  // Actions - Settings
  setSettings: (settings: Partial<Settings>) => void;

  // Actions - Diff
  setDiffImages: (before: string, after: string) => void;
  clearDiffImages: () => void;

  // Actions - Quota
  setQuota: (quota: QuotaState) => void;
  setQuotaLoaded: (loaded: boolean) => void;
  incrementQuotaUsage: (feature: QuotaFeature) => void;
  checkQuotaAvailable: (feature: QuotaFeature) => boolean;
  getQuotaInfo: (feature: QuotaFeature) => QuotaInfo;

  // Actions - UI
  toggleSidebar: () => void;
  setLoading: (loading: boolean) => void;
  setIsCapturing: (capturing: boolean) => void;
  setCaptureProgress: (progress: CaptureProgress | null) => void;

  // Reset
  reset: () => void;
}

const DAILY_LIMIT_OCR = 10;
const DAILY_LIMIT_DIFF = 10;

const initialQuota: QuotaState = {
  ocr: { used: 0, limit: DAILY_LIMIT_OCR },
  diff: { used: 0, limit: DAILY_LIMIT_DIFF },
};

const initialState = {
  currentView: 'main' as AppView,
  previousView: null as AppView | null,
  viewHistory: [] as AppView[],
  captures: [] as Capture[],
  selectedCapture: null as Capture | null,
  captureSearchQuery: '',
  settings: DEFAULT_SETTINGS,
  isSidebarOpen: false,
  isLoading: false,
  isCapturing: false,
  captureProgress: null as CaptureProgress | null,
  diffCaptureBefore: null as string | null,
  diffCaptureAfter: null as string | null,
  quota: initialQuota,
  quotaLoaded: false,
};

export const useAppStore = create<AppState>((set, get) => ({
  ...initialState,

  // Navigation
  setView: (view) => {
    const { currentView, viewHistory } = get();
    set({
      currentView: view,
      previousView: currentView,
      viewHistory: [...viewHistory, currentView],
    });
  },

  goBack: () => {
    const { viewHistory } = get();
    if (viewHistory.length > 0) {
      const newHistory = [...viewHistory];
      const previousView = newHistory.pop()!;
      set({
        currentView: previousView,
        previousView: viewHistory.length > 1 ? viewHistory[viewHistory.length - 2] : null,
        viewHistory: newHistory,
      });
    } else {
      set({ currentView: 'main', previousView: null });
    }
  },

  // Captures
  setCaptures: (captures) => set({ captures }),

  setSelectedCapture: (capture) => set({ selectedCapture: capture }),

  addCapture: (capture) =>
    set((state) => ({
      captures: [capture, ...state.captures],
    })),

  removeCapture: (id) =>
    set((state) => ({
      captures: state.captures.filter((c) => c.id !== id),
      selectedCapture:
        state.selectedCapture?.id === id ? null : state.selectedCapture,
    })),

  updateCapture: (id, updates) =>
    set((state) => ({
      captures: state.captures.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
      selectedCapture:
        state.selectedCapture?.id === id
          ? { ...state.selectedCapture, ...updates }
          : state.selectedCapture,
    })),

  setCaptureSearchQuery: (query) => set({ captureSearchQuery: query }),

  // Settings
  setSettings: (updates) =>
    set((state) => ({
      settings: { ...state.settings, ...updates },
    })),

  // Diff
  setDiffImages: (before, after) => set({ diffCaptureBefore: before, diffCaptureAfter: after }),
  clearDiffImages: () => set({ diffCaptureBefore: null, diffCaptureAfter: null }),

  // Quota
  setQuota: (quota) => set({ quota }),
  setQuotaLoaded: (loaded) => set({ quotaLoaded: loaded }),
  incrementQuotaUsage: (feature) =>
    set((state) => {
      const current = state.quota[feature];
      if (current.used >= current.limit) return state; // already exhausted
      return {
        quota: {
          ...state.quota,
          [feature]: { ...current, used: current.used + 1 },
        },
      };
    }),
  checkQuotaAvailable: (feature) => {
    const { quota } = get();
    return quota[feature].used < quota[feature].limit;
  },
  getQuotaInfo: (feature) => {
    const { quota } = get();
    const { used, limit } = quota[feature];
    return {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      isExhausted: used >= limit,
    };
  },

  // UI
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setLoading: (isLoading) => set({ isLoading }),
  setIsCapturing: (isCapturing) => set({ isCapturing }),
  setCaptureProgress: (captureProgress) => set({ captureProgress }),

  // Reset
  reset: () => set(initialState),
}));
