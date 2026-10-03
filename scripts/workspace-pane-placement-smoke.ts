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
  type WorkspacePaneId,
  type WorkspaceLayoutMode,
} from "../state/content-store";
import {
  buildPanesFromLayoutRecord,
  restoreContentWorkspace,
} from "../extensions/workplaces/state/workspace-store";
import { DEFAULT_SETTINGS } from "../lib/features/settings/validation";
import { paneForHotkeyCode } from "../lib/features/content/pane-hotkeys";

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
  // Intents are module state and outlive a scenario; a leftover one would be
  // re-added by the next block's reconcile and read as a product bug.
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

console.log(
  `\nworkspace-pane-placement smoke: ${failures === 0 ? "PASS" : `FAIL (${failures})`}`,
);
process.exit(failures === 0 ? 0 : 1);
