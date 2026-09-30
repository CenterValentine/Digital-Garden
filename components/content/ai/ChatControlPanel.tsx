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
 *   Click-away dismissal therefore exempts by DOM ORDER: layers portaled
 *   to <body> AFTER the panel (the hosted menus) count as "inside"; true
 *   page clicks, ✕, Escape, and the trigger all dismiss.
 * - Portaled + position:fixed, opening above the trigger (the composer
 *   sits at the viewport bottom; overflow-x-auto rails clip upward
 *   dropdowns — the recorded portal rule).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Feather, SlidersHorizontal, X } from "lucide-react";
import { anchorMenuAbove } from "@/lib/core/menu-positioning";
import { TargetFolderChip } from "./TargetFolderChip";
import { OutputTargetChip } from "./OutputTargetChip";
import { ModelPinToggle } from "./ModelPinToggle";
import { ChatContextPicker } from "./ChatContextPicker";
import type { OutputTarget } from "@/lib/domain/ai/output-target";
import {
  loadSearchServiceName,
  nativeSearchLabel,
  type SearchBackendPreference,
} from "@/lib/domain/ai/use-chat-search-backend";
import { Switch } from "@/components/client/ui/switch";
import { useSettingsStore } from "@/state/settings-store";
import {
  BULK_READ_MAX_TOKENS,
  BULK_READ_MIN_TOKENS,
  effectiveBulkReadThreshold,
} from "@/lib/features/settings/validation";

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
  /** Title of the content this chat is rooted on — names the output options. */
  originTitle?: string | null;
  modelPinned: boolean;
  onModelPinnedChange: (next: boolean) => void;
  activeContextId: string | null;
  onContextChange: (next: string | null) => void;
  busy?: boolean;
  /** The chat's provider/model — the web-search row shows only when it has its own search. */
  providerId?: string | null;
  modelId?: string | null;
  searchBackend?: SearchBackendPreference;
  onSearchBackendChange?: (next: SearchBackendPreference) => void;
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
  originTitle = null,
  modelPinned,
  onModelPinnedChange,
  activeContextId,
  onContextChange,
  busy = false,
  providerId = null,
  modelId = null,
  searchBackend = "native",
  onSearchBackendChange,
}: ChatControlPanelProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{
    left: number;
    bottom: number;
    maxHeight: number;
  } | null>(null);
  const nativeLabel = nativeSearchLabel(providerId, modelId);
  // Approvals (owner, 2026-09-30): the two account-wide AI settings that
  // decide when a run pauses — surfaced here beside the chat, written
  // through the same store as Settings → AI so the two never disagree.
  const aiSettings = useSettingsStore((state) => state.ai);
  const setAISettings = useSettingsStore((state) => state.setAISettings);
  const charterAutoApprove = aiSettings?.charterAutoApprove ?? false;
  const readThreshold = effectiveBulkReadThreshold(aiSettings?.bulkReadTokenThreshold);
  const [readThresholdDraft, setReadThresholdDraft] = useState<string | null>(null);
  const commitReadThreshold = () => {
    if (readThresholdDraft === null) return;
    const parsed = parseInt(readThresholdDraft.trim().replace(/[,_\s]/g, ""), 10);
    setReadThresholdDraft(null);
    if (Number.isNaN(parsed)) return;
    const clamped = Math.min(Math.max(parsed, BULK_READ_MIN_TOKENS), BULK_READ_MAX_TOKENS);
    if (clamped !== readThreshold) void setAISettings({ bulkReadTokenThreshold: clamped });
  };
  // undefined = not loaded yet; null = the user has no search connection.
  const [searchService, setSearchService] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!open || !nativeLabel || searchService !== undefined) return;
    let live = true;
    void loadSearchServiceName().then((name) => {
      if (live) setSearchService(name);
    });
    return () => {
      live = false;
    };
  }, [open, nativeLabel, searchService]);
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
      // Pinned by its BOTTOM edge just above the trigger and grown upward
      // (owner, 2026-09-30: the panel opened ~200px above its button —
      // placement assumed the 420px maximum height, and the real panel is
      // about half that). No height guess, no gap.
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        setPosition(anchorMenuAbove(rect, PANEL_WIDTH, { gap: 6 }));
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
    // handled by DOM ORDER, not position (a fixed-position test false-
    // positived on the app shell's own fixed ancestors and nothing ever
    // dismissed): the hosted affordances portal their menus to <body>
    // AFTER this panel, so a click whose top-level ancestor FOLLOWS the
    // panel is an interaction with a layer opened on top of us — ignore
    // it. Everything else (the app content root precedes the panel)
    // closes.
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      const panel = panelRef.current;
      if (panel && target instanceof Element) {
        let top: Element = target;
        while (top.parentElement && top.parentElement !== document.body) {
          top = top.parentElement;
        }
        if (
          top.parentElement === document.body &&
          panel.compareDocumentPosition(top) &
            Node.DOCUMENT_POSITION_FOLLOWING
        ) {
          return;
        }
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
              bottom: position.bottom,
              left: position.left,
              width: PANEL_WIDTH,
              maxHeight: Math.min(PANEL_MAX_HEIGHT, position.maxHeight),
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
                label="Target folder"
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
                label="Target output"
                hint="Where generated content (notes, documents) lands by default."
              >
                <OutputTargetChip
                  value={outputTarget}
                  onChange={onOutputTargetChange}
                  hasOrigin={hasOrigin}
                  contentTitle={originTitle}
                />
              </PanelRow>
              <PanelRow
                label="Lock selected model"
                hint={
                  modelPinned
                    ? "Locked — the selected model overrides charter-designated per-phase routing."
                    : "Unlocked — charter-designated per-phase routing applies. Lock to override."
                }
              >
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
              <PanelRow
                label="Auto-approve charter"
                hint={
                  charterAutoApprove
                    ? "On — in a charter chat, its documents, notes, database reads and final checkpoint run without asking. Run proposals, checkpoints between phases, and overwrites of your own files still ask. Applies to every chat."
                    : "Off — a charter chat asks before creating documents and notes, large reads, and its final checkpoint. Turn on to skip what the charter already asked for. Applies to every chat."
                }
              >
                <Switch
                  checked={charterAutoApprove}
                  onCheckedChange={(checked) => void setAISettings({ charterAutoApprove: checked })}
                  aria-label="Auto-approve charter deliverables"
                />
              </PanelRow>
              <PanelRow
                label="Ask before reads over"
                hint="Database reads estimated above this many tokens ask for approval; smaller ones run. Applies to every chat (also in Settings → AI)."
              >
                <span className="inline-flex items-center gap-1.5">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={BULK_READ_MIN_TOKENS}
                    max={BULK_READ_MAX_TOKENS}
                    step={1000}
                    aria-label="Read approval threshold in tokens"
                    value={readThresholdDraft ?? String(readThreshold)}
                    onChange={(event) => setReadThresholdDraft(event.target.value)}
                    onBlur={commitReadThreshold}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitReadThreshold();
                      }
                    }}
                    className="w-20 rounded-md border border-black/10 bg-transparent px-1.5 py-0.5 text-right text-[11px] text-gray-800 focus:outline-none focus:ring-1 focus:ring-gold-primary/50 dark:border-white/10 dark:text-gray-100"
                  />
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">tokens</span>
                </span>
              </PanelRow>
              {nativeLabel && onSearchBackendChange ? (
                <PanelRow
                  label="Web search"
                  hint={
                    searchService === null
                      ? `${nativeLabel}'s own search. Add a search connection in Settings to route this chat's searches through it instead.`
                      : `${nativeLabel}: the model's own search (integrated citations). Search service: your connection — duplicate searches are caught and a budget can apply.`
                  }
                >
                  <div
                    role="radiogroup"
                    aria-label="Web search"
                    className="inline-flex overflow-hidden rounded-md border border-black/10 text-[11px] dark:border-white/10"
                  >
                    {(
                      [
                        { value: "native", label: nativeLabel, disabled: false },
                        {
                          value: "app",
                          label: searchService ?? "Search service",
                          disabled: searchService === null,
                        },
                      ] as const
                    ).map((option) => {
                      const selected =
                        searchBackend === option.value ||
                        (option.value === "native" && searchService === null);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={option.disabled}
                          onClick={() => onSearchBackendChange(option.value)}
                          className={
                            selected
                              ? "px-2 py-1 font-medium bg-black/[0.07] text-gray-900 dark:bg-white/15 dark:text-gray-50"
                              : "px-2 py-1 text-gray-500 hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-white/5"
                          }
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </PanelRow>
              ) : null}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
