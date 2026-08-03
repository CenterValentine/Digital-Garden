// A11y snapshot — Phase 2b perception layer (D-TGT: accessibility-tree-first).
//
// Turns Accessibility.getFullAXTree into a compact, model-friendly list of the
// INTERACTABLE + meaningful nodes on the page — the surface the agent selects
// targets from (by role + name), and the source of the `expanded` / `disabled`
// states the actionability band-aids read (see the plan's §"Interaction
// reliability"). Shadow DOM is transparent here — the AX tree crosses shadow
// boundaries natively, which is exactly why a11y-first targeting sidesteps
// Playwright's shadow-piercing selectors (Category B, resolved cheaply).

import { send, getChildSessions } from "./executor.js";

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

// Compact one AX node to the fields targeting + the band-aids need.
function normalize(node) {
  const role = node.role && node.role.value;
  const name = ((node.name && node.name.value) || "").trim();
  const interactable = INTERACTABLE_ROLES.has(role);
  // Keep only action targets + the orientation skeleton; drop leaf text/markers.
  if (!interactable && !ORIENTATION_ROLES.has(role)) return null;

  const expanded = propValue(node, "expanded"); // true | false | undefined
  return {
    // The stable handle every later slice resolves through (getBoxModel /
    // scrollIntoViewIfNeeded / getNodeForLocation).
    backendDOMNodeId: node.backendDOMNodeId,
    role,
    name,
    ...(node.value && node.value.value ? { value: node.value.value } : {}),
    // Accordion/disclosure state — a PROPERTY read, not a pixel heuristic. Drives
    // the expand-collapsed pre-scrape pass (Slice 3d).
    ...(expanded === true || expanded === false ? { expanded } : {}),
    ...(propValue(node, "disabled") === true ? { disabled: true } : {}),
    ...(propValue(node, "focusable") === true ? { focusable: true } : {}),
    ...(role === "heading" ? { level: propValue(node, "level") } : {}),
    ...(interactable ? { interactable: true } : {}),
  };
}

async function collectFrame(out, sessionId, frameUrl) {
  let result;
  try {
    result = await send("Accessibility.getFullAXTree", undefined, sessionId);
  } catch {
    return; // frame may be mid-navigation / detached — skip it, don't fail the snapshot
  }
  const nodes = (result && result.nodes) || [];
  for (const node of nodes) {
    if (node.ignored) continue;
    const normalized = normalize(node);
    if (!normalized) continue;
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
// Nodes without a backendDOMNodeId are kept for orientation; cross-frame nodes
// carry `sessionId`/`frameUrl` and are read-only until 3c-2 (coordinate translation).
export async function getA11ySnapshot() {
  const out = [];
  await collectFrame(out, undefined, undefined); // top frame
  for (const frame of getChildSessions()) {
    await collectFrame(out, frame.sessionId, frame.url);
  }
  return out;
}
