"use client";

/**
 * View tabs above the grid (plan B8 surface 2, O14).
 *
 * One click between saved views — the Notion-parity baseline the rest of
 * B8's navigation story (workspace tabs, the rail, wiki-links to views)
 * builds on. Each tab's chevron opens a menu: rename, access
 * (collaborative / personal / locked), make default, delete.
 */

import { useCallback, useState } from "react";
import { Check, ChevronDown, Plus, Star, Trash2 } from "lucide-react";
import { cn } from "@/lib/core/utils";
import type {
  DataColumn,
  DataView,
  DataViewAccess,
  DataViewMode,
} from "@/lib/domain/data";
import { PanelPortal } from "./PanelPortal";

const ACCESS_LABEL: Record<DataViewAccess, { label: string; hint: string }> = {
  collaborative: {
    label: "Collaborative",
    hint: "Anyone with access can change how this view is configured.",
  },
  personal: {
    label: "Personal",
    hint: "Only you can see or adjust this view.",
  },
  locked: {
    label: "Locked",
    hint: "Configuration is frozen. Rows stay editable.",
  },
};

/** Modes with a renderer. The others exist in the type, not the picker. */
const MODE_LABEL: Partial<Record<DataViewMode, string>> = {
  grid: "Grid",
  board: "Board",
};

const fieldClass = cn(
  "w-full rounded-md border border-border bg-background px-2 py-1.5",
  "text-xs outline-none focus:ring-2 focus:ring-primary"
);

export interface ViewPatch {
  name?: string;
  access?: DataViewAccess;
  makeDefault?: boolean;
  mode?: DataViewMode;
  groupByColumnId?: string | null;
  filters?: import("@/lib/domain/data").FilterNode;
}

interface DataViewBarProps {
  views: DataView[];
  /** For the board's group-by picker — status/select columns only. */
  columns: DataColumn[];
  activeViewId: string | null;
  defaultViewId: string | null;
  canWrite: boolean;
  onSwitch: (viewId: string) => void;
  onCreate: () => Promise<void>;
  onUpdate: (viewId: string, patch: ViewPatch) => Promise<void>;
  onDelete: (viewId: string) => Promise<void>;
}

export function DataViewBar({
  views,
  columns,
  activeViewId,
  defaultViewId,
  canWrite,
  onSwitch,
  onCreate,
  onUpdate,
  onDelete,
}: DataViewBarProps) {
  const [menuViewId, setMenuViewId] = useState<string | null>(null);
  const [renamingViewId, setRenamingViewId] = useState<string | null>(null);

  const commitRename = useCallback(
    (viewId: string, raw: string, original: string) => {
      setRenamingViewId(null);
      const name = raw.trim();
      if (!name || name === original) return;
      void onUpdate(viewId, { name });
    },
    [onUpdate]
  );

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-b border-border px-2">
      {views.map((view) => {
        const active = view.id === activeViewId;
        if (renamingViewId === view.id) {
          return (
            <input
              key={view.id}
              autoFocus
              defaultValue={view.name}
              onFocus={(e) => e.target.select()}
              onBlur={(e) => commitRename(view.id, e.target.value, view.name)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitRename(view.id, e.currentTarget.value, view.name);
                } else if (e.key === "Escape") {
                  setRenamingViewId(null);
                }
              }}
              className={cn(
                "w-28 shrink-0 rounded border border-primary bg-background",
                "px-2 py-1.5 text-xs outline-none"
              )}
            />
          );
        }
        return (
          <div key={view.id} className="relative flex shrink-0 items-stretch">
            <button
              type="button"
              onClick={() => onSwitch(view.id)}
              onDoubleClick={() => {
                // Double-click renames in place (owner, 2026-08-24). Locked
                // views skip straight past — the server would refuse anyway.
                if (canWrite && view.access !== "locked") {
                  setRenamingViewId(view.id);
                }
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-t px-2.5 py-2 text-xs",
                "-mb-px border-b-2 select-none",
                // Own the focus style: the browser's default ring collides
                // with the active underline and reads as broken chrome.
                "outline-none focus-visible:bg-muted/60",
                active
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              {view.name}
              {view.access === "personal" && (
                <span
                  className="text-[9px] uppercase tracking-wide text-muted-foreground"
                  title={ACCESS_LABEL.personal.hint}
                >
                  personal
                </span>
              )}
              {view.id === defaultViewId && (
                <Star
                  className="h-2.5 w-2.5 text-muted-foreground"
                  aria-label="Default view"
                />
              )}
            </button>
            {canWrite && active && (
              <button
                type="button"
                aria-label={`${view.name} view options`}
                onClick={() =>
                  setMenuViewId((cur) => (cur === view.id ? null : view.id))
                }
                className="flex items-center px-0.5 text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            )}
            {menuViewId === view.id && (
              <ViewMenu
                view={view}
                columns={columns}
                isDefault={view.id === defaultViewId}
                isOnly={views.length <= 1}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onClose={() => setMenuViewId(null)}
              />
            )}
          </div>
        );
      })}

      {canWrite && (
        <button
          type="button"
          onClick={() => void onCreate()}
          title="Add view"
          className="ml-1 flex shrink-0 items-center rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ── Per-view menu ────────────────────────────────────────────────────────

interface ViewMenuProps {
  view: DataView;
  columns: DataColumn[];
  isDefault: boolean;
  isOnly: boolean;
  onUpdate: DataViewBarProps["onUpdate"];
  onDelete: DataViewBarProps["onDelete"];
  onClose: () => void;
}

function ViewMenu({
  view,
  columns,
  isDefault,
  isOnly,
  onUpdate,
  onDelete,
  onClose,
}: ViewMenuProps) {
  const [name, setName] = useState(view.name);
  const [busy, setBusy] = useState(false);
  const locked = view.access === "locked";

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      if (busy) return;
      setBusy(true);
      try {
        await fn();
        onClose();
      } finally {
        setBusy(false);
      }
    },
    [busy, onClose]
  );

  return (
    <PanelPortal open onDismiss={onClose}>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Name
      </label>
      <input
        autoFocus
        value={name}
        disabled={locked}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim() && name.trim() !== view.name) {
            void run(() => onUpdate(view.id, { name: name.trim() }));
          }
        }}
        className={cn(fieldClass, locked && "opacity-50")}
      />

      <label className="mb-1 mt-3 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Layout
      </label>
      <select
        value={view.mode}
        disabled={locked}
        onChange={(e) =>
          void run(() =>
            onUpdate(view.id, { mode: e.target.value as DataViewMode })
          )
        }
        className={fieldClass}
      >
        {(Object.keys(MODE_LABEL) as DataViewMode[]).map((m) => (
          <option key={m} value={m}>
            {MODE_LABEL[m]}
          </option>
        ))}
      </select>

      {view.mode === "board" && (
        <>
          <label className="mb-1 mt-3 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Group by
          </label>
          <select
            value={view.groupByColumnId ?? ""}
            disabled={locked}
            onChange={(e) =>
              void run(() =>
                onUpdate(view.id, {
                  groupByColumnId: e.target.value || null,
                })
              )
            }
            className={fieldClass}
          >
            <option value="">Auto (first Status column)</option>
            {columns
              .filter((c) => c.type === "status" || c.type === "select")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </>
      )}

      <label className="mb-1 mt-3 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Who can change this view
      </label>
      <select
        value={view.access}
        onChange={(e) =>
          void run(() =>
            onUpdate(view.id, { access: e.target.value as DataViewAccess })
          )
        }
        className={fieldClass}
      >
        {(Object.keys(ACCESS_LABEL) as DataViewAccess[]).map((a) => (
          <option key={a} value={a}>
            {ACCESS_LABEL[a].label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
        {ACCESS_LABEL[view.access].hint}
      </p>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={isDefault || locked}
            onClick={() => void run(() => onUpdate(view.id, { makeDefault: true }))}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted disabled:opacity-40"
          >
            <Star className="h-3 w-3" />
            {isDefault ? "Default" : "Make default"}
          </button>
          <button
            type="button"
            disabled={isOnly || locked}
            title={isOnly ? "A database keeps at least one view" : undefined}
            onClick={() => void run(() => onDelete(view.id))}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-destructive hover:bg-destructive/10 disabled:opacity-40"
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button>
        </div>
        <button
          type="button"
          disabled={!name.trim() || name.trim() === view.name || locked}
          onClick={() => void run(() => onUpdate(view.id, { name: name.trim() }))}
          className="flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40"
        >
          <Check className="h-3 w-3" />
          Save
        </button>
      </div>
    </PanelPortal>
  );
}
