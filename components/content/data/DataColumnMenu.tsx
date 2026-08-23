"use client";

/**
 * Column editing: the add-column popover and the per-column header menu.
 *
 * Both panels are PORTALED to <body> and positioned with
 * `calculateMenuPosition` — the repo's canonical menu pattern (CLAUDE.md
 * "Menu Positioning"; same approach as ContextMenu and ContentTreePicker).
 * The first version rendered them `position: absolute` inside the header
 * cell, where the grid's overflow container clipped them and the left
 * sidebar painted over them. Portal + viewport-aware placement is the fix
 * that cannot regress per-panel.
 *
 * Type is chosen at creation and never afterwards (plan O4) — the edit menu
 * shows the type but offers no way to change it. Coercing every existing cell
 * is lossy in ways a preview cannot honestly convey, and "add a column and
 * migrate" is both cheaper to build and clearer about what happens to data.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/core/utils";
import {
  calculateMenuPosition,
  type CalculatedPosition,
} from "@/lib/core/menu-positioning";
import {
  IMPLEMENTED_COLUMN_TYPES,
  type DataColumn,
  type DataColumnType,
} from "@/lib/domain/data";

const TYPE_LABEL: Partial<Record<DataColumnType, string>> = {
  text: "Text",
  longText: "Long text",
  number: "Number",
  checkbox: "Checkbox",
  date: "Date",
  select: "Select",
  multiSelect: "Multi-select",
  status: "Status",
  url: "URL",
  email: "Email",
};

const panelClass = cn(
  // Fixed + z-[120]: portaled to <body>, above the sidebars, positioned by
  // calculateMenuPosition. Never `absolute` inside the grid — that is the
  // clipping bug this file exists to not have.
  "fixed z-[120] w-64 rounded-lg border border-border bg-popover p-3 shadow-lg"
);

const fieldClass = cn(
  "w-full rounded-md border border-border bg-background px-2 py-1.5",
  "text-xs outline-none focus:ring-2 focus:ring-primary"
);

// ── Portal panel plumbing ────────────────────────────────────────────────

/**
 * Anchors a portaled panel to the parent element of an invisible marker.
 *
 * Two-phase per the menu-positioning contract: the panel first renders
 * invisible at the viewport origin so it can be measured, then the measured
 * size goes through `calculateMenuPosition` for flip/shift at viewport
 * edges. Repositions on scroll (capture, so the grid's own scroller counts)
 * and resize rather than closing — the header cell is sticky, so scrolling
 * with an open menu is a normal thing to do.
 */
function usePanelPlacement(open: boolean) {
  const markerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CalculatedPosition | null>(null);

  const reposition = useCallback(() => {
    const anchor = markerRef.current?.parentElement;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const a = anchor.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    setPos(
      calculateMenuPosition({
        triggerPosition: { x: a.left, y: a.bottom + 4 },
        menuDimensions: { width: p.width, height: p.height },
      })
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- audited: two-phase menu measurement, same pattern as ContextMenu
      setPos(null);
      return;
    }
    // Measuring the just-rendered panel requires a post-render setState —
    // the sanctioned exception used by every calculateMenuPosition consumer.
    reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", reposition);
    document.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      document.removeEventListener("scroll", reposition, true);
    };
  }, [open, reposition]);

  return { markerRef, panelRef, pos };
}

/**
 * Outside-click + Escape dismissal, portal-aware.
 *
 * The anchor cell is exempted from "outside": its own click handler toggles
 * the menu, and dismissing on mousedown first would close-then-reopen —
 * a menu that cannot be toggled shut.
 */
function useDismiss(
  open: boolean,
  panelRef: React.RefObject<HTMLDivElement | null>,
  markerRef: React.RefObject<HTMLSpanElement | null>,
  onDismiss: () => void
) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (markerRef.current?.parentElement?.contains(target)) return;
      onDismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, panelRef, markerRef, onDismiss]);
}

interface PanelPortalProps {
  open: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
}

function PanelPortal({ open, onDismiss, children }: PanelPortalProps) {
  const { markerRef, panelRef, pos } = usePanelPlacement(open);
  useDismiss(open, panelRef, markerRef, onDismiss);

  return (
    <>
      <span ref={markerRef} className="hidden" aria-hidden="true" />
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            className={panelClass}
            style={
              pos
                ? {
                    left: pos.x,
                    top: pos.y,
                    maxHeight: pos.maxHeight,
                    overflowY: "auto",
                  }
                : // Measurement frame: mounted but invisible, so the real
                  // position is computed from true dimensions.
                  { left: 0, top: 0, visibility: "hidden" }
            }
            // React portals propagate synthetic events through the COMPONENT
            // tree, so without this a click inside the panel bubbles to the
            // header cell's onClick and toggles the menu shut mid-edit.
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  );
}

// ── Add ──────────────────────────────────────────────────────────────────

interface AddColumnButtonProps {
  onAdd: (input: { name: string; type: DataColumnType }) => Promise<void>;
}

export function AddColumnButton({ onAdd }: AddColumnButtonProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<DataColumnType>("text");
  const [busy, setBusy] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    setName("");
    setType("text");
  }, []);

  const submit = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onAdd({ name: trimmed, type });
      close();
    } finally {
      setBusy(false);
    }
  }, [name, type, busy, onAdd, close]);

  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Add column"
        className="flex h-full w-10 items-center justify-center text-muted-foreground hover:bg-muted"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>

      <PanelPortal open={open} onDismiss={close}>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Name
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder="Column name"
          className={fieldClass}
        />

        <label className="mb-1 mt-3 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Type
        </label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as DataColumnType)}
          className={fieldClass}
        >
          {IMPLEMENTED_COLUMN_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t] ?? t}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
          Type is set once. To change it later, add a new column and move the
          values across.
        </p>

        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!name.trim() || busy}
            className="rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </PanelPortal>
    </div>
  );
}

// ── Edit ─────────────────────────────────────────────────────────────────

interface ColumnMenuProps {
  column: DataColumn;
  onSave: (patch: { name: string; description: string | null }) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

export function ColumnMenu({ column, onSave, onDelete, onClose }: ColumnMenuProps) {
  const [name, setName] = useState(column.name);
  const [description, setDescription] = useState(column.description ?? "");
  const [busy, setBusy] = useState(false);

  const save = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onSave({
        name: trimmed,
        description: description.trim() || null,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }, [name, description, busy, onSave, onClose]);

  return (
    <PanelPortal open onDismiss={onClose}>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {TYPE_LABEL[column.type] ?? column.type}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Name
      </label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
        }}
        className={fieldClass}
      />

      <label className="mb-1 mt-3 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Description
      </label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value.slice(0, 280))}
        rows={3}
        placeholder="What this column is for"
        className={cn(fieldClass, "resize-none")}
      />
      <div className="mt-1 flex items-baseline justify-between">
        <p className="text-[10px] leading-snug text-muted-foreground">
          Shown on hover, and given to the AI as context.
        </p>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {description.length}/280
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between">
        {column.isPrimary ? (
          <span
            className="text-[10px] text-muted-foreground"
            title="Rows are titled from this column"
          >
            Primary column
          </span>
        ) : (
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={!name.trim() || busy}
          className="flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40"
        >
          <Check className="h-3 w-3" />
          Save
        </button>
      </div>
    </PanelPortal>
  );
}
