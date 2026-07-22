/**
 * On-demand reader (BROWSER-REACH B2 polish).
 *
 * A lightweight, UI-free content script injected via chrome.scripting when a
 * tab has no overlay content script (opened before the extension loaded, or
 * not reloaded after an update) — so page capture works without asking the
 * user to reload the tab. It registers ONLY the dg-extract-content responder,
 * none of the overlay's UI. Guarded so a repeat injection is a no-op, and it
 * never double-responds on tabs where the full overlay is already present
 * (injection only happens when the overlay is absent).
 */
import { extractContent } from "../extraction/index.js";

if (!window.__dgReaderInstalled) {
  window.__dgReaderInstalled = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "dg-extract-content") return;
    try {
      sendResponse({ ok: true, data: extractContent(message.scope) });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Extraction failed",
      });
    }
    return; // responded synchronously
  });
}
