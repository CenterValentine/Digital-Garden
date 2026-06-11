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

function treeIconMarkup(node, isOpen) {
  const color = "rgba(255,255,255,0.72)";

  if (node.customIcon?.startsWith("emoji:")) {
    return `<span class="dg-tree-emoji">${escapeHtml(
      node.customIcon.replace("emoji:", "")
    )}</span>`;
  }

  const svg = (paths, viewBox = "0 0 24 24") =>
    `<svg viewBox="${viewBox}" aria-hidden="true" class="dg-tree-svg" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

  if (node.contentType === "folder") {
    const viewMode = node.folder?.viewMode || "list";
    if (viewMode === "gallery") {
      return svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>');
    }
    if (viewMode === "kanban") {
      return svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 7v7"/><path d="M12 7v4"/><path d="M16 7v9"/>');
    }
    if (viewMode === "dashboard") {
      return svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>');
    }
    if (viewMode === "canvas") {
      return svg('<circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M8 6h8"/><path d="M7.7 7.7 10.6 15"/><path d="M16.3 7.7 13.4 15"/>');
    }
    return isOpen
      ? svg('<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z"/><path d="M2 10h20"/>')
      : svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>');
  }

  if (node.contentType === "note") {
    return svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>');
  }

  if (node.contentType === "external") {
    return svg('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>');
  }

  if (node.contentType === "code") {
    return svg('<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>');
  }

  if (node.contentType === "html" || node.html?.isTemplate) {
    return svg('<path d="M4 4h16v16H4z"/><path d="m8 9-3 3 3 3"/><path d="m16 9 3 3-3 3"/>');
  }

  if (node.contentType === "chat") {
    return svg('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>');
  }

  if (node.contentType === "visualization") {
    if (node.visualization?.engine === "diagrams-net") {
      return svg('<circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M8 6h8"/><path d="M7.7 7.7 10.6 15"/><path d="M16.3 7.7 13.4 15"/>');
    }
    if (node.visualization?.engine === "excalidraw") {
      return svg('<path d="M12 19l7-7 3 3-7 7-5 1z"/><path d="m18 13-3-3"/>');
    }
    if (node.visualization?.engine === "mermaid") {
      return svg('<path d="M6 6h15"/><path d="M6 12h9"/><path d="M6 18h12"/><path d="m18 4 3 2-3 2"/><path d="m12 10 3 2-3 2"/><path d="m15 16 3 2-3 2"/>');
    }
    return svg('<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>');
  }

  return svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>');
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

// ── Domain memory ─────────────────────────────────────────────────────────────

const KNOWN_2PART_TLDS = new Set([
  "co.uk","com.au","co.jp","com.br","co.in","co.nz","co.za","com.cn","org.uk","net.au",
  "gov.uk","ac.uk","me.uk","org.au","net.nz","org.nz","gov.au","edu.au",
]);

function getEtld1(hostname) {
  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;
  const last2 = parts.slice(-2).join(".");
  if (KNOWN_2PART_TLDS.has(last2)) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}

async function loadDomainMemory(hostname) {
  try {
    const etld1 = getEtld1(hostname);
    const keys = [`dgHostname:${hostname}`, `dgEtld1:${etld1}`, "dgSnapDefault"];
    const result = await chrome.storage.local.get(keys);
    if (result[`dgHostname:${hostname}`]) return result[`dgHostname:${hostname}`];
    if (result[`dgEtld1:${etld1}`]) return result[`dgEtld1:${etld1}`];
    return result["dgSnapDefault"] || { snap: "right" };
  } catch {
    return { snap: "right" };
  }
}

async function saveDomainMemory(hostname, data, scope) {
  try {
    const etld1 = getEtld1(hostname);
    // Accept both old string form (snap) and new object form { snap, edgeTabOffset }
    const value = typeof data === "string" ? { snap: data } : data;
    if (scope === "hostname") {
      await chrome.storage.local.set({ [`dgHostname:${hostname}`]: value });
    } else if (scope === "etld1") {
      await chrome.storage.local.set({ [`dgEtld1:${etld1}`]: value });
    } else {
      await chrome.storage.local.set({ dgSnapDefault: value });
    }
  } catch { /* best-effort */ }
}

// ── Snap panel ────────────────────────────────────────────────────────────────

function applyEdgeTabPosition(state) {
  const tab = state.edgeTab;
  if (!tab || !state.snap || state.snap === "floating") return;
  const offset = state.edgeTabOffset ?? 0.5;
  // Clear any previous inline overrides
  tab.style.top = "";
  tab.style.left = "";
  tab.style.transform = "none"; // suppress CSS translate centering
  if (state.snap === "right" || state.snap === "left") {
    const tabH = 48;
    tab.style.top = `${Math.round(offset * (window.innerHeight - tabH))}px`;
  } else {
    const tabW = 48;
    tab.style.left = `${Math.round(offset * (window.innerWidth - tabW))}px`;
  }
}

function setSnap(state, mode) {
  state.snap = mode;
  state.root.setAttribute("data-snap", mode);
  state.shadow.querySelectorAll("[data-snap-to]").forEach((btn) => {
    btn.setAttribute("data-active", btn.getAttribute("data-snap-to") === mode ? "true" : "false");
  });
  if (mode === "floating") {
    // Clear JS-applied edge positioning before switching to floating
    if (state.edgeTab) {
      state.edgeTab.style.top = "";
      state.edgeTab.style.left = "";
      state.edgeTab.style.transform = "";
    }
    applyLauncherPosition(state);
    applyFloatingPanelPosition(state);
  } else {
    applyEdgeTabPosition(state);
  }
}

function applyFloatingPanelPosition(state) {
  if (!state.snapPanel || state.snap !== "floating") return;
  const x = state.launcherPosition?.x ?? window.innerWidth - DG_LAUNCHER_SIZE - 22;
  const y = state.launcherPosition?.y ?? window.innerHeight - DG_LAUNCHER_SIZE - 22;
  const panelW = 320;
  const panelH = Math.min(560, window.innerHeight - 32);
  // Decide side: if launcher is on right half, panel goes left; else right
  const goLeft = x > window.innerWidth / 2;
  const left = goLeft ? Math.max(8, x - panelW - 12) : Math.min(x + DG_LAUNCHER_SIZE + 12, window.innerWidth - panelW - 8);
  // Decide vertical: try to keep panel within viewport
  let top = y - 48;
  if (top + panelH > window.innerHeight - 8) top = window.innerHeight - panelH - 8;
  if (top < 8) top = 8;
  state.snapPanel.style.left = `${left}px`;
  state.snapPanel.style.top = `${top}px`;
  state.snapPanel.style.width = `${panelW}px`;
  state.snapPanel.style.height = `${panelH}px`;
}

async function openSnapPanel(state) {
  state.panelOpen = true;
  state.root.setAttribute("data-panel-open", "true");
  if (state.snap === "floating") applyFloatingPanelPosition(state);
  markActivity(state);
  const renderAssoc = async () => {
    if (!state.resourceContext) {
      renderStatus(state.popoverBodies.associations, "Loading page context…");
      try {
        await loadResourceContext(state);
        renderAssociationsPopover(state);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load";
        const isAuth = /token|trusted|unauthorized|auth/i.test(msg);
        renderStatus(state.popoverBodies.associations, isAuth ? "Re-trust required — open Digital Garden settings to reconnect." : msg, "error");
      }
    } else {
      renderAssociationsPopover(state);
    }
  };
  const renderTree = async () => {
    const workspaceId = state.selectedWorkspaceId || null;
    if (!state.contentTree || state.loadedForWorkspaceId !== workspaceId) {
      renderStatus(state.popoverBodies.tree, "Loading content tree…");
      try {
        await loadContentTree(state, { workspaceId });
        renderTreePopover(state);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load tree";
        const isAuth = /token|trusted|unauthorized|auth/i.test(msg);
        renderStatus(state.popoverBodies.tree, isAuth ? "Re-trust required — open Digital Garden settings to reconnect." : msg, "error");
      }
    } else {
      renderTreePopover(state);
    }
  };
  await Promise.all([renderAssoc(), renderTree()]);
}

function closeSnapPanel(state) {
  state.panelOpen = false;
  state.root.setAttribute("data-panel-open", "false");
  markActivity(state);
}

// ── Embed iframe management ───────────────────────────────────────────────────

function openEmbedForPanel(state, panel) {
  const iframe = state.embedIframe;
  if (!iframe || !state.config?.appBaseUrl) return;

  const targetUrl = `${state.config.appBaseUrl.replace(/\/$/, "")}/embed/content/${panel.contentId}`;

  // If another panel owns the iframe, detach it cleanly first
  if (state.iframePanel && state.iframePanel !== panel) {
    closeEmbedForPanel(state, state.iframePanel, { keepIframe: true });
  }

  setPanelEditorStatus(panel, "Loading editor…");

  // Move iframe into this panel's body
  panel.body.appendChild(iframe);
  state.iframePanel = panel;

  if (state.iframeContentId === panel.contentId && iframe.getAttribute("src")) {
    // Already loaded — send a navigate message instead of reloading
    iframe.contentWindow?.postMessage({ type: "open", contentId: panel.contentId }, "*");
    iframe.setAttribute("data-active", "true");
    setPanelEditorStatus(panel, "");
  } else {
    // First load — request a fresh embed session from the background BEFORE setting
    // src so the session_token is available when the iframe loads.
    iframe.setAttribute("data-active", "false");
    state.iframeContentId = panel.contentId;

    chrome.runtime.sendMessage({ type: "refresh-embed-session" }, (response) => {
      // Panel may have been closed while waiting — bail out if so
      if (state.iframePanel !== panel) return;

      const sessionOk = response?.ok && response?.data != null;
      if (!sessionOk) {
        setPanelEditorStatus(
          panel,
          "Auth failed — click Refresh Token in Settings then try again",
          "error"
        );
        closeEmbedForPanel(state, panel);
        return;
      }

      // Load the embed page directly with the session token in the URL (?_t=).
      // The server validates the token without needing a cookie — this bypasses
      // Vivaldi's (and other browsers') third-party cookie blocking in iframes.
      const baseUrl = state.config.appBaseUrl.replace(/\/$/, "");
      const targetPath = `/embed/content/${panel.contentId}`;
      const sessionToken = response.data?.token;
      const iframeSrc = sessionToken
        ? `${baseUrl}${targetPath}?_t=${encodeURIComponent(sessionToken)}`
        : targetUrl;

      iframe.setAttribute("src", iframeSrc);
    });

    // Belt-and-suspenders: if ready never arrives within 12s show actionable error
    const authCheckTimer = window.setTimeout(() => {
      if (state.iframePanel === panel &&
          iframe.getAttribute("data-active") !== "true") {
        setPanelEditorStatus(
          panel,
          "Could not load editor — if your browser blocks cross-site iframes (e.g. Vivaldi strict tracking protection), whitelist your Digital Garden URL. Otherwise click Refresh Token in Settings.",
          "error"
        );
      }
    }, 12000);
    if (panel.authCheckTimer) window.clearTimeout(panel.authCheckTimer);
    panel.authCheckTimer = authCheckTimer;
  }
}

function closeEmbedForPanel(state, panel, { keepIframe = false } = {}) {
  const iframe = state.embedIframe;

  if (!keepIframe && iframe && iframe.parentElement === panel.body) {
    panel.body.removeChild(iframe);
    state.iframePanel = null;
  }

  if (panel.authCheckTimer) {
    window.clearTimeout(panel.authCheckTimer);
    panel.authCheckTimer = null;
  }
  setPanelEditorStatus(panel, "");

  if (toggleBtn) {
    toggleBtn.setAttribute("data-mode", "read");
    toggleBtn.textContent = "✎ Edit";
  }
}

// ── Workspaces ────────────────────────────────────────────────────────────────

async function loadWorkspaces(state) {
  try {
    state.workspaces = await runtimeMessage({ type: "fetch-workspaces" });
  } catch {
    state.workspaces = [];
  }
}

function renderWorkspaceSelector(state) {
  const select = state.workspaceSelect;
  if (!select) return;
  const workspaces = state.workspaces || [];
  select.innerHTML = `
    <option value="">All content</option>
    ${workspaces.map((w) => `<option value="${escapeHtml(w.id)}">${escapeHtml(w.name)}${w.viewRootContentId ? " ⊂" : ""}</option>`).join("")}
  `;
  if (state.selectedWorkspaceId) {
    select.value = state.selectedWorkspaceId;
  }
}

function overlayStyles() {
  return `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    [hidden] { display: none !important; }

    /* ── Overlay root ── */
    .dg-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483644;
      pointer-events: none;
    }

    /* ── Launcher button (floating mode) ── */
    .dg-launcher-btn {
      display: none;
      position: fixed;
      width: 54px; height: 54px;
      border-radius: 999px;
      border: 1px solid rgba(216, 176, 92, 0.32);
      background: radial-gradient(circle at 30% 30%, rgba(224,188,112,0.22), transparent 56%), rgba(13,16,20,0.9);
      box-shadow: 0 14px 44px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.08);
      color: #f2e2b6;
      font-size: 22px;
      cursor: pointer;
      pointer-events: auto;
      touch-action: none;
      transition: opacity 200ms ease, transform 200ms ease;
      align-items: center; justify-content: center;
      backdrop-filter: blur(16px);
    }
    .dg-overlay[data-snap="floating"] .dg-launcher-btn { display: flex; }
    .dg-overlay[data-snap="floating"][data-idle="true"] .dg-launcher-btn:not([data-open="true"]) {
      opacity: 0.2; transform: translateY(6px);
    }

    /* Edge tab — shown when panel is closed in docked modes */
    .dg-edge-tab {
      display: none;
      position: fixed;
      width: 16px; height: 48px;
      background: rgba(201,168,108,0.18);
      border: 1px solid rgba(201,168,108,0.28);
      cursor: pointer;
      pointer-events: auto;
      transition: background 0.15s;
      align-items: center; justify-content: center;
      color: rgba(201,168,108,0.7);
      font-size: 10px;
    }
    .dg-edge-tab:hover { background: rgba(201,168,108,0.3); }
    .dg-overlay[data-snap="right"][data-panel-open="false"] .dg-edge-tab {
      display: flex; right: 0; top: 50%; transform: translateY(-50%);
      border-right: 0; border-radius: 8px 0 0 8px; cursor: ns-resize;
    }
    .dg-overlay[data-snap="left"][data-panel-open="false"] .dg-edge-tab {
      display: flex; left: 0; top: 50%; transform: translateY(-50%);
      border-left: 0; border-radius: 0 8px 8px 0; cursor: ns-resize;
    }
    .dg-overlay[data-snap="top"][data-panel-open="false"] .dg-edge-tab {
      display: flex; top: 0; left: 50%; transform: translateX(-50%);
      width: 48px; height: 14px; border-top: 0; border-radius: 0 0 8px 8px; cursor: ew-resize;
    }
    .dg-overlay[data-snap="bottom"][data-panel-open="false"] .dg-edge-tab {
      display: flex; bottom: 0; left: 50%; transform: translateX(-50%);
      width: 48px; height: 14px; border-bottom: 0; border-radius: 8px 8px 0 0; cursor: ew-resize;
    }

    /* ── Snap panel ── */
    .dg-snap-panel {
      display: none;
      flex-direction: column;
      position: fixed;
      background: rgba(11,14,18,0.96);
      border: 1px solid rgba(255,255,255,0.09);
      box-shadow: 0 0 0 0 transparent;
      backdrop-filter: blur(22px);
      pointer-events: auto;
      overflow: hidden;
    }
    .dg-overlay[data-panel-open="true"] .dg-snap-panel { display: flex; }
    /* Right */
    .dg-overlay[data-snap="right"] .dg-snap-panel {
      top: 0; right: 0; height: 100vh; width: 320px;
      border-top: 0; border-right: 0; border-bottom: 0;
      border-left: 1px solid rgba(255,255,255,0.1);
    }
    /* Left */
    .dg-overlay[data-snap="left"] .dg-snap-panel {
      top: 0; left: 0; height: 100vh; width: 320px;
      border-top: 0; border-left: 0; border-bottom: 0;
      border-right: 1px solid rgba(255,255,255,0.1);
    }
    /* Top */
    .dg-overlay[data-snap="top"] .dg-snap-panel {
      top: 0; left: 0; right: 0; width: 100%; height: 260px;
      border-top: 0; border-left: 0; border-right: 0;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    /* Bottom */
    .dg-overlay[data-snap="bottom"] .dg-snap-panel {
      bottom: 0; left: 0; right: 0; width: 100%; height: 260px;
      border-bottom: 0; border-left: 0; border-right: 0;
      border-top: 1px solid rgba(255,255,255,0.1);
    }
    /* Floating — positioned by JS */
    .dg-overlay[data-snap="floating"] .dg-snap-panel {
      border-radius: 18px;
      box-shadow: 0 24px 64px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.07);
    }

    /* ── Panel header ── */
    .dg-panel-header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 8px 0 10px;
      height: 44px;
      min-height: 44px;
      border-bottom: 1px solid rgba(255,255,255,0.07);
      background: rgba(255,255,255,0.02);
      flex-shrink: 0;
    }
    .dg-workspace-select {
      flex: 1;
      min-width: 0;
      font: inherit;
      font-size: 12px;
      font-weight: 500;
      color: rgba(255,255,255,0.82);
      background: transparent;
      border: 0;
      outline: none;
      cursor: pointer;
      padding: 0 2px;
      appearance: auto;
    }
    .dg-workspace-select option { background: #141820; }
    .dg-snap-controls {
      display: flex;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
    }
    .dg-snap-btn {
      width: 24px; height: 24px;
      display: flex; align-items: center; justify-content: center;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: rgba(255,255,255,0.36);
      font-size: 12px;
      cursor: pointer;
      transition: color 0.12s, background 0.12s;
      padding: 0;
    }
    .dg-snap-btn:hover { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.72); }
    .dg-snap-btn[data-active="true"] { color: #c9a86c; background: rgba(201,168,108,0.12); }
    .dg-panel-close-btn {
      width: 26px; height: 26px;
      display: flex; align-items: center; justify-content: center;
      border: 0; border-radius: 6px;
      background: transparent;
      color: rgba(255,255,255,0.4);
      font-size: 16px; line-height: 1;
      cursor: pointer;
      flex-shrink: 0;
      transition: color 0.12s, background 0.12s;
    }
    .dg-panel-close-btn:hover { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.8); }

    /* ── Panel scroll body ── */
    .dg-panel-scroll {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
    }
    .dg-panel-scroll::-webkit-scrollbar { width: 4px; }
    .dg-panel-scroll::-webkit-scrollbar-track { background: transparent; }
    .dg-panel-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 4px; }

    /* ── Sections ── */
    .dg-panel-section { display: flex; flex-direction: column; }
    .dg-section-label {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 12px 4px;
      font-size: 10px; font-weight: 700;
      letter-spacing: 0.09em; text-transform: uppercase;
      color: rgba(255,255,255,0.36);
    }
    .dg-section-actions { display: flex; gap: 4px; }
    .dg-panel-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 4px 0; flex-shrink: 0; }

    /* ── Status ── */
    .dg-status {
      padding: 10px 13px;
      color: rgba(255,255,255,0.62);
      font-size: 12px;
      line-height: 1.45;
    }
    .dg-status[data-tone="error"] { color: #ffd6d6; }

    /* ── Association list ── */
    .dg-list-item {
      width: 100%; display: flex;
      align-items: center; justify-content: space-between;
      gap: 10px; padding: 8px 12px;
      border: 0; border-bottom: 1px solid rgba(255,255,255,0.05);
      background: transparent; color: white; text-align: left; cursor: pointer;
    }
    .dg-list-item:last-child { border-bottom: 0; }
    .dg-list-item:hover { background: rgba(255,255,255,0.04); }
    .dg-list-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
    .dg-list-title { color: rgba(255,255,255,0.9); font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dg-list-subtitle { color: rgba(255,255,255,0.46); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dg-list-chip {
      flex-shrink: 0; border-radius: 999px; padding: 3px 8px;
      background: rgba(216,176,92,0.14); color: #f2e2b6;
      font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
    }

    /* ── Mini action buttons ── */
    .dg-mini-action {
      min-width: 22px; height: 20px; padding: 0 5px;
      border-radius: 5px; border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.72);
      font-size: 10px; cursor: pointer; font: inherit; font-size: 10px;
    }
    .dg-mini-action:hover { background: rgba(255,255,255,0.07); }

    /* ── Tree rows ── */
    .dg-tree-group { display: flex; flex-direction: column; }
    .dg-tree-row {
      width: 100%; display: flex; align-items: center; gap: 6px;
      min-height: 30px; padding: 3px 8px 3px calc(8px + (var(--depth, 0) * 14px));
      border: 0; border-bottom: 1px solid rgba(255,255,255,0.04);
      background: transparent; color: white; text-align: left; cursor: default;
    }
    .dg-tree-group:last-child > .dg-tree-row { border-bottom: 0; }
    .dg-tree-row:hover { background: rgba(255,255,255,0.035); }
    .dg-tree-row button { border: 0; background: transparent; color: inherit; cursor: pointer; padding: 0; }
    .dg-tree-expand { width: 16px; text-align: center; flex-shrink: 0; color: rgba(255,255,255,0.5); font-size: 14px; line-height: 1; }
    .dg-tree-kind { width: 15px; height: 15px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; color: rgba(255,255,255,0.62); }
    .dg-tree-svg { width: 15px; height: 15px; display: block; }
    .dg-tree-emoji { font-size: 13px; line-height: 1; }
    .dg-tree-meta { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
    .dg-tree-title { color: rgba(255,255,255,0.88); font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dg-tree-subtitle { color: rgba(255,255,255,0.4); font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dg-tree-actions { display: flex; align-items: center; gap: 3px; flex-shrink: 0; opacity: 0; transition: opacity 0.12s; }
    .dg-tree-row:hover .dg-tree-actions { opacity: 1; }

    /* ── Floating content panels (unchanged) ── */
    .dg-floating-panel {
      position: fixed; width: 420px; height: 56vh;
      min-width: 320px; min-height: 240px;
      border-radius: 22px; overflow: hidden;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(13,16,20,0.88);
      box-shadow: 0 26px 70px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.06);
      backdrop-filter: blur(22px);
      pointer-events: auto; resize: both;
    }
    .dg-floating-panel[data-mode="docked"] {
      right: 18px !important; top: 18px !important; left: auto !important; bottom: 18px !important;
      width: min(440px, calc(100vw - 36px)); height: calc(100vh - 36px); resize: none;
    }
    .dg-floating-panel[data-mode="embedded"] { resize: none; }
    .dg-panel-toolbar {
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; padding: 10px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.02); cursor: move;
    }
    .dg-panel-toolbar[data-mode="docked"] { cursor: default; }
    .dg-panel-toolbar-title { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .dg-panel-toolbar-title strong { color: white; font-size: 13px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dg-panel-toolbar-title span { color: rgba(255,255,255,0.54); font-size: 11px; }
    .dg-toolbar-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 1; min-width: 0; overflow-x: auto; scrollbar-width: none; }
    .dg-toolbar-actions::-webkit-scrollbar { display: none; }
    .dg-toolbar-button {
      min-width: 32px; height: 32px; padding: 0 10px;
      border-radius: 999px; border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.82);
      cursor: pointer; font-size: 12px; line-height: 1;
    }
    .dg-toolbar-button[data-active="true"] { color: #f2e2b6; border-color: rgba(216,176,92,0.28); background: rgba(216,176,92,0.12); }
    .dg-panel-content {
      height: calc(100% - 53px); display: flex; flex-direction: column;
      gap: 12px; padding: 14px; overflow: auto;
    }
    .dg-panel-content[data-loading="true"] { opacity: 0.62; pointer-events: none; }
    .dg-editor-stack { display: flex; flex-direction: column; gap: 12px; min-height: 0; flex: 1; }
    .dg-editor-field { display: flex; flex-direction: column; gap: 6px; }
    .dg-editor-label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.48); font-weight: 700; }
    .dg-editor-input, .dg-editor-textarea {
      width: 100%; border: 1px solid rgba(255,255,255,0.1); border-radius: 14px;
      background: rgba(0,0,0,0.22); color: white; padding: 11px 12px; outline: none; font: inherit;
    }
    .dg-editor-input:focus, .dg-editor-textarea:focus { border-color: rgba(216,176,92,0.42); box-shadow: 0 0 0 1px rgba(216,176,92,0.18); }
    .dg-editor-textarea { min-height: 220px; resize: vertical; line-height: 1.5; }
    .dg-note-toolbar {
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
      padding: 8px; border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px; background: rgba(255,255,255,0.03);
    }
    .dg-note-toolbar .dg-toolbar-button { min-width: 34px; height: 30px; padding: 0 10px; border-radius: 10px; font-size: 11px; font-weight: 700; }
    .dg-note-toolbar-spacer { width: 1px; height: 18px; background: rgba(255,255,255,0.08); margin: 0 2px; }
    .dg-editor-rich {
      min-height: 280px; padding: 14px 15px;
      border: 1px solid rgba(255,255,255,0.1); border-radius: 14px;
      background: rgba(0,0,0,0.22); color: white; outline: none; line-height: 1.62; overflow: auto;
    }
    .dg-editor-rich:focus { border-color: rgba(216,176,92,0.42); box-shadow: 0 0 0 1px rgba(216,176,92,0.18); }
    .dg-editor-rich[data-empty="true"]::before { content: attr(data-placeholder); color: rgba(255,255,255,0.34); pointer-events: none; }
    .dg-editor-rich p, .dg-editor-rich h1, .dg-editor-rich h2, .dg-editor-rich h3,
    .dg-editor-rich blockquote, .dg-editor-rich ul, .dg-editor-rich ol { margin: 0 0 0.72em; }
    .dg-editor-rich h1 { font-size: 1.55rem; line-height: 1.18; }
    .dg-editor-rich h2 { font-size: 1.32rem; line-height: 1.22; }
    .dg-editor-rich h3 { font-size: 1.14rem; line-height: 1.26; }
    .dg-editor-rich blockquote { padding-left: 12px; border-left: 2px solid rgba(216,176,92,0.55); color: rgba(255,255,255,0.82); }
    .dg-editor-rich ul, .dg-editor-rich ol { padding-left: 1.35rem; }
    .dg-editor-rich a { color: #f2e2b6; }
    .dg-editor-meta-grid { display: grid; grid-template-columns: repeat(1, minmax(0, 1fr)); gap: 12px; }
    .dg-editor-status { min-height: 20px; font-size: 12px; color: rgba(255,255,255,0.58); }
    .dg-editor-status[data-tone="error"] { color: #ffd6d6; }
    .dg-editor-status[data-tone="success"] { color: #a8ebc2; }
    .dg-editor-divider { height: 1px; background: rgba(255,255,255,0.08); margin: 2px 0; }
    .dg-assoc-row { display: flex; align-items: center; gap: 6px; }

    /* ── Domain associations sub-section ── */
    .dg-domain-section { border-top: 1px solid rgba(255,255,255,0.05); }
    .dg-domain-toggle {
      width: 100%; display: flex; align-items: center; gap: 6px;
      padding: 7px 12px; border: 0;
      background: transparent; color: rgba(255,255,255,0.42);
      font: inherit; font-size: 11px; cursor: pointer; text-align: left;
    }
    .dg-domain-toggle:hover { background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.72); }
    .dg-domain-toggle-icon { font-size: 9px; flex-shrink: 0; }
    .dg-domain-body { border-top: 1px solid rgba(255,255,255,0.05); max-height: 320px; overflow-y: auto; }
    .dg-domain-body::-webkit-scrollbar { width: 3px; }
    .dg-domain-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
    .dg-domain-search { padding: 6px 8px 4px; }
    .dg-domain-search-input {
      width: 100%; padding: 5px 9px; border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.1);
      background: rgba(0,0,0,0.25); color: white; font: inherit; font-size: 11px;
      outline: none; box-sizing: border-box;
    }
    .dg-domain-search-input::placeholder { color: rgba(255,255,255,0.28); }
    .dg-domain-search-input:focus { border-color: rgba(255,255,255,0.2); }
    .dg-delete-assoc { flex-shrink: 0; color: rgba(255,100,100,0.72); border-color: rgba(255,100,100,0.2); }
    .dg-delete-assoc:hover { color: #ff9090; background: rgba(255,80,80,0.12); }
    .dg-panel-collapsed {
      position: fixed; left: 18px; bottom: 18px; display: none;
      align-items: center; gap: 8px; border-radius: 999px;
      background: rgba(13,16,20,0.9); border: 1px solid rgba(255,255,255,0.08);
      padding: 8px 12px; color: white; box-shadow: 0 16px 48px rgba(0,0,0,0.34);
      cursor: grab; touch-action: none;
    }
    .dg-panel-collapsed[data-open="true"] { display: inline-flex; pointer-events: auto; }
    .dg-panel-banner { padding: 10px 12px; margin: 0 14px; border-radius: 14px; background: rgba(216,176,92,0.12); color: #f2e2b6; font-size: 12px; line-height: 1.45; }

    /* ── Target / embed UI ── */
    .dg-target-banner {
      position: fixed; left: 50%; top: 16px; transform: translateX(-50%);
      width: min(560px, calc(100vw - 32px)); display: none;
      align-items: center; justify-content: space-between;
      gap: 14px; padding: 12px 14px; border-radius: 18px;
      border: 1px solid rgba(91,175,255,0.28); background: rgba(14,18,24,0.92);
      box-shadow: 0 20px 56px rgba(0,0,0,0.32); color: white; pointer-events: auto;
    }
    .dg-target-banner[data-open="true"] { display: flex; }
    .dg-target-copy { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .dg-target-copy strong { font-size: 13px; }
    .dg-target-copy span { color: rgba(255,255,255,0.62); font-size: 12px; line-height: 1.4; }
    .dg-target-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .dg-target-button { height: 32px; padding: 0 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.82); cursor: pointer; font-size: 12px; font-weight: 600; }
    .dg-target-button[data-variant="primary"] { background: rgba(91,175,255,0.18); border-color: rgba(91,175,255,0.34); color: #d9ebff; }
    .dg-target-highlight {
      position: fixed; display: none;
      border: 2px solid rgba(91,175,255,0.94); border-radius: 14px;
      background: rgba(91,175,255,0.08);
      box-shadow: 0 0 0 1px rgba(255,255,255,0.08), 0 12px 32px rgba(0,0,0,0.22);
      pointer-events: none;
    }
    .dg-target-highlight[data-open="true"] { display: block; }

    /* ── Embed iframe ── */
    .dg-embed-iframe {
      width: 100%; height: 100%; border: none;
      display: none; border-radius: 0; background: transparent;
      flex: 1; min-height: 0;
    }
    .dg-embed-iframe[data-active="true"] { display: block; }
  `;
}

function createOverlayApp(state) {
  const host = document.createElement("div");
  host.id = DG_OVERLAY_ROOT_ID;
  const shadow = host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);

  shadow.innerHTML = `
    <style>${overlayStyles()}</style>
    <div class="dg-overlay" data-snap="right" data-panel-open="false" data-idle="false">
      <button class="dg-launcher-btn" id="dg-launcher-btn" type="button" aria-label="Digital Garden">◌</button>
      <div class="dg-edge-tab" id="dg-edge-tab" role="button" tabindex="0" aria-label="Open Digital Garden panel"></div>
      <div class="dg-snap-panel" id="dg-snap-panel">
        <div class="dg-panel-header">
          <select class="dg-workspace-select" id="dg-workspace-select">
            <option value="">All content</option>
          </select>
          <div class="dg-snap-controls">
            <button class="dg-snap-btn" type="button" data-snap-to="left" title="Dock left">◧</button>
            <button class="dg-snap-btn" type="button" data-snap-to="top" title="Dock top">⬒</button>
            <button class="dg-snap-btn" type="button" data-snap-to="right" title="Dock right">◨</button>
            <button class="dg-snap-btn" type="button" data-snap-to="bottom" title="Dock bottom">⬓</button>
            <button class="dg-snap-btn" type="button" data-snap-to="floating" title="Float">⊞</button>
          </div>
          <button class="dg-panel-close-btn" id="dg-panel-close-btn" type="button" aria-label="Close panel">×</button>
        </div>
        <div class="dg-panel-scroll">
          <div class="dg-panel-section">
            <div class="dg-section-label">
              Associated content
              <div class="dg-section-actions">
                <button class="dg-mini-action" type="button" data-action="refresh-associations" title="Refresh for current URL">↻</button>
              </div>
            </div>
            <div class="dg-section-body" id="dg-associations-body"></div>
          </div>
          <div class="dg-panel-divider"></div>
          <div class="dg-panel-section">
            <div class="dg-section-label">Content tree</div>
            <div class="dg-section-body" id="dg-tree-body"></div>
          </div>
        </div>
      </div>
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
  state.launcherBtn = shadow.getElementById("dg-launcher-btn");
  state.edgeTab = shadow.getElementById("dg-edge-tab");
  state.snapPanel = shadow.getElementById("dg-snap-panel");
  state.workspaceSelect = shadow.getElementById("dg-workspace-select");
  state.panelCloseBtn = shadow.getElementById("dg-panel-close-btn");
  state.popoverBodies = {
    associations: shadow.getElementById("dg-associations-body"),
    tree: shadow.getElementById("dg-tree-body"),
  };
  state.panelsMount = shadow.getElementById("dg-open-panels");
  state.targetBanner = shadow.getElementById("dg-target-banner");
  state.targetCopy = shadow.getElementById("dg-target-copy");
  state.targetHighlight = shadow.getElementById("dg-target-highlight");

  // Single shared iframe — repositioned between panels instead of recreated.
  // Moving an iframe in the DOM preserves its browsing context (session stays alive).
  const embedIframe = document.createElement("iframe");
  embedIframe.className = "dg-embed-iframe";
  // No sandbox — we load our own trusted app and need full capabilities
  // (cookies for auth, web workers for Y.js/collaboration, localStorage for state).
  embedIframe.setAttribute("allow", "clipboard-read; clipboard-write");
  embedIframe.setAttribute("data-active", "false");
  state.embedIframe = embedIframe;
  state.iframeContentId = null;
  state.iframePanel = null;
  state.iframePrewarmed = false;

  // Hidden 1×1 container — the iframe lives here during prewarm so the browser
  // actually loads the src (detached elements don't trigger network requests).
  const prewarmContainer = document.createElement("div");
  prewarmContainer.style.cssText =
    "position:absolute;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;";
  shadow.appendChild(prewarmContainer);
  state.prewarmContainer = prewarmContainer;
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
    if (!state.panelOpen && state.openPanels.size === 0) {
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
  if (!state.launcherBtn) return;
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
  state.launcherBtn.style.left = `${x}px`;
  state.launcherBtn.style.top = `${y}px`;
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
  const prevId = state.resourceContext?.resource?.id;
  state.resourceContext = await runtimeMessage({
    type: "fetch-resource-context",
    payload: resourcePayload(),
  });
  if (prevId !== state.resourceContext?.resource?.id) {
    state.domainAssociations = null;
    state.domainAssociationsExpanded = false;
    state.domainAssociationsSearch = "";
  }
  return state.resourceContext;
}

async function loadContentTree(state, { workspaceId = null, force = false } = {}) {
  if (!force && state.contentTree && state.loadedForWorkspaceId === (workspaceId || null)) {
    return state.contentTree;
  }
  state.contentTree = await runtimeMessage({
    type: "fetch-content-picker-tree",
    payload: { workspaceId: workspaceId || null },
  });
  state.loadedForWorkspaceId = workspaceId || null;
  return state.contentTree;
}

async function loadConnections(state) {
  if (state.connections) return state.connections;
  state.connections = await runtimeMessage({ type: "fetch-connections" });
  return state.connections;
}

async function fetchPanelContent(kind, contentId) {
  if (kind === "note") {
    return runtimeMessage({ type: "fetch-extension-note-content", contentId });
  }
  if (kind === "external") {
    return runtimeMessage({ type: "fetch-extension-external-content", contentId });
  }
  throw new Error("Unsupported content type");
}

async function savePanelContent(kind, contentId, payload) {
  if (kind === "note") {
    return runtimeMessage({
      type: "save-extension-note-content",
      contentId,
      payload,
    });
  }
  if (kind === "external") {
    return runtimeMessage({
      type: "save-extension-external-content",
      contentId,
      payload,
    });
  }
  throw new Error("Unsupported content type");
}

function setPanelEditorStatus(panel, message, tone = "idle") {
  if (!panel?.statusNode) return;
  panel.statusNode.textContent = message || "";
  panel.statusNode.setAttribute("data-tone", tone);
}


function schedulePanelAutosave(panel, saveFn, message = "Saving…") {
  if (panel.autosaveTimer) {
    window.clearTimeout(panel.autosaveTimer);
  }
  setPanelEditorStatus(panel, "Changes pending…");
  panel.autosaveTimer = window.setTimeout(() => {
    void saveFn(message);
  }, 1400);
}

function renderDomainBody(state) {
  const data = state.domainAssociations;
  if (data === "loading") {
    return `<div class="dg-status">Loading…</div>`;
  }
  const items = data?.items || [];
  if (items.length === 0) {
    return `<div class="dg-status">No other content on this domain.</div>`;
  }
  const search = state.domainAssociationsSearch || "";
  const showSearch = items.length > 8;
  const filtered = search
    ? items.filter((item) => item.contentTitle.toLowerCase().includes(search.toLowerCase()))
    : items;
  return `
    ${showSearch ? `
      <div class="dg-domain-search">
        <input class="dg-domain-search-input" type="text" placeholder="Filter…"
          value="${escapeHtml(search)}" data-domain-search="true" />
      </div>
    ` : ""}
    ${filtered.length === 0
      ? `<div class="dg-status">No results for "${escapeHtml(search)}"</div>`
      : filtered.map((item) => `
        <button class="dg-list-item" type="button"
          data-open-content="${escapeHtml(item.contentId)}"
          data-content-kind="${escapeHtml(item.contentType)}">
          <div class="dg-list-meta">
            <div class="dg-list-title">${escapeHtml(item.contentTitle)}</div>
            <div class="dg-list-subtitle">${escapeHtml(item.normalizedUrl || item.contentType)}</div>
          </div>
          <div class="dg-list-chip" style="background:rgba(99,131,196,0.14);color:#b8cef2;">domain</div>
        </button>
      `).join("")
    }
  `;
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
    const webResourceId = context.resource?.id || "";
    sections.push(
      associations
        .map(
          (entry) => `
            <div class="dg-assoc-row">
              <button class="dg-list-item" type="button" data-open-content="${escapeHtml(
                entry.content.id
              )}" data-content-kind="${escapeHtml(entry.content.contentType)}" style="flex:1;min-width:0;">
                <div class="dg-list-meta">
                  <div class="dg-list-title">${escapeHtml(entry.content.title)}</div>
                  <div class="dg-list-subtitle">${escapeHtml(entry.content.contentType)}</div>
                </div>
                <div class="dg-list-chip">associated</div>
              </button>
              <button class="dg-mini-action dg-delete-assoc" type="button"
                data-delete-association="${escapeHtml(entry.content.id)}"
                data-web-resource-id="${escapeHtml(webResourceId)}"
                title="Remove association">×</button>
            </div>
          `
        )
        .join("")
    );
  }

  container.innerHTML = sections.join("");

  const hostname = state.resourceContext?.resource?.sourceHostname;
  if (hostname) {
    const domainSection = document.createElement("div");
    domainSection.className = "dg-domain-section";
    const isExpanded = state.domainAssociationsExpanded;
    domainSection.innerHTML = `
      <button class="dg-domain-toggle" type="button" data-action="toggle-domain-assoc">
        <span class="dg-domain-toggle-icon">${isExpanded ? "▾" : "▸"}</span>
        <span>More from ${escapeHtml(hostname)}</span>
      </button>
      ${isExpanded ? `<div class="dg-domain-body">${renderDomainBody(state)}</div>` : ""}
    `;
    container.appendChild(domainSection);
  }
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
            <span class="dg-tree-kind">${treeIconMarkup(node, expanded)}</span>
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
  const visibleTree = state.contentTree;
  if (!visibleTree || visibleTree.length === 0) {
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
    ${renderTreeRows(state, visibleTree)}
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

function wirePanelDirectEditor(state, panel) {
  const body = panel.body;
  if (!body) return;

  if (panel.kind === "note" || panel.kind === "embed") {
    // Edit-only embed: skip the HTML read view entirely. The iframe is the
    // single source of truth for note rendering — keeps display/edit perfectly
    // consistent and removes ~470 lines of tiptapJsonToHtml DOM walker.
    body.innerHTML = `<div class="dg-editor-status" data-editor-status></div>`;
    panel.statusNode = body.querySelector("[data-editor-status]");
    setTimeout(() => openEmbedForPanel(state, panel), 0);
    return;
  }

  body.innerHTML = `
    <div class="dg-editor-stack">
      <label class="dg-editor-field">
        <span class="dg-editor-label">Title</span>
        <input class="dg-editor-input" type="text" data-external-title />
      </label>
      <label class="dg-editor-field">
        <span class="dg-editor-label">URL</span>
        <input class="dg-editor-input" type="text" data-external-url />
      </label>
      <label class="dg-editor-field" style="flex:1;">
        <span class="dg-editor-label">Description</span>
        <textarea class="dg-editor-textarea" data-external-description placeholder="Describe this resource…"></textarea>
      </label>
      <div class="dg-editor-meta-grid">
        <label class="dg-editor-field">
          <span class="dg-editor-label">Resource Type</span>
          <input class="dg-editor-input" type="text" data-external-resource-type />
        </label>
        <label class="dg-editor-field">
          <span class="dg-editor-label">Relationship</span>
          <input class="dg-editor-input" type="text" data-external-resource-relationship />
        </label>
        <label class="dg-editor-field">
          <span class="dg-editor-label">User Intent</span>
          <input class="dg-editor-input" type="text" data-external-user-intent />
        </label>
      </div>
      <div class="dg-editor-status" data-editor-status></div>
    </div>
  `;

  panel.titleInput = body.querySelector("[data-external-title]");
  panel.urlInput = body.querySelector("[data-external-url]");
  panel.descriptionInput = body.querySelector("[data-external-description]");
  panel.resourceTypeInput = body.querySelector("[data-external-resource-type]");
  panel.resourceRelationshipInput = body.querySelector(
    "[data-external-resource-relationship]"
  );
  panel.userIntentInput = body.querySelector("[data-external-user-intent]");
  panel.statusNode = body.querySelector("[data-editor-status]");

  const saveExternal = async () => {
    try {
      setPanelEditorStatus(panel, "Saving external link…");
      const saved = await savePanelContent("external", panel.contentId, {
        title: panel.titleInput.value.trim() || panel.toolbarTitle.textContent || "External link",
        url: panel.urlInput.value.trim(),
        description: panel.descriptionInput.value.trim() || null,
        resourceType: panel.resourceTypeInput.value.trim() || null,
        resourceRelationship: panel.resourceRelationshipInput.value.trim() || null,
        userIntent: panel.userIntentInput.value.trim() || null,
      });
      panel.currentContent = saved;
      const nextTitle = saved.title || panel.titleInput.value.trim() || "External link";
      panel.toolbarTitle.textContent = nextTitle;
      panel.titleInput.value = nextTitle;
      panel.collapsedChip.querySelector("span").textContent = nextTitle;
      setPanelEditorStatus(panel, "External link autosaved.", "success");
    } catch (error) {
      setPanelEditorStatus(
        panel,
        error instanceof Error ? error.message : "Failed to save external link",
        "error"
      );
    }
  };

  const queueSave = () => schedulePanelAutosave(panel, saveExternal);
  [
    panel.titleInput,
    panel.urlInput,
    panel.descriptionInput,
    panel.resourceTypeInput,
    panel.resourceRelationshipInput,
    panel.userIntentInput,
  ].forEach((input) => input?.addEventListener("input", queueSave));

  panel.cleanupHandlers.push(() => {
    if (panel.autosaveTimer) {
      window.clearTimeout(panel.autosaveTimer);
    }
  });
}

async function loadPanelEditorData(panel) {
  // Note and embed panels use the iframe — no client-side data fetch needed.
  // The iframe loads the embed page which does its own data fetching.
  if (panel.kind === "embed" || panel.kind === "note") {
    panel.body?.setAttribute("data-loading", "false");
    return;
  }
  try {
    panel.body?.setAttribute("data-loading", "true");
    setPanelEditorStatus(panel, "Loading external link…");
    const data = await fetchPanelContent(panel.kind, panel.contentId);
    panel.currentContent = data;
    const nextTitle = data.title || panel.toolbarTitle.textContent || "";
    panel.toolbarTitle.textContent = nextTitle;
    panel.collapsedChip.querySelector("span").textContent = nextTitle;

    if (panel.titleInput) panel.titleInput.value = nextTitle;
    if (panel.urlInput) panel.urlInput.value = data.external?.url || "";
    if (panel.descriptionInput) panel.descriptionInput.value = data.external?.description || "";
    if (panel.resourceTypeInput) panel.resourceTypeInput.value = data.external?.resourceType || "";
    if (panel.resourceRelationshipInput) {
      panel.resourceRelationshipInput.value = data.external?.resourceRelationship || "";
    }
    if (panel.userIntentInput) panel.userIntentInput.value = data.external?.userIntent || "";
    setPanelEditorStatus(panel, "External link ready.");
  } catch (error) {
    setPanelEditorStatus(
      panel,
      error instanceof Error ? error.message : "Failed to load content",
      "error"
    );
  } finally {
    panel.body?.setAttribute("data-loading", "false");
  }
}

function closePanel(state, contentId, nextState = "closed") {
  const panel = state.openPanels.get(contentId);
  if (!panel) return;
  panel.state = nextState;
  showCollapsedChip(panel);
  if (nextState === "closed") {
    // Persist "closed" BEFORE deleting from the map — schedulePersist looks up
    // the panel by ID and would find nothing after the delete below.
    const webResourceId = state.resourceContext?.resource?.id;
    if (webResourceId) {
      runtimeMessage({
        type: "save-overlay-view-state",
        payload: {
          webResourceId,
          contentId,
          state: "closed",
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
      }).catch(() => {});
    }
    state.tileOrder = state.tileOrder.filter((id) => id !== contentId);
    if (panel.embeddedPreviewNode) {
      panel.embeddedPreviewNode.remove();
      panel.embeddedPreviewNode = null;
    }
    // Detach the shared iframe before removing the panel container so
    // the iframe's browsing context survives for the next panel.
    if (state.iframePanel === panel && state.embedIframe?.parentElement === panel.body) {
      panel.body.removeChild(state.embedIframe);
      state.iframePanel = null;
    }
    panel.cleanupHandlers.forEach((cleanup) => {
      try {
        cleanup();
      } catch {}
    });
    panel.container.remove();
    panel.collapsedChip.remove();
    state.openPanels.delete(contentId);
    // schedulePersist intentionally NOT called here — we persisted above
  } else {
    panel.container.style.display = "none";
    if (!state.tileOrder.includes(contentId)) {
      state.tileOrder.push(contentId);
    }
    applyTilePosition(state, panel);
    schedulePersist(state, contentId);
  }
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
  const title = item.title || (kind === "note" ? "Note" : kind === "embed" ? "Content" : "External link");
  const kindLabel = kind === "note" ? "Web note overlay" : kind === "embed" ? "Content overlay" : "External metadata overlay";
  container.innerHTML = `
    <div class="dg-panel-toolbar">
      <div class="dg-panel-toolbar-title">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(kindLabel)}</span>
      </div>
      <div class="dg-toolbar-actions">
        <span class="dg-panel-ready" style="font-size:11px;color:rgba(255,255,255,0.46)"></span>
        <button class="dg-toolbar-button" type="button" data-panel-action="open-tree" title="Browse file tree">◂ Tree</button>
        <button class="dg-toolbar-button" type="button" data-panel-action="app" title="Open in app">↗</button>
        <button class="dg-toolbar-button" type="button" data-panel-action="collapse" title="Collapse">—</button>
        <button class="dg-toolbar-button" type="button" data-panel-action="close" title="Close">×</button>
      </div>
    </div>
    <div class="dg-panel-content"></div>
  `;

  const collapsedChip = document.createElement("button");
  collapsedChip.className = "dg-panel-collapsed";
  collapsedChip.type = "button";
  collapsedChip.innerHTML = `<span>${escapeHtml(title)}</span><strong>Open</strong>`;

  state.panelsMount.appendChild(container);
  state.panelsMount.appendChild(collapsedChip);

  const panel = {
    contentId: item.id,
    kind,
    container,
    toolbar: container.querySelector(".dg-panel-toolbar"),
    toolbarTitle: container.querySelector(".dg-panel-toolbar-title strong"),
    readyHint: container.querySelector(".dg-panel-ready"),
    body: container.querySelector(".dg-panel-content"),
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
    currentContent: null,
    autosaveTimer: null,
    embeddedPreviewNode: null,
    tileX: persisted?.metadata?.tileX ?? null,
    tileY: persisted?.metadata?.tileY ?? null,
    suppressChipClickUntil: 0,
  };

  state.openPanels.set(item.id, panel);
  makePanelDraggable(state, panel);
  wirePanelDirectEditor(state, panel);
  applyPanelGeometry(state, panel);
  showCollapsedChip(panel);
  void loadPanelEditorData(panel);

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

    if (action === "open-tree") {
      closePanel(state, panel.contentId, "closed");
      openSnapPanel(state);
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
  // "embed" = any content type the embed shell can render (file, folder, visualization, etc.)
  const kind = contentKind === "external" ? "external" : contentKind === "note" ? "note" : "embed";
  const context = state.resourceContext;
  const persisted =
    context?.viewStates?.find((entry) => entry.contentId === contentId) || null;
  const source =
    (context?.associations || []).find((entry) => entry.content.id === contentId)?.content ||
    (context?.externalContents || []).find((entry) => entry.id === contentId) ||
    { id: contentId, title: contentId };
  createContentPanel(state, source, kind, persisted);
  closeSnapPanel(state);
}

async function associateAndOpen(state, contentId, contentKind) {
  if (!state.resourceContext?.resource?.id) {
    await loadResourceContext(state);
  }
  const webResourceId = state.resourceContext?.resource?.id;
  if (!webResourceId) {
    throw new Error("Web resource context is unavailable");
  }

  await runtimeMessage({
    type: "create-resource-association",
    payload: {
      webResourceId,
      contentId,
    },
  });

  state.resourceContext = await loadResourceContext(state);
  renderAssociationsPopover(state);

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
    const kind = association.contentType === "external" ? "external" : association.contentType === "note" ? "note" : "embed";
    createContentPanel(state, association, kind, viewState);
  }
}

async function refreshOverlayResourceState(state, reason = "sync-update") {
  state.resourceContext = await loadResourceContext(state);
  renderAssociationsPopover(state);
  for (const panel of state.openPanels.values()) {
    if (
      reason === "sync-update" ||
      (state.resourceContext?.externalContents || []).some(
        (entry) => entry.id === panel.contentId
      )
    ) {
      void loadPanelEditorData(panel);
    }
  }
  return reason;
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
    if (state.snap === "floating") {
      applyLauncherPosition(state);
      applyFloatingPanelPosition(state);
    } else {
      applyEdgeTabPosition(state);
    }
    Array.from(state.openPanels.values()).forEach((panel) => {
      applyPanelGeometry(state, panel);
      if (panel.state === "collapsed") {
        applyTilePosition(state, panel);
      }
    });
  });

  // ── SPA URL change detection ──────────────────────────────────────────────
  // Content scripts run in an isolated JS world, so patching history.pushState
  // only patches the content-script copy — the page's framework calls its own.
  // window.location.href IS shared across worlds, so polling is the reliable path.
  let _lastTrackedHref = window.location.href;
  function _onUrlChange() {
    const current = window.location.href;
    if (current === _lastTrackedHref) return;
    _lastTrackedHref = current;
    state.resourceContext = null;
    state.domainAssociations = null;
    state.domainAssociationsExpanded = false;
    state.domainAssociationsSearch = "";
    if (state.panelOpen) {
      renderStatus(state.popoverBodies.associations, "Loading…");
      void loadResourceContext(state)
        .then(() => renderAssociationsPopover(state))
        .catch(() => {});
    }
  }
  // popstate fires in isolated world for Back/Forward
  window.addEventListener("popstate", _onUrlChange);
  window.addEventListener("hashchange", _onUrlChange);
  // Navigation API (Chrome 102+) fires in isolated world for all SPA navigations
  try { if (window.navigation) window.navigation.addEventListener("navigate", _onUrlChange); } catch (_) {}
  // Polling — universal fallback, location.href is readable from isolated world
  setInterval(_onUrlChange, 1000);

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
    if (event.key === "Escape") {
      if (state.targetingPanelId) stopEmbedTargeting(state);
      else if (state.panelOpen) closeSnapPanel(state);
    }
  });

  // Bridge postMessages from the embed iframe → overlay UI
  window.addEventListener("message", (event) => {
    const iframe = state.embedIframe;
    if (!iframe || !event.data || typeof event.data !== "object") return;
    // Only accept messages from our iframe
    if (event.source !== iframe.contentWindow) return;

    const { type, title, contentId } = event.data;
    const panel = state.iframePanel;

    if (type === "ready") {
      iframe.setAttribute("data-active", "true");
      if (panel) {
        setPanelEditorStatus(panel, "");
        if (panel.authCheckTimer) {
          window.clearTimeout(panel.authCheckTimer);
          panel.authCheckTimer = null;
        }
      }
    }
    if (type === "dirty" && panel) {
      setPanelEditorStatus(panel, "Saving…");
    }
    if (type === "saved" && panel) {
      setPanelEditorStatus(panel, "Saved ✓", "success");
      setTimeout(() => {
        if (state.iframePanel === panel) setPanelEditorStatus(panel, "");
      }, 2000);
    }
    if (type === "title-changed" && title && panel) {
      panel.toolbarTitle.textContent = title;
      const chipSpan = panel.collapsedChip?.querySelector("span");
      if (chipSpan) chipSpan.textContent = title;
    }
    if (type === "navigate" && contentId) {
      // Session 5: open the linked note as a new panel
    }
    if (type === "open-external" && event.data.url) {
      // Iframe asked us to open an external URL — pop it in a new top-level tab.
      // We use window.open from the content-script context so it inherits the
      // host page's window features, then immediately blur to keep focus on the
      // original page (clipboard / focus-stealing protection).
      try {
        const opened = window.open(event.data.url, "_blank", "noopener,noreferrer");
        if (opened && typeof opened.opener !== "undefined") opened.opener = null;
      } catch (_) {
        // Some hosts block window.open from content scripts — fall back to a
        // synthesised anchor click which is more permissive.
        try {
          const a = document.createElement("a");
          a.href = event.data.url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.style.display = "none";
          document.body.appendChild(a);
          a.click();
          a.remove();
        } catch (_) {}
      }
    }
    // prewarm-ready is informational only — no action needed
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "dg-bookmark-sync-updated") {
      const normalizedCurrentUrl = normalizeComparableUrl(window.location.href);
      const normalizedEventUrl =
        message.payload?.normalizedUrl ||
        (message.payload?.url ? normalizeComparableUrl(message.payload.url) : "");
      if (!normalizedEventUrl || normalizedEventUrl !== normalizedCurrentUrl) return;
      void refreshOverlayResourceState(state, message.payload?.reason || "sync-update").catch(
        (error) => {
          console.warn("[DG Overlay] Failed to refresh resource state after sync update", {
            error: error instanceof Error ? error.message : error,
            payload: message.payload || null,
          });
        }
      );
      return;
    }

    if (message?.type === "dg-open-associated-content") {
      void (async () => {
        try {
          if (!state.resourceContext) {
            await loadResourceContext(state);
          } else {
            state.resourceContext = await loadResourceContext(state);
          }
          renderAssociationsPopover(state);
          await openAssociatedContent(
            state,
            message.payload?.contentId,
            message.payload?.contentKind || "external"
          );
          sendResponse?.({ ok: true });
        } catch (error) {
          sendResponse?.({
            ok: false,
            error: error instanceof Error ? error.message : "Failed to open associated content",
          });
        }
      })();
      return true;
    }

    if (message?.type === "dg-show-tree-panel") {
      void (async () => {
        try {
          await openSnapPanel(state);
          sendResponse?.({ ok: true });
        } catch (error) {
          sendResponse?.({
            ok: false,
            error: error instanceof Error ? error.message : "Failed to open tree panel",
          });
        }
      })();
      return true;
    }
  });

  // ── Floating launcher button ───────────────────────────────────────────────

  state.launcherBtn.addEventListener("click", () => {
    if (Date.now() < state.suppressMainButtonClickUntil) return;
    if (state.panelOpen) {
      closeSnapPanel(state);
    } else {
      void openSnapPanel(state);
    }
  });

  let launcherDrag = null;
  state.launcherBtn.addEventListener("pointerdown", (event) => {
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
      if (state.panelOpen) applyFloatingPanelPosition(state);
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

  // ── Edge tab (docked mode) — drag to reposition along edge, click to open ───

  let edgeTabDrag = null;
  state.edgeTab.addEventListener("pointerdown", (event) => {
    if (state.snap === "floating") return;
    event.preventDefault();
    const snap = state.snap;
    edgeTabDrag = { moved: false };
    const onMove = (me) => {
      if (!edgeTabDrag) return;
      edgeTabDrag.moved = true;
      if (snap === "right" || snap === "left") {
        state.edgeTabOffset = Math.max(0, Math.min(1, me.clientY / (window.innerHeight - 48)));
      } else {
        state.edgeTabOffset = Math.max(0, Math.min(1, me.clientX / (window.innerWidth - 48)));
      }
      applyEdgeTabPosition(state);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const wasMoved = edgeTabDrag?.moved ?? false;
      edgeTabDrag = null;
      if (!wasMoved) {
        void openSnapPanel(state);
      } else {
        void saveDomainMemory(window.location.hostname, { snap: state.snap, edgeTabOffset: state.edgeTabOffset }, "etld1");
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });
  state.edgeTab.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void openSnapPanel(state);
    }
  });

  // ── Snap panel controls ───────────────────────────────────────────────────

  state.panelCloseBtn.addEventListener("click", () => closeSnapPanel(state));

  state.workspaceSelect.addEventListener("change", () => {
    const workspaceId = state.workspaceSelect.value || null;
    state.selectedWorkspaceId = workspaceId;
    renderStatus(state.popoverBodies.tree, "Loading…");
    void loadContentTree(state, { workspaceId, force: true })
      .then(() => renderTreePopover(state))
      .catch((e) => {
        const msg = e instanceof Error ? e.message : "Failed to load tree";
        const isAuth = /token|trusted|unauthorized|auth/i.test(msg);
        renderStatus(state.popoverBodies.tree, isAuth ? "Re-trust required — open Digital Garden settings to reconnect." : msg, "error");
      });
  });

  // ── Shadow-delegated click events ─────────────────────────────────────────

  state.shadow.addEventListener("click", async (event) => {
    const snapBtn = event.target.closest("[data-snap-to]");
    if (snapBtn) {
      const mode = snapBtn.getAttribute("data-snap-to");
      setSnap(state, mode);
      void saveDomainMemory(window.location.hostname, { snap: mode, edgeTabOffset: state.edgeTabOffset ?? 0.5 }, "etld1");
      return;
    }

    const targetAction = event.target.closest("[data-target-action]");
    if (targetAction) {
      const action = targetAction.getAttribute("data-target-action");
      if (action === "cancel") stopEmbedTargeting(state);
      if (action === "confirm") confirmEmbedTarget(state);
      return;
    }

    // ── Associations section: refresh + domain toggle ─────────────────────────
    const actionBtn = event.target.closest("[data-action]");
    if (actionBtn) {
      const action = actionBtn.getAttribute("data-action");

      if (action === "refresh-associations") {
        state.resourceContext = null;
        state.domainAssociations = null;
        state.domainAssociationsExpanded = false;
        state.domainAssociationsSearch = "";
        renderStatus(state.popoverBodies.associations, "Refreshing…");
        try {
          await loadResourceContext(state);
          renderAssociationsPopover(state);
        } catch (e) {
          renderStatus(state.popoverBodies.associations, "Refresh failed — check connection", "error");
        }
        return;
      }

      if (action === "toggle-domain-assoc") {
        state.domainAssociationsExpanded = !state.domainAssociationsExpanded;
        if (state.domainAssociationsExpanded && state.domainAssociations === null) {
          state.domainAssociations = "loading";
          renderAssociationsPopover(state);
          try {
            const result = await runtimeMessage({
              type: "fetch-domain-associations",
              url: window.location.href,
              excludeResourceId: state.resourceContext?.resource?.id || null,
            });
            state.domainAssociations = result;
          } catch (e) {
            state.domainAssociations = { items: [] };
          }
        }
        renderAssociationsPopover(state);
        return;
      }
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

    const deleteAssocButton = event.target.closest("[data-delete-association]");
    if (deleteAssocButton) {
      const contentId = deleteAssocButton.getAttribute("data-delete-association");
      const webResourceId = deleteAssocButton.getAttribute("data-web-resource-id");
      if (!contentId || !webResourceId) return;
      try {
        await runtimeMessage({ type: "delete-resource-association", payload: { webResourceId, contentId } });
        state.resourceContext = await loadResourceContext(state);
        renderAssociationsPopover(state);
      } catch (error) {
        renderStatus(
          state.popoverBodies.associations,
          error instanceof Error ? error.message : "Failed to remove association",
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

      if (!title.trim()) return;

      renderStatus(state.popoverBodies.tree, `Creating ${type}…`);

      try {
        const created = await createTreeContentItem(state, {
          type,
          parentId: parentId || null,
          title,
          url,
        });
        state.contentTree = null;
        await loadContentTree(state, { workspaceId: state.selectedWorkspaceId || null });
        if (parentId) state.expandedTreeIds.add(parentId);
        if (created.contentType === "folder") state.expandedTreeIds.add(created.id);
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

  // ── Domain search input ────────────────────────────────────────────────────
  state.shadow.addEventListener("input", (event) => {
    if (!event.target.closest("[data-domain-search]")) return;
    state.domainAssociationsSearch = event.target.value || "";
    const domainBody = state.popoverBodies.associations?.querySelector(".dg-domain-body");
    if (domainBody) domainBody.innerHTML = renderDomainBody(state);
  });
}

async function initOverlay() {
  if (window.top !== window.self) return;
  if (document.getElementById(DG_OVERLAY_ROOT_ID)) return;

  const [config, extensionContext] = await Promise.all([
    runtimeMessage({ type: "get-config" }),
    runtimeMessage({ type: "get-extension-context" }),
  ]);

  const missingPrerequisites = [];
  if (!config?.appBaseUrl) {
    missingPrerequisites.push("appBaseUrl");
  }
  if (!config?.token) {
    missingPrerequisites.push("trustedToken");
  }
  if (!extensionContext?.trustedInstallId) {
    missingPrerequisites.push("trustedInstallId");
  }

  if (missingPrerequisites.length > 0) {
    console.debug("[DG Overlay] Setup incomplete, skipping injection", missingPrerequisites);
    return;
  }

  let appOrigin = "";
  try {
    appOrigin = new URL(config.appBaseUrl).origin;
  } catch (error) {
    console.warn("[DG Overlay] Invalid Digital Garden app URL", {
      appBaseUrl: config.appBaseUrl,
      error: error instanceof Error ? error.message : "Unknown URL parsing error",
    });
    return;
  }

  if (window.location.origin === appOrigin) {
    return;
  }

  const state = {
    config,
    extensionContext,
    host: null,
    shadow: null,
    root: null,
    launcherBtn: null,
    edgeTab: null,
    snapPanel: null,
    workspaceSelect: null,
    panelCloseBtn: null,
    popoverBodies: {},
    panelsMount: null,
    snap: "right",
    panelOpen: false,
    workspaces: [],
    selectedWorkspaceId: null,
    isIdle: false,
    idleTimer: null,
    resourceContext: null,
    domainAssociations: null,
    domainAssociationsExpanded: false,
    domainAssociationsSearch: "",
    edgeTabOffset: 0.5,
    contentTree: null,
    loadedForWorkspaceId: null,
    expandedTreeIds: new Set(),
    tileOrder: [],
    openPanels: new Map(),
    persistTimers: new Map(),
    lastHoveredSelector: "body",
    launcherPosition: null,
    targetBanner: null,
    targetCopy: null,
    targetHighlight: null,
    targetingPanelId: null,
    targetElement: null,
    targetSelector: null,
    targetPreviewNode: null,
    suppressMainButtonClickUntil: 0,
    embedIframe: null,
    iframeContentId: null,
    iframePanel: null,
    iframePrewarmed: false,
    prewarmContainer: null,
  };

  createOverlayApp(state);
  wireRootEvents(state);
  markActivity(state);

  // Preconnect: tell the browser to open a TCP/TLS connection to the app
  // origin immediately, so the first iframe load skips connection setup.
  try {
    const existingLink = document.querySelector(`link[rel="preconnect"][data-dg-embed]`);
    if (!existingLink) {
      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = appOrigin;
      link.crossOrigin = "use-credentials";
      link.setAttribute("data-dg-embed", "1");
      document.head.appendChild(link);
    }
  } catch {}

  // Idle prewarm: 3 s after overlay init, load /embed/blank in the hidden
  // container so Next.js chunks are cached before the user clicks "Edit".
  setTimeout(() => {
    if (state.iframePrewarmed || state.iframeContentId || !state.embedIframe) return;
    state.iframePrewarmed = true;
    state.prewarmContainer.appendChild(state.embedIframe);
    state.embedIframe.setAttribute("src", `${appOrigin}/embed/blank`);
    state.iframeContentId = "__prewarm__";
  }, 3000);

  const hostname = window.location.hostname;
  const domainMemory = await loadDomainMemory(hostname).catch(() => ({ snap: "right" }));
  state.edgeTabOffset = domainMemory.edgeTabOffset ?? 0.5;
  setSnap(state, domainMemory.snap || "right");

  void loadWorkspaces(state).then(() => renderWorkspaceSelector(state));

  try {
    await loadResourceContext(state);
    renderAssociationsPopover(state);
    await restorePanelsFromState(state);
  } catch (error) {
    console.warn("[DG Overlay] Initial resource context load failed", {
      error: error instanceof Error ? error.message : error,
      pageUrl: window.location.href,
      appBaseUrl: state.config.appBaseUrl,
      trustedInstallId: state.extensionContext?.trustedInstallId || null,
      tokenPresent: Boolean(state.config.token),
    });
  }
}

initOverlay().catch((error) => {
  console.warn("[DG Overlay] Failed to initialize overlay", error);
});

// ─── Read aloud (TTS) playback ─────────────────────────────────
// The background service worker has no DOM and can't play audio, so it hands us
// either the synthesized bytes (cloud) or the raw text (Web Speech fallback) to
// play here in the page context.
let dgTtsAudio = null;

function dgStopTts() {
  if (dgTtsAudio) {
    dgTtsAudio.pause();
    dgTtsAudio.src = "";
    dgTtsAudio = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (!message || typeof message.type !== "string") return;

  if (message.type === "dg-tts-play") {
    dgStopTts();
    const src = `data:${message.mimeType || "audio/mpeg"};base64,${message.audioBase64}`;
    dgTtsAudio = new Audio(src);
    dgTtsAudio.addEventListener("ended", () => {
      dgTtsAudio = null;
    });
    dgTtsAudio.play().catch((error) => {
      console.warn("[DG Overlay] TTS playback failed", error);
    });
  } else if (message.type === "dg-tts-fallback") {
    dgStopTts();
    try {
      const utterance = new SpeechSynthesisUtterance(message.text || "");
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.warn("[DG Overlay] Web Speech fallback failed", error);
    }
  } else if (message.type === "dg-tts-stop") {
    dgStopTts();
  }
});
