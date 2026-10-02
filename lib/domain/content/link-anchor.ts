/**
 * Wiki-link anchors — "which part of the target" (client-safe).
 *
 * A wiki-link's `targetId` says WHAT it points at; its optional `anchor` says
 * WHERE inside it: `"<kind>:<id>"`, e.g. `annotation:clx…` for a highlight in
 * a book. The kind vocabulary is open — the editor core never interprets it:
 *
 *   - Picking one: an anchor PROVIDER (registered by whoever owns that kind of
 *     content — the reader extension for book highlights) lists the anchors
 *     inside a target for the `[[Title#` step of the suggestion menu.
 *   - Following one: the click hands the anchor to the content store's
 *     pending-anchor slot (state/content-anchor-store.ts); the viewer that
 *     opens the target takes it and scrolls/jumps there.
 *
 * Kinds today: `annotation` (reader highlights/notes/bookmarks) and `verse`
 * (scripture: `verse:alma/32/21-23`, typed directly as `[[Alma 32:21`).
 * Designed for more — headings in other notes, block refs, PDF pages, media
 * timestamps — each added by its owner, no schema change.
 *
 * Absent `anchor` renders nothing, so every link written before this existed
 * serializes byte-identically (same contract as `targetId` / `expand`).
 */

export interface LinkAnchor {
  kind: string;
  id: string;
}

const ANCHOR_RE = /^([a-z][a-z0-9-]*):(.+)$/;

export function parseLinkAnchor(value: string | null | undefined): LinkAnchor | null {
  if (!value) return null;
  const match = ANCHOR_RE.exec(value);
  return match ? { kind: match[1], id: match[2] } : null;
}

export function formatLinkAnchor(anchor: LinkAnchor): string {
  return `${anchor.kind}:${anchor.id}`;
}

/** A link target the suggestion menu can drill into (`[[Title#`). */
export interface LinkAnchorTarget {
  id: string;
  title: string;
  contentType?: string;
}

/** One pickable anchor inside a target. */
export interface LinkAnchorItem {
  /** `"<kind>:<id>"` — stored on the link. */
  anchor: string;
  /** Short human label stored with the link (a quote, a heading's text). */
  label: string;
  /** Secondary line in the menu (chapter, page, timestamp). */
  detail?: string;
  /** Optional swatch color for the menu row. */
  color?: string;
  /**
   * The link's text instead of "Title › “label”" — for anchors that name
   * themselves ("Alma 32:21").
   */
  display?: string;
}

/**
 * Lists the anchors inside a target, filtered by `query`. Returns null when
 * the provider has nothing to say about this target (not its kind of content).
 */
export type LinkAnchorLister = (
  target: LinkAnchorTarget,
  query: string
) => Promise<LinkAnchorItem[] | null>;

let activeLister: LinkAnchorLister | null = null;

/**
 * The shell installs the lister (it merges every enabled extension's
 * providers), keeping the editor core free of extension imports — the same
 * shape as `registerCreateTargetResolver`.
 */
export function setLinkAnchorLister(lister: LinkAnchorLister | null): void {
  activeLister = lister;
}

export async function listLinkAnchors(
  target: LinkAnchorTarget,
  query: string
): Promise<LinkAnchorItem[]> {
  if (!activeLister) return [];
  return (await activeLister(target, query)) ?? [];
}

/**
 * Anchors reachable straight from what's typed after `[[`, without first
 * picking a target — a scripture reference ("Alma 32:21") names both the
 * collection and the verse. Returns null/[] when the query isn't one.
 */
export type LinkAnchorSuggester = (
  query: string
) => Promise<Array<{ target: LinkAnchorTarget; anchor: LinkAnchorItem }> | null>;

let activeSuggester: LinkAnchorSuggester | null = null;

export function setLinkAnchorSuggester(suggester: LinkAnchorSuggester | null): void {
  activeSuggester = suggester;
}

export async function suggestLinkAnchors(
  query: string
): Promise<Array<{ target: LinkAnchorTarget; anchor: LinkAnchorItem }>> {
  if (!activeSuggester) return [];
  try {
    return (await activeSuggester(query)) ?? [];
  } catch {
    return [];
  }
}

/** Clip a label for storage on the link (it's a label, not the source of truth). */
export function clipAnchorLabel(text: string, max = 80): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
