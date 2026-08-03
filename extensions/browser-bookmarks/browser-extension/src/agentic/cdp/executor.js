// Raw CDP executor — Phase 2b foundation (Agentic Browsing).
//
// This is the LOCKED primary interaction engine (D-ENG, 2026-08-01): raw
// `chrome.debugger` + CDP, driven from the background service worker. The
// deferred `playwright-crx` swap for the form-fill / hard-acting phases sits
// behind the same app-side BrowserActuator protocol. See the plan's
// §"Interaction reliability" for the two-category standard everything here upholds.
//
// Scope of THIS module (Slice 1): the attach / detach / send lifecycle + the
// single active-session guard + the banner-Stop wiring. The actionability
// pipeline (resolveFresh → scrollIntoViewIfNeeded → hit-test gate → dispatch),
// the a11y snapshot, and cross-frame (OOPIF) attach all land in later slices
// ON TOP of send() — this module is deliberately just the primitive.

const PROTOCOL_VERSION = "1.3";

// Domains we drive. Enabled best-effort on attach so one unsupported/failed
// domain can't abort the whole session.
const DOMAINS_ON_ATTACH = ["Page.enable", "DOM.enable", "Runtime.enable", "Accessibility.enable"];

// MVP invariant: exactly ONE co-browse session at a time (one debuggee tab).
// This object is the single source of truth for "is the agent driving right now".
let session = null; // { tabId: number, startedAt: number } | null

// The background wires this so it can tell the app when a session ENDS for any
// reason — including the user clicking "Cancel" on Chrome's debugging infobar
// (reason "canceled_by_user"). D-BANNER: the banner's Stop and our in-app Stop
// are the SAME lifecycle event, funnelled through here.
let onSessionEnd = null; // (reason: string, tabId: number) => void

function attachDebugger(target, version) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach(target, version, () => {
      const err = chrome.runtime.lastError;
      err ? reject(new Error(err.message)) : resolve();
    });
  });
}

function detachDebugger(target) {
  return new Promise((resolve) => {
    // Detach is best-effort: if the target is already gone (tab closed, devtools
    // took over) we still want our state cleared, so this never rejects.
    chrome.debugger.detach(target, () => {
      void chrome.runtime.lastError; // swallow "not attached"
      resolve();
    });
  });
}

function sendCommand(target, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(target, method, params || {}, (result) => {
      const err = chrome.runtime.lastError;
      err ? reject(new Error(`${method}: ${err.message}`)) : resolve(result);
    });
  });
}

// Background registers a handler so a session ending out-of-band (banner Cancel,
// tab close) can drop the app's co-browse UI.
export function setSessionEndHandler(handler) {
  onSessionEnd = typeof handler === "function" ? handler : null;
}

export function getSession() {
  return session ? { ...session } : null;
}

export function isAttached(tabId) {
  return !!session && (tabId == null || session.tabId === tabId);
}

// Attach the debugger to `tabId`. Shows Chrome's "…is debugging this browser"
// infobar (D-BANNER, accepted) for the life of the session, and enforces the
// single-session invariant.
export async function attach(tabId) {
  if (typeof tabId !== "number") throw new Error("attach: a numeric tabId is required");
  if (session && session.tabId !== tabId) {
    throw new Error(
      "A co-browse session is already active on another tab. Stop it before starting a new one.",
    );
  }
  if (session && session.tabId === tabId) {
    return { tabId, alreadyAttached: true };
  }
  await attachDebugger({ tabId }, PROTOCOL_VERSION);
  session = { tabId, startedAt: Date.now() };
  for (const domain of DOMAINS_ON_ATTACH) {
    try {
      await sendCommand({ tabId }, domain);
    } catch (error) {
      console.warn("[DG cobrowse] enable failed", domain, error);
    }
  }
  return { tabId, alreadyAttached: false };
}

// Our in-app Stop → detach → banner disappears. Idempotent; clears state first
// so a racing send() fails fast rather than hitting a half-torn-down session.
export async function detach() {
  if (!session) return { detached: false };
  const { tabId } = session;
  session = null;
  await detachDebugger({ tabId });
  return { detached: true, tabId };
}

// The single CDP primitive every later slice builds on. Throws if no session.
export async function send(method, params) {
  if (!session) throw new Error("No active co-browse session — attach first.");
  return sendCommand({ tabId: session.tabId }, method, params);
}

// Cancel on the banner ("canceled_by_user"), the tab closing ("target_closed"),
// or devtools taking the target ("replaced_with_devtools") all detach us
// out-of-band. Any of them is an authoritative session end — reset and notify.
chrome.debugger.onDetach.addListener((source, reason) => {
  if (session && source && source.tabId === session.tabId) {
    const endedTab = session.tabId;
    session = null;
    if (onSessionEnd) {
      try {
        onSessionEnd(reason, endedTab);
      } catch (error) {
        console.warn("[DG cobrowse] session-end handler threw", error);
      }
    }
  }
});
