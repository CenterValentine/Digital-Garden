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
