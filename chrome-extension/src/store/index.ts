import { create } from 'zustand';
import { Capture, Settings, CaptureProgress } from '@/lib/types';
import { DEFAULT_SETTINGS } from '@/lib/constants';

export type AppView = 'main' | 'gallery' | 'settings' | 'preview' | 'annotate' | 'ocr' | 'export' | 'diff';

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

  // Actions - UI
  toggleSidebar: () => void;
  setLoading: (loading: boolean) => void;
  setIsCapturing: (capturing: boolean) => void;
  setCaptureProgress: (progress: CaptureProgress | null) => void;

  // Reset
  reset: () => void;
}

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

  // UI
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setLoading: (isLoading) => set({ isLoading }),
  setIsCapturing: (isCapturing) => set({ isCapturing }),
  setCaptureProgress: (captureProgress) => set({ captureProgress }),

  // Reset
  reset: () => set(initialState),
}));
