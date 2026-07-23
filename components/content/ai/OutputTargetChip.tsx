"use client";

/**
 * Output-target chip (Chat Outputs & References plan, WS7).
 *
 * Sits next to the TargetFolderChip. Where the folder chip is the chat's
 * OPERATING context, this one is where NEW content the assistant creates
 * lands by DEFAULT when the user doesn't tell it otherwise:
 *   - This chat        → nested under this chat (referenced) — the default
 *   - Next to this chat → under the origin content, a sibling of the chat
 *   - A folder…         → a chosen folder, as a plain (movable) node
 *
 * The assistant can always override on an explicit request; this is only the
 * fallback. Selection persists per-conversation (handled by the engine) and
 * rides each turn in the send body.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, MessageSquare, CornerDownRight, FolderOpen, Check } from "lucide-react";
import { cn } from "@/lib/core/utils";
import type { OutputTarget } from "@/lib/domain/ai/use-conversation-engine";

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
      if (node.children?.length) flattenFolders(node.children, depth + 1, out);
    }
  }
  return out;
}

function labelFor(target: OutputTarget): string {
  switch (target.mode) {
    case "chat":
      return "This chat";
    case "nextToChat":
      return "Next to chat";
    case "folder":
      return target.folderTitle || "Folder";
  }
}

export function OutputTargetChip({
  value,
  onChange,
  disabled = false,
  /** Hide the "next to this chat" option for full-page chats (no distinct origin). */
  hasOrigin = true,
  compact = false,
}: {
  value: OutputTarget;
  onChange: (target: OutputTarget) => void;
  disabled?: boolean;
  hasOrigin?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [folders, setFolders] = useState<FlatFolder[] | null>(null);
  const [filter, setFilter] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

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

  const visibleFolders = useMemo(() => {
    if (!folders) return [];
    const q = filter.trim().toLowerCase();
    return q ? folders.filter((f) => f.title.toLowerCase().includes(q)) : folders;
  }, [folders, filter]);

  const pick = useCallback(
    (target: OutputTarget) => {
      setOpen(false);
      setFilter("");
      onChange(target);
    },
    [onChange],
  );

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title="Where new content lands by default when you don't tell the assistant otherwise (it can always place things where you ask)"
        className={cn(
          "flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] max-w-[160px] transition-colors",
          "border-black/10 dark:border-white/15 text-gray-500 dark:text-gray-400",
          disabled
            ? "opacity-50 cursor-default"
            : "hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer",
        )}
      >
        <Crosshair className="h-3 w-3 shrink-0" />
        {!compact && <span className="truncate">{labelFor(value)}</span>}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 z-50 w-56 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-[#1a1a1a] shadow-xl overflow-hidden">
          <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-gray-500 font-medium border-b border-black/5 dark:border-white/5">
            Where new content goes
          </div>
          <Option
            active={value.mode === "chat"}
            icon={<MessageSquare className="h-3.5 w-3.5 text-indigo-400" />}
            label="This chat"
            hint="Nested under this chat"
            onClick={() => pick({ mode: "chat" })}
          />
          {hasOrigin && (
            <Option
              active={value.mode === "nextToChat"}
              icon={<CornerDownRight className="h-3.5 w-3.5 text-indigo-400" />}
              label="Next to this chat"
              hint="Under the content this chat is on"
              onClick={() => pick({ mode: "nextToChat" })}
            />
          )}
          <div className="border-t border-black/5 dark:border-white/5">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="A folder…"
              className="w-full bg-transparent px-3 py-1.5 text-xs outline-none placeholder:text-gray-500"
            />
            <div className="max-h-40 overflow-y-auto">
              {folders === null ? (
                <div className="px-3 py-2 text-[11px] text-gray-500">Loading…</div>
              ) : visibleFolders.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-gray-500">No folders</div>
              ) : (
                visibleFolders.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() =>
                      pick({ mode: "folder", folderId: f.id, folderTitle: f.title })
                    }
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors",
                      value.mode === "folder" && value.folderId === f.id
                        ? "bg-black/[0.06] text-gray-900 dark:bg-white/10 dark:text-white"
                        : "text-gray-600 dark:text-gray-400 hover:bg-black/[0.04] dark:hover:bg-white/5",
                    )}
                    style={{ paddingLeft: `${12 + f.depth * 10}px` }}
                  >
                    <FolderOpen className="h-3.5 w-3.5 shrink-0 text-yellow-500/80" />
                    <span className="truncate">{f.title}</span>
                    {value.mode === "folder" && value.folderId === f.id && (
                      <Check className="ml-auto h-3 w-3 shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Option({
  active,
  icon,
  label,
  hint,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
        active
          ? "bg-black/[0.06] text-gray-900 dark:bg-white/10 dark:text-white"
          : "text-gray-600 dark:text-gray-400 hover:bg-black/[0.04] dark:hover:bg-white/5",
      )}
    >
      {icon}
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{label}</span>
        <span className="truncate text-[10px] text-gray-500">{hint}</span>
      </span>
      {active && <Check className="ml-auto h-3 w-3 shrink-0" />}
    </button>
  );
}
