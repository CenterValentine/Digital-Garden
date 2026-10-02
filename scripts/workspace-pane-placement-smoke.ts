/**
 * Smoke test for WHERE an open tab lives, across the reconcile loop.
 *
 * The workspace sync layer re-applies a server snapshot every time another
 * surface bumps `updatedAt`, and that snapshot is always slightly behind the
 * local surface — the debounced write has not landed yet. So every local open
 * spends a window being "missing" from the thing that is about to overwrite
 * local pane placement. If the re-add puts it anywhere other than the pane it
 * was opened into, tabs migrate on their own: a tab opened on the right
 * appears on the right, then hops to the left a second later, and with two
 * tabs in play they visibly rotate between panes.
 *
 * This is invisible to typecheck and to the existing
 * `workspace-tab-move:smoke` (that one pins the SERVER membership move, R1).
 * It cost two failed browser smokes before it was pinned here, which is the
 * argument for the file existing.
 *
 * Pure client state — `content-store.ts` imports only zustand, and
 * `syncBrowserState` no-ops without `window`, so the real store runs in Node
 * with no DB and no network.
 *
 * Run: pnpm workspace:pane-placement:smoke
 */

import {
  useContentStore,
  confirmWorkspaceWrite,
  resolveOppositePane,
  type WorkspacePaneId,
  type WorkspaceLayoutMode,
} from "../state/content-store";
import { buildPanesFromLayoutRecord } from "../extensions/workplaces/state/workspace-store";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `  ${ok ? "✓" : "✖"} ${label}${
      ok
        ? ""
        : `\n      got:  ${JSON.stringify(actual)}\n      want: ${JSON.stringify(expected)}`
    }`,
  );
}

/** Content ids currently in a pane, in order. */
function paneContents(paneId: WorkspacePaneId): string[] {
  const { panes, tabs } = useContentStore.getState();
  return (panes[paneId]?.tabIds ?? []).map((tabId) => tabs[tabId]?.contentId);
}

/**
 * Apply a server snapshot the way the sync layer's background reconcile does.
 * The point of every call here is that the snapshot is STALE — it predates the
 * local open under test, exactly as the real one does.
 */
function reconcile(opts: {
  layoutMode: WorkspaceLayoutMode;
  paneTabContentIds: Partial<Record<WorkspacePaneId, string[]>>;
  activeContentId: string | null;
  activePaneId: WorkspacePaneId;
}) {
  useContentStore.getState().restoreWorkspace({
    activeContentId: opts.activeContentId,
    activePaneId: opts.activePaneId,
    layoutMode: opts.layoutMode,
    paneTabContentIds: opts.paneTabContentIds,
  });
}

function seedSplit() {
  // A workspace already holding A on the left, focused there.
  useContentStore.getState().restoreWorkspace({
    activeContentId: "A",
    activePaneId: "top-left",
    layoutMode: "dual-vertical",
    paneTabContentIds: { "top-left": ["A"], "top-right": [] },
  });
}

console.log("\nresolveOppositePane — one rule per layout");
{
  check("single has no opposite", resolveOppositePane("single", "top-left"), "top-left");
  check(
    "dual-vertical pairs left↔right",
    [
      resolveOppositePane("dual-vertical", "top-left"),
      resolveOppositePane("dual-vertical", "top-right"),
    ],
    ["top-right", "top-left"],
  );
  check(
    "dual-horizontal pairs top↔bottom",
    [
      resolveOppositePane("dual-horizontal", "top-left"),
      resolveOppositePane("dual-horizontal", "bottom-left"),
    ],
    ["bottom-left", "top-left"],
  );
  check(
    "quad pairs along the row, not diagonally",
    [
      resolveOppositePane("quad", "top-left"),
      resolveOppositePane("quad", "bottom-right"),
    ],
    ["top-right", "bottom-left"],
  );
  check(
    "a pane that is not visible clamps instead of pairing off-screen",
    resolveOppositePane("single", "bottom-right"),
    "top-left",
  );
}

console.log("\nside-by-side open");
{
  seedSplit();
  useContentStore.getState().setSelectedContentId("B", {
    paneId: "top-right",
    focusPane: false,
  });

  check("B lands in the opposite pane", paneContents("top-right"), ["B"]);
  check("A is untouched", paneContents("top-left"), ["A"]);
  check("focus stays put", useContentStore.getState().activePaneId, "top-left");
  check("selection stays put", useContentStore.getState().selectedContentId, "A");
}

console.log("\nthe reconcile that caused the jumping");
{
  seedSplit();
  useContentStore.getState().setSelectedContentId("B", {
    paneId: "top-right",
    focusPane: false,
  });

  // The snapshot predates B's write — B is missing from it entirely. This is
  // the normal case, not an edge case: the write is debounced by seconds.
  reconcile({
    layoutMode: "dual-vertical",
    paneTabContentIds: { "top-left": ["A"], "top-right": [] },
    activeContentId: "A",
    activePaneId: "top-left",
  });

  check("B stays where it was opened", paneContents("top-right"), ["B"]);
  check("B did NOT migrate to the focused pane", paneContents("top-left"), ["A"]);
}

console.log("\nrepeated reconciles do not rotate");
{
  seedSplit();
  useContentStore.getState().setSelectedContentId("B", {
    paneId: "top-right",
    focusPane: false,
  });

  const after: string[][] = [];
  for (let i = 0; i < 4; i += 1) {
    reconcile({
      layoutMode: "dual-vertical",
      paneTabContentIds: { "top-left": ["A"], "top-right": [] },
      activeContentId: "A",
      activePaneId: "top-left",
    });
    after.push([...paneContents("top-left"), "|", ...paneContents("top-right")]);
  }
  // Every poll applies the same stale snapshot. Placement must be a fixed
  // point: if it is not, the tabs visibly cycle between panes.
  check(
    "placement is stable across 4 polls",
    after,
    [
      ["A", "|", "B"],
      ["A", "|", "B"],
      ["A", "|", "B"],
      ["A", "|", "B"],
    ],
  );
}

console.log("\nonce published, the snapshot is authoritative again");
{
  seedSplit();
  useContentStore.getState().setSelectedContentId("B", {
    paneId: "top-right",
    focusPane: false,
  });

  // The write landed: the server now knows B, and knows it is on the right.
  reconcile({
    layoutMode: "dual-vertical",
    paneTabContentIds: { "top-left": ["A"], "top-right": ["B"] },
    activeContentId: "A",
    activePaneId: "top-left",
  });

  check("B is still on the right", paneContents("top-right"), ["B"]);

  // The intent must RETIRE once the server agrees, or it would pin B to the
  // right forever and another window could never move it. Confirm the write,
  // then send a snapshot that deliberately places B on the left.
  confirmWorkspaceWrite(["A", "B"]);
  reconcile({
    layoutMode: "dual-vertical",
    paneTabContentIds: { "top-left": ["A", "B"], "top-right": [] },
    activeContentId: "A",
    activePaneId: "top-left",
  });

  check("a remote move is honoured once published", paneContents("top-left"), [
    "A",
    "B",
  ]);
  check("…and the right pane is empty again", paneContents("top-right"), []);
}

// ---------------------------------------------------------------------------
// The layer that was ACTUALLY broken.
//
// `restoreContentWorkspace` overwrites pane placement wholesale from the
// server's desktop layout record BEFORE restoreWorkspace sees it, so every
// assertion above can pass while tabs still migrate. The record is written
// after the fact, so a tab this surface just opened is unnamed by it — and
// unnamed tabs used to be swept into the first pane.
// ---------------------------------------------------------------------------
console.log("\nlayout-record rebuild (the reconcile's re-arrangement)");
{
  const record = {
    layoutMode: "dual-vertical",
    paneOrder: [
      { paneOrdinal: 1, tabOrder: ["A"] },
      { paneOrdinal: 2, tabOrder: [] },
    ],
    lastActive: null,
  } as never;

  // B was just opened on the right; the record predates it.
  const withLocal = buildPanesFromLayoutRecord(record, ["A", "B"], {
    "top-left": ["A"],
    "top-right": ["B"],
  });
  check(
    "a tab the record predates keeps its pane",
    withLocal.paneTabContentIds,
    { "top-left": ["A"], "top-right": ["B"] },
  );

  // Repeated polls must be a fixed point, or the tabs rotate.
  const again = buildPanesFromLayoutRecord(
    record,
    ["A", "B"],
    withLocal.paneTabContentIds,
  );
  check("…and stays put on the next poll", again.paneTabContentIds, {
    "top-left": ["A"],
    "top-right": ["B"],
  });

  // No local placement (workspace opening fresh) still falls back to pane 1.
  const noLocal = buildPanesFromLayoutRecord(record, ["A", "B"]);
  check(
    "with nothing local to preserve, pane 1 is still the fallback",
    noLocal.paneTabContentIds,
    { "top-left": ["A", "B"] },
  );

  // A pane the incoming layout drops must not strand its tabs.
  const collapsing = buildPanesFromLayoutRecord(
    { layoutMode: "single", paneOrder: [{ paneOrdinal: 1, tabOrder: ["A"] }], lastActive: null } as never,
    ["A", "B"],
    { "top-left": ["A"], "top-right": ["B"] },
  );
  check(
    "collapsing to single pulls the orphan into the surviving pane",
    collapsing.paneTabContentIds,
    { "top-left": ["A", "B"] },
  );
}

console.log(
  `\nworkspace-pane-placement smoke: ${failures === 0 ? "PASS" : `FAIL (${failures})`}`,
);
process.exit(failures === 0 ? 0 : 1);
