// A11y snapshot — Phase 2b perception layer (D-TGT: accessibility-tree-first).
//
// Turns Accessibility.getFullAXTree into a compact, model-friendly list of the
// INTERACTABLE + meaningful nodes on the page — the surface the agent selects
// targets from (by role + name), and the source of the `expanded` / `disabled`
// states the actionability band-aids read (see the plan's §"Interaction
// reliability"). Shadow DOM is transparent here — the AX tree crosses shadow
// boundaries natively, which is exactly why a11y-first targeting sidesteps
// Playwright's shadow-piercing selectors (Category B, resolved cheaply).

import { send, getChildSessions, getSession, ensureSession, NO_SESSION_MESSAGE } from "./executor.js";

// Roles the agent can act on. Deliberately broad but not exhaustive.
const INTERACTABLE_ROLES = new Set([
  "button", "link", "textbox", "searchbox", "checkbox", "radio", "combobox",
  "listbox", "option", "menuitem", "menuitemcheckbox", "menuitemradio", "tab",
  "switch", "slider", "spinbutton", "treeitem", "disclosuretriangle",
]);

// Structural / landmark roles kept purely for ORIENTATION (where am I on the
// page). Everything NOT in these two sets — StaticText, ListMarker, generic,
// decorative image, paragraph — is dropped: it's reading content, and reading is
// the Phase 0/1 tools' job, not the action-targeting snapshot's. Allowlist, not
// denylist, so new noisy roles don't silently bloat the snapshot.
const ORIENTATION_ROLES = new Set([
  "heading", "navigation", "banner", "main", "contentinfo", "complementary",
  "region", "search", "form", "article", "dialog", "alertdialog", "alert",
  "status", "tablist",
]);

function propValue(node, name) {
  const p = (node.properties || []).find((x) => x.name === name);
  return p && p.value ? p.value.value : undefined;
}

// A link's destination, from the AX tree's `url` property. This is the one
// datum that makes list-page enumeration REAL: propose_item_iteration wants a
// per-item URL, and without hrefs in the snapshot a model "helpfully"
// fabricates them by incrementing ids (observed live: sequential
// /jobs/view/438941904x URLs, all nonexistent). Tracking-bloated URLs get
// their query stripped rather than truncated — a cut URL is a fabricated URL.
const MAX_HREF_LENGTH = 600; // matches the iteration tool's url cap
// Known tracking params, stripped before hrefs reach the model (S7-C1) —
// mirrors stripTrackingParams in the app's co-browse-tools.ts. Functional
// params (LinkedIn currentJobId etc.) are preserved.
const TRACKING_PARAMS = new Set([
  "eBP", "trackingId", "refId", "origin", "originToLandingJobPostings",
  "gclid", "fbclid", "mc_cid", "mc_eid", "igshid", "_hsenc", "_hsmi",
  "vero_id", "ref_src",
]);
function stripTracking(raw) {
  try {
    const u = new URL(raw);
    let changed = false;
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key) || key.startsWith("utm_")) {
        u.searchParams.delete(key);
        changed = true;
      }
    }
    return changed ? u.toString() : raw;
  } catch {
    return raw;
  }
}
function linkHref(node, role) {
  if (role !== "link") return undefined;
  const rawValue = propValue(node, "url");
  if (typeof rawValue !== "string" || !rawValue) return undefined;
  const raw = stripTracking(rawValue);
  if (raw.length <= MAX_HREF_LENGTH) return raw;
  try {
    const u = new URL(raw);
    const bare = `${u.origin}${u.pathname}`;
    return bare.length <= MAX_HREF_LENGTH ? bare : undefined;
  } catch {
    return undefined;
  }
}

// Compact one AX node to the fields targeting + the band-aids need.
function normalize(node) {
  const role = node.role && node.role.value;
  const name = ((node.name && node.name.value) || "").trim();
  const interactable = INTERACTABLE_ROLES.has(role);
  // Keep only action targets + the orientation skeleton; drop leaf text/markers.
  if (!interactable && !ORIENTATION_ROLES.has(role)) return null;

  const expanded = propValue(node, "expanded"); // true | false | undefined
  const href = linkHref(node, role);
  return {
    // The stable handle every later slice resolves through (getBoxModel /
    // scrollIntoViewIfNeeded / getNodeForLocation).
    backendDOMNodeId: node.backendDOMNodeId,
    role,
    name,
    ...(node.value && node.value.value ? { value: node.value.value } : {}),
    ...(href ? { href } : {}),
    // Accordion/disclosure state — a PROPERTY read, not a pixel heuristic. Drives
    // the expand-collapsed pre-scrape pass (Slice 3d).
    ...(expanded === true || expanded === false ? { expanded } : {}),
    ...(propValue(node, "disabled") === true ? { disabled: true } : {}),
    ...(propValue(node, "focusable") === true ? { focusable: true } : {}),
    ...(role === "heading" ? { level: propValue(node, "level") } : {}),
    ...(interactable ? { interactable: true } : {}),
  };
}

// Fine-grained CONTAINER roles: the nearest one up the tree groups related
// elements — a job card + its apply button, a story row + its comments link.
// Deliberately NOT coarse landmarks (main/list/nav/region) — those would lump the
// whole page into one useless group. A node with no such ancestor (top-level nav /
// page chrome) simply gets no `group`. This restores the relational structure the
// FLAT snapshot loses, which is what let the model mis-associate elements.
const GROUPING_ROLES = new Set([
  "row",
  "listitem",
  "article",
  "gridcell",
  "cell",
  "group",
  "figure",
  "form",
  "tabpanel",
]);

// Captcha / anti-bot challenge frames. NARROW and challenge-specific on purpose —
// these are cross-origin OOPIFs whose interactable nodes (the "I'm not a robot"
// checkbox, a challenge button) must NEVER enter the actionable set: the standard is
// captcha = detect + hand to a human, never act (plan §"Interaction reliability").
// We still DETECT them (detectChallenges) so the model can pause. Kept deliberately
// short; anti-bot fingerprint frames that carry no interactable content don't need
// to be here (they surface nothing to act on) — this list is only what could be
// mis-clicked. Matched as substrings against the frame's origin/url.
const CHALLENGE_FRAME_PATTERNS = [
  "google.com/recaptcha",
  "recaptcha.net",
  "hcaptcha.com",
  "challenges.cloudflare.com", // Turnstile
  "arkoselabs.com",
  "funcaptcha.com",
  "captcha-delivery.com", // DataDome
  "px-cdn.net",
  "perimeterx.net", // PerimeterX / HUMAN
];

function isChallengeFrame(url) {
  if (!url) return false;
  const u = url.toLowerCase();
  return CHALLENGE_FRAME_PATTERNS.some((p) => u.includes(p));
}

// ACTIVE, user-facing challenge frames — a NARROWER set than the suppression list
// above. This is what raises `captchaDetected` (which HALTS the run), so it must
// match only a challenge actually presented to the user, NOT the ambient,
// invisible bot-scoring frames many sites load on every page. The false positive
// this fixes (observed live): LinkedIn loads reCAPTCHA Enterprise's `anchor` frame
// ambiently on jobs pages — no challenge shown — which halted a co-browse run.
// reCAPTCHA: `bframe` is the challenge popup; `anchor`/api.js/webworker are
// ambient. hCaptcha / FunCaptcha / DataDome challenge frames are interactive by
// nature. Ambient scorers (PerimeterX, Turnstile-managed, reCAPTCHA v3) are
// excluded here — their nodes are still suppressed above, they just don't HALT.
const ACTIVE_CHALLENGE_PATTERNS = [
  "/recaptcha/api2/bframe",
  "/recaptcha/enterprise/bframe",
  "hcaptcha.com/captcha",
  "arkoselabs.com",
  "funcaptcha.com",
  "captcha-delivery.com", // DataDome interactive challenge
];

function isActiveChallengeFrame(url) {
  if (!url) return false;
  const u = url.toLowerCase();
  return ACTIVE_CHALLENGE_PATTERNS.some((p) => u.includes(p));
}

// Which currently-attached child frames are ACTIVE captcha challenges — a pure URL
// read over getChildSessions (no AX call). Callers surface `captchaDetected` so the
// model STOPS and hands to the user. Uses the NARROW active-challenge test (not the
// broad suppression list) so ambient bot-scoring frames don't falsely halt a run.
export function detectChallenges() {
  const frames = getChildSessions()
    .filter((f) => isActiveChallengeFrame(f.url))
    .map((f) => f.url);
  return { captchaDetected: frames.length > 0, frames };
}

// The extension's own overlay (jump menu, panel toggles, pin/link buttons) is
// page chrome WE inject — it must never enter the agent's perception. It read
// as page UI in a live run ("Open panel and file tree", "Pin this page to the
// selected folder" in a LinkedIn snapshot), inviting the model to act on our
// own controls. Resolve the host's backendNodeId so its whole AX subtree can
// be dropped. Top frame only — the overlay is a top-document content script.
const OVERLAY_HOST_SELECTOR = "#dg-browser-overlay-root";
async function overlayBackendNodeId() {
  try {
    const doc = await send("DOM.getDocument", { depth: 1 });
    const q = await send("DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector: OVERLAY_HOST_SELECTOR,
    });
    if (!q || !q.nodeId) return undefined;
    const d = await send("DOM.describeNode", { nodeId: q.nodeId });
    return d && d.node ? d.node.backendNodeId : undefined;
  } catch {
    return undefined; // best-effort — a missing overlay just means nothing to drop
  }
}

// Extension-owned UI frames: the embedded app surfaces the overlay mounts
// (/embed/panel, /embed/tree, /embed/content/...) and any chrome-extension://
// page. They are OUR UI, not page content — perceiving them lets the agent
// "read" the user's own Digital Garden through the co-browse tab.
function isExtensionUiFrame(url) {
  if (!url) return false;
  if (url.startsWith("chrome-extension://")) return true;
  try {
    return new URL(url).pathname.startsWith("/embed/");
  } catch {
    return false;
  }
}

async function collectFrame(out, groupState, sessionId, frameUrl, excludeBackendId) {
  let result;
  try {
    result = await send("Accessibility.getFullAXTree", undefined, sessionId);
  } catch {
    return; // frame may be mid-navigation / detached — skip it, don't fail the snapshot
  }
  const nodes = (result && result.nodes) || [];
  const byId = new Map();
  for (const n of nodes) byId.set(n.nodeId, n);
  // Drop the excluded host's entire AX subtree (childIds BFS — the AX tree
  // crosses the overlay's closed shadow root, so ancestry walks find it).
  let excludedIds;
  if (excludeBackendId != null) {
    const hostAx = nodes.find((n) => n.backendDOMNodeId === excludeBackendId);
    if (hostAx) {
      excludedIds = new Set();
      const queue = [hostAx.nodeId];
      while (queue.length) {
        const id = queue.pop();
        if (excludedIds.has(id)) continue;
        excludedIds.add(id);
        const n = byId.get(id);
        for (const c of (n && n.childIds) || []) queue.push(c);
      }
    }
  }
  // Nearest grouping-container ancestor → a compact group number shared across the
  // whole snapshot, so elements in the same card/row carry the same `group`.
  const groupFor = new Map(); // ancestor nodeId -> group number
  const resolveGroup = (node) => {
    let cur = node.parentId ? byId.get(node.parentId) : undefined;
    while (cur) {
      const role = cur.role && cur.role.value;
      if (GROUPING_ROLES.has(role)) {
        let g = groupFor.get(cur.nodeId);
        if (g === undefined) {
          g = ++groupState.counter;
          groupFor.set(cur.nodeId, g);
        }
        return g;
      }
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return undefined;
  };
  for (const node of nodes) {
    if (node.ignored) continue;
    if (excludedIds && excludedIds.has(node.nodeId)) continue;
    const normalized = normalize(node);
    if (!normalized) continue;
    const group = resolveGroup(node);
    if (group !== undefined) normalized.group = group;
    // Tag cross-frame nodes so resolveFresh can gate acting on them (3c-2) while
    // they're still READABLE now (3c-1).
    if (sessionId) {
      normalized.sessionId = sessionId;
      if (frameUrl) normalized.frameUrl = frameUrl;
    }
    out.push(normalized);
  }
}

// The full interactable+named node list for the active session's page, stitched
// across the top frame AND every cross-origin (OOPIF) child frame (Slice 3c-1) —
// so an embedded Greenhouse/Lever board's content is visible, not a black box.
// Each node carries a `group` (nearest container) so related elements cluster;
// cross-frame nodes carry `sessionId`/`frameUrl`.
export async function getA11ySnapshot() {
  // Self-heal a session lost to SW eviction (ensureSession re-attaches to the
  // persisted tab), then fail LOUD if there's genuinely nothing. An empty snapshot
  // when nothing is attached is a lie that reads as "no matches found" — the guard
  // must throw here (collectFrame swallows per-frame errors, so relying on send()'s
  // recovery inside the loop would silently return []).
  if (!getSession()) {
    await ensureSession();
    if (!getSession()) throw new Error(NO_SESSION_MESSAGE);
  }
  const out = [];
  const groupState = { counter: 0 };
  // Top frame — with the extension's own overlay subtree excluded.
  const overlayId = await overlayBackendNodeId();
  await collectFrame(out, groupState, undefined, undefined, overlayId);
  for (const frame of getChildSessions()) {
    // Only DOCUMENT frames carry an AX tree. Flat auto-attach also surfaces non-DOM
    // targets — e.g. a reCAPTCHA/anti-bot webworker (seen live on LinkedIn) — where
    // getFullAXTree is a no-op; skip them so we don't attach perception to a worker.
    if (frame.type && frame.type !== "iframe") continue;
    // Never let a captcha/challenge frame's nodes enter the actionable set — the
    // agent must not target a captcha (detectChallenges surfaces the pause signal).
    if (isChallengeFrame(frame.url)) continue;
    // Never perceive the extension's own embedded app surfaces as page content.
    if (isExtensionUiFrame(frame.url)) continue;
    await collectFrame(out, groupState, frame.sessionId, frame.url);
  }
  return out;
}

// The bound tab's current top-frame URL — one input to "what happened after that
// click" (paired with `currentDocId` below). Best-effort.
export async function currentUrl() {
  try {
    const r = await send("Runtime.evaluate", { expression: "location.href", returnByValue: true });
    return (r && r.result && typeof r.result.value === "string" && r.result.value) || "";
  } catch {
    return "";
  }
}

// DOCUMENT identity — the top frame's CDP `loaderId`, which changes exactly when
// a new document loads and stays put across in-place SPA updates (pushState /
// query-string mutations, hash changes). "Did the URL change?" is a lossy proxy
// for "did a new page open?": results pages routinely rewrite the query string
// while loading a detail IN PLACE (the list is still there — no `back` needed),
// and `history.back()` after a real navigation reloads a list page that may
// re-rank. Comparing docIds across snapshots is the site-agnostic answer; the
// engine turns it into `documentChanged` for the model. Best-effort ("" when
// unavailable — callers treat unknown as "compare URLs").
export async function currentDocId() {
  try {
    const r = await send("Page.getFrameTree");
    const id = r && r.frameTree && r.frameTree.frame && r.frameTree.frame.loaderId;
    return typeof id === "string" ? id : "";
  } catch {
    return "";
  }
}
