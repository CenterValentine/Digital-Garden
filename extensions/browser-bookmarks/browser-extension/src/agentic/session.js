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

// Open a NEW tab the agent owns and attach to it (the default topology). Replaces
// any current session — the agent works one target at a time. Caller SSRF-gates
// the URL first. `active:true` (default) foregrounds it so the user sees the
// agent start; focus emulation (in attach) keeps it live if they switch away.
export async function openAndAttach(url, { active = true } = {}) {
  if (getSession()) await detach();
  const tab = await chrome.tabs.create({ url, active });
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
