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
  return bookmarkPreferences[key] || [];
}

function mountPreferenceControls() {
  resourceTypeControl?.destroy?.();
  resourceRelationshipControl?.destroy?.();
  userIntentControl?.destroy?.();

  resourceTypeControl = mountTaxonomyControl({
    container: document.getElementById("capture-resource-type-control"),
    label: "Resource Type",
    values: bookmarkPreferences.resourceTypes,
    placeholder: "Choose resource type",
    onSave: (values) => savePreferenceList("resourceTypes", values),
  });
  resourceRelationshipControl = mountTaxonomyControl({
    container: document.getElementById("capture-resource-relationship-control"),
    label: "Resource Relationship",
    values: bookmarkPreferences.resourceRelationships,
    placeholder: "Choose resource relationship",
    onSave: (values) => savePreferenceList("resourceRelationships", values),
  });
  userIntentControl = mountTaxonomyControl({
    container: document.getElementById("capture-user-intent-control"),
    label: "User Intent",
    values: bookmarkPreferences.userIntents,
    placeholder: "Choose user intent",
    onSave: (values) => savePreferenceList("userIntents", values),
  });
}

async function loadPreferences() {
  bookmarkPreferences = normalizeBookmarkPreferences(
    await sendMessage({ type: "fetch-bookmark-preferences" }).catch(() =>
      normalizeBookmarkPreferences()
    )
  );
  mountPreferenceControls();
}

async function seedFormFromTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  document.getElementById("capture-title").value = tab?.title || "";
}

function buildPayload() {
  return {
    title: document.getElementById("capture-title").value.trim(),
    description: document.getElementById("capture-description").value.trim(),
    resourceType: resourceTypeControl?.getValue() || null,
    resourceRelationship: resourceRelationshipControl?.getValue() || null,
    userIntent: userIntentControl?.getValue() || null,
    dedupeEnabled: document.getElementById("capture-dedupe").value === "true",
    preserveHtml:
      document.getElementById("capture-preserve-html").value === "true",
  };
}

async function saveCurrentTab() {
  await sendMessage({
    type: "quick-save",
    payload: buildPayload(),
  });
}

async function captureSession() {
  await sendMessage({
    type: "capture-session",
    payload: {
      ...buildPayload(),
      bypassRules: true,
    },
  });
}

document.getElementById("capture-save").addEventListener("click", async () => {
  await saveCurrentTab();
});

document.getElementById("capture-session").addEventListener("click", async () => {
  await captureSession();
});

Promise.all([seedFormFromTab(), loadPreferences()])
  .catch((error) => {
    console.error("[DG Bookmarks Capture] Failed to initialize capture form", error);
  });
