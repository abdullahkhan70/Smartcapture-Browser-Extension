/**
 * SmartCapture Pro - Message Passing Utilities
 * Type-safe Chrome extension messaging layer
 */

import {
  ChromeMessage,
  MessageType,
  CaptureStartMessage,
  CaptureVisibleMessage,
  CaptureProgressMessage,
  CaptureCompleteMessage,
  CaptureErrorMessage,
  PageDimensionsResponse,
  PageDimensions,
  PageInfo,
  Settings,
  Capture,
} from './types';

// ===== Send Message to Background Script =====

export function sendMessage<T = unknown>(
  message: ChromeMessage
): Promise<T | undefined> {
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, (response: T) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }
  // Fallback for non-extension context (development)
  return Promise.resolve(undefined);
}

// ===== Send Message to Specific Tab Content Script =====

export function sendTabMessage<T = unknown>(
  tabId: number,
  message: ChromeMessage
): Promise<T | undefined> {
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    return new Promise((resolve, reject) => {
      try {
        chrome.tabs.sendMessage(tabId, message, (response: T) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }
  return Promise.resolve(undefined);
}

// ===== Send Message to Current Active Tab =====

export async function sendToActiveTab<T = unknown>(
  message: ChromeMessage
): Promise<T | undefined> {
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id) {
      return sendTabMessage<T>(tab.id, message);
    }
  }
  return undefined;
}

// ===== Broadcast Message to All Tabs =====

export async function broadcastToAllTabs<T = unknown>(
  message: ChromeMessage
): Promise<(T | undefined)[]> {
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    const tabs = await chrome.tabs.query({});
    return Promise.all(
      tabs
        .filter((tab) => tab.id !== undefined)
        .map((tab) => sendTabMessage<T>(tab.id!, message))
    );
  }
  return [];
}

// ===== Listen for Messages =====

type MessageHandler = (
  message: ChromeMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
) => boolean | void;

export function onMessage(handler: MessageHandler): void {
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener(handler);
  }
}

// ===== Type-Safe Message Listener by Type =====

export function onMessageType<T = unknown>(
  messageType: MessageType,
  handler: (data: T, sender: chrome.runtime.MessageSender) => void
): () => void {
  const wrappedHandler: MessageHandler = (message, sender, _sendResponse) => {
    if (message.type === messageType) {
      handler((message as any).payload as T, sender);
    }
  };

  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener(wrappedHandler);
    // Return unsubscribe function
    return () => {
      chrome.runtime.onMessage.removeListener(wrappedHandler);
    };
  }
  return () => {};
}

// ===== Convenience Message Senders =====

/** Start a capture (full page or visible) */
export function startCapture(options: {
  format: 'png' | 'jpeg' | 'pdf';
  quality: number;
  fullPage: boolean;
  smartScroll: boolean;
}): Promise<unknown> {
  const message: CaptureStartMessage = {
    type: MessageType.CAPTURE_START,
    payload: options,
  };
  return sendMessage(message);
}

/** Capture only the visible viewport */
export function captureVisible(format: 'png' | 'jpeg' | 'pdf' = 'png'): Promise<unknown> {
  const message: CaptureVisibleMessage = {
    type: MessageType.CAPTURE_VISIBLE,
    payload: { format },
  };
  return sendMessage(message);
}

/** Cancel in-progress capture */
export function cancelCapture(): Promise<unknown> {
  return sendMessage({ type: MessageType.CANCEL_CAPTURE });
}

/** Get page dimensions from active tab content script */
export function getPageDimensions(): Promise<PageDimensions | undefined> {
  return sendToActiveTab<PageDimensions>({
    type: MessageType.GET_PAGE_DIMENSIONS,
  });
}

/** Get page info from active tab content script */
export function getPageInfo(): Promise<PageInfo | undefined> {
  return sendToActiveTab<PageInfo>({
    type: MessageType.GET_PAGE_INFO,
  });
}

/** Scroll content script to specific position */
export function scrollToPosition(x: number, y: number): Promise<unknown> {
  return sendToActiveTab({
    type: MessageType.SCROLL_TO_POSITION,
    payload: { x, y },
  });
}

/** Hide fixed/sticky elements in content script */
export function hideFixedElements(): Promise<unknown> {
  return sendToActiveTab({ type: MessageType.HIDE_FIXED_ELEMENTS });
}

/** Show (restore) fixed/sticky elements in content script */
export function showFixedElements(): Promise<unknown> {
  return sendToActiveTab({ type: MessageType.SHOW_FIXED_ELEMENTS });
}

/** Show capture overlay in content script */
export function showCaptureOverlay(): Promise<unknown> {
  return sendToActiveTab({ type: MessageType.SHOW_CAPTURE_OVERLAY });
}

/** Update capture overlay progress in content script */
export function updateCaptureOverlay(progress: number, step: string): Promise<unknown> {
  return sendToActiveTab({
    type: MessageType.UPDATE_CAPTURE_OVERLAY,
    payload: { progress, step },
  });
}

/** Hide capture overlay in content script */
export function hideCaptureOverlay(): Promise<unknown> {
  return sendToActiveTab({ type: MessageType.HIDE_CAPTURE_OVERLAY });
}

/** Get all captures from background (metadata only, no imageData) */
export function getCaptures(): Promise<{ captures: Capture[] } | undefined> {
  return sendMessage<{ captures: Capture[] }>({ type: MessageType.GET_CAPTURES });
}

/** Get full capture data (including imageData) from background by ID */
export function getFullCapture(id: string): Promise<Capture | undefined> {
  return sendMessage<Capture>({ type: MessageType.GET_FULL_CAPTURE, payload: { id } });
}

/** Delete a capture */
export function deleteCapture(id: string): Promise<unknown> {
  return sendMessage({ type: MessageType.DELETE_CAPTURE, payload: { id } });
}

/** Get settings */
export function getSettings(): Promise<Settings | undefined> {
  return sendMessage<Settings>({ type: MessageType.GET_SETTINGS });
}

/** Update settings */
export function updateSettings(settings: Partial<Settings>): Promise<unknown> {
  return sendMessage({
    type: MessageType.UPDATE_SETTINGS,
    payload: settings,
  });
}
