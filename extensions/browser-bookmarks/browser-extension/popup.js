import {
  mountTaxonomyControl,
  normalizeBookmarkPreferences,
} from "./taxonomy.js";

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
    onSave: (values) => savePreferenceList("resourceTypes", values),
  });
  resourceRelationshipControl = mountTaxonomyControl({
    container: document.getElementById("quick-resource-relationship-control"),
    label: "Resource Relationship",
    values: bookmarkPreferences.resourceRelationships,
    placeholder: "Choose resource relationship",
    onSave: (values) => savePreferenceList("resourceRelationships", values),
  });
  userIntentControl = mountTaxonomyControl({
    container: document.getElementById("quick-user-intent-control"),
    label: "User Intent",
    values: bookmarkPreferences.userIntents,
    placeholder: "Choose user intent",
    onSave: (values) => savePreferenceList("userIntents", values),
  });
}

async function loadConfigAndConnections() {
  const [config, connections, preferences] = await Promise.all([
    sendMessage({ type: "get-config" }),
    sendMessage({ type: "fetch-connections" }).catch(() => []),
    sendMessage({ type: "fetch-bookmark-preferences" }).catch(() =>
      normalizeBookmarkPreferences()
    ),
  ]);

  bookmarkPreferences = normalizeBookmarkPreferences(preferences);
  mountPreferenceControls();

  const select = document.getElementById("quick-connection");
  const currentValue = config.defaultConnectionId || "";

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

  return {
    config: await sendMessage({ type: "get-config" }),
    connections,
  };
}

function setQuickSaveStatus(message, kind = "idle") {
  const node = document.getElementById("quick-save-status");
  node.textContent = message;
  node.style.color =
    kind === "error"
      ? "#ff8a8a"
      : kind === "success"
        ? "#8fe0b3"
        : "rgba(244, 246, 248, 0.64)";
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

document.getElementById("quick-save").addEventListener("click", async () => {
  const button = document.getElementById("quick-save");
  const connectionSelect = document.getElementById("quick-connection");
  const description = document.getElementById("quick-description").value.trim();

  try {
    button.disabled = true;
    button.textContent = "Saving…";
    setQuickSaveStatus("Saving the current tab into the selected bookmark connection…");

    if (connectionSelect.value) {
      await setDefaultConnection(connectionSelect.value);
    }

    const bookmark = await sendMessage({
      type: "quick-save",
      payload: {
        description,
        resourceType: resourceTypeControl?.getValue() || null,
        resourceRelationship: resourceRelationshipControl?.getValue() || null,
        userIntent: userIntentControl?.getValue() || null,
      },
    });

    document.getElementById("quick-description").value = "";
    if (bookmark.action === "updated-existing") {
      setQuickSaveStatus(
        bookmark.duplicateCount > 1
          ? `Updated ${bookmark.duplicateCount} existing bookmarks for this page in the selected connection.`
          : `Updated the existing bookmark ${bookmark.title || bookmark.id}.`,
        "success"
      );
    } else {
      setQuickSaveStatus(`Saved bookmark ${bookmark.title || bookmark.id}.`, "success");
    }
  } catch (error) {
    console.error("[DG Bookmarks Popup] Quick save failed", error);
    setQuickSaveStatus(
      error instanceof Error ? error.message : "Quick save failed.",
      "error"
    );
  } finally {
    button.disabled = false;
    button.textContent = "Save Current Tab";
  }
});

document.getElementById("quick-remove").addEventListener("click", async () => {
  const button = document.getElementById("quick-remove");

  try {
    button.disabled = true;
    button.textContent = "Removing…";
    setQuickSaveStatus(
      "Removing the current page from the selected bookmark connection and Digital Garden…"
    );

    const result = await sendMessage({ type: "remove-current-tab" });

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
});

document.getElementById("open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("open-capture").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("capture.html") });
});

document.getElementById("quick-connection").addEventListener("change", async (event) => {
  const value = event.target.value;
  if (!value) return;
  await setDefaultConnection(value);
  setQuickSaveStatus("Default quick-save connection updated.");
});

(async () => {
  try {
    const { connections } = await loadConfigAndConnections();
    setQuickSaveStatus(
      connections.length > 0
        ? "Choose a sync connection and save the active tab."
        : "Create and trust a bookmark sync connection in Digital Garden first."
    );
  } catch (error) {
    console.error("[DG Bookmarks Popup] Initial load failed", error);
    setQuickSaveStatus(
      error instanceof Error ? error.message : "Failed to load bookmark popup.",
      "error"
    );
  }
})();
