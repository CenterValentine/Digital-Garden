/**
 * Fractional ordering for rows, columns, and views.
 *
 * Rows use a fractional string key rather than the `Int displayOrder` the
 * ContentNode tree uses (plan D7). The reason is concurrency, not elegance:
 * dragging one row in a 5,000-row grid rewrites ONE row instead of
 * renumbering thousands, and two people reordering at once do not collide.
 *
 * This is a deliberate divergence from the tree convention — documented here
 * so it does not read as an accident to whoever finds it next.
 *
 * Backed by `fractional-indexing` rather than hand-rolled midpoint
 * arithmetic (CLAUDE.md: prefer a reputable, maintained library). Hand-rolled
 * versions get the base-62 carry cases subtly wrong and the failure mode is a
 * silently unsortable table.
 *
 * Pure — safe to import from client components.
 */

import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

/** Anything with a sort key — rows, columns, and views all qualify. */
export interface Ordered {
  id: string;
  sortKey: string;
}

/**
 * A key that sorts after everything currently present.
 * `null, null` is the first key in an empty collection.
 */
export function keyAtEnd(lastKey: string | null): string {
  return generateKeyBetween(lastKey, null);
}

/** A key that sorts before everything currently present. */
export function keyAtStart(firstKey: string | null): string {
  return generateKeyBetween(null, firstKey);
}

/** A key landing strictly between two neighbours. Either may be null. */
export function keyBetween(
  before: string | null,
  after: string | null
): string {
  return generateKeyBetween(before, after);
}

/** `n` evenly spaced keys between two neighbours — for multi-row paste. */
export function keysBetween(
  before: string | null,
  after: string | null,
  n: number
): string[] {
  if (n <= 0) return [];
  return generateNKeysBetween(before, after, n);
}

/**
 * The key an item needs to land at `targetIndex` in an already-sorted list.
 *
 * `items` MUST be sorted by sortKey; passing an unsorted list produces a key
 * that looks valid and sorts wrong, which is worse than throwing.
 */
export function keyForIndex(items: Ordered[], targetIndex: number): string {
  const clamped = Math.max(0, Math.min(targetIndex, items.length));
  const before = clamped > 0 ? items[clamped - 1].sortKey : null;
  const after = clamped < items.length ? items[clamped].sortKey : null;
  return generateKeyBetween(before, after);
}

/**
 * The key for moving `movingId` to sit at `targetIndex`, with the moving item
 * excluded from its own neighbour calculation — otherwise a one-slot move
 * computes a key between the item and itself and lands back where it started.
 */
export function keyForMove(
  items: Ordered[],
  movingId: string,
  targetIndex: number
): string {
  const without = items.filter((i) => i.id !== movingId);
  return keyForIndex(without, targetIndex);
}

/**
 * Total order. Ties break on `id` so pagination cursors are stable even if
 * two keys collide — which `fractional-indexing` avoids, but a bad import or
 * a hand-written key could still produce.
 */
export function compareOrdered(a: Ordered, b: Ordered): number {
  if (a.sortKey !== b.sortKey) return a.sortKey < b.sortKey ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortByKey<T extends Ordered>(items: T[]): T[] {
  return [...items].sort(compareOrdered);
}

// ── Opaque column keys ───────────────────────────────────────────────────

const KEY_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * A short opaque key for a new column — the JSONB key, never the display
 * name (plan D3). Ten chars of base-36 is ~52 bits: collisions within one
 * table's handful of columns are not a practical concern, and the caller
 * checks uniqueness against the table anyway.
 *
 * Starts with a letter so the key is always a valid identifier in any
 * expression-index or JSON-path context we might add later.
 */
export function generateColumnKey(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = KEY_ALPHABET[bytes[0] % 26];
  for (let i = 1; i < bytes.length; i++) {
    out += KEY_ALPHABET[bytes[i] % KEY_ALPHABET.length];
  }
  return out;
}

/** A column key unique within `existing`. Retries are effectively never hit. */
export function generateUniqueColumnKey(existing: Iterable<string>): string {
  const taken = new Set(existing);
  for (let attempt = 0; attempt < 10; attempt++) {
    const key = generateColumnKey();
    if (!taken.has(key)) return key;
  }
  throw new Error("Could not generate a unique column key");
}
