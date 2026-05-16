import { CaptureFormat, Settings } from './types';

// ===== App Info =====
export const APP_NAME = 'SmartCapture Pro';
export const VERSION = '1.0.0';

// ===== Color Palette =====
export const COLORS = {
  primary: '#0EA5E9',
  primaryDark: '#0284C7',
  primaryLight: '#38BDF8',
  surfaceDark: '#0F172A',
  surfaceCard: '#1E293B',
  surfaceElevated: '#334155',
  surfaceHover: '#475569',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#0EA5E9',
} as const;

// ===== Default Settings =====
export const DEFAULT_SETTINGS: Settings = {
  defaultFormat: 'png' as CaptureFormat,
  defaultQuality: 90,
  theme: 'dark',
  captureDelay: 100,
  preScrollEnabled: true,
  autoCropEnabled: true,
  smartScrollEnabled: true,
  fixedElementHandling: true,
};

// ===== Capture Settings =====
export const CAPTURE_DELAY = 100; // ms between captures
export const SCROLL_STEP = 500; // pixels per scroll step
export const MAX_CAPTURE_WIDTH = 4000; // max canvas width
export const MIN_SCROLL_OVERLAP = 0.25; // 25% viewport overlap between slices to prevent gaps
export const SCROLL_SETTLE_DELAY = 200; // ms to wait after scroll for layout to stabilize (reduced from 500ms for speed)
export const IMAGE_LOAD_TIMEOUT = 3000; // ms to wait for images to load in viewport
export const MAX_CANVAS_HEIGHT = 15000; // Max canvas height in pixels before splitting (Chrome fails above ~16K-32K)
export const JPEG_QUALITY = 0.92;
export const THUMBNAIL_MAX_WIDTH = 300;
export const THUMBNAIL_MAX_HEIGHT = 200;

// ===== Storage Keys =====
export const STORAGE_KEYS = {
  SETTINGS: 'smartcapture-settings',
  CAPTURES_COUNT: 'smartcapture-captures-count',
  LAST_CAPTURE: 'smartcapture-last-capture',
} as const;

// ===== IndexedDB =====
export const DB_NAME = 'smartcapture-pro';
export const DB_VERSION = 1;
export const STORE_NAMES = {
  CAPTURES: 'captures',
  SETTINGS: 'settings',
} as const;

// ===== UI Constants =====
export const POPUP_WIDTH = 350;
export const POPUP_MAX_HEIGHT = 600;
export const MAX_RECENT_CAPTURES = 5;
export const CAPTURES_PER_PAGE = 20;
export const ANNOTATION_COLORS = [
  '#EF4444', // Red
  '#F59E0B', // Amber
  '#10B981', // Green
  '#0EA5E9', // Blue
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#FFFFFF', // White
  '#000000', // Black
] as const;
