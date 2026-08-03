import { loadUrlPresets, resolvePreset, applyUrlStrategy, getStrategyOverrides, setStrategyOverride } from "../url-strategy.js";
import * as cobrowse from "../agentic/cdp/index.js";

const STORAGE_KEYS = {
  config: "dgBrowserBookmarksConfig",
  ignore: "dgBrowserBookmarksIgnore",
  install: "dgBrowserBookmarksInstall",
  quickSaveDrafts: "dgBrowserBookmarksQuickSaveDrafts",
  strategyOverrides: "dgUrlStrategyOverrides",
  // BROWSER-REACH B3-B: persisted "pages you visited" ring buffer (viewership →
  // Recents). Kept OUT of config so it can't bloat the settings blob or ride an
  // export. Never leaves the browser — no server row is ever created for it.
  pageHistory: "dgBrowserPageHistory",
};

const DEFAULT_CONFIG = {
  appBaseUrl: "",
  token: "",
  defaultConnectionId: "",
  nativeSaveBehavior: "silent-defaults",
  defaults: {
    dedupeEnabled: false,
    preserveHtml: false,
    domainIntelligenceEnabled: true,
  },
  rules: [],
  // BROWSER-REACH B3-B capture controls. Deliberately conservative defaults:
  // auto-association is OFF until the user opts in (killswitch); navigation
  // history capture is ON but user-disableable and never creates content.
  capture: {
    autoAssociate: false,
    navHistory: true,
    denylist: [],
    // Agentic Browsing read-completion launcher: when ON, the assistant may
    // open a VISIBLE foreground tab to read a page a background session tab
    // can't (bot/device-blocked). OFF by default — standing consent is opt-in.
    allowTabLaunch: false,
  },
};

async function getConfig() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.config);
  return {
    ...DEFAULT_CONFIG,
    ...(result[STORAGE_KEYS.config] || {}),
  };
}

async function saveConfig(nextConfig) {
  await chrome.storage.local.set({ [STORAGE_KEYS.config]: nextConfig });
  return nextConfig;
}

async function getQuickSaveDrafts() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.quickSaveDrafts);
  return result[STORAGE_KEYS.quickSaveDrafts] || {};
}

async function saveQuickSaveDraft(url, draft) {
  const normalizedUrl = normalizeComparableUrl(url);
  if (!normalizedUrl) return null;
  const drafts = await getQuickSaveDrafts();
  drafts[normalizedUrl] = {
    ...(draft || {}),
    updatedAt: new Date().toISOString(),
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.quickSaveDrafts]: drafts });
  return drafts[normalizedUrl];
}

async function clearQuickSaveDraft(url) {
  const normalizedUrl = normalizeComparableUrl(url);
  if (!normalizedUrl) return;
  const drafts = await getQuickSaveDrafts();
  if (!(normalizedUrl in drafts)) return;
  delete drafts[normalizedUrl];
  await chrome.storage.local.set({ [STORAGE_KEYS.quickSaveDrafts]: drafts });
}

async function getQuickSaveDraft(url) {
  const normalizedUrl = normalizeComparableUrl(url);
  if (!normalizedUrl) return null;
  const drafts = await getQuickSaveDrafts();
  return drafts[normalizedUrl] || null;
}

async function getInstallRecord() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.install);
  const existing = result[STORAGE_KEYS.install];
  if (existing?.installInstanceId) {
    return existing;
  }
  const created = {
    installInstanceId: crypto.randomUUID(),
    trustedInstallId: null,
    trustedAt: null,
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.install]: created });
  return created;
}

async function saveInstallRecord(nextRecord) {
  await chrome.storage.local.set({ [STORAGE_KEYS.install]: nextRecord });
  return nextRecord;
}

async function getExtensionContext() {
  const install = await getInstallRecord();
  const config = await getConfig();
  const manifest = chrome.runtime.getManifest();
  return {
    installInstanceId: install.installInstanceId,
    trustedInstallId: install.trustedInstallId || null,
    trustedAt: install.trustedAt || null,
    tokenPresent: Boolean(config.token),
    appBaseUrl: config.appBaseUrl || "",
    extensionId: chrome.runtime.id,
    extensionName: manifest.name,
    extensionVersion: manifest.version,
  };
}

async function saveTrustedInstall(payload) {
  const install = await getInstallRecord();
  await saveInstallRecord({
    ...install,
    trustedInstallId: payload.trustedInstallId,
    trustedAt: new Date().toISOString(),
  });
  const current = await getConfig();
  const next = {
    ...current,
    appBaseUrl: payload.appBaseUrl?.trim() || current.appBaseUrl,
    token: payload.token,
  };
  await saveConfig(next);
  // New bearer token → clear stale session cache so next exchange uses new token.
  // Fire-and-forget: do NOT await — the exchange is a network call and waiting for
  // it would push the background response past the settings page's 3s bridge timeout.
  chrome.storage.session.remove(EMBED_SESSION_CACHE_KEY).then(() => {
    exchangeEmbedSession().catch(() => {});
  });
  return getExtensionContext();
}

async function clearTrustedInstall() {
  const install = await getInstallRecord();
  await saveInstallRecord({
    ...install,
    trustedInstallId: null,
    trustedAt: null,
  });
  const current = await getConfig();
  const next = {
    ...current,
    token: "",
  };
  await saveConfig(next);
  return getExtensionContext();
}

function getApiUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

async function apiFetch(path, init = {}) {
  const config = await getConfig();
  if (!config.appBaseUrl) {
    throw new Error("Missing app URL");
  }
  if (!config.token) {
    throw new Error("Missing trusted browser token");
  }

  const url = getApiUrl(config.appBaseUrl, path);
  let response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.token}`,
        ...(init.headers || {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network request failed";
    throw new Error(`Failed to reach Digital Garden at ${url}: ${message}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const rawBody = await response.text();
  let json = null;

  if (contentType.includes("application/json")) {
    try {
      json = JSON.parse(rawBody);
    } catch {
      throw new Error(
        `Digital Garden returned invalid JSON for ${path} (${response.status} ${response.statusText})`
      );
    }
  }

  if (!response.ok) {
    // Never use rawBody as the error message — it can be a full HTML page (e.g.
    // a Next.js 404) which leaks into UI rendering when stringified as an Error.
    const message =
      json?.error?.message ||
      `Request failed: ${path} (${response.status})`;
    throw new Error(message);
  }

  if (!json || json.success === false) {
    throw new Error(json?.error?.message || `Request failed: ${path}`);
  }

  return json.data;
}

async function fetchBookmarkPreferences() {
  return apiFetch("/api/integrations/browser-bookmarks/preferences");
}

async function saveBookmarkPreferences(payload) {
  return apiFetch("/api/integrations/browser-bookmarks/preferences", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

async function fetchResourceContext(payload) {
  return apiFetch("/api/integrations/browser-extension/resource-context", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function fetchExtensionExternalContent(contentId) {
  return apiFetch(`/api/integrations/browser-extension/content/${contentId}/external`);
}

async function fetchExtensionNoteContent(contentId) {
  return apiFetch(`/api/integrations/browser-extension/content/${contentId}/note`);
}

async function saveExtensionNoteContent(contentId, payload) {
  return apiFetch(`/api/integrations/browser-extension/content/${contentId}/note`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

async function saveExtensionExternalContent(contentId, payload) {
  return apiFetch(`/api/integrations/browser-extension/content/${contentId}/external`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

async function fetchContentPickerTree(workspaceId) {
  const path = workspaceId
    ? `/api/integrations/browser-extension/content-picker-tree?workspaceId=${encodeURIComponent(workspaceId)}`
    : "/api/integrations/browser-extension/content-picker-tree";
  return apiFetch(path);
}

async function createContentPickerItem(payload) {
  return apiFetch("/api/integrations/browser-extension/content-picker-tree", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function createResourceAssociation(payload) {
  return apiFetch("/api/integrations/browser-extension/associations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function deleteResourceAssociation(payload) {
  return apiFetch("/api/integrations/browser-extension/associations", {
    method: "DELETE",
    body: JSON.stringify(payload),
  });
}

async function fetchDomainAssociations(url, excludeResourceId) {
  const params = new URLSearchParams({ url });
  if (excludeResourceId) params.set("excludeResourceId", excludeResourceId);
  return apiFetch(`/api/integrations/browser-extension/domain-associations?${params}`);
}

async function fetchFlashcardDecks() {
  return apiFetch("/api/integrations/browser-extension/flashcard/decks");
}

async function createFlashcard(payload) {
  return apiFetch("/api/integrations/browser-extension/flashcard", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function saveOverlayViewState(payload) {
  return apiFetch("/api/integrations/browser-extension/view-state", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

function getHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function getPathname(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "/";
  }
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

function matchesRule(rule, input) {
  if (rule.hostname && rule.hostname !== input.hostname) return false;
  if (rule.hostnameSuffix && !input.hostname.endsWith(rule.hostnameSuffix)) return false;
  if (rule.pathPrefix && !input.pathname.startsWith(rule.pathPrefix)) return false;
  if (rule.captureSource && rule.captureSource !== input.captureSource) return false;
  if (rule.connectionId && rule.connectionId !== input.connectionId) return false;
  return true;
}

function resolveBookmarkOptions(config, input) {
  const base = {
    ...config.defaults,
  };
  for (const rule of config.rules || []) {
    if (matchesRule(rule, input)) {
      Object.assign(base, rule.actions || {});
    }
  }
  return base;
}

const ignoredBookmarkEvents = new Map();

function suppressBookmarkEvent(id) {
  ignoredBookmarkEvents.set(id, Date.now() + 4000);
}

function shouldIgnoreBookmarkEvent(id) {
  const expiresAt = ignoredBookmarkEvents.get(id);
  if (!expiresAt) return false;
  if (expiresAt < Date.now()) {
    ignoredBookmarkEvents.delete(id);
    return false;
  }
  return true;
}

async function fetchConnections() {
  return apiFetch("/api/integrations/browser-bookmarks/connections");
}

async function fetchWorkspaces() {
  return apiFetch("/api/integrations/browser-extension/workspaces");
}

// ── URL association cache ─────────────────────────────────────────────────────

const URL_ASSOC_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const URL_ASSOC_CACHE_KEY_PREFIX = "dgUrlAssoc:";

function normalizeUrlForCache(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`.replace(/\/$/, "");
  } catch {
    return null;
  }
}

async function getCachedUrlAssociation(url) {
  const key = normalizeUrlForCache(url);
  if (!key) return null;
  const result = await chrome.storage.local.get(`${URL_ASSOC_CACHE_KEY_PREFIX}${key}`);
  const entry = result[`${URL_ASSOC_CACHE_KEY_PREFIX}${key}`];
  if (!entry || Date.now() - entry.timestamp > URL_ASSOC_CACHE_TTL_MS) return null;
  return entry;
}

async function setCachedUrlAssociation(url, data) {
  const key = normalizeUrlForCache(url);
  if (!key) return;
  await chrome.storage.local.set({
    [`${URL_ASSOC_CACHE_KEY_PREFIX}${key}`]: { ...data, timestamp: Date.now() },
  });
}

async function clearCachedUrlAssociation(url) {
  const key = normalizeUrlForCache(url);
  if (!key) return;
  await chrome.storage.local.remove(`${URL_ASSOC_CACHE_KEY_PREFIX}${key}`);
}

async function fetchAndCacheUrlAssociation(url) {
  try {
    const data = await apiFetch(
      `/api/integrations/browser-extension/url-association?url=${encodeURIComponent(url)}`
    );
    await setCachedUrlAssociation(url, data);
    return data;
  } catch {
    return null;
  }
}

async function updateTabBadge(tabId, url) {
  try {
    let assoc = await getCachedUrlAssociation(url);
    if (!assoc) {
      assoc = await fetchAndCacheUrlAssociation(url);
    }
    if (assoc?.hasNote || assoc?.hasExternal) {
      if (workflowBadgeState?.urgent) {
        // A failed / needs-review workflow badge (global) must never be masked
        // by the per-tab bookmark dot. Empty per-tab text falls back to the
        // global badge; the dot returns on the next tab update once urgency
        // clears.
        await chrome.action.setBadgeText({ text: "", tabId });
      } else {
        await chrome.action.setBadgeText({ text: "●", tabId });
        await chrome.action.setBadgeBackgroundColor({ color: "#c9a86c", tabId });
      }
    } else {
      await chrome.action.setBadgeText({ text: "", tabId });
    }
  } catch {
    // Best-effort — don't break tab navigation on badge failure
  }
}

async function resolveActiveConnection(config) {
  const connections = await fetchConnections();
  let connection =
    connections.find((item) => item.id === config.defaultConnectionId) || null;

  if (!connection && connections.length === 1) {
    connection = connections[0];
    await saveConfig({
      ...config,
      defaultConnectionId: connection.id,
    });
  }

  return { connection, connections };
}

async function resolveConnection(config, connectionId = "") {
  if (!connectionId) {
    return resolveActiveConnection(config);
  }
  const connections = await fetchConnections();
  const connection = connections.find((item) => item.id === connectionId) || null;
  return { connection, connections };
}

async function pushMutations(connectionId, mutations) {
  return apiFetch("/api/integrations/browser-bookmarks/sync/push", {
    method: "POST",
    body: JSON.stringify({ connectionId, mutations }),
  });
}

async function pullDeltas(connectionId, since) {
  const params = new URLSearchParams({ connectionId });
  if (since) params.set("since", since);
  return apiFetch(`/api/integrations/browser-bookmarks/sync/pull?${params.toString()}`);
}

async function bootstrapConnection(connectionId) {
  const params = new URLSearchParams({ connectionId });
  return apiFetch(`/api/integrations/browser-bookmarks/sync/bootstrap?${params.toString()}`);
}

async function fetchBookmarkTree() {
  const [tree] = await chrome.bookmarks.getTree();
  return tree || null;
}

async function getBookmarkNode(id) {
  if (!id) return null;
  return chrome.bookmarks
    .get(String(id))
    .then((nodes) => nodes[0] || null)
    .catch(() => null);
}

async function findConnectionForChromeParentId(parentId, preloadedConnections = null) {
  const connections = preloadedConnections || (await fetchConnections());
  const rootMap = new Map(
    connections.map((connection) => [String(connection.chromeRootId), connection])
  );

  let currentId = parentId ? String(parentId) : null;
  while (currentId) {
    const matched = rootMap.get(currentId);
    if (matched) {
      return matched;
    }
    const node = await getBookmarkNode(currentId);
    currentId = node?.parentId ? String(node.parentId) : null;
  }

  return null;
}

async function isBookmarkUnderRoot(parentId, rootId) {
  const matchedConnection = await findConnectionForChromeParentId(parentId, [
    { id: rootId, chromeRootId: String(rootId) },
  ]);
  return Boolean(matchedConnection);
}

async function findSyncedBookmarksForUrl(url, connectionId = null) {
  const normalizedUrl = normalizeComparableUrl(url);
  const [connections, bookmarks] = await Promise.all([
    fetchConnections(),
    chrome.bookmarks.search({ url }),
  ]);
  const eligibleConnections = connectionId
    ? connections.filter((connection) => connection.id === connectionId)
    : connections;

  const results = [];
  for (const bookmark of bookmarks || []) {
    if (!bookmark.url || normalizeComparableUrl(bookmark.url) !== normalizedUrl) {
      continue;
    }

    for (const connection of eligibleConnections) {
      if (await isBookmarkUnderRoot(bookmark.parentId, connection.chromeRootId)) {
        results.push({ bookmark, connection });
        break;
      }
    }
  }

  return results;
}

async function notifyOverlayTabs(event) {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs
      .filter((tab) => typeof tab.id === "number")
      .map((tab) =>
        chrome.tabs
          .sendMessage(tab.id, {
            type: "dg-bookmark-sync-updated",
            payload: event,
          })
          .catch(() => {})
      )
  );
}

async function getCurrentTabSyncState() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    throw new Error("No active tab is available");
  }

  const resourceContext = await fetchResourceContext({
    url: tab.url,
    canonicalUrl: null,
    title: tab.title || tab.url,
    faviconUrl: tab.favIconUrl || null,
    metadata: {
      source: "popup-state",
    },
  }).catch(() => null);

  const primaryExternal = resourceContext?.externalContents?.[0] || null;
  const externalContent =
    primaryExternal?.id ? await fetchExtensionExternalContent(primaryExternal.id).catch(() => null) : null;

  const [config, draft, connections, bookmarks] = await Promise.all([
    getConfig(),
    getQuickSaveDraft(tab.url),
    fetchConnections().catch(() => []),
    findSyncedBookmarksForUrl(tab.url).catch(() => []),
  ]);

  return {
    url: tab.url,
    normalizedUrl: normalizeComparableUrl(tab.url),
    title: tab.title || tab.url,
    defaultConnectionId: config.defaultConnectionId || "",
    draft,
    existingExternal: externalContent,
    resourceContext,
    bookmarks: bookmarks.map((match) => ({
      bookmarkId: match.bookmark.id,
      title: match.bookmark.title,
      parentId: match.bookmark.parentId || null,
      connectionId: match.connection.id,
      connectionName: match.connection.name,
    })),
    connections,
  };
}

// ── Workflows (Trellis) ───────────────────────────────────────────────────────
// Proxy-not-share: the extension only ever sees compact DTOs + a runId. Engine
// routing (wdk vs n8n) happens server-side behind the one dispatch door.

// Server caps captures at 100k chars; match it so we never ship dead weight.
const WORKFLOW_PAGE_TEXT_CAP = 100_000;

/**
 * Ask the overlay content script for the RENDERED page text. URL-only runs
 * against JS-rendered pages are the documented soak failure — text is the
 * capture's real payload. Restricted pages (chrome://, web store) have no
 * content script; degrade to URL-only rather than failing the dispatch.
 */
async function extractPageTextFromTab(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: "dg-extract-page-text",
    });
    const text = typeof response?.text === "string" ? response.text : "";
    return text.slice(0, WORKFLOW_PAGE_TEXT_CAP);
  } catch {
    return "";
  }
}

/** Chooser feed: the user's workflows, page-matches sorted first. */
async function listWorkflowsForActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const pageUrl = tab?.url || "";
  const data = await apiFetch(
    `/api/integrations/browser-extension/workflows?pageUrl=${encodeURIComponent(pageUrl)}`
  );
  return { workflows: data.workflows || [], pageUrl };
}

/**
 * Dispatch the chosen workflow against the active tab: extract rendered text,
 * POST the capture, then ask the overlay to mount the live status pill. The
 * pill is best-effort — on overlay-less pages the popup status line is the ack.
 */
async function dispatchWorkflowForActiveTab(payload) {
  const workflowId =
    typeof payload?.workflowId === "string" ? payload.workflowId : "";
  if (!workflowId) throw new Error("No workflow selected");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab is available");

  const pageText = await extractPageTextFromTab(tab.id);
  const data = await apiFetch(
    "/api/integrations/browser-extension/workflow-dispatch",
    {
      method: "POST",
      body: JSON.stringify({
        workflowId,
        input: {
          pageUrl: tab.url || "",
          pageTitle: tab.title || "",
          ...(pageText ? { pageText } : {}),
        },
      }),
    }
  );

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: "dg-workflow-run-started",
      payload: {
        runId: data.runId,
        workflowTitle: payload?.workflowTitle || "Workflow",
        workflowNodeId: workflowId, // pill [View] deep-opens this workflow
      },
    });
  } catch {
    // No overlay on this page — the popup's status line already acknowledged.
  }
  void refreshWorkflowBadge(); // a fresh run should show ambiently right away
  return data;
}

/** Status poll target for the overlay pill (bearer read-only run detail). */
async function getWorkflowRun(runId) {
  if (typeof runId !== "string" || !runId) throw new Error("Missing runId");
  const data = await apiFetch(
    `/api/integrations/browser-extension/workflows/runs/${encodeURIComponent(runId)}`
  );
  // Piggyback: a pill poll observing a status TRANSITION is exactly when the
  // ambient badge is stale — refresh it once per transition, not per poll.
  const run = data.run;
  if (run && lastBadgeRunStatus.get(run.id) !== run.status) {
    lastBadgeRunStatus.set(run.id, run.status);
    void refreshWorkflowBadge();
  }
  return run;
}

// ── Workflow ambient badge (global; most-urgent run wins) ────────────────────
// Precedence (frozen in the plan): failed (red) → waiting/needs-review (amber)
// → running/queued (blue) → recently succeeded (green, ~10s) → clear. The
// bookmark feature's per-tab gold dot yields to URGENT states only (see
// updateTabBadge) so a failure is never masked on a bookmarked tab.

const WORKFLOW_BADGE_ALARM = "dg-workflow-badge";
const WORKFLOW_SUCCESS_LINGER_MS = 10_000;
const WORKFLOW_FAILURE_LINGER_MS = 30 * 60_000; // failures decay after 30 min

/** null = no badge; else { text, color, urgent, transient } */
let workflowBadgeState = null;
let workflowBadgeInFlight = null;
const lastBadgeRunStatus = new Map();

function computeWorkflowBadge(runs, now = Date.now()) {
  let waiting = false;
  let active = false;
  let recentFailure = false;
  let recentSuccess = false;
  for (const run of runs) {
    if (run.status === "waiting") waiting = true;
    if (run.status === "running" || run.status === "queued") active = true;
    const finishedAt = run.finishedAt ? Date.parse(run.finishedAt) : NaN;
    if (Number.isNaN(finishedAt)) continue;
    if (run.status === "failed" && now - finishedAt < WORKFLOW_FAILURE_LINGER_MS) {
      recentFailure = true;
    }
    if (run.status === "succeeded" && now - finishedAt < WORKFLOW_SUCCESS_LINGER_MS) {
      recentSuccess = true;
    }
  }
  if (recentFailure) return { text: "!", color: "#dc2626", urgent: true, transient: false };
  if (waiting) return { text: "!", color: "#d97706", urgent: true, transient: false };
  if (active) return { text: "●", color: "#2563eb", urgent: false, transient: false };
  if (recentSuccess) return { text: "✓", color: "#059669", urgent: false, transient: true };
  return null;
}

async function refreshWorkflowBadge() {
  if (workflowBadgeInFlight) return workflowBadgeInFlight;
  workflowBadgeInFlight = (async () => {
    try {
      const data = await apiFetch(
        "/api/integrations/browser-extension/workflows/runs?limit=15"
      );
      workflowBadgeState = computeWorkflowBadge(data.runs || []);
      if (workflowBadgeState) {
        await chrome.action.setBadgeText({ text: workflowBadgeState.text });
        await chrome.action.setBadgeBackgroundColor({
          color: workflowBadgeState.color,
        });
        if (workflowBadgeState.transient) {
          // Best-effort green decay (~10s). If MV3 kills the worker first,
          // the 1-minute alarm clears it instead.
          setTimeout(() => void refreshWorkflowBadge(), WORKFLOW_SUCCESS_LINGER_MS + 1000);
        }
      } else {
        await chrome.action.setBadgeText({ text: "" });
      }
    } catch {
      // Unpaired / offline — leave the badge alone; the next alarm retries.
    } finally {
      workflowBadgeInFlight = null;
    }
  })();
  return workflowBadgeInFlight;
}

/** Popup feed: compact recent runs (needs-review pinned client-side). */
async function listWorkflowRuns(limit = 6) {
  const data = await apiFetch(
    `/api/integrations/browser-extension/workflows/runs?limit=${limit}`
  );
  return { runs: data.runs || [] };
}

/**
 * Context-menu path: NO chooser — the server auto-routes by the page URL
 * against page-capture trigger patterns (first capture auto-creates a
 * template workflow). `selectionText`, when present, becomes the capture
 * text instead of the full page — "run a workflow on just this passage".
 * Context menus have no UI for errors, so failures flash the badge red
 * briefly rather than dying silently.
 */
async function dispatchWorkflowAutoRoute(selectionText) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab is available");
  try {
    const pageText =
      typeof selectionText === "string" && selectionText.trim()
        ? selectionText.slice(0, WORKFLOW_PAGE_TEXT_CAP)
        : await extractPageTextFromTab(tab.id);
    const data = await apiFetch(
      "/api/integrations/browser-extension/workflow-dispatch",
      {
        method: "POST",
        body: JSON.stringify({
          input: {
            pageUrl: tab.url || "",
            pageTitle: tab.title || "",
            ...(pageText ? { pageText } : {}),
          },
        }),
      }
    );
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "dg-workflow-run-started",
        payload: {
          runId: data.runId,
          workflowTitle: "Workflow",
          workflowNodeId: data.workflowNodeId || null,
        },
      });
    } catch {
      // Restricted page — the badge is the remaining ambient signal.
    }
    void refreshWorkflowBadge();
    return data;
  } catch (error) {
    await chrome.action.setBadgeText({ text: "!" }).catch(() => {});
    await chrome.action
      .setBadgeBackgroundColor({ color: "#dc2626" })
      .catch(() => {});
    setTimeout(() => void refreshWorkflowBadge(), 5000);
    throw error;
  }
}

async function startQuickCaptureInActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab is available");
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "dg-quick-capture" });
    return { started: true, tabId: tab.id };
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Quick Capture is not available on this page: ${error.message}`
        : "Quick Capture is not available on this page"
    );
  }
}

async function showTreePanelInActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("No active tab is available");
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "dg-show-tree-panel" });
    return { openedInOverlay: true, tabId: tab.id };
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `This page overlay is not available: ${error.message}`
        : "This page overlay is not available on the current tab"
    );
  }
}

// Send a message to a tab's overlay content script, injecting the overlay on
// demand if the tab has none yet (opened before the extension loaded, or not
// reloaded after an update) and retrying once. Lets "Open as overlay" work
// without asking the user to reload the page tab.
async function sendToOverlayOrInject(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    const m = err instanceof Error ? err.message : "";
    if (
      /receiving end does not exist|could not establish connection/i.test(m) &&
      chrome.scripting
    ) {
      console.log("[DG Bookmarks] overlay missing on tab — injecting on demand", tabId);
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["dist/page-bridge.js", "dist/overlay.js"],
      });
      return await chrome.tabs.sendMessage(tabId, message);
    }
    throw err;
  }
}

async function openContentInActiveTab(
  contentId,
  contentKind = "external",
  runId,
  corner
) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  console.log("[DG Bookmarks] openContentInActiveTab", {
    contentId,
    contentKind,
    corner,
    tabId: tab?.id,
  });
  if (!tab?.id) {
    throw new Error("No active tab is available");
  }

  try {
    await sendToOverlayOrInject(tab.id, {
      type: "dg-open-associated-content",
      payload: {
        contentId,
        contentKind,
        runId, // workflow panels: deep-link the embed viewer to this run
        corner, // side-panel pop-out: which page corner to open in
      },
    });
    return { openedInOverlay: true, tabId: tab.id };
  } catch (error) {
    console.warn("[DG Bookmarks] openContentInActiveTab failed", error);
    throw new Error(
      error instanceof Error
        ? `This page overlay is not available: ${error.message}`
        : "This page overlay is not available on the current tab"
    );
  }
}

async function captureActiveTabMetadata(targetUrl) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    return {
      faviconUrl: null,
      screenshotDataUrl: null,
      pageTitle: null,
      tabId: null,
    };
  }

  if (normalizeComparableUrl(tab.url) !== normalizeComparableUrl(targetUrl)) {
    return {
      faviconUrl: tab.favIconUrl || null,
      screenshotDataUrl: null,
      pageTitle: tab.title || null,
      tabId: tab.id || null,
    };
  }

  let screenshotDataUrl = null;
  try {
    screenshotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "jpeg",
      quality: 45,
    });
  } catch {
    screenshotDataUrl = null;
  }

  return {
    faviconUrl: tab.favIconUrl || null,
    screenshotDataUrl,
    pageTitle: tab.title || null,
    tabId: tab.id || null,
  };
}

async function findConnectionForBookmarkNode(parentId) {
  return findConnectionForChromeParentId(parentId);
}

async function recordSyncError(connectionId, message) {
  try {
    const connections = await fetchConnections();
    const connection = connections.find((item) => item.id === connectionId);
    if (!connection) return;
    await chrome.storage.local.set({
      [`sync-error:${connectionId}`]: {
        message,
        observedAt: new Date().toISOString(),
      },
    });
  } catch {
    // Best-effort local error capture only.
  }
}

async function handleNativeBookmarkCreated(id, bookmark) {
  if (shouldIgnoreBookmarkEvent(id)) return;
  if (!bookmark.url) return;

  const connection = await findConnectionForBookmarkNode(bookmark.parentId);
  if (!connection) return;

  const config = await getConfig();
  const ruleOptions = resolveBookmarkOptions(config, {
    hostname: getHostname(bookmark.url),
    pathname: getPathname(bookmark.url),
    captureSource: "native-save",
    connectionId: connection.id,
  });
  const activeTabMetadata = await captureActiveTabMetadata(bookmark.url);

  try {
    const result = await pushMutations(connection.id, [
      {
        mutationType: "create",
        nodeKind: "bookmark",
        contentType: "external",
        payloadShape: "external-reference-v1",
        sourceSystem: "browser",
        observedAt: new Date().toISOString(),
        connectionId: connection.id,
        routingMode: "rule-engine",
        chromeNodeId: id,
        parentChromeNodeId: bookmark.parentId,
        title: bookmark.title,
        url: bookmark.url,
        faviconUrl: activeTabMetadata.faviconUrl,
        dedupeEnabled: Boolean(ruleOptions.dedupeEnabled),
        resourceType: ruleOptions.resourceType || null,
        resourceRelationship: ruleOptions.resourceRelationship || null,
        userIntent: ruleOptions.userIntent || null,
        domainIntelligenceEnabled:
          ruleOptions.domainIntelligenceEnabled !== false,
        preserveHtml: Boolean(ruleOptions.preserveHtml),
        captureMetadata: {
          source: "native-save",
          dateAdded: bookmark.dateAdded || null,
          capturedAt: new Date().toISOString(),
          pageTitle: activeTabMetadata.pageTitle,
          tabId: activeTabMetadata.tabId,
          screenshotDataUrl: activeTabMetadata.screenshotDataUrl,
        },
      },
    ]);
    await notifyOverlayTabs({
      reason: "native-bookmark-created",
      url: bookmark.url,
      normalizedUrl: normalizeComparableUrl(bookmark.url),
      connectionId: connection.id,
      contentId: result.results?.[0]?.contentId || null,
    });
  } catch (error) {
    await recordSyncError(
      connection.id,
      error instanceof Error ? error.message : "Native bookmark sync failed"
    );
    throw error;
  }

  if (config.nativeSaveBehavior === "auto-open-follow-up") {
    chrome.tabs.create({
      url: chrome.runtime.getURL(`capture.html?bookmarkId=${encodeURIComponent(id)}`),
    });
  }
}

async function handleBookmarkChanged(id, changeInfo) {
  if (shouldIgnoreBookmarkEvent(id)) return;
  const bookmark = await chrome.bookmarks.get(id).then((nodes) => nodes[0]).catch(() => null);
  if (!bookmark || !bookmark.url) return;
  const connection = await findConnectionForBookmarkNode(bookmark.parentId);
  if (!connection) return;
  const activeTabMetadata = await captureActiveTabMetadata(changeInfo.url || bookmark.url);

  const updatedUrl = changeInfo.url || bookmark.url;
  const result = await pushMutations(connection.id, [
    {
      mutationType: "update",
      nodeKind: "bookmark",
      contentType: "external",
      payloadShape: "external-reference-v1",
      sourceSystem: "browser",
      observedAt: new Date().toISOString(),
      connectionId: connection.id,
      routingMode: "rule-engine",
      chromeNodeId: id,
      parentChromeNodeId: bookmark.parentId,
      title: changeInfo.title || bookmark.title,
      url: updatedUrl,
      faviconUrl: activeTabMetadata.faviconUrl,
      captureMetadata: {
        source: "bookmark-update",
        capturedAt: new Date().toISOString(),
        pageTitle: activeTabMetadata.pageTitle,
        tabId: activeTabMetadata.tabId,
        screenshotDataUrl: activeTabMetadata.screenshotDataUrl,
      },
    },
  ]);
  await notifyOverlayTabs({
    reason: "native-bookmark-updated",
    url: updatedUrl,
    normalizedUrl: normalizeComparableUrl(updatedUrl),
    connectionId: connection.id,
    contentId: result.results?.[0]?.contentId || null,
  });
}

async function handleBookmarkMoved(id, moveInfo) {
  if (shouldIgnoreBookmarkEvent(id)) return;
  const connection = await findConnectionForBookmarkNode(moveInfo.parentId);
  if (!connection) return;
  const bookmark = await chrome.bookmarks.get(id).then((nodes) => nodes[0]).catch(() => null);
  if (!bookmark) return;
  await pushMutations(connection.id, [
    {
      mutationType: "move",
      nodeKind: bookmark.url ? "bookmark" : "folder",
      contentType: bookmark.url ? "external" : "folder",
      payloadShape: bookmark.url ? "external-reference-v1" : "folder-v1",
      sourceSystem: "browser",
      observedAt: new Date().toISOString(),
      connectionId: connection.id,
      routingMode: "rule-engine",
      chromeNodeId: id,
      parentChromeNodeId: moveInfo.parentId,
      title: bookmark.title,
      url: bookmark.url || undefined,
    },
  ]);
}

async function handleBookmarkRemoved(id, removeInfo) {
  if (shouldIgnoreBookmarkEvent(id)) return;
  const connections = await fetchConnections().catch(() => []);
  const connection = await findConnectionForChromeParentId(removeInfo.parentId, connections);
  if (!connection) return;

  const removedUrl = removeInfo.node?.url || null;
  const result = await pushMutations(connection.id, [
    {
      mutationType: "delete",
      nodeKind: removeInfo.node?.url ? "bookmark" : "folder",
      contentType: removeInfo.node?.url ? "external" : "folder",
      payloadShape: removeInfo.node?.url ? "external-reference-v1" : "folder-v1",
      sourceSystem: "browser",
      observedAt: new Date().toISOString(),
      connectionId: connection.id,
      routingMode: "rule-engine",
      chromeNodeId: id,
      parentChromeNodeId: removeInfo.parentId,
      title: removeInfo.node?.title,
      url: removeInfo.node?.url,
    },
  ]);
  if (removedUrl) {
    await notifyOverlayTabs({
      reason: "native-bookmark-removed",
      url: removedUrl,
      normalizedUrl: normalizeComparableUrl(removedUrl),
      connectionId: connection.id,
      contentId: result.results?.[0]?.contentId || null,
    });
  }
}

async function applyDelta(connection, delta) {
  const node = delta.node;
  if (delta.mutationType === "delete" && node.chromeNodeId) {
    suppressBookmarkEvent(node.chromeNodeId);
    try {
      await chrome.bookmarks.remove(node.chromeNodeId);
    } catch (error) {
      try {
        await chrome.bookmarks.removeTree(node.chromeNodeId);
      } catch {
        console.warn("[DG Bookmarks] Failed to delete bookmark node", error);
      }
    }
    return;
  }

  if (node.nodeKind === "folder") {
    if (delta.mutationType === "create" && !node.chromeNodeId) {
      const created = await chrome.bookmarks.create({
        parentId: node.parentChromeNodeId || connection.chromeRootId,
        title: node.title,
      });
      suppressBookmarkEvent(created.id);
      return;
    }

    if (node.chromeNodeId) {
      suppressBookmarkEvent(node.chromeNodeId);
      await chrome.bookmarks.update(node.chromeNodeId, { title: node.title }).catch(() => {});
      if (node.parentChromeNodeId) {
        await chrome.bookmarks.move(node.chromeNodeId, {
          parentId: node.parentChromeNodeId,
        }).catch(() => {});
      }
    }
    return;
  }

  if (delta.mutationType === "create" && !node.chromeNodeId && node.external) {
    const created = await chrome.bookmarks.create({
      parentId: node.parentChromeNodeId || connection.chromeRootId,
      title: node.title,
      url: node.external.url,
    });
    suppressBookmarkEvent(created.id);
    return;
  }

  if (node.chromeNodeId && node.external) {
    suppressBookmarkEvent(node.chromeNodeId);
    await chrome.bookmarks.update(node.chromeNodeId, {
      title: node.title,
      url: node.external.url,
    }).catch(() => {});
    if (node.parentChromeNodeId) {
      await chrome.bookmarks.move(node.chromeNodeId, {
        parentId: node.parentChromeNodeId,
      }).catch(() => {});
    }
  }
}

async function runPullSync() {
  const config = await getConfig();
  const { connection } = await resolveActiveConnection(config);
  if (!connection) return;
  const cursorKey = `cursor:${connection.id}`;
  const state = await chrome.storage.local.get(cursorKey);
  const data = await pullDeltas(connection.id, state[cursorKey]);
  for (const delta of data.deltas || []) {
    await applyDelta(connection, delta);
  }
  await chrome.storage.local.set({ [cursorKey]: data.cursor });
}

async function quickSaveCurrentTab(payload = {}) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    throw new Error("No active tab to save");
  }
  const config = await getConfig();
  const { connection } = await resolveConnection(config, payload.connectionId || "");
  if (!connection) {
    throw new Error("No synced browser-bookmark connection is available");
  }

  const activeTabMetadata = await captureActiveTabMetadata(tab.url);
  const existingMatches = await findSyncedBookmarksForUrl(tab.url, connection.id);
  const bookmarkTitle = payload.title || tab.title || tab.url;
  const captureMetadata = {
    source: "enhanced-save",
    tabId: activeTabMetadata.tabId,
    pageTitle: activeTabMetadata.pageTitle,
    screenshotDataUrl: activeTabMetadata.screenshotDataUrl,
    capturedAt: new Date().toISOString(),
  };

  if (existingMatches.length > 0) {
    const existing = existingMatches[0].bookmark;
    if (existing.title !== bookmarkTitle) {
      suppressBookmarkEvent(existing.id);
      await chrome.bookmarks.update(existing.id, {
        title: bookmarkTitle,
      });
    }

    const syncResult = await pushMutations(connection.id, [
      {
        mutationType: "update",
        nodeKind: "bookmark",
        contentType: "external",
        payloadShape: "external-reference-v1",
        sourceSystem: "browser",
        observedAt: new Date().toISOString(),
        connectionId: connection.id,
        routingMode: payload.bypassRules ? "explicit" : "rule-engine",
        chromeNodeId: existing.id,
        parentChromeNodeId: existing.parentId || connection.chromeRootId,
        title: bookmarkTitle,
        url: tab.url,
        faviconUrl: activeTabMetadata.faviconUrl,
        description: payload.description || null,
        resourceType: payload.resourceType || null,
        resourceRelationship: payload.resourceRelationship || null,
        userIntent: payload.userIntent || null,
        dedupeEnabled:
          payload.dedupeEnabled !== undefined
            ? payload.dedupeEnabled
            : Boolean(config.defaults.dedupeEnabled),
        preserveHtml:
          payload.preserveHtml !== undefined
            ? payload.preserveHtml
            : Boolean(config.defaults.preserveHtml),
        captureMetadata: {
          ...captureMetadata,
          existingBookmarkIds: existingMatches.map((match) => match.bookmark.id),
        },
      },
    ]);

    await clearQuickSaveDraft(tab.url);
    await notifyOverlayTabs({
      reason: "quick-save-updated",
      url: tab.url,
      normalizedUrl: normalizeComparableUrl(tab.url),
      connectionId: connection.id,
      contentId: syncResult.results?.[0]?.contentId || null,
    });

    return {
      ...existing,
      action: "updated-existing",
      duplicateCount: existingMatches.length,
      contentId: syncResult.results?.[0]?.contentId || null,
    };
  }

  const bookmark = await chrome.bookmarks.create({
    parentId: connection.chromeRootId,
    title: bookmarkTitle,
    url: tab.url,
  });
  suppressBookmarkEvent(bookmark.id);

  const syncResult = await pushMutations(connection.id, [
    {
      mutationType: "create",
      nodeKind: "bookmark",
      contentType: "external",
      payloadShape: "external-reference-v1",
      sourceSystem: "browser",
      observedAt: new Date().toISOString(),
      connectionId: connection.id,
      routingMode: payload.bypassRules ? "explicit" : "rule-engine",
      chromeNodeId: bookmark.id,
      parentChromeNodeId: connection.chromeRootId,
      title: bookmarkTitle,
      url: tab.url,
      faviconUrl: activeTabMetadata.faviconUrl,
      description: payload.description || null,
      resourceType: payload.resourceType || null,
      resourceRelationship: payload.resourceRelationship || null,
      userIntent: payload.userIntent || null,
      dedupeEnabled:
        payload.dedupeEnabled !== undefined
          ? payload.dedupeEnabled
          : Boolean(config.defaults.dedupeEnabled),
      preserveHtml:
        payload.preserveHtml !== undefined
          ? payload.preserveHtml
          : Boolean(config.defaults.preserveHtml),
      captureMetadata,
    },
  ]);

  await clearQuickSaveDraft(tab.url);
  await notifyOverlayTabs({
    reason: "quick-save-created",
    url: tab.url,
    normalizedUrl: normalizeComparableUrl(tab.url),
    connectionId: connection.id,
    contentId: syncResult.results?.[0]?.contentId || null,
  });

  return {
    ...bookmark,
    action: "created",
    duplicateCount: 0,
    contentId: syncResult.results?.[0]?.contentId || null,
  };
}

async function removeCurrentTabBookmark() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    throw new Error("No active tab to remove");
  }

  const config = await getConfig();
  const { connection } = await resolveConnection(config);
  if (!connection) {
    throw new Error("No synced browser-bookmark connection is available");
  }

  const matches = await findSyncedBookmarksForUrl(tab.url, connection.id);
  if (matches.length === 0) {
    throw new Error("This page is not bookmarked in the selected Digital Garden connection");
  }

  const mutations = [];
  for (const match of matches) {
    suppressBookmarkEvent(match.bookmark.id);
    await chrome.bookmarks.remove(match.bookmark.id).catch(async () => {
      await chrome.bookmarks.removeTree(match.bookmark.id);
    });
    mutations.push({
      mutationType: "delete",
      nodeKind: "bookmark",
      contentType: "external",
      payloadShape: "external-reference-v1",
      sourceSystem: "browser",
      observedAt: new Date().toISOString(),
      connectionId: match.connection.id,
      routingMode: "explicit",
      chromeNodeId: match.bookmark.id,
      parentChromeNodeId: match.bookmark.parentId || match.connection.chromeRootId,
      title: match.bookmark.title,
      url: match.bookmark.url,
    });
  }

  await pushMutations(connection.id, mutations);
  await clearQuickSaveDraft(tab.url);
  await notifyOverlayTabs({
    reason: "quick-remove",
    url: tab.url,
    normalizedUrl: normalizeComparableUrl(tab.url),
    connectionId: connection.id,
    contentId: null,
  });

  return {
    removedCount: matches.length,
    connectionName: connection.name,
    title: tab.title || tab.url,
  };
}

async function captureCurrentSession(payload = {}) {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const config = await getConfig();
  const { connection } = await resolveActiveConnection(config);
  if (!connection) {
    throw new Error("No synced browser-bookmark connection is available");
  }

  const mutations = [];
  for (const tab of tabs) {
    if (!tab.url) continue;
    const bookmark = await chrome.bookmarks.create({
      parentId: connection.chromeRootId,
      title: tab.title || tab.url,
      url: tab.url,
    });
    suppressBookmarkEvent(bookmark.id);
    mutations.push({
      mutationType: "create",
      nodeKind: "bookmark",
      contentType: "external",
      payloadShape: "external-reference-v1",
      sourceSystem: "browser",
      observedAt: new Date().toISOString(),
      connectionId: connection.id,
      routingMode: payload.bypassRules ? "explicit" : "rule-engine",
      chromeNodeId: bookmark.id,
      parentChromeNodeId: connection.chromeRootId,
      title: tab.title || tab.url,
      url: tab.url,
      description: payload.description || null,
      resourceType: payload.resourceType || null,
      resourceRelationship: payload.resourceRelationship || null,
      userIntent: payload.userIntent || null,
      dedupeEnabled: Boolean(payload.dedupeEnabled),
      preserveHtml: Boolean(payload.preserveHtml),
      captureMetadata: {
        source: "session-capture",
        bypassRules: Boolean(payload.bypassRules),
        capturedAt: new Date().toISOString(),
      },
    });
  }

  await pushMutations(connection.id, mutations);
  return { count: mutations.length };
}

const EMBED_SESSION_CACHE_KEY = "dgEmbedSession";
// Per-tab open-panel descriptors (chrome.storage.session), so notes persist
// across in-tab navigation. One key per tab id; cleared on tab close.
const TAB_PANELS_KEY_PREFIX = "dgTabPanels:";
// Two-minute buffer: refresh before the session actually expires
const EMBED_SESSION_REFRESH_BUFFER_MS = 2 * 60 * 1000;

async function plantEmbedCookie(appBaseUrl, { token, expiresAt, cookieName }) {
  const url = appBaseUrl.replace(/\/$/, "");
  const isSecure = url.startsWith("https://");
  const base = {
    url: `${url}/embed`,
    name: cookieName,
    value: token,
    httpOnly: true,
    secure: isSecure,
    expirationDate: new Date(expiresAt).getTime() / 1000,
    // MUST stay scoped to /embed. Cookies are keyed by (name, domain, path) —
    // at path "/" this short-lived token REPLACES the user's 7-day session
    // cookie set by sign-in, logging them out of the app when it expires.
    // Server-side embed cookie writers (proxy.ts, /embed/auth) enforce the
    // same scoping; /api/* calls from the iframe use the X-Embed-Session
    // header instead, so nothing outside /embed needs this cookie.
    path: "/embed",
  };

  // Attempt 1: SameSite=None (required for cross-site iframe delivery).
  // Chrome allows this without Secure on localhost; some Vivaldi builds reject it
  // with a thrown DOMException (not just a null return). Catch both cases.
  try {
    const result = await chrome.cookies.set({ ...base, sameSite: "no_restriction" });
    if (result) {
      console.log("[DG Bookmarks] Cookie planted (SameSite=None)", {
        name: result.name,
        sameSite: result.sameSite,
        secure: result.secure,
      });
      return;
    }
    console.warn("[DG Bookmarks] SameSite=None cookie returned null, trying Lax fallback");
  } catch (e) {
    console.warn("[DG Bookmarks] SameSite=None cookie threw, trying Lax fallback:", e?.message);
  }

  // Attempt 2: SameSite=Lax fallback. The pre-planted cookie won't be sent in
  // cross-site iframes, but the /embed/auth route passes the token via URL instead,
  // so this cookie is only needed as a same-origin cache after the first auth.
  try {
    const result = await chrome.cookies.set({ ...base, sameSite: "lax" });
    if (result) {
      console.log("[DG Bookmarks] Cookie planted (SameSite=Lax fallback)");
    } else {
      console.warn("[DG Bookmarks] Lax cookie also returned null");
    }
  } catch (e) {
    console.warn("[DG Bookmarks] Lax cookie also threw:", e?.message);
  }
  // Never throw — callers should still get the session token for the auth-URL approach.
}

/**
 * Exchange the bearer token for a short-lived session and plant it as a cookie.
 * Uses chrome.storage.session to cache the session across service worker restarts
 * (MV3 workers wake frequently — this avoids a DB round-trip on each wake).
 */
async function exchangeEmbedSession({ force = false } = {}) {
  const config = await getConfig();
  if (!config.appBaseUrl || !config.token) return null;

  try {
    // Check session cache first. `force` skips it — the 20-min alarm must
    // always mint a fresh session, because at that point the cached token has
    // ~10 min left (> the 2-min buffer) and the NEXT alarm at 40 min lands
    // after its 30-min expiry, leaving a dead-cookie window from minute 30-40.
    const cached = await chrome.storage.session.get(EMBED_SESSION_CACHE_KEY);
    const cachedSession = cached[EMBED_SESSION_CACHE_KEY];
    if (!force && cachedSession?.token && cachedSession?.expiresAt) {
      const msRemaining = new Date(cachedSession.expiresAt).getTime() - Date.now();
      if (msRemaining > EMBED_SESSION_REFRESH_BUFFER_MS) {
        // Still valid — just re-plant the cookie (cheap: no DB, no API call)
        await plantEmbedCookie(config.appBaseUrl, cachedSession);
        return cachedSession;
      }
    }

    // Cache miss or near-expiry — exchange for a fresh session
    const res = await fetch(
      `${config.appBaseUrl}/api/integrations/browser-extension/embed-session`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${config.token}` },
      }
    );
    if (!res.ok) return null;
    const body = await res.json();
    if (!body.success) return null;

    const session = body.data;
    await chrome.storage.session.set({ [EMBED_SESSION_CACHE_KEY]: session });
    await plantEmbedCookie(config.appBaseUrl, session);
    return session;
  } catch (error) {
    console.error("[DG Bookmarks] Embed session exchange failed", error);
    return null;
  }
}

// ─── Read aloud (TTS) ──────────────────────────────────────────
// Session LRU cache of synthesized audio so repeating the same selection reuses
// the bytes instead of re-paying the provider. Best-effort: lives only for the
// service worker's lifetime (MV3 may evict the worker), which still covers
// back-to-back repeats. Mirrors the in-app cache (lib/features/tts/cache.ts).
const TTS_CACHE_MAX = 8;
const ttsCache = new Map(); // key -> { base64, mimeType }

function ttsHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

function ttsCacheGet(key) {
  const value = ttsCache.get(key);
  if (value) {
    ttsCache.delete(key);
    ttsCache.set(key, value); // touch → MRU
  }
  return value;
}

function ttsCachePut(key, value) {
  if (ttsCache.has(key)) ttsCache.delete(key);
  ttsCache.set(key, value);
  while (ttsCache.size > TTS_CACHE_MAX) {
    const oldest = ttsCache.keys().next().value;
    if (oldest === undefined) break;
    ttsCache.delete(oldest);
  }
}

// Binary-safe fetch to the TTS proxy. Unlike apiFetch (which parses JSON), this
// returns raw audio bytes. The key stays server-side — we only ever get audio.
async function fetchSpeechAudio(text) {
  const key = ttsHash(text);
  const cached = ttsCacheGet(key);
  if (cached) return cached;

  const config = await getConfig();
  if (!config.appBaseUrl || !config.token) {
    throw new Error("Extension not connected");
  }
  const url = getApiUrl(
    config.appBaseUrl,
    "/api/integrations/browser-extension/tts",
  );
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw new Error(`TTS request failed (${res.status})`);
  }
  const buffer = await res.arrayBuffer();
  const mimeType = res.headers.get("content-type") || "audio/mpeg";
  const result = { base64: arrayBufferToBase64(buffer), mimeType };
  ttsCachePut(key, result);
  return result;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000; // avoid call-stack limits on String.fromCharCode
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function sendTtsFallback(tabId, text) {
  await chrome.tabs
    .sendMessage(tabId, { type: "dg-tts-fallback", text })
    .catch(() => {});
}

// Read the highlighted selection aloud. Cloud (HD, BYOK) is preferred; offline
// or any cloud failure degrades to the page's Web Speech engine — so the user
// always hears something. Mirrors the in-app fallback policy.
async function readAloudSelection(tabId, selectionText) {
  const text = (selectionText || "").trim();
  if (!text || tabId == null) return;

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    await sendTtsFallback(tabId, text);
    return;
  }
  try {
    const { base64, mimeType } = await fetchSpeechAudio(text);
    await chrome.tabs.sendMessage(tabId, {
      type: "dg-tts-play",
      audioBase64: base64,
      mimeType,
    });
  } catch (error) {
    console.warn(
      "[DG Bookmarks] Cloud TTS failed — falling back to Web Speech:",
      error?.message,
    );
    await sendTtsFallback(tabId, text);
  }
}

const JOB_CAPTURE_TEXT_CAP = 60000;

// "Research job posting" — captures the page's readable text and dispatches
// the job-application workflow through the app (the extension never talks to
// the workflow engine; the app is the hub).
async function researchJobPosting() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) {
    throw new Error("No active tab to research");
  }
  let pageText = "";
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (cap) => (document.body?.innerText || "").slice(0, cap),
      args: [JOB_CAPTURE_TEXT_CAP],
    });
    pageText = injection?.result || "";
  } catch (error) {
    // Restricted pages (chrome://, PDFs) — fall back to URL-only dispatch;
    // the server fetches the page text itself.
    console.warn("[DG Bookmarks] Page text capture failed:", error?.message);
  }
  const response = await apiFetch(
    "/api/integrations/browser-extension/workflow-dispatch",
    {
      method: "POST",
      body: JSON.stringify({
        slug: "job-application",
        input: {
          pageUrl: tab.url,
          pageTitle: tab.title || "",
          ...(pageText ? { pageText } : {}),
        },
      }),
    },
  );
  console.info(
    "[DG Bookmarks] Job research dispatched:",
    response?.data?.runId,
  );
  if (tab.id) {
    await chrome.action.setBadgeText({ text: "▶", tabId: tab.id });
    await chrome.action.setBadgeBackgroundColor({
      color: "#c9a86c",
      tabId: tab.id,
    });
    setTimeout(() => {
      chrome.action.setBadgeText({ text: "", tabId: tab.id }).catch(() => {});
    }, 4000);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.create({
    id: "dg-save-page",
    title: "Save Page to Digital Garden",
    contexts: ["page", "action"],
  });
  chrome.contextMenus.create({
    id: "dg-capture-session",
    title: "Capture Session to Digital Garden",
    contexts: ["action"],
  });
  chrome.contextMenus.create({
    id: "dg-read-aloud",
    title: "Read aloud with Digital Garden",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "dg-research-job",
    title: "Research job posting in Digital Garden",
    contexts: ["page", "action"],
  });
  chrome.contextMenus.create({
    id: "dg-run-workflow",
    title: "Run workflow on this page",
    contexts: ["page", "action"],
  });
  chrome.contextMenus.create({
    id: "dg-run-workflow-selection",
    title: "Run workflow on selection",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "dg-open-ai-chat",
    title: "Ask AI about this page",
    contexts: ["page", "selection", "action"],
  });
  chrome.alarms.create("dg-pull-sync", { periodInMinutes: 5 });
  chrome.alarms.create("dg-embed-session-refresh", { periodInMinutes: 20 });
  chrome.alarms.create(WORKFLOW_BADGE_ALARM, { periodInMinutes: 1 });
  // Plant the initial cookie so the iframe works right away after install/update
  await exchangeEmbedSession();
});

// The panel document holds a Port open while it's alive; a non-null
// `panelPort` therefore means the panel is currently open. Checking it is
// synchronous, so openAiChatPanel can branch without an await (which would
// consume the user gesture that authorizes sidePanel.open).
let panelPort = null;
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "dg-panel") return;
  panelPort = port;
  port.onDisconnect.addListener(() => {
    if (panelPort === port) panelPort = null;
  });
});

// Open the side panel on the Chat view for `tab` — or, if the panel is already
// open, switch it to Chat in place. Re-calling sidePanel.open() on an open
// panel TOGGLES it shut (the API is not idempotent and has no isOpen()), so we
// use the port as an open-state signal and never re-open.
function openAiChatPanel(tab) {
  if (panelPort) {
    try {
      // Panel already open: switch to Chat + start a new page-chat in place.
      panelPort.postMessage({ type: "show-chat", intent: "ask-about-page" });
      return;
    } catch {
      // Port went stale before onDisconnect fired — fall through and open.
      panelPort = null;
    }
  }
  const target =
    tab?.windowId != null
      ? { windowId: tab.windowId }
      : tab?.id != null
        ? { tabId: tab.id }
        : null;
  if (!target) {
    console.warn("[DG Bookmarks] openAiChatPanel: no tab/window target", tab);
    return;
  }
  // open() MUST be the first call — it is gesture-gated and any prior async
  // extension API can consume the active-gesture flag. The session writes only
  // need to land before the panel boots (two async round-trips away), so they
  // safely follow. dgPanelIntent distinguishes "Ask AI about this page" (start
  // a new chat about the page) from a plain "show the chat view".
  chrome.sidePanel.open(target).catch((error) => {
    console.warn("[DG Bookmarks] sidePanel.open failed", error, target);
  });
  chrome.storage.session
    .set({ dgPanelView: "chat", dgPanelIntent: "ask-about-page" })
    .catch(() => {});
}

// DEV-ONLY co-browse validation harness (Slice 2). Toggles a CDP session on the
// active tab from a keyboard command — an extension-trust gesture a page can't
// synthesize — so we can eyeball the D-BANNER lifecycle (attach → infobar → Stop
// → gone) before the trust-gated app-side trigger lands in Slice 5. Remove before
// the Phase 2b PR; the real trigger routes via the panel-bridge, not this.
async function toggleCoBrowseDev(tab) {
  const tabId = tab?.id;
  if (typeof tabId !== "number") return;
  try {
    if (cobrowse.isAttached(tabId)) {
      await cobrowse.detach();
      console.info("[DG cobrowse] dev toggle → detached", tabId);
    } else {
      await cobrowse.attach(tabId);
      console.info("[DG cobrowse] dev toggle → attached; banner should now show", tabId);
    }
  } catch (error) {
    console.warn("[DG cobrowse] dev toggle failed", error);
  }
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "open-ai-chat") openAiChatPanel(tab);
  if (command === "toggle-cobrowse-dev") toggleCoBrowseDev(tab);
});

// DEV-ONLY co-browse console harness (Slice 2/3). Call from the service-worker
// console: `await self.__dgCobrowse.attach()` (active tab) → `await
// self.__dgCobrowse.snapshot()` → `self.__dgCobrowse.detach()`. Remove before
// the Phase 2b PR; the real path routes via the trust-gated panel-bridge.
self.__dgCobrowse = {
  attach: async (tabId) => {
    if (typeof tabId !== "number") {
      const tabs = await chrome.tabs.query({ active: true });
      tabId = (tabs.find((t) => /^https?:/.test(t.url || "")) || tabs[0])?.id;
    }
    return cobrowse.attach(tabId);
  },
  detach: () => cobrowse.detach(),
  status: () => cobrowse.getSession(),
  snapshot: () => cobrowse.getA11ySnapshot(),
  click: (role, name, nth) => cobrowse.click({ role, name, nth }),
  hover: (role, name, nth) => cobrowse.hover({ role, name, nth }),
  type: (role, name, text, nth) => cobrowse.type({ role, name, nth }, text),
};

// sidePanel.open() must be called from a SYNCHRONOUS gesture handler — an
// async listener returns a promise immediately and Chrome no longer treats
// the call as gesture-initiated (the panel silently fails to open / closes).
// So AI-chat opening gets its own non-async listener; the other items keep
// the async handler below.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "dg-open-ai-chat") openAiChatPanel(tab);
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  try {
    if (info.menuItemId === "dg-save-page") {
      await quickSaveCurrentTab({});
    }
    if (info.menuItemId === "dg-capture-session") {
      await captureCurrentSession({});
    }
    if (info.menuItemId === "dg-read-aloud") {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      await readAloudSelection(tab?.id, info.selectionText);
    }
    if (info.menuItemId === "dg-research-job") {
      await researchJobPosting();
    }
    if (info.menuItemId === "dg-run-workflow") {
      await dispatchWorkflowAutoRoute();
    }
    if (info.menuItemId === "dg-run-workflow-selection") {
      await dispatchWorkflowAutoRoute(info.selectionText);
    }
  } catch (error) {
    console.error("[DG Bookmarks] Context menu failed", error);
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "dg-pull-sync") {
    await runPullSync().catch((error) => {
      console.error("[DG Bookmarks] Pull sync failed", error);
    });
  }
  if (alarm.name === "dg-embed-session-refresh") {
    await exchangeEmbedSession({ force: true }).catch((error) => {
      console.error("[DG Bookmarks] Embed session refresh failed", error);
    });
  }
  if (alarm.name === WORKFLOW_BADGE_ALARM) {
    await refreshWorkflowBadge();
  }
});

chrome.bookmarks.onCreated.addListener((id, bookmark) => {
  handleNativeBookmarkCreated(id, bookmark).catch((error) => {
    console.error("[DG Bookmarks] onCreated failed", error);
  });
});

chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
  handleBookmarkChanged(id, changeInfo).catch((error) => {
    console.error("[DG Bookmarks] onChanged failed", error);
  });
});

chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
  handleBookmarkMoved(id, moveInfo).catch((error) => {
    console.error("[DG Bookmarks] onMoved failed", error);
  });
});

chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
  handleBookmarkRemoved(id, removeInfo).catch((error) => {
    console.error("[DG Bookmarks] onRemoved failed", error);
  });
});

// ── MRU tab tracking ─────────────────────────────────────────────────────────
// Ordered most-recent-first. Ephemeral (service-worker memory only) — resets
// on MV3 restart, self-populates as the user browses. Only tabs the user
// explicitly activates/focuses are tracked; background/preloaded tabs are not.
const MRU_TABS_MAX = 10;
const mruTabs = [];

function isIneligibleMruUrl(url) {
  if (!url) return true;
  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("about:") ||
    url.startsWith("edge://") ||
    url.startsWith("vivaldi://")
  );
}

function updateMruTab(tabId, tab) {
  if (!tab?.url || isIneligibleMruUrl(tab.url)) return;
  const idx = mruTabs.findIndex((t) => t.tabId === tabId);
  if (idx !== -1) mruTabs.splice(idx, 1);
  mruTabs.unshift({
    tabId,
    title: tab.title || "",
    favIconUrl: tab.favIconUrl || null,
    url: tab.url,
    lastViewedAt: new Date().toISOString(),
  });
  if (mruTabs.length > MRU_TABS_MAX) mruTabs.length = MRU_TABS_MAX;
}

function pruneMruTab(tabId) {
  const idx = mruTabs.findIndex((t) => t.tabId === tabId);
  if (idx !== -1) mruTabs.splice(idx, 1);
}

// ── Persisted page history (BROWSER-REACH B3-B, Phase C) ─────────────────────
// A capped, deduped "pages you visited" log that SURVIVES service-worker
// restarts (unlike mruTabs). Stored only in chrome.storage.local — it never
// reaches the server and never becomes a ContentNode. Gated by the navHistory
// killswitch and the same record-time safety guards as auto-associate, so a
// page the user has blacklisted is never even written to disk.
const PAGE_HISTORY_MAX = 250;

function safeOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

// Cheap substring denylist check — the extension can't import the shared TS
// capture-policy module (the build is walled off), so record-time keeps the
// structural guards here and the panel applies the full policy at display.
function matchesCaptureDenylist(url, denylist) {
  if (!Array.isArray(denylist) || denylist.length === 0) return false;
  const lower = String(url).toLowerCase();
  return denylist.some((raw) => {
    const entry = String(raw).trim().toLowerCase();
    return entry.length > 0 && lower.includes(entry);
  });
}

async function getPageHistory() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.pageHistory);
  const stored = result[STORAGE_KEYS.pageHistory];
  return Array.isArray(stored) ? stored : [];
}

async function recordPageView(tab) {
  if (!tab?.url || isIneligibleMruUrl(tab.url)) return;
  const config = await getConfig();
  const capture = config.capture || {};
  if (capture.navHistory === false) return; // user turned history off
  // Never record Digital Garden's own pages as "external" viewership.
  const appOrigin = safeOrigin(config.appBaseUrl);
  if (appOrigin && safeOrigin(tab.url) === appOrigin) return;
  // Honor the user denylist at record time — blacklisted pages never touch disk.
  if (matchesCaptureDenylist(tab.url, capture.denylist)) return;

  const normalizedUrl = normalizeComparableUrl(tab.url);
  if (!normalizedUrl) return;

  const history = await getPageHistory();
  const existingIdx = history.findIndex((h) => h.normalizedUrl === normalizedUrl);
  const firstViewedAt =
    existingIdx !== -1 ? history[existingIdx].firstViewedAt : new Date().toISOString();
  const viewCount =
    existingIdx !== -1 ? (history[existingIdx].viewCount || 1) + 1 : 1;
  if (existingIdx !== -1) history.splice(existingIdx, 1);
  history.unshift({
    url: tab.url,
    normalizedUrl,
    title: tab.title || "",
    favIconUrl: tab.favIconUrl || null,
    firstViewedAt,
    lastViewedAt: new Date().toISOString(),
    viewCount,
  });
  if (history.length > PAGE_HISTORY_MAX) history.length = PAGE_HISTORY_MAX;
  await chrome.storage.local.set({ [STORAGE_KEYS.pageHistory]: history });
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab?.url) return;
    void updateTabBadge(tabId, tab.url);
    updateMruTab(tabId, tab);
    void recordPageView(tab);
  });
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  chrome.tabs.query({ active: true, windowId }, ([tab]) => {
    if (chrome.runtime.lastError || !tab) return;
    updateMruTab(tab.id, tab);
    void recordPageView(tab);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab?.url) {
    void updateTabBadge(tabId, tab.url);
    // Only the tab the user is actually looking at counts as a page view;
    // background tabs finishing their load do not.
    if (tab.active) void recordPageView(tab);
  }
});

// Drop a tab's sticky open-panel descriptors when it closes, so a later tab
// that reuses the id starts clean.
chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove(`${TAB_PANELS_KEY_PREFIX}${tabId}`);
  pruneMruTab(tabId);
});

// ── Acquisition providers (BROWSER-REACH B5) ─────────────────────────────────
// The extension is a *remote provider* for the app-side Acquisition Service: it
// fetches a URL with the user's own session (cookies / JS rendering) that a
// server-side fetch can't reach, and returns RAW material only. The server
// builds the trusted AcquiredContent envelope — the extension never asserts
// trust or provenance (it's untrusted input).
//   P2 sw-fetch    — credentialed background fetch → raw HTML (server extracts).
//   P3 session-tab — inactive tab + injected reader → readable extraction.
// Every request clears a local policy gate first (SSRF/private-network block is
// non-negotiable; the app-issued deny list + a per-window budget ride on top)
// and shows a brief activity badge, so an automated fetch is never silent.

const ACQUISITION_WINDOW_MS = 5 * 60 * 1000;
const ACQUISITION_DEFAULT_MAX_PAGES = 10;
const ACQUISITION_MAX_HTML_CHARS = 1_500_000;
const ACQUISITION_TAB_LOAD_TIMEOUT_MS = 20_000;
const ACQUISITION_TAB_SETTLE_MS = 1_500;
const ACQUISITION_EXTRACT_TIMEOUT_MS = 12_000;
// Settle-then-extract: a flat delay guesses wrong on client-rendered pages
// (extract too early → nav/footer chrome only). Instead we poll-extract and
// stop once Readability succeeds or the content length stabilizes (hydration
// finished), capped by a max budget so a hostile page can't hang the read.
const ACQUISITION_SETTLE_MAX_MS = 8_000; // total hydration-poll budget
const ACQUISITION_SETTLE_POLL_MS = 700; // gap between re-extractions
const ACQUISITION_SETTLE_STABLE_DELTA = 48; // chars: "content stopped growing"
const ACQUISITION_SETTLE_MIN_CHARS = 400; // don't call a near-empty page "stable"
const ACCEPTED_ACQUISITION_CONTENT_TYPES = [
  "text/html",
  "application/xhtml",
  "text/plain",
];

// Rolling per-window budget (rate etiquette). Not persisted — a fresh SW starts
// with a clean allowance; the app-issued `maxPages` caps it per 5-min window.
let acquisitionBudget = { used: 0, windowStart: 0 };

function isBlockedAcquisitionHost(hostname) {
  if (!hostname) return true;
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "0.0.0.0" || host === "::1" || host === "[::1]")
    return true;
  if (
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localdomain")
  )
    return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }
  const v6 = host.replace(/^\[|\]$/g, "");
  if (v6 === "::1") return true;
  if (/^f[cd]/.test(v6)) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(v6)) return true; // fe80::/10 link-local
  return false;
}

// Local mirror of the server acquisition policy. The private-network block is
// non-negotiable (no config re-enables it). The deny list + budget are the
// app-issued policy passed on the request.
function evaluateAcquisitionPolicy(url, policy, configDeny) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: "invalid URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { allowed: false, reason: "only http/https URLs can be acquired" };
  }
  if (isBlockedAcquisitionHost(parsed.hostname)) {
    return { allowed: false, reason: "blocked host (private network)" };
  }
  const requestDeny = policy && Array.isArray(policy.deny) ? policy.deny : [];
  // An app-issued deny list wins; otherwise fall back to the user's own capture
  // denylist (B3-B "Never capture these sites") so it governs acquisition too.
  const deny =
    requestDeny.length > 0
      ? requestDeny
      : Array.isArray(configDeny)
        ? configDeny
        : [];
  if (matchesCaptureDenylist(url, deny)) {
    return { allowed: false, reason: "this domain is on your deny list" };
  }
  const maxPages =
    policy && typeof policy.maxPages === "number"
      ? policy.maxPages
      : ACQUISITION_DEFAULT_MAX_PAGES;
  const now = Date.now();
  if (now - acquisitionBudget.windowStart > ACQUISITION_WINDOW_MS) {
    acquisitionBudget = { used: 0, windowStart: now };
  }
  if (acquisitionBudget.used >= maxPages) {
    return {
      allowed: false,
      reason: `acquisition budget reached (${maxPages} per 5 min)`,
    };
  }
  acquisitionBudget.used += 1;
  return { allowed: true };
}

function setAcquisitionBadge(active) {
  try {
    if (active) {
      void chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
      void chrome.action.setBadgeText({ text: "…" });
    } else {
      void chrome.action.setBadgeText({ text: "" });
    }
  } catch {
    // Badge is best-effort.
  }
}

async function acquireViaSwFetch(url) {
  let response;
  try {
    response = await fetch(url, { credentials: "include", redirect: "follow" });
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "fetch failed",
    };
  }
  if (!response.ok) {
    return { ok: false, reason: `fetch failed (${response.status})` };
  }
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (!ACCEPTED_ACQUISITION_CONTENT_TYPES.some((t) => contentType.includes(t))) {
    return {
      ok: false,
      reason: `unsupported content type: ${contentType || "unknown"}`,
    };
  }
  const rawHtml = (await response.text()).slice(0, ACQUISITION_MAX_HTML_CHARS);
  return { ok: true, mode: "sw-fetch", url, finalUrl: response.url || url, rawHtml };
}

function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn) => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
      fn();
    };
    const onUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        finish(resolve);
      }
    };
    const timer = setTimeout(
      () => finish(() => reject(new Error("page load timed out"))),
      timeoutMs
    );
    chrome.tabs.onUpdated.addListener(onUpdated);
    // Guard: the tab may already be "complete" before the listener attached.
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) return;
      if (tab && tab.status === "complete") finish(resolve);
    });
  });
}

function sendTabExtract(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error("extraction timed out"));
    }, timeoutMs);
    chrome.tabs.sendMessage(
      tabId,
      { type: "dg-extract-content", scope: "full" },
      (response) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!response || !response.ok) {
          reject(new Error(response?.error || "extraction failed"));
        } else {
          resolve(response.data);
        }
      }
    );
  });
}

// Extract from a tab, injecting the lightweight reader on demand if nothing is
// listening yet (mirrors the panel host's sendExtractWithInjectFallback). Avoids
// a redundant listener when the overlay content script already handles it.
async function extractFromTabWithInjectFallback(tabId) {
  try {
    return await sendTabExtract(tabId, ACQUISITION_EXTRACT_TIMEOUT_MS);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (
      /receiving end does not exist|could not establish connection/i.test(msg) &&
      chrome.scripting
    ) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["dist/reader.js"],
      });
      return await sendTabExtract(tabId, ACQUISITION_EXTRACT_TIMEOUT_MS);
    }
    throw error;
  }
}

// Poll-extract until the page has hydrated. A flat delay guesses wrong on
// client-rendered pages — extract too early and you photograph nav/footer
// chrome before the main content renders. Instead we re-extract on an interval
// and stop as soon as Readability finds an article, or the extracted content
// length stabilizes (hydration done), capped by ACQUISITION_SETTLE_MAX_MS.
// The page-side extractor stays synchronous; the polling lives here.
async function settleAndExtract(tabId) {
  const deadline = Date.now() + ACQUISITION_SETTLE_MAX_MS;
  // A small initial grace so first paint / hydration can begin before we look.
  await new Promise((r) => setTimeout(r, ACQUISITION_TAB_SETTLE_MS));
  let best = null;
  let lastLen = -1;
  let stable = 0;
  while (Date.now() < deadline) {
    let extracted = null;
    try {
      extracted = await extractFromTabWithInjectFallback(tabId);
    } catch {
      // The page may still be navigating/hydrating; retry after the poll gap.
    }
    if (extracted) {
      // Readability found a real article — the best we can do, stop now.
      if (extracted.quality === "readable" && (extracted.content?.length || 0) > 0) {
        return extracted;
      }
      const len = extracted.content?.length || 0;
      if (!best || len > (best.content?.length || 0)) best = extracted;
      // Content stopped growing across two polls → treat hydration as done.
      if (
        len >= ACQUISITION_SETTLE_MIN_CHARS &&
        Math.abs(len - lastLen) <= ACQUISITION_SETTLE_STABLE_DELTA
      ) {
        if (++stable >= 2) return best;
      } else {
        stable = 0;
      }
      lastLen = len;
    }
    await new Promise((r) => setTimeout(r, ACQUISITION_SETTLE_POLL_MS));
  }
  // Budget exhausted: return the best we saw, or make one final attempt so a
  // genuine extraction failure still surfaces its real error to the caller.
  return best ?? (await extractFromTabWithInjectFallback(tabId));
}

async function acquireViaSessionTab(url, visible = false) {
  let tab;
  try {
    // A VISIBLE (foreground) tab clears many soft bot-blocks a background tab
    // can't — used by the read-completion launcher (gated in handleAcquireUrl).
    tab = await chrome.tabs.create({ url, active: !!visible });
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "couldn't open a tab",
    };
  }
  const tabId = tab.id;
  try {
    await waitForTabComplete(tabId, ACQUISITION_TAB_LOAD_TIMEOUT_MS);
    // Poll-extract until the page hydrates (see settleAndExtract) rather than a
    // flat delay + single shot, which photographed client-rendered pages before
    // their main content rendered (returned nav/footer chrome only).
    const extracted = await settleAndExtract(tabId);
    let finalUrl = url;
    try {
      const current = await chrome.tabs.get(tabId);
      if (current && current.url) finalUrl = current.url;
    } catch {
      // keep the request URL
    }
    return { ok: true, mode: "session-tab", url, finalUrl, extracted };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "session extraction failed",
    };
  } finally {
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      // tab may already be gone
    }
  }
}

async function handleAcquireUrl(payload) {
  const url = payload && payload.url;
  const mode = payload && payload.mode === "sw-fetch" ? "sw-fetch" : "session-tab";
  if (!url) return { ok: false, reason: "no url provided" };
  const config = await getConfig();
  // Read-completion launcher: a VISIBLE foreground tab is only opened when the
  // user has turned it on in Browser Bookmarks settings (standing consent). The
  // SSRF / private-network / denylist policy gate below still runs either way —
  // `visible` only changes how the tab opens, never whether the URL is allowed.
  const visible = payload && payload.visible === true;
  if (
    visible &&
    !(config.capture && config.capture.allowTabLaunch === true)
  ) {
    return {
      ok: false,
      reason:
        "Opening a tab to read blocked pages is turned off. Turn on \"Open a tab to read blocked pages\" in Browser Bookmarks settings → Capture & privacy to allow it.",
    };
  }
  const configDeny =
    config.capture && Array.isArray(config.capture.denylist)
      ? config.capture.denylist
      : [];
  const decision = evaluateAcquisitionPolicy(url, payload && payload.policy, configDeny);
  if (!decision.allowed) return { ok: false, reason: decision.reason };
  setAcquisitionBadge(true);
  try {
    return mode === "sw-fetch"
      ? await acquireViaSwFetch(url)
      : await acquireViaSessionTab(url, visible);
  } finally {
    setAcquisitionBadge(false);
  }
}

// Agentic co-browse: when a CDP session ends for ANY reason — the user clicking
// "Cancel" on Chrome's debugging infobar (D-BANNER's Stop), the tab closing, or
// devtools taking the target — broadcast it so any open app surface can drop its
// co-browse indicator. Best-effort: sendMessage rejects when nobody's listening.
cobrowse.setSessionEndHandler((reason, tabId) => {
  console.info("[DG cobrowse] session ended", reason, tabId);
  chrome.runtime
    .sendMessage({ type: "cobrowse-session-ended", payload: { reason, tabId } })
    .catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // sidePanel.open() must run before any await or the user-gesture context
  // that authorized it (launcher click → this message) is lost. Handle it
  // synchronously, outside the async IIFE below.
  if (message.type === "open-side-panel") {
    const tabId = sender?.tab?.id;
    const windowId = sender?.tab?.windowId;
    // Open the GLOBAL panel by windowId — opening a manifest-global panel by
    // tabId toggles/collapses it (learned in B2's chat-panel work); windowId
    // reveals it for the whole window. tabId is only a last resort.
    const target = windowId != null ? { windowId } : { tabId };
    chrome.sidePanel
      .open(target)
      .then(() => sendResponse({ ok: true, data: true }))
      .catch((error) => {
        console.warn("[DG Bookmarks] open-side-panel failed", error, target);
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Failed to open side panel",
        });
      });
    return true;
  }

  (async () => {
    if (message.type === "get-config") {
      sendResponse({ ok: true, data: await getConfig() });
      return;
    }

    // ── Agentic co-browse (Phase 2b) — raw CDP executor lifecycle ──────────
    // Semantic operations only (attach/detach/status/navigate); there is NO
    // generic "run any CDP command" passthrough reachable from a page message —
    // each capability is its own validated handler (later slices add snapshot,
    // click, scroll as their own types). The debuggee defaults to the SENDER's
    // tab; an explicit payload.tabId lets the panel drive another tab.
    if (message.type === "cobrowse-attach") {
      try {
        const tabId = message.payload?.tabId ?? sender.tab?.id;
        sendResponse({ ok: true, data: await cobrowse.attach(tabId) });
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : "attach failed" });
      }
      return;
    }
    if (message.type === "cobrowse-detach") {
      sendResponse({ ok: true, data: await cobrowse.detach() });
      return;
    }
    if (message.type === "cobrowse-status") {
      sendResponse({ ok: true, data: { session: cobrowse.getSession() } });
      return;
    }
    if (message.type === "cobrowse-navigate") {
      try {
        const url = message.payload?.url;
        if (!url) {
          sendResponse({ ok: false, error: "no url provided" });
          return;
        }
        // Same SSRF / private-network / denylist gate reads run — `Page.navigate`
        // must not become an open redirect into internal hosts.
        const config = await getConfig();
        const configDeny =
          config.capture && Array.isArray(config.capture.denylist) ? config.capture.denylist : [];
        const decision = evaluateAcquisitionPolicy(url, message.payload?.policy, configDeny);
        if (!decision.allowed) {
          sendResponse({ ok: false, error: decision.reason });
          return;
        }
        sendResponse({ ok: true, data: await cobrowse.send("Page.navigate", { url }) });
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : "navigate failed" });
      }
      return;
    }
    if (message.type === "cobrowse-snapshot") {
      try {
        sendResponse({ ok: true, data: { nodes: await cobrowse.getA11ySnapshot() } });
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : "snapshot failed" });
      }
      return;
    }
    if (message.type === "cobrowse-click") {
      try {
        sendResponse({ ok: true, data: await cobrowse.click(message.payload || {}) });
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : "click failed" });
      }
      return;
    }
    if (message.type === "cobrowse-hover") {
      try {
        sendResponse({ ok: true, data: await cobrowse.hover(message.payload || {}) });
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : "hover failed" });
      }
      return;
    }
    if (message.type === "cobrowse-type") {
      try {
        const { text, ...target } = message.payload || {};
        sendResponse({ ok: true, data: await cobrowse.type(target, text) });
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : "type failed" });
      }
      return;
    }
    // Tab-scoped open-panel persistence: notes stay open as the user navigates
    // within a tab. Keyed by the SENDER's tab id (derived here, not trusted from
    // the content script) in chrome.storage.session so it survives navigation
    // and clears on browser restart. See tabs.onRemoved cleanup below.
    if (message.type === "save-tab-panels") {
      const tabId = sender.tab?.id;
      if (tabId != null) {
        await chrome.storage.session.set({
          [`${TAB_PANELS_KEY_PREFIX}${tabId}`]: message.payload?.panels ?? [],
        });
      }
      sendResponse({ ok: true, data: true });
      return;
    }
    if (message.type === "get-tab-panels") {
      const tabId = sender.tab?.id;
      let panels = [];
      if (tabId != null) {
        const key = `${TAB_PANELS_KEY_PREFIX}${tabId}`;
        const stored = await chrome.storage.session.get(key);
        if (Array.isArray(stored[key])) panels = stored[key];
      }
      sendResponse({ ok: true, data: panels });
      return;
    }
    if (message.type === "get-extension-context") {
      sendResponse({ ok: true, data: await getExtensionContext() });
      return;
    }
    if (message.type === "save-config") {
      sendResponse({ ok: true, data: await saveConfig(message.payload) });
      // Invalidate session cache so the new token/URL is used immediately
      chrome.storage.session.remove(EMBED_SESSION_CACHE_KEY);
      exchangeEmbedSession().catch(() => {});
      return;
    }
    if (message.type === "refresh-embed-session") {
      sendResponse({ ok: true, data: await exchangeEmbedSession() });
      return;
    }
    if (message.type === "save-trusted-install") {
      sendResponse({ ok: true, data: await saveTrustedInstall(message.payload) });
      return;
    }
    if (message.type === "clear-trusted-install") {
      sendResponse({ ok: true, data: await clearTrustedInstall() });
      return;
    }
    if (message.type === "fetch-connections") {
      sendResponse({ ok: true, data: await fetchConnections() });
      return;
    }
    if (message.type === "fetch-workspaces") {
      sendResponse({ ok: true, data: await fetchWorkspaces() });
      return;
    }
    if (message.type === "fetch-bookmark-preferences") {
      sendResponse({ ok: true, data: await fetchBookmarkPreferences() });
      return;
    }
    if (message.type === "save-bookmark-preferences") {
      sendResponse({ ok: true, data: await saveBookmarkPreferences(message.payload || {}) });
      return;
    }
    if (message.type === "save-quick-save-draft") {
      sendResponse({
        ok: true,
        data: await saveQuickSaveDraft(message.payload?.url, message.payload?.draft || {}),
      });
      return;
    }
    if (message.type === "get-current-tab-sync-state") {
      sendResponse({ ok: true, data: await getCurrentTabSyncState() });
      return;
    }
    if (message.type === "show-tree-panel") {
      sendResponse({ ok: true, data: await showTreePanelInActiveTab() });
      return;
    }
    if (message.type === "start-quick-capture") {
      sendResponse({ ok: true, data: await startQuickCaptureInActiveTab() });
      return;
    }
    if (message.type === "open-content-in-active-tab") {
      sendResponse({
        ok: true,
        data: await openContentInActiveTab(
          message.payload?.contentId,
          message.payload?.contentKind || "external",
          message.payload?.runId,
          message.payload?.corner
        ),
      });
      return;
    }
    if (message.type === "list-workflows") {
      sendResponse({ ok: true, data: await listWorkflowsForActiveTab() });
      return;
    }
    if (message.type === "dispatch-workflow") {
      sendResponse({
        ok: true,
        data: await dispatchWorkflowForActiveTab(message.payload),
      });
      return;
    }
    if (message.type === "get-workflow-run") {
      sendResponse({
        ok: true,
        data: await getWorkflowRun(message.payload?.runId),
      });
      return;
    }
    if (message.type === "list-workflow-runs") {
      sendResponse({
        ok: true,
        data: await listWorkflowRuns(message.payload?.limit),
      });
      return;
    }
    if (message.type === "fetch-extension-note-content") {
      sendResponse({ ok: true, data: await fetchExtensionNoteContent(message.contentId) });
      return;
    }
    if (message.type === "save-extension-note-content") {
      sendResponse({
        ok: true,
        data: await saveExtensionNoteContent(message.contentId, message.payload || {}),
      });
      return;
    }
    if (message.type === "fetch-extension-external-content") {
      sendResponse({ ok: true, data: await fetchExtensionExternalContent(message.contentId) });
      return;
    }
    if (message.type === "save-extension-external-content") {
      sendResponse({
        ok: true,
        data: await saveExtensionExternalContent(message.contentId, message.payload || {}),
      });
      return;
    }
    if (message.type === "quick-save") {
      const result = await quickSaveCurrentTab(message.payload || {});
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.url) {
        await clearCachedUrlAssociation(activeTab.url);
        void updateTabBadge(activeTab.id, activeTab.url);
      }
      sendResponse({ ok: true, data: result });
      return;
    }
    if (message.type === "remove-current-tab") {
      const result = await removeCurrentTabBookmark();
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.url) {
        await clearCachedUrlAssociation(activeTab.url);
        void updateTabBadge(activeTab.id, activeTab.url);
      }
      sendResponse({ ok: true, data: result });
      return;
    }
    if (message.type === "capture-session") {
      sendResponse({ ok: true, data: await captureCurrentSession(message.payload || {}) });
      return;
    }
    if (message.type === "bootstrap-connection") {
      sendResponse({ ok: true, data: await bootstrapConnection(message.connectionId) });
      return;
    }
    if (message.type === "fetch-bookmark-tree") {
      sendResponse({ ok: true, data: await fetchBookmarkTree() });
      return;
    }
    if (message.type === "fetch-resource-context") {
      sendResponse({ ok: true, data: await fetchResourceContext(message.payload || {}) });
      return;
    }
    if (message.type === "fetch-content-picker-tree") {
      sendResponse({ ok: true, data: await fetchContentPickerTree(message.payload?.workspaceId || null) });
      return;
    }
    if (message.type === "create-content-picker-item") {
      sendResponse({ ok: true, data: await createContentPickerItem(message.payload || {}) });
      return;
    }
    if (message.type === "create-resource-association") {
      sendResponse({ ok: true, data: await createResourceAssociation(message.payload || {}) });
      return;
    }
    if (message.type === "delete-resource-association") {
      sendResponse({ ok: true, data: await deleteResourceAssociation(message.payload || {}) });
      return;
    }
    if (message.type === "fetch-domain-associations") {
      sendResponse({ ok: true, data: await fetchDomainAssociations(message.url, message.excludeResourceId || null) });
      return;
    }
    if (message.type === "fetch-flashcard-decks") {
      sendResponse({ ok: true, data: await fetchFlashcardDecks() });
      return;
    }
    if (message.type === "create-flashcard") {
      sendResponse({ ok: true, data: await createFlashcard(message.payload || {}) });
      return;
    }
    if (message.type === "save-overlay-view-state") {
      sendResponse({ ok: true, data: await saveOverlayViewState(message.payload || {}) });
      return;
    }
    if (message.type === "export-rules") {
      const config = await getConfig();
      sendResponse({
        ok: true,
        data: {
          version: 1,
          exportedAt: new Date().toISOString(),
          nativeSaveBehavior: config.nativeSaveBehavior,
          defaults: config.defaults,
          dedupeDefaults: { dedupeEnabled: config.defaults.dedupeEnabled },
          routingRules: config.rules,
          connections: [],
        },
      });
      return;
    }
    if (message.type === "import-rules") {
      const config = await getConfig();
      const next = {
        ...config,
        nativeSaveBehavior:
          message.payload.nativeSaveBehavior || config.nativeSaveBehavior,
        defaults: message.payload.defaults || config.defaults,
        rules: message.payload.routingRules || [],
      };
      await saveConfig(next);
      sendResponse({ ok: true, data: next });
      return;
    }
    if (message.type === "get-url-preset") {
      const { presetMap, overrides } = await loadUrlPresets();
      const preset = resolvePreset(message.url, presetMap, overrides);
      sendResponse({ ok: true, data: preset });
      return;
    }
    if (message.type === "get-url-strategy-overrides") {
      sendResponse({ ok: true, data: await getStrategyOverrides() });
      return;
    }
    if (message.type === "set-url-strategy-override") {
      const result = await setStrategyOverride(message.hostname, message.config ?? null);
      sendResponse({ ok: true, data: result });
      return;
    }
    if (message.type === "get-recent-viewed-tabs") {
      const config = await getConfig();
      const appOrigin = config.appBaseUrl
        ? (() => { try { return new URL(config.appBaseUrl).origin; } catch { return null; } })()
        : null;
      const tabs = mruTabs.filter((t) => {
        if (!appOrigin) return true;
        try { return new URL(t.url).origin !== appOrigin; } catch { return true; }
      });
      sendResponse({ ok: true, data: tabs });
      return;
    }

    if (message.type === "send-note-to-tabs") {
      const { contentId, contentKind = "note", tabIds = [] } = message.payload || {};
      const results = await Promise.all(
        tabIds.map(async (tabId) => {
          const entry = mruTabs.find((t) => t.tabId === tabId);
          try {
            await new Promise((resolve, reject) => {
              chrome.tabs.sendMessage(
                tabId,
                { type: "dg-associate-and-open", payload: { contentId, contentKind } },
                (response) => {
                  if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                  } else if (!response?.ok) {
                    reject(new Error(response?.error || "Overlay unavailable"));
                  } else {
                    resolve(response);
                  }
                }
              );
            });
            return { tabId, success: true, title: entry?.title || "" };
          } catch (error) {
            return {
              tabId,
              success: false,
              title: entry?.title || "",
              error: error instanceof Error ? error.message : "Failed",
            };
          }
        })
      );
      sendResponse({ ok: true, data: results });
      return;
    }

    // ── BROWSER-REACH B3-B capture controls (read/write chrome.storage) ──────
    if (message.type === "get-capture-settings") {
      const config = await getConfig();
      const capture = config.capture || {};
      sendResponse({
        ok: true,
        data: {
          autoAssociate: capture.autoAssociate === true,
          navHistory: capture.navHistory !== false,
          denylist: Array.isArray(capture.denylist) ? capture.denylist : [],
          allowTabLaunch: capture.allowTabLaunch === true,
        },
      });
      return;
    }
    if (message.type === "set-capture-settings") {
      const config = await getConfig();
      const prev = config.capture || {};
      const patch = message.payload || {};
      const next = {
        ...config,
        capture: {
          autoAssociate:
            typeof patch.autoAssociate === "boolean"
              ? patch.autoAssociate
              : prev.autoAssociate === true,
          navHistory:
            typeof patch.navHistory === "boolean"
              ? patch.navHistory
              : prev.navHistory !== false,
          denylist: Array.isArray(patch.denylist)
            ? patch.denylist.map((entry) => String(entry).trim()).filter(Boolean)
            : Array.isArray(prev.denylist)
              ? prev.denylist
              : [],
          allowTabLaunch:
            typeof patch.allowTabLaunch === "boolean"
              ? patch.allowTabLaunch
              : prev.allowTabLaunch === true,
        },
      };
      await saveConfig(next);
      sendResponse({ ok: true, data: next.capture });
      return;
    }
    if (message.type === "get-page-history") {
      sendResponse({ ok: true, data: await getPageHistory() });
      return;
    }
    if (message.type === "clear-page-history") {
      await chrome.storage.local.remove(STORAGE_KEYS.pageHistory);
      sendResponse({ ok: true, data: [] });
      return;
    }
    if (message.type === "acquire-url") {
      // The inner result carries its own ok/reason (policy denials, budget,
      // fetch failures); the outer envelope reports message-handling success.
      sendResponse({ ok: true, data: await handleAcquireUrl(message.payload || {}) });
      return;
    }

    // Catch-all — MUST stay last so every real handler above gets first refusal.
    sendResponse({ ok: false, error: "Unknown message type" });
  })().catch((error) => {
    sendResponse({ ok: false, error: error.message || "Unknown error" });
  });

  return true;
});

// Refresh the embed session on every service worker wake-up (MV3 workers are
// short-lived and restart frequently — the alarm alone isn't enough coverage).
exchangeEmbedSession().catch(() => {});
