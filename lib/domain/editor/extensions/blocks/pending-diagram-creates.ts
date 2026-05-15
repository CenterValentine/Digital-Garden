/**
 * Pending diagram creates — shared map between MarkdownEditor's
 * embed-diagram-create listener and the Excalidraw/Mermaid block render
 * functions.
 *
 * When the listener's POST to /api/content/content succeeds, it stores the
 * new contentId here AND attempts setNodeMarkup directly. The direct write
 * works in the normal case. If the editor is destroyed mid-flight (Fast
 * Refresh in dev, route navigation, or any parent remount), setNodeMarkup
 * fails silently — but the new editor's block render checks this map and
 * picks up the contentId via its own fresh getPos.
 *
 * Entries clear themselves the moment they're consumed by a render.
 */

export interface PendingDiagramCreate {
  contentId: string;
  expanded: boolean;
}

const map = new Map<string, PendingDiagramCreate>();

export function setPendingDiagramCreate(blockId: string, value: PendingDiagramCreate): void {
  map.set(blockId, value);
}

export function consumePendingDiagramCreate(blockId: string): PendingDiagramCreate | null {
  const entry = map.get(blockId);
  if (!entry) return null;
  map.delete(blockId);
  return entry;
}
