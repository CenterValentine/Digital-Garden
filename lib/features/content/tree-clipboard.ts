/**
 * Tree clipboard (owner spec 2026-08-10) — replaces the file-tree context
 * menu's dead Copy/Cut/Paste placeholders with a real feature built on TWO
 * clipboards at once:
 *
 *  - The OS clipboard gets dual flavors on every copy/cut:
 *      text/plain — the item's deep-link URL (paste anywhere as a path);
 *      text/html  — the exact `span[data-type="wiki-link"]` markup the
 *                   TipTap wikiLink extension already parses, so pasting
 *                   into ANY note becomes a real [[wiki-link]] with ZERO
 *                   editor code; ChatInput maps the same flavor to an
 *                   @-mention pill.
 *  - A module-level entry carries the tree-paste intent (ids + copy|cut) —
 *    the OS clipboard cannot carry cut semantics or enable the Paste row.
 *
 * Holding Alt/Option when clicking Copy = STRICTLY the URL: plain text
 * only, no html flavor, no tree-paste entry.
 *
 * Tree paste MOVES the items for both modes (owner spec: paste "updates
 * dependencies … appears in the deposited place"; wiki-links are id-based,
 * so they survive moves with no rewriting). Folder target → child at the
 * BEGINNING (the move API defaults displayOrder to 0); item target →
 * sibling inserted right AFTER the clicked item. The entry is single-shot:
 * any paste clears it.
 */

import { toast } from "sonner";
import { moveNodesToFolder } from "@/lib/features/content/move";

export interface TreeClipboardItem {
  id: string;
  title: string;
  contentType: string;
}

interface TreeClipboardEntry {
  mode: "copy" | "cut";
  items: TreeClipboardItem[];
}

let entry: TreeClipboardEntry | null = null;

// ── Alt/Option tracker ──────────────────────────────────────────────────────
// Menus can't see modifier state at action-click time (the action callbacks
// receive no event), so a tiny window-level tracker holds it. Installed
// lazily on first copy-capable menu build; blur clears it so a missed keyup
// (cmd-tab away) can't wedge the flag.
let altHeld = false;
let altTrackerInstalled = false;
export function ensureAltTracker(): void {
  if (altTrackerInstalled || typeof window === "undefined") return;
  altTrackerInstalled = true;
  window.addEventListener("keydown", (e) => {
    if (e.key === "Alt") altHeld = true;
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === "Alt") altHeld = false;
  });
  window.addEventListener("blur", () => {
    altHeld = false;
  });
}

/** Canonical deep link for a content node — the "path URL" of the spec. */
export function contentDeepLink(id: string): string {
  return `${window.location.origin}/content?content=${encodeURIComponent(id)}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The html flavor: byte-compatible with wikiLink's parseHTML rule. */
export function wikiLinkPasteHtml(item: TreeClipboardItem): string {
  const title = escapeHtml(item.title);
  return `<span data-type="wiki-link" data-target-id="${item.id}" data-target-title="${title}">${title}</span>`;
}

/**
 * Copy or cut tree items. Writes both OS flavors and arms the tree-paste
 * entry — unless Alt is held, which copies strictly the URL(s).
 */
export async function copyTreeItems(
  items: TreeClipboardItem[],
  mode: "copy" | "cut",
): Promise<void> {
  if (items.length === 0) return;
  const urlText = items.map((i) => contentDeepLink(i.id)).join("\n");
  const label = items.length > 1 ? `${items.length} items` : "item";

  if (altHeld) {
    entry = null;
    try {
      await navigator.clipboard.writeText(urlText);
      toast.success(items.length > 1 ? "URLs copied" : "URL copied");
    } catch {
      toast.error("Clipboard write failed");
    }
    return;
  }

  entry = { mode, items };
  const html = items.map(wikiLinkPasteHtml).join(" ");
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": new Blob([urlText], { type: "text/plain" }),
        "text/html": new Blob([html], { type: "text/html" }),
      }),
    ]);
  } catch {
    // Older engines without ClipboardItem: the URL flavor still lands; the
    // tree-paste entry above is unaffected.
    await navigator.clipboard.writeText(urlText).catch(() => {});
  }
  toast.success(
    mode === "cut"
      ? `Cut ${label} — paste in the tree to move it`
      : `Copied ${label} — paste in the tree, a note, or a chat`,
  );
}

export function hasTreeClipboard(): boolean {
  return entry !== null;
}

export interface TreePasteTarget {
  id: string;
  parentId: string | null;
  isFolder: boolean;
  displayOrder?: number;
}

/**
 * Paste onto a tree target. Folder → children's beginning; item → sibling
 * right after it. Self-paste ids are dropped; the entry is cleared after.
 */
export async function pasteTreeClipboard(target: TreePasteTarget): Promise<void> {
  if (!entry) return;
  const ids = entry.items.map((i) => i.id).filter((id) => id !== target.id);
  entry = null;
  if (ids.length === 0) return;

  let movedCount = 0;
  let failedCount = 0;
  if (target.isFolder) {
    const { moved, failed } = await moveNodesToFolder(ids, target.id);
    movedCount = moved.length;
    failedCount = failed.length;
  } else {
    // Sibling insert AFTER the clicked item, preserving the pasted order.
    const baseOrder = (target.displayOrder ?? 0) + 1;
    for (let i = 0; i < ids.length; i++) {
      try {
        const res = await fetch("/api/content/content/move", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentId: ids[i],
            targetParentId: target.parentId,
            newDisplayOrder: baseOrder + i,
          }),
        });
        const body = await res.json().catch(() => null);
        if (res.ok && body?.success) movedCount++;
        else failedCount++;
      } catch {
        failedCount++;
      }
    }
  }

  if (movedCount > 0) {
    window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
    toast.success(`Moved ${movedCount > 1 ? `${movedCount} items` : "item"}`);
  }
  if (failedCount > 0) {
    toast.error(`${failedCount} item${failedCount > 1 ? "s" : ""} could not be moved`);
  }
}
