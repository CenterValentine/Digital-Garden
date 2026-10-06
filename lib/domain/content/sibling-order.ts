/**
 * The ONE order of siblings in the file tree, and the one way a moved row is
 * placed among them.
 *
 * Order used to be decided in several places that did not quite agree, and the
 * disagreements are what made rows change position between refreshes:
 *
 *  - The tree API and the move API each sorted by `displayOrder`, then title —
 *    with no final tiebreak. Two siblings with the same order and title kept
 *    whatever order Postgres returned them in, which shifts when either row is
 *    updated. `compareSiblings` ends on the id, so every sort is total.
 *  - A drop was sent to the server as an index into the rows on screen. The
 *    server indexed into ITS sibling list, which also holds referenced media
 *    (shown in a separate block) and rows the tree hides, while the screen's
 *    list holds an expanded reference block spliced in. Whenever the two lists
 *    differed, the item landed somewhere other than where it was dropped, and
 *    the next refresh moved it. A drop is now an ANCHOR — "after this row" —
 *    which means the same thing in both lists; `placeAmongSiblings` is the
 *    placement both the server and the optimistic update use.
 *
 * Pure, no Prisma: the move route, the tree route, the sidebar and the
 * `tree:smooth:check` gate all import it.
 */

import { isUuid } from "@/lib/domain/content/uuid";
import { removeNodesFromTree } from "@/lib/domain/content/tree-remove";

export interface OrderedSibling {
  id: string;
  title: string;
  displayOrder: number;
}

/** displayOrder, then title, then id — total, so equal rows can never swap. */
export function compareSiblings(a: OrderedSibling, b: OrderedSibling): number {
  if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
  const byTitle = a.title.localeCompare(b.title);
  if (byTitle !== 0) return byTitle;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Where `row` lands among `sorted` siblings (already in `compareSiblings`
 * order) — for showing a pending row where the server will put it.
 */
export function sortedInsertIndex(
  sorted: readonly OrderedSibling[],
  row: OrderedSibling,
): number {
  const at = sorted.findIndex((sibling) => compareSiblings(row, sibling) < 0);
  return at === -1 ? sorted.length : at;
}

/**
 * Where a dropped row goes.
 *
 * - `afterId: string` — immediately after that sibling.
 * - `afterId: null`   — first.
 * - `afterId` absent, or naming a row that isn't a sibling — `index`, clamped
 *   (the legacy contract, kept as the fallback).
 */
export interface SiblingPlacement {
  afterId?: string | null;
  index: number;
}

/**
 * `siblings` with `moved` taken out of wherever it was and put where
 * `placement` says. Identity of every other entry is preserved.
 */
export function placeAmongSiblings<T extends { id: string }>(
  siblings: readonly T[],
  moved: T,
  placement: SiblingPlacement,
): T[] {
  const rest = siblings.filter((sibling) => sibling.id !== moved.id);
  let at: number;
  if (placement.afterId === null) {
    at = 0;
  } else if (typeof placement.afterId === "string") {
    const anchor = rest.findIndex((sibling) => sibling.id === placement.afterId);
    at = anchor >= 0 ? anchor + 1 : clampIndex(placement.index, rest.length);
  } else {
    at = clampIndex(placement.index, rest.length);
  }
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}

/**
 * The new numbers after a placement: every row of `ordered` other than
 * `movedId` whose displayOrder differs from its position. The moved row is
 * written on its own (it also changes parent). Rows already at their position
 * are left alone — renumbering used to rewrite EVERY sibling, which stamped
 * each one's `updatedAt`: one drag made a whole folder "just modified" in
 * search (sorted by it, top 100), the mobile recents and every row tooltip.
 */
export function renumbering(
  ordered: readonly { id: string; displayOrder: number }[],
  movedId: string,
): { id: string; displayOrder: number }[] {
  const changes: { id: string; displayOrder: number }[] = [];
  ordered.forEach((row, position) => {
    if (row.id !== movedId && row.displayOrder !== position) {
      changes.push({ id: row.id, displayOrder: position });
    }
  });
  return changes;
}

/**
 * Where a row ARRIVING in a list goes — a new upload, an AI output, an item
 * filed into a folder by something other than a drag.
 *
 * - `"top"`: before every sibling (what you put somewhere lands where you
 *   look: inline create, Move to folder, uploads).
 * - `"bottom"`: after every sibling (appended: attachments, bookmarks).
 * - `{ afterId }`: right after that sibling — how a batch keeps its order at
 *   the top (each item goes after the one before it). An `afterId` that isn't
 *   a sibling falls back to the top.
 *
 * These callers used to store `displayOrder: 0` or keep the number the row
 * had in its OLD folder, so it tied with the first row (then sorted by title)
 * or landed at an arbitrary spot. `sorted` is the destination's siblings in
 * `compareSiblings` order, not including the arriving row.
 */
export type ArrivalPlacement = "top" | "bottom" | { afterId: string | null };

export function slotForArrival(
  sorted: readonly OrderedSibling[],
  placement: ArrivalPlacement,
  arrivingId: string,
): { displayOrder: number; changes: { id: string; displayOrder: number }[] } {
  if (placement === "bottom") {
    const last = sorted[sorted.length - 1];
    return { displayOrder: last ? last.displayOrder + 1 : 0, changes: [] };
  }
  const afterId = placement === "top" ? null : placement.afterId;
  if (afterId === null || !sorted.some((sibling) => sibling.id === afterId)) {
    return { displayOrder: displayOrderForTop(sorted[0]?.displayOrder ?? null), changes: [] };
  }
  const arriving: OrderedSibling = { id: arrivingId, title: "", displayOrder: Number.NaN };
  const ordered = placeAmongSiblings(sorted, arriving, { afterId, index: 0 });
  return {
    displayOrder: ordered.indexOf(arriving),
    changes: renumbering(ordered, arrivingId),
  };
}

// ── Sorting one level (the tree header's sort menu) ─────────────────────────
//
// A sort is a one-time, permanent reorder of ONE list — the folder the tree
// targets — written as its displayOrder; nothing inside it is touched and
// nothing about the sort is remembered (owner, 2026-10-06).

/** What a sort reads about each row of the level. */
export interface LevelSortRow extends OrderedSibling {
  /** A folder, or a shortcut to a live folder (it reads as one). */
  folderLike: boolean;
  /** Holds other items: a folder with contents, a note with sub-pages. */
  nested: boolean;
}

export type LevelSortMode = "float-folders" | "float-nested" | "name";
export type NameDirection = "asc" | "desc";

/** A folder, or a shortcut to a live folder. */
export function isFolderLike(row: {
  contentType: string;
  shortcut?: { targetId: string | null; targetDeleted: boolean; targetContentType: string | null } | null;
}): boolean {
  if (row.contentType === "folder") return true;
  const shortcut = row.shortcut;
  return (
    row.contentType === "shortcut" &&
    !!shortcut?.targetId &&
    !shortcut.targetDeleted &&
    shortcut.targetContentType === "folder"
  );
}

const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** 0–9, A–Z: case-insensitive, numbers compared by value ("Note 2" < "Note 10"). */
export function compareNames(a: { title: string }, b: { title: string }): number {
  return nameCollator.compare(a.title ?? "", b.title ?? "");
}

/**
 * The block a level currently keeps on top, as a group rank per row: folders
 * when every folder already sits above every other row, otherwise nested
 * items the same way, otherwise one group. A name sort orders WITHIN these
 * groups, so floating folders and then sorting by name keeps the folders on
 * top, each part in name order — the combination the owner asked for.
 */
function floatedGroups(rows: readonly LevelSortRow[]): (row: LevelSortRow) => number {
  const floated = (flag: (row: LevelSortRow) => boolean): boolean => {
    const first = rows.findIndex((row) => !flag(row));
    return first > 0 && rows.slice(first).every((row) => !flag(row));
  };
  if (floated((row) => row.folderLike)) return (row) => (row.folderLike ? 0 : 1);
  if (floated((row) => row.nested)) return (row) => (row.nested ? 0 : 1);
  return () => 0;
}

/**
 * Which way a name sort goes next: A→Z, unless the level is already in A→Z
 * order (within its floated groups) — then Z→A. That is the toggle, with
 * nothing remembered: the list itself says which way it was sorted.
 */
export function nextNameDirection(rows: readonly LevelSortRow[]): NameDirection {
  const group = floatedGroups(rows);
  const ascending = rows.every(
    (row, i) => i === 0 || group(rows[i - 1]) !== group(row) || compareNames(rows[i - 1], row) <= 0,
  );
  const allSameName = rows.every((row) => compareNames(rows[0], row) === 0);
  return ascending && rows.length > 1 && !allSameName ? "desc" : "asc";
}

/**
 * The level's new order. `rows` is the level as it stands (`compareSiblings`
 * order). Floats are stable — each part keeps the order it had.
 */
export function sortLevel(
  rows: readonly LevelSortRow[],
  mode: LevelSortMode,
): { ordered: LevelSortRow[]; direction?: NameDirection } {
  const ranked = rows.map((row, index) => ({ row, index }));
  if (mode === "float-folders" || mode === "float-nested") {
    const floats = (row: LevelSortRow) => (mode === "float-folders" ? row.folderLike : row.nested);
    ranked.sort((a, b) => Number(floats(b.row)) - Number(floats(a.row)) || a.index - b.index);
    return { ordered: ranked.map((entry) => entry.row) };
  }
  const group = floatedGroups(rows);
  const direction = nextNameDirection(rows);
  const sign = direction === "asc" ? 1 : -1;
  ranked.sort(
    (a, b) =>
      group(a.row) - group(b.row) ||
      sign * compareNames(a.row, b.row) ||
      (a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0),
  );
  return { ordered: ranked.map((entry) => entry.row), direction };
}

// ── A folder's remembered sort ("keep it sorted") ────────────────────────────
//
// Owner, 2026-10-06: a folder can REMEMBER its sort and stay sorted — new
// items, uploads, moves in and renames take their sorted place. The memory
// lives on the folder (FolderPayload.viewPrefs.treeSort), so the top of the
// vault, which has no folder row, sorts only once. Dragging to reorder inside
// a sorted folder turns its memory off (your order wins) — the move route
// materializes the sorted order first, so nothing jumps.

/** One float at a time (floating both would undo one), plus a name order. */
export interface KeptSort {
  float?: "folders" | "nested";
  name?: NameDirection;
}

/** A stored value (untrusted JSON) as a KeptSort, or null when it holds none. */
export function parseKeptSort(value: unknown): KeptSort | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { float?: unknown; name?: unknown };
  const kept: KeptSort = {};
  if (raw.float === "folders" || raw.float === "nested") kept.float = raw.float;
  if (raw.name === "asc" || raw.name === "desc") kept.name = raw.name;
  return kept.float || kept.name ? kept : null;
}

/**
 * What choosing a sort does to a folder's memory: a float toggles (choosing
 * the active one turns it off; the other float replaces it), Name cycles
 * A–Z → Z–A → A–Z, and "stop" forgets everything.
 */
export function nextKeptSort(kept: KeptSort | null, choice: LevelSortMode | "stop"): KeptSort | null {
  if (choice === "stop") return null;
  const next: KeptSort = { ...(kept ?? {}) };
  if (choice === "float-folders" || choice === "float-nested") {
    const float = choice === "float-folders" ? "folders" : "nested";
    if (next.float === float) delete next.float;
    else next.float = float;
  } else {
    next.name = next.name === "asc" ? "desc" : "asc";
  }
  return parseKeptSort(next);
}

/**
 * A level in its remembered order: the floated kind on top, then — within each
 * part — by name when one is set, else the order the rows already had.
 * `rows` in their current (`compareSiblings`) order.
 */
export function applyKeptSort<T extends LevelSortRow>(rows: readonly T[], kept: KeptSort): T[] {
  const floats = (row: LevelSortRow): number =>
    kept.float === "folders" ? Number(!row.folderLike) : kept.float === "nested" ? Number(!row.nested) : 0;
  const sign = kept.name === "desc" ? -1 : 1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort(
      (a, b) =>
        floats(a.row) - floats(b.row) ||
        (kept.name ? sign * compareNames(a.row, b.row) : 0) ||
        (kept.name ? (a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0) : a.index - b.index),
    )
    .map((entry) => entry.row);
}

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) return length;
  return Math.max(0, Math.min(Math.trunc(index), length));
}

/** One visible row beside a drop point, as the drop sees it. */
export interface DropRow {
  /** The row's own id (may be synthetic — a mirror, a people mount). */
  id: string;
  /** The content id a server can place against, or null if it has none. */
  anchorId: string | null;
  /** Rows in a parent's reference block are ordered among themselves. */
  kind: "primary" | "reference";
}

/**
 * The anchor for a drop at `index` among the rows on screen: the nearest row
 * BEFORE the drop point that is the same kind as the moved row, isn't being
 * dragged, and is real content. `null` = the drop is first of its kind.
 */
export function resolveDropAnchor(
  rows: readonly DropRow[],
  index: number,
  dragIds: ReadonlySet<string>,
  kind: DropRow["kind"],
): string | null {
  for (let i = Math.min(index, rows.length) - 1; i >= 0; i--) {
    const row = rows[i];
    if (dragIds.has(row.id)) continue;
    if (row.kind !== kind) continue;
    if (!row.anchorId) continue;
    return row.anchorId;
  }
  return null;
}

/** The fields of a tree row that decide how it can anchor a drop. */
export interface DropRowSource {
  id: string;
  isNestedReference?: boolean;
  isShortcutMirror?: boolean;
  mirrorOf?: string;
  windowRef?: unknown;
}

/**
 * How a visible row beside a drop point can anchor it.
 *
 * - A window-reference row is derived per fetch (a note's drawer lists what it
 *   windows); it is never a stored sibling, so it never anchors.
 * - A shortcut-mirror row stands for the real child it mirrors — a drop into
 *   a mirror is forwarded to the real folder, where that child IS a sibling.
 * - Anything else anchors only if it is real content (people mounts and
 *   pending `temp-` rows are not).
 */
export function dropRowFor(row: DropRowSource): DropRow {
  const kind: DropRow["kind"] = row.isNestedReference ? "reference" : "primary";
  if (row.windowRef) return { id: row.id, anchorId: null, kind };
  if (row.isShortcutMirror) {
    return { id: row.id, anchorId: row.mirrorOf && isUuid(row.mirrorOf) ? row.mirrorOf : null, kind };
  }
  return { id: row.id, anchorId: isUuid(row.id) ? row.id : null, kind };
}

/**
 * The displayOrder that puts a new row first among its siblings: one less
 * than the current first (0 when there are none). What the tree's inline
 * create shows — its placeholder row sits at the top — and what
 * `create-document` already stored; the general create route used to store 0,
 * which sorted the new row by title among every other 0 and made it jump.
 */
export function displayOrderForTop(firstSiblingOrder: number | null): number {
  return firstSiblingOrder === null ? 0 : firstSiblingOrder - 1;
}

/** A tree row as far as placing a moved row under a parent goes. */
export interface PlaceableTreeNode<T> {
  id: string;
  parentId?: string | null;
  role?: string | null;
  children?: T[];
  references?: T[];
}

/**
 * `nodes` with `moved` placed under the row `parentId` — into `references`
 * for a referenced row, `children` otherwise — by `placeAmongSiblings`.
 * Branches that don't contain the parent keep their identity. Used for the
 * carried shortcut targets of a view-scoped tree: a row dropped onto an
 * out-of-view shortcut has no parent in the visible tree to land under.
 */
export function insertUnderParent<T extends PlaceableTreeNode<T>>(
  nodes: T[],
  parentId: string,
  moved: T,
  placement: SiblingPlacement,
): T[] {
  let changed = false;
  const next = nodes.map((candidate) => {
    if (candidate.id === parentId) {
      changed = true;
      const landing = { ...moved, parentId } as T;
      return moved.role === "referenced"
        ? { ...candidate, references: placeAmongSiblings(candidate.references ?? [], landing, placement) }
        : { ...candidate, children: placeAmongSiblings(candidate.children ?? [], landing, placement) };
    }
    const children = candidate.children?.length
      ? insertUnderParent(candidate.children, parentId, moved, placement)
      : candidate.children;
    const references = candidate.references?.length
      ? insertUnderParent(candidate.references, parentId, moved, placement)
      : candidate.references;
    if (children === candidate.children && references === candidate.references) return candidate;
    changed = true;
    return { ...candidate, children, references };
  });
  return changed ? next : nodes;
}

function forestHas<T extends PlaceableTreeNode<T>>(nodes: readonly T[], id: string): boolean {
  return nodes.some(
    (node) =>
      node.id === id ||
      forestHas(node.children ?? [], id) ||
      forestHas(node.references ?? [], id),
  );
}

/**
 * Whether a move involves the carried out-of-view shortcut targets: a dragged
 * item that isn't in the visible tree (a shortcut's row moves its real item,
 * which in a view lives only in `carried`), or a destination that's only
 * there. Such a move goes through `moveAcrossForests`; anything else stays on
 * the visible tree's own path.
 */
export function moveTouchesCarried<T extends PlaceableTreeNode<T>>(
  forests: { main: readonly T[]; carried: readonly T[] },
  dragIds: readonly string[],
  parentId: string | null,
): boolean {
  if (dragIds.some((id) => !forestHas(forests.main, id) && forestHas(forests.carried, id))) {
    return true;
  }
  return (
    parentId !== null &&
    !forestHas(forests.main, parentId) &&
    forestHas(forests.carried, parentId)
  );
}

/**
 * The optimistic side of a move whose source or destination is in the
 * CARRIED shortcut targets (a view-scoped tree's out-of-view folders) rather
 * than the visible tree. Dragging a shortcut's row moves the real item it
 * stands for, which in a view may live only in `carried` — and may land in
 * the view, in another out-of-view folder, or back among its siblings. Rows
 * leave whichever collection holds them and land under `parentId` wherever
 * that is (null = the visible top level), each at its own placement.
 */
export function moveAcrossForests<T extends PlaceableTreeNode<T>>(
  forests: { main: T[]; carried: T[] },
  moves: ReadonlyArray<{ node: T; placement: SiblingPlacement }>,
  parentId: string | null,
): { main: T[]; carried: T[] } {
  const ids = new Set(moves.map((move) => move.node.id));
  let main = removeNodesFromTree(forests.main, ids);
  let carried = removeNodesFromTree(forests.carried, ids);
  for (const { node, placement } of moves) {
    if (parentId === null) {
      main = placeAmongSiblings(main, node, placement);
    } else if (forestHas(main, parentId)) {
      main = insertUnderParent(main, parentId, node, placement);
    } else if (forestHas(carried, parentId)) {
      carried = insertUnderParent(carried, parentId, node, placement);
    }
  }
  return { main, carried };
}
