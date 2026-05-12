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
      className="fixed z-[200] w-52 rounded-lg border border-white/10 bg-zinc-900 shadow-2xl py-1 text-sm"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
    >
      {/* Path label */}
      <div className="px-3 py-1.5 text-[11px] text-white/30 truncate border-b border-white/5 mb-1">
        {node.title}
      </div>

      <MenuItem icon={<FolderPlus className="w-3.5 h-3.5" />} onClick={() => setDialog("create-child")}>
        New child path
      </MenuItem>

      <MenuItem icon={<Pencil className="w-3.5 h-3.5" />} onClick={() => setDialog("edit")}>
        Rename / edit
      </MenuItem>

      <MenuItem icon={<Copy className="w-3.5 h-3.5" />} onClick={copyUrl}>
        Copy path URL
      </MenuItem>

      <MenuItem
        icon={<ExternalLink className="w-3.5 h-3.5" />}
        onClick={() => {
          window.open(`/${node.slug}`, "_blank");
          onClose();
        }}
      >
        Open in browser
      </MenuItem>

      <div className="my-1 border-t border-white/5" />

      {dialog === "confirm-delete" ? (
        <div className="px-3 py-2 space-y-2">
          <p className="text-[11px] text-white/60 leading-snug">
            Delete <span className="text-white/90 font-medium">{node.title}</span>? This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setDialog(null)}
              className="flex-1 py-1 rounded text-[11px] text-white/50 hover:text-white/80 border border-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex-1 py-1 rounded text-[11px] font-medium bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 border border-rose-500/20 transition-colors disabled:opacity-50"
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      ) : (
        <MenuItem
          icon={<Trash2 className="w-3.5 h-3.5" />}
          onClick={() => setDialog("confirm-delete")}
          destructive
        >
          Delete path
        </MenuItem>
      )}
    </div>
  );

  return createPortal(menu, document.body);
}

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
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs transition-colors ${
        destructive
          ? "text-rose-400 hover:bg-rose-500/10"
          : "text-white/70 hover:bg-white/5 hover:text-white"
      }`}
    >
      <span className="shrink-0 opacity-70">{icon}</span>
      {children}
    </button>
  );
}
