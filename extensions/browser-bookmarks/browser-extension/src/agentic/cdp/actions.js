// Action pipeline — Phase 2b Slice 3b (the actionability band-aids as ONE path).
//
// Every action routes through the same pre-flight, per the plan's §"Interaction
// reliability":
//   resolveFresh → DOM.scrollIntoViewIfNeeded → hit-test gate → Input.dispatch
// so click / hover / type all inherit viewport + nested-scroll, detach/re-render,
// layout-shift, covered, and degenerate handling from the same code. The trusted
// Input.* dispatch is the ONLY part that MUST be CDP (an in-page .click() is
// untrusted and many handlers ignore it); resolve / scroll / hit-test lean on
// in-page DOM APIs where they're ergonomic. Deferred to the playwright-crx swap:
// rich editors, controlled/masked inputs, autocomplete key-sequences.

import { send, frameOffset } from "./executor.js";
import { getA11ySnapshot, currentUrl } from "./snapshot.js";

// Normalize an accessible name the way the platform/Playwright does: collapse ALL
// internal whitespace (newlines, tabs, double-spaces from concatenated card text)
// to single spaces, trim, lowercase. `trim()` alone only strips the ends — decorated
// names carry internal whitespace, so that must collapse too.
const normName = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

// Match nodes by role (+ optional accessible name) in THREE tiers of decreasing
// precision — the first tier that yields any hit wins:
//   1. EXACT (normalized) — precise; the only tier when `exact:true`.
//   2. STARTS-WITH — the target label leads the accessible name. This is the tier
//      that matters on real pages: sites concatenate the whole card into one node's
//      name (LinkedIn makes each job card a single button named
//      "Solutions Engineer … Dismiss Solutions Engineer job … Posted 1mo ago"), and
//      the meaningful label leads. Preferring starts-with also excludes the
//      DESTRUCTIVE sibling — "Dismiss Solutions Engineer job" contains the title but
//      doesn't START with it, so targeting "Solutions Engineer" can't hit Dismiss.
//   3. SUBSTRING — last resort; the label sits mid-name.
// All tiers are whitespace-normalized + case-insensitive (Playwright getByRole
// name semantics, extended with the starts-with tier for concatenated names).
// Shared by resolveFresh (act) AND the dev-harness find (preview) so the two can't
// drift — a "surprise miss" the preview can't reproduce would be its own bug.
export function matchByRoleName(nodes, { role, name, exact } = {}) {
  const want = normName(name);
  const byRole = (nodes || []).filter(
    (n) => n.backendDOMNodeId != null && (!role || n.role === role),
  );
  if (!want) return byRole;
  const exactHits = byRole.filter((n) => normName(n.name) === want);
  if (exactHits.length || exact) return exactHits;
  const prefixHits = byRole.filter((n) => normName(n.name).startsWith(want));
  if (prefixHits.length) return prefixHits;
  return byRole.filter((n) => normName(n.name).includes(want));
}

// resolveFresh: re-read the AX tree and re-match by role+name RIGHT NOW — never
// act on a cached backendDOMNodeId (kills the detach / re-render Category-B miss,
// and re-derives coordinates so a layout shift can't misplace the click).
// Duplicate role+name is the flagged residual → caller disambiguates with `nth`.
export async function resolveFresh({ role, name, nth, exact } = {}) {
  const nodes = await getA11ySnapshot();
  const matches = matchByRoleName(nodes, { role, name, exact });
  if (matches.length === 0) {
    throw new Error(
      `no element matching role=${role || "*"} name~="${name || ""}" (tried exact then substring — run find() to see available names)`,
    );
  }
  if (matches.length > 1 && nth == null) {
    throw new Error(
      `ambiguous: ${matches.length} match role=${role || "*"} name~="${name || ""}" — pass nth (0-based), or use find() to pick`,
    );
  }
  const chosen = nth == null ? matches[0] : matches[nth];
  if (!chosen) throw new Error(`nth=${nth} out of range (${matches.length} matches)`);
  // sessionId is set for cross-frame (OOPIF) nodes → the pipeline resolves/scrolls
  // in that child session and translates the click to root coords (Slice 3c-2).
  return { backendDOMNodeId: chosen.backendDOMNodeId, sessionId: chosen.sessionId };
}

// Scroll the element into view (the native primitive walks nested scroll parents
// itself), then hit-test at its LIVE center: is the topmost element there the
// target or a descendant? If not, it's covered. Returns trusted-input coords.
async function scrollAndHitTest(backendNodeId, sessionId) {
  await send("DOM.scrollIntoViewIfNeeded", { backendNodeId }, sessionId).catch(() => {
    // hidden / no layout box — let the hit-test report the specific reason
  });
  const resolved = await send("DOM.resolveNode", { backendNodeId }, sessionId);
  const objectId = resolved && resolved.object && resolved.object.objectId;
  if (!objectId) throw new Error("could not resolve element (detached?)");
  const evalResult = await send(
    "Runtime.callFunctionOn",
    {
      objectId,
      returnByValue: true,
      functionDeclaration: `function () {
        const r = this.getBoundingClientRect();
        if (!r.width || !r.height) return { ok: false, reason: "element has zero size (hidden/collapsed)" };
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const top = document.elementFromPoint(x, y);
        const hit = top === this || (top && this.contains(top));
        return { ok: !!hit, x, y, reason: hit ? "" : "element is covered by another element" };
      }`,
    },
    sessionId,
  );
  const v = evalResult && evalResult.result && evalResult.result.value;
  if (!v || !v.ok) throw new Error(v ? v.reason : "hit-test failed");
  return { x: v.x, y: v.y }; // frame-local coords
}

// resolve → scroll → hit-test in the element's OWN frame, then translate a
// cross-frame element's frame-local center to ROOT coords (add the owning iframe
// offsets) so the trusted Input we dispatch on the root session lands correctly.
async function preflight(target) {
  const { backendDOMNodeId, sessionId } = await resolveFresh(target);
  const local = await scrollAndHitTest(backendDOMNodeId, sessionId);
  if (!sessionId) return local;
  const off = await frameOffset(sessionId);
  return { x: local.x + off.x, y: local.y + off.y };
}

function mouse(type, x, y, extra) {
  return send("Input.dispatchMouseEvent", { type, x, y, ...extra });
}

// Trusted click: move (fires hover/mouseover) → press → release.
export async function click(target) {
  const { x, y } = await preflight(target);
  await mouse("mouseMoved", x, y);
  await mouse("mousePressed", x, y, { button: "left", buttons: 1, clickCount: 1 });
  await mouse("mouseReleased", x, y, { button: "left", buttons: 0, clickCount: 1 });
  return { ok: true, x, y };
}

// Trusted hover: a real mouseMoved to the element center — fires native :hover and
// opens JS hover menus (the Category-B parity point vs untrusted synthetic events).
export async function hover(target) {
  const { x, y } = await preflight(target);
  await mouse("mouseMoved", x, y);
  return { ok: true, x, y };
}

// Inject a self-updating "browsing timer" overlay on the page (T1) — the user
// watches it count down while reviewing this page during a timed iteration. It
// runs its OWN interval and removes itself when time is up, so this returns
// immediately (the bridge round-trip must not block for the whole wait; the
// caller/engine owns the actual sleep). `label` prefixes the countdown.
export async function showTimer({ seconds = 60, label } = {}) {
  const s = Math.max(1, Math.min(3600, Math.round(seconds)));
  const prefix = typeof label === "string" && label ? `${label} — ` : "";
  const expr = `(function(){
    var id='dg-cobrowse-timer';
    var old=document.getElementById(id); if(old&&old.__dgIv){clearInterval(old.__dgIv);} if(old){old.remove();}
    var el=document.createElement('div'); el.id=id;
    el.style.cssText='position:fixed;top:12px;right:12px;z-index:2147483647;background:rgba(180,83,9,.96);color:#fff;font:600 13px/1 system-ui,-apple-system,sans-serif;padding:9px 13px;border-radius:9999px;box-shadow:0 2px 10px rgba(0,0,0,.35);pointer-events:none;letter-spacing:.2px';
    document.documentElement.appendChild(el);
    var left=${s};
    function fmt(n){var m=Math.floor(n/60),x=n%60;return m+':'+(x<10?'0':'')+x;}
    function tick(){ el.textContent=${JSON.stringify(prefix)}+fmt(Math.max(0,left))+' left'; if(left<=0){clearInterval(el.__dgIv); el.remove(); return;} left--; }
    tick(); el.__dgIv=setInterval(tick,1000);
    return true;
  })()`;
  await send("Runtime.evaluate", { expression: expr });
  return { ok: true, seconds: s };
}

// Go BACK to the previous page (T2) — undo a navigation, e.g. return to a list
// after viewing one item's detail page.
export async function back() {
  await send("Runtime.evaluate", { expression: "history.back(); true" });
  return { ok: true };
}

// Remove the timer overlay early (e.g. the wait was cut short).
export async function clearTimer() {
  await send("Runtime.evaluate", {
    expression:
      "(function(){var e=document.getElementById('dg-cobrowse-timer'); if(e){if(e.__dgIv)clearInterval(e.__dgIv); e.remove();} return true;})()",
  }).catch(() => {});
  return { ok: true };
}

// Scroll the page to reveal lazy / virtualized content (R2 "assess & adapt"). A
// viewport-step scroll via the page's own scroller; the caller re-snapshots after
// to see what newly rendered. `to:"bottom"|"top"` jumps to an end. Returns
// `atBottom` so the agent knows when there's nothing left to reveal.
export async function scroll({ direction = "down", to } = {}) {
  const expr =
    to === "bottom"
      ? "window.scrollTo(0, document.body.scrollHeight)"
      : to === "top"
        ? "window.scrollTo(0, 0)"
        : `window.scrollBy(0, ${direction === "up" ? -900 : 900})`;
  const evalResult = await send("Runtime.evaluate", {
    expression: `(function(){ ${expr}; return { scrollY: Math.round(window.scrollY), scrollHeight: document.body.scrollHeight, innerHeight: window.innerHeight }; })()`,
    returnByValue: true,
  });
  const v = (evalResult && evalResult.result && evalResult.result.value) || {};
  const atBottom =
    typeof v.scrollY === "number" &&
    typeof v.innerHeight === "number" &&
    typeof v.scrollHeight === "number" &&
    v.scrollY + v.innerHeight >= v.scrollHeight - 5;
  return { ok: true, atBottom };
}

// Slice 3d — AUTOMATIC scroll-collect: gather a long / virtualized list in ONE
// call so the model doesn't have to scroll-and-re-read manually. Snapshot →
// scroll → settle → snapshot → dedupe, until the page bottoms out or the set
// stops growing (or a scroll cap). Dedupe by a STABLE semantic key (role+name+
// value) — NOT group/backendDOMNodeId, which change as virtualized rows recycle.
export async function collectAll({ maxScrolls = 20 } = {}) {
  const seen = new Map();
  const absorb = (nodes) => {
    for (const n of nodes || []) {
      const key = `${n.role}|${n.name}|${n.value ?? ""}`;
      if (!seen.has(key)) seen.set(key, n);
    }
  };
  let lastSize = -1;
  let stable = 0;
  for (let i = 0; i < maxScrolls; i++) {
    absorb(await getA11ySnapshot());
    const res = await scroll({ direction: "down" });
    await new Promise((r) => setTimeout(r, 550)); // let lazy rows render
    if (res.atBottom) {
      absorb(await getA11ySnapshot()); // one more after reaching the end
      break;
    }
    if (seen.size === lastSize) {
      if (++stable >= 2) break; // set stopped growing across 2 scrolls
    } else {
      stable = 0;
      lastSize = seen.size;
    }
  }
  return { nodes: [...seen.values()], url: await currentUrl() };
}

// Basic text entry: focus (click) then insertText. Good enough for plain inputs /
// search boxes; controlled/masked inputs + rich editors need per-keystroke fidelity
// and are a playwright-crx swap trigger. Appends at the cursor (no clear yet).
export async function type(target, text) {
  const { x, y } = await preflight(target);
  await mouse("mouseMoved", x, y);
  await mouse("mousePressed", x, y, { button: "left", buttons: 1, clickCount: 1 });
  await mouse("mouseReleased", x, y, { button: "left", buttons: 0, clickCount: 1 });
  await send("Input.insertText", { text: String(text == null ? "" : text) });
  return { ok: true };
}
