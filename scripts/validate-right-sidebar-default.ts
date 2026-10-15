/**
 * Gate: which right-sidebar tab a piece of content opens on.
 *
 * `pnpm right-sidebar:default:check`
 *
 * Owner ask (2026-10-08): content the user hasn't picked a tab for opens on
 * the rail they last ENGAGED with, not on the first tab — so moving through
 * notes keeps you in the panel you were working in. A content's own saved tab
 * still wins, and a remembered tab the content doesn't offer falls back.
 */

import assert from "node:assert/strict";
import type { RightSidebarTab } from "../state/right-sidebar-state-store";

// The store persists to localStorage. Node 25 ships a global one that throws
// without --localstorage-file, so give it an in-memory Storage BEFORE the
// store module loads (hence the dynamic import below).
const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
    removeItem: (key: string) => void memory.delete(key),
    clear: () => memory.clear(),
    key: (index: number) => Array.from(memory.keys())[index] ?? null,
    get length() {
      return memory.size;
    },
  },
});

let checks = 0;
function check(name: string, fn: () => void) {
  fn();
  checks += 1;
  console.log(`  ✓ ${name}`);
}

async function main() {
const { defaultRightSidebarTab, useRightSidebarStateStore } = await import(
  "../state/right-sidebar-state-store"
);

const NOTE_TABS: RightSidebarTab[] = ["outline", "context", "chat", "studio"];
const FILE_TABS: RightSidebarTab[] = ["context", "chat"];

check("untouched content opens on the last engaged rail", () => {
  assert.equal(defaultRightSidebarTab(null, "chat", NOTE_TABS), "chat");
});
check("a content's own saved tab still wins", () => {
  assert.equal(defaultRightSidebarTab("context", "chat", NOTE_TABS), "context");
});
check("a remembered rail this content doesn't offer falls back to the first", () => {
  assert.equal(defaultRightSidebarTab(null, "outline", FILE_TABS), "context");
});
check("nothing engaged yet → the first tab, as before", () => {
  assert.equal(defaultRightSidebarTab(null, null, NOTE_TABS), "outline");
});

const store = useRightSidebarStateStore.getState();
check("an explicit tab choice is remembered", () => {
  store.recordEngagedTab("chat");
  assert.equal(useRightSidebarStateStore.getState().lastEngagedTab, "chat");
});
check("the live Properties override is never remembered as a place", () => {
  store.recordEngagedTab("properties");
  assert.equal(useRightSidebarStateStore.getState().lastEngagedTab, "chat");
});
check("saving a tab for one content does not change the remembered rail", () => {
  store.setActiveTab("some-content", "outline");
  assert.equal(useRightSidebarStateStore.getState().lastEngagedTab, "chat");
});

console.log(`\nright-sidebar default: ${checks} checks passed`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
