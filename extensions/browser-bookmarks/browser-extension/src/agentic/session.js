// Session / tab manager — Phase 2b Slice 5b.
//
// Implements the resolved TOPOLOGY: default = an agent-owned tab the agent opens
// and drives; if the user references an existing tab, a LEAN metadata search
// proposes candidates to attach to (approval is the caller's/AI's job); an
// explicit tab list backs "pick a tab." Binding is to the tabId (see the cdp
// executor), decoupled from user focus; `reveal` teleports the bound tab forward.
//
// These are chrome.tabs operations (background-context), layered on the cdp
// executor. URL policy (SSRF/private-net) is gated by the caller before `open`.

import { attach, detach, getSession } from "./cdp/index.js";

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
