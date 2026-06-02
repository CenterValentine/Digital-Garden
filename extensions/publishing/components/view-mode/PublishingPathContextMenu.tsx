"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FolderPlus, Pencil, Copy, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { deletePublicPath } from "../../lib/client-api";
import type { PublicPathNode } from "../../state/publish-tree-store";
import { EditPublicPathDialog } from "../dialogs/EditPublicPathDialog";
import { CreatePublicPathDialog } from "../dialogs/CreatePublicPathDialog";

interface MenuPosition { x: number; y: number }

interface PublishingPathContextMenuProps {
  node: PublicPathNode;
  position: MenuPosition;
  onClose: () => void;
  onRefresh: () => void;
}

type Dialog = "edit" | "create-child" | "confirm-delete" | null;

export function PublishingPathContextMenu({
  node,
  position,
  onClose,
  onRefresh,
}: PublishingPathContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Adjust position to keep menu in viewport
  const [adjustedPos, setAdjustedPos] = useState(position);
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let { x, y } = position;
    if (x + rect.width > vw - 8) x = vw - rect.width - 8;
    if (y + rect.height > vh - 8) y = vh - rect.height - 8;
    setAdjustedPos({ x, y });
  }, [position]);

  // Close on outside click or Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  function copyUrl() {
    const url = `/${node.slug}`;
    void navigator.clipboard.writeText(url).then(() => toast.success("Path URL copied"));
    onClose();
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await deletePublicPath(node.id);
      toast.success(`"${node.title}" deleted.`);
      onClose();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete path");
    } finally {
      setIsDeleting(false);
    }
  }

  // Dialogs render above the context menu overlay
  if (dialog === "edit") {
    return (
      <EditPublicPathDialog
        node={node}
        onClose={() => { setDialog(null); onClose(); }}
        onSaved={() => { setDialog(null); onClose(); onRefresh(); }}
      />
    );
  }

  if (dialog === "create-child") {
    return (
      <CreatePublicPathDialog
        defaultParentId={node.id}
        onClose={() => { setDialog(null); onClose(); }}
        onCreated={() => { setDialog(null); onClose(); onRefresh(); }}
      />
    );
  }

  const menu = (
    <div
      ref={menuRef}
      data-context-menu
      className="fixed z-[200] min-w-[200px] rounded-md border border-white/20 bg-white/95 shadow-lg backdrop-blur-sm dark:bg-gray-900/95 overflow-hidden"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
    >
      {/* Path label (subtle title on top, matches file-tree section-label vibe) */}
      <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 truncate border-b border-gray-200/60 dark:border-gray-700/60">
        {node.title}
      </div>

      <div className="px-1.5 py-1">
        <MenuItem icon={<FolderPlus className="h-4 w-4" />} onClick={() => setDialog("create-child")}>
          New child path
        </MenuItem>

        <MenuItem icon={<Pencil className="h-4 w-4" />} onClick={() => setDialog("edit")}>
          Rename / edit
        </MenuItem>

        <MenuItem icon={<Copy className="h-4 w-4" />} onClick={copyUrl}>
          Copy path URL
        </MenuItem>

        <MenuItem
          icon={<ExternalLink className="h-4 w-4" />}
          onClick={() => {
            window.open(`/${node.slug}`, "_blank");
            onClose();
          }}
        >
          Open in browser
        </MenuItem>

        <div className="my-1 mx-1 border-t border-gray-200 dark:border-gray-700" />

        {dialog === "confirm-delete" ? (
          <div className="px-2 py-2 space-y-2">
            <p className="text-xs text-gray-600 dark:text-gray-300 leading-snug">
              Delete <span className="text-gray-900 dark:text-gray-100 font-medium">{node.title}</span>? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDialog(null)}
                className="flex-1 py-1 rounded text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-200 dark:border-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 py-1 rounded text-xs font-medium bg-red-500/15 text-red-600 dark:text-red-400 hover:bg-red-500/25 border border-red-500/30 transition-colors disabled:opacity-50"
              >
                {isDeleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        ) : (
          <MenuItem
            icon={<Trash2 className="h-4 w-4" />}
            onClick={() => setDialog("confirm-delete")}
            destructive
          >
            Delete path
          </MenuItem>
        )}
      </div>
    </div>
  );

  return createPortal(menu, document.body);
}

/**
 * Item styling mirrors the file-tree ContextMenu in
 * components/content/context-menu/ContextMenu.tsx so the two surfaces
 * feel like the same affordance. Future: extract into a shared
 * MenuItem primitive used by both (see BACKLOG: context-menu unification).
 */
function MenuItem({
  icon,
  children,
  onClick,
  destructive = false,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2.5 py-1 text-left text-sm rounded-sm transition-colors ${
        destructive
          ? "text-gray-900 hover:bg-red-500/10 hover:text-red-600 dark:text-gray-100 dark:hover:text-red-400"
          : "text-gray-900 hover:bg-primary/10 hover:text-primary dark:text-gray-100"
      }`}
    >
      <span className="shrink-0 text-current opacity-70">{icon}</span>
      <span className={`truncate ${destructive ? "text-red-600 dark:text-red-400" : ""}`}>
        {children}
      </span>
    </button>
  );
}
