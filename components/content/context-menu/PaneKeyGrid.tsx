"use client";

/**
 * "Open In Pane" as the key map itself.
 *
 * The flat list this replaced gave each pane its letters as a shortcut column
 * — three for the left pane, two for the right, one for bottom-right — and
 * read as if some panes were easier to reach than others. The keys are a 3×3
 * cluster, so the menu is a 3×3 cluster: Q W E / A S D / Z X C, each cell
 * drawn as what the key means (a corner of a quad, a side of a split, one
 * pane), with a caption and a hover sentence. Clicking a cell does what
 * holding the key and clicking the file would.
 */

import { createPortal } from "react-dom";
import { useContentStore, isPaneVisible } from "@/state/content-store";
import {
  PANE_HOTKEY_GRID,
  PANE_HOTKEY_SINGLE,
  type PaneHotkeyCell,
  type PaneHotkeyGlyph,
  type PaneHotkeyTarget,
} from "@/lib/features/content/pane-hotkeys";

interface PaneKeyGridProps {
  position: { x: number; y: number };
  onPick: (target: PaneHotkeyTarget) => void | Promise<void>;
  onClose: () => void;
  onMouseEnter: () => void;
}

/**
 * One glyph per meaning. Corners are diagonal arrows; sides are a divider
 * line with an arrow into the chosen half; single is a square.
 */
export function KeyGlyph({ glyph }: { glyph: PaneHotkeyGlyph }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (glyph) {
    case "corner-tl":
      return <svg {...common}><path d="M12 12 4 4M4 10V4h6" /></svg>;
    case "corner-tr":
      return <svg {...common}><path d="M4 12l8-8M6 4h6v6" /></svg>;
    case "corner-bl":
      return <svg {...common}><path d="M12 4l-8 8M4 6v6h6" /></svg>;
    case "corner-br":
      return <svg {...common}><path d="M4 4l8 8M12 6v6H6" /></svg>;
    case "edge-left":
      return <svg {...common}><path d="M8 2v12M6 8H1.5M3.5 6 1.5 8l2 2" /></svg>;
    case "edge-right":
      return <svg {...common}><path d="M8 2v12M10 8h4.5M12.5 6l2 2-2 2" /></svg>;
    case "edge-top":
      return <svg {...common}><path d="M2 8h12M8 6V1.5M6 3.5l2-2 2 2" /></svg>;
    case "edge-bottom":
      return <svg {...common}><path d="M2 8h12M8 10v4.5M6 12.5l2 2 2-2" /></svg>;
    case "single":
    default:
      return <svg {...common}><rect x="3" y="3" width="10" height="10" rx="1.5" /></svg>;
  }
}

function describe(cellDef: PaneHotkeyCell, expands: boolean): string {
  const how = `Hold ${cellDef.letter} and click a file, or click here.`;
  const tail = expands ? " The layout expands to show it." : "";
  return `${cellDef.letter} — ${cellDef.description}.${tail} ${how}`;
}

export function PaneKeyGrid({ position, onPick, onClose, onMouseEnter }: PaneKeyGridProps) {
  const layoutMode = useContentStore((state) => state.layoutMode);

  const content = (
    <div
      className="fixed z-[130]"
      style={{ left: position.x, top: position.y }}
      onMouseEnter={onMouseEnter}
      role="menu"
      aria-label="Open in pane — hold a key and click a file"
    >
      <div className="w-[196px] rounded-md border border-white/20 bg-white/95 p-1 shadow-lg backdrop-blur-sm dark:bg-gray-900/95">
        <div className="grid grid-cols-3 gap-0.5">
          {PANE_HOTKEY_GRID.flat().map((cellDef) => {
            const expands =
              cellDef.target !== PANE_HOTKEY_SINGLE &&
              !isPaneVisible(layoutMode, cellDef.target);
            const collapses =
              cellDef.target === PANE_HOTKEY_SINGLE && layoutMode !== "single";
            return (
              <button
                key={cellDef.code}
                type="button"
                role="menuitem"
                title={describe(cellDef, expands)}
                aria-label={describe(cellDef, expands)}
                onClick={async () => {
                  await onPick(cellDef.target);
                  onClose();
                }}
                className="flex flex-col items-center gap-px rounded px-0.5 py-1 text-gray-700 transition-colors hover:bg-primary/10 hover:text-primary dark:text-gray-200"
              >
                <span className="text-[13px] font-medium leading-none">{cellDef.letter}</span>
                <span className="opacity-70">
                  <KeyGlyph glyph={cellDef.glyph} />
                </span>
                <span className="text-[9px] leading-tight text-gray-500 dark:text-gray-400">
                  {cellDef.caption}
                  {expands || collapses ? " ·" : ""}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-0.5 border-t border-gray-200/50 px-0.5 pt-1 text-[9px] leading-tight text-gray-500 dark:border-gray-700/50 dark:text-gray-400">
          Hold a key, click a file. · changes the layout.
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
