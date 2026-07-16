/**
 * Folder source picker (Phase 3) — the densest studio component, by design
 * pressure-tested against real tree data. Collapsed: a one-line chip with the
 * live selection summary. Expanded: tri-state rows with size bars, NO TEXT
 * flags, the token-budget meter, and the cap explanation.
 *
 * Tri-state is DERIVED client-side (contract): the persisted selection is
 * leaf ids only; folder rows compute checked/partial from their descendant
 * leaves. Checkboxes are button-based — a native input's `indeterminate`
 * needs render-time ref writes the React Compiler forbids.
 */

"use client";

import { useMemo, useState } from "react";
import { Check, ChevronRight, FolderOpen, MessageCircle, Minus } from "lucide-react";
import { useRightSidebarStateStore } from "@/state/right-sidebar-state-store";
import {
  formatTokens,
  useSourceSelection,
  type SourceRowDto,
} from "./use-source-selection";

interface SourcePickerProps {
  folderId: string;
}

type TriState = "checked" | "partial" | "unchecked";

export function SourcePicker({ folderId }: SourcePickerProps) {
  const { state, loading, error, setIncluded, saving } =
    useSourceSelection(folderId);
  const [open, setOpen] = useState(false);
  const setActiveTab = useRightSidebarStateStore((s) => s.setActiveTab);

  // Descendant leaf ids per folder row — powers folder tri-state + toggles.
  const leafIdsByFolder = useMemo(() => {
    const rows = state?.rows ?? [];
    const childrenByParent = new Map<string, SourceRowDto[]>();
    for (const row of rows) {
      const list = childrenByParent.get(row.parentId) ?? [];
      list.push(row);
      childrenByParent.set(row.parentId, list);
    }
    const map = new Map<string, string[]>();
    const collect = (id: string): string[] => {
      const cached = map.get(id);
      if (cached) return cached;
      const leaves: string[] = [];
      for (const child of childrenByParent.get(id) ?? []) {
        if (child.contentType === "folder") leaves.push(...collect(child.id));
        else if (!child.empty && !child.genLocked) leaves.push(child.id);
      }
      map.set(id, leaves);
      return leaves;
    };
    for (const row of rows) {
      if (row.contentType === "folder") collect(row.id);
    }
    return map;
  }, [state?.rows]);

  const included = useMemo(
    () => new Set(state?.includedNodeIds ?? []),
    [state?.includedNodeIds]
  );

  const maxLeafTokens = useMemo(
    () =>
      Math.max(
        1,
        ...(state?.rows ?? [])
          .filter((r) => r.contentType !== "folder")
          .map((r) => r.tokens)
      ),
    [state?.rows]
  );

  const folderTriState = (row: SourceRowDto): TriState => {
    const leaves = leafIdsByFolder.get(row.id) ?? [];
    if (leaves.length === 0) return "unchecked";
    const selected = leaves.filter((id) => included.has(id)).length;
    if (selected === 0) return "unchecked";
    if (selected === leaves.length) return "checked";
    return "partial";
  };

  const toggleLeaf = (row: SourceRowDto) => {
    const next = new Set(included);
    if (next.has(row.id)) next.delete(row.id);
    else next.add(row.id);
    setIncluded([...next]);
  };

  const toggleFolder = (row: SourceRowDto) => {
    const leaves = leafIdsByFolder.get(row.id) ?? [];
    if (leaves.length === 0) return;
    const next = new Set(included);
    const allIn = leaves.every((id) => next.has(id));
    for (const id of leaves) {
      if (allIn) next.delete(id);
      else next.add(id);
    }
    setIncluded([...next]);
  };

  const openFolderChat = () => setActiveTab(folderId, "chat");

  const selectable = (state?.rows ?? []).filter(
    (r) => r.contentType !== "folder" && !r.empty
  ).length;
  const overBudget =
    state !== null && state.estimatedTokens > state.tokenBudget;

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10">
      {/* Collapsed chip */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left"
      >
        <FolderOpen className="h-4 w-4 shrink-0 text-gold-primary/80" />
        <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-200">
          {loading
            ? "Loading sources…"
            : error
              ? "Sources unavailable"
              : `${included.size} of ${selectable} sources`}
        </span>
        {state && (
          <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
            ~{formatTokens(state.estimatedTokens)} tk
          </span>
        )}
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${
            open ? "rotate-90" : ""
          }`}
        />
      </button>

      {open && (
        <div className="border-t border-black/[0.06] dark:border-white/[0.08]">
          {error && <p className="px-3 py-2 text-xs text-red-500/90">{error}</p>}

          {state && (
            <>
              {/* Budget meter */}
              <div className="px-3 pt-2.5">
                <div className="flex items-center justify-between text-[11px] text-gray-400 dark:text-gray-500">
                  <span>
                    Context budget{" "}
                    {state.capApplied && (
                      <span
                        className="cursor-help text-amber-600 dark:text-amber-400"
                        title="The default selection filled the token budget before including everything — shallower items were preferred. Adjust below."
                      >
                        (cap applied — how?)
                      </span>
                    )}
                  </span>
                  <span className={overBudget ? "text-amber-600 dark:text-amber-400" : ""}>
                    {formatTokens(state.estimatedTokens)} /{" "}
                    {formatTokens(state.tokenBudget)}
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                  <div
                    className={`h-full rounded-full ${overBudget ? "bg-amber-500" : "bg-gold-primary/70"}`}
                    style={{
                      width: `${Math.min(100, (state.estimatedTokens / state.tokenBudget) * 100)}%`,
                    }}
                  />
                </div>
              </div>

              {/* Rows */}
              <ul className="mt-1.5 max-h-72 overflow-y-auto px-1.5 pb-1.5">
                {state.rows.map((row) => {
                  const isFolder = row.contentType === "folder";
                  const tri: TriState = isFolder
                    ? folderTriState(row)
                    : included.has(row.id)
                      ? "checked"
                      : "unchecked";
                  const disabled = !isFolder && (row.empty || row.genLocked);

                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() =>
                          disabled
                            ? undefined
                            : isFolder
                              ? toggleFolder(row)
                              : toggleLeaf(row)
                        }
                        disabled={disabled}
                        title={
                          row.genLocked
                            ? "Studio-generated and unedited — locked out of sources to keep the AI from summarizing itself. Edit it to make it eligible."
                            : row.warning
                        }
                        className={`flex min-h-[44px] w-full items-center gap-2 rounded-md px-1.5 text-left ${
                          disabled
                            ? "cursor-default opacity-50"
                            : "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                        }`}
                        style={{ paddingLeft: `${(row.depth - 1) * 14 + 6}px` }}
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            tri === "unchecked"
                              ? "border-black/20 dark:border-white/25"
                              : "border-gold-primary bg-gold-primary/20 text-gold-primary"
                          }`}
                        >
                          {tri === "checked" && <Check className="h-3 w-3" />}
                          {tri === "partial" && <Minus className="h-3 w-3" />}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs text-gray-700 dark:text-gray-200">
                            {row.title}
                          </span>
                          {!isFolder && !row.empty && (
                            <span className="mt-0.5 block h-0.5 max-w-24 overflow-hidden rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
                              <span
                                className="block h-full rounded-full bg-gold-primary/50"
                                style={{
                                  width: `${Math.max(4, (row.tokens / maxLeafTokens) * 100)}%`,
                                }}
                              />
                            </span>
                          )}
                        </span>

                        {row.genLocked && !isFolder && (
                          <span className="shrink-0 rounded-full border border-gold-primary/30 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-gold-primary/80">
                            Gen
                          </span>
                        )}
                        {row.empty && !row.genLocked && !isFolder && (
                          <span className="shrink-0 rounded-full border border-black/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-gray-400 dark:border-white/15 dark:text-gray-500">
                            No text
                          </span>
                        )}
                        {!isFolder && !row.empty && (
                          <span className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500">
                            {formatTokens(row.tokens)}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>

              {state.scanCapped && (
                <p className="px-3 pb-1 text-[10px] text-gray-400 dark:text-gray-500">
                  Large folder — only the first 200 items were scanned.
                </p>
              )}
              <p className="h-4 px-3 text-right text-[10px] text-gray-400 dark:text-gray-500">
                {saving ? "Saving selection…" : state.isDefault ? "Default selection" : " "}
              </p>
            </>
          )}

          <div className="border-t border-black/[0.06] p-2 dark:border-white/[0.08]">
            <button
              type="button"
              onClick={openFolderChat}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md border border-gold-primary/40 text-xs text-gold-primary transition-colors hover:bg-gold-primary/10"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Chat with these sources
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
