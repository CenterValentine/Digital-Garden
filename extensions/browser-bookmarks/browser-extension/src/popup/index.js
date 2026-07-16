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

document.getElementById("quick-capture-btn").addEventListener("click", async () => {
  try {
    await sendMessage({ type: "start-quick-capture" });
  } catch {
    // Overlay unavailable on this page — close anyway
  }
  window.close();
});

// ── Workflows chooser ─────────────────────────────────────────────────────────
// Explicit pick (locked design): the button lists YOUR workflows with a
// "matches this page" hint; the chosen id goes to the background, which
// extracts rendered page text and dispatches. Engine (Trellis/n8n) is a chip —
// routing stays server-side.

let workflowsCache = null;

function workflowChooser() {
  return document.getElementById("workflow-chooser");
}
function runWorkflowButton() {
  return document.getElementById("run-workflow-btn");
}

function renderWorkflowChooser(workflows) {
  const chooser = workflowChooser();
  chooser.innerHTML = "";
  if (!workflows || workflows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "workflow-empty";
    empty.textContent =
      "No workflows yet. Create one in Digital Garden: + → Workflow.";
    chooser.appendChild(empty);
    return;
  }
  for (const workflow of workflows) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "workflow-row";
    row.disabled = !workflow.enabled;
    row.title = workflow.enabled ? "Run on this page" : "Disabled in Digital Garden";

    const name = document.createElement("span");
    name.className = "workflow-name";
    name.textContent = workflow.title;
    row.appendChild(name);

    const engine = document.createElement("span");
    engine.className = "workflow-chip workflow-chip-engine";
    engine.textContent = workflow.engine === "n8n" ? "n8n" : "Trellis";
    row.appendChild(engine);

    if (workflow.matchesPage) {
      const match = document.createElement("span");
      match.className = "workflow-chip workflow-chip-match";
      match.textContent = "matches page";
      row.appendChild(match);
    }

    row.addEventListener("click", () => void dispatchWorkflow(workflow, row));
    chooser.appendChild(row);
  }
}

async function toggleWorkflowChooser() {
  const chooser = workflowChooser();
  const button = runWorkflowButton();
  const isOpen = chooser.style.display !== "none";
  if (isOpen) {
    chooser.style.display = "none";
    button.setAttribute("aria-expanded", "false");
    return;
  }
  chooser.style.display = "block";
  button.setAttribute("aria-expanded", "true");
  if (workflowsCache === null) {
    chooser.innerHTML = '<div class="workflow-empty">Loading workflows…</div>';
    try {
      const data = await sendMessage({ type: "list-workflows" });
      workflowsCache = data.workflows || [];
    } catch (error) {
      chooser.innerHTML = "";
      const failed = document.createElement("div");
      failed.className = "workflow-empty";
      failed.textContent =
        error instanceof Error ? error.message : "Failed to load workflows.";
      chooser.appendChild(failed);
      return;
    }
    renderWorkflowChooser(workflowsCache);
  }
}

async function dispatchWorkflow(workflow, row) {
  const button = runWorkflowButton();
  try {
    row.classList.add("workflow-row-busy");
    button.disabled = true;
    setQuickSaveStatus(`Dispatching “${workflow.title}”…`, "saving");
    await sendMessage({
      type: "dispatch-workflow",
      payload: { workflowId: workflow.id, workflowTitle: workflow.title },
    });
    setQuickSaveStatus(
      "Workflow dispatched — track it on the page's status pill.",
      "success"
    );
    workflowChooser().style.display = "none";
    button.setAttribute("aria-expanded", "false");
  } catch (error) {
    console.error("[DG Popup] Workflow dispatch failed", error);
    setQuickSaveStatus(
      error instanceof Error ? error.message : "Failed to dispatch workflow.",
      "error"
    );
  } finally {
    row.classList.remove("workflow-row-busy");
    button.disabled = false;
  }
}

runWorkflowButton().addEventListener("click", () => void toggleWorkflowChooser());

// ── Recent runs (ambient status, popup layer) ─────────────────────────────────
// Read-only mirror of the app's runs list: needs-review pinned, tap a row to
// open the workflow's deep panel in the page overlay. Gate RESOLUTION stays
// in the session-authed embed surface by design — no approve buttons here.

const RUN_STATUS_COLORS = {
  queued: "#9aa4b2",
  running: "#7cb1ff",
  waiting: "#ffd27a",
  succeeded: "#8fe0b3",
  failed: "#ff8a8a",
  canceled: "#9aa4b2",
};

function formatRunAge(iso) {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

async function openWorkflowDeepPanel(run) {
  if (!run.workflowNodeId) return;
  try {
    await sendMessage({
      type: "open-content-in-active-tab",
      payload: { contentId: run.workflowNodeId, contentKind: "workflow" },
    });
    window.close();
  } catch (error) {
    setQuickSaveStatus(
      error instanceof Error ? error.message : "Overlay unavailable on this page.",
      "error"
    );
  }
}

function renderRecentRuns(runs) {
  const section = document.getElementById("workflow-runs");
  const list = document.getElementById("workflow-runs-list");
  if (!runs || runs.length === 0) {
    section.style.display = "none";
    return;
  }
  // Needs-review first (the popup's whole job is surfacing "you're needed"),
  // otherwise keep the server's newest-first order.
  const ordered = [...runs].sort(
    (a, b) => Number(b.needsReview) - Number(a.needsReview)
  );
  list.innerHTML = "";
  for (const run of ordered) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "workflow-run-row";
    row.disabled = !run.workflowNodeId;
    row.title = run.workflowNodeId
      ? "Open in the page overlay"
      : "Diagnostic run";

    const dot = document.createElement("span");
    dot.className = "workflow-run-dot";
    dot.style.background = RUN_STATUS_COLORS[run.status] || "#9aa4b2";
    if (run.status === "running" || run.status === "queued") {
      dot.classList.add("workflow-run-dot-live");
    }
    row.appendChild(dot);

    const name = document.createElement("span");
    name.className = "workflow-run-name";
    name.textContent = run.workflowName;
    row.appendChild(name);

    if (run.needsReview) {
      const review = document.createElement("span");
      review.className = "workflow-chip workflow-chip-review";
      review.textContent = "review";
      row.appendChild(review);
    } else {
      const status = document.createElement("span");
      status.className = "workflow-run-status";
      status.style.color = RUN_STATUS_COLORS[run.status] || "#9aa4b2";
      status.textContent = run.status;
      row.appendChild(status);
    }

    const age = document.createElement("span");
    age.className = "workflow-run-age";
    age.textContent = formatRunAge(run.createdAt);
    row.appendChild(age);

    row.addEventListener("click", () => void openWorkflowDeepPanel(run));
    list.appendChild(row);
  }
  section.style.display = "block";
}

async function loadRecentRuns() {
  try {
    const data = await sendMessage({
      type: "list-workflow-runs",
      payload: { limit: 6 },
    });
    renderRecentRuns(data.runs);
  } catch {
    // Unpaired or offline — the section simply doesn't render.
  }
}

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
  void loadRecentRuns(); // ambient layer — never blocks the bookmark form
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
