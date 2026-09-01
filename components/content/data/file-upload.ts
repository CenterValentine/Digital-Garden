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

export interface TableUploadResult {
  /** Created file-node ids, in upload order. */
  ids: string[];
  /** One human-readable line per failed file — NEVER swallowed: silent
   * failures made a broken upload look like a missing feature (owner
   * report, 2026-08-31). */
  errors: string[];
}

export async function uploadFilesToTable(
  tableId: string,
  files: FileList | File[] | null | undefined
): Promise<TableUploadResult> {
  const ids: string[] = [];
  const errors: string[] = [];
  if (!files || files.length === 0) return { ids, errors };
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
        error?: { message?: string };
      } | null;
      const id = json?.data?.contentId;
      if (res.ok && id) {
        if (!ids.includes(id)) ids.push(id);
      } else {
        errors.push(
          `${file.name}: ${json?.error?.message ?? `upload failed (${res.status})`}`
        );
      }
    } catch {
      errors.push(`${file.name}: network error`);
    }
  }
  if (ids.length > 0) {
    window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
  }
  return { ids, errors };
}

/** True when a drag carries OS files (excludes the app's own row/column
 * drags, which carry text data). */
export function dragHasFiles(e: { dataTransfer: DataTransfer | null }): boolean {
  return Boolean(e.dataTransfer?.types.includes("Files"));
}
