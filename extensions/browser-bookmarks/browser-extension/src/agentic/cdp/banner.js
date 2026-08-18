// On-page co-browse banner (D-BANNER amendment, 2026-08-17).
//
// Painted INTO the driven tab so "the agent is driving THIS page" is visible where
// the action is. Chromium's own "…started debugging this browser" infobar can't be
// scoped: it is a global infobar shown in every tab of every window of the profile
// (standalone-PWA windows included), and the only ways to suppress it are
// browser-side (--silent-debugger-extension-api, or a policy force-installed
// extension). This banner is our per-page signal; the infobar becomes redundant.
//
// Injected via chrome.scripting — NOT CDP — on purpose:
//   - it can be removed after the debugger is already gone (infobar Cancel,
//     DevTools taking the target), where Runtime.evaluate is unavailable;
//   - it can be re-painted on every navigation of the driven tab from a plain
//     tabs.onUpdated listener, which survives MV3 SW eviction (the driven tabId is
//     persisted in chrome.storage.session for exactly that reason).
//
// Passive by design (Category-B safety): pointer-events:none so it never occludes
// the actionability hit-test (elementFromPoint skips such elements) and clicks fall
// through to the page; aria-hidden so it never enters the a11y snapshot the agent
// perceives with. Stop stays in the panel (and on the infobar's Cancel).

export const BANNER_ID = "dg-cobrowse-banner";

// Runs IN THE PAGE via executeScript — must be self-contained: no references to
// module scope (the bundle is minified; only `args` cross the boundary).
function paintBanner(id, text) {
  var doc = document;
  var root = doc.documentElement;
  if (!root) return false;
  var el = doc.getElementById(id);
  if (!el) {
    el = doc.createElement("div");
    el.id = id;
    el.setAttribute("aria-hidden", "true");
    el.setAttribute("role", "presentation");
    el.style.cssText =
      "position:fixed;top:0;left:0;right:0;z-index:2147483647;pointer-events:none;" +
      "display:flex;align-items:center;justify-content:center;gap:8px;" +
      "background:rgba(180,83,9,.96);color:#fff;" +
      "font:600 12px/1 system-ui,-apple-system,sans-serif;letter-spacing:.2px;" +
      "padding:7px 12px;box-shadow:0 1px 6px rgba(0,0,0,.35);";
    var dot = doc.createElement("span");
    dot.style.cssText =
      "display:inline-block;width:8px;height:8px;border-radius:9999px;background:#fff;opacity:.9;";
    var label = doc.createElement("span");
    label.id = id + "-label";
    el.appendChild(dot);
    el.appendChild(label);
    root.appendChild(el);
  }
  var lbl = doc.getElementById(id + "-label");
  if (lbl) {
    var host = "";
    try {
      host = location.hostname || "";
    } catch (_e) {
      host = "";
    }
    lbl.textContent = text + (host ? " · " + host : "");
  }
  return true;
}

function removeBanner(id) {
  var el = document.getElementById(id);
  if (el) el.remove();
  return !!el;
}

const BANNER_TEXT =
  "Co-browsing — Digital Garden is driving this tab · Stop from the Digital Garden panel";

// Paint (or refresh) the banner in `tabId`. Idempotent; best-effort — restricted
// pages (chrome://, the Web Store) reject injection and that's fine.
export async function showBanner(tabId) {
  if (typeof tabId !== "number") return false;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: paintBanner,
      args: [BANNER_ID, BANNER_TEXT],
      injectImmediately: true,
    });
    return true;
  } catch {
    return false;
  }
}

// Remove the banner from `tabId`. Best-effort: a closed tab / restricted page
// simply fails, which is the outcome we wanted anyway.
export async function hideBanner(tabId) {
  if (typeof tabId !== "number") return false;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: removeBanner,
      args: [BANNER_ID],
    });
    return true;
  } catch {
    return false;
  }
}
