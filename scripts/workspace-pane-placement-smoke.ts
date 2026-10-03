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
  clearPendingWorkspaceIntents,
  resolveOppositePane,
  resolveOpenDestinationPane,
  resolveLayoutModeForPane,
  getStalePaneMemoryTabIds,
  type WorkspacePaneId,
  type WorkspaceLayoutMode,
} from "../state/content-store";
import {
  buildPanesFromLayoutRecord,
  restoreContentWorkspace,
  useWorkspaceStore,
  __lastAppliedUpdatedAtForTests,
} from "../extensions/workplaces/state/workspace-store";
import { DEFAULT_SETTINGS } from "../lib/features/settings/validation";
import {
  paneForHotkeyCode,
  hotkeyLettersForPane,
  hotkeyCellForCode,
  placementForHotkeyCell,
  PANE_HOTKEY_GRID,
} from "../lib/features/content/pane-hotkeys";

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

/** The content a pane is currently SHOWING (its active tab). */
function paneActive(paneId: WorkspacePaneId): string | null {
  const { panes, tabs } = useContentStore.getState();
  const tabId = panes[paneId]?.activeTabId;
  return tabId ? tabs[tabId]?.contentId ?? null : null;
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
  // Two kinds of state outlive a scenario, and each has read as a product bug:
  //   - the `tabs` record — restoreWorkspace carries it FORWARD, and restored
  //     tabs are pinned, so an id reused by a later scenario arrives already
  //     pinned and survives a preview open it was supposed to lose to;
  //   - pending intents — a leftover one is re-added by the next reconcile.
  // Clear tabs first (it records close intents), then the intents.
  useContentStore.getState().clearAllWorkspaceTabs();
  clearPendingWorkspaceIntents();
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

console.log("\nfill the room before stacking (owner rule, 2026-10-02)");
{
  // Occupancy is the only input besides geometry, so drive it directly.
  const empty = new Set<WorkspacePaneId>([
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ]);
  const isEmpty = (paneId: WorkspacePaneId) => empty.has(paneId);
  empty.delete("top-left"); // the user is working here

  const quadSequence: WorkspacePaneId[] = [];
  for (let i = 0; i < 4; i += 1) {
    const target = resolveOpenDestinationPane("quad", "top-left", isEmpty);
    quadSequence.push(target);
    empty.delete(target);
  }
  check("quad fills the room, then returns to the opposite", quadSequence, [
    "top-right",
    "bottom-left",
    "bottom-right",
    "top-right",
  ]);

  // Dual: nothing else to fill, so every open after the first repeats.
  const dualEmpty = new Set<WorkspacePaneId>(["top-right"]);
  const dualSequence: WorkspacePaneId[] = [];
  for (let i = 0; i < 3; i += 1) {
    const target = resolveOpenDestinationPane("dual-vertical", "top-left", (p) =>
      dualEmpty.has(p),
    );
    dualSequence.push(target);
    dualEmpty.delete(target);
  }
  check("dual goes opposite, then stays there", dualSequence, [
    "top-right",
    "top-right",
    "top-right",
  ]);

  // Engaging with a pane re-aims the whole rule off the new active pane.
  const allFull = () => false;
  check(
    "working in the bottom-right re-aims to ITS opposite",
    resolveOpenDestinationPane("quad", "bottom-right", allFull),
    "bottom-left",
  );
  check(
    "…and an empty pane still wins over the opposite",
    resolveOpenDestinationPane(
      "quad",
      "bottom-right",
      (p) => p === "top-left",
    ),
    "top-left",
  );

  check(
    "single still has nowhere to go",
    resolveOpenDestinationPane("single", "top-left", () => true),
    "top-left",
  );
}

// ---------------------------------------------------------------------------
// THE REAL LOOP. Every section above drives one piece in isolation and every
// one of them passed while the app still bounced — because the bug lived in
// the composition: persist → layout record → poll → restoreContentWorkspace
// → restoreWorkspace → persist again. This drives that whole cycle on the real
// store and asserts it is a FIXED POINT. If one lap changes anything, the app
// will keep changing it on every poll, and each change remounts the panes and
// steals focus from the editor.
//
// `detectWorkspaceSurfaceFamily()` returns "desktop" without a window, so the
// reconcile's desktop-coupling branch genuinely runs here.
// ---------------------------------------------------------------------------
console.log("\npersist → record → reconcile is a fixed point");
{
  const ORDINAL: Record<string, WorkspacePaneId[]> = {
    single: ["top-left"],
    "dual-vertical": ["top-left", "top-right"],
    "dual-horizontal": ["top-left", "bottom-left"],
    quad: ["top-left", "top-right", "bottom-left", "bottom-right"],
  };

  /** What putLayoutRecord would write from the CURRENT local state. */
  const recordFromLocal = () => {
    const s = useContentStore.getState();
    const panes = ORDINAL[s.layoutMode];
    return {
      family: "desktop",
      deviceId: "shared",
      layoutMode: s.layoutMode,
      paneOrder: panes.map((paneId, i) => ({
        paneOrdinal: i + 1,
        tabOrder: paneContents(paneId),
      })),
      lastActive: s.selectedContentId
        ? {
            paneOrdinal: Math.max(1, panes.indexOf(s.activePaneId) + 1),
            contentId: s.selectedContentId,
          }
        : null,
      updatedAt: new Date().toISOString(),
    };
  };

  /** What the server would hand back after our write landed. */
  const workspaceFromLocal = (record = recordFromLocal()) => {
    const s = useContentStore.getState();
    const paneTabContentIds = Object.fromEntries(
      (["top-left", "top-right", "bottom-left", "bottom-right"] as WorkspacePaneId[]).map(
        (paneId) => [
          paneId,
          { contentIds: paneContents(paneId), activeContentId: paneActive(paneId) },
        ],
      ),
    );
    return {
      id: "ws", name: "ws", slug: "ws", isMain: true, isLocked: false,
      isView: false, viewRootContentId: null, viewRoot: null,
      parentWorkspaceId: null, status: "active", expiresAt: null,
      archivedAt: null, layoutMode: s.layoutMode, activePaneId: s.activePaneId,
      paneState: {
        layoutMode: s.layoutMode,
        activePaneId: s.activePaneId,
        activeContentId: s.selectedContentId,
        paneTabContentIds,
      },
      settings: {}, createdAt: "", updatedAt: "", items: [], contentMeta: {},
      layoutRecords: [record],
    } as never;
  };

  /** Everything a poll could change, in one comparable string. */
  const fingerprint = () => {
    const s = useContentStore.getState();
    const panes = (["top-left", "top-right", "bottom-left", "bottom-right"] as WorkspacePaneId[])
      .map((p) => `${p}=[${paneContents(p).join(",")}]@${paneActive(p) ?? "-"}`)
      .join(" ");
    return `${s.layoutMode} focus=${s.activePaneId} sel=${s.selectedContentId} ${panes}`;
  };

  // The side-by-side state: A on the left (focused, selected), B just opened
  // on the right without taking focus.
  seedSplit();
  useContentStore.getState().setSelectedContentId("B", {
    paneId: "top-right",
    focusPane: false,
  });
  confirmWorkspaceWrite(["A", "B"]); // our write landed; intents retire
  const start = fingerprint();

  // Lap the loop: the server echoes our own state back; we reconcile; then
  // persist would write a record from the result, which the next poll echoes.
  const laps: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    const ws = workspaceFromLocal();
    restoreContentWorkspace(
      ws,
      useContentStore.getState().selectedContentId,
      false,
      "reconcile",
    );
    laps.push(fingerprint());
  }
  check("five laps of our own echo change nothing", laps, Array(5).fill(start));
  check("…and specifically never flip the layout (the focus-stealer)",
    laps.every((l) => l.startsWith("dual-vertical ")), true);

  // A STALE record — written before B existed — must not pull B anywhere.
  const stale = {
    ...recordFromLocal(),
    paneOrder: [
      { paneOrdinal: 1, tabOrder: ["A"] },
      { paneOrdinal: 2, tabOrder: [] },
    ],
  };
  const staleLaps: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    restoreContentWorkspace(
      workspaceFromLocal(stale),
      useContentStore.getState().selectedContentId,
      false,
      "reconcile",
    );
    staleLaps.push(fingerprint());
  }
  check("a record that predates B leaves B on the right", staleLaps, Array(3).fill(start));

  // The focused pane, two tabs, typing in the SECOND. The server's snapshot
  // still names the first as active (our click hasn't landed), and the
  // reconcile arrives with no usable local preference. R3: active views never
  // sync — the pane must keep showing what it is showing.
  clearPendingWorkspaceIntents();
  useContentStore.getState().restoreWorkspace({
    activeContentId: "W36",
    activePaneId: "top-left",
    layoutMode: "dual-vertical",
    paneTabContentIds: { "top-left": ["W39", "W36"], "top-right": ["X"] },
  });
  confirmWorkspaceWrite(["W39", "W36", "X"]);
  const serverStale = {
    ...workspaceFromLocal({
      ...recordFromLocal(),
      lastActive: { paneOrdinal: 1, contentId: "W39" },
    }) as unknown as { paneState: { activeContentId: string | null; paneTabContentIds: Record<string, { activeContentId: string | null }> } },
  };
  serverStale.paneState.activeContentId = "W39";
  serverStale.paneState.paneTabContentIds["top-left"].activeContentId = "W39";
  restoreContentWorkspace(serverStale as never, null, false, "reconcile");
  check(
    "typing in the second tab: a stale server + null selection does not snap to the first",
    paneActive("top-left"),
    "W36",
  );
  check("…and the selection follows the pane, not the server", useContentStore.getState().selectedContentId, "W36");

  // DRAG A TAB ACROSS PANES, then a poll lands carrying the PRE-move state.
  // Reported: the drop lands, flickers back, returns; with several moves the
  // tabs shuffle into a new order. A move records no membership change, so it
  // used to record no intent, and the stale record dragged it back.
  clearPendingWorkspaceIntents();
  useContentStore.getState().restoreWorkspace({
    activeContentId: "A",
    activePaneId: "top-left",
    layoutMode: "dual-vertical",
    paneTabContentIds: { "top-left": ["A"], "top-right": ["B", "C"] },
  });
  confirmWorkspaceWrite(["A", "B", "C"]);
  const preMove = workspaceFromLocal(); // what the server still has
  useContentStore.getState().moveContentTabToPane("tab:B", "top-left", {});
  const afterMove = fingerprint();
  check("B dropped into the left pane", paneContents("top-left"), ["A", "B"]);

  const flicker: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    restoreContentWorkspace(preMove, useContentStore.getState().selectedContentId, false, "reconcile");
    flicker.push(fingerprint());
  }
  check("a stale poll does not drag the moved tab back (no flicker)", flicker, Array(3).fill(afterMove));
  check("…and C, which did not move, is not disturbed", paneContents("top-right"), ["C"]);

  // Our write lands and acks; the intent retires; the server now agrees.
  confirmWorkspaceWrite(["A", "B", "C"]);
  restoreContentWorkspace(workspaceFromLocal(), useContentStore.getState().selectedContentId, false, "reconcile");
  check("after the write lands, the move is simply the state", fingerprint(), afterMove);
}

console.log("\nempty panes collapse the layout (owner scenarios, 2026-10-02)");
{
  //   1 2        quad numbering used in the spec
  //   3 4
  const quad = () => {
    clearPendingWorkspaceIntents();
    useContentStore.getState().restoreWorkspace({
      activeContentId: "P1",
      activePaneId: "top-left",
      layoutMode: "quad",
      paneTabContentIds: {
        "top-left": ["P1"],
        "top-right": ["P2"],
        "bottom-left": ["P3"],
        "bottom-right": ["P4"],
      },
    });
  };
  const close = (...ids: string[]) => useContentStore.getState().closeContentTabs(ids);
  const shape = () => {
    const s = useContentStore.getState();
    return `${s.layoutMode} ${(["top-left", "top-right", "bottom-left", "bottom-right"] as WorkspacePaneId[])
      .map((p) => `${p}=[${paneContents(p).join(",")}]`)
      .join(" ")}`;
  };

  quad(); close("P3", "P4");
  check("3,4 cleared → 1,2 take the vertical split", shape(),
    "dual-vertical top-left=[P1] top-right=[P2] bottom-left=[] bottom-right=[]");

  quad(); close("P1", "P2");
  check("1,2 cleared → 3,4 move up into the vertical split", shape(),
    "dual-vertical top-left=[P3] top-right=[P4] bottom-left=[] bottom-right=[]");

  quad(); close("P1", "P3");
  check("1,3 cleared → 2,4 become the horizontal split", shape(),
    "dual-horizontal top-left=[P2] top-right=[] bottom-left=[P4] bottom-right=[]");

  quad(); close("P2", "P4");
  check("2,4 cleared → 1,3 become the horizontal split", shape(),
    "dual-horizontal top-left=[P1] top-right=[] bottom-left=[P3] bottom-right=[]");

  quad(); close("P1", "P2", "P3");
  check("1,2,3 cleared → 4 alone in a single pane", shape(),
    "single top-left=[P4] top-right=[] bottom-left=[] bottom-right=[]");

  // Not in the spec, decided here: a diagonal pair takes the vertical split,
  // the app's primary two-pane arrangement. Pinned so it is a choice, not an
  // accident.
  quad(); close("P2", "P3");
  check("1,4 (diagonal) → vertical split, 4 moves up", shape(),
    "dual-vertical top-left=[P1] top-right=[P4] bottom-left=[] bottom-right=[]");

  // Three remain: no layout holds three, so nothing happens.
  quad(); close("P4");
  check("one pane emptied in a quad → stays a quad (nothing fits three)", shape(),
    "quad top-left=[P1] top-right=[P2] bottom-left=[P3] bottom-right=[]");

  // Dual layouts: empty either side → single.
  const dual = (mode: "dual-vertical" | "dual-horizontal") => {
    clearPendingWorkspaceIntents();
    const second = mode === "dual-vertical" ? "top-right" : "bottom-left";
    useContentStore.getState().restoreWorkspace({
      activeContentId: "P1",
      activePaneId: "top-left",
      layoutMode: mode,
      paneTabContentIds: { "top-left": ["P1"], [second]: ["P2"] },
    });
  };
  dual("dual-vertical"); close("P2");
  check("vertical: right emptied → single", shape(),
    "single top-left=[P1] top-right=[] bottom-left=[] bottom-right=[]");
  dual("dual-vertical"); close("P1");
  check("vertical: left emptied → single, 2 moves over", shape(),
    "single top-left=[P2] top-right=[] bottom-left=[] bottom-right=[]");
  dual("dual-horizontal"); close("P1");
  check("horizontal: top emptied → single, 2 moves up", shape(),
    "single top-left=[P2] top-right=[] bottom-left=[] bottom-right=[]");

  // SAFETY: collapse is a response to a tab REMOVAL only. Choosing a split
  // leaves a pane empty by definition, and a reconcile can hand us empties
  // mid-flight; neither may collapse, or you could never open a split and two
  // windows could ping-pong layouts through the sync loop.
  clearPendingWorkspaceIntents();
  useContentStore.getState().restoreWorkspace({
    activeContentId: "P1", activePaneId: "top-left", layoutMode: "single",
    paneTabContentIds: { "top-left": ["P1"] },
  });
  useContentStore.getState().setLayoutMode("dual-vertical");
  check("choosing a split does NOT collapse its empty pane", useContentStore.getState().layoutMode, "dual-vertical");
  useContentStore.getState().restoreWorkspace({
    activeContentId: "P1", activePaneId: "top-left", layoutMode: "quad",
    paneTabContentIds: { "top-left": ["P1"], "top-right": [], "bottom-left": [], "bottom-right": [] },
  });
  check("a restore/reconcile with empties does NOT collapse", useContentStore.getState().layoutMode, "quad");

  // The emptied pane was the active one: focus must land on real content.
  quad(); useContentStore.getState().focusPane("bottom-right"); close("P4", "P3");
  check("closing the focused pane's last tab moves focus onto content",
    [useContentStore.getState().layoutMode, useContentStore.getState().selectedContentId],
    ["dual-vertical", "P1"]);
}

console.log("\na restore never collapses — only a user's removal does (owner rule, 2026-10-03)");
{
  // "If a tab flickers and leaves a section empty it collapses the tab view,
  // so we can't have any tolerance for flickers." A reconcile can hand this
  // surface a snapshot in which a pane is momentarily empty (a stale row, a
  // tab the server has not seen yet). That must never fold the layout: the
  // collapse runs inside closeContentTab / moveContentTabToPane only, as part
  // of the user's own commit. Two windows reconciling each other's collapses
  // would otherwise ping-pong.
  seedSplit();
  useContentStore.getState().setSelectedContentId("B", { paneId: "top-right", focusPane: false });
  clearPendingWorkspaceIntents(); // the server "knows" B — no intent to re-add it
  reconcile({
    layoutMode: "dual-vertical",
    activePaneId: "top-left",
    activeContentId: "A",
    paneTabContentIds: { "top-left": ["A"], "top-right": [] },
  });
  check(
    "a snapshot with an empty pane leaves the split in place",
    [useContentStore.getState().layoutMode, paneContents("top-left"), paneContents("top-right")],
    ["dual-vertical", ["A"], []],
  );
  // The same emptiness caused by the USER folds it — the two are not the same event.
  useContentStore.getState().setSelectedContentId("B", { paneId: "top-right", focusPane: false });
  useContentStore.getState().closeContentTab("tab:B");
  check(
    "…while closing the pane's last tab yourself collapses to single",
    useContentStore.getState().layoutMode,
    "single",
  );
}

console.log("\nreset pane memory (owner request, 2026-10-03)");
{
  // A tab that lived bottom-right in a quad remembers that. Collapse to a
  // vertical split and it sits in the right pane; go back to quad and it
  // returns to bottom-right — that memory is the feature, and it stays. Reset
  // re-seats the memory to the pane the tab is in NOW, on both axes: the right
  // pane of a vertical split is top-right by default, so after a reset the
  // quad puts it top-right.
  seedSplit();
  useContentStore.getState().restoreWorkspace({
    activeContentId: "P1",
    activePaneId: "top-left",
    layoutMode: "quad",
    paneTabContentIds: {
      "top-left": ["P1"],
      "top-right": ["P2"],
      "bottom-left": ["P3"],
      "bottom-right": ["P4"],
    },
  });
  // Seat the memory the way the real flow does (restoreWorkspace keeps stored
  // preferences; a move through each pane records both axes).
  for (const [tab, pane] of [
    ["tab:P2", "top-right"],
    ["tab:P3", "bottom-left"],
    ["tab:P4", "bottom-right"],
  ] as const) {
    useContentStore.getState().moveContentTabToPane(tab, pane, {});
  }
  useContentStore.getState().setLayoutMode("dual-vertical");
  check(
    "collapsing to a vertical split folds P4 into the right pane",
    paneContents("top-right"),
    ["P2", "P4"],
  );
  useContentStore.getState().setLayoutMode("quad");
  check(
    "…and the quad remembers P4 was bottom-right (memory kept — the feature)",
    paneContents("bottom-right"),
    ["P4"],
  );

  useContentStore.getState().setLayoutMode("dual-vertical");
  check(
    "from the vertical split, P3 and P4 would move on the next layout change",
    getStalePaneMemoryTabIds(
      "dual-vertical",
      useContentStore.getState().panes,
      useContentStore.getState().tabs,
    ).sort(),
    ["tab:P3", "tab:P4"],
  );
  const before = useContentStore.getState().resetPaneMemory();
  check("reset returns the memory it replaced, for undo", Object.keys(before).sort(), ["tab:P3", "tab:P4"]);
  check(
    "…after which nothing would move",
    getStalePaneMemoryTabIds("dual-vertical", useContentStore.getState().panes, useContentStore.getState().tabs),
    [],
  );
  useContentStore.getState().setLayoutMode("quad");
  check(
    "the quad now seats P4 where the right pane's default is: top-right",
    [paneContents("top-right"), paneContents("bottom-right"), paneContents("bottom-left")],
    [["P2", "P4"], [], []],
  );
  check("…and P3 follows the left pane's default: top-left", paneContents("top-left"), ["P1", "P3"]);

  // Undo puts the memory back; the next quad honours it again.
  useContentStore.getState().setLayoutMode("dual-vertical");
  useContentStore.getState().applyPaneMemory(before);
  useContentStore.getState().setLayoutMode("quad");
  check("undo restores the old memory: P4 is bottom-right again", paneContents("bottom-right"), ["P4"]);
}

console.log("\nclicking around between opens");
{
  // Reading a pane focuses it (`focusPane` on pointerdown), so the anchor the
  // rule is computed from moves whenever you click anything.
  const empty = (paneId: WorkspacePaneId) =>
    (useContentStore.getState().panes[paneId]?.tabIds.length ?? 0) === 0;

  seedSplit(); // A on the left, focused left, right pane empty
  check(
    "first open goes right",
    resolveOpenDestinationPane("dual-vertical", "top-left", empty),
    "top-right",
  );

  // The reader clicks into the EMPTY right pane.
  useContentStore.getState().focusPane("top-right");
  check(
    "focused on an empty pane, content should land THERE",
    resolveOpenDestinationPane(
      "dual-vertical",
      useContentStore.getState().activePaneId,
      empty,
    ),
    "top-right",
  );
}

console.log("\ndirection-key aiming (hold a letter, click a file)");
{
  // The cluster is the shape the panes make:
  //   Q W E
  //   A S D
  //   Z X C
  check(
    "quad corners",
    ["KeyQ", "KeyE", "KeyZ", "KeyC"].map(paneForHotkeyCode),
    ["top-left", "top-right", "bottom-left", "bottom-right"],
  );
  check(
    "left / right of a vertical split",
    ["KeyA", "KeyD"].map(paneForHotkeyCode),
    ["top-left", "top-right"],
  );
  check(
    "top / bottom of a horizontal split",
    ["KeyW", "KeyX"].map(paneForHotkeyCode),
    ["top-left", "bottom-left"],
  );
  check("S collapses to one pane", paneForHotkeyCode("KeyS"), "single");

  // The context menu's shortcut column is DERIVED from the key table, so this
  // doubles as a check that the table has not drifted from the cluster.
  check(
    "menu advertises exactly the letters that aim at each pane",
    (["top-left", "top-right", "bottom-left", "bottom-right"] as WorkspacePaneId[]).map(
      hotkeyLettersForPane,
    ),
    ["Q / A / W", "E / D", "Z / X", "C"],
  );

  // An aimed open is pinned: the next casual (preview) open lands beside it
  // instead of replacing it. Exercises the store contract the aimed branch
  // relies on — `pin: true` through setSelectedContentId.
  // Own ids, not B/C: `restoreWorkspace` carries the `tabs` record forward, so
  // a tab pinned here would still be pinned when a later scenario reuses the
  // id — and that scenario asserts preview REPLACEMENT. Same isolation class
  // as the pending-intent leak seedSplit already guards against.
  seedSplit();
  useContentStore.getState().setSelectedContentId("P1", { paneId: "top-right", pin: true });
  useContentStore.getState().setSelectedContentId("P2", { paneId: "top-right", focusPane: false });
  check("a pinned (aimed) open survives the next preview open", paneContents("top-right"), ["P1", "P2"]);
  check("an unmapped key aims at nothing", paneForHotkeyCode("KeyB"), null);

  // The same place keeps the same key across layouts: "left" in a vertical
  // split, "top" in a horizontal one and the top-left corner of a quad are
  // all the same pane, so A, W and Q agree.
  check(
    "A, W and Q all name the same pane",
    new Set(["KeyA", "KeyW", "KeyQ"].map(paneForHotkeyCode)).size,
    1,
  );

  // `event.key` would be "¬" for ⌥L on macOS; `code` is the physical key.
  // Guarding against a future refactor quietly switching to `key`.
  check("keyed on the physical key, not the glyph", paneForHotkeyCode("a"), null);

  // The context menu draws the keys as a 3×3 map. Its cells must be the
  // keyboard's own shape and must aim exactly where the tracker does — the
  // map is derived from the table, and this pins that it stays derived.
  check(
    "the menu's key map is the keyboard's shape",
    PANE_HOTKEY_GRID.map((row) => row.map((c) => c.letter).join("")),
    ["QWE", "ASD", "ZXC"],
  );
  check(
    "…and every cell aims where the tracker does",
    PANE_HOTKEY_GRID.flat().every((c) => c.target === paneForHotkeyCode(c.code)),
    true,
  );
  check(
    "…with a caption and a description each",
    PANE_HOTKEY_GRID.flat().every((c) => c.caption.length > 0 && c.description.length > 0),
    true,
  );

  // Dropping a tab on a cell: the layout the key MEANS, exactly (a corner is
  // a quad corner even from a single pane — that is what the old reshape
  // targets did too), and the pane that keeps everything else.
  const place = (letter: string) =>
    placementForHotkeyCell(hotkeyCellForCode(`Key${letter}`)!);
  check(
    "corners drop into a quad",
    ["Q", "E", "Z", "C"].map((l) => [place(l).requestedLayoutMode, place(l).paneId]),
    [["quad", "top-left"], ["quad", "top-right"], ["quad", "bottom-left"], ["quad", "bottom-right"]],
  );
  check(
    "A / D drop into a side-by-side split, W / X into a stacked one",
    ["A", "D", "W", "X"].map((l) => [place(l).requestedLayoutMode, place(l).paneId, place(l).complementPaneId]),
    [
      ["dual-vertical", "top-left", "top-right"],
      ["dual-vertical", "top-right", "top-left"],
      ["dual-horizontal", "top-left", "bottom-left"],
      ["dual-horizontal", "bottom-left", "top-left"],
    ],
  );
  check("S drops into one pane", [place("S").requestedLayoutMode, place("S").paneId, place("S").complementPaneId], ["single", "top-left", null]);

  // …and the store honours it: the same move the drop handler makes.
  seedSplit();
  useContentStore.getState().setLayoutMode("single");
  useContentStore.getState().setSelectedContentId("B", { pin: true });
  const dropOn = (letter: string) =>
    useContentStore.getState().moveContentTabToPane("tab:B", place(letter).paneId, {
      placementMode: "explicit",
      requestedLayoutMode: place(letter).requestedLayoutMode,
      complementPaneId: place(letter).complementPaneId,
    });
  dropOn("C");
  check(
    "dropping B on C from a single pane → quad, B bottom-right, A stays top-left",
    [useContentStore.getState().layoutMode, paneContents("bottom-right"), paneContents("top-left")],
    ["quad", ["B"], ["A"]],
  );
  dropOn("D");
  check(
    "then on D → side-by-side, B right",
    [useContentStore.getState().layoutMode, paneContents("top-right"), paneContents("top-left")],
    ["dual-vertical", ["B"], ["A"]],
  );
  dropOn("S");
  check(
    "then on S → one pane holding both, B active",
    [useContentStore.getState().layoutMode, paneContents("top-left").sort(), paneActive("top-left")],
    ["single", ["A", "B"], "B"],
  );

  // The aimed pane may not be on screen — growing the layout to reach it is
  // the same thing the context menu's "(expand layout)" entries do.
  check(
    "aiming at a corner from a vertical split expands to quad",
    resolveLayoutModeForPane("dual-vertical", "bottom-right"),
    "quad",
  );
  check(
    "aiming at a pane already visible changes nothing",
    resolveLayoutModeForPane("dual-vertical", "top-right"),
    "dual-vertical",
  );
}

console.log("\nthe open-destination seam (settings.ui.openDestination)");
{
  // Nothing in the UI can reach these yet. They are covered anyway: an
  // unreachable branch is exactly the kind that rots before the control that
  // exposes it ever lands, and then the settings PR gets blamed for it.
  // The pane you are working in is occupied — otherwise the rule correctly
  // answers "open right here", which is a different scenario (covered above).
  const onlyActiveOccupied = (paneId: WorkspacePaneId) => paneId !== "top-left";
  const allFull = () => false;

  check(
    "the default is the fill rule",
    [
      resolveOpenDestinationPane("quad", "top-left", onlyActiveOccupied),
      resolveOpenDestinationPane("quad", "top-left", onlyActiveOccupied, "fill"),
    ],
    ["top-right", "top-right"],
  );
  check(
    "DEFAULT_SETTINGS agrees with that default",
    DEFAULT_SETTINGS.ui?.openDestination,
    "fill",
  );
  check(
    "'opposite' ignores the other empty panes",
    resolveOpenDestinationPane(
      "quad",
      "top-left",
      (p) => p === "bottom-left",
      "opposite",
    ),
    "top-right",
  );
  check(
    "'active' is the pre-rule behaviour — open where you are",
    [
      resolveOpenDestinationPane("quad", "top-left", onlyActiveOccupied, "active"),
      resolveOpenDestinationPane("dual-vertical", "top-right", allFull, "active"),
    ],
    ["top-left", "top-right"],
  );
}

console.log("\nback-to-back tree opens land on the SAME side");
{
  // "Back to back" = the user never touches the opened content, so nothing
  // should move focus and every open should resolve to the same destination.
  seedSplit();
  const open = (id: string) => {
    const { layoutMode, activePaneId } = useContentStore.getState();
    useContentStore.getState().setSelectedContentId(id, {
      paneId: resolveOppositePane(layoutMode, activePaneId),
      focusPane: false,
    });
  };

  const landedIn: string[] = [];
  for (const id of ["B", "C", "D"]) {
    open(id);
    landedIn.push(
      paneContents("top-right").includes(id) ? "top-right" : "elsewhere",
    );
  }

  check("every open landed on the same side", landedIn, [
    "top-right",
    "top-right",
    "top-right",
  ]);
  check("none of them displaced A", paneContents("top-left"), ["A"]);
  check("focus never moved", useContentStore.getState().activePaneId, "top-left");

  // Current behaviour, pinned so a change to it is deliberate: each click is a
  // PREVIEW open, so it replaces the previous preview in that pane rather than
  // stacking. Same side, one tab. Pinning a tab (or a reconcile, which pins
  // what it restores) makes the next open add instead of replace.
  check("…replacing the previous preview, not stacking", paneContents("top-right"), [
    "D",
  ]);
}

console.log("\n…and still the same side after a poll lands mid-sequence");
{
  seedSplit();
  const open = (id: string) => {
    const { layoutMode, activePaneId } = useContentStore.getState();
    useContentStore.getState().setSelectedContentId(id, {
      paneId: resolveOppositePane(layoutMode, activePaneId),
      focusPane: false,
    });
  };

  open("B");
  // A reconcile between two clicks must not re-aim the next one by moving
  // focus — that would send the second open to the other side.
  reconcile({
    layoutMode: "dual-vertical",
    paneTabContentIds: { "top-left": ["A"], "top-right": ["B"] },
    activeContentId: "A",
    activePaneId: "top-left",
  });
  open("C");

  check(
    "the second open went to the same side as the first",
    paneContents("top-right").includes("C"),
    true,
  );
  check("A is still alone on the left", paneContents("top-left"), ["A"]);
  check("focus still never moved", useContentStore.getState().activePaneId, "top-left");
}

console.log("\nwhich tab is active WITHIN an unfocused pane");
{
  // A snapshot names one activeContentId, for the active pane only. It has no
  // opinion about the others — so a reconcile must not quietly reset them.
  seedSplit();
  // Left pane already holds A and C, showing C.
  useContentStore.getState().restoreWorkspace({
    activeContentId: "C",
    activePaneId: "top-left",
    layoutMode: "dual-vertical",
    paneTabContentIds: { "top-left": ["A", "C"], "top-right": [] },
  });
  // Focus moves to the right pane and something opens there.
  useContentStore.getState().setSelectedContentId("B", { paneId: "top-right" });
  check("left pane is showing C", paneActive("top-left"), "C");

  reconcile({
    layoutMode: "dual-vertical",
    paneTabContentIds: { "top-left": ["A", "C"], "top-right": ["B"] },
    activeContentId: "B",
    activePaneId: "top-right",
  });

  check("the unfocused pane keeps showing C", paneActive("top-left"), "C");
  check("…not its first tab", paneActive("top-left") === "A", false);
  check("the focused pane honours the snapshot", paneActive("top-right"), "B");
}

console.log("\nthe tab you just opened keeps the pane");
{
  // The report: 2026-W39 opened beside an existing tab, showed, then the other
  // tab took the pane back on the next poll.
  seedSplit();
  useContentStore.getState().restoreWorkspace({
    activeContentId: "A",
    activePaneId: "top-right",
    layoutMode: "dual-vertical",
    paneTabContentIds: { "top-left": ["NewNote"], "top-right": ["A"] },
  });
  useContentStore
    .getState()
    .setSelectedContentId("W39", { paneId: "top-left", focusPane: false });

  check("W39 is showing in the left pane", paneActive("top-left"), "W39");

  reconcile({
    layoutMode: "dual-vertical",
    paneTabContentIds: { "top-left": ["NewNote"], "top-right": ["A"] },
    activeContentId: "A",
    activePaneId: "top-right",
  });

  check("W39 still has the pane after a poll", paneActive("top-left"), "W39");
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

(async () => {
  console.log("\na surface acks its OWN workspace writes (echo suppression)");
  {
    // Every write to the workspace row bumps updatedAt. If the surface does
    // not record the value the server returns, the next poll sees an updatedAt
    // it never acked and reconciles against its own write — a reconcile with
    // no user action between. The traced persist always acked; updateWorkspace
    // (name/settings) did not. Pinned here with a stubbed fetch, since the
    // harness has no network.
    const realFetch = globalThis.fetch;
    // fetchWorkspaceMutation arms its abort timer on window.setTimeout, and the
    // harness runs in Node. A minimal window for the duration of this scenario;
    // no localStorage, so the tracer stays off, and a pathname so surface
    // detection has something to read if anything reaches it.
    const realWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      location: { pathname: "/", href: "http://localhost/" },
      innerWidth: 1440,
      innerHeight: 900,
      addEventListener: () => undefined,
    };
    const WS = "ws-ack";
    const served = {
      id: WS, name: "ws", slug: "ws", isMain: true, isLocked: false, isView: false,
      viewRootContentId: null, viewRoot: null, parentWorkspaceId: null,
      status: "active", expiresAt: null, archivedAt: null,
      layoutMode: "single", activePaneId: "top-left",
      paneState: { layoutMode: "single", activePaneId: "top-left", activeContentId: null, paneTabContentIds: {} },
      settings: {}, createdAt: "", updatedAt: "2026-10-03T15:52:00.511Z", items: [], contentMeta: {},
    };
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ success: true, data: served }), {
        status: 200, headers: { "Content-Type": "application/json" },
      })) as typeof fetch;
    try {
      useWorkspaceStore.setState({ workspaces: [served as never], activeWorkspaceId: WS });
      await useWorkspaceStore.getState().updateWorkspace(WS, { settings: { any: 1 } });
      check(
        "updateWorkspace records the server's updatedAt as known",
        __lastAppliedUpdatedAtForTests(WS),
        "2026-10-03T15:52:00.511Z",
      );
    } finally {
      globalThis.fetch = realFetch;
      (globalThis as { window?: unknown }).window = realWindow;
    }
  }

  console.log("\nwrites to the workspace row never race themselves");
  {
    // The 2026-10-03 trace: five persist:write events inside 230 ms, all with
    // the same baseUpdatedAt. The server's optimistic-concurrency check let
    // the first through and 409'd the other four; each 409 adopted the row
    // (open mode — the whole arrangement) and retried. A tab dragged during
    // that storm snapped back to its old pane, and the layout flipped under
    // the user. Pinned against a fake server that implements the real 409
    // rule: a PATCH whose base is not the row's current updatedAt is refused
    // and handed the current row.
    const realFetch = globalThis.fetch;
    const realWindow = (globalThis as { window?: unknown }).window;
    const realNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    const realLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    // With a window present the content store mirrors every commit into
    // localStorage and the URL (syncBrowserState), and the persist path
    // snapshots the tree into localStorage. Node 25's built-in localStorage is
    // inert without --localstorage-file, so both get a Map. The tracer reads
    // its flag from the same place; no "dg:trace:workspace" key, so it stays
    // off.
    const storage = new Map<string, string>();
    const memoryStorage = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
    };
    (globalThis as { window?: unknown }).window = {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      location: { pathname: "/", href: "http://localhost/" },
      history: { replaceState: () => undefined },
      innerWidth: 1440,
      innerHeight: 900,
      addEventListener: () => undefined,
      localStorage: memoryStorage,
    };
    Object.defineProperty(globalThis, "localStorage", {
      value: memoryStorage,
      configurable: true,
    });
    // Node ships a `navigator` without `onLine`; persist treats that as
    // offline and returns before writing.
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: true },
      configurable: true,
    });

    const WS = "ws-race";
    type Snapshot = ReturnType<
      ReturnType<typeof useContentStore.getState>["getWorkspaceStateSnapshot"]
    >;
    type Row = {
      id: string;
      updatedAt: string;
      layoutMode: string;
      activePaneId: string;
      paneState: Snapshot;
      [key: string]: unknown;
    };
    let stamp = 0;
    const nextStamp = () =>
      new Date(Date.UTC(2026, 9, 3, 16, 0, 0, ++stamp)).toISOString();
    const server = {
      row: {
        id: WS, name: "ws", slug: "ws", isMain: true, isLocked: false, isView: false,
        viewRootContentId: null, viewRoot: null, parentWorkspaceId: null,
        status: "active", expiresAt: null, archivedAt: null,
        layoutMode: "dual-vertical", activePaneId: "top-left",
        paneState: {
          layoutMode: "dual-vertical", activePaneId: "top-left", activeContentId: "A",
          paneTabContentIds: { "top-left": { contentIds: ["A"], activeContentId: "A" } },
        },
        settings: {}, createdAt: "", updatedAt: nextStamp(), items: [], contentMeta: {},
      } as Row,
      /** Every state PATCH in arrival order: its base, its panes, the verdict. */
      patches: [] as Array<{ base: string | null; panes: Record<string, string[]>; status: number }>,
      /** When set, state PATCHes wait on it — a slow server, for interleaving. */
      hold: null as Promise<void> | null,
      // A second, NON-Main workspace: opens there go through the open-intent
      // check, which is where the provisional-open contract lives.
      row2: {
        id: "ws-view", name: "view", slug: "view", isMain: false, isLocked: false, isView: false,
        viewRootContentId: null, viewRoot: null, parentWorkspaceId: null,
        status: "active", expiresAt: null, archivedAt: null,
        layoutMode: "dual-vertical", activePaneId: "top-left",
        paneState: {
          layoutMode: "dual-vertical", activePaneId: "top-left", activeContentId: "A",
          paneTabContentIds: { "top-left": { contentIds: ["A"], activeContentId: "A" } },
        },
        settings: {}, createdAt: "", updatedAt: "2026-10-03T16:00:00.000Z", items: [], contentMeta: {},
      } as Row,
      intents: [] as Array<Record<string, unknown>>,
      assignments: [] as Array<Record<string, unknown>>,
      intentHold: null as Promise<void> | null,
      intentFail: false,
      intentAnswer: { allowed: true, alreadyCovered: false, conflict: null } as Record<string, unknown>,
      /** State PATCHes the view workspace received, in order. */
      patches2: [] as Array<{ panes: Record<string, string[]>; status: number }>,
    };
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status, headers: { "Content-Type": "application/json" },
      });
    const panesOf = (snapshot: Snapshot) =>
      Object.fromEntries(
        Object.entries(snapshot.paneTabContentIds).map(([paneId, pane]) => [
          paneId, pane?.contentIds ?? [],
        ]),
      );
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      if (url.endsWith(`/workspaces/${WS}/state`) && method === "PATCH") {
        if (server.hold) await server.hold;
        const snapshot = body as unknown as Snapshot & { baseUpdatedAt: string | null };
        const base = snapshot.baseUpdatedAt;
        if (!base || base !== server.row.updatedAt) {
          server.patches.push({ base, panes: panesOf(snapshot), status: 409 });
          return json(409, { success: false, data: server.row, error: { message: "conflict" } });
        }
        server.row = {
          ...server.row,
          updatedAt: nextStamp(),
          layoutMode: snapshot.layoutMode,
          activePaneId: snapshot.activePaneId,
          paneState: {
            layoutMode: snapshot.layoutMode,
            activePaneId: snapshot.activePaneId,
            activeContentId: snapshot.activeContentId,
            paneTabContentIds: snapshot.paneTabContentIds,
          },
        };
        server.patches.push({ base, panes: panesOf(snapshot), status: 200 });
        return json(200, { success: true, data: server.row });
      }
      if (url.endsWith(`/workspaces/${WS}`) && method === "PATCH") {
        return json(200, { success: true, data: server.row });
      }
      if (url.endsWith("/layout-records") || url.endsWith("/tabs")) {
        return json(200, { success: true, data: {} });
      }
      if (url.endsWith("/workspaces/open-intent") && method === "POST") {
        if (server.intentHold) await server.intentHold;
        if (server.intentFail) {
          return json(500, { success: false, error: { message: "intent check failed" } });
        }
        server.intents.push(body ?? {});
        return json(200, { success: true, data: server.intentAnswer });
      }
      if (url.endsWith(`/workspaces/${server.row2.id}/assignments`) && method === "POST") {
        server.assignments.push(body ?? {});
        return json(200, { success: true, data: server.row2 });
      }
      if (url.endsWith(`/workspaces/${server.row2.id}/state`) && method === "PATCH") {
        const snapshot = body as unknown as Snapshot;
        server.row2 = {
          ...server.row2,
          updatedAt: nextStamp(),
          paneState: {
            layoutMode: snapshot.layoutMode,
            activePaneId: snapshot.activePaneId,
            activeContentId: snapshot.activeContentId,
            paneTabContentIds: snapshot.paneTabContentIds,
          },
        };
        server.patches2.push({ panes: panesOf(snapshot), status: 200 });
        return json(200, { success: true, data: server.row2 });
      }
      if (url.endsWith(`/workspaces/${server.row2.id}`) && method === "PATCH") {
        return json(200, { success: true, data: server.row2 });
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    }) as typeof fetch;

    const persist = () => useWorkspaceStore.getState().persistActiveWorkspace();
    const statuses = () => server.patches.map((p) => p.status);

    try {
      useWorkspaceStore.setState({ workspaces: [server.row as never], activeWorkspaceId: WS });
      // Prime the base the way a real load does (updateWorkspace acks it).
      await useWorkspaceStore.getState().updateWorkspace(WS, {});
      check("the surface knows the row's revision", __lastAppliedUpdatedAtForTests(WS), server.row.updatedAt);

      // ── one write in flight ────────────────────────────────────────────
      seedSplit();
      useContentStore.getState().setSelectedContentId("B", { paneId: "top-right", focusPane: false });
      server.patches.length = 0;
      await Promise.all([persist(), persist(), persist(), persist(), persist()]);
      check(
        "five persists fired together reach the server as ONE accepted write",
        statuses(),
        [200],
      );
      check(
        "…carrying the current placement",
        server.patches[0]?.panes,
        { "top-left": ["A"], "top-right": ["B"], "bottom-left": [], "bottom-right": [] },
      );
      check(
        "…and the surface's arrangement is untouched afterwards",
        [useContentStore.getState().layoutMode, paneContents("top-left"), paneContents("top-right")],
        ["dual-vertical", ["A"], ["B"]],
      );

      // ── a drag during an in-flight write ──────────────────────────────
      // The user opens C on the right; that write is slow. While it is on the
      // wire they drag B left and the store persists again. The second call
      // coalesces; once the first is acked the write re-runs with the fresh
      // snapshot — on the NEW base, so it is accepted rather than 409'd.
      // B was opened as a preview; pin it ("touched") or C's open replaces it.
      useContentStore.getState().pinContentTab("tab:B");
      useContentStore.getState().setSelectedContentId("C", { paneId: "top-right", focusPane: false });
      server.patches.length = 0;
      let release!: () => void;
      server.hold = new Promise<void>((resolve) => { release = resolve; });
      const first = persist();
      useContentStore.getState().moveContentTabToPane("tab:B", "top-left", {});
      const second = persist();
      release();
      server.hold = null;
      await Promise.all([first, second]);
      check(
        "a persist during an in-flight write re-runs ONCE after it, both accepted",
        statuses(),
        [200, 200],
      );
      check(
        "…the first write carried what it captured, the second carries the drag",
        [server.patches[0]?.panes["top-right"], server.patches[1]?.panes["top-left"], server.patches[1]?.panes["top-right"]],
        [["B", "C"], ["A", "B"], ["C"]],
      );
      check("…and the tab is where the user dropped it", paneContents("top-left"), ["A", "B"]);
      check(
        "a persist with nothing new to say is skipped, not written",
        await persist().then(() => statuses()),
        [200, 200],
      );

      // ── a GENUINE conflict adopts the tab set, not the arrangement ─────
      // Another surface wrote the row: single-pane, with a new tab C. This
      // surface is dual-vertical with B open on the right and unpublished.
      // The 409 adoption must bring C in and leave this surface's layout,
      // active pane and B's placement alone (R3), then retry on the new base.
      seedSplit();
      useContentStore.getState().setSelectedContentId("B", { paneId: "top-right", focusPane: false });
      server.row = {
        ...server.row,
        updatedAt: nextStamp(),
        layoutMode: "single",
        activePaneId: "top-left",
        paneState: {
          layoutMode: "single", activePaneId: "top-left", activeContentId: "C",
          paneTabContentIds: { "top-left": { contentIds: ["A", "C"], activeContentId: "C" } },
        },
      };
      server.patches.length = 0;
      await persist();
      check("a stale base is refused once, then accepted on the adopted base", statuses(), [409, 200]);
      check(
        "adopting another writer's row keeps THIS surface's layout (reconcile, not open)",
        [useContentStore.getState().layoutMode, useContentStore.getState().activePaneId],
        ["dual-vertical", "top-left"],
      );
      check(
        "…brings in the tab the other writer opened, and keeps the unpublished one in its pane",
        [paneContents("top-left"), paneContents("top-right")],
        [["A", "C"], ["B"]],
      );
      check(
        "…and the retry publishes that merged arrangement",
        server.patches[1]?.panes,
        { "top-left": ["A", "C"], "top-right": ["B"], "bottom-left": [], "bottom-right": [] },
      );

      // ── intents retire on PLACEMENT, not membership ────────────────────
      // A move's intent must outlive a write that still had the tab in its
      // old pane; otherwise the next stale snapshot drags it back.
      seedSplit();
      useContentStore.getState().restoreWorkspace({
        activeContentId: "A", activePaneId: "top-left", layoutMode: "dual-vertical",
        paneTabContentIds: { "top-left": ["A", "B"], "top-right": [] },
      });
      clearPendingWorkspaceIntents();
      useContentStore.getState().moveContentTabToPane("tab:B", "top-right", {});
      // Ack of a write that predates the move: B present, but on the left.
      confirmWorkspaceWrite(["A", "B"], { "top-left": ["A", "B"], "top-right": [] }, "dual-vertical");
      reconcile({
        layoutMode: "dual-vertical", activePaneId: "top-left", activeContentId: "A",
        paneTabContentIds: { "top-left": ["A", "B"], "top-right": [] },
      });
      check(
        "a write that still had the tab in its OLD pane does not retire the move",
        paneContents("top-right"),
        ["B"],
      );
      // Ack of the write that carries the move: now it is durable.
      confirmWorkspaceWrite(["A", "B"], { "top-left": ["A"], "top-right": ["B"] }, "dual-vertical");
      reconcile({
        layoutMode: "dual-vertical", activePaneId: "top-left", activeContentId: "A",
        paneTabContentIds: { "top-left": ["A", "B"], "top-right": [] },
      });
      check(
        "once a write places it there, the snapshot is trusted again",
        paneContents("top-right"),
        [],
      );
      // A pane the written layout no longer shows can never match: fall back
      // to membership so a collapse does not leave an immortal intent.
      useContentStore.getState().moveContentTabToPane("tab:B", "top-right", {});
      confirmWorkspaceWrite(["A", "B"], { "top-left": ["A", "B"] }, "single");
      reconcile({
        layoutMode: "dual-vertical", activePaneId: "top-left", activeContentId: "A",
        paneTabContentIds: { "top-left": ["A", "B"], "top-right": [] },
      });
      check(
        "an intent for a pane the written layout does not show retires on membership",
        paneContents("top-right"),
        [],
      );

      // ── the tab is on screen before the server has agreed ─────────────
      // In a non-Main workspace an open used to WAIT on the open-intent POST
      // (and an assignment POST) before the tab existed. Now the tab shows at
      // once; the row is not persisted until the server agrees; a refusal
      // keeps the tab under the dialog and cancelling takes it back.
      console.log("\nopening in a view workspace shows the tab before the server agrees");
      const WS2 = server.row2.id;
      useWorkspaceStore.setState({
        workspaces: [server.row as never, server.row2 as never],
        activeWorkspaceId: WS2,
      });
      await useWorkspaceStore.getState().updateWorkspace(WS2, {});
      seedSplit();
      const open = (id: string) =>
        useWorkspaceStore.getState().requestOpenContent(id, { title: `Note ${id}`, pin: true });

      // allowed, slow server
      let releaseIntent!: () => void;
      server.intentHold = new Promise<void>((resolve) => { releaseIntent = resolve; });
      server.patches2.length = 0;
      const opening = open("N");
      check("the tab exists the moment it is asked for", paneContents("top-left"), ["A", "N"]);
      await persist();
      check("…but the row is not written while the server is still deciding", server.patches2.length, 0);
      releaseIntent();
      server.intentHold = null;
      await opening;
      check("once allowed, the claim is made first…", server.assignments.map((a) => a.contentId), ["N"]);
      check(
        "…and the deferred write follows, carrying the tab",
        server.patches2.at(-1)?.panes["top-left"],
        ["A", "N"],
      );

      // refused → cancel
      server.intentAnswer = {
        allowed: false,
        conflict: {
          conflictType: "overlap", workspaceId: "ws-other", workspaceName: "Other",
          contentId: "M", contentTitle: "Note M", claimContentId: "M", claimContentTitle: "Note M",
          scope: "item", folderScopeContentId: null, folderScopeContentTitle: null,
        },
      };
      server.patches2.length = 0;
      await open("M");
      check("a refused open keeps the tab on screen under the dialog", [paneContents("top-left").includes("M"), useWorkspaceStore.getState().conflict !== null], [true, true]);
      await persist();
      check("…still unwritten while the dialog is up", server.patches2.length, 0);
      useWorkspaceStore.getState().cancelOpenConflict();
      check("cancel takes the tab back", paneContents("top-left").includes("M"), false);
      await new Promise((r) => setTimeout(r, 0));
      check("…and the deferred write runs without it", server.patches2.at(-1)?.panes["top-left"], ["A", "N"]);

      // refused → borrow
      server.assignments.length = 0;
      await open("K");
      await useWorkspaceStore.getState().borrowPendingContent("2026-12-01T00:00:00.000Z");
      check("borrowing keeps the tab and claims it borrowed", [paneContents("top-left").includes("K"), server.assignments[0]?.assignmentType], [true, "borrowed"]);

      // the server never answers
      server.intentAnswer = { allowed: true, alreadyCovered: false, conflict: null };
      server.intentFail = true;
      let threw = false;
      await open("F").catch(() => { threw = true; });
      server.intentFail = false;
      check("an intent check that fails takes the tab back and reports", [paneContents("top-left").includes("F"), threw], [false, true]);
      check("nothing is left provisional afterwards (the next write goes through)", await persist().then(() => server.patches2.length > 0), true);

      useWorkspaceStore.setState({ workspaces: [server.row as never], activeWorkspaceId: WS });
    } finally {
      globalThis.fetch = realFetch;
      (globalThis as { window?: unknown }).window = realWindow;
      if (realNavigator) Object.defineProperty(globalThis, "navigator", realNavigator);
      if (realLocalStorage) Object.defineProperty(globalThis, "localStorage", realLocalStorage);
    }
  }

  console.log(
    `\nworkspace-pane-placement smoke: ${failures === 0 ? "PASS" : `FAIL (${failures})`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
})();
