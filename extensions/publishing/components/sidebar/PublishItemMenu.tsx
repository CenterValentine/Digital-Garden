"use client";

/**
 * 3-dot dropdown menu for a PublishItem row.
 *
 * Five actions, in order of frequency:
 *   - Copy public URL  (pure client-side clipboard write)
 *   - Edit metadata    (title + slug → PATCH; slug change auto-creates a redirect)
 *   - Move to path     (pathId → PATCH; picker fetches tenant's paths on open)
 *   - Archive          (state → archived; reversible by re-publishing)
 *   - Delete           (soft-delete; sets deletedAt; reversal requires admin work)
 *
 * Each destructive action (Archive, Delete) confirms before firing.
 * Each successful action calls onRefresh() so the parent re-fetches.
 */

import { useEffect, useState } from "react";
import {
  MoreHorizontal,
  Link as LinkIcon,
  Pencil,
  FolderInput,
  Archive,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/client/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  archiveItem,
  deleteItem,
  fetchPublicPaths,
  updatePublicItem,
  type PublicPathSummary,
} from "../../lib/client-api";
import type { PublishItemSummary } from "../../state/publish-store";

interface PublishItemMenuProps {
  item: PublishItemSummary;
  onRefresh: () => void;
}

type DialogMode = "edit" | "move" | "archive" | "delete" | null;

export function PublishItemMenu({ item, onRefresh }: PublishItemMenuProps) {
  const [dialog, setDialog] = useState<DialogMode>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-gray-300 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-300"
            title="More options"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => handleCopyUrl(item)}>
            <LinkIcon className="w-3.5 h-3.5 mr-2" /> Copy public URL
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <Pencil className="w-3.5 h-3.5 mr-2" /> Edit title &amp; slug
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("move")}>
            <FolderInput className="w-3.5 h-3.5 mr-2" /> Move to another path
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDialog("archive")}>
            <Archive className="w-3.5 h-3.5 mr-2" /> Archive
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setDialog("delete")}
            className="text-red-600 dark:text-red-400 focus:text-red-700 dark:focus:text-red-300"
          >
            <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete permanently
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog === "edit" && (
        <EditMetadataDialog
          item={item}
          onClose={() => setDialog(null)}
          onSuccess={() => {
            setDialog(null);
            onRefresh();
          }}
        />
      )}
      {dialog === "move" && (
        <MovePathDialog
          item={item}
          onClose={() => setDialog(null)}
          onSuccess={() => {
            setDialog(null);
            onRefresh();
          }}
        />
      )}
      {dialog === "archive" && (
        <ConfirmDialog
          title="Archive this item?"
          body="Archived items disappear from the public site and from your IDE's default working set. You can restore by re-publishing."
          confirmLabel="Archive"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            try {
              await archiveItem(item.id);
              toast.success("Archived.");
              setDialog(null);
              onRefresh();
            } catch {
              toast.error("Archive failed.");
            }
          }}
        />
      )}
      {dialog === "delete" && (
        <ConfirmDialog
          title="Delete permanently?"
          body="This removes the item from your IDE entirely. The underlying content note isn't deleted — only this publication."
          confirmLabel="Delete"
          destructive
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            try {
              await deleteItem(item.id);
              toast.success("Deleted.");
              setDialog(null);
              onRefresh();
            } catch {
              toast.error("Delete failed.");
            }
          }}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function handleCopyUrl(item: PublishItemSummary) {
  // Canonical URL composition. If the item lives under a path, the path
  // slug prefixes the item slug. We don't currently have tenant-custom-
  // host info on the summary, so build the URL relative to whatever host
  // the user is on (most common case: they're on their own site).
  const pathPrefix = item.path ? `/${item.path.slug}` : "";
  const url = `${window.location.origin}${pathPrefix}/${item.slug}`;
  void navigator.clipboard.writeText(url).then(
    () => toast.success("URL copied", { description: url }),
    () => toast.error("Couldn't access clipboard."),
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Edit metadata dialog
// ─────────────────────────────────────────────────────────────────────────

function EditMetadataDialog({
  item,
  onClose,
  onSuccess,
}: {
  item: PublishItemSummary;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState(item.publicTitle ?? "");
  const [slug, setSlug] = useState(item.slug);
  const [submitting, setSubmitting] = useState(false);

  const trimmedTitle = title.trim();
  const trimmedSlug = slug.trim().toLowerCase();
  const hasChanges =
    trimmedTitle !== (item.publicTitle ?? "") || trimmedSlug !== item.slug;
  const valid = trimmedSlug.length > 0 && /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(trimmedSlug);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasChanges || !valid || submitting) return;
    setSubmitting(true);
    try {
      const body: { publicTitle?: string; slug?: string } = {};
      if (trimmedTitle !== (item.publicTitle ?? "")) body.publicTitle = trimmedTitle;
      if (trimmedSlug !== item.slug) body.slug = trimmedSlug;
      await updatePublicItem(item.id, body);
      toast.success(
        body.slug
          ? `Saved. Old URL redirects to /${trimmedSlug}.`
          : "Saved.",
      );
      onSuccess();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't save changes.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit publication</DialogTitle>
          <DialogDescription>
            Change the public title or URL slug. Slug changes leave a
            redirect from the old URL automatically.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">
              Public title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Defaults to the content note's title"
              className="w-full rounded-md border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">URL slug</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
              pattern="^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$"
              className="w-full rounded-md border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm font-mono"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Lowercase letters, numbers, hyphens. No leading/trailing hyphen.
            </p>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!hasChanges || !valid || submitting}
              className="px-3 py-1.5 rounded-md text-sm font-medium bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Saving…" : "Save"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Move-to-path dialog
// ─────────────────────────────────────────────────────────────────────────

function MovePathDialog({
  item,
  onClose,
  onSuccess,
}: {
  item: PublishItemSummary;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [paths, setPaths] = useState<PublicPathSummary[] | null>(null);
  const [selectedPathId, setSelectedPathId] = useState<string>(item.pathId);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchPublicPaths()
      .then((all) => {
        // Filter to paths owned by the same tenant as this item — backend
        // would reject moves to other tenants anyway, but pre-filtering
        // keeps the picker clean.
        // Note: fetchPublicPaths returns all paths the user owns across
        // tenants. The PublicPathSummary type doesn't carry tenantId yet,
        // so we trust the backend's PATCH validation as the gate and show
        // everything here. Future improvement: include tenantId in the
        // summary and filter client-side too.
        setPaths(all);
      })
      .catch(() => {
        toast.error("Couldn't load path list.");
        onClose();
      });
  }, [onClose]);

  const hasChange = selectedPathId !== item.pathId;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasChange || submitting) return;
    setSubmitting(true);
    try {
      await updatePublicItem(item.id, { pathId: selectedPathId });
      toast.success("Moved.");
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't move item.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move to another path</DialogTitle>
          <DialogDescription>
            Pick a different path within your site. The item&apos;s URL
            changes to reflect the new path; a redirect from the old URL is
            created automatically.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">Path</label>
            {paths === null ? (
              <div className="text-sm text-gray-500">Loading paths…</div>
            ) : paths.length === 0 ? (
              <div className="text-sm text-gray-500">No paths available.</div>
            ) : (
              <select
                value={selectedPathId}
                onChange={(e) => setSelectedPathId(e.target.value)}
                className="w-full rounded-md border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm"
              >
                {paths.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.slug})
                  </option>
                ))}
              </select>
            )}
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!hasChange || submitting}
              className="px-3 py-1.5 rounded-md text-sm font-medium bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Moving…" : "Move"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Confirm dialog (used by Archive + Delete)
// ─────────────────────────────────────────────────────────────────────────

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  destructive,
  onClose,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className={
              destructive
                ? "px-3 py-1.5 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-500 disabled:opacity-40"
                : "px-3 py-1.5 rounded-md text-sm font-medium bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-40"
            }
          >
            {submitting ? "Working…" : confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
