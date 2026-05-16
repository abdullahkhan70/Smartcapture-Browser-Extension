// ===== Capture Types =====

export type CaptureFormat = 'png' | 'jpeg' | 'pdf';

export type AnnotationType =
  | 'rectangle'
  | 'ellipse'
  | 'arrow'
  | 'freehand'
  | 'text'
  | 'highlight'
  | 'blur';

export type AnnotationTool =
  | 'select'
  | 'pan'
  | 'draw'
  | 'rectangle'
  | 'ellipse'
  | 'arrow'
  | 'text'
  | 'highlight';

export interface Annotation {
  id: string;
  type: AnnotationType;
  data: Record<string, unknown>;
  color: string;
  timestamp: number;
}

export interface Capture {
  id: string;
  url: string;
  title: string;
  imageData: string; // base64 data URL (first page or single page)
  thumbnail: string; // base64 data URL (small preview)
  timestamp: number;
  format: CaptureFormat;
  width: number;
  height: number;
  annotations: Annotation[];
  ocrText?: string;
  pages?: string[]; // Additional page data URLs for multi-page captures (pages beyond the first)
  pageCount?: number; // Total number of pages (1 = single page, >1 = split into multiple images)
}

export interface CaptureProgress {
  status: 'idle' | 'capturing' | 'stitching' | 'processing' | 'complete' | 'error';
  current: number;
  total: number;
  percentage: number;
}

// ===== Settings Types =====

export interface Settings {
  defaultFormat: CaptureFormat;
  defaultQuality: number; // 0-100
  theme: 'dark' | 'light';
  captureDelay: number; // ms
  preScrollEnabled: boolean;
  autoCropEnabled: boolean;
  smartScrollEnabled: boolean;
  fixedElementHandling: boolean;
}

// ===== Fixed Element Types =====

export interface FixedElement {
  tagName: string;
  id: string;
  className: string;
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
  position: string;
}

export interface PageDimensions {
  scrollWidth: number;
  scrollHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  fixedElements: FixedElement[];
}

export interface PageInfo {
  url: string;
  title: string;
  timestamp: number;
}

export interface ScrollPosition {
  x: number;
  y: number;
}

// ===== Message Types =====

export enum MessageType {
  // Capture messages
  CAPTURE_START = 'CAPTURE_START',
  CAPTURE_VISIBLE = 'CAPTURE_VISIBLE',
  CAPTURE_PROGRESS = 'CAPTURE_PROGRESS',
  CAPTURE_COMPLETE = 'CAPTURE_COMPLETE',
  CAPTURE_ERROR = 'CAPTURE_ERROR',
  CANCEL_CAPTURE = 'CANCEL_CAPTURE',

  // Page interaction messages
  GET_PAGE_DIMENSIONS = 'GET_PAGE_DIMENSIONS',
  PAGE_DIMENSIONS_RESPONSE = 'PAGE_DIMENSIONS_RESPONSE',
  SCROLL_TO_POSITION = 'SCROLL_TO_POSITION',
  SCROLL_COMPLETE = 'SCROLL_COMPLETE',
  CAPTURE_VISIBLE_AREA = 'CAPTURE_VISIBLE_AREA',
  VISIBLE_AREA_CAPTURED = 'VISIBLE_AREA_CAPTURED',
  GET_FIXED_ELEMENTS = 'GET_FIXED_ELEMENTS',
  HIDE_FIXED_ELEMENTS = 'HIDE_FIXED_ELEMENTS',
  SHOW_FIXED_ELEMENTS = 'SHOW_FIXED_ELEMENTS',
  DISABLE_SCROLL_SNAP = 'DISABLE_SCROLL_SNAP',
  RESTORE_SCROLL_SNAP = 'RESTORE_SCROLL_SNAP',

  // Selection capture messages
  START_SELECTION_MODE = 'START_SELECTION_MODE',
  SELECTION_COMPLETE = 'SELECTION_COMPLETE',

  // Overlay messages
  SHOW_CAPTURE_OVERLAY = 'SHOW_CAPTURE_OVERLAY',
  UPDATE_CAPTURE_OVERLAY = 'UPDATE_CAPTURE_OVERLAY',
  HIDE_CAPTURE_OVERLAY = 'HIDE_CAPTURE_OVERLAY',

  // Page info
  GET_PAGE_INFO = 'GET_PAGE_INFO',

  // Pre-scroll for lazy loading
  PRE_SCROLL_PAGE = 'PRE_SCROLL_PAGE',

  // Popup messages
  GET_CAPTURES = 'GET_CAPTURES',
  GET_CAPTURES_RESPONSE = 'GET_CAPTURES_RESPONSE',
  GET_FULL_CAPTURE = 'GET_FULL_CAPTURE',
  DELETE_CAPTURE = 'DELETE_CAPTURE',
  DELETE_CAPTURE_RESPONSE = 'DELETE_CAPTURE_RESPONSE',

  // Settings messages
  GET_SETTINGS = 'GET_SETTINGS',
  GET_SETTINGS_RESPONSE = 'GET_SETTINGS_RESPONSE',
  UPDATE_SETTINGS = 'UPDATE_SETTINGS',
  UPDATE_SETTINGS_RESPONSE = 'UPDATE_SETTINGS_RESPONSE',
}

export interface CaptureStartMessage {
  type: MessageType.CAPTURE_START;
  payload: {
    format: CaptureFormat;
    quality: number;
    fullPage: boolean;
    smartScroll: boolean;
  };
}

export interface CaptureProgressMessage {
  type: MessageType.CAPTURE_PROGRESS;
  payload: CaptureProgress;
}

export interface CaptureCompleteMessage {
  type: MessageType.CAPTURE_COMPLETE;
  payload: {
    capture: Capture;
  };
}

export interface CaptureErrorMessage {
  type: MessageType.CAPTURE_ERROR;
  payload: {
    error: string;
    code?: string;
  };
}

export interface GetPageDimensionsMessage {
  type: MessageType.GET_PAGE_DIMENSIONS;
}

export interface PageDimensionsResponse {
  type: MessageType.PAGE_DIMENSIONS_RESPONSE;
  payload: PageDimensions;
}

export interface GetPageInfoMessage {
  type: MessageType.GET_PAGE_INFO;
}

export interface CaptureVisibleMessage {
  type: MessageType.CAPTURE_VISIBLE;
  payload: {
    format: CaptureFormat;
  };
}

export interface ScrollToPositionMessage {
  type: MessageType.SCROLL_TO_POSITION;
  payload: {
    x: number;
    y: number;
  };
}

export interface CaptureVisibleAreaMessage {
  type: MessageType.CAPTURE_VISIBLE_AREA;
  payload?: {
    hideFixedElements?: boolean;
  };
}

export interface VisibleAreaCapturedMessage {
  type: MessageType.VISIBLE_AREA_CAPTURED;
  payload: {
    imageData: string;
    scrollX: number;
    scrollY: number;
  };
}

export interface SelectionRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SelectionCompleteMessage {
  type: MessageType.SELECTION_COMPLETE;
  payload: SelectionRegion;
}

export type ChromeMessage =
  | CaptureStartMessage
  | CaptureProgressMessage
  | CaptureCompleteMessage
  | CaptureErrorMessage
  | GetPageDimensionsMessage
  | PageDimensionsResponse
  | GetPageInfoMessage
  | CaptureVisibleMessage
  | ScrollToPositionMessage
  | CaptureVisibleAreaMessage
  | VisibleAreaCapturedMessage
  | SelectionCompleteMessage
  | { type: MessageType.START_SELECTION_MODE }
  | { type: MessageType.CANCEL_CAPTURE }
  | { type: MessageType.GET_FIXED_ELEMENTS }
  | { type: MessageType.HIDE_FIXED_ELEMENTS }
  | { type: MessageType.SHOW_FIXED_ELEMENTS }
  | { type: MessageType.DISABLE_SCROLL_SNAP }
  | { type: MessageType.RESTORE_SCROLL_SNAP }
  | { type: MessageType.SHOW_CAPTURE_OVERLAY }
  | { type: MessageType.UPDATE_CAPTURE_OVERLAY; payload: { progress: number; step: string } }
  | { type: MessageType.HIDE_CAPTURE_OVERLAY }
  | { type: MessageType.GET_PAGE_INFO }
  | { type: MessageType.GET_CAPTURES }
  | { type: MessageType.GET_FULL_CAPTURE; payload: { id: string } }
  | { type: MessageType.GET_SETTINGS }
  | { type: MessageType.UPDATE_SETTINGS; payload: Partial<Settings> }
  | { type: MessageType.DELETE_CAPTURE; payload: { id: string } }
  | { type: MessageType.PRE_SCROLL_PAGE };
