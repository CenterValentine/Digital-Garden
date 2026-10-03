// Hold a direction key, click a file, open it there.
//
// One 3×3 cluster, the shape the panes make, laid out where your left hand
// already rests:
//
//     Q ↖   W ↑   E ↗          Q E Z C — the quad's four corners
//     A ←   S ·   D →          A D     — left / right of a vertical split
//     Z ↙   X ↓   C ↘          W X     — top / bottom of a horizontal split
//                              S       — collapse to one pane
//
// A, W and Q all mean top-left, because in a vertical split "left" IS the
// top-left pane, and in a horizontal split "top" is too. The same key means
// the same place in whatever layout you are in; the layout decides which
// names are reachable, not which key does what.
//
// NO MODIFIER (owner call, 2026-10-02): hold the letter, click. The letters
// are the discoverable gesture, so they stay bare; the tree's own `r` / `d` /
// `a` shortcuts, which a bare "d" collided with (aiming at the right pane
// deleted the selection), moved to Option instead — see FileTree.tsx.
//
// Cmd/Ctrl-click and Shift-click are separately unavailable as modifiers:
// both are multi-select gestures in the tree. So the letter is what
// distinguishes this gesture, not a modifier.
//
// Keyed on `event.code`, never `event.key`. If anyone ever holds a modifier
// alongside, macOS turns the letter into a glyph (⌥D "∂", ⌥S "ß") and a `key`
// comparison stops matching; `code` is the physical key and says KeyD either
// way.

import type { WorkspacePaneId } from "@/state/content-store";

/** Collapse to a single pane and make the clicked content the live one. */
export const PANE_HOTKEY_SINGLE = "single" as const;

export type PaneHotkeyTarget = WorkspacePaneId | typeof PANE_HOTKEY_SINGLE;

const PANE_HOTKEY_BY_CODE: Record<string, PaneHotkeyTarget> = {
  // Corners — the quad, read as a grid.
  KeyQ: "top-left",
  KeyE: "top-right",
  KeyZ: "bottom-left",
  KeyC: "bottom-right",
  // Left / right — a vertical split.
  KeyA: "top-left",
  KeyD: "top-right",
  // Top / bottom — a horizontal split.
  KeyW: "top-left",
  KeyX: "bottom-left",
  // Centre.
  KeyS: PANE_HOTKEY_SINGLE,
};

/**
 * The pane a physical key names, or null if it names none.
 *
 * Pure, and deliberately layout-blind: `openContentInPane` already expands the
 * layout when a named pane is not currently visible — the same thing the
 * context menu's "(expand layout)" entries do — so pressing Z in a vertical
 * split opens a quad rather than failing.
 */
export function paneForHotkeyCode(code: string): PaneHotkeyTarget | null {
  return PANE_HOTKEY_BY_CODE[code] ?? null;
}

/**
 * The letters that aim at a pane, for the context menu's shortcut column —
 * "Q / A / W" for top-left, since left-of-a-split, top-of-a-split and the
 * quad's corner are all that pane. DERIVED from the table above rather than
 * written out again, so the menu can never advertise a key the tracker does
 * not honour.
 */
export function hotkeyLettersForPane(paneId: WorkspacePaneId): string {
  return Object.entries(PANE_HOTKEY_BY_CODE)
    .filter(([, target]) => target === paneId)
    .map(([code]) => code.replace(/^Key/, ""))
    .join(" / ");
}

/** One line for a tooltip, covering the keys the menu has no row for (S). */
export const PANE_HOTKEY_LEGEND =
  "Hold a letter and click a file — Q W E / A S D / Z X C aim at a pane; S collapses to one pane.";

/**
 * True when the keystroke is someone typing rather than aiming.
 *
 * Without this the gesture would fire mid-rename: the tree's inline rename is
 * an ordinary input, and "s" is a letter people type. A bare-letter binding
 * has to be much more careful about this than a modifier one.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

let heldCode: string | null = null;
let trackerInstalled = false;

/**
 * Start tracking the direction keys. Idempotent; installed lazily by the tree.
 *
 * Blur clears the held key, the same lesson `ensureAltTracker` records: a
 * keyup missed because the user tabbed away would otherwise wedge the flag and
 * send every later click to a pane they are no longer asking for.
 */
export function ensurePaneHotkeyTracker(): void {
  if (trackerInstalled || typeof window === "undefined") return;
  trackerInstalled = true;

  // CAPTURE phase, both of them. The file tree runs single-key shortcuts of
  // its own and calls stopPropagation on them, and react-arborist does
  // type-ahead on plain letters — so a bubble-phase listener here never saw
  // the keystroke at all and no binding fired. Capture runs before any of that
  // can intervene.
  //
  // keyup needs it just as much: a stopped keyup would leave the key latched
  // down forever and send every later click to a pane nobody is asking for —
  // the same wedge the blur handler below exists to undo.
  window.addEventListener(
    "keydown",
    (event) => {
      if (isTypingTarget(event.target)) return;
      // A modifier means someone is asking for something else — ⌥D is the
      // tree's delete now, ⌘D is the browser's bookmark. Only a bare letter
      // aims.
      if (event.altKey || event.metaKey || event.ctrlKey) return;
      if (paneForHotkeyCode(event.code)) heldCode = event.code;
    },
    { capture: true }
  );
  window.addEventListener(
    "keyup",
    (event) => {
      if (event.code === heldCode) heldCode = null;
    },
    { capture: true }
  );
  window.addEventListener("blur", () => {
    heldCode = null;
  });
}

/** The pane currently being aimed at, or null when no direction key is held. */
export function heldPaneTarget(): PaneHotkeyTarget | null {
  return heldCode ? paneForHotkeyCode(heldCode) : null;
}

/** Test seam — the tracker is window-level and this lets a harness drive it. */
export function __setHeldPaneCodeForTests(code: string | null): void {
  heldCode = code;
}
