const STORAGE_KEYS = {
  config: "dgBrowserBookmarksConfig",
  ignore: "dgBrowserBookmarksIgnore",
  install: "dgBrowserBookmarksInstall",
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
  if (!config.appBaseUrl || !config.token) {
    throw new Error("Missing app URL or token");
  }

  const response = await fetch(getApiUrl(config.appBaseUrl, path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
      ...(init.headers || {}),
    },
  });
  const json = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(json.error?.message || `Request failed: ${path}`);
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

async function fetchContentPickerTree() {
  return apiFetch("/api/integrations/browser-extension/content-picker-tree");
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
    await pushMutations(connection.id, [
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

  await pushMutations(connection.id, [
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
      url: changeInfo.url || bookmark.url,
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

  await pushMutations(connection.id, [
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
  chrome.alarms.create("dg-pull-sync", { periodInMinutes: 5 });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  try {
    if (info.menuItemId === "dg-save-page") {
      await quickSaveCurrentTab({});
    }
    if (info.menuItemId === "dg-capture-session") {
      await captureCurrentSession({});
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === "get-config") {
      sendResponse({ ok: true, data: await getConfig() });
      return;
    }
    if (message.type === "get-extension-context") {
      sendResponse({ ok: true, data: await getExtensionContext() });
      return;
    }
    if (message.type === "save-config") {
      sendResponse({ ok: true, data: await saveConfig(message.payload) });
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
    if (message.type === "fetch-bookmark-preferences") {
      sendResponse({ ok: true, data: await fetchBookmarkPreferences() });
      return;
    }
    if (message.type === "save-bookmark-preferences") {
      sendResponse({ ok: true, data: await saveBookmarkPreferences(message.payload || {}) });
      return;
    }
    if (message.type === "quick-save") {
      sendResponse({ ok: true, data: await quickSaveCurrentTab(message.payload || {}) });
      return;
    }
    if (message.type === "remove-current-tab") {
      sendResponse({ ok: true, data: await removeCurrentTabBookmark() });
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
      sendResponse({ ok: true, data: await fetchContentPickerTree() });
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
