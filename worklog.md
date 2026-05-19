# SmartCapture Pro - Work Log

---
Task ID: 1
Agent: Main Agent
Task: Fix OCR engine initialization stuck at "Loading engine..." in Chrome extension

Work Log:
- Analyzed the root cause: The Blob Worker strategy (workerBlobURL: true) in offscreen.ts silently hangs in Chrome extension offscreen documents. It creates a Blob with importScripts("chrome-extension://...") which never resolves.
- Rewrote offscreen.ts with:
  - workerBlobURL: false (Direct Worker) as PRIMARY strategy — creates new Worker(chrome-extension://...) directly
  - CDN fallback as secondary strategy
  - withTimeout() wrapper on all createWorker() calls (90s for local, 120s for CDN)
  - Retry logic with exponential backoff (5s, 10s, 15s)
  - OCR_PING health check message type
  - OCR_REINITIALIZE message type for error recovery
  - Better logging of extension resource URLs
- Updated background/index.ts with:
  - prewarmOCREngine() function that creates offscreen document + sends OCR_PREWARM
  - Called on chrome.runtime.onInstalled (install + update)
  - Called on chrome.runtime.onStartup (browser startup)
  - chrome.alarms keep-alive mechanism (every 4 minutes) to prevent service worker + offscreen from being killed
- Rebuilt both compiled JS files with esbuild:
  - src/offscreen/offscreen.js (57.9kb)
  - src/background/index.js (46.5kb)

Stage Summary:
- Key fix: Changed from workerBlobURL: true → workerBlobURL: false to prevent silent hang
- Added timeout wrappers so strategies don't hang indefinitely
- Added pre-initialization on extension install/startup
- Added keep-alive alarm to prevent Chrome from killing the offscreen document
- Files modified: src/offscreen/offscreen.ts, src/background/index.ts, src/offscreen/offscreen.js, src/background/index.js
