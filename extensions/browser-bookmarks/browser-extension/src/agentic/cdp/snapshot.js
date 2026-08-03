// A11y snapshot — Phase 2b perception layer (D-TGT: accessibility-tree-first).
//
// Turns Accessibility.getFullAXTree into a compact, model-friendly list of the
// INTERACTABLE + meaningful nodes on the page — the surface the agent selects
// targets from (by role + name), and the source of the `expanded` / `disabled`
// states the actionability band-aids read (see the plan's §"Interaction
// reliability"). Shadow DOM is transparent here — the AX tree crosses shadow
// boundaries natively, which is exactly why a11y-first targeting sidesteps
// Playwright's shadow-piercing selectors (Category B, resolved cheaply).

import { send } from "./executor.js";

// Roles the agent can act on. Deliberately broad but not exhaustive; the snapshot
// ALSO keeps any *named* node (headings, etc.) for orientation/context.
const INTERACTABLE_ROLES = new Set([
  "button", "link", "textbox", "searchbox", "checkbox", "radio", "combobox",
  "listbox", "option", "menuitem", "menuitemcheckbox", "menuitemradio", "tab",
  "switch", "slider", "spinbutton", "treeitem", "disclosuretriangle",
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
  if (!interactable && !name) return null; // drop unnamed structural noise

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

// The full interactable+named node list for the active session's page. Nodes
// without a backendDOMNodeId are kept for orientation but can't be acted on until
// resolveFresh maps them (Slice 3b). Cross-frame (OOPIF) stitching is Slice 3c.
export async function getA11ySnapshot() {
  const result = await send("Accessibility.getFullAXTree");
  const nodes = (result && result.nodes) || [];
  const out = [];
  for (const node of nodes) {
    if (node.ignored) continue;
    const normalized = normalize(node);
    if (normalized) out.push(normalized);
  }
  return out;
}
