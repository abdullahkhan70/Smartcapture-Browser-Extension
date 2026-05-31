/**
 * SmartCapture Pro - Offscreen Document (Placeholder)
 *
 * Currently unused — OCR is DOM-based (chrome.scripting.executeScript).
 * This file exists as a placeholder for future image-based OCR support.
 * When Tesseract.js is re-added, this will host the WASM OCR engine.
 */

// Listen for any messages (no-op for now)
chrome.runtime.onMessage.addListener((_message, _sender, sendResponse) => {
  // No OCR messages handled — DOM-based OCR runs directly via chrome.scripting API
  return false;
});

console.log('[SmartCapture Offscreen] Placeholder loaded (DOM-based OCR in use, no Tesseract required)');
