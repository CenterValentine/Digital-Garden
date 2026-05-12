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

function getStatusNode() {
  return document.getElementById("quick-save-status");
}

function setPopupLoading(isLoading, message = "Loading current page sync state…") {
  if (loadingCard()) {
    loadingCard().hidden = false;
    loadingCard().style.display = isLoading ? "flex" : "none";
    const hint = loadingCard().querySelector(".hint");
    if (hint) {
      hint.textContent = message;
    }
  }
  if (editorShell()) {
    editorShell().hidden = false;
    editorShell().style.display = isLoading ? "none" : "flex";
  }
}

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
  setQuickSaveStatus("Bookmark metadata options updated.", "success");
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
    placeholder: "Choose resource type",
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
    placeholder: "Choose resource relationship",
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
    placeholder: "Choose user intent",
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
    select.innerHTML = '<option value="">No synced connections yet</option>';
    select.disabled = true;
  } else {
    select.disabled = false;
    select.innerHTML = connections
      .map(
        (connection) =>
          `<option value="${connection.id}">${connection.name} (${connection.chromeRootTitle})</option>`
      )
      .join("");
    if (currentValue && connections.some((connection) => connection.id === currentValue)) {
      select.value = currentValue;
    } else {
      select.value = connections[0].id;
      await sendMessage({
        type: "save-config",
        payload: {
          ...config,
          defaultConnectionId: connections[0].id,
        },
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

function setQuickSaveStatus(message, kind = "idle") {
  const node = getStatusNode();
  node.textContent = message;
  node.style.color =
    kind === "error"
      ? "#ff8a8a"
      : kind === "success"
        ? "#8fe0b3"
        : "rgba(244, 246, 248, 0.64)";
}

function formatSyncConnectionStatus(pageState) {
  const bookmarks = Array.isArray(pageState?.bookmarks) ? pageState.bookmarks : [];
  const uniqueNames = Array.from(
    new Set(
      bookmarks
        .map((bookmark) => bookmark.connectionName)
        .filter((value) => typeof value === "string" && value.trim().length > 0)
    )
  );

  if (uniqueNames.length === 0) {
    return "This page is not synced yet. Title, description, and metadata autosave once the bookmark is created, and Launch Note opens the webpage note in the page overlay.";
  }

  if (uniqueNames.length === 1) {
    return `This page is already synced to ${uniqueNames[0]}. Changes autosave, and Launch Note opens the webpage note in the page overlay.`;
  }

  return `This page is already synced to ${uniqueNames.join(", ")}. Changes autosave across the current bookmarked connections, and Launch Note opens the webpage note in the page overlay.`;
}

async function setDefaultConnection(connectionId) {
  const current = await sendMessage({ type: "get-config" });
  await sendMessage({
    type: "save-config",
    payload: {
      ...current,
      defaultConnectionId: connectionId,
    },
  });
}

function getSelectedConnectionRecord() {
  const selectedId = connectionSelect().value;
  return (currentPageState?.connections || []).find(
    (connection) => connection.id === selectedId
  );
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
  setQuickSaveStatus(`Changes pending. Autosaving in a moment…`, "idle");
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

async function ensureLinkedNoteForCurrentPage() {
  const existingNote = (currentPageState?.resourceContext?.associations || []).find(
    (entry) => entry?.content?.contentType === "note"
  )?.content?.id;
  if (existingNote) {
    return existingNote;
  }

  const resourceId = currentPageState?.resourceContext?.resource?.id || null;
  if (!resourceId) {
    throw new Error("No webpage context is available for linked notes");
  }

  const connection = getSelectedConnectionRecord();
  if (!connection?.appRootId) {
    throw new Error("No valid synced connection is selected for linked note creation");
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
    payload: {
      webResourceId: resourceId,
      contentId: created.id,
    },
  });

  await refreshCurrentPageState();
  return created.id;
}

async function syncCurrentTab(options = {}) {
  if (syncInFlight) {
    await syncInFlight;
  }

  const run = (async () => {
    const selectValue = connectionSelect().value;
    if (!selectValue) {
      throw new Error("No synced browser-bookmark connection is available");
    }

    window.clearTimeout(autosaveTimer);
    await setDefaultConnection(selectValue);
    await persistDraftFromForm();

    const payload = getSyncPayloadFromForm();
    setQuickSaveStatus(
      options.source === "launch"
        ? "Saving and preparing note launch…"
        : "Autosaving bookmark info…"
    );

    const bookmark = await sendMessage({
      type: "quick-save",
      payload,
    });

    if (!options.skipRefresh) {
      await refreshCurrentPageState();
    }

    setQuickSaveStatus(
      bookmark.action === "updated-existing"
        ? "Bookmark info autosaved."
        : "Bookmark created and autosaved.",
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

async function handleLaunchNote() {
  const button = launchButton();
  try {
    button.disabled = true;
    button.textContent = "Launching…";
    await syncCurrentTab({ source: "launch", skipRefresh: true });
    await refreshCurrentPageState();
    setQuickSaveStatus("Preparing webpage note…");
    const contentId = await ensureLinkedNoteForCurrentPage();

    await sendMessage({
      type: "open-content-in-active-tab",
      payload: {
        contentId,
        contentKind: "note",
      },
    });

    setQuickSaveStatus("Opened the webpage note in the overlay.", "success");
    window.close();
  } catch (error) {
    console.error("[DG Bookmarks Popup] Launch note failed", error);
    setQuickSaveStatus(
      error instanceof Error ? error.message : "Failed to launch note.",
      "error"
    );
  } finally {
    button.disabled = false;
    button.textContent = "Launch Note";
  }
}

async function handleRemoveCurrentTab() {
  const button = removeButton();

  try {
    button.disabled = true;
    button.textContent = "Removing…";
    setQuickSaveStatus(
      "Removing the current page from the selected bookmark connection and Digital Garden…"
    );

    const result = await sendMessage({ type: "remove-current-tab" });
    await refreshCurrentPageState();

    setQuickSaveStatus(
      result.removedCount > 1
        ? `Removed ${result.removedCount} synced bookmarks for this page from ${result.connectionName}.`
        : `Removed this page from ${result.connectionName}.`,
      "success"
    );
  } catch (error) {
    console.error("[DG Bookmarks Popup] Remove current tab failed", error);
    setQuickSaveStatus(
      error instanceof Error ? error.message : "Failed to remove the current tab.",
      "error"
    );
  } finally {
    button.disabled = false;
    button.textContent = "Remove Current Tab";
  }
}

launchButton().addEventListener("click", () => {
  void handleLaunchNote();
});

removeButton().addEventListener("click", () => {
  void handleRemoveCurrentTab();
});

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

(async () => {
  setPopupLoading(true);
  try {
    const { connections, pageState } = await loadConfigAndConnections();
    setPopupLoading(false);
    setQuickSaveStatus(
      connections.length > 0
        ? formatSyncConnectionStatus(pageState)
        : "Create and trust a bookmark sync connection in Digital Garden first."
    );
  } catch (error) {
    console.error("[DG Bookmarks Popup] Initial load failed", error);
    setPopupLoading(false, "Failed to load current page sync state.");
    setQuickSaveStatus(
      error instanceof Error ? error.message : "Failed to load bookmark popup.",
      "error"
    );
  }
})();
