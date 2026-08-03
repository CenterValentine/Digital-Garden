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

import { send } from "./executor.js";
import { getA11ySnapshot } from "./snapshot.js";

// resolveFresh: re-read the AX tree and re-match by role+name RIGHT NOW — never
// act on a cached backendDOMNodeId (kills the detach / re-render Category-B miss,
// and re-derives coordinates so a layout shift can't misplace the click).
// Duplicate role+name is the flagged residual → caller disambiguates with `nth`.
export async function resolveFresh({ role, name, nth } = {}) {
  const wantName = (name || "").trim().toLowerCase();
  const nodes = await getA11ySnapshot();
  const matches = nodes.filter(
    (n) =>
      n.backendDOMNodeId != null &&
      (!role || n.role === role) &&
      (!wantName || (n.name || "").trim().toLowerCase() === wantName),
  );
  if (matches.length === 0) {
    throw new Error(`no element matching role=${role || "*"} name="${name || ""}"`);
  }
  if (matches.length > 1 && nth == null) {
    throw new Error(
      `ambiguous: ${matches.length} match role=${role || "*"} name="${name || ""}" — pass nth (0-based)`,
    );
  }
  const chosen = nth == null ? matches[0] : matches[nth];
  if (!chosen) throw new Error(`nth=${nth} out of range (${matches.length} matches)`);
  return chosen.backendDOMNodeId;
}

// Scroll the element into view (the native primitive walks nested scroll parents
// itself), then hit-test at its LIVE center: is the topmost element there the
// target or a descendant? If not, it's covered. Returns trusted-input coords.
async function scrollAndHitTest(backendNodeId) {
  await send("DOM.scrollIntoViewIfNeeded", { backendNodeId }).catch(() => {
    // hidden / no layout box — let the hit-test report the specific reason
  });
  const resolved = await send("DOM.resolveNode", { backendNodeId });
  const objectId = resolved && resolved.object && resolved.object.objectId;
  if (!objectId) throw new Error("could not resolve element (detached?)");
  const evalResult = await send("Runtime.callFunctionOn", {
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
  });
  const v = evalResult && evalResult.result && evalResult.result.value;
  if (!v || !v.ok) throw new Error(v ? v.reason : "hit-test failed");
  return { x: v.x, y: v.y };
}

async function preflight(target) {
  const backendNodeId = await resolveFresh(target);
  return { backendNodeId, ...(await scrollAndHitTest(backendNodeId)) };
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
