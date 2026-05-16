// chrome-extension/src/content/index.ts
function log(message, data) {
  console.log(`[SmartCapture CS] ${message}`, data ?? "");
}
var hiddenFixedElements = [];
var isPageListenerAttached = false;
var scrollSnapBackup = /* @__PURE__ */ new Map();
function findScrollableElement() {
  const html = document.documentElement;
  const body = document.body;
  const bodyStyle = window.getComputedStyle(body);
  const bodyOverflowHidden = bodyStyle.overflowY === "hidden" || bodyStyle.overflow === "hidden";
  if (!bodyOverflowHidden) {
    const docScrollHeight = Math.max(html.scrollHeight, body.scrollHeight);
    if (docScrollHeight > window.innerHeight + 10) {
      return { element: html, isWindow: true };
    }
  }
  const spaSelectors = [
    "ytd-app",
    // YouTube main app shell
    "#content",
    // YouTube main content area
    '[role="main"]',
    // ARIA main landmark (works for Twitter/X, GitHub)
    ".main-content",
    // Generic main content class
    '[data-testid="primaryColumn"]',
    // Twitter/X main feed column
    "#react-root header + main div"
    // Twitter/X root main container
  ];
  for (const selector of spaSelectors) {
    const el = document.querySelector(selector);
    if (!el) continue;
    let checkEl = el;
    for (let ancestorLevel = 0; ancestorLevel <= 3 && checkEl; ancestorLevel++) {
      const style = window.getComputedStyle(checkEl);
      const overflowY = style.overflowY;
      if ((overflowY === "auto" || overflowY === "scroll") && checkEl.scrollHeight > checkEl.clientHeight + 10) {
        const prevScrollTop = checkEl.scrollTop;
        checkEl.scrollTop = prevScrollTop + 1;
        const canControl = checkEl.scrollTop !== prevScrollTop || prevScrollTop === 0;
        checkEl.scrollTop = prevScrollTop;
        if (canControl) {
          const label = ancestorLevel === 0 ? `Found SPA scrollable container: ${selector}` : `Found SPA scrollable container: ${selector} (ancestor ${ancestorLevel} levels up)`;
          log(label, {
            scrollHeight: checkEl.scrollHeight,
            clientHeight: checkEl.clientHeight
          });
          return { element: checkEl, isWindow: false };
        }
      }
      checkEl = checkEl.parentElement;
    }
  }
  const MAX_DOM_WALK = 150;
  const WALK_TIME_BUDGET_MS = 500;
  const walkStart = performance.now();
  let walked = 0;
  let bestEl = null;
  let bestScroll = 0;
  const candidates = [];
  const walker = document.createTreeWalker(
    document.body || document.documentElement,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        if (walked >= MAX_DOM_WALK) return NodeFilter.FILTER_REJECT;
        if (walked > 0 && walked % 20 === 0) {
          if (performance.now() - walkStart > WALK_TIME_BUDGET_MS) {
            return NodeFilter.FILTER_REJECT;
          }
        }
        const el = node;
        const tag = el.tagName?.toLowerCase();
        if (tag === "div" || tag === "section" || tag === "main" || tag === "article" || tag === "aside" || tag === "nav" || el.hasAttribute("data-scrollable")) {
          walked++;
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      }
    }
  );
  let walkNode;
  while (walkNode = walker.nextNode()) {
    candidates.push(walkNode);
  }
  for (const el of candidates) {
    const inlineOverflow = el.style.overflowY || el.style.overflow;
    if (inlineOverflow === "auto" || inlineOverflow === "scroll") {
      const diff = el.scrollHeight - el.clientHeight;
      if (diff > 10 && diff > bestScroll) {
        bestScroll = diff;
        bestEl = el;
      }
    } else if (bestEl === null) {
      if (candidates.indexOf(el) < 30) {
        try {
          const style = window.getComputedStyle(el);
          if (style.overflowY === "auto" || style.overflowY === "scroll") {
            const diff = el.scrollHeight - el.clientHeight;
            if (diff > 10 && diff > bestScroll) {
              bestScroll = diff;
              bestEl = el;
            }
          }
        } catch {
        }
      }
    }
  }
  if (bestEl) {
    const prevScrollTop = bestEl.scrollTop;
    bestEl.scrollTop = prevScrollTop + 1;
    const canControl = bestEl.scrollTop !== prevScrollTop || prevScrollTop === 0;
    bestEl.scrollTop = prevScrollTop;
    if (canControl) {
      log(`Found nested scrollable element`, {
        tag: bestEl.tagName,
        id: bestEl.id,
        className: (typeof bestEl.className === "string" ? bestEl.className : "").substring(0, 100),
        scrollHeight: bestEl.scrollHeight,
        clientHeight: bestEl.clientHeight
      });
      return { element: bestEl, isWindow: false };
    }
  }
  return { element: html, isWindow: true };
}
function disableScrollSnap() {
  scrollSnapBackup.clear();
  const MAX_DEPTH = 5;
  const MAX_CHECKED = 100;
  const TIME_BUDGET_MS = 300;
  let checkedCount = 0;
  const startTime = performance.now();
  const body = document.body;
  if (!body) return;
  const checkElement = (el, depth) => {
    if (checkedCount >= MAX_CHECKED || depth > MAX_DEPTH) return;
    checkedCount++;
    if (checkedCount > 0 && checkedCount % 10 === 0) {
      if (performance.now() - startTime > TIME_BUDGET_MS) return;
    }
    const inlineSnap = el.style.scrollSnapType;
    if (inlineSnap && inlineSnap !== "none") {
      scrollSnapBackup.set(el, inlineSnap);
      el.style.setProperty("scroll-snap-type", "none", "important");
    } else {
      if (performance.now() - startTime < TIME_BUDGET_MS * 0.7) {
        try {
          const style = window.getComputedStyle(el);
          if (style.scrollSnapType !== "none") {
            scrollSnapBackup.set(el, el.style.scrollSnapType);
            el.style.setProperty("scroll-snap-type", "none", "important");
          }
        } catch {
        }
      }
    }
    for (const child of el.children) {
      if (child instanceof HTMLElement) {
        checkElement(child, depth + 1);
      }
    }
  };
  for (const child of body.children) {
    if (child instanceof HTMLElement) {
      checkElement(child, 1);
    }
  }
  if (scrollSnapBackup.size > 0) {
    log(`Disabled scroll-snap on ${scrollSnapBackup.size} elements (checked ${checkedCount} nodes, ${Math.round(performance.now() - startTime)}ms)`);
  }
}
function restoreScrollSnap() {
  for (const [el, original] of scrollSnapBackup) {
    el.style.setProperty("scroll-snap-type", original);
  }
  scrollSnapBackup.clear();
  log("Restored scroll-snap properties");
}
async function preScrollPage() {
  const { element: scrollEl, isWindow } = findScrollableElement();
  let totalScroll = isWindow ? document.documentElement.scrollHeight : scrollEl.scrollHeight;
  const viewportH = isWindow ? window.innerHeight : scrollEl.clientHeight;
  const step = Math.round(viewportH * 0.75);
  const MAX_PRE_SCROLL_DURATION = 5e3;
  const MAX_PRE_SCROLL_ITERATIONS = 100;
  const startTime = Date.now();
  log(`Pre-scrolling page (initialHeight=${totalScroll}, step=${step})`);
  let currentY = 0;
  let iterations = 0;
  let lastHeight = totalScroll;
  let stableCount = 0;
  while (currentY < totalScroll) {
    iterations++;
    const elapsed = Date.now() - startTime;
    if (elapsed > MAX_PRE_SCROLL_DURATION || iterations > MAX_PRE_SCROLL_ITERATIONS) {
      log(`Pre-scroll aborted: exceeded limits (${elapsed}ms, ${iterations} iterations)`);
      break;
    }
    if (isWindow) {
      window.scrollTo(0, currentY);
    } else {
      scrollEl.scrollTo({ top: currentY, left: 0, behavior: "instant" });
    }
    currentY += step;
    await new Promise((r) => setTimeout(r, 150));
    const newHeight = isWindow ? document.documentElement.scrollHeight : scrollEl.scrollHeight;
    if (Math.abs(newHeight - lastHeight) < 10) {
      stableCount++;
    } else {
      stableCount = 0;
      lastHeight = newHeight;
    }
    if (stableCount >= 3 && currentY >= newHeight) {
      log(`Pre-scroll: page height stabilized at ${newHeight}px`);
      break;
    }
    totalScroll = newHeight;
  }
  if (isWindow) {
    window.scrollTo(0, 0);
  } else {
    scrollEl.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }
  await new Promise((r) => setTimeout(r, 200));
  log(`Pre-scroll complete (${iterations} iterations, ${Date.now() - startTime}ms)`);
}
function getPageDimensions() {
  const measureStart = performance.now();
  const TIME_BUDGET_MS = 3e3;
  const { element: scrollEl, isWindow } = findScrollableElement();
  let scrollWidth;
  let scrollHeight;
  let viewportWidth;
  let viewportHeight;
  if (isWindow) {
    scrollWidth = document.documentElement.scrollWidth || document.body.scrollWidth;
    scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight;
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
  } else {
    scrollWidth = scrollEl.scrollWidth;
    scrollHeight = scrollEl.scrollHeight;
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
  }
  const devicePixelRatio = window.devicePixelRatio || 1;
  const elapsedSoFar = performance.now() - measureStart;
  const remainingBudget = TIME_BUDGET_MS - elapsedSoFar;
  let fixedElements = [];
  if (remainingBudget > 500) {
    fixedElements = detectFixedElements(remainingBudget);
  } else {
    log(`Skipping detectFixedElements \u2014 only ${Math.round(remainingBudget)}ms remaining (used ${Math.round(elapsedSoFar)}ms for findScrollableElement)`);
  }
  const dimensions = {
    scrollWidth,
    scrollHeight,
    viewportWidth,
    viewportHeight,
    devicePixelRatio,
    fixedElements
  };
  log(`Page dimensions measured in ${Math.round(performance.now() - measureStart)}ms`, {
    ...dimensions,
    fixedCount: fixedElements.length,
    scrollElement: isWindow ? "window" : `element(${scrollEl.tagName}#${scrollEl.id})`
  });
  return dimensions;
}
function getPageInfo() {
  return {
    url: window.location.href,
    title: document.title,
    timestamp: Date.now()
  };
}
function detectFixedElements(timeBudgetMs = 2e3) {
  const fixedElements = [];
  const MAX_DEPTH = 8;
  const MAX_CHECKED = 200;
  let checkedCount = 0;
  const startTime = performance.now();
  const body = document.body;
  if (!body) return fixedElements;
  const queue = [];
  for (const child of body.children) {
    if (child instanceof HTMLElement) {
      queue.push({ el: child, depth: 1 });
    }
  }
  while (queue.length > 0 && checkedCount < MAX_CHECKED) {
    if (checkedCount > 0 && checkedCount % 10 === 0) {
      const elapsed = performance.now() - startTime;
      if (elapsed > timeBudgetMs) {
        log(`detectFixedElements: time budget exceeded (${Math.round(elapsed)}ms / ${timeBudgetMs}ms), checked ${checkedCount} nodes`);
        break;
      }
    }
    const { el, depth } = queue.shift();
    checkedCount++;
    if (el.id === "smartcapture-overlay-container" || el.closest("#smartcapture-overlay-container")) {
      continue;
    }
    const tag = el.tagName.toLowerCase();
    if (tag === "body" || tag === "html") continue;
    if (el.offsetWidth === 0 || el.offsetHeight === 0) continue;
    const inlinePos = el.style.position;
    if (inlinePos === "fixed" || inlinePos === "sticky") {
      const rect = el.getBoundingClientRect();
      fixedElements.push({
        tagName: tag,
        id: el.id || "",
        className: (typeof el.className === "string" ? el.className : "").substring(0, 200),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        position: inlinePos
      });
    } else {
      const elapsed = performance.now() - startTime;
      if (elapsed > timeBudgetMs * 0.7) {
        continue;
      }
      try {
        const style = window.getComputedStyle(el);
        if (style.position === "fixed" || style.position === "sticky") {
          const rect = el.getBoundingClientRect();
          fixedElements.push({
            tagName: tag,
            id: el.id || "",
            className: (typeof el.className === "string" ? el.className : "").substring(0, 200),
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            position: style.position
          });
        }
      } catch {
        continue;
      }
    }
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
function hideFixedElements() {
  hiddenFixedElements = [];
  const MAX_DEPTH = 8;
  const MAX_CHECKED = 200;
  const TIME_BUDGET_MS = 300;
  const startTime = performance.now();
  const body = document.body;
  if (!body) return;
  const queue = [];
  for (const child of body.children) {
    if (child instanceof HTMLElement) {
      queue.push({ el: child, depth: 1 });
    }
  }
  let checked = 0;
  while (queue.length > 0 && checked < MAX_CHECKED) {
    if (checked > 0 && checked % 10 === 0) {
      if (performance.now() - startTime > TIME_BUDGET_MS) break;
    }
    const { el, depth } = queue.shift();
    checked++;
    if (el.id === "smartcapture-overlay-container" || el.closest("#smartcapture-overlay-container")) continue;
    const tag = el.tagName.toLowerCase();
    if (tag === "body" || tag === "html") {
      if (depth < MAX_DEPTH) {
        for (const child of el.children) {
          if (child instanceof HTMLElement && checked + queue.length < MAX_CHECKED) {
            queue.push({ el: child, depth: depth + 1 });
          }
        }
      }
      continue;
    }
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
    const inlinePos = el.style.position;
    let isFixedOrSticky = false;
    if (inlinePos === "fixed" || inlinePos === "sticky") {
      isFixedOrSticky = true;
    } else if (checked < 50 && performance.now() - startTime < TIME_BUDGET_MS * 0.7) {
      try {
        const style = window.getComputedStyle(el);
        if (style.position === "fixed" || style.position === "sticky") {
          isFixedOrSticky = true;
        }
      } catch {
      }
    }
    if (isFixedOrSticky) {
      hiddenFixedElements.push({
        element: el,
        originalVisibility: el.style.visibility || ""
      });
      el.style.setProperty("visibility", "hidden", "important");
    }
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
function showFixedElements() {
  for (const { element, originalVisibility } of hiddenFixedElements) {
    if (originalVisibility) {
      element.style.setProperty("visibility", originalVisibility);
    } else {
      element.style.removeProperty("visibility");
    }
  }
  hiddenFixedElements = [];
  log("Restored all fixed/sticky elements");
}
function waitForImagesInViewport(timeout = 3e3) {
  return new Promise((resolve) => {
    const viewportTop = window.scrollY;
    const viewportBottom = viewportTop + window.innerHeight;
    const images = document.querySelectorAll("img");
    const loadingImages = [];
    for (const img of images) {
      if (!img.complete) {
        const rect = img.getBoundingClientRect();
        const imgTop = rect.top + viewportTop;
        const imgBottom = imgTop + rect.height;
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
    for (const img of loadingImages) {
      const onLoad = () => {
        img.removeEventListener("load", onLoad);
        img.removeEventListener("error", onLoad);
        done();
      };
      img.addEventListener("load", onLoad, { once: true });
      img.addEventListener("error", onLoad, { once: true });
    }
    setTimeout(done, timeout);
  });
}
function scrollToPosition(x, y) {
  return new Promise((resolve) => {
    const { element: scrollEl, isWindow } = findScrollableElement();
    if (isWindow) {
      window.scrollTo(x, y);
    } else {
      scrollEl.scrollTo({ top: y, left: x, behavior: "instant" });
      void scrollEl.offsetHeight;
      scrollEl.dispatchEvent(new Event("scroll", { bubbles: true }));
    }
    requestAnimationFrame(() => {
      const HARD_TIMEOUT = 1500;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        waitForImagesInViewport(500).then(() => {
          const actualX = isWindow ? Math.round(window.scrollX) : Math.round(scrollEl.scrollLeft);
          const actualY = isWindow ? Math.round(window.scrollY) : Math.round(scrollEl.scrollTop);
          resolve({ success: true, scrollX: actualX, scrollY: actualY });
        });
      };
      let debounceTimer = null;
      const observer = new MutationObserver(() => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          observer.disconnect();
          finish();
        }, 150);
      });
      const observeTarget = scrollEl === document.documentElement ? document.body : scrollEl;
      observer.observe(observeTarget, {
        childList: true,
        subtree: true,
        attributes: true
      });
      debounceTimer = setTimeout(() => {
        if (!settled) {
          observer.disconnect();
          finish();
        }
      }, 300);
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
var overlayContainer = null;
var overlayShadow = null;
function showCaptureOverlay() {
  if (overlayContainer && overlayContainer.parentNode) {
    overlayContainer.style.transition = "";
    overlayContainer.style.opacity = "";
    updateOverlayVisibility(true);
    return;
  }
  if (overlayContainer && !overlayContainer.parentNode) {
    overlayContainer = null;
    overlayShadow = null;
  }
  overlayContainer = document.createElement("div");
  overlayContainer.id = "smartcapture-overlay-container";
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
  overlayShadow = overlayContainer.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
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
  const overlay = document.createElement("div");
  overlay.className = "sc-overlay";
  const progressBar = document.createElement("div");
  progressBar.className = "sc-progress-bar";
  progressBar.id = "sc-progress-bar";
  progressBar.style.width = "0%";
  overlay.appendChild(progressBar);
  const statusCard = document.createElement("div");
  statusCard.className = "sc-status-card";
  const statusTitle = document.createElement("div");
  statusTitle.className = "sc-status-title";
  statusTitle.textContent = "SmartCapture Pro";
  const statusStep = document.createElement("div");
  statusStep.className = "sc-status-step";
  statusStep.id = "sc-status-step";
  statusStep.innerHTML = '<span class="sc-spinner"></span>Preparing capture...';
  const statusProgress = document.createElement("div");
  statusProgress.className = "sc-status-progress";
  statusProgress.id = "sc-status-progress";
  statusProgress.textContent = "0%";
  statusCard.appendChild(statusTitle);
  statusCard.appendChild(statusStep);
  statusCard.appendChild(statusProgress);
  overlay.appendChild(statusCard);
  overlayShadow.appendChild(overlay);
  document.documentElement.appendChild(overlayContainer);
  log("Capture overlay shown");
}
function updateCaptureOverlay(progress, step) {
  if (!overlayShadow) return;
  const progressBar = overlayShadow.getElementById("sc-progress-bar");
  const statusStep = overlayShadow.getElementById("sc-status-step");
  const statusProgress = overlayShadow.getElementById("sc-status-progress");
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
function hideCaptureOverlay() {
  if (!overlayContainer) return;
  overlayContainer.style.display = "none";
  log("Capture overlay hidden (display:none)");
}
function removeCaptureOverlay() {
  if (!overlayContainer) return;
  if (overlayContainer.style.display === "none") {
    if (overlayContainer.parentNode) {
      overlayContainer.parentNode.removeChild(overlayContainer);
    }
    overlayContainer = null;
    overlayShadow = null;
    log("Capture overlay removed (was hidden)");
    return;
  }
  overlayContainer.style.transition = "opacity 0.3s ease";
  overlayContainer.style.opacity = "0";
  setTimeout(() => {
    if (overlayContainer && overlayContainer.parentNode) {
      overlayContainer.parentNode.removeChild(overlayContainer);
    }
    overlayContainer = null;
    overlayShadow = null;
    log("Capture overlay removed (faded out)");
  }, 300);
}
function updateOverlayVisibility(visible) {
  if (overlayContainer) {
    overlayContainer.style.display = visible ? "block" : "none";
  }
}
var selectionContainer = null;
var selectionShadow = null;
var selectionActive = false;
var selectionStartX = 0;
var selectionStartY = 0;
var selectionRect = null;
var selectionPendingResponse = null;
function showSelectionOverlay() {
  if (selectionContainer) return;
  selectionContainer = document.createElement("div");
  selectionContainer.id = "smartcapture-selection-container";
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
  selectionShadow = selectionContainer.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
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
  const bg = document.createElement("div");
  bg.className = "sc-selection-bg";
  selectionShadow.appendChild(bg);
  const hint = document.createElement("div");
  hint.className = "sc-selection-hint";
  hint.id = "sc-selection-hint";
  hint.innerHTML = '<div class="sc-selection-hint-title">Click and drag to select area</div><div class="sc-selection-hint-sub">Press Esc to cancel</div>';
  selectionShadow.appendChild(hint);
  document.documentElement.appendChild(selectionContainer);
  selectionActive = true;
  log("Selection overlay shown");
}
function handleSelectionMouseDown(e) {
  if (!selectionActive) return;
  selectionStartX = e.clientX;
  selectionStartY = e.clientY;
  const hint = selectionShadow?.getElementById("sc-selection-hint");
  if (hint) hint.remove();
  if (!selectionRect) {
    selectionRect = document.createElement("div");
    selectionRect.className = "sc-selection-rect";
    selectionShadow?.appendChild(selectionRect);
  }
  selectionRect.style.left = `${e.clientX}px`;
  selectionRect.style.top = `${e.clientY}px`;
  selectionRect.style.width = "0px";
  selectionRect.style.height = "0px";
}
function handleSelectionMouseMove(e) {
  if (!selectionActive || !selectionRect) return;
  const x = Math.min(e.clientX, selectionStartX);
  const y = Math.min(e.clientY, selectionStartY);
  const width = Math.abs(e.clientX - selectionStartX);
  const height = Math.abs(e.clientY - selectionStartY);
  selectionRect.style.left = `${x}px`;
  selectionRect.style.top = `${y}px`;
  selectionRect.style.width = `${width}px`;
  selectionRect.style.height = `${height}px`;
  let sizeLabel = selectionShadow?.getElementById("sc-selection-size");
  if (!sizeLabel) {
    sizeLabel = document.createElement("div");
    sizeLabel.className = "sc-selection-size";
    sizeLabel.id = "sc-selection-size";
    selectionShadow?.appendChild(sizeLabel);
  }
  sizeLabel.textContent = `${Math.round(width)} \xD7 ${Math.round(height)}`;
  sizeLabel.style.left = `${e.clientX + 12}px`;
  sizeLabel.style.top = `${e.clientY + 12}px`;
}
function handleSelectionMouseUp(e) {
  if (!selectionActive) return;
  const region = {
    x: Math.min(e.clientX, selectionStartX),
    y: Math.min(e.clientY, selectionStartY),
    width: Math.abs(e.clientX - selectionStartX),
    height: Math.abs(e.clientY - selectionStartY)
  };
  hideSelectionOverlay();
  if (region.width >= 10 && region.height >= 10 && selectionPendingResponse) {
    log("Selection complete", region);
    selectionPendingResponse({
      type: "SELECTION_COMPLETE" /* SELECTION_COMPLETE */,
      payload: region
    });
    selectionPendingResponse = null;
  } else {
    if (selectionPendingResponse) {
      selectionPendingResponse({ cancelled: true, reason: "Selection too small" });
      selectionPendingResponse = null;
    }
  }
}
function hideSelectionOverlay() {
  if (!selectionContainer) return;
  selectionActive = false;
  selectionRect = null;
  document.removeEventListener("mousedown", handleSelectionMouseDown, true);
  document.removeEventListener("mousemove", handleSelectionMouseMove, true);
  document.removeEventListener("mouseup", handleSelectionMouseUp, true);
  document.removeEventListener("keydown", handleSelectionEscape, true);
  selectionContainer.parentNode?.removeChild(selectionContainer);
  selectionContainer = null;
  selectionShadow = null;
  log("Selection overlay removed");
}
function handleSelectionEscape(e) {
  if (e.key === "Escape" && selectionActive) {
    hideSelectionOverlay();
    if (selectionPendingResponse) {
      selectionPendingResponse({ cancelled: true, reason: "User pressed Escape" });
      selectionPendingResponse = null;
    }
  }
}
function handleMessage(message, _sender, sendResponse) {
  log("Message received", message.type);
  switch (message.type) {
    case "GET_PAGE_DIMENSIONS" /* GET_PAGE_DIMENSIONS */: {
      sendResponse(getPageDimensions());
      return false;
    }
    case "GET_PAGE_INFO" /* GET_PAGE_INFO */: {
      sendResponse(getPageInfo());
      return false;
    }
    case "SCROLL_TO_POSITION" /* SCROLL_TO_POSITION */: {
      const { x, y } = message.payload;
      scrollToPosition(x, y).then((result) => {
        sendResponse(result);
      });
      return true;
    }
    case "HIDE_FIXED_ELEMENTS" /* HIDE_FIXED_ELEMENTS */: {
      hideFixedElements();
      disableScrollSnap();
      sendResponse({ hidden: true, count: hiddenFixedElements.length });
      return false;
    }
    case "SHOW_FIXED_ELEMENTS" /* SHOW_FIXED_ELEMENTS */: {
      showFixedElements();
      restoreScrollSnap();
      sendResponse({ shown: true });
      return false;
    }
    case "DISABLE_SCROLL_SNAP" /* DISABLE_SCROLL_SNAP */: {
      disableScrollSnap();
      sendResponse({ disabled: true });
      return false;
    }
    case "RESTORE_SCROLL_SNAP" /* RESTORE_SCROLL_SNAP */: {
      restoreScrollSnap();
      sendResponse({ restored: true });
      return false;
    }
    case "PRE_SCROLL_PAGE" /* PRE_SCROLL_PAGE */: {
      preScrollPage().then(() => {
        sendResponse({ success: true });
      });
      return true;
    }
    case "CAPTURE_VISIBLE_AREA" /* CAPTURE_VISIBLE_AREA */: {
      const hideFixed = message.payload?.hideFixedElements ?? true;
      if (hideFixed) {
        hideFixedElements();
        disableScrollSnap();
      }
      setTimeout(() => {
        sendResponse({
          type: "VISIBLE_AREA_CAPTURED" /* VISIBLE_AREA_CAPTURED */,
          payload: {
            imageData: "",
            scrollX: window.scrollX,
            scrollY: window.scrollY
          }
        });
      }, 50);
      return true;
    }
    case "GET_FIXED_ELEMENTS" /* GET_FIXED_ELEMENTS */: {
      const elements = detectFixedElements();
      sendResponse({ count: elements.length, elements });
      return false;
    }
    case "SHOW_CAPTURE_OVERLAY" /* SHOW_CAPTURE_OVERLAY */: {
      showCaptureOverlay();
      sendResponse({ success: true });
      return false;
    }
    case "UPDATE_CAPTURE_OVERLAY" /* UPDATE_CAPTURE_OVERLAY */: {
      const { progress, step } = message.payload;
      updateCaptureOverlay(progress, step);
      sendResponse({ success: true });
      return false;
    }
    case "HIDE_CAPTURE_OVERLAY" /* HIDE_CAPTURE_OVERLAY */: {
      hideCaptureOverlay();
      sendResponse({ success: true });
      return false;
    }
    case "CAPTURE_START" /* CAPTURE_START */: {
      showCaptureOverlay();
      sendResponse({ overlayShown: true });
      return false;
    }
    case "CAPTURE_COMPLETE" /* CAPTURE_COMPLETE */:
    case "CAPTURE_ERROR" /* CAPTURE_ERROR */: {
      removeCaptureOverlay();
      restoreScrollSnap();
      sendResponse({ cleaned: true });
      return false;
    }
    case "CANCEL_CAPTURE" /* CANCEL_CAPTURE */: {
      removeCaptureOverlay();
      restoreScrollSnap();
      sendResponse({ cancelled: true });
      return false;
    }
    case "START_SELECTION_MODE" /* START_SELECTION_MODE */: {
      showSelectionOverlay();
      document.addEventListener("mousedown", handleSelectionMouseDown, true);
      document.addEventListener("mousemove", handleSelectionMouseMove, true);
      document.addEventListener("mouseup", handleSelectionMouseUp, true);
      document.addEventListener("keydown", handleSelectionEscape, true);
      selectionPendingResponse = sendResponse;
      return true;
    }
    default:
      return false;
  }
}
function init() {
  if (isPageListenerAttached) return;
  chrome.runtime.onMessage.addListener(handleMessage);
  isPageListenerAttached = true;
  log("Content script initialized");
}
init();
