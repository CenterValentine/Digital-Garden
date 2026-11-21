"use client";

/**
 * What an MCP token may do and where it may reach — ONE form, two mounts:
 * Settings → MCP (minting a personal access token) and the OAuth consent
 * screen at /oauth/authorize (approving a hosted app). The plan's rule
 * (MCP-DATABASE-REACH-PLAN §8.1): "the consent page IS the token-creation UI".
 */

import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/client/ui/input";
import { MCP_CAPABILITIES, type McpCapability } from "@/lib/domain/mcp/capabilities";

export const MCP_CAP_LABELS: Record<McpCapability, { label: string; hint: string }> = {
  "garden:read": { label: "Read", hint: "Search, the tree, notes, files, database schemas and rows. Always on." },
  "garden:read-chats": { label: "Read chats", hint: "Find and read past assistant chats about reachable content." },
  "garden:write-rows": { label: "Write rows", hint: "Insert and update database rows (compare-and-set on updates)." },
  "garden:delete-rows": { label: "Delete rows", hint: "Soft-delete rows, under each database's own AI deletion policy." },
  "garden:write-files": { label: "Write files", hint: "Create and append to notes, write code files, upload files, create folders, insert blocks, update AI context." },
  "garden:report-issues": { label: "File issues", hint: "Report bugs and feature requests to the public repository." },
};

interface TreeNode {
  id: string;
  title: string;
  contentType: string;
  children?: TreeNode[];
}

export interface McpRootOption {
  id: string;
  title: string;
  type: string;
  depth: number;
}

function flatten(nodes: TreeNode[], depth = 0, out: McpRootOption[] = []): McpRootOption[] {
  for (const n of nodes) {
    if (n.contentType === "folder" || n.contentType === "data") {
      out.push({ id: n.id, title: n.title, type: n.contentType, depth });
      if (n.children && depth < 3) flatten(n.children, depth + 1, out);
    }
  }
  return out;
}

/** Folders and databases the owner can pick as roots. Empty on failure (whole garden still works). */
export function useMcpRootOptions(): McpRootOption[] {
  const [options, setOptions] = useState<McpRootOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/content/content/tree", { credentials: "include" });
        const json = await res.json();
        if (!cancelled && res.ok && json.success) setOptions(flatten((json.data?.tree ?? []) as TreeNode[]));
      } catch {
        // the picker is a convenience; no roots = whole garden
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return options;
}

export interface McpGrantState {
  caps: Set<McpCapability>;
  roots: Set<string>;
  allChats: boolean;
  /** Days as typed; blank = never. */
  expiresDays: string;
}

export function useMcpGrantState(initial?: Partial<McpGrantState>) {
  const [state, setState] = useState<McpGrantState>({
    caps: initial?.caps ?? new Set<McpCapability>(["garden:read"]),
    roots: initial?.roots ?? new Set<string>(),
    allChats: initial?.allChats ?? false,
    expiresDays: initial?.expiresDays ?? "",
  });
  const toggleCap = useCallback((cap: McpCapability) => {
    if (cap === "garden:read") return;
    setState((prev) => {
      const caps = new Set(prev.caps);
      if (caps.has(cap)) caps.delete(cap);
      else caps.add(cap);
      return { ...prev, caps };
    });
  }, []);
  const toggleRoot = useCallback((id: string) => {
    setState((prev) => {
      const roots = new Set(prev.roots);
      if (roots.has(id)) roots.delete(id);
      else roots.add(id);
      return { ...prev, roots };
    });
  }, []);
  const setAllChats = useCallback((allChats: boolean) => setState((prev) => ({ ...prev, allChats })), []);
  const setExpiresDays = useCallback((expiresDays: string) => setState((prev) => ({ ...prev, expiresDays })), []);
  return { state, toggleCap, toggleRoot, setAllChats, setExpiresDays };
}

export interface McpGrantFieldsProps {
  state: McpGrantState;
  rootOptions: McpRootOption[];
  disabled?: boolean;
  /** Capabilities the requesting app asked for — marked, never pre-ticked. */
  requested?: ReadonlySet<McpCapability>;
  onToggleCap: (cap: McpCapability) => void;
  onToggleRoot: (id: string) => void;
  onAllChats: (value: boolean) => void;
  onExpiresDays: (value: string) => void;
}

export function McpGrantFields({
  state,
  rootOptions,
  disabled,
  requested,
  onToggleCap,
  onToggleRoot,
  onAllChats,
  onExpiresDays,
}: McpGrantFieldsProps) {
  const titleOf = (id: string) => rootOptions.find((p) => p.id === id)?.title ?? id.slice(0, 8);
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <span className="text-sm font-medium">Capabilities</span>
        <div className="grid gap-2 sm:grid-cols-2">
          {MCP_CAPABILITIES.map((cap) => (
            <label key={cap} className="flex items-start gap-2 rounded-md border border-black/10 px-3 py-2 text-sm dark:border-white/10">
              <input type="checkbox" className="mt-0.5" checked={state.caps.has(cap)} disabled={cap === "garden:read" || disabled} onChange={() => onToggleCap(cap)} />
              <span>
                <span className="font-medium">{MCP_CAP_LABELS[cap].label}</span>
                {requested?.has(cap) && cap !== "garden:read" && (
                  <span className="ml-1.5 rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] text-blue-600 dark:text-blue-400">requested</span>
                )}
                <span className="block text-xs text-muted-foreground">{MCP_CAP_LABELS[cap].hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="text-sm font-medium">Reach</span>
        <p className="text-xs text-muted-foreground">
          {state.roots.size === 0
            ? "Whole garden. Tick folders or databases to narrow it."
            : `${state.roots.size} root${state.roots.size === 1 ? "" : "s"}: ${[...state.roots].map(titleOf).join(", ")}`}
        </p>
        <div className="max-h-56 overflow-y-auto rounded-md border border-black/10 p-2 dark:border-white/10">
          {rootOptions.length === 0 ? (
            <p className="px-1 text-xs text-muted-foreground">No folders or databases to list.</p>
          ) : (
            rootOptions.map((p) => (
              <label key={p.id} className="flex items-center gap-2 px-1 py-0.5 text-xs" style={{ paddingLeft: `${4 + p.depth * 14}px` }}>
                <input type="checkbox" checked={state.roots.has(p.id)} disabled={disabled} onChange={() => onToggleRoot(p.id)} />
                <span>{p.type === "folder" ? "📁" : "▦"} {p.title}</span>
              </label>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={state.allChats} disabled={disabled} onChange={(e) => onAllChats(e.target.checked)} />
          <span>Reach every chat, not only chats about reachable content</span>
        </label>
        <div className="space-y-1.5">
          <label htmlFor="mcp-expires" className="text-sm font-medium">Expires in (days, blank = never)</label>
          <Input id="mcp-expires" value={state.expiresDays} onChange={(e) => onExpiresDays(e.target.value)} placeholder="90" className="w-28" inputMode="numeric" disabled={disabled} />
        </div>
      </div>
    </div>
  );
}
