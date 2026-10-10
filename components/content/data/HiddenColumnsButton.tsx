"use client";

/**
 * "N hidden" — the way back for columns hidden in THIS VIEW (owner,
 * 2026-10-09). Sits in the header row beside "+", only while the view hides
 * something, so a hidden column is never out of sight AND out of mind.
 * Lists each one with Show, plus Show all. Same PanelPortal as every other
 * database box (click-away and Esc dismiss).
 */

import { useState } from "react";
import { EyeOff } from "lucide-react";
import type { DataColumn } from "@/lib/domain/data";
import { PanelPortal } from "./PanelPortal";
import { TYPE_GLYPH } from "./DataColumnHeader";

interface HiddenColumnsButtonProps {
  hidden: DataColumn[];
  viewName?: string;
  onShow: (columnIds: string[]) => void;
}

export function HiddenColumnsButton({ hidden, viewName, onShow }: HiddenColumnsButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={`Columns hidden in ${viewName ? `the “${viewName}” view` : "this view"}`}
        className="flex h-full items-center gap-1 whitespace-nowrap px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <EyeOff className="h-3.5 w-3.5" />
        {hidden.length} hidden
      </button>
      <PanelPortal open={open} onDismiss={() => setOpen(false)}>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Hidden in {viewName ? <>the “{viewName}” view</> : "this view"} only — other views still show them.
        </p>
        <ul className="mb-2 max-h-56 space-y-0.5 overflow-y-auto">
          {hidden.map((column) => (
            <li key={column.id} className="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted">
              <span aria-hidden="true" className="w-4 shrink-0 font-mono text-[10px] opacity-60">
                {TYPE_GLYPH[column.type] ?? "·"}
              </span>
              <span className="min-w-0 flex-1 truncate">{column.name}</span>
              <button
                type="button"
                onClick={() => {
                  onShow([column.id]);
                  if (hidden.length === 1) setOpen(false);
                }}
                className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-primary hover:bg-primary/10"
              >
                Show
              </button>
            </li>
          ))}
        </ul>
        {hidden.length > 1 && (
          <button
            type="button"
            onClick={() => {
              onShow(hidden.map((c) => c.id));
              setOpen(false);
            }}
            className="w-full rounded border border-border px-2 py-1 text-xs hover:bg-muted"
          >
            Show all
          </button>
        )}
      </PanelPortal>
    </div>
  );
}
