"use client";

/**
 * ChatControlPanel (AI 3.8) — one roomy, labeled home for the chat's
 * calibrations. The footer rail had no room for labels, so pin-model and
 * context lived as bare icons and the target affordances as terse header
 * chips. The panel hosts all four WITH labels; the rail keeps only the
 * make/model picker (the "condense the rail" backlog item, superseded);
 * the header chips stay as at-a-glance state.
 *
 * Composition notes:
 * - The hosted affordances (TargetFolderChip, OutputTargetChip,
 *   ChatContextPicker) open their OWN portaled menus at <body> level, so a
 *   naive outside-click handler would close the panel mid-interaction.
 *   Click-away dismissal (owner ask) therefore exempts any position:fixed
 *   layer: hosted menus and toasts count as "inside"; true page clicks,
 *   ✕, Escape, and the trigger all dismiss.
 * - Portaled + position:fixed, opening above the trigger (the composer
 *   sits at the viewport bottom; overflow-x-auto rails clip upward
 *   dropdowns — the recorded portal rule).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Feather, SlidersHorizontal, X } from "lucide-react";
import {
  calculateMenuPosition,
  type CalculatedPosition,
} from "@/lib/core/menu-positioning";
import { TargetFolderChip } from "./TargetFolderChip";
import { OutputTargetChip } from "./OutputTargetChip";
import { ModelPinToggle } from "./ModelPinToggle";
import { ChatContextPicker } from "./ChatContextPicker";
import type { OutputTarget } from "@/lib/domain/ai/output-target";

const PANEL_WIDTH = 340;
const PANEL_MAX_HEIGHT = 420;

interface ChatControlPanelProps {
  targetFolder: { id: string; title: string | null } | null;
  targetInherited: boolean;
  targetLocation?: { id: string; title: string | null } | null;
  onTargetChange: (next: { id: string; title: string | null } | null) => void;
  targetDisabled?: boolean;
  outputTarget: OutputTarget;
  onOutputTargetChange: (next: OutputTarget) => void;
  hasOrigin: boolean;
  modelPinned: boolean;
  onModelPinnedChange: (next: boolean) => void;
  activeContextId: string | null;
  onContextChange: (next: string | null) => void;
  busy?: boolean;
}

function PanelRow({
  label,
  hint,
  children,
}: {
  label: React.ReactNode;
  hint: string;
  children: React.ReactNode;
}) {
  // Settings-row layout (owner, 2026-09-04, second pass): label left,
  // control right, one line per row — the macOS-settings shape. The
  // explanatory line stays behind a native tooltip on the row.
  return (
    <div className="flex items-center gap-3 px-3 py-2" title={hint}>
      <div className="w-24 shrink-0 text-[11px] font-medium text-gray-700 dark:text-gray-200">
        {label}
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end">
        {children}
      </div>
    </div>
  );
}

export function ChatControlPanel({
  targetFolder,
  targetInherited,
  targetLocation = null,
  onTargetChange,
  targetDisabled = false,
  outputTarget,
  onOutputTargetChange,
  hasOrigin,
  modelPinned,
  onModelPinnedChange,
  activeContextId,
  onContextChange,
  busy = false,
}: ChatControlPanelProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CalculatedPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot post-mount marker (same pattern as AssistantAvatar)
    setPortalReady(typeof document !== "undefined");
  }, []);

  const toggle = useCallback(() => {
    setOpen((current) => {
      if (current) return false;
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        setPosition(
          calculateMenuPosition({
            triggerPosition: { x: rect.left, y: rect.top - 6 },
            menuDimensions: { width: PANEL_WIDTH, height: PANEL_MAX_HEIGHT },
            viewportPadding: 8,
            preferredPlacementX: "right",
            preferredPlacementY: "top",
          }),
        );
      }
      return true;
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    // Click-away dismissal (owner, 2026-09-04) with the nested-portal trap
    // handled: the hosted affordances (target pickers, context picker) open
    // their OWN menus portaled to <body> as position:fixed layers — a click
    // there is an interaction, not a dismissal. Clicks inside the panel or
    // trigger keep it open; clicks inside ANY other fixed layer (a hosted
    // menu, a toast) are ignored; true page clicks close.
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      for (
        let el: HTMLElement | null = target;
        el && el !== document.body;
        el = el.parentElement
      ) {
        if (getComputedStyle(el).position === "fixed") return;
      }
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        title="Chat controls — file target, output target, model pin, context"
        className={
          open
            ? "ml-1 inline-flex shrink-0 items-center rounded px-1 py-0.5 text-gold-primary bg-black/[0.05] dark:bg-white/10"
            : "ml-1 inline-flex shrink-0 items-center rounded px-1 py-0.5 text-gray-400 hover:text-gray-600 hover:bg-black/[0.04] dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-white/5"
        }
      >
        <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
      </button>
      {portalReady &&
        open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Chat controls"
            style={{
              position: "fixed",
              zIndex: 130,
              top: position.y,
              left: position.x,
              width: PANEL_WIDTH,
              maxHeight: PANEL_MAX_HEIGHT,
            }}
            className="flex flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-[#1c1c1e]"
          >
            <div className="flex items-center justify-between border-b border-black/[0.06] px-3 py-2 dark:border-white/[0.08]">
              <span className="text-[12px] font-semibold text-gray-800 dark:text-gray-100">
                Chat controls
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat controls"
                className="rounded p-1 text-gray-400 hover:bg-black/[0.05] hover:text-gray-600 dark:hover:bg-white/10 dark:hover:text-gray-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="min-h-0 divide-y divide-black/[0.05] overflow-y-auto dark:divide-white/[0.06]">
              <PanelRow
                label="File target"
                hint="The folder this chat serves — run notes and ledgers file here."
              >
                <TargetFolderChip
                  target={targetFolder}
                  inherited={targetInherited}
                  location={targetLocation}
                  disabled={targetDisabled}
                  onChange={onTargetChange}
                />
              </PanelRow>
              <PanelRow
                label="Output target"
                hint="Where generated content (notes, documents) lands by default."
              >
                <OutputTargetChip
                  value={outputTarget}
                  onChange={onOutputTargetChange}
                  hasOrigin={hasOrigin}
                />
              </PanelRow>
              <PanelRow
                label="Model pin"
                hint={
                  modelPinned
                    ? "Pinned — the selected model overrides charter per-phase routing."
                    : "Unpinned — charter per-phase routing applies. Pin to override."
                }
              >
                <span className="mr-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                  {modelPinned ? "Pinned" : "Unpinned"}
                </span>
                <ModelPinToggle pinned={modelPinned} onToggle={onModelPinnedChange} />
              </PanelRow>
              <PanelRow
                label={
                  <span className="inline-flex items-center gap-1">
                    <Feather className="h-3 w-3 text-gray-500 dark:text-gray-400" />
                    Context
                  </span>
                }
                hint="Standing instructions layered onto this chat's system prompt."
              >
                <ChatContextPicker
                  value={activeContextId}
                  onChange={onContextChange}
                  disabled={busy}
                />
              </PanelRow>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
