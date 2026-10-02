/**
 * Create Destination Store
 *
 * Remembers WHERE the user last created content — the parent folders that
 * received a new note, folder, database, etc. — so a create surface (the pane
 * tab-strip "+" picker) can offer "the last place you created something" at
 * the very top, ahead of browsing. This is not the picker's existing
 * `recents` (previously picked targets); it is the destination of a create.
 *
 * Mirrors `folder-move-store.ts` (recent Move destinations): same shape, same
 * persist convention, kept separate because "where I move things" and "where
 * I create things" are different habits.
 *
 * Ids are SERVER space: in a view-scoped tree a top-level create lands in the
 * view root, and that root's real id is what gets recorded — never tree-space
 * `null`. `null` here means the vault root itself.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CreateDestination {
  /** Parent folder id; null = the vault root. */
  id: string | null;
  /** Folder title at the time of the create ("Root" for the vault root). */
  title: string;
  /** Up to two nearest ancestor titles, nearest-last (e.g. ["Projects", "Web"]). */
  parentPath: string[];
  /** Epoch ms of the last create into this folder. */
  at: number;
}

interface CreateDestinationState {
  recentDestinations: CreateDestination[];
  pushDestination: (destination: Omit<CreateDestination, "at">) => void;
  /** Drop a destination that no longer resolves (trashed folder). */
  forgetDestination: (id: string | null) => void;
  clearDestinations: () => void;
}

const MAX_DESTINATIONS = 6;

export const useCreateDestinationStore = create<CreateDestinationState>()(
  persist(
    (set) => ({
      recentDestinations: [],
      pushDestination: (destination) =>
        set((state) => {
          const deduped = state.recentDestinations.filter(
            (d) => d.id !== destination.id,
          );
          return {
            recentDestinations: [
              { ...destination, at: Date.now() },
              ...deduped,
            ].slice(0, MAX_DESTINATIONS),
          };
        }),
      forgetDestination: (id) =>
        set((state) => ({
          recentDestinations: state.recentDestinations.filter((d) => d.id !== id),
        })),
      clearDestinations: () => set({ recentDestinations: [] }),
    }),
    { name: "create-destination-recents", version: 1 },
  ),
);

/**
 * Record a create into `parentId` from a tree the caller already holds.
 * `lookup` resolves an id to its title + parent so the ancestor path can be
 * built without a round-trip; an unresolvable parent (a folder the current
 * tree can't see) is still recorded by id with a generic title so the row
 * stays reachable, and the picker refreshes the title when it can see it.
 */
export function recordCreateDestination(
  parentId: string | null,
  lookup: (id: string) => { title: string; parentId: string | null } | null,
): void {
  if (parentId && (parentId.startsWith("peopleGroup:") || parentId.startsWith("person:") || parentId.startsWith("temp-"))) {
    // Virtual / unconfirmed parents are not folders a user returns to.
    return;
  }
  if (!parentId) {
    useCreateDestinationStore
      .getState()
      .pushDestination({ id: null, title: "Root", parentPath: [] });
    return;
  }
  const node = lookup(parentId);
  const parentPath: string[] = [];
  let cursor = node?.parentId ?? null;
  while (cursor && parentPath.length < 2) {
    const ancestor = lookup(cursor);
    if (!ancestor) break;
    parentPath.unshift(ancestor.title);
    cursor = ancestor.parentId;
  }
  useCreateDestinationStore.getState().pushDestination({
    id: parentId,
    title: node?.title ?? "Folder",
    parentPath,
  });
}
