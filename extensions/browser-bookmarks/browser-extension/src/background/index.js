const STORAGE_KEYS = {
  config: "dgBrowserBookmarksConfig",
  ignore: "dgBrowserBookmarksIgnore",
  install: "dgBrowserBookmarksInstall",
  quickSaveDrafts: "dgBrowserBookmarksQuickSaveDrafts",
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
    const message =
      json?.error?.message ||
      rawBody.trim() ||
      `Request failed: ${path} (${response.status} ${response.statusText})`;
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
      await chrome.action.setBadgeText({ text: "●", tabId });
      await chrome.action.setBadgeBackgroundColor({ color: "#c9a86c", tabId });
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

async function openContentInActiveTab(contentId, contentKind = "external") {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("No active tab is available");
  }

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: "dg-open-associated-content",
      payload: {
        contentId,
        contentKind,
      },
    });
    return { openedInOverlay: true, tabId: tab.id };
  } catch (error) {
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
    url,
    name: cookieName,
    value: token,
    httpOnly: true,
    secure: isSecure,
    expirationDate: new Date(expiresAt).getTime() / 1000,
    path: "/",
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
async function exchangeEmbedSession() {
  const config = await getConfig();
  if (!config.appBaseUrl || !config.token) return null;

  try {
    // Check session cache first
    const cached = await chrome.storage.session.get(EMBED_SESSION_CACHE_KEY);
    const cachedSession = cached[EMBED_SESSION_CACHE_KEY];
    if (cachedSession?.token && cachedSession?.expiresAt) {
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
  chrome.alarms.create("dg-pull-sync", { periodInMinutes: 5 });
  chrome.alarms.create("dg-embed-session-refresh", { periodInMinutes: 20 });
  // Plant the initial cookie so the iframe works right away after install/update
  await exchangeEmbedSession();
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
    await exchangeEmbedSession().catch((error) => {
      console.error("[DG Bookmarks] Embed session refresh failed", error);
    });
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

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab?.url) return;
    void updateTabBadge(tabId, tab.url);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab?.url) {
    void updateTabBadge(tabId, tab.url);
  }
});

// Drop a tab's sticky open-panel descriptors when it closes, so a later tab
// that reuses the id starts clean.
chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove(`${TAB_PANELS_KEY_PREFIX}${tabId}`);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === "get-config") {
      sendResponse({ ok: true, data: await getConfig() });
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
    if (message.type === "open-content-in-active-tab") {
      sendResponse({
        ok: true,
        data: await openContentInActiveTab(
          message.payload?.contentId,
          message.payload?.contentKind || "external"
        ),
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
    sendResponse({ ok: false, error: "Unknown message type" });
  })().catch((error) => {
    sendResponse({ ok: false, error: error.message || "Unknown error" });
  });

  return true;
});

// Refresh the embed session on every service worker wake-up (MV3 workers are
// short-lived and restart frequently — the alarm alone isn't enough coverage).
exchangeEmbedSession().catch(() => {});
