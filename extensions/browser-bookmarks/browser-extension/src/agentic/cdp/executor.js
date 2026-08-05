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

// Cross-frame (OOPIF, Category A): cross-origin iframes are isolated targets —
// Accessibility.getFullAXTree can't cross the security boundary from the root
// session, so each needs its OWN protocol session. Flat auto-attach exposes each
// as a child session addressed by `sessionId`. This map is sessionId → frame info;
// reading stitches AX across them (Slice 3c-1), acting across them (frame-local→
// root coordinate translation) is Slice 3c-2.
const childSessions = new Map(); // sessionId -> { targetId, type, url }

export function getChildSessions() {
  return [...childSessions.entries()].map(([sessionId, info]) => ({ sessionId, ...info }));
}

function attachDebugger(target, version) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach(target, version, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve();
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
      if (err) reject(new Error(`${method}: ${err.message}`));
      else resolve(result);
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
  childSessions.clear();
  persistSession(tabId); // survive MV3 SW eviction (see ensureSession)
  for (const domain of DOMAINS_ON_ATTACH) {
    try {
      await sendCommand({ tabId }, domain);
    } catch (error) {
      console.warn("[DG cobrowse] enable failed", domain, error);
    }
  }
  // Expose cross-origin (OOPIF) frames as child sessions (see childSessions).
  try {
    await sendCommand({ tabId }, "Target.setAutoAttach", {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
    });
  } catch (error) {
    console.warn("[DG cobrowse] setAutoAttach failed", error);
  }
  // NOTE: Emulation.setFocusEmulationEnabled (to keep a backgrounded tab rendering
  // as focused — the "switch away and it keeps working" idea) is DISABLED. In
  // Vivaldi it left Accessibility.getFullAXTree returning an empty tree (snapshot
  // → 0 nodes), isolated by comparison: Slice 3a snapshotted a *backgrounded* tab
  // fine (548 nodes) without it. The session still stays BOUND to a backgrounded
  // tab (the debugger binds to the tabId; a backgrounded tab returns a full AX
  // tree), so "don't babysit" holds for the common case. Revisit a Vivaldi-safe
  // visibility fix ONLY for genuinely visibility-gated sites, validated first.
  return { tabId, alreadyAttached: false };
}

// Our in-app Stop → detach → banner disappears. Idempotent; clears state first
// so a racing send() fails fast rather than hitting a half-torn-down session.
export async function detach() {
  clearSession(); // intentional end — do not auto-recover
  if (!session) return { detached: false };
  const { tabId } = session;
  session = null;
  childSessions.clear();
  await detachDebugger({ tabId });
  return { detached: true, tabId };
}

// ── Session persistence + recovery (MV3 SW-eviction resilience) ───────────────
// The active co-browse session lives in the `session` module var, which an MV3
// service-worker eviction wipes — AND the eviction drops the debugger attachment
// too. Symptom (observed live): a co_browse op returns "No active co-browse
// session" even right after a successful open, because the SW cycled between the
// two messages (e.g. while the user reloaded the app). We persist the driven
// tabId in chrome.storage.session (survives SW restarts within the browser
// session) and transparently re-attach on the next op, so co-browse survives the
// eviction instead of dead-ending the run.
const SESSION_KEY = "dgCoBrowseSession"; // { tabId, at } — at = last-active ms
// Recover ONLY a session that was active within this window. This is the safety
// bound: it heals an eviction that just happened during an ACTIVE co-browse, but
// NEVER silently resurrects an idle/abandoned session into a later or different
// chat. Starting a fresh co-browse is co_browse_open's job (it opens a new tab),
// so recovery is strictly for continuing a session the user was just using.
const RECOVERY_WINDOW_MS = 30 * 60 * 1000;
let lastActivityWrite = 0; // in-memory throttle for the activity stamp

function persistSession(tabId) {
  try {
    const now = Date.now();
    chrome.storage.session.set({ [SESSION_KEY]: { tabId, at: now } });
    lastActivityWrite = now;
  } catch {
    // storage.session unavailable (older Chromium) — recovery is best-effort.
  }
}
// Refresh the activity stamp during a LIVE session (throttled) so a long
// co-browse stays recoverable across an eviction — without a storage write per op.
function touchSession(tabId) {
  if (Date.now() - lastActivityWrite < 60000) return;
  persistSession(tabId);
}
function clearSession() {
  try {
    chrome.storage.session.remove(SESSION_KEY);
  } catch {
    /* best-effort */
  }
  lastActivityWrite = 0;
}
async function readSession() {
  try {
    const got = await chrome.storage.session.get(SESSION_KEY);
    const s = got && got[SESSION_KEY];
    if (s && typeof s.tabId === "number" && typeof s.at === "number") return s;
    return null;
  } catch {
    return null;
  }
}

let recovering = null; // de-dupe concurrent recovery attempts

// Ensure an in-memory session, recovering one lost to SW eviction by re-attaching
// to the persisted tab — but ONLY if it was active recently (RECOVERY_WINDOW_MS),
// so an abandoned session never auto-attaches to a new chat. Returns the session,
// or null if there's nothing safe to recover. Idempotent + concurrency-safe.
export async function ensureSession() {
  if (session) return session;
  if (recovering) return recovering;
  recovering = (async () => {
    try {
      const saved = await readSession();
      if (!saved) return null;
      if (Date.now() - saved.at > RECOVERY_WINDOW_MS) {
        clearSession(); // stale — the user moved on; do not resurrect it
        return null;
      }
      await chrome.tabs.get(saved.tabId); // confirm the tab still exists (throws if gone)
      await attach(saved.tabId); // re-establishes the debugger + session (banner reappears)
      return session;
    } catch {
      clearSession();
      return null;
    } finally {
      recovering = null;
    }
  })();
  return recovering;
}

function targetOf(sessionId) {
  return sessionId ? { tabId: session.tabId, sessionId } : { tabId: session.tabId };
}

// The single CDP primitive every later slice builds on. Self-heals a session lost
// to SW eviction (ensureSession) before failing. Pass a child `sessionId` (from
// getChildSessions) to target a cross-origin frame.
export async function send(method, params, sessionId) {
  if (!session) {
    await ensureSession();
    if (!session) throw new Error("No active co-browse session — attach first.");
  }
  touchSession(session.tabId); // keep the recovery window fresh during activity
  return sendCommand(targetOf(sessionId), method, params);
}

// The top-left of a child frame's viewport in ROOT coordinates — the sum of the
// owning <iframe> element offsets from this frame up to the top (Slice 3c-2). For
// trusted cross-frame input we dispatch at (frameOffset + frame-local coords) on
// the ROOT session and let the compositor route the hit into the frame.
// DOM.getFrameOwner runs on each PARENT session (frameId == the OOPIF's targetId).
export async function frameOffset(sessionId) {
  let x = 0;
  let y = 0;
  let sid = sessionId;
  const seen = new Set();
  while (sid && !seen.has(sid)) {
    seen.add(sid);
    const info = childSessions.get(sid);
    if (!info) break;
    const parentSid = info.parentSessionId; // undefined ⇒ parent is the top frame
    const owner = await sendCommand(targetOf(parentSid), "DOM.getFrameOwner", {
      frameId: info.targetId,
    });
    const resolved = await sendCommand(targetOf(parentSid), "DOM.resolveNode", {
      backendNodeId: owner.backendNodeId,
    });
    const objectId = resolved && resolved.object && resolved.object.objectId;
    if (!objectId) throw new Error("cross-frame: could not resolve the iframe element");
    const rect = await sendCommand(targetOf(parentSid), "Runtime.callFunctionOn", {
      objectId,
      returnByValue: true,
      functionDeclaration:
        "function () { const r = this.getBoundingClientRect(); return { x: r.left + this.clientLeft, y: r.top + this.clientTop }; }",
    });
    const v = (rect && rect.result && rect.result.value) || { x: 0, y: 0 };
    x += v.x;
    y += v.y;
    sid = parentSid;
  }
  return { x, y };
}

// Cancel on the banner ("canceled_by_user"), the tab closing ("target_closed"),
// or devtools taking the target ("replaced_with_devtools") all detach us
// out-of-band. Any of them is an authoritative session end — reset and notify.
chrome.debugger.onDetach.addListener((source, reason) => {
  if (session && source && source.tabId === session.tabId) {
    const endedTab = session.tabId;
    session = null;
    childSessions.clear();
    clearSession(); // authoritative end (banner cancel / tab closed) — no recovery
    if (onSessionEnd) {
      try {
        onSessionEnd(reason, endedTab);
      } catch (error) {
        console.warn("[DG cobrowse] session-end handler threw", error);
      }
    }
  }
});

// Cross-frame discovery: with flat auto-attach on, each cross-origin (OOPIF) frame
// arrives as `Target.attachedToTarget` carrying its own `sessionId`. Record it,
// enable perception domains on that child session, and recurse auto-attach so
// nested OOPIFs surface too. `Target.detachedFromTarget` removes it.
chrome.debugger.onEvent.addListener((source, method, params) => {
  if (!session || !source || source.tabId !== session.tabId) return;
  if (method === "Target.attachedToTarget") {
    const sessionId = params && params.sessionId;
    const info = params && params.targetInfo;
    if (!sessionId || !info) return;
    childSessions.set(sessionId, {
      targetId: info.targetId,
      type: info.type,
      url: info.url,
      parentSessionId: source.sessionId, // undefined when the parent is the top frame
    });
    (async () => {
      for (const domain of DOMAINS_ON_ATTACH) {
        try {
          await sendCommand({ tabId: session.tabId, sessionId }, domain);
        } catch {
          // a non-document target (worker, etc.) may not support a domain — fine
        }
      }
      try {
        await sendCommand({ tabId: session.tabId, sessionId }, "Target.setAutoAttach", {
          autoAttach: true,
          waitForDebuggerOnStart: false,
          flatten: true,
        });
      } catch {
        // best-effort recursion for nested OOPIFs
      }
    })();
  } else if (method === "Target.detachedFromTarget") {
    if (params && params.sessionId) childSessions.delete(params.sessionId);
  }
});
