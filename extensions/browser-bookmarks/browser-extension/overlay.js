const DG_OVERLAY_ROOT_ID = "dg-browser-overlay-root";
const DG_OVERLAY_APP_ROUTE = "/content/";
const DG_OVERLAY_IDLE_MS = 2400;
const DG_OVERLAY_MAX_CONNECTIONS = 5;
const DG_LAUNCHER_SIZE = 58;

function runtimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "Unknown error"));
        return;
      }
      resolve(response.data);
    });
  });
}

function normalizeComparableUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    if (
      (parsed.protocol === "https:" && parsed.port === "443") ||
      (parsed.protocol === "http:" && parsed.port === "80")
    ) {
      parsed.port = "";
    }
    const pathname = parsed.pathname.replace(/\/+$/, "");
    parsed.pathname = pathname || "/";
    return parsed.toString();
  } catch {
    return String(url || "").trim();
  }
}

function getCanonicalUrl() {
  const node = document.querySelector('link[rel="canonical"]');
  const href = node?.getAttribute("href")?.trim();
  if (!href) return null;
  try {
    return new URL(href, window.location.href).toString();
  } catch {
    return href;
  }
}

function getFaviconUrl() {
  const node =
    document.querySelector('link[rel="icon"]') ||
    document.querySelector('link[rel="shortcut icon"]') ||
    document.querySelector('link[rel="apple-touch-icon"]');
  const href = node?.getAttribute("href")?.trim();
  if (!href) return null;
  try {
    return new URL(href, window.location.href).toString();
  } catch {
    return href;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function initials(label) {
  return String(label || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function selectorForElement(element) {
  if (!(element instanceof Element) || element === document.body || element === document.documentElement) {
    return "body";
  }
  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }

  const segments = [];
  let current = element;
  while (current && current !== document.body && segments.length < 5) {
    let segment = current.tagName.toLowerCase();
    if (current.classList.length > 0) {
      const safeClass = Array.from(current.classList)
        .slice(0, 2)
        .map((name) => `.${CSS.escape(name)}`)
        .join("");
      if (safeClass) {
        segment += safeClass;
      }
    }
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (candidate) => candidate.tagName === current.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        segment += `:nth-of-type(${index})`;
      }
    }
    segments.unshift(segment);
    current = parent;
  }

  return segments.join(" > ") || "body";
}

function openAppContent(appBaseUrl, contentId) {
  if (!appBaseUrl || !contentId) return;
  const url = new URL(DG_OVERLAY_APP_ROUTE, appBaseUrl);
  url.searchParams.set("content", contentId);
  window.open(url.toString(), "_blank", "noopener,noreferrer");
}

function overlayStyles() {
  return `
    :host {
      all: initial;
    }
    * {
      box-sizing: border-box;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .dg-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483644;
      pointer-events: none;
    }
    .dg-overlay[data-idle="true"] .dg-main-button:not([data-open="true"]) {
      opacity: 0.18;
      transform: translateY(8px);
    }
    .dg-launcher {
      position: fixed;
      left: calc(100vw - 80px);
      top: calc(100vh - 80px);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      pointer-events: auto;
      touch-action: none;
    }
    .dg-launcher[data-side="left"] .dg-action-ring {
      left: 72px;
      right: auto;
      bottom: 4px;
      transform: translateX(-14px) scale(0.96);
    }
    .dg-launcher[data-side="left"] .dg-action-ring[data-open="true"] {
      transform: translateX(0) scale(1);
    }
    .dg-main-button {
      position: relative;
      width: 58px;
      height: 58px;
      border: 1px solid rgba(216, 176, 92, 0.34);
      border-radius: 999px;
      background:
        radial-gradient(circle at 30% 30%, rgba(224, 188, 112, 0.24), transparent 56%),
        rgba(13, 16, 20, 0.88);
      box-shadow:
        0 16px 48px rgba(0, 0, 0, 0.34),
        inset 0 1px 0 rgba(255, 255, 255, 0.08);
      color: #f2e2b6;
      cursor: pointer;
      transition: opacity 180ms ease, transform 180ms ease, box-shadow 180ms ease;
      backdrop-filter: blur(16px);
    }
    .dg-main-button:hover,
    .dg-main-button[data-open="true"] {
      opacity: 1;
      transform: translateY(0);
      box-shadow:
        0 20px 56px rgba(0, 0, 0, 0.42),
        0 0 0 1px rgba(216, 176, 92, 0.14),
        inset 0 1px 0 rgba(255, 255, 255, 0.08);
    }
    .dg-main-button span {
      font-size: 26px;
      line-height: 1;
    }
    .dg-action-ring {
      position: absolute;
      right: 72px;
      bottom: 4px;
      display: flex;
      align-items: center;
      gap: 10px;
      opacity: 0;
      transform: translateX(14px) scale(0.96);
      pointer-events: none;
      transition: opacity 180ms ease, transform 180ms ease;
    }
    .dg-action-ring[data-open="true"] {
      opacity: 1;
      transform: translateX(0) scale(1);
      pointer-events: auto;
    }
    .dg-action-button {
      position: relative;
      width: 46px;
      height: 46px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 999px;
      background: rgba(17, 20, 24, 0.94);
      color: white;
      cursor: pointer;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
    }
    .dg-action-button[data-active="true"] {
      border-color: rgba(216, 176, 92, 0.44);
      color: #f2e2b6;
    }
    .dg-action-button::after {
      content: attr(data-label);
      position: absolute;
      right: calc(100% + 10px);
      top: 50%;
      transform: translateY(-50%);
      padding: 7px 10px;
      border-radius: 999px;
      background: rgba(9, 11, 14, 0.92);
      color: rgba(255, 255, 255, 0.84);
      font-size: 12px;
      line-height: 1;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity 160ms ease;
    }
    .dg-action-button:hover::after {
      opacity: 1;
    }
    .dg-panel-popover {
      position: fixed;
      right: 92px;
      bottom: 92px;
      width: min(420px, calc(100vw - 40px));
      max-height: min(72vh, 720px);
      display: none;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 22px;
      background: rgba(15, 18, 23, 0.94);
      box-shadow: 0 22px 60px rgba(0, 0, 0, 0.36);
      backdrop-filter: blur(24px);
      pointer-events: auto;
    }
    .dg-panel-popover[data-open="true"] {
      display: flex;
    }
    .dg-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 16px 18px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .dg-panel-title {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.02em;
      color: white;
    }
    .dg-panel-subtitle {
      margin-top: 3px;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.54);
    }
    .dg-panel-close {
      border: 0;
      background: transparent;
      color: rgba(255, 255, 255, 0.58);
      cursor: pointer;
      font-size: 18px;
    }
    .dg-panel-body {
      overflow: auto;
      padding: 14px 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    #dg-tree-body {
      gap: 0;
      padding: 8px 0 12px;
    }
    .dg-status {
      padding: 11px 13px;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.06);
      color: rgba(255, 255, 255, 0.7);
      font-size: 12px;
      line-height: 1.45;
    }
    .dg-status[data-tone="error"] {
      background: rgba(160, 42, 42, 0.24);
      color: #ffd6d6;
    }
    .dg-list-item,
    .dg-connection-item,
    .dg-tree-row {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.04);
      color: white;
      text-align: left;
    }
    .dg-list-item:hover,
    .dg-connection-item:hover,
    .dg-tree-row:hover {
      background: rgba(255, 255, 255, 0.07);
      border-color: rgba(255, 255, 255, 0.14);
    }
    .dg-list-meta,
    .dg-tree-meta {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      flex: 1;
    }
    .dg-list-title,
    .dg-tree-title {
      color: white;
      font-size: 14px;
      font-weight: 600;
      line-height: 1.3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dg-list-subtitle,
    .dg-tree-subtitle {
      color: rgba(255, 255, 255, 0.55);
      font-size: 12px;
      line-height: 1.4;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dg-list-chip,
    .dg-connection-chip {
      flex-shrink: 0;
      border-radius: 999px;
      padding: 6px 10px;
      background: rgba(216, 176, 92, 0.18);
      color: #f2e2b6;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .dg-connection-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(64px, 1fr));
      gap: 12px;
    }
    .dg-connection-button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      aspect-ratio: 1 / 1;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 22px;
      background: rgba(255, 255, 255, 0.04);
      color: white;
      cursor: pointer;
      position: relative;
      overflow: hidden;
    }
    .dg-connection-button:hover {
      background: rgba(255, 255, 255, 0.08);
    }
    .dg-connection-initials {
      width: 36px;
      height: 36px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: rgba(216, 176, 92, 0.18);
      color: #f2e2b6;
      font-weight: 700;
      font-size: 14px;
    }
    .dg-connection-button::after {
      content: attr(data-label);
      position: absolute;
      left: 50%;
      bottom: 8px;
      transform: translateX(-50%);
      max-width: calc(100% - 12px);
      color: rgba(255, 255, 255, 0.66);
      font-size: 11px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dg-tree-group {
      display: flex;
      flex-direction: column;
      gap: 0;
    }
    .dg-tree-row {
      min-height: 32px;
      gap: 8px;
      padding: 4px 8px 4px calc(8px + (var(--depth, 0) * 14px));
      border: 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 0;
      background: transparent;
    }
    .dg-tree-group:last-child > .dg-tree-row {
      border-bottom: 0;
    }
    .dg-tree-row:hover {
      background: rgba(255, 255, 255, 0.035);
      border-color: rgba(255, 255, 255, 0.07);
    }
    .dg-tree-row button {
      border: 0;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
    .dg-tree-expand {
      width: 18px;
      text-align: center;
      flex-shrink: 0;
      color: rgba(255, 255, 255, 0.6);
      font-size: 16px;
      line-height: 1;
    }
    .dg-tree-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .dg-tree-kind {
      width: 16px;
      text-align: center;
      flex-shrink: 0;
      color: rgba(255, 255, 255, 0.68);
      font-size: 12px;
    }
    .dg-mini-action {
      min-width: 24px;
      height: 22px;
      padding: 0 6px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.03);
      color: rgba(255, 255, 255, 0.76);
      font-size: 11px;
    }
    .dg-floating-panel {
      position: fixed;
      width: 420px;
      height: 56vh;
      min-width: 320px;
      min-height: 240px;
      border-radius: 22px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(13, 16, 20, 0.88);
      box-shadow:
        0 26px 70px rgba(0, 0, 0, 0.42),
        inset 0 1px 0 rgba(255, 255, 255, 0.06);
      backdrop-filter: blur(22px);
      pointer-events: auto;
      resize: both;
    }
    .dg-floating-panel[data-mode="docked"] {
      right: 18px !important;
      top: 18px !important;
      left: auto !important;
      bottom: 18px !important;
      width: min(440px, calc(100vw - 36px));
      height: calc(100vh - 36px);
      resize: none;
    }
    .dg-floating-panel[data-mode="embedded"] {
      resize: none;
    }
    .dg-panel-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.02);
      cursor: move;
    }
    .dg-panel-toolbar[data-mode="docked"] {
      cursor: default;
    }
    .dg-panel-toolbar-title {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .dg-panel-toolbar-title strong {
      color: white;
      font-size: 13px;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dg-panel-toolbar-title span {
      color: rgba(255, 255, 255, 0.54);
      font-size: 11px;
    }
    .dg-toolbar-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .dg-toolbar-button {
      min-width: 32px;
      height: 32px;
      padding: 0 10px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.04);
      color: rgba(255, 255, 255, 0.82);
      cursor: pointer;
      font-size: 12px;
      line-height: 1;
    }
    .dg-toolbar-button[data-active="true"] {
      color: #f2e2b6;
      border-color: rgba(216, 176, 92, 0.28);
      background: rgba(216, 176, 92, 0.12);
    }
    .dg-panel-frame {
      width: 100%;
      height: calc(100% - 53px);
      border: 0;
      background: white;
    }
    .dg-panel-collapsed {
      position: fixed;
      left: 18px;
      bottom: 18px;
      display: none;
      align-items: center;
      gap: 8px;
      border-radius: 999px;
      background: rgba(13, 16, 20, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 8px 12px;
      color: white;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.34);
      cursor: grab;
      touch-action: none;
    }
    .dg-panel-collapsed[data-open="true"] {
      display: inline-flex;
      pointer-events: auto;
    }
    .dg-panel-banner {
      padding: 10px 12px;
      margin: 0 14px;
      border-radius: 14px;
      background: rgba(216, 176, 92, 0.12);
      color: #f2e2b6;
      font-size: 12px;
      line-height: 1.45;
    }
    .dg-target-banner {
      position: fixed;
      left: 50%;
      top: 16px;
      transform: translateX(-50%);
      width: min(560px, calc(100vw - 32px));
      display: none;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      padding: 12px 14px;
      border-radius: 18px;
      border: 1px solid rgba(91, 175, 255, 0.28);
      background: rgba(14, 18, 24, 0.92);
      box-shadow: 0 20px 56px rgba(0, 0, 0, 0.32);
      color: white;
      pointer-events: auto;
    }
    .dg-target-banner[data-open="true"] {
      display: flex;
    }
    .dg-target-copy {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .dg-target-copy strong {
      font-size: 13px;
    }
    .dg-target-copy span {
      color: rgba(255, 255, 255, 0.62);
      font-size: 12px;
      line-height: 1.4;
    }
    .dg-target-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .dg-target-button {
      height: 32px;
      padding: 0 12px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.05);
      color: rgba(255, 255, 255, 0.82);
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    }
    .dg-target-button[data-variant="primary"] {
      background: rgba(91, 175, 255, 0.18);
      border-color: rgba(91, 175, 255, 0.34);
      color: #d9ebff;
    }
    .dg-target-highlight {
      position: fixed;
      display: none;
      border: 2px solid rgba(91, 175, 255, 0.94);
      border-radius: 14px;
      background: rgba(91, 175, 255, 0.08);
      box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.08),
        0 12px 32px rgba(0, 0, 0, 0.22);
      pointer-events: none;
    }
    .dg-target-highlight[data-open="true"] {
      display: block;
    }
  `;
}

function createOverlayApp(state) {
  const host = document.createElement("div");
  host.id = DG_OVERLAY_ROOT_ID;
  const shadow = host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);

  shadow.innerHTML = `
    <style>${overlayStyles()}</style>
    <div class="dg-overlay" data-idle="false">
      <div class="dg-launcher">
        <div class="dg-action-ring" id="dg-action-ring">
          <button class="dg-action-button" data-action="associations" data-label="Associated content">⦿</button>
          <button class="dg-action-button" data-action="connections" data-label="Quick add connections">⊕</button>
          <button class="dg-action-button" data-action="tree" data-label="Browse content tree">☰</button>
        </div>
        <button class="dg-main-button" id="dg-main-button" type="button" aria-label="Digital Garden">
          <span>◌</span>
        </button>
      </div>
      <section class="dg-panel-popover" id="dg-associations-panel">
        <div class="dg-panel-header">
          <div>
            <div class="dg-panel-title">Associated content</div>
            <div class="dg-panel-subtitle">Open notes, external links, and existing webpage associations.</div>
          </div>
          <button class="dg-panel-close" type="button" data-close-panel="dg-associations-panel">×</button>
        </div>
        <div class="dg-panel-body" id="dg-associations-body"></div>
      </section>
      <section class="dg-panel-popover" id="dg-connections-panel">
        <div class="dg-panel-header">
          <div>
            <div class="dg-panel-title">Quick add</div>
            <div class="dg-panel-subtitle">Save this page into one of your trusted sync connections.</div>
          </div>
          <button class="dg-panel-close" type="button" data-close-panel="dg-connections-panel">×</button>
        </div>
        <div class="dg-panel-body" id="dg-connections-body"></div>
      </section>
      <section class="dg-panel-popover" id="dg-tree-panel">
        <div class="dg-panel-header">
          <div>
            <div class="dg-panel-title">Content tree</div>
            <div class="dg-panel-subtitle">Associate this webpage with existing content.</div>
          </div>
          <button class="dg-panel-close" type="button" data-close-panel="dg-tree-panel">×</button>
        </div>
        <div class="dg-panel-body" id="dg-tree-body"></div>
      </section>
      <div class="dg-target-banner" id="dg-target-banner">
        <div class="dg-target-copy">
          <strong>Select an element to embed beside</strong>
          <span id="dg-target-copy">Hover the page to preview an embed container, then click to place it.</span>
        </div>
        <div class="dg-target-actions">
          <button class="dg-target-button" type="button" data-target-action="cancel">Cancel</button>
          <button class="dg-target-button" type="button" data-target-action="confirm" data-variant="primary">Use target</button>
        </div>
      </div>
      <div class="dg-target-highlight" id="dg-target-highlight"></div>
      <div id="dg-open-panels"></div>
    </div>
  `;

  state.host = host;
  state.shadow = shadow;
  state.root = shadow.querySelector(".dg-overlay");
  state.mainButton = shadow.getElementById("dg-main-button");
  state.launcher = shadow.querySelector(".dg-launcher");
  state.actionRing = shadow.getElementById("dg-action-ring");
  state.popovers = {
    associations: shadow.getElementById("dg-associations-panel"),
    connections: shadow.getElementById("dg-connections-panel"),
    tree: shadow.getElementById("dg-tree-panel"),
  };
  state.popoverBodies = {
    associations: shadow.getElementById("dg-associations-body"),
    connections: shadow.getElementById("dg-connections-body"),
    tree: shadow.getElementById("dg-tree-body"),
  };
  state.panelsMount = shadow.getElementById("dg-open-panels");
  state.targetBanner = shadow.getElementById("dg-target-banner");
  state.targetCopy = shadow.getElementById("dg-target-copy");
  state.targetHighlight = shadow.getElementById("dg-target-highlight");
}

function schedulePersist(state, contentId) {
  const timer = state.persistTimers.get(contentId);
  if (timer) {
    clearTimeout(timer);
  }
  state.persistTimers.set(
    contentId,
    setTimeout(() => {
      state.persistTimers.delete(contentId);
      const panel = state.openPanels.get(contentId);
      if (!panel || !state.resourceContext?.resource?.id) return;
      runtimeMessage({
        type: "save-overlay-view-state",
        payload: {
          webResourceId: state.resourceContext.resource.id,
          contentId,
          state: panel.state,
          layoutMode: panel.layoutMode,
          dockSide: panel.dockSide || null,
          positionX: panel.positionX,
          positionY: panel.positionY,
          width: panel.width,
          height: panel.height,
          opacity: panel.opacity,
          embeddedSelector: panel.embeddedSelector || null,
          embeddedPlacement: panel.embeddedPlacement || null,
          metadata: {
            ...(panel.metadata || {}),
            tileX: panel.tileX ?? null,
            tileY: panel.tileY ?? null,
          },
          lastActiveAt: new Date().toISOString(),
        },
      }).catch((error) => {
        console.warn("[DG Overlay] Failed to persist view state", error);
      });
    }, 220)
  );
}

function setIdle(state, idle) {
  state.isIdle = idle;
  if (state.root) {
    state.root.setAttribute("data-idle", idle ? "true" : "false");
  }
}

function markActivity(state) {
  setIdle(state, false);
  if (state.idleTimer) {
    clearTimeout(state.idleTimer);
  }
  state.idleTimer = setTimeout(() => {
    if (!state.menuOpen && state.openPanels.size === 0) {
      setIdle(state, true);
    }
  }, DG_OVERLAY_IDLE_MS);
}

function closeAllPopovers(state) {
  Object.values(state.popovers).forEach((panel) => panel?.setAttribute("data-open", "false"));
  Array.from(state.actionRing.querySelectorAll(".dg-action-button")).forEach((button) => {
    button.setAttribute("data-active", "false");
  });
}

function setMenuOpen(state, open) {
  state.menuOpen = open;
  state.mainButton?.setAttribute("data-open", open ? "true" : "false");
  state.actionRing?.setAttribute("data-open", open ? "true" : "false");
  if (!open) {
    closeAllPopovers(state);
  }
  markActivity(state);
}

function applyLauncherPosition(state) {
  if (!state.launcher) return;
  const x = clamp(
    state.launcherPosition?.x ?? window.innerWidth - DG_LAUNCHER_SIZE - 22,
    10,
    window.innerWidth - DG_LAUNCHER_SIZE - 10
  );
  const y = clamp(
    state.launcherPosition?.y ?? window.innerHeight - DG_LAUNCHER_SIZE - 22,
    10,
    window.innerHeight - DG_LAUNCHER_SIZE - 10
  );
  state.launcherPosition = { x, y };
  state.launcher.style.left = `${x}px`;
  state.launcher.style.top = `${y}px`;
  state.launcher.setAttribute(
    "data-side",
    x < window.innerWidth / 2 ? "left" : "right"
  );
}

function closePopoverById(state, id) {
  Object.entries(state.popovers).forEach(([key, panel]) => {
    if (!panel) return;
    const isTarget = panel.id === id;
    panel.setAttribute("data-open", isTarget ? "false" : panel.getAttribute("data-open") || "false");
    const action = state.actionRing.querySelector(`[data-action="${key}"]`);
    if (action) {
      action.setAttribute("data-active", "false");
    }
  });
}

function togglePopover(state, key) {
  const panel = state.popovers[key];
  if (!panel) return;
  const nextOpen = panel.getAttribute("data-open") !== "true";
  closeAllPopovers(state);
  if (nextOpen) {
    panel.setAttribute("data-open", "true");
    const action = state.actionRing.querySelector(`[data-action="${key}"]`);
    if (action) {
      action.setAttribute("data-active", "true");
    }
  }
  markActivity(state);
}

function renderStatus(container, text, tone = "") {
  container.innerHTML = `<div class="dg-status"${tone ? ` data-tone="${tone}"` : ""}>${escapeHtml(text)}</div>`;
}

function resourcePayload() {
  return {
    url: window.location.href,
    canonicalUrl: getCanonicalUrl(),
    title: document.title || window.location.hostname,
    faviconUrl: getFaviconUrl(),
    metadata: {
      ogTitle:
        document.querySelector('meta[property="og:title"]')?.getAttribute("content") || null,
      ogDescription:
        document
          .querySelector('meta[property="og:description"]')
          ?.getAttribute("content") || null,
    },
  };
}

async function loadResourceContext(state) {
  state.resourceContext = await runtimeMessage({
    type: "fetch-resource-context",
    payload: resourcePayload(),
  });
  return state.resourceContext;
}

async function loadContentTree(state) {
  if (state.contentTree) return state.contentTree;
  state.contentTree = await runtimeMessage({ type: "fetch-content-picker-tree" });
  return state.contentTree;
}

async function loadConnections(state) {
  if (state.connections) return state.connections;
  state.connections = await runtimeMessage({ type: "fetch-connections" });
  return state.connections;
}

function renderAssociationsPopover(state) {
  const container = state.popoverBodies.associations;
  if (!container) return;
  const context = state.resourceContext;
  if (!context) {
    renderStatus(container, "This page is not connected to Digital Garden yet.");
    return;
  }

  const sections = [];
  const associations = context.associations || [];
  const externalContents = context.externalContents || [];

  if (associations.length === 0 && externalContents.length === 0) {
    renderStatus(
      container,
      "No associated content was found for this webpage yet. Use the content tree to associate a note or content item."
    );
    return;
  }

  if (externalContents.length > 0) {
    sections.push(
      externalContents
        .map(
          (entry) => `
            <button class="dg-list-item" type="button" data-open-content="${escapeHtml(
              entry.id
            )}" data-content-kind="external">
              <div class="dg-list-meta">
                <div class="dg-list-title">${escapeHtml(entry.title || "External link")}</div>
                <div class="dg-list-subtitle">Bookmark-backed external content</div>
              </div>
              <div class="dg-list-chip">external</div>
            </button>
          `
        )
        .join("")
    );
  }

  if (associations.length > 0) {
    sections.push(
      associations
        .map(
          (entry) => `
            <button class="dg-list-item" type="button" data-open-content="${escapeHtml(
              entry.content.id
            )}" data-content-kind="${escapeHtml(entry.content.contentType)}">
              <div class="dg-list-meta">
                <div class="dg-list-title">${escapeHtml(entry.content.title)}</div>
                <div class="dg-list-subtitle">${escapeHtml(entry.content.contentType)}</div>
              </div>
              <div class="dg-list-chip">associated</div>
            </button>
          `
        )
        .join("")
    );
  }

  container.innerHTML = sections.join("");
}

function renderConnectionsPopover(state) {
  const container = state.popoverBodies.connections;
  if (!container) return;
  const connections = (state.connections || []).slice(0, DG_OVERLAY_MAX_CONNECTIONS);
  if (connections.length === 0) {
    renderStatus(
      container,
      "No trusted sync connections are available yet. Create a browser-bookmark sync connection in Digital Garden settings."
    );
    return;
  }

  container.innerHTML = `
    <div class="dg-connection-grid">
      ${connections
        .map(
          (connection) => `
            <button
              class="dg-connection-button"
              type="button"
              data-quick-add="${escapeHtml(connection.id)}"
              data-label="${escapeHtml(connection.name)}"
              title="${escapeHtml(connection.name)}"
            >
              <span class="dg-connection-initials">${escapeHtml(
                initials(connection.name)
              )}</span>
            </button>
          `
        )
        .join("")}
    </div>
    <div class="dg-status" id="dg-connection-status">
      Click a connection to save this page into its synced browser folder.
    </div>
  `;
}

function renderTreeRows(state, nodes, depth = 0) {
  return nodes
    .map((node) => {
      const isFolder = node.contentType === "folder";
      const expanded = state.expandedTreeIds.has(node.id);
      const children =
        isFolder && expanded && node.children?.length
          ? renderTreeRows(state, node.children, depth + 1)
          : "";

      return `
        <div class="dg-tree-group">
          <div class="dg-tree-row" style="--depth:${depth}">
            <button class="dg-tree-expand" type="button" ${
              isFolder ? `data-toggle-tree="${escapeHtml(node.id)}"` : ""
            }>${isFolder ? (expanded ? "▾" : "▸") : "•"}</button>
            <span class="dg-tree-kind">${isFolder ? "▣" : "◫"}</span>
            <div class="dg-tree-meta">
              <div class="dg-tree-title">${escapeHtml(node.title)}</div>
              <div class="dg-tree-subtitle">${escapeHtml(node.contentType)}</div>
            </div>
            <div class="dg-tree-actions">
              ${
                isFolder
                  ? `
                    <button class="dg-mini-action" type="button" data-create-tree-item="folder" data-parent-content="${escapeHtml(
                      node.id
                    )}">+F</button>
                    <button class="dg-mini-action" type="button" data-create-tree-item="note" data-parent-content="${escapeHtml(
                      node.id
                    )}">+N</button>
                    <button class="dg-mini-action" type="button" data-create-tree-item="external" data-parent-content="${escapeHtml(
                      node.id
                    )}">+L</button>
                  `
                  : `<button class="dg-mini-action" type="button" data-associate-content="${escapeHtml(
                      node.id
                    )}" data-content-kind="${escapeHtml(node.contentType)}">Open</button>`
              }
            </div>
          </div>
          ${children}
        </div>
      `;
    })
    .join("");
}

function renderTreePopover(state) {
  const container = state.popoverBodies.tree;
  if (!container) return;
  if (!state.contentTree || state.contentTree.length === 0) {
    renderStatus(container, "No content is available to associate yet.");
    return;
  }
  container.innerHTML = `
    <div class="dg-status">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        <span>Create content at the root, or use the compact actions on folders to add nested items.</span>
        <span style="display:flex;gap:6px;">
          <button class="dg-mini-action" type="button" data-create-tree-item="folder">+ Folder</button>
          <button class="dg-mini-action" type="button" data-create-tree-item="note">+ Note</button>
          <button class="dg-mini-action" type="button" data-create-tree-item="external">+ Link</button>
        </span>
      </div>
    </div>
    ${renderTreeRows(state, state.contentTree)}
  `;
}

function positionEmbeddedPanel(state, panel) {
  if (!panel.embeddedSelector) return false;
  const anchor = document.querySelector(panel.embeddedSelector);
  if (!(anchor instanceof Element)) {
    panel.layoutMode = "floating";
    panel.embeddedSelector = null;
    if (panel.embeddedPreviewNode) {
      panel.embeddedPreviewNode.remove();
      panel.embeddedPreviewNode = null;
    }
    applyPanelGeometry(state, panel);
    schedulePersist(state, panel.contentId);
    return false;
  }
  if (!panel.embeddedPreviewNode) {
    const previewNode = document.createElement("div");
    previewNode.setAttribute("data-dg-embedded-preview", panel.contentId);
    previewNode.style.margin = "12px 0";
    previewNode.style.minHeight = `${panel.height || 320}px`;
    previewNode.style.borderRadius = "18px";
    previewNode.style.border = "2px dashed rgba(91, 175, 255, 0.4)";
    previewNode.style.background =
      "linear-gradient(180deg, rgba(91, 175, 255, 0.10), rgba(91, 175, 255, 0.03))";
    previewNode.style.boxShadow = "inset 0 0 0 1px rgba(255,255,255,0.08)";
    previewNode.style.display = "flex";
    previewNode.style.alignItems = "center";
    previewNode.style.justifyContent = "center";
    previewNode.style.color = "rgba(91, 175, 255, 0.82)";
    previewNode.style.font = "600 12px/1.4 system-ui, sans-serif";
    previewNode.textContent = "Digital Garden embedded note";
    panel.embeddedPreviewNode = previewNode;
  }
  if (panel.embeddedPreviewNode.parentElement !== anchor.parentElement) {
    anchor.insertAdjacentElement("afterend", panel.embeddedPreviewNode);
  } else if (anchor.nextElementSibling !== panel.embeddedPreviewNode) {
    anchor.insertAdjacentElement("afterend", panel.embeddedPreviewNode);
  }
  panel.embeddedPreviewNode.style.minHeight = `${panel.height || 320}px`;
  panel.embeddedPreviewNode.style.display = "flex";
  const desiredHeight = clamp(panel.height || 420, 220, window.innerHeight - 32);
  panel.embeddedPreviewNode.style.minHeight = `${desiredHeight}px`;
  panel.embeddedPreviewNode.style.height = `${desiredHeight}px`;
  const placeholderRect = panel.embeddedPreviewNode.getBoundingClientRect();
  const rect = anchor.getBoundingClientRect();
  const width = clamp(Math.max(rect.width, panel.width || 420), 320, window.innerWidth - 32);
  const left = clamp(placeholderRect.left, 16, window.innerWidth - width - 16);
  const top = clamp(placeholderRect.top, 16, window.innerHeight - desiredHeight - 16);
  panel.positionX = left;
  panel.positionY = top;
  panel.container.style.left = `${left}px`;
  panel.container.style.top = `${top}px`;
  panel.container.style.width = `${width}px`;
  panel.container.style.height = `${desiredHeight}px`;
  return true;
}

function layoutDockedPanels(state) {
  const docked = Array.from(state.openPanels.values()).filter(
    (panel) => panel.layoutMode === "docked" && panel.state === "open"
  );
  docked.forEach((panel, index) => {
    panel.container.style.top = `${18 + index * 28}px`;
    panel.container.style.right = `18px`;
    panel.container.style.left = "auto";
    panel.container.style.bottom = "18px";
    panel.container.style.height = `${Math.max(window.innerHeight - 36 - index * 28, 260)}px`;
  });
}

function applyPanelGeometry(state, panel) {
  panel.container.setAttribute("data-mode", panel.layoutMode);
  panel.toolbar.setAttribute("data-mode", panel.layoutMode);
  panel.container.style.opacity = String(panel.opacity || 1);
  if (panel.layoutMode !== "embedded" && panel.embeddedPreviewNode) {
    panel.embeddedPreviewNode.remove();
    panel.embeddedPreviewNode = null;
  }

  if (panel.layoutMode === "docked") {
    layoutDockedPanels(state);
    return;
  }

  if (panel.layoutMode === "embedded") {
    if (positionEmbeddedPanel(state, panel)) {
      return;
    }
  }

  const width = clamp(panel.width || 420, 320, window.innerWidth - 32);
  const height = clamp(panel.height || Math.round(window.innerHeight * 0.56), 220, window.innerHeight - 32);
  const x = clamp(
    panel.positionX ?? window.innerWidth - width - 24,
    16,
    window.innerWidth - width - 16
  );
  const y = clamp(
    panel.positionY ?? 88,
    16,
    window.innerHeight - height - 16
  );

  panel.width = width;
  panel.height = height;
  panel.positionX = x;
  panel.positionY = y;
  panel.container.style.left = `${x}px`;
  panel.container.style.top = `${y}px`;
  panel.container.style.width = `${width}px`;
  panel.container.style.height = `${height}px`;
}

async function createTreeContentItem(state, payload) {
  return runtimeMessage({
    type: "create-content-picker-item",
    payload: {
      ...payload,
      webResourceId: state.resourceContext?.resource?.id || null,
      url:
        payload.type === "external"
          ? state.resourceContext?.resource?.canonicalUrl ||
            state.resourceContext?.resource?.normalizedUrl ||
            window.location.href
          : undefined,
      description:
        payload.type === "external"
          ? `Saved from ${window.location.hostname}`
          : undefined,
    },
  });
}

function showCollapsedChip(panel) {
  panel.collapsedChip.setAttribute("data-open", panel.state === "collapsed" ? "true" : "false");
}

function applyTilePosition(state, panel) {
  const x =
    panel.tileX ??
    clamp(
      18 + state.tileOrder.indexOf(panel.contentId) * 170,
      12,
      window.innerWidth - 180
    );
  const y = panel.tileY ?? window.innerHeight - 62;
  panel.tileX = clamp(x, 12, window.innerWidth - 180);
  panel.tileY = clamp(y, 12, window.innerHeight - 44);
  panel.collapsedChip.style.left = `${panel.tileX}px`;
  panel.collapsedChip.style.bottom = "auto";
  panel.collapsedChip.style.top = `${panel.tileY}px`;
}

function wirePanelIframe(state, panel) {
  const origin = new URL(state.config.appBaseUrl).origin;
  const token = state.config.token;
  let readyTimer = setTimeout(() => {
    panel.readyHint.textContent = "Waiting for Digital Garden overlay…";
  }, 2200);

  const handler = (event) => {
    if (event.origin !== origin) return;
    if (event.source !== panel.iframe.contentWindow) return;
    if (event.data?.type !== "dg-overlay-ready") return;
    clearTimeout(readyTimer);
    panel.readyHint.textContent = "";
    panel.iframe.contentWindow?.postMessage(
      {
        type: "dg-extension-auth",
        token,
      },
      origin
    );
  };

  window.addEventListener("message", handler);
  panel.cleanupHandlers.push(() => {
    clearTimeout(readyTimer);
    window.removeEventListener("message", handler);
  });
}

function closePanel(state, contentId, nextState = "closed") {
  const panel = state.openPanels.get(contentId);
  if (!panel) return;
  panel.state = nextState;
  showCollapsedChip(panel);
  if (nextState === "closed") {
    state.tileOrder = state.tileOrder.filter((id) => id !== contentId);
    if (panel.embeddedPreviewNode) {
      panel.embeddedPreviewNode.remove();
      panel.embeddedPreviewNode = null;
    }
    panel.cleanupHandlers.forEach((cleanup) => {
      try {
        cleanup();
      } catch {}
    });
    panel.container.remove();
    panel.collapsedChip.remove();
    state.openPanels.delete(contentId);
  } else {
    panel.container.style.display = "none";
    if (!state.tileOrder.includes(contentId)) {
      state.tileOrder.push(contentId);
    }
    applyTilePosition(state, panel);
  }
  schedulePersist(state, contentId);
}

function reopenPanel(state, contentId) {
  const panel = state.openPanels.get(contentId);
  if (!panel) return;
  panel.state = "open";
  panel.container.style.display = "block";
  state.tileOrder = state.tileOrder.filter((id) => id !== contentId);
  showCollapsedChip(panel);
  applyPanelGeometry(state, panel);
  schedulePersist(state, contentId);
}

function makePanelDraggable(state, panel) {
  let drag = null;
  const onPointerMove = (event) => {
    if (!drag || panel.layoutMode === "docked") return;
    panel.layoutMode = "floating";
    panel.positionX = drag.startX + (event.clientX - drag.pointerX);
    panel.positionY = drag.startY + (event.clientY - drag.pointerY);
    applyPanelGeometry(state, panel);
  };
  const stop = () => {
    if (!drag) return;
    drag = null;
    schedulePersist(state, panel.contentId);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stop);
  };

  panel.toolbar.addEventListener("pointerdown", (event) => {
    if (panel.layoutMode === "docked") return;
    if (event.target.closest(".dg-toolbar-actions")) return;
    drag = {
      startX: panel.positionX ?? 0,
      startY: panel.positionY ?? 0,
      pointerX: event.clientX,
      pointerY: event.clientY,
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stop);
  });

  panel.cleanupHandlers.push(() => {
    stop();
  });
}

function createContentPanel(state, item, kind, persisted = null) {
  const existing = state.openPanels.get(item.id);
  if (existing) {
    reopenPanel(state, item.id);
    return existing;
  }

  const container = document.createElement("section");
  container.className = "dg-floating-panel";
  const title = item.title || (kind === "note" ? "Note" : "External link");
  container.innerHTML = `
    <div class="dg-panel-toolbar">
      <div class="dg-panel-toolbar-title">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(kind === "note" ? "Web note overlay" : "External metadata overlay")}</span>
      </div>
      <div class="dg-toolbar-actions">
        <span class="dg-panel-ready" style="font-size:11px;color:rgba(255,255,255,0.46)"></span>
        <button class="dg-toolbar-button" type="button" data-panel-mode="floating">Float</button>
        <button class="dg-toolbar-button" type="button" data-panel-mode="docked">Dock</button>
        <button class="dg-toolbar-button" type="button" data-panel-mode="embedded">Embed</button>
        <button class="dg-toolbar-button" type="button" data-panel-action="reanchor">↺</button>
        <button class="dg-toolbar-button" type="button" data-panel-action="opacity">◐</button>
        <button class="dg-toolbar-button" type="button" data-panel-action="app">↗</button>
        <button class="dg-toolbar-button" type="button" data-panel-action="collapse">—</button>
        <button class="dg-toolbar-button" type="button" data-panel-action="close">×</button>
      </div>
    </div>
    <iframe class="dg-panel-frame" allow="clipboard-write" referrerpolicy="origin"></iframe>
  `;

  const collapsedChip = document.createElement("button");
  collapsedChip.className = "dg-panel-collapsed";
  collapsedChip.type = "button";
  collapsedChip.innerHTML = `<span>${escapeHtml(title)}</span><strong>Open</strong>`;

  const iframe = container.querySelector("iframe");
  iframe.src = `${state.config.appBaseUrl.replace(/\/$/, "")}/content/focus/${item.id}?extension=1`;

  state.panelsMount.appendChild(container);
  state.panelsMount.appendChild(collapsedChip);

  const panel = {
    contentId: item.id,
    kind,
    container,
    iframe,
    toolbar: container.querySelector(".dg-panel-toolbar"),
    readyHint: container.querySelector(".dg-panel-ready"),
    collapsedChip,
    cleanupHandlers: [],
    state: persisted?.state || "open",
    layoutMode: persisted?.layoutMode || "floating",
    dockSide: persisted?.dockSide || "right",
    positionX: persisted?.positionX ?? null,
    positionY: persisted?.positionY ?? null,
    width: persisted?.width ?? 420,
    height: persisted?.height ?? Math.round(window.innerHeight * 0.56),
    opacity: persisted?.opacity ?? 1,
    embeddedSelector: persisted?.embeddedSelector || null,
    embeddedPlacement: persisted?.embeddedPlacement || "after",
    metadata: persisted?.metadata || {},
    embeddedPreviewNode: null,
    tileX: persisted?.metadata?.tileX ?? null,
    tileY: persisted?.metadata?.tileY ?? null,
    suppressChipClickUntil: 0,
  };

  state.openPanels.set(item.id, panel);
  makePanelDraggable(state, panel);
  wirePanelIframe(state, panel);
  applyPanelGeometry(state, panel);
  showCollapsedChip(panel);

  const resizeObserver = new ResizeObserver(() => {
    if (panel.layoutMode === "embedded") {
      return;
    }
    const rect = panel.container.getBoundingClientRect();
    panel.width = Math.round(rect.width);
    panel.height = Math.round(rect.height);
    schedulePersist(state, panel.contentId);
  });
  resizeObserver.observe(panel.container);
  panel.cleanupHandlers.push(() => resizeObserver.disconnect());

  panel.toolbar.addEventListener("click", (event) => {
    const button = event.target.closest("[data-panel-mode],[data-panel-action]");
    if (!button) return;

    const mode = button.getAttribute("data-panel-mode");
    const action = button.getAttribute("data-panel-action");

    if (mode) {
      if (mode === "embedded") {
        beginEmbedTargeting(state, panel);
        return;
      }
      panel.layoutMode = mode;
      panel.container.querySelectorAll("[data-panel-mode]").forEach((candidate) => {
        candidate.setAttribute(
          "data-active",
          candidate.getAttribute("data-panel-mode") === mode ? "true" : "false"
        );
      });
      applyPanelGeometry(state, panel);
      schedulePersist(state, panel.contentId);
      return;
    }

    if (action === "reanchor") {
      beginEmbedTargeting(state, panel);
      return;
    }

    if (action === "opacity") {
      const next = panel.opacity > 0.86 ? 0.76 : panel.opacity > 0.66 ? 0.56 : 1;
      panel.opacity = next;
      applyPanelGeometry(state, panel);
      schedulePersist(state, panel.contentId);
      return;
    }

    if (action === "app") {
      openAppContent(state.config.appBaseUrl, panel.contentId);
      return;
    }

    if (action === "collapse") {
      closePanel(state, panel.contentId, "collapsed");
      return;
    }

    if (action === "close") {
      closePanel(state, panel.contentId, "closed");
    }
  });

  collapsedChip.addEventListener("click", () => {
    if (Date.now() < panel.suppressChipClickUntil) return;
    reopenPanel(state, panel.contentId);
  });

  let tileDrag = null;
  collapsedChip.addEventListener("pointerdown", (event) => {
    tileDrag = {
      startX: panel.tileX ?? 0,
      startY: panel.tileY ?? 0,
      pointerX: event.clientX,
      pointerY: event.clientY,
    };
    collapsedChip.style.cursor = "grabbing";
    const onMove = (moveEvent) => {
      if (!tileDrag) return;
      panel.tileX = tileDrag.startX + (moveEvent.clientX - tileDrag.pointerX);
      panel.tileY = tileDrag.startY + (moveEvent.clientY - tileDrag.pointerY);
      if (
        Math.abs(moveEvent.clientX - tileDrag.pointerX) > 4 ||
        Math.abs(moveEvent.clientY - tileDrag.pointerY) > 4
      ) {
        panel.suppressChipClickUntil = Date.now() + 220;
      }
      applyTilePosition(state, panel);
    };
    const onUp = () => {
      collapsedChip.style.cursor = "grab";
      tileDrag = null;
      schedulePersist(state, panel.contentId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });

  panel.container.querySelectorAll("[data-panel-mode]").forEach((candidate) => {
    candidate.setAttribute(
      "data-active",
      candidate.getAttribute("data-panel-mode") === panel.layoutMode ? "true" : "false"
    );
  });

  if (panel.state === "collapsed") {
    panel.container.style.display = "none";
    if (!state.tileOrder.includes(panel.contentId)) {
      state.tileOrder.push(panel.contentId);
    }
    applyTilePosition(state, panel);
    showCollapsedChip(panel);
  } else {
    showCollapsedChip(panel);
  }

  schedulePersist(state, panel.contentId);
  return panel;
}

function clearTargetPreview(state) {
  if (state.targetPreviewNode) {
    state.targetPreviewNode.remove();
    state.targetPreviewNode = null;
  }
  if (state.targetHighlight) {
    state.targetHighlight.setAttribute("data-open", "false");
  }
}

function updateTargetPreview(state, element) {
  if (!(element instanceof Element) || element === state.host || state.host.contains(element)) {
    return;
  }
  state.targetElement = element;
  state.targetSelector = selectorForElement(element);
  const rect = element.getBoundingClientRect();
  state.targetHighlight.style.left = `${rect.left}px`;
  state.targetHighlight.style.top = `${rect.top}px`;
  state.targetHighlight.style.width = `${rect.width}px`;
  state.targetHighlight.style.height = `${rect.height}px`;
  state.targetHighlight.setAttribute("data-open", "true");
  state.targetCopy.textContent = `Target ${state.targetSelector}. Click to place the embedded content here.`;

  if (!state.targetPreviewNode) {
    const previewNode = document.createElement("div");
    previewNode.setAttribute("data-dg-target-preview", "true");
    previewNode.style.margin = "12px 0";
    previewNode.style.minHeight = "220px";
    previewNode.style.borderRadius = "18px";
    previewNode.style.border = "2px dashed rgba(91, 175, 255, 0.42)";
    previewNode.style.background =
      "linear-gradient(180deg, rgba(91, 175, 255, 0.10), rgba(91, 175, 255, 0.03))";
    previewNode.style.boxShadow = "inset 0 0 0 1px rgba(255,255,255,0.06)";
    previewNode.style.display = "flex";
    previewNode.style.alignItems = "center";
    previewNode.style.justifyContent = "center";
    previewNode.style.color = "rgba(91, 175, 255, 0.82)";
    previewNode.style.font = "600 12px/1.4 system-ui, sans-serif";
    previewNode.textContent = "Preview embedded Digital Garden note";
    state.targetPreviewNode = previewNode;
  }
  if (state.targetPreviewNode.parentElement !== element.parentElement || element.nextElementSibling !== state.targetPreviewNode) {
    element.insertAdjacentElement("afterend", state.targetPreviewNode);
  }
}

function stopEmbedTargeting(state, keepPanelHidden = false) {
  document.body.style.cursor = "";
  state.targetBanner.setAttribute("data-open", "false");
  clearTargetPreview(state);
  if (state.targetingPanelId && !keepPanelHidden) {
    const panel = state.openPanels.get(state.targetingPanelId);
    if (panel && panel.state !== "closed") {
      reopenPanel(state, panel.contentId);
    }
  }
  state.targetingPanelId = null;
  state.targetElement = null;
  state.targetSelector = null;
}

function confirmEmbedTarget(state) {
  if (!state.targetingPanelId || !state.targetSelector) return;
  const panel = state.openPanels.get(state.targetingPanelId);
  if (!panel) {
    stopEmbedTargeting(state, true);
    return;
  }
  panel.layoutMode = "embedded";
  panel.embeddedSelector = state.targetSelector;
  panel.container.querySelectorAll("[data-panel-mode]").forEach((candidate) => {
    candidate.setAttribute(
      "data-active",
      candidate.getAttribute("data-panel-mode") === "embedded" ? "true" : "false"
    );
  });
  stopEmbedTargeting(state, true);
  panel.state = "open";
  panel.container.style.display = "block";
  applyPanelGeometry(state, panel);
  schedulePersist(state, panel.contentId);
}

function beginEmbedTargeting(state, panel) {
  panel.state = "collapsed";
  panel.container.style.display = "none";
  showCollapsedChip(panel);
  if (panel.embeddedPreviewNode) {
    panel.embeddedPreviewNode.remove();
    panel.embeddedPreviewNode = null;
  }
  state.targetingPanelId = panel.contentId;
  state.targetBanner.setAttribute("data-open", "true");
  state.targetCopy.textContent =
    "Hover the page to preview an embed container, then click the element you want to anchor the note beside.";
  document.body.style.cursor = "crosshair";
}

async function openAssociatedContent(state, contentId, contentKind) {
  const kind = contentKind === "external" ? "external" : contentKind === "note" ? "note" : null;
  if (!kind) {
    setMenuOpen(state, false);
    openAppContent(state.config.appBaseUrl, contentId);
    return;
  }
  const context = state.resourceContext;
  const persisted =
    context?.viewStates?.find((entry) => entry.contentId === contentId) || null;
  const source =
    (context?.associations || []).find((entry) => entry.content.id === contentId)?.content ||
    (context?.externalContents || []).find((entry) => entry.id === contentId) ||
    { id: contentId, title: contentId };
  createContentPanel(state, source, kind, persisted);
  setMenuOpen(state, false);
}

async function associateAndOpen(state, contentId, contentKind) {
  if (!state.resourceContext?.resource?.id) {
    await loadResourceContext(state);
  }
  const webResourceId = state.resourceContext?.resource?.id;
  if (!webResourceId) {
    throw new Error("Web resource context is unavailable");
  }

  const isRenderable = contentKind === "note" || contentKind === "external";
  await runtimeMessage({
    type: "create-resource-association",
    payload: {
      webResourceId,
      contentId,
    },
  });

  state.resourceContext = await loadResourceContext(state);
  renderAssociationsPopover(state);

  if (!isRenderable) {
    setMenuOpen(state, false);
    openAppContent(state.config.appBaseUrl, contentId);
    return;
  }

  await openAssociatedContent(state, contentId, contentKind);
}

async function restorePanelsFromState(state) {
  if (!state.resourceContext?.viewStates?.length) return;
  for (const viewState of state.resourceContext.viewStates) {
    if (viewState.state === "closed") continue;
    const association =
      state.resourceContext.associations.find((entry) => entry.content.id === viewState.contentId)?.content ||
      state.resourceContext.externalContents.find((entry) => entry.id === viewState.contentId);
    if (!association) continue;
    const kind = association.contentType === "external" ? "external" : association.contentType === "note" ? "note" : null;
    if (!kind) continue;
    createContentPanel(state, association, kind, viewState);
  }
}

function wireRootEvents(state) {
  document.addEventListener("mousemove", (event) => {
    state.lastHoveredSelector = selectorForElement(event.target);
    markActivity(state);
    if (state.targetingPanelId) {
      updateTargetPreview(state, event.target);
    }
    Array.from(state.openPanels.values()).forEach((panel) => {
      if (panel.layoutMode === "embedded" && panel.state === "open") {
        applyPanelGeometry(state, panel);
      }
    });
  });
  window.addEventListener("scroll", () => {
    Array.from(state.openPanels.values()).forEach((panel) => {
      if (panel.layoutMode === "embedded" && panel.state === "open") {
        applyPanelGeometry(state, panel);
      }
    });
  });
  window.addEventListener("resize", () => {
    applyLauncherPosition(state);
    Array.from(state.openPanels.values()).forEach((panel) => {
      applyPanelGeometry(state, panel);
      if (panel.state === "collapsed") {
        applyTilePosition(state, panel);
      }
    });
  });
  document.addEventListener(
    "click",
    (event) => {
      if (!state.targetingPanelId) return;
      if (state.host.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      updateTargetPreview(state, event.target);
      confirmEmbedTarget(state);
    },
    true
  );
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.targetingPanelId) {
      stopEmbedTargeting(state);
    }
  });

  state.mainButton.addEventListener("click", async () => {
    if (Date.now() < state.suppressMainButtonClickUntil) {
      return;
    }
    setMenuOpen(state, !state.menuOpen);
    if (state.menuOpen) {
      if (!state.resourceContext) {
        try {
          await loadResourceContext(state);
          renderAssociationsPopover(state);
          await restorePanelsFromState(state);
        } catch (error) {
          renderStatus(
            state.popoverBodies.associations,
            error instanceof Error ? error.message : "Failed to load associated content",
            "error"
          );
        }
      } else {
        renderAssociationsPopover(state);
      }
    }
  });

  let launcherDrag = null;
  state.mainButton.addEventListener("pointerdown", (event) => {
    launcherDrag = {
      startX: state.launcherPosition?.x ?? 0,
      startY: state.launcherPosition?.y ?? 0,
      pointerX: event.clientX,
      pointerY: event.clientY,
      moved: false,
    };
    const onMove = (moveEvent) => {
      if (!launcherDrag) return;
      const nextX = launcherDrag.startX + (moveEvent.clientX - launcherDrag.pointerX);
      const nextY = launcherDrag.startY + (moveEvent.clientY - launcherDrag.pointerY);
      if (Math.abs(moveEvent.clientX - launcherDrag.pointerX) > 4 || Math.abs(moveEvent.clientY - launcherDrag.pointerY) > 4) {
        launcherDrag.moved = true;
      }
      state.launcherPosition = { x: nextX, y: nextY };
      applyLauncherPosition(state);
    };
    const onUp = () => {
      if (!launcherDrag) return;
      const wasMoved = launcherDrag.moved;
      launcherDrag = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (wasMoved) {
        state.suppressMainButtonClickUntil = Date.now() + 220;
        markActivity(state);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });

  state.actionRing.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.getAttribute("data-action");
    togglePopover(state, action);
    try {
      if (action === "associations") {
        if (!state.resourceContext) {
          await loadResourceContext(state);
        }
        renderAssociationsPopover(state);
      }
      if (action === "connections") {
        await loadConnections(state);
        renderConnectionsPopover(state);
      }
      if (action === "tree") {
        renderStatus(
          state.popoverBodies.tree,
          "Loading content tree…"
        );
        const tree = await loadContentTree(state);
        for (const node of tree) {
          void node;
        }
        renderTreePopover(state);
      }
    } catch (error) {
      const target = state.popoverBodies[action];
      if (target) {
        renderStatus(target, error instanceof Error ? error.message : "Request failed", "error");
      }
    }
  });

  state.shadow.addEventListener("click", async (event) => {
    const closeButton = event.target.closest("[data-close-panel]");
    if (closeButton) {
      closePopoverById(state, closeButton.getAttribute("data-close-panel"));
      return;
    }

    const targetAction = event.target.closest("[data-target-action]");
    if (targetAction) {
      const action = targetAction.getAttribute("data-target-action");
      if (action === "cancel") {
        stopEmbedTargeting(state);
      }
      if (action === "confirm") {
        confirmEmbedTarget(state);
      }
      return;
    }

    const openButton = event.target.closest("[data-open-content]");
    if (openButton) {
      await openAssociatedContent(
        state,
        openButton.getAttribute("data-open-content"),
        openButton.getAttribute("data-content-kind")
      );
      return;
    }

    const quickButton = event.target.closest("[data-quick-add]");
    if (quickButton) {
      const connectionId = quickButton.getAttribute("data-quick-add");
      const status = state.popoverBodies.connections.querySelector("#dg-connection-status");
      if (status) {
        status.textContent = "Saving current page…";
      }
      try {
        const result = await runtimeMessage({
          type: "quick-save",
          payload: {
            connectionId,
            bypassRules: false,
            title: document.title || window.location.href,
          },
        });
        state.resourceContext = await loadResourceContext(state);
        renderAssociationsPopover(state);
        if (status) {
          status.textContent =
            result.duplicateCount > 0
              ? "This bookmark was applied to more than one Digital Garden folder."
              : `Saved to ${result.title || "Digital Garden"}.`;
        }
        if (result.contentId) {
          await openAssociatedContent(state, result.contentId, "external");
        }
        setMenuOpen(state, false);
      } catch (error) {
        if (status) {
          status.textContent = error instanceof Error ? error.message : "Save failed";
        }
      }
      return;
    }

    const toggleButton = event.target.closest("[data-toggle-tree]");
    if (toggleButton) {
      const id = toggleButton.getAttribute("data-toggle-tree");
      if (state.expandedTreeIds.has(id)) {
        state.expandedTreeIds.delete(id);
      } else {
        state.expandedTreeIds.add(id);
      }
      renderTreePopover(state);
      return;
    }

    const associateButton = event.target.closest("[data-associate-content]");
    if (associateButton) {
      try {
        await associateAndOpen(
          state,
          associateButton.getAttribute("data-associate-content"),
          associateButton.getAttribute("data-content-kind")
        );
      } catch (error) {
        renderStatus(
          state.popoverBodies.tree,
          error instanceof Error ? error.message : "Association failed",
          "error"
        );
      }
      return;
    }

    const createButton = event.target.closest("[data-create-tree-item]");
    if (createButton) {
      const type = createButton.getAttribute("data-create-tree-item");
      const parentId = createButton.getAttribute("data-parent-content");
      let title = "";
      let url = null;

      if (type === "folder") {
        title = window.prompt("Folder name", "New Folder") || "";
      } else if (type === "note") {
        title = window.prompt("Note title", document.title || "New Note") || "";
      } else if (type === "external") {
        title = window.prompt("External link title", document.title || "Saved Link") || "";
        url = window.prompt("External link URL", window.location.href) || "";
      }

      if (!title.trim()) {
        return;
      }

      renderStatus(state.popoverBodies.tree, `Creating ${type}…`);

      try {
        const created = await createTreeContentItem(state, {
          type,
          parentId: parentId || null,
          title,
          url,
        });
        state.contentTree = null;
        const tree = await loadContentTree(state);
        if (parentId) {
          state.expandedTreeIds.add(parentId);
        }
        if (created.contentType === "folder") {
          state.expandedTreeIds.add(created.id);
        }
        renderTreePopover(state);
        if (created.contentType === "note" || created.contentType === "external") {
          if (created.contentType === "note" && state.resourceContext?.resource?.id) {
            await createResourceAssociation({
              webResourceId: state.resourceContext.resource.id,
              contentId: created.id,
            });
            state.resourceContext = await loadResourceContext(state);
            renderAssociationsPopover(state);
          } else if (created.contentType === "external") {
            state.resourceContext = await loadResourceContext(state);
            renderAssociationsPopover(state);
          }
          await openAssociatedContent(state, created.id, created.contentType);
        }
      } catch (error) {
        renderStatus(
          state.popoverBodies.tree,
          error instanceof Error ? error.message : `Failed to create ${type}`,
          "error"
        );
      }
    }
  });
}

async function initOverlay() {
  if (window.top !== window.self) return;
  if (document.getElementById(DG_OVERLAY_ROOT_ID)) return;

  const [config, extensionContext] = await Promise.all([
    runtimeMessage({ type: "get-config" }),
    runtimeMessage({ type: "get-extension-context" }),
  ]);

  if (!config?.appBaseUrl || !config?.token || !extensionContext?.trustedInstallId) {
    return;
  }

  const appOrigin = new URL(config.appBaseUrl).origin;
  if (window.location.origin === appOrigin) {
    return;
  }

  const state = {
    config,
    extensionContext,
    host: null,
    shadow: null,
    root: null,
    mainButton: null,
    actionRing: null,
    popovers: {},
    popoverBodies: {},
    panelsMount: null,
    menuOpen: false,
    isIdle: false,
    idleTimer: null,
    resourceContext: null,
    contentTree: null,
    connections: null,
    expandedTreeIds: new Set(),
    tileOrder: [],
    openPanels: new Map(),
    persistTimers: new Map(),
    lastHoveredSelector: "body",
    launcher: null,
    launcherPosition: null,
    targetBanner: null,
    targetCopy: null,
    targetHighlight: null,
    targetingPanelId: null,
    targetElement: null,
    targetSelector: null,
    targetPreviewNode: null,
    suppressMainButtonClickUntil: 0,
  };

  createOverlayApp(state);
  applyLauncherPosition(state);
  wireRootEvents(state);
  markActivity(state);

  try {
    await loadResourceContext(state);
    renderAssociationsPopover(state);
    await restorePanelsFromState(state);
  } catch (error) {
    console.warn("[DG Overlay] Initial resource context load failed", error);
  }
}

initOverlay().catch((error) => {
  console.warn("[DG Overlay] Failed to initialize overlay", error);
});
