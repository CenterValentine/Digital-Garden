/**
 * Shared file-upload path for File columns — ONE code path for every
 * entry point (peek + button, picker header action, grid cell drop,
 * paste into a selected cell), so placement rules can't drift.
 *
 * Uploads land as real file nodes UNDER the database node (deliberate
 * placement, never root litter) via the same simple-upload route the
 * file tree uses. Returns created content ids; failures are skipped so
 * a multi-file drop degrades to "some uploaded" rather than nothing.
 */

export async function uploadFilesToTable(
  tableId: string,
  files: FileList | File[] | null | undefined
): Promise<string[]> {
  if (!files || files.length === 0) return [];
  const ids: string[] = [];
  for (const file of Array.from(files)) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("parentId", tableId);
    try {
      const res = await fetch("/api/content/content/upload/simple", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const json = (await res.json().catch(() => null)) as {
        data?: { contentId?: string };
      } | null;
      const id = json?.data?.contentId;
      if (res.ok && id && !ids.includes(id)) ids.push(id);
    } catch {
      /* skip this file; the caller reports how many landed */
    }
  }
  if (ids.length > 0) {
    window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
  }
  return ids;
}

/** True when a drag carries OS files (excludes the app's own row/column
 * drags, which carry text data). */
export function dragHasFiles(e: { dataTransfer: DataTransfer | null }): boolean {
  return Boolean(e.dataTransfer?.types.includes("Files"));
}
