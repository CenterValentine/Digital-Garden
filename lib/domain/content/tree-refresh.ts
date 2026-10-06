/**
 * When the file tree may refresh without its skeleton.
 *
 * `LeftSidebarContent` renders `<FileTreeSkeleton />` in place of the tree
 * while `isLoading` is set, and that unmounts react-arborist: the tree comes
 * back at the top, scroll and focus lost. Every create, duplicate, link,
 * folder-view change, upload and `dg:tree-refresh` used to go through that
 * path, so each one flashed the tree.
 *
 * The rule: the skeleton belongs to the FIRST load of a scope — a workspace
 * and the folder it is rooted at. Once a scope's tree is on screen, refreshing
 * it keeps that tree up and swaps the data in place. Switching workspace or
 * view root is a new scope, and still shows the skeleton: the tree on screen
 * belongs to somewhere else, and showing it while the new one loads would be
 * the wrong files under the right header.
 */

/** Identity of what the tree is showing: workspace + view root. */
export function treeScopeKey(
  workspaceId: string | null | undefined,
  viewRootContentId: string | null | undefined,
): string {
  return `${workspaceId ?? "-"}|${viewRootContentId ?? "-"}`;
}

/**
 * Whether a refresh may keep the current tree on screen: true once a tree for
 * this exact scope has loaded. `loadedScope` is null before the first load.
 */
export function refreshIsQuiet(loadedScope: string | null, scope: string): boolean {
  return loadedScope === scope;
}

/**
 * Whether a finished request may apply its tree. A response for a scope the
 * user has since left must not land — it would put the previous workspace's
 * files on screen and mark that scope as the loaded one.
 */
export function responseStillApplies(requestScope: string, currentScope: string): boolean {
  return requestScope === currentScope;
}
