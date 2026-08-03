// Agentic co-browse CDP layer (Phase 2b) — barrel.
//
// D-ENG (2026-08-01): raw chrome.debugger + CDP is the LOCKED primary interaction
// engine, behind the app-side BrowserActuator protocol; playwright-crx is the
// deferred swap for the form-fill / hard-acting phases. Everything here upholds
// the two-category standard in the plan's §"Interaction reliability".
export * from "./executor.js";  // attach / detach / send + session + banner-Stop lifecycle
export * from "./snapshot.js";  // a11y perception layer (D-TGT: accessibility-tree-first)
export * from "./actions.js";   // resolveFresh → scroll → hit-test → dispatch (click/hover/type)
