/**
 * Side-panel host script (BROWSER-REACH B1).
 *
 * The panel page is deliberately thin: a context bar (the only extension
 * chrome) above an iframe hosting the app's /embed/panel mini-DG shell.
 * Everything intelligent renders inside the iframe.
 *
 * C2 message envelope (versioned from day one):
 *   out → iframe: {v:1, source:"dg-panel-host", type:"page-context", payload}
 *   in  ← iframe: {v:1, source:"dg-panel-embed", type:"ready"}
 * All outgoing postMessages target the EXACT app origin; all incoming
 * messages are dropped unless event.origin matches it and event.source is
 * our iframe (ShadowPrompt lesson: no wildcard origins, no source trust).
 */

const frame = document.getElementById("dg-panel-frame");
const loadingState = document.getElementById("dg-state-loading");
const unconfiguredState = document.getElementById("dg-state-unconfigured");
const faviconEl = document.getElementById("dg-page-favicon");
const titleEl = document.getElementById("dg-page-title");
const firstRun = document.getElementById("dg-first-run");
const firstRunDismiss = document.getElementById("dg-first-run-dismiss");
const reloadBtn = document.getElementById("dg-panel-reload");

const FIRST_RUN_KEY = "panelFirstRunSeenAt";

let appOrigin = null;
let frameReady = false;
let pendingPageContext = null;

function sendRuntimeMessage(message) {
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

function showState(el) {
  for (const state of [loadingState, unconfiguredState]) {
    state.dataset.active = state === el ? "true" : "false";
  }
  frame.style.display = el ? "none" : "block";
}

// ── Page context (active tab → context bar + iframe) ─────────────────────────

/** Post a versioned host→embed message to the exact app origin. */
function postToEmbed(type, payload) {
  if (!frameReady || !appOrigin) return;
  frame.contentWindow?.postMessage(
    { v: 1, source: "dg-panel-host", type, payload },
    appOrigin
  );
}

function postPageContext(context) {
  if (!frameReady || !appOrigin) {
    pendingPageContext = context;
    return;
  }
  frame.contentWindow?.postMessage(
    {
      v: 1,
      source: "dg-panel-host",
      type: "page-context",
      payload: context,
    },
    appOrigin
  );
}

function renderPageContext(tab) {
  if (!tab) return;
  const title = tab.title || tab.url || "";
  titleEl.textContent = title;
  titleEl.title = tab.url || "";
  if (tab.favIconUrl && /^https?:/.test(tab.favIconUrl)) {
    faviconEl.src = tab.favIconUrl;
    faviconEl.style.display = "block";
  } else {
    faviconEl.style.display = "none";
  }
  postPageContext({
    url: tab.url || "",
    title,
    faviconUrl: tab.favIconUrl || undefined,
  });
}

async function refreshActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    renderPageContext(tab);
  } catch {
    // Restricted contexts (no active tab) — leave the bar as-is.
  }
}

chrome.tabs.onActivated.addListener(() => void refreshActiveTab());
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab?.active && (changeInfo.title || changeInfo.url || changeInfo.favIconUrl)) {
    renderPageContext(tab);
  }
});

// ── Iframe messaging (exact-origin, versioned envelope) ──────────────────────

window.addEventListener("message", (event) => {
  if (!appOrigin || event.origin !== appOrigin) return;
  if (event.source !== frame.contentWindow) return;
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.v !== 1 || data.source !== "dg-panel-embed") return;

  if (data.type === "ready") {
    frameReady = true;
    showState(null);
    if (pendingPageContext) {
      postPageContext(pendingPageContext);
      pendingPageContext = null;
    }
    return;
  }

  // Capture: the embed asks for the current page's content at a scope. Only
  // the content script can read the page, so relay there and post the result
  // back. The active tab is authoritative here (the panel host tracks it).
  if (data.type === "capture-page") {
    const scope = data.payload?.scope || "full";
    void (async () => {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          lastFocusedWindow: true,
        });
        if (!tab?.id) throw new Error("No active tab");
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: "dg-extract-content",
          scope,
        });
        if (!response?.ok) throw new Error(response?.error || "Extraction failed");
        postToEmbed("page-content", {
          ...response.data,
          capturedAt: Date.now(),
        });
      } catch (error) {
        postToEmbed("page-content-error", {
          scope,
          message:
            error instanceof Error ? error.message : "Couldn't read this page",
        });
      }
    })();
    return;
  }

  // Pop-out: the panel asks for content to open as an overlay on the page.
  // A drag can't cross from this document into the page, so the panel offers
  // four quadrants instead and tells us which corner the user chose.
  if (data.type === "open-overlay" && data.payload?.contentId) {
    chrome.runtime.sendMessage(
      {
        type: "open-content-in-active-tab",
        payload: {
          contentId: data.payload.contentId,
          contentKind: data.payload.contentKind || "embed",
          corner: data.payload.corner,
        },
      },
      () => {
        // Overlay unavailable on this page (restricted URL, no content
        // script) — surface it in the context bar rather than failing mute.
        if (chrome.runtime.lastError) {
          const previous = titleEl.textContent;
          titleEl.textContent = "Can't open an overlay on this page";
          setTimeout(() => {
            titleEl.textContent = previous;
          }, 2600);
        }
      }
    );
  }
});

// ── First-run tooltip (two-surface principle, decision #1) ───────────────────

async function maybeShowFirstRun() {
  const stored = await chrome.storage.local.get(FIRST_RUN_KEY);
  if (stored[FIRST_RUN_KEY]) return;
  firstRun.dataset.visible = "true";
}

firstRunDismiss.addEventListener("click", () => {
  firstRun.dataset.visible = "false";
  void chrome.storage.local.set({ [FIRST_RUN_KEY]: Date.now() });
});

// ── Boot ─────────────────────────────────────────────────────────────────────

// The iframe stays hidden until its `load` event — which fires for ANY
// document, including browser network-error pages — then swaps in atomically.
// This kills the loading-label/iframe stacking and the boot layout shift.
// The versioned `ready` message remains the signal that the real shell is up.
frame.addEventListener("load", () => {
  loadingState.dataset.active = "false";
  frame.style.display = "block";
});

async function boot() {
  frameReady = false;
  showState(loadingState);

  let config;
  try {
    config = await sendRuntimeMessage({ type: "get-config" });
  } catch {
    config = null;
  }

  if (!config?.appBaseUrl) {
    showState(unconfiguredState);
    return;
  }

  const baseUrl = config.appBaseUrl.replace(/\/$/, "");
  appOrigin = new URL(baseUrl).origin;

  // Same session flow as the overlay: fetch an embed session token BEFORE
  // setting src so ?_t= is present when the page loads (cross-site-cookie
  // fallback for browsers that block the /embed cookie in iframes).
  let sessionToken = null;
  try {
    const session = await sendRuntimeMessage({ type: "refresh-embed-session" });
    sessionToken = session?.sessionToken || session?.token || null;
  } catch {
    // Cookie path may still work; load without the token.
  }

  const panelUrl = new URL(`${baseUrl}/embed/panel`);
  if (sessionToken) panelUrl.searchParams.set("_t", sessionToken);
  // Hidden until the `load` listener swaps it in — no stacked states.
  frame.style.display = "none";
  frame.src = panelUrl.toString();

  void refreshActiveTab();
  void maybeShowFirstRun();
}

reloadBtn.addEventListener("click", () => void boot());

void boot();
