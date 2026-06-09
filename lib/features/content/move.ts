/**
 * Client-side content move helpers.
 *
 * Reuses the existing endpoints (no new APIs):
 *   - folder search → `GET /api/content/search?type=folder`
 *   - move          → `POST /api/content/content/move` (single-item; we loop)
 *
 * Client-safe: plain `fetch`, no Prisma imports.
 */

export interface FolderSearchResult {
  id: string;
  title: string;
  /** Up to two nearest ancestor titles, nearest-last. */
  parentPath: string[];
}

interface SearchItem {
  id: string;
  title: string;
  contentType: string;
  /** Full ancestor breadcrumb joined by " / " (ancestors only, excludes self). */
  path?: string;
}

/**
 * Search folders by title. Empty query returns the most-recently-updated
 * folders (the search route's default ordering) — handy for seeding the
 * picker. `excludeIds` filters out invalid targets (self / current parent);
 * true cycle prevention is enforced server-side by the move route.
 */
export async function searchFolders(
  query: string,
  excludeIds: string[] = [],
): Promise<FolderSearchResult[]> {
  const params = new URLSearchParams({ type: "folder", limit: "20" });
  if (query.trim()) params.set("search", query.trim());

  const res = await fetch(`/api/content/search?${params.toString()}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Folder search failed");
  const body = await res.json();
  const items: SearchItem[] = body?.data?.items ?? [];

  const exclude = new Set(excludeIds);
  return items
    .filter((it) => it.contentType === "folder" && !exclude.has(it.id))
    .map((it) => ({
      id: it.id,
      title: it.title,
      parentPath: (it.path ? it.path.split(" / ") : []).slice(-2),
    }));
}

export interface MoveResult {
  moved: string[];
  failed: { id: string; message: string }[];
}

/**
 * Move one or more nodes into a target folder. The move endpoint handles a
 * single item per call, so we issue one request per id and aggregate the
 * outcome. `targetParentId` is the destination folder; display order
 * defaults to the top of the folder (server uses 0 when omitted).
 */
export async function moveNodesToFolder(
  ids: string[],
  targetParentId: string,
): Promise<MoveResult> {
  const moved: string[] = [];
  const failed: { id: string; message: string }[] = [];

  for (const id of ids) {
    try {
      const res = await fetch("/api/content/content/move", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId: id, targetParentId }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        failed.push({
          id,
          message: body?.error?.message ?? `Move failed (${res.status})`,
        });
      } else {
        moved.push(id);
      }
    } catch (err) {
      failed.push({
        id,
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  return { moved, failed };
}
