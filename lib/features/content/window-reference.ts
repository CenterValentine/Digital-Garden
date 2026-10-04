/**
 * Window reference rows.
 *
 * A note that contains Note Window blocks surfaces each windowed target in
 * its Reference Drawer as a derived, view-only row. The tree API synthesizes
 * these rows from `window-ref` ContentLink edges (maintained on save by
 * `syncWindowReferences`) and appends them to the host note's `references`
 * array, so the drawer's existing machinery — count chip, expansion replay,
 * placement flip, nesting wash — carries them with no new client transform.
 *
 * Nothing is ever STORED for these rows: they are recomputed from the edge
 * graph on every tree fetch, so a retargeted or deleted window can't leave a
 * stale row behind (the reason this is not implemented as auto-created
 * Shortcut nodes).
 *
 * Window rows adopt the shortcut-mirror row contract — a synthetic namespaced
 * id, `mirrorOf` pointing at the real node, and `isShortcutMirror` for the
 * view-only interaction rules ("a projection, not a place"): selection opens
 * the target, drag is refused, and the context menu offers read-only actions.
 *
 * Pure and dependency-free by design so it can be exercised by
 * `pnpm reference-block:check` without standing up the route or a browser.
 */

/** Namespaced so a window row id can never collide with a ContentNode uuid,
 *  a `refs:<id>` drawer key, or an `smirror:` mirror path. */
export const WINDOW_REFERENCE_PREFIX = "wref:";

/**
 * Path-scoped id: the same target windowed by two notes yields two distinct
 * rows, and neither collides with the target's real row at its storage
 * location. react-arborist keys selection, expansion, scroll-to and drop
 * positions off row id, and every one of those breaks when an id repeats.
 */
export function windowReferenceRowId(hostId: string, targetId: string): string {
  return `${WINDOW_REFERENCE_PREFIX}${hostId}/${targetId}`;
}

export function isWindowReferenceRowId(id: string): boolean {
  return id.startsWith(WINDOW_REFERENCE_PREFIX);
}

/** Minimal structural shape shared by the tree route's ContentTreeNode and
 *  the client's TreeNode — the fields this transform must rewrite. */
type WindowReferenceSource = {
  id: string;
  parentId: string | null;
  role?: string;
  children: unknown[];
  references?: unknown[];
  mirrorOf?: string;
  isShortcutMirror?: boolean;
  windowRef?: { targetId: string };
};

/**
 * Clone one real row as a window reference row under `hostId`.
 *
 * `children` and `references` are RESET, never shared: spreading the real
 * node would alias its live arrays (mutations would bleed between the real
 * row and every window row of it) and drag the target's whole subtree into
 * the drawer. A window row is always a leaf.
 */
export function toWindowReferenceRow<T extends WindowReferenceSource>(
  target: T,
  hostId: string,
): T {
  const row: T = { ...target };
  row.id = windowReferenceRowId(hostId, target.id);
  row.parentId = hostId;
  row.role = "referenced";
  row.mirrorOf = target.id;
  row.isShortcutMirror = true;
  row.windowRef = { targetId: target.id };
  row.children = [];
  row.references = [];
  return row;
}
