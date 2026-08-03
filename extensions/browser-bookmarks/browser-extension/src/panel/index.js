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

// Co-browse ops the panel embed may relay to the background (Slice 5a). An
// allow-list so a compromised embed can't invoke arbitrary `cobrowse-*` (or
// worse) background handlers by constructing the op string.
const CO_BROWSE_OPS = new Set([
  "attach",
  "detach",
  "status",
  "frames",
  "snapshot",
  "navigate",
  "click",
  "hover",
  "type",
]);

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

/**
 * Extract page content from `tabId`, injecting the lightweight reader on demand
 * if the tab has no content script yet (opened before the extension loaded, or
 * not reloaded after an update). Lets capture work without asking the user to
 * reload the tab; genuinely restricted pages still surface a clear error.
 */
async function sendExtractWithInjectFallback(tabId, scope) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "dg-extract-content", scope });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (
      /receiving end does not exist|could not establish connection/i.test(msg) &&
      chrome.scripting
    ) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["dist/reader.js"],
      });
      return chrome.tabs.sendMessage(tabId, { type: "dg-extract-content", scope });
    }
    throw err;
  }
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
        const response = await sendExtractWithInjectFallback(tab.id, scope);
        if (!response?.ok) throw new Error(response?.error || "Extraction failed");
        postToEmbed("page-content", {
          ...response.data,
          capturedAt: Date.now(),
        });
      } catch (error) {
        const raw = error instanceof Error ? error.message : "";
        // After the inject-and-retry, a lingering messaging error (or an
        // executeScript failure) means the page is genuinely restricted.
        const message =
          /receiving end does not exist|could not establish connection|cannot access|chrome:\/\/|extension gallery|chrome web store/i.test(
            raw,
          )
            ? "Can't read this page — it looks restricted (chrome:// pages, the Chrome Web Store, or the browser's PDF viewer can't be read)."
            : raw || "Couldn't read this page";
        postToEmbed("page-content-error", { scope, message });
      }
    })();
    return;
  }

  // Screenshot: capture the visible area of the active tab for the chat's
  // vision input. captureVisibleTab must run from an extension context (this
  // host page), targeting the active tab's window.
  if (data.type === "capture-screenshot") {
    void (async () => {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          lastFocusedWindow: true,
        });
        if (tab?.windowId == null) throw new Error("No active tab");
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
          format: "jpeg",
          quality: 70,
        });
        postToEmbed("screenshot", { dataUrl });
      } catch (error) {
        const raw = error instanceof Error ? error.message : "";
        // captureVisibleTab needs the <all_urls> host permission. The manifest
        // now requests it, but Chrome only applies a widened permission after
        // the extension is reloaded AND the user accepts the prompt — so give
        // that instruction instead of Chrome's raw permission string.
        const message = /permission|all_urls|activeTab/i.test(raw)
          ? "Screenshots need updated permissions. Open chrome://extensions, reload this extension, and accept the access prompt — then try again."
          : raw || "Couldn't screenshot this page";
        postToEmbed("screenshot-error", { message });
      }
    })();
    return;
  }

  // Associated content (Quick access): the embed asks for the resource context
  // of a page URL. Only the background holds the bearer token, so relay there.
  if (data.type === "fetch-resource-context" && data.payload?.url) {
    const payload = data.payload;
    void (async () => {
      try {
        const context = await sendRuntimeMessage({
          type: "fetch-resource-context",
          payload: {
            url: payload.url,
            title: payload.title || "",
            faviconUrl: payload.faviconUrl || undefined,
          },
        });
        postToEmbed("resource-context", { url: payload.url, context });
      } catch (error) {
        postToEmbed("resource-context-error", {
          url: payload.url,
          message:
            error instanceof Error ? error.message : "Couldn't load associated content",
        });
      }
    })();
    return;
  }

  // Resolve the page's external content node (anchor for "chat about this
  // page"): reuse an existing node for this URL if one exists, else create one.
  // Dedup lives here so the embed gets a single content id back.
  if (data.type === "resolve-page-node" && data.payload?.url) {
    const payload = data.payload;
    void (async () => {
      try {
        const context = await sendRuntimeMessage({
          type: "fetch-resource-context",
          payload: { url: payload.url, title: payload.title || "" },
        });
        let contentId = context?.externalContents?.[0]?.id || null;
        if (!contentId) {
          const node = await sendRuntimeMessage({
            type: "create-content-picker-item",
            payload: {
              type: "external",
              url: payload.url,
              title: payload.title || "",
              webResourceId: context?.resource?.id || null,
            },
          });
          contentId = node?.id || null;
        }
        postToEmbed("page-node-resolved", { url: payload.url, contentId });
      } catch (error) {
        postToEmbed("page-node-error", {
          url: payload.url,
          message:
            error instanceof Error ? error.message : "Couldn't save this page",
        });
      }
    })();
    return;
  }

  // Link / unlink a page to a content note (B3-B). Resolve the URL to a
  // webResourceId (resource-context) first, then call the existing background
  // association handlers. Ack as `association-changed` so the note's link icon
  // updates. `linked` = the resulting state.
  if (
    (data.type === "associate-page" || data.type === "unassociate-page") &&
    data.payload?.url &&
    data.payload?.contentId
  ) {
    const payload = data.payload;
    const linking = data.type === "associate-page";
    void (async () => {
      try {
        const context = await sendRuntimeMessage({
          type: "fetch-resource-context",
          payload: { url: payload.url, title: payload.title || "" },
        });
        const webResourceId = context?.resource?.id;
        if (!webResourceId) throw new Error("Couldn't resolve this page");
        await sendRuntimeMessage({
          type: linking
            ? "create-resource-association"
            : "delete-resource-association",
          payload: { webResourceId, contentId: payload.contentId },
        });
        postToEmbed("association-changed", {
          url: payload.url,
          contentId: payload.contentId,
          linked: linking,
        });
      } catch (error) {
        postToEmbed("association-error", {
          url: payload.url,
          contentId: payload.contentId,
          message:
            error instanceof Error ? error.message : "Couldn't update the link",
        });
      }
    })();
    return;
  }

  // "More from {hostname}" lazy expansion. The background handler reads `url`
  // and `excludeResourceId` off the message itself (not a payload wrapper).
  if (data.type === "fetch-domain-associations" && data.payload?.url) {
    const payload = data.payload;
    void (async () => {
      try {
        const result = await sendRuntimeMessage({
          type: "fetch-domain-associations",
          url: payload.url,
          excludeResourceId: payload.excludeResourceId || null,
        });
        postToEmbed("domain-associations", { url: payload.url, result });
      } catch (error) {
        postToEmbed("domain-associations-error", {
          url: payload.url,
          message:
            error instanceof Error ? error.message : "Couldn't load domain content",
        });
      }
    })();
    return;
  }

  // Capture settings (B3-B): the embed reads the auto-associate killswitch +
  // denylist from chrome.storage (via the background). Replied as
  // `capture-settings`. The panel gates its settle-then-associate on these.
  if (data.type === "get-capture-settings") {
    void (async () => {
      try {
        const settings = await sendRuntimeMessage({ type: "get-capture-settings" });
        postToEmbed("capture-settings", settings);
      } catch (error) {
        postToEmbed("capture-settings-error", {
          message: error instanceof Error ? error.message : "Couldn't load settings",
        });
      }
    })();
    return;
  }

  // Browser page history (B3-B, Phase C): the embed reads the persisted
  // "pages you visited" log for the Recents browser-history source. Replied as
  // `page-history`. This never leaves the browser.
  if (data.type === "get-page-history") {
    void (async () => {
      try {
        const history = await sendRuntimeMessage({ type: "get-page-history" });
        postToEmbed("page-history", { history });
      } catch (error) {
        postToEmbed("page-history-error", {
          message: error instanceof Error ? error.message : "Couldn't load history",
        });
      }
    })();
    return;
  }

  // Open a URL in a new browser tab — Recents browser-history items are pages,
  // not content nodes, so clicking one re-opens it rather than selecting in a pane.
  if (data.type === "open-url" && data.payload?.url) {
    try {
      chrome.tabs.create({ url: data.payload.url });
    } catch {
      // Non-fatal — restricted URL scheme, etc.
    }
    return;
  }

  // Acquisition (B5): the page-bridge content script doesn't run inside this
  // iframe, so the panel embed can't reach the background directly — it asks the
  // host to run the acquisition provider (P2 sw-fetch / P3 session-tab) and
  // relays the raw result back as `acquire-url-result`.
  if (data.type === "acquire-url" && data.payload?.url) {
    void (async () => {
      try {
        const result = await sendRuntimeMessage({
          type: "acquire-url",
          payload: data.payload,
        });
        postToEmbed("acquire-url-result", result);
      } catch (error) {
        postToEmbed("acquire-url-result", {
          ok: false,
          reason: error instanceof Error ? error.message : "acquisition failed",
        });
      }
    })();
    return;
  }

  // Agentic co-browse (Phase 2b, Slice 5a): the panel embed drives the
  // background's chrome.debugger engine THROUGH the host — the trust-gated
  // channel (the exact-origin + source check at the top of this listener),
  // deliberately NOT the open page-bridge (so a web page can't attach the
  // debugger). Relay `cobrowse-<op>` to the background, post the result back
  // correlated by id. The op is allow-listed so the embed can't reach arbitrary
  // background message types by constructing the op string.
  if (data.type === "cobrowse" && data.payload && typeof data.payload.op === "string") {
    const { id, op, args } = data.payload;
    void (async () => {
      if (!CO_BROWSE_OPS.has(op)) {
        postToEmbed("cobrowse-result", { id, result: { ok: false, error: `unknown co-browse op: ${op}` } });
        return;
      }
      try {
        const result = await sendRuntimeMessage({ type: `cobrowse-${op}`, payload: args || {} });
        postToEmbed("cobrowse-result", { id, result: { ok: true, data: result } });
      } catch (error) {
        postToEmbed("cobrowse-result", {
          id,
          result: { ok: false, error: error instanceof Error ? error.message : "co-browse failed" },
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
  // Opened via "Ask AI about this page" (context menu / shortcut) — land on
  // the Chat view, and carry the intent (`ask-about-page`) so the embed starts
  // a fresh chat about the page. One-shot: consumed here so a later manual open
  // is neutral.
  try {
    const { dgPanelView, dgPanelIntent } = await chrome.storage.session.get([
      "dgPanelView",
      "dgPanelIntent",
    ]);
    if (dgPanelView === "chat") {
      panelUrl.searchParams.set("view", "chat");
    }
    if (dgPanelIntent) {
      panelUrl.searchParams.set("intent", dgPanelIntent);
    }
    await chrome.storage.session.remove(["dgPanelView", "dgPanelIntent"]);
  } catch {
    // Session storage unavailable — default view is fine.
  }
  // Hidden until the `load` listener swaps it in — no stacked states.
  frame.style.display = "none";
  frame.src = panelUrl.toString();

  void refreshActiveTab();
  void maybeShowFirstRun();
}

reloadBtn.addEventListener("click", () => void boot());

// Long-lived port: its mere existence tells the background the panel is open,
// so "Ask AI about this page" can switch views over it instead of calling
// sidePanel.open() again (which would toggle the panel shut). Connect once per
// panel document (not per boot()).
let panelPort = null;
try {
  panelPort = chrome.runtime.connect({ name: "dg-panel" });
  panelPort.onMessage.addListener((msg) => {
    if (msg?.type === "show-chat") {
      postToEmbed("set-view", { view: "chat", intent: msg.intent });
    }
  });
  // Auto-recovery: a live port keeps the service worker awake, so while the
  // panel is open the port only disconnects if the EXTENSION was reloaded —
  // which invalidates this page's context and makes every chrome.* call fail
  // with "Receiving end does not exist". Detect the dead context (runtime.id
  // goes undefined) and reload to reconnect to the fresh background.
  panelPort.onDisconnect.addListener(() => {
    if (!chrome.runtime?.id) location.reload();
  });
} catch {
  // Background unavailable — the panel still works; only live view-switching
  // (already-open case) is lost, and the cold-open path is unaffected.
  panelPort = null;
}

// Explicitly disconnect on unload so the background nulls its `panelPort`
// immediately. Closing the side panel (X) unloads this document; relying on
// Chrome's implicit port teardown alone can lag, leaving a stale port that
// makes the next "Ask AI about this page" think the panel is still open (so it
// messages the void instead of re-opening). pagehide is the reliable signal.
window.addEventListener("pagehide", () => {
  try {
    panelPort?.disconnect();
  } catch {
    // Already torn down — nothing to do.
  }
});

void boot();
