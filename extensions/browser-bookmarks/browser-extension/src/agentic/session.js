// Session / tab manager — Phase 2b Slice 5b.
//
// Implements the TOPOLOGY as amended 2026-08-17: default = BIND the page the
// user is on (see startSession); an agent-owned tab is opened only on an explicit
// ask or when the requested url is on a different site than the user's page. If
// the user references some other existing tab, a LEAN metadata search proposes
// candidates to attach to (approval is the caller's/AI's job); an explicit tab
// list backs "pick a tab." Binding is to the tabId (see the cdp executor),
// decoupled from user focus; `reveal` teleports the bound tab forward.
//
// These are chrome.tabs operations (background-context), layered on the cdp
// executor. URL policy (SSRF/private-net) is gated by the caller before `open`.

import { attach, detach, getSession, ensureSession } from "./cdp/index.js";

// ── Bind-first target resolution (owner rule, 2026-08-17) ────────────────────
// The page the user is ON is the default co-browse target. A fresh agent-owned
// tab is the exception: only when the caller explicitly asks for one (`newTab`),
// or when the requested url is an obvious mismatch for the user's page (a
// different site). This is decided HERE, from real tab facts, so no prompt
// phrasing, retry, or recovery message can produce a duplicate tab.

// "Same site" for mismatch purposes: same host modulo a leading `www.`. A path or
// query difference is NOT a mismatch — the user's own page state (filters, a
// personalized list, a signed-in view) is exactly what binding preserves; the
// agent can `navigate` within the bound tab if it truly needs a different path.
export function sameSite(a, b) {
  try {
    const host = (u) => new URL(u).hostname.toLowerCase().replace(/^www\./, "");
    return host(a) === host(b);
  } catch {
    return false;
  }
}

function isWebUrl(url) {
  return /^https?:/i.test(url || "");
}

// The active tab of the PANEL's window (windowId comes from the panel host — the
// side panel is per-window, and the user's focus can be elsewhere mid-run). Falls
// back to the last-focused window when no windowId was given.
export async function resolveActiveTab(windowId) {
  const query =
    typeof windowId === "number" ? { active: true, windowId } : { active: true, lastFocusedWindow: true };
  try {
    const [tab] = await chrome.tabs.query(query);
    if (tab) return tab;
  } catch {
    // e.g. the window is gone — fall through to the broad query.
  }
  const tabs = await chrome.tabs.query({ active: true });
  return tabs.find((t) => isWebUrl(t.url)) || tabs[0] || null;
}

async function tabInfo(tabId) {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    return null;
  }
}

// Bind `tabId`, REPLACING a session on another tab instead of refusing. The
// executor's attach keeps its single-session invariant strict (that is a safety
// property); this is the session-manager policy for the AI's "use this page" ask,
// where an existing session on some other tab is stale intent, not a conflict.
export async function bindTab(tabId) {
  const current = getSession();
  let previousTabId = null;
  if (current && current.tabId !== tabId) {
    previousTabId = current.tabId;
    await detach();
  }
  const data = await attach(tabId);
  return { ...data, tabId, opened: false, ...(previousTabId != null ? { previousTabId } : {}) };
}

// Start (or continue) a co-browse session, bind-first:
//   1. no `newTab` and the user's ACTIVE tab is a web page on the same site as
//      `url` (or no url) → bind that tab in place (no new tab, no reload);
//   2. else an EXISTING session whose tab is still open on the same site → keep
//      driving it (mid-run re-open / recovery must not spawn a sibling tab);
//   3. else → open a new agent-owned tab (`url` required).
// Returns { tabId, opened, bound: "active"|"session"|null, url, previousTabId? }.
export async function startSession(url, { active = true, newTab = false, windowId } = {}) {
  if (!newTab) {
    const activeTab = await resolveActiveTab(windowId);
    const activeOk = activeTab && isWebUrl(activeTab.url) && (!url || sameSite(url, activeTab.url));
    if (activeOk) {
      const data = await bindTab(activeTab.id);
      return { ...data, bound: "active", url: activeTab.url || "" };
    }
    const existing = await ensureSession();
    if (existing) {
      const tab = await tabInfo(existing.tabId);
      if (tab && isWebUrl(tab.url) && (!url || sameSite(url, tab.url))) {
        const data = await attach(existing.tabId); // idempotent
        return { ...data, tabId: existing.tabId, opened: false, bound: "session", url: tab.url || "" };
      }
    }
    if (!url) {
      const where = activeTab && activeTab.url ? ` (${activeTab.url})` : "";
      throw new Error(
        `The user's current tab is not a web page${where}, so there is nothing to bind. Ask which page they mean, or pass a url to open one.`,
      );
    }
  }
  const data = await openAndAttach(url, { active });
  return { ...data, bound: null, url };
}

// Resolve once `tabId` finishes loading (status "complete") or after a cap — so we
// attach to a LOADED tab, never one mid-initial-navigation.
function waitForTabComplete(tabId, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
      resolve();
    };
    const onUpdated = (id, info) => {
      if (id === tabId && info.status === "complete") finish();
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    // Guard: it may already be "complete" before the listener attached.
    chrome.tabs.get(tabId, (t) => {
      if (!chrome.runtime.lastError && t && t.status === "complete") finish();
    });
    const timer = setTimeout(finish, timeoutMs);
  });
}

// Open a NEW tab the agent owns and attach to it (the default topology). Replaces
// any current session — the agent works one target at a time. Caller SSRF-gates
// the URL first. `active:true` (default) foregrounds it so the user sees the agent
// start; focus emulation (in attach) keeps it live if they switch away.
//
// Let the browser load the page NATIVELY, then attach to the LOADED tab — the two
// things already proven to work (manual navigation + attaching an open tab). This
// sidesteps the debugger racing the initial navigation (which blanked the page) and
// the CDP-navigate-a-blank-tab quirk. URL is policy-gated upstream.
export async function openAndAttach(url, { active = true } = {}) {
  if (getSession()) await detach();
  const tab = await chrome.tabs.create({ url, active });
  await waitForTabComplete(tab.id);
  const data = await attach(tab.id);
  return { ...data, tabId: tab.id, opened: true };
}

// Teleport: bring the bound tab (and its window) to the foreground so the user
// can watch. The banner already marks which tab is driven; this is the "show me"
// affordance.
export async function revealSession() {
  const session = getSession();
  if (!session) throw new Error("no active co-browse session to reveal");
  const tab = await chrome.tabs.update(session.tabId, { active: true });
  if (tab && tab.windowId != null) {
    try {
      await chrome.windows.update(tab.windowId, { focused: true });
    } catch {
      // window focus is best-effort (e.g. minimized)
    }
  }
  return { tabId: session.tabId };
}

// Enumerate the user's open http(s) tabs (metadata only) — backs "pick a tab."
export async function listTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((t) => /^https?:/.test(t.url || ""))
    .map((t) => ({
      tabId: t.id,
      title: t.title || "",
      url: t.url || "",
      favIconUrl: t.favIconUrl || null,
      active: !!t.active,
      windowId: t.windowId,
    }));
}

// Lean tab-metadata resolution (TOPOLOGY: "which tab did you mean?"). Token
// overlap against title + URL — cheap, no fuzzy library, so a 40-tab window
// doesn't pay for it. Returns ranked candidates for the agent to PROPOSE; the
// user approves before we attach (approval is the caller's job).
export async function resolveTab(query) {
  const q = String(query || "").toLowerCase().trim();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const tabs = await listTabs();
  const scored = tabs.map((t) => {
    const title = t.title.toLowerCase();
    const hay = `${title} ${t.url.toLowerCase()}`;
    let score = 0;
    for (const term of terms) {
      if (hay.includes(term)) score += 1;
      if (title.includes(term)) score += 1; // weight title matches over URL
    }
    return { ...t, score };
  });
  return scored
    .filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
