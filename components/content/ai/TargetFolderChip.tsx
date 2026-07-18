"use client";

/**
 * Target-folder chip (AI v3 core S3, umbrella decisions #7/#10).
 *
 * Renders the conversation's target folder in the chat surface header —
 * ONE component for every surface (in-app panel, full-page viewer, and the
 * browser side panel via the embed), which is what makes look-and-feel
 * provably identical across contexts. Clicking opens a compact folder
 * picker fed by the content tree endpoint; selecting PATCHes the
 * conversation (owner-validated server-side).
 *
 * Inputs (page-node filing), outputs (document tools), and grounding all
 * follow the target — the chip is the user's one lever for "where does
 * this conversation operate".
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderOpen, X, Search, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/core/utils";

interface TreeNodeLite {
  id: string;
  title: string;
  contentType: string;
  children?: TreeNodeLite[];
}

interface FlatFolder {
  id: string;
  title: string;
  depth: number;
}

function flattenFolders(
  nodes: TreeNodeLite[],
  depth = 0,
  out: FlatFolder[] = [],
): FlatFolder[] {
  for (const node of nodes) {
    if (node.contentType === "folder") {
      out.push({ id: node.id, title: node.title, depth });
      if (Array.isArray(node.children)) {
        flattenFolders(node.children, depth + 1, out);
      }
    }
  }
  return out;
}

export function TargetFolderChip({
  target,
  disabled = false,
  inherited = false,
  location = null,
  onChange,
}: {
  /** Current target — null renders the untargeted state. */
  target: { id: string; title: string | null } | null;
  /** Disabled until the chat is bound to a Conversation entity. */
  disabled?: boolean;
  /**
   * True when the target is inferred from the chat's location (its parent
   * folder) rather than explicitly picked — chats serve their location;
   * picking here becomes an override.
   */
  inherited?: boolean;
  /**
   * The chat's own folder (location), for mismatch signaling (S4a): when
   * an explicit target differs from where the chat lives, an amber warning
   * renders so a forgotten override is visible instead of silently
   * misdirecting output. Null for placeless chats — no warning possible.
   */
  location?: { id: string; title: string | null } | null;
  onChange: (target: { id: string; title: string | null } | null) => void;
}) {
  const mismatch =
    !inherited && target !== null && location !== null && target.id !== location.id;

  const [open, setOpen] = useState(false);
  const [folders, setFolders] = useState<FlatFolder[] | null>(null);
  const [filter, setFilter] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Lazy tree fetch — only when the picker opens, cached for the mount.
  useEffect(() => {
    if (!open || folders !== null) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/content/content/tree", {
          credentials: "include",
        });
        const body = (await res.json()) as {
          data?: { tree?: TreeNodeLite[] } | TreeNodeLite[];
        };
        const raw = body?.data;
        const tree = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.tree)
            ? raw.tree
            : [];
        if (!cancelled) setFolders(flattenFolders(tree));
      } catch {
        if (!cancelled) setFolders([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, folders]);

  // Click-away close.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const visible = useMemo(() => {
    if (!folders) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return folders;
    return folders.filter((f) => f.title.toLowerCase().includes(q));
  }, [folders, filter]);

  const select = useCallback(
    (folder: FlatFolder | null) => {
      setOpen(false);
      setFilter("");
      onChange(folder ? { id: folder.id, title: folder.title } : null);
    },
    [onChange],
  );

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title={
          disabled
            ? "Save the chat to set a target folder"
            : mismatch
              ? `Target differs from this chat's folder (${location?.title ?? "its location"}) — outputs go to the target, not the chat's folder`
              : inherited
                ? "Inherited from this chat's folder — click to override"
                : "Target folder — new pages and documents from this chat land here"
        }
        className={cn(
          "flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] max-w-[160px] transition-colors",
          target
            ? "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-700 dark:text-emerald-300"
            : "border-black/10 dark:border-white/15 text-gray-500 dark:text-gray-400",
          inherited && "border-dashed",
          mismatch &&
            "border-amber-500/40 bg-amber-500/[0.07] text-amber-700 dark:text-amber-300",
          disabled
            ? "opacity-50 cursor-default"
            : "hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer",
        )}
      >
        {mismatch ? (
          <AlertTriangle className="h-3 w-3 shrink-0" />
        ) : (
          <FolderOpen className="h-3 w-3 shrink-0" />
        )}
        <span className="truncate">
          {target ? (target.title ?? "Untitled folder") : "No target"}
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-lg text-xs overflow-hidden">
          <div className="flex items-center gap-1.5 border-b border-black/5 dark:border-white/10 px-2 py-1.5">
            <Search className="h-3 w-3 shrink-0 text-gray-400" />
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter folders…"
              className="w-full bg-transparent outline-none placeholder:text-gray-400"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {folders === null && (
              <div className="px-3 py-2 text-gray-400">Loading folders…</div>
            )}
            {folders !== null && visible.length === 0 && (
              <div className="px-3 py-2 text-gray-400">No folders found.</div>
            )}
            {visible.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => select(f)}
                className={cn(
                  "flex w-full items-center gap-1.5 px-3 py-1 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
                  target?.id === f.id &&
                    "text-emerald-700 dark:text-emerald-300",
                )}
                style={{ paddingLeft: `${12 + f.depth * 12}px` }}
              >
                <FolderOpen className="h-3 w-3 shrink-0 opacity-60" />
                <span className="truncate">{f.title}</span>
              </button>
            ))}
          </div>
          {mismatch && location && (
            <button
              type="button"
              onClick={() =>
                select({ id: location.id, title: location.title ?? "", depth: 0 })
              }
              className="flex w-full items-center gap-1.5 border-t border-amber-500/20 bg-amber-500/[0.05] px-3 py-1.5 text-amber-700 dark:text-amber-300 hover:bg-amber-500/[0.12]"
            >
              <FolderOpen className="h-3 w-3" />
              Use this chat&apos;s folder ({location.title ?? "parent"})
            </button>
          )}
          {target && (
            <button
              type="button"
              onClick={() => select(null)}
              className="flex w-full items-center gap-1.5 border-t border-black/5 dark:border-white/10 px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
            >
              <X className="h-3 w-3" />
              {inherited ? "Clear" : "Clear target"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
