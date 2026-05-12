import {
  mountTaxonomyControl,
  normalizeBookmarkPreferences,
} from "./taxonomy.js";

const AUTOSAVE_DEBOUNCE_MS = 1600;

async function sendMessage(message) {
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

let bookmarkPreferences = normalizeBookmarkPreferences();
let resourceTypeControl = null;
let resourceRelationshipControl = null;
let userIntentControl = null;
let currentPageState = null;
let autosaveTimer = null;
let syncInFlight = null;

// ── DOM helpers ───────────────────────────────────────────────────────────────

function loadingCard() {
  return document.getElementById("quick-loading");
}
function editorShell() {
  return document.getElementById("quick-editor-shell");
}
function titleInput() {
  return document.getElementById("quick-title");
}
function descriptionInput() {
  return document.getElementById("quick-description");
}
function connectionSelect() {
  return document.getElementById("quick-connection");
}
function launchButton() {
  return document.getElementById("launch-note");
}
function removeButton() {
  return document.getElementById("quick-remove");
}
function openTreeButton() {
  return document.getElementById("open-tree");
}
function getStatusNode() {
  return document.getElementById("quick-save-status");
}
function getStatusDot() {
  return document.getElementById("status-dot");
}

// ── Page context ──────────────────────────────────────────────────────────────

async function populatePageContext() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const faviconEl = document.getElementById("page-favicon");
    const domainEl = document.getElementById("page-domain");
    const titleDisplayEl = document.getElementById("page-title-display");

    if (tab.favIconUrl) {
      faviconEl.src = tab.favIconUrl;
    }

    try {
      const hostname = new URL(tab.url || "").hostname.replace(/^www\./, "");
      domainEl.textContent = hostname;
    } catch {
      domainEl.textContent = "";
    }

    if (tab.title) {
      titleDisplayEl.textContent = tab.title;
    }
  } catch {
    // Best-effort; non-blocking
  }
}

// ── Loading state ─────────────────────────────────────────────────────────────

function setPopupLoading(isLoading) {
  if (loadingCard()) {
    loadingCard().style.display = isLoading ? "flex" : "none";
  }
  if (editorShell()) {
    editorShell().style.display = isLoading ? "none" : "flex";
  }
}

// ── Preference controls ───────────────────────────────────────────────────────

async function savePreferenceList(key, values) {
  const updated = normalizeBookmarkPreferences({
    ...bookmarkPreferences,
    [key]: values,
  });
  bookmarkPreferences = await sendMessage({
    type: "save-bookmark-preferences",
    payload: updated,
  });
  bookmarkPreferences = normalizeBookmarkPreferences(bookmarkPreferences);
  resourceTypeControl?.setValues(bookmarkPreferences.resourceTypes);
  resourceRelationshipControl?.setValues(bookmarkPreferences.resourceRelationships);
  userIntentControl?.setValues(bookmarkPreferences.userIntents);
  setQuickSaveStatus("Metadata options updated.", "success");
  scheduleAutosave("metadata changed");
  return bookmarkPreferences[key] || [];
}

function mountPreferenceControls() {
  resourceTypeControl?.destroy?.();
  resourceRelationshipControl?.destroy?.();
  userIntentControl?.destroy?.();

  resourceTypeControl = mountTaxonomyControl({
    container: document.getElementById("quick-resource-type-control"),
    label: "Resource Type",
    values: bookmarkPreferences.resourceTypes,
    placeholder: "Resource type",
    selectedValue:
      currentPageState?.draft?.resourceType ||
      currentPageState?.existingExternal?.external?.resourceType ||
      "",
    onSave: (values) => savePreferenceList("resourceTypes", values),
    onChange: () => {
      void persistDraftFromForm();
      scheduleAutosave("metadata changed");
    },
  });
  resourceRelationshipControl = mountTaxonomyControl({
    container: document.getElementById("quick-resource-relationship-control"),
    label: "Resource Relationship",
    values: bookmarkPreferences.resourceRelationships,
    placeholder: "Resource relationship",
    selectedValue:
      currentPageState?.draft?.resourceRelationship ||
      currentPageState?.existingExternal?.external?.resourceRelationship ||
      "",
    onSave: (values) => savePreferenceList("resourceRelationships", values),
    onChange: () => {
      void persistDraftFromForm();
      scheduleAutosave("metadata changed");
    },
  });
  userIntentControl = mountTaxonomyControl({
    container: document.getElementById("quick-user-intent-control"),
    label: "User Intent",
    values: bookmarkPreferences.userIntents,
    placeholder: "User intent",
    selectedValue:
      currentPageState?.draft?.userIntent ||
      currentPageState?.existingExternal?.external?.userIntent ||
      "",
    onSave: (values) => savePreferenceList("userIntents", values),
    onChange: () => {
      void persistDraftFromForm();
      scheduleAutosave("metadata changed");
    },
  });
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadConfigAndConnections() {
  const [config, connections, preferences, pageState] = await Promise.all([
    sendMessage({ type: "get-config" }),
    sendMessage({ type: "fetch-connections" }).catch(() => []),
    sendMessage({ type: "fetch-bookmark-preferences" }).catch(() =>
      normalizeBookmarkPreferences()
    ),
    sendMessage({ type: "get-current-tab-sync-state" }).catch(() => null),
  ]);

  currentPageState = pageState;
  bookmarkPreferences = normalizeBookmarkPreferences(preferences);

  const select = connectionSelect();
  const currentValue = pageState?.defaultConnectionId || config.defaultConnectionId || "";

  if (connections.length === 0) {
    select.innerHTML = '<option value="">No connections yet</option>';
    select.disabled = true;
  } else {
    select.disabled = false;
    select.innerHTML = connections
      .map(
        (c) => `<option value="${c.id}">${c.name} (${c.chromeRootTitle})</option>`
      )
      .join("");
    if (currentValue && connections.some((c) => c.id === currentValue)) {
      select.value = currentValue;
    } else {
      select.value = connections[0].id;
      await sendMessage({
        type: "save-config",
        payload: { ...config, defaultConnectionId: connections[0].id },
      });
    }
  }

  hydrateDraftFields();
  mountPreferenceControls();

  return {
    config: await sendMessage({ type: "get-config" }),
    connections,
    pageState,
  };
}

// ── Status ────────────────────────────────────────────────────────────────────

function setQuickSaveStatus(message, kind = "idle") {
  const textNode = getStatusNode();
  const dotNode = getStatusDot();
  if (textNode) textNode.textContent = message;
  if (dotNode) dotNode.setAttribute("data-kind", kind);
}

function formatSyncConnectionStatus(pageState) {
  const bookmarks = Array.isArray(pageState?.bookmarks) ? pageState.bookmarks : [];
  const uniqueNames = Array.from(
    new Set(
      bookmarks
        .map((b) => b.connectionName)
        .filter((v) => typeof v === "string" && v.trim().length > 0)
    )
  );

  if (uniqueNames.length === 0) {
    return "Not yet synced. Autosaves after the first save, and Launch Note opens the note in the page overlay.";
  }
  if (uniqueNames.length === 1) {
    return `Synced to ${uniqueNames[0]}. Changes autosave.`;
  }
  return `Synced to ${uniqueNames.join(", ")}. Changes autosave.`;
}

// ── Draft / sync ──────────────────────────────────────────────────────────────

async function setDefaultConnection(connectionId) {
  const current = await sendMessage({ type: "get-config" });
  await sendMessage({
    type: "save-config",
    payload: { ...current, defaultConnectionId: connectionId },
  });
}

function getSelectedConnectionRecord() {
  const selectedId = connectionSelect().value;
  return (currentPageState?.connections || []).find((c) => c.id === selectedId);
}

function getDraftPayloadFromForm() {
  return {
    title: titleInput().value,
    description: descriptionInput().value,
    resourceType: resourceTypeControl?.getValue() || null,
    resourceRelationship: resourceRelationshipControl?.getValue() || null,
    userIntent: userIntentControl?.getValue() || null,
  };
}

function getSyncPayloadFromForm() {
  const draft = getDraftPayloadFromForm();
  return {
    title: draft.title.trim() || undefined,
    description: draft.description.trim() || null,
    resourceType: draft.resourceType,
    resourceRelationship: draft.resourceRelationship,
    userIntent: draft.userIntent,
    connectionId: connectionSelect().value || undefined,
  };
}

async function persistDraftFromForm() {
  if (!currentPageState?.url) return;
  await sendMessage({
    type: "save-quick-save-draft",
    payload: {
      url: currentPageState.url,
      draft: getDraftPayloadFromForm(),
    },
  });
}

function hydrateDraftFields() {
  const title =
    currentPageState?.draft?.title ??
    currentPageState?.existingExternal?.title ??
    currentPageState?.title ??
    "";
  const description =
    currentPageState?.draft?.description ??
    currentPageState?.existingExternal?.external?.description ??
    "";
  titleInput().value = title;
  descriptionInput().value = description;
}

function scheduleAutosave(reason = "changes pending") {
  if (connectionSelect().disabled) return;
  window.clearTimeout(autosaveTimer);
  setQuickSaveStatus("Saving…", "saving");
  autosaveTimer = window.setTimeout(() => {
    void syncCurrentTab({ source: reason });
  }, AUTOSAVE_DEBOUNCE_MS);
}

async function refreshCurrentPageState() {
  currentPageState = await sendMessage({ type: "get-current-tab-sync-state" }).catch(
    () => currentPageState
  );
  hydrateDraftFields();
  mountPreferenceControls();
  return currentPageState;
}

// ── Note creation ─────────────────────────────────────────────────────────────

async function ensureLinkedNoteForCurrentPage() {
  const existingNote = (currentPageState?.resourceContext?.associations || []).find(
    (entry) => entry?.content?.contentType === "note"
  )?.content?.id;
  if (existingNote) return existingNote;

  const resourceId = currentPageState?.resourceContext?.resource?.id || null;
  if (!resourceId) {
    throw new Error("No webpage context available for linked notes");
  }

  const connection = getSelectedConnectionRecord();
  if (!connection?.appRootId) {
    throw new Error("No valid synced connection selected for linked note creation");
  }

  const created = await sendMessage({
    type: "create-content-picker-item",
    payload: {
      parentId: connection.appRootId,
      type: "note",
      title:
        titleInput().value.trim() ||
        currentPageState?.existingExternal?.title ||
        currentPageState?.title ||
        "Untitled Note",
    },
  });

  await sendMessage({
    type: "create-resource-association",
    payload: { webResourceId: resourceId, contentId: created.id },
  });

  await refreshCurrentPageState();
  return created.id;
}

// ── Sync ──────────────────────────────────────────────────────────────────────

async function syncCurrentTab(options = {}) {
  if (syncInFlight) {
    await syncInFlight;
  }

  const run = (async () => {
    const selectValue = connectionSelect().value;
    if (!selectValue) {
      throw new Error("No synced browser-bookmark connection available");
    }

    window.clearTimeout(autosaveTimer);
    await setDefaultConnection(selectValue);
    await persistDraftFromForm();

    const payload = getSyncPayloadFromForm();
    setQuickSaveStatus(
      options.source === "launch" ? "Saving and preparing note…" : "Saving…",
      "saving"
    );

    const bookmark = await sendMessage({ type: "quick-save", payload });

    if (!options.skipRefresh) {
      await refreshCurrentPageState();
    }

    setQuickSaveStatus(
      bookmark.action === "updated-existing" ? "Bookmark autosaved." : "Bookmark created.",
      "success"
    );

    return bookmark;
  })();

  syncInFlight = run;
  try {
    return await run;
  } finally {
    syncInFlight = null;
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleLaunchNote() {
  const button = launchButton();
  try {
    button.disabled = true;
    button.textContent = "Launching…";
    await syncCurrentTab({ source: "launch", skipRefresh: true });
    await refreshCurrentPageState();
    setQuickSaveStatus("Preparing note…", "saving");
    const contentId = await ensureLinkedNoteForCurrentPage();

    await sendMessage({
      type: "open-content-in-active-tab",
      payload: { contentId, contentKind: "note" },
    });

    setQuickSaveStatus("Opened in overlay.", "success");
    window.close();
  } catch (error) {
    console.error("[DG Popup] Launch note failed", error);
    setQuickSaveStatus(
      error instanceof Error ? error.message : "Failed to launch note.",
      "error"
    );
  } finally {
    button.disabled = false;
    button.textContent = "Launch Note";
  }
}

async function handleOpenInTree() {
  const button = openTreeButton();
  try {
    button.disabled = true;
    button.textContent = "Opening…";
    await sendMessage({ type: "show-tree-panel" });
    window.close();
  } catch (error) {
    console.error("[DG Popup] Open in tree failed", error);
    setQuickSaveStatus(
      error instanceof Error ? error.message : "Failed to open tree.",
      "error"
    );
    button.disabled = false;
    button.textContent = "Open in Tree";
  }
}

async function handleRemoveCurrentTab() {
  const button = removeButton();
  try {
    button.disabled = true;
    button.textContent = "Removing…";
    setQuickSaveStatus("Removing bookmark…", "saving");

    const result = await sendMessage({ type: "remove-current-tab" });
    await refreshCurrentPageState();

    setQuickSaveStatus(
      result.removedCount > 1
        ? `Removed ${result.removedCount} bookmarks from ${result.connectionName}.`
        : `Removed from ${result.connectionName}.`,
      "success"
    );
  } catch (error) {
    console.error("[DG Popup] Remove failed", error);
    setQuickSaveStatus(
      error instanceof Error ? error.message : "Failed to remove.",
      "error"
    );
  } finally {
    button.disabled = false;
    button.textContent = "Remove";
  }
}

// ── Event wiring ──────────────────────────────────────────────────────────────

launchButton().addEventListener("click", () => void handleLaunchNote());
openTreeButton().addEventListener("click", () => void handleOpenInTree());
removeButton().addEventListener("click", () => void handleRemoveCurrentTab());

document.getElementById("open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("open-capture").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("capture.html") });
});

connectionSelect().addEventListener("change", async (event) => {
  const value = event.target.value;
  if (!value) return;
  await setDefaultConnection(value);
  await persistDraftFromForm();
  scheduleAutosave("connection changed");
});

titleInput().addEventListener("input", () => {
  void persistDraftFromForm();
  scheduleAutosave("title changed");
});

descriptionInput().addEventListener("input", () => {
  void persistDraftFromForm();
  scheduleAutosave("description changed");
});

// ── Init ──────────────────────────────────────────────────────────────────────

(async () => {
  setPopupLoading(true);
  void populatePageContext();
  try {
    const { connections, pageState } = await loadConfigAndConnections();
    setPopupLoading(false);
    setQuickSaveStatus(
      connections.length > 0
        ? formatSyncConnectionStatus(pageState)
        : "Create a bookmark sync connection in Digital Garden first."
    );
  } catch (error) {
    console.error("[DG Popup] Init failed", error);
    setPopupLoading(false);
    setQuickSaveStatus(
      error instanceof Error ? error.message : "Failed to load popup.",
      "error"
    );
  }
})();
