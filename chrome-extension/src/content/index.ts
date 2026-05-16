/**
 * SmartCapture Pro - Content Script
 * Runs in the context of web pages to handle:
 * - Page dimension measurement
 * - Fixed element detection and hiding
 * - Scroll control with layout stabilization
 * - Capture overlay (Shadow DOM) with progress feedback
 * - Page metadata extraction
 */

import { MessageType, ChromeMessage, FixedElement, PageDimensions, PageInfo, SelectionRegion } from '../lib/types';

// ===== Logging =====

function log(message: string, data?: unknown): void {
  console.log(`[SmartCapture CS] ${message}`, data ?? '');
}

function logError(message: string, error?: unknown): void {
  console.error(`[SmartCapture CS] ${message}`, error);
}

// ===== State =====

let hiddenFixedElements: { element: HTMLElement; originalVisibility: string }[] = [];
let isPageListenerAttached = false;
let scrollSnapBackup: Map<HTMLElement, string> = new Map();

// ===== Scrollable Element Detection =====

/**
 * Find the actual scrollable element for the page.
 * Many modern SPAs use nested scroll containers instead of document-level scrolling.
 * This function walks the DOM to find the element that actually scrolls.
 */
function findScrollableElement(): { element: HTMLElement; isWindow: boolean } {
  const html = document.documentElement;
  const body = document.body;

  // 1. Check document-level scrolling.
  //    Only use window scrolling if body does NOT have overflow:hidden.
  //    YouTube (and many SPAs) set body overflow:hidden and scroll inside
  //    nested containers like ytd-app, so document-level scroll won't work.
  const bodyStyle = window.getComputedStyle(body);
  const bodyOverflowHidden = bodyStyle.overflowY === 'hidden' || bodyStyle.overflow === 'hidden';

  if (!bodyOverflowHidden) {
    const docScrollHeight = Math.max(html.scrollHeight, body.scrollHeight);
    if (docScrollHeight > window.innerHeight + 10) {
      return { element: html, isWindow: true };
    }
  }

  // 2. Check common SPA scroll containers (YouTube, Twitter, etc.)
  //    These are the most likely candidates on SPA sites.
  const spaSelectors = [
    'ytd-app',           // YouTube main app shell
    '#content',          // YouTube main content area
    '[role="main"]',    // ARIA main landmark (works for Twitter/X, GitHub)
    '.main-content',     // Generic main content class
    '[data-testid="primaryColumn"]',  // Twitter/X main feed column
    '#react-root header + main div',   // Twitter/X root main container
  ];

  for (const selector of spaSelectors) {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) continue;

    // Check the element itself, then walk up ancestors (max 3 levels)
    // to find the actual scroll container. Some sites put [role="main"]
    // inside a scrollable wrapper.
    let checkEl: HTMLElement | null = el;
    for (let ancestorLevel = 0; ancestorLevel <= 3 && checkEl; ancestorLevel++) {
      const style = window.getComputedStyle(checkEl);
      const overflowY = style.overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll') &&
          checkEl.scrollHeight > checkEl.clientHeight + 10) {
        // Verify scrollTop is controllable (set and read back)
        const prevScrollTop = checkEl.scrollTop;
        checkEl.scrollTop = prevScrollTop + 1;
        const canControl = checkEl.scrollTop !== prevScrollTop || prevScrollTop === 0;
        checkEl.scrollTop = prevScrollTop; // restore original position

        if (canControl) {
          const label = ancestorLevel === 0
            ? `Found SPA scrollable container: ${selector}`
            : `Found SPA scrollable container: ${selector} (ancestor ${ancestorLevel} levels up)`;
          log(label, {
            scrollHeight: checkEl.scrollHeight,
            clientHeight: checkEl.clientHeight,
          });
          return { element: checkEl, isWindow: false };
        }
      }
      // Walk up to parent element
      checkEl = checkEl.parentElement;
    }
  }

  // 3. Walk elements for nested scrollable containers (depth-limited, time-budgeted)
  //    IMPORTANT: getComputedStyle() is EXTREMELY expensive on heavy pages.
  //    We use el.style.overflow (inline, FREE) first, only falling back to
  //    getComputedStyle() for a small subset of candidates.
  const MAX_DOM_WALK = 150;
  const WALK_TIME_BUDGET_MS = 500; // Don't spend more than 500ms here
  const walkStart = performance.now();
  let walked = 0;
  let bestEl: HTMLElement | null = null;
  let bestScroll = 0;

  // Collect candidate elements using TreeWalker (fast, no style access)
  const candidates: HTMLElement[] = [];
  const walker = document.createTreeWalker(
    document.body || document.documentElement,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        if (walked >= MAX_DOM_WALK) return NodeFilter.FILTER_REJECT;
        // Time budget check every 20 nodes
        if (walked > 0 && walked % 20 === 0) {
          if (performance.now() - walkStart > WALK_TIME_BUDGET_MS) {
            return NodeFilter.FILTER_REJECT;
          }
        }
        const el = node as HTMLElement;
        const tag = el.tagName?.toLowerCase();
        if (tag === 'div' || tag === 'section' || tag === 'main' ||
            tag === 'article' || tag === 'aside' || tag === 'nav' ||
            el.hasAttribute('data-scrollable')) {
          walked++;
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      }
    }
  );

  let walkNode: Node | null;
  while ((walkNode = walker.nextNode())) {
    candidates.push(walkNode as HTMLElement);
  }

  // Now check candidates for scrollability using fast inline check first
  for (const el of candidates) {
    // FAST: Check inline overflow style (no style recalculation)
    const inlineOverflow = el.style.overflowY || el.style.overflow;
    if (inlineOverflow === 'auto' || inlineOverflow === 'scroll') {
      const diff = el.scrollHeight - el.clientHeight;
      if (diff > 10 && diff > bestScroll) {
        bestScroll = diff;
        bestEl = el;
      }
    } else if (bestEl === null) {
      // Only call getComputedStyle for first few elements if no match found yet
      // This avoids the expensive call on most elements
      if (candidates.indexOf(el) < 30) {
        try {
          const style = window.getComputedStyle(el);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
            const diff = el.scrollHeight - el.clientHeight;
            if (diff > 10 && diff > bestScroll) {
              bestScroll = diff;
              bestEl = el;
            }
          }
        } catch { /* skip inaccessible elements */ }
      }
    }
  }

  if (bestEl) {
    // Verify scrollTop is controllable
    const prevScrollTop = bestEl.scrollTop;
    bestEl.scrollTop = prevScrollTop + 1;
    const canControl = bestEl.scrollTop !== prevScrollTop || prevScrollTop === 0;
    bestEl.scrollTop = prevScrollTop; // restore

    if (canControl) {
      log(`Found nested scrollable element`, {
        tag: bestEl.tagName,
        id: bestEl.id,
        className: (typeof bestEl.className === 'string' ? bestEl.className : '').substring(0, 100),
        scrollHeight: bestEl.scrollHeight,
        clientHeight: bestEl.clientHeight,
      });
      return { element: bestEl, isWindow: false };
    }
  }

  // 4. Fallback to document element
  return { element: html, isWindow: true };
}

/**
 * Temporarily disable all scroll-snap on the page during capture.
 * Uses depth-limited traversal with time budget and fast inline check.
 * Scroll-snap is typically applied to container elements near the top of the DOM.
 * On most pages, scroll-snap is set via CSS classes, so we still need getComputedStyle,
 * but we limit it to avoid hanging on heavy pages.
 */
function disableScrollSnap(): void {
  scrollSnapBackup.clear();
  const MAX_DEPTH = 5;
  const MAX_CHECKED = 100;
  const TIME_BUDGET_MS = 300;
  let checkedCount = 0;
  const startTime = performance.now();

  const body = document.body;
  if (!body) return;

  const checkElement = (el: HTMLElement, depth: number) => {
    if (checkedCount >= MAX_CHECKED || depth > MAX_DEPTH) return;

    // Time budget check every 10 elements
    checkedCount++;
    if (checkedCount > 0 && checkedCount % 10 === 0) {
      if (performance.now() - startTime > TIME_BUDGET_MS) return;
    }

    // FAST: Check inline scroll-snap-type first (free)
    const inlineSnap = el.style.scrollSnapType;
    if (inlineSnap && inlineSnap !== 'none') {
      scrollSnapBackup.set(el, inlineSnap);
      el.style.setProperty('scroll-snap-type', 'none', 'important');
    } else {
      // SLOW: Only call getComputedStyle if no inline value
      // Skip if time budget is running low
      if (performance.now() - startTime < TIME_BUDGET_MS * 0.7) {
        try {
          const style = window.getComputedStyle(el);
          if (style.scrollSnapType !== 'none') {
            scrollSnapBackup.set(el, el.style.scrollSnapType);
            el.style.setProperty('scroll-snap-type', 'none', 'important');
          }
        } catch { /* skip inaccessible elements */ }
      }
    }

    for (const child of el.children) {
      if (child instanceof HTMLElement) {
        checkElement(child, depth + 1);
      }
    }
  };

  // Start from body's direct children
  for (const child of body.children) {
    if (child instanceof HTMLElement) {
      checkElement(child, 1);
    }
  }

  if (scrollSnapBackup.size > 0) {
    log(`Disabled scroll-snap on ${scrollSnapBackup.size} elements (checked ${checkedCount} nodes, ${Math.round(performance.now() - startTime)}ms)`);
  }
}

/**
 * Restore scroll-snap properties after capture.
 */
function restoreScrollSnap(): void {
  for (const [el, original] of scrollSnapBackup) {
    (el as HTMLElement).style.setProperty('scroll-snap-type', original);
  }
  scrollSnapBackup.clear();
  log('Restored scroll-snap properties');
}

/**
 * Pre-scroll the entire page from top to bottom to trigger
 * lazy-loaded images, infinite scroll, and dynamic content.
 * Then scroll back to top.
 */
async function preScrollPage(): Promise<void> {
  const { element: scrollEl, isWindow } = findScrollableElement();
  let totalScroll = isWindow
    ? document.documentElement.scrollHeight
    : scrollEl.scrollHeight;
  const viewportH = isWindow ? window.innerHeight : scrollEl.clientHeight;
  const step = Math.round(viewportH * 0.75);

  // HARD LIMITS to prevent infinite scroll pages (LinkedIn, Twitter, etc.)
  // from trapping us in an endless pre-scroll loop.
  const MAX_PRE_SCROLL_DURATION = 5000; // 5 seconds max
  const MAX_PRE_SCROLL_ITERATIONS = 100; // Max scroll steps
  const startTime = Date.now();

  log(`Pre-scrolling page (initialHeight=${totalScroll}, step=${step})`);

  let currentY = 0;
  let iterations = 0;
  let lastHeight = totalScroll;
  let stableCount = 0; // Count consecutive iterations where height didn't grow

  while (currentY < totalScroll) {
    // Check hard limits
    iterations++;
    const elapsed = Date.now() - startTime;
    if (elapsed > MAX_PRE_SCROLL_DURATION || iterations > MAX_PRE_SCROLL_ITERATIONS) {
      log(`Pre-scroll aborted: exceeded limits (${elapsed}ms, ${iterations} iterations)`);
      break;
    }

    if (isWindow) {
      window.scrollTo(0, currentY);
    } else {
      scrollEl.scrollTo({ top: currentY, left: 0, behavior: 'instant' });
    }
    currentY += step;
    await new Promise((r) => setTimeout(r, 150));

    // Re-read scrollHeight (it may have grown due to infinite scroll)
    const newHeight = isWindow
      ? document.documentElement.scrollHeight
      : scrollEl.scrollHeight;

    // If page height hasn't changed for 3 consecutive steps, it's likely not infinite scroll
    if (Math.abs(newHeight - lastHeight) < 10) {
      stableCount++;
    } else {
      stableCount = 0;
      lastHeight = newHeight;
    }

    // Stop early if height stabilized (not an infinite scroll page)
    if (stableCount >= 3 && currentY >= newHeight) {
      log(`Pre-scroll: page height stabilized at ${newHeight}px`);
      break;
    }

    // Update totalScroll to the new height so we scroll the full page
    totalScroll = newHeight;
  }

  // Scroll back to top
  if (isWindow) {
    window.scrollTo(0, 0);
  } else {
    scrollEl.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }
  await new Promise((r) => setTimeout(r, 200));

  log(`Pre-scroll complete (${iterations} iterations, ${Date.now() - startTime}ms)`);
}


// ===== Page Dimension Measurement =====

/**
 * Get comprehensive page dimensions including fixed element info.
 * Detects the actual scrollable element (handles nested scroll containers).
 * Has a hard TIME BUDGET to prevent hanging on heavy pages (Twitter, Facebook).
 */
function getPageDimensions(): PageDimensions {
  const measureStart = performance.now();
  const TIME_BUDGET_MS = 3000; // Hard limit for entire measurement

  const { element: scrollEl, isWindow } = findScrollableElement();

  let scrollWidth: number;
  let scrollHeight: number;
  let viewportWidth: number;
  let viewportHeight: number;

  if (isWindow) {
    scrollWidth = document.documentElement.scrollWidth || document.body.scrollWidth;
    scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight;
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
  } else {
    scrollWidth = scrollEl.scrollWidth;
    scrollHeight = scrollEl.scrollHeight;
    // IMPORTANT: Always use window dimensions for viewport, NOT the scroll container's
    // clientHeight. captureVisibleTab captures the full browser viewport, so viewportHeight
    // must match window.innerHeight. Using scrollEl.clientHeight causes overlap miscalculation
    // in stitching when the scroll container doesn't fill the full viewport.
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
  }

  const devicePixelRatio = window.devicePixelRatio || 1;

  // Check remaining time budget before expensive fixed element detection
  const elapsedSoFar = performance.now() - measureStart;
  const remainingBudget = TIME_BUDGET_MS - elapsedSoFar;
  let fixedElements: FixedElement[] = [];

  if (remainingBudget > 500) {
    // Pass remaining time budget to detectFixedElements
    fixedElements = detectFixedElements(remainingBudget);
  } else {
    log(`Skipping detectFixedElements — only ${Math.round(remainingBudget)}ms remaining (used ${Math.round(elapsedSoFar)}ms for findScrollableElement)`);
  }

  const dimensions: PageDimensions = {
    scrollWidth,
    scrollHeight,
    viewportWidth,
    viewportHeight,
    devicePixelRatio,
    fixedElements,
  };

  log(`Page dimensions measured in ${Math.round(performance.now() - measureStart)}ms`, {
    ...dimensions,
    fixedCount: fixedElements.length,
    scrollElement: isWindow ? 'window' : `element(${scrollEl.tagName}#${scrollEl.id})`,
  });
  return dimensions;
}

/**
 * Get current page metadata
 */
function getPageInfo(): PageInfo {
  return {
    url: window.location.href,
    title: document.title,
    timestamp: Date.now(),
  };
}

// ===== Fixed Element Detection =====

/**
 * Detect all fixed and sticky positioned elements with their bounding rects.
 *
 * CRITICAL PERFORMANCE OPTIMIZATION for heavy pages (Twitter, Facebook):
 * 1. TIME BUDGET: Accepts a max time (ms); bails out early if exceeded.
 * 2. FAST INLINE CHECK: Checks el.style.position (FREE) before
 *    getComputedStyle() (EXPENSIVE — forces style recalculation).
 *    On Twitter, getComputedStyle() can take 5-50ms per call due to
 *    complex CSS, Shadow DOMs, and React fiber tree.
 * 3. DEPTH-LIMITED BFS: Fixed elements are near the top of the DOM.
 * 4. LOW ELEMENT COUNT: 200 max, but usually exits much sooner via time budget.
 *
 * @param timeBudgetMs Max time in ms before bailing out (default 2000ms)
 */
function detectFixedElements(timeBudgetMs = 2000): FixedElement[] {
  const fixedElements: FixedElement[] = [];
  const MAX_DEPTH = 8;
  const MAX_CHECKED = 200;
  let checkedCount = 0;
  const startTime = performance.now();

  const body = document.body;
  if (!body) return fixedElements;

  // BFS from body's direct children (skip body/html themselves)
  const queue: { el: HTMLElement; depth: number }[] = [];
  for (const child of body.children) {
    if (child instanceof HTMLElement) {
      queue.push({ el: child, depth: 1 });
    }
  }

  while (queue.length > 0 && checkedCount < MAX_CHECKED) {
    // TIME BUDGET CHECK — bail out if we've used too much time
    if (checkedCount > 0 && checkedCount % 10 === 0) {
      const elapsed = performance.now() - startTime;
      if (elapsed > timeBudgetMs) {
        log(`detectFixedElements: time budget exceeded (${Math.round(elapsed)}ms / ${timeBudgetMs}ms), checked ${checkedCount} nodes`);
        break;
      }
    }

    const { el, depth } = queue.shift()!;
    checkedCount++;

    // Skip our own overlay container
    if (el.id === 'smartcapture-overlay-container' || el.closest('#smartcapture-overlay-container')) {
      continue;
    }
    const tag = el.tagName.toLowerCase();
    if (tag === 'body' || tag === 'html') continue;

    // Quick size check before any style inspection
    if (el.offsetWidth === 0 || el.offsetHeight === 0) continue;

    // FAST PATH: Check inline style first (FREE — no style recalculation).
    // Many SPAs set position:fixed/sticky directly on elements.
    const inlinePos = el.style.position;
    if (inlinePos === 'fixed' || inlinePos === 'sticky') {
      const rect = el.getBoundingClientRect();
      fixedElements.push({
        tagName: tag,
        id: el.id || '',
        className: (typeof el.className === 'string' ? el.className : '').substring(0, 200),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        position: inlinePos,
      });
    } else {
      // SLOW PATH: Only call getComputedStyle if inline style didn't match.
      // This is the expensive call — skip if we're running low on time.
      const elapsed = performance.now() - startTime;
      if (elapsed > timeBudgetMs * 0.7) {
        // Don't start expensive operations if >70% of budget used
        continue;
      }

      try {
        const style = window.getComputedStyle(el);
        if (style.position === 'fixed' || style.position === 'sticky') {
          const rect = el.getBoundingClientRect();
          fixedElements.push({
            tagName: tag,
            id: el.id || '',
            className: (typeof el.className === 'string' ? el.className : '').substring(0, 200),
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            position: style.position,
          });
        }
      } catch {
        // Cross-origin iframes or detached elements may throw
        continue;
      }
    }

    // Enqueue children if within depth limit (fixed elements are typically shallow)
    if (depth < MAX_DEPTH) {
      for (const child of el.children) {
        if (child instanceof HTMLElement) {
          queue.push({ el: child, depth: depth + 1 });
        }
      }
    }
  }

  log(`Detected ${fixedElements.length} fixed/sticky elements (checked ${checkedCount} nodes, ${Math.round(performance.now() - startTime)}ms)`);
  return fixedElements;
}

/**
 * Hide all fixed/sticky elements during capture to prevent repetition.
 * Uses visibility:hidden instead of display:none to avoid layout shifts.
 * Uses BFS with inline style fast-path (same approach as detectFixedElements)
 * for performance — avoids expensive getComputedStyle on every element.
 */
function hideFixedElements(): void {
  hiddenFixedElements = [];

  const MAX_DEPTH = 8;
  const MAX_CHECKED = 200;
  const TIME_BUDGET_MS = 300;
  const startTime = performance.now();

  const body = document.body;
  if (!body) return;

  // BFS from body's direct children
  const queue: { el: HTMLElement; depth: number }[] = [];
  for (const child of body.children) {
    if (child instanceof HTMLElement) {
      queue.push({ el: child, depth: 1 });
    }
  }

  let checked = 0;

  while (queue.length > 0 && checked < MAX_CHECKED) {
    // Time budget check every 10 elements
    if (checked > 0 && checked % 10 === 0) {
      if (performance.now() - startTime > TIME_BUDGET_MS) break;
    }

    const { el, depth } = queue.shift()!;
    checked++;

    // Skip our own overlay
    if (el.id === 'smartcapture-overlay-container' ||
        el.closest('#smartcapture-overlay-container')) continue;

    const tag = el.tagName.toLowerCase();
    if (tag === 'body' || tag === 'html') {
      if (depth < MAX_DEPTH) {
        for (const child of el.children) {
          if (child instanceof HTMLElement && checked + queue.length < MAX_CHECKED) {
            queue.push({ el: child, depth: depth + 1 });
          }
        }
      }
      continue;
    }

    // Skip zero-size elements (not visible)
    if (el.offsetWidth === 0 || el.offsetHeight === 0) {
      if (depth < MAX_DEPTH) {
        for (const child of el.children) {
          if (child instanceof HTMLElement && checked + queue.length < MAX_CHECKED) {
            queue.push({ el: child, depth: depth + 1 });
          }
        }
      }
      continue;
    }

    // FAST PATH: Check inline style (FREE — no style recalculation)
    const inlinePos = el.style.position;
    let isFixedOrSticky = false;

    if (inlinePos === 'fixed' || inlinePos === 'sticky') {
      isFixedOrSticky = true;
    } else if (checked < 50 && performance.now() - startTime < TIME_BUDGET_MS * 0.7) {
      // SLOW PATH: Only check computed style for first 50 elements
      try {
        const style = window.getComputedStyle(el);
        if (style.position === 'fixed' || style.position === 'sticky') {
          isFixedOrSticky = true;
        }
      } catch { /* cross-origin iframes */ }
    }

    if (isFixedOrSticky) {
      // Use visibility:hidden instead of display:none to prevent layout shifts.
      // For fixed elements (out of flow), both have same visual effect.
      // For sticky elements, visibility:hidden preserves layout space so content
      // doesn't jump around during capture.
      hiddenFixedElements.push({
        element: el,
        originalVisibility: el.style.visibility || '',
      });
      el.style.setProperty('visibility', 'hidden', 'important');
    }

    // Enqueue children if within depth limit
    if (depth < MAX_DEPTH && checked + queue.length < MAX_CHECKED) {
      for (const child of el.children) {
        if (child instanceof HTMLElement) {
          queue.push({ el: child, depth: depth + 1 });
        }
      }
    }
  }

  log(`Hid ${hiddenFixedElements.length} fixed/sticky elements (checked ${checked}, ${Math.round(performance.now() - startTime)}ms)`);
}

/**
 * Restore all hidden fixed/sticky elements after capture.
 * Restores visibility property (matching hideFixedElements which uses visibility:hidden).
 */
function showFixedElements(): void {
  for (const { element, originalVisibility } of hiddenFixedElements) {
    if (originalVisibility) {
      element.style.setProperty('visibility', originalVisibility);
    } else {
      element.style.removeProperty('visibility');
    }
  }
  hiddenFixedElements = [];
  log('Restored all fixed/sticky elements');
}

// ===== Scroll Control =====

/**
 * Wait for all images in the current viewport to finish loading.
 * This prevents capturing blank/placeholder images from lazy-loaded content.
 * Has a timeout to avoid blocking forever on broken images.
 */
function waitForImagesInViewport(timeout = 3000): Promise<void> {
  return new Promise((resolve) => {
    const viewportTop = window.scrollY;
    const viewportBottom = viewportTop + window.innerHeight;

    // Find images in viewport that haven't loaded yet
    const images = document.querySelectorAll<HTMLImageElement>('img');
    const loadingImages: HTMLImageElement[] = [];

    for (const img of images) {
      if (!img.complete) {
        // Check if image is in or near viewport
        const rect = img.getBoundingClientRect();
        const imgTop = rect.top + viewportTop;
        const imgBottom = imgTop + rect.height;
        // Include images within viewport + 100px buffer
        if (imgBottom >= viewportTop - 100 && imgTop <= viewportBottom + 100) {
          loadingImages.push(img);
        }
      }
    }

    if (loadingImages.length === 0) {
      resolve();
      return;
    }

    log(`Waiting for ${loadingImages.length} images to load...`);

    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };

    // Wait for each image to load or error
    for (const img of loadingImages) {
      const onLoad = () => { img.removeEventListener('load', onLoad); img.removeEventListener('error', onLoad); done(); };
      img.addEventListener('load', onLoad, { once: true });
      img.addEventListener('error', onLoad, { once: true });
    }

    // Timeout fallback
    setTimeout(done, timeout);
  });
}

/**
 * Scroll to a specific position instantly (no smooth scrolling).
 * Uses the actual scrollable element (handles nested scroll containers).
 * Waits for layout stabilization using requestAnimationFrame
 * and MutationObserver debounce, then waits for viewport images to load.
 * Returns the actual scroll position after settling (browser may not
 * land exactly on the requested position due to scroll-snap, etc.)
 */
function scrollToPosition(x: number, y: number): Promise<{ success: boolean; scrollX: number; scrollY: number }> {
  return new Promise((resolve) => {
    const { element: scrollEl, isWindow } = findScrollableElement();

    // Instant scroll (no smooth)
    if (isWindow) {
      window.scrollTo(x, y);
    } else {
      scrollEl.scrollTo({ top: y, left: x, behavior: 'instant' });
      // Force a layout reflow so the browser recalculates layout
      // (important for YouTube's lazy loading and virtual lists)
      void scrollEl.offsetHeight;
      // Dispatch a synthetic scroll event so YouTube's own scroll
      // handlers fire and load the appropriate content
      scrollEl.dispatchEvent(new Event('scroll', { bubbles: true }));
    }

    // Wait for requestAnimationFrame to ensure layout is updated
    requestAnimationFrame(() => {
      // HARD TIMEOUT: Absolute maximum wait regardless of mutations.
      // This prevents infinite scroll pages (LinkedIn, Twitter) from trapping
      // us: scrolling triggers content loading → DOM mutations → debounce resets
      // → more content loads → more mutations → never settles.
      const HARD_TIMEOUT = 1500; // 1.5 seconds max wait per scroll position
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;

        // After scroll settles, wait briefly for viewport images to start loading.
        // Use a SHORT timeout (500ms) instead of the previous 3s to avoid
        // blocking on infinite scroll pages where new images keep appearing.
        waitForImagesInViewport(500).then(() => {
          const actualX = isWindow ? Math.round(window.scrollX) : Math.round(scrollEl.scrollLeft);
          const actualY = isWindow ? Math.round(window.scrollY) : Math.round(scrollEl.scrollTop);
          resolve({ success: true, scrollX: actualX, scrollY: actualY });
        });
      };

      // Use MutationObserver to detect when DOM mutations settle
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;

      const observer = new MutationObserver(() => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          observer.disconnect();
          finish();
        }, 150); // Reduced from 200ms to 150ms (match GoFullPage's delay)
      });

      const observeTarget = scrollEl === document.documentElement ? document.body : scrollEl;
      observer.observe(observeTarget, {
        childList: true,
        subtree: true,
        attributes: true,
      });

      // Fallback timeout — if no mutations, settle after 300ms
      debounceTimer = setTimeout(() => {
        if (!settled) {
          observer.disconnect();
          finish();
        }
      }, 300);

      // HARD TIMEOUT — this ALWAYS fires, even if mutations keep resetting debounce
      setTimeout(() => {
        if (!settled) {
          observer.disconnect();
          if (debounceTimer) clearTimeout(debounceTimer);
          log(`scrollToPosition(${x}, ${y}): hard timeout reached, forcing settle`);
          finish();
        }
      }, HARD_TIMEOUT);
    });
  });
}

/**
 * Wait for scroll to settle (no more scroll events for a period)
 */
function waitForScrollSettle(timeout = 500): Promise<void> {
  return new Promise((resolve) => {
    let lastScrollTop = window.scrollY;
    let scrollTimer: ReturnType<typeof setTimeout>;

    const checkScroll = () => {
      if (window.scrollY === lastScrollTop) {
        clearTimeout(scrollTimer);
        resolve();
      } else {
        lastScrollTop = window.scrollY;
        scrollTimer = setTimeout(checkScroll, 50);
      }
    };

    scrollTimer = setTimeout(() => {
      resolve();
    }, timeout);

    checkScroll();
  });
}

// ===== Capture Overlay (Shadow DOM) =====

let overlayContainer: HTMLDivElement | null = null;
let overlayShadow: ShadowRoot | null = null;

/**
 * Create the capture overlay using Shadow DOM to prevent style conflicts.
 * Includes:
 * - 3px progress bar at the top
 * - Centered frosted-glass status card
 * - Section indicators for capture regions
 */
function showCaptureOverlay(): void {
  // If overlay exists and is still in the DOM, just make it visible again
  if (overlayContainer && overlayContainer.parentNode) {
    // Reset opacity (in case removeCaptureOverlay fade-out was in progress)
    overlayContainer.style.transition = '';
    overlayContainer.style.opacity = '';
    updateOverlayVisibility(true);
    return;
  }

  // If overlay reference exists but was removed from DOM, clean up reference
  if (overlayContainer && !overlayContainer.parentNode) {
    overlayContainer = null;
    overlayShadow = null;
  }

  overlayContainer = document.createElement('div');
  overlayContainer.id = 'smartcapture-overlay-container';
  overlayContainer.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    z-index: 2147483647 !important;
    pointer-events: none !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
  `;

  // Create Shadow DOM
  overlayShadow = overlayContainer.attachShadow({ mode: 'closed' });

  // Inject styles
  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
    }

    .sc-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }

    .sc-progress-bar {
      position: fixed;
      top: 0;
      left: 0;
      height: 3px;
      background: linear-gradient(90deg, #0ea5e9, #38bdf8);
      transition: width 0.3s ease;
      z-index: 2147483647;
      box-shadow: 0 0 10px rgba(14, 165, 233, 0.5);
    }

    .sc-status-card {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      padding: 16px 24px;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 12px;
      color: #f8fafc;
      font-size: 14px;
      line-height: 1.5;
      min-width: 200px;
      text-align: center;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }

    .sc-status-title {
      font-size: 13px;
      font-weight: 600;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .sc-status-step {
      font-size: 15px;
      font-weight: 500;
      color: #f8fafc;
      margin-bottom: 8px;
    }

    .sc-status-progress {
      font-size: 12px;
      color: #38bdf8;
      font-variant-numeric: tabular-nums;
    }

    .sc-spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(148, 163, 184, 0.3);
      border-top-color: #38bdf8;
      border-radius: 50%;
      animation: sc-spin 0.8s linear infinite;
      margin-right: 8px;
      vertical-align: middle;
    }

    @keyframes sc-spin {
      to { transform: rotate(360deg); }
    }
  `;
  overlayShadow.appendChild(style);

  // Create overlay structure
  const overlay = document.createElement('div');
  overlay.className = 'sc-overlay';

  // Progress bar
  const progressBar = document.createElement('div');
  progressBar.className = 'sc-progress-bar';
  progressBar.id = 'sc-progress-bar';
  progressBar.style.width = '0%';
  overlay.appendChild(progressBar);

  // Status card
  const statusCard = document.createElement('div');
  statusCard.className = 'sc-status-card';

  const statusTitle = document.createElement('div');
  statusTitle.className = 'sc-status-title';
  statusTitle.textContent = 'SmartCapture Pro';

  const statusStep = document.createElement('div');
  statusStep.className = 'sc-status-step';
  statusStep.id = 'sc-status-step';
  statusStep.innerHTML = '<span class="sc-spinner"></span>Preparing capture...';

  const statusProgress = document.createElement('div');
  statusProgress.className = 'sc-status-progress';
  statusProgress.id = 'sc-status-progress';
  statusProgress.textContent = '0%';

  statusCard.appendChild(statusTitle);
  statusCard.appendChild(statusStep);
  statusCard.appendChild(statusProgress);
  overlay.appendChild(statusCard);

  overlayShadow.appendChild(overlay);
  document.documentElement.appendChild(overlayContainer);

  log('Capture overlay shown');
}

/**
 * Update the capture overlay progress and status text.
 */
function updateCaptureOverlay(progress: number, step: string): void {
  if (!overlayShadow) return;

  const progressBar = overlayShadow.getElementById('sc-progress-bar');
  const statusStep = overlayShadow.getElementById('sc-status-step');
  const statusProgress = overlayShadow.getElementById('sc-status-progress');

  if (progressBar) {
    progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
  }

  if (statusStep) {
    statusStep.innerHTML = `<span class="sc-spinner"></span>${step}`;
  }

  if (statusProgress) {
    statusProgress.textContent = `${Math.round(progress)}%`;
  }
}

/**
 * Hide the capture overlay visually (display:none) but keep it in the DOM.
 * This is used during capture when the background script needs to temporarily
 * hide the overlay before captureVisibleTab, then show it again after.
 * Keeping it in DOM avoids visual flicker from creating a new overlay.
 */
function hideCaptureOverlay(): void {
  if (!overlayContainer) return;
  overlayContainer.style.display = 'none';
  log('Capture overlay hidden (display:none)');
}

/**
 * Remove the capture overlay from the DOM entirely with a fade-out animation.
 * This is the final cleanup used after capture completes or errors.
 */
function removeCaptureOverlay(): void {
  if (!overlayContainer) return;

  // If already hidden via display:none, just remove immediately
  if (overlayContainer.style.display === 'none') {
    if (overlayContainer.parentNode) {
      overlayContainer.parentNode.removeChild(overlayContainer);
    }
    overlayContainer = null;
    overlayShadow = null;
    log('Capture overlay removed (was hidden)');
    return;
  }

  // Fade out then remove
  overlayContainer.style.transition = 'opacity 0.3s ease';
  overlayContainer.style.opacity = '0';

  setTimeout(() => {
    if (overlayContainer && overlayContainer.parentNode) {
      overlayContainer.parentNode.removeChild(overlayContainer);
    }
    overlayContainer = null;
    overlayShadow = null;
    log('Capture overlay removed (faded out)');
  }, 300);
}

function updateOverlayVisibility(visible: boolean): void {
  if (overlayContainer) {
    overlayContainer.style.display = visible ? 'block' : 'none';
  }
}

// ===== Selection Overlay =====

let selectionContainer: HTMLDivElement | null = null;
let selectionShadow: ShadowRoot | null = null;
let selectionActive = false;
let selectionStartX = 0;
let selectionStartY = 0;
let selectionRect: HTMLDivElement | null = null;
let selectionPendingResponse: ((response: unknown) => void) | null = null;

function showSelectionOverlay(): void {
  if (selectionContainer) return;

  selectionContainer = document.createElement('div');
  selectionContainer.id = 'smartcapture-selection-container';
  selectionContainer.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    z-index: 2147483647 !important;
    cursor: crosshair !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
  `;

  selectionShadow = selectionContainer.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    .sc-selection-bg {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.4);
    }
    .sc-selection-rect {
      position: fixed;
      border: 2px dashed #0ea5e9;
      background: rgba(14, 165, 233, 0.1);
      pointer-events: none;
      box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.35);
    }
    .sc-selection-hint {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      padding: 12px 24px;
      background: rgba(15, 23, 42, 0.9);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 8px;
      color: #f8fafc;
      font-size: 14px;
      text-align: center;
      pointer-events: none;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }
    .sc-selection-hint-title {
      font-weight: 600;
      margin-bottom: 4px;
    }
    .sc-selection-hint-sub {
      font-size: 12px;
      color: #94a3b8;
    }
    .sc-selection-size {
      position: fixed;
      padding: 4px 8px;
      background: rgba(0, 0, 0, 0.8);
      color: #f8fafc;
      font-size: 11px;
      border-radius: 4px;
      pointer-events: none;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
  `;
  selectionShadow.appendChild(style);

  const bg = document.createElement('div');
  bg.className = 'sc-selection-bg';
  selectionShadow.appendChild(bg);

  const hint = document.createElement('div');
  hint.className = 'sc-selection-hint';
  hint.id = 'sc-selection-hint';
  hint.innerHTML = '<div class="sc-selection-hint-title">Click and drag to select area</div><div class="sc-selection-hint-sub">Press Esc to cancel</div>';
  selectionShadow.appendChild(hint);

  document.documentElement.appendChild(selectionContainer);
  selectionActive = true;

  log('Selection overlay shown');
}

function handleSelectionMouseDown(e: MouseEvent): void {
  if (!selectionActive) return;

  selectionStartX = e.clientX;
  selectionStartY = e.clientY;

  // Remove hint
  const hint = selectionShadow?.getElementById('sc-selection-hint');
  if (hint) hint.remove();

  // Create selection rectangle
  if (!selectionRect) {
    selectionRect = document.createElement('div');
    selectionRect.className = 'sc-selection-rect';
    selectionShadow?.appendChild(selectionRect);
  }

  selectionRect.style.left = `${e.clientX}px`;
  selectionRect.style.top = `${e.clientY}px`;
  selectionRect.style.width = '0px';
  selectionRect.style.height = '0px';
}

function handleSelectionMouseMove(e: MouseEvent): void {
  if (!selectionActive || !selectionRect) return;

  const x = Math.min(e.clientX, selectionStartX);
  const y = Math.min(e.clientY, selectionStartY);
  const width = Math.abs(e.clientX - selectionStartX);
  const height = Math.abs(e.clientY - selectionStartY);

  selectionRect.style.left = `${x}px`;
  selectionRect.style.top = `${y}px`;
  selectionRect.style.width = `${width}px`;
  selectionRect.style.height = `${height}px`;

  // Update size label
  let sizeLabel = selectionShadow?.getElementById('sc-selection-size');
  if (!sizeLabel) {
    sizeLabel = document.createElement('div');
    sizeLabel.className = 'sc-selection-size';
    sizeLabel.id = 'sc-selection-size';
    selectionShadow?.appendChild(sizeLabel);
  }
  sizeLabel.textContent = `${Math.round(width)} × ${Math.round(height)}`;
  sizeLabel.style.left = `${e.clientX + 12}px`;
  sizeLabel.style.top = `${e.clientY + 12}px`;
}

function handleSelectionMouseUp(e: MouseEvent): void {
  if (!selectionActive) return;

  const region: SelectionRegion = {
    x: Math.min(e.clientX, selectionStartX),
    y: Math.min(e.clientY, selectionStartY),
    width: Math.abs(e.clientX - selectionStartX),
    height: Math.abs(e.clientY - selectionStartY),
  };

  hideSelectionOverlay();

  // Only report if the selection is meaningful (at least 10x10 px)
  if (region.width >= 10 && region.height >= 10 && selectionPendingResponse) {
    log('Selection complete', region);
    selectionPendingResponse({
      type: MessageType.SELECTION_COMPLETE,
      payload: region,
    });
    selectionPendingResponse = null;
  } else {
    // Selection too small, treat as cancel
    if (selectionPendingResponse) {
      selectionPendingResponse({ cancelled: true, reason: 'Selection too small' });
      selectionPendingResponse = null;
    }
  }
}

function hideSelectionOverlay(): void {
  if (!selectionContainer) return;

  selectionActive = false;
  selectionRect = null;

  document.removeEventListener('mousedown', handleSelectionMouseDown, true);
  document.removeEventListener('mousemove', handleSelectionMouseMove, true);
  document.removeEventListener('mouseup', handleSelectionMouseUp, true);
  document.removeEventListener('keydown', handleSelectionEscape, true);

  selectionContainer.parentNode?.removeChild(selectionContainer);
  selectionContainer = null;
  selectionShadow = null;

  log('Selection overlay removed');
}

function handleSelectionEscape(e: KeyboardEvent): void {
  if (e.key === 'Escape' && selectionActive) {
    hideSelectionOverlay();
    if (selectionPendingResponse) {
      selectionPendingResponse({ cancelled: true, reason: 'User pressed Escape' });
      selectionPendingResponse = null;
    }
  }
}

// ===== Message Handler =====

function handleMessage(
  message: ChromeMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
): boolean | void {
  log('Message received', message.type);

  switch (message.type) {
    case MessageType.GET_PAGE_DIMENSIONS: {
      sendResponse(getPageDimensions());
      return false;
    }

    case MessageType.GET_PAGE_INFO: {
      sendResponse(getPageInfo());
      return false;
    }

    case MessageType.SCROLL_TO_POSITION: {
      const { x, y } = message.payload;
      scrollToPosition(x, y).then((result) => {
        sendResponse(result);
      });
      return true; // async response
    }

    case MessageType.HIDE_FIXED_ELEMENTS: {
      hideFixedElements();
      disableScrollSnap();
      sendResponse({ hidden: true, count: hiddenFixedElements.length });
      return false;
    }

    case MessageType.SHOW_FIXED_ELEMENTS: {
      showFixedElements();
      restoreScrollSnap();
      sendResponse({ shown: true });
      return false;
    }

    case MessageType.DISABLE_SCROLL_SNAP: {
      disableScrollSnap();
      sendResponse({ disabled: true });
      return false;
    }

    case MessageType.RESTORE_SCROLL_SNAP: {
      restoreScrollSnap();
      sendResponse({ restored: true });
      return false;
    }

    case MessageType.PRE_SCROLL_PAGE: {
      preScrollPage().then(() => {
        sendResponse({ success: true });
      });
      return true; // async response
    }

    case MessageType.CAPTURE_VISIBLE_AREA: {
      const hideFixed = message.payload?.hideFixedElements ?? true;
      if (hideFixed) {
        hideFixedElements();
        disableScrollSnap();
      }
      setTimeout(() => {
        sendResponse({
          type: MessageType.VISIBLE_AREA_CAPTURED,
          payload: {
            imageData: '',
            scrollX: window.scrollX,
            scrollY: window.scrollY,
          },
        });
      }, 50);
      return true;
    }

    case MessageType.GET_FIXED_ELEMENTS: {
      const elements = detectFixedElements();
      sendResponse({ count: elements.length, elements });
      return false;
    }

    case MessageType.SHOW_CAPTURE_OVERLAY: {
      showCaptureOverlay();
      sendResponse({ success: true });
      return false;
    }

    case MessageType.UPDATE_CAPTURE_OVERLAY: {
      const { progress, step } = message.payload;
      updateCaptureOverlay(progress, step);
      sendResponse({ success: true });
      return false;
    }

    case MessageType.HIDE_CAPTURE_OVERLAY: {
      // Temporarily hide overlay (display:none) — keeps in DOM for fast re-show
      hideCaptureOverlay();
      sendResponse({ success: true });
      return false;
    }

    case MessageType.CAPTURE_START: {
      showCaptureOverlay();
      sendResponse({ overlayShown: true });
      return false;
    }

    case MessageType.CAPTURE_COMPLETE:
    case MessageType.CAPTURE_ERROR: {
      removeCaptureOverlay();
      restoreScrollSnap();
      sendResponse({ cleaned: true });
      return false;
    }

    case MessageType.CANCEL_CAPTURE: {
      removeCaptureOverlay();
      restoreScrollSnap();
      sendResponse({ cancelled: true });
      return false;
    }

    case MessageType.START_SELECTION_MODE: {
      showSelectionOverlay();

      // Attach mouse listeners (use capture phase to intercept before page handlers)
      document.addEventListener('mousedown', handleSelectionMouseDown, true);
      document.addEventListener('mousemove', handleSelectionMouseMove, true);
      document.addEventListener('mouseup', handleSelectionMouseUp, true);
      document.addEventListener('keydown', handleSelectionEscape, true);

      // Store sendResponse to call when selection is complete
      selectionPendingResponse = sendResponse;
      return true; // async response
    }

    default:
      return false;
  }
}

// ===== Initialize =====

function init(): void {
  if (isPageListenerAttached) return;

  chrome.runtime.onMessage.addListener(handleMessage);
  isPageListenerAttached = true;
  log('Content script initialized');
}

// Auto-initialize
init();
