"use client";

/**
 * NoteWindowNodeView — the React body of the `noteWindow` block.
 *
 * Renders another ContentNode's note content inside the current note:
 * a rounded header (target title as plain text + affordances) above a
 * height-capped body that mounts a nested MarkdownEditor.
 *
 * This component is loaded ONLY via dynamic import from
 * note-window-client.tsx (cycle avoidance: MarkdownEditor imports
 * extensions-client, which registers the NoteWindow node).
 *
 * Window modes (the plan's state machine — presence gate + editable
 * modes land in a later chunk; today every content view is `snapshot`):
 *   placeholder — no target / self-embed / cycle / depth≥3 / 404 / 403
 *   collapsed   — depth 1-2 default: header only; expand-on-click
 *   snapshot    — read-only fetched content + hover-visible refresh
 *
 * Header affordances:
 *   - title (plain text) — click to rename the ACTUAL target file
 *     (PATCH + `content-updated`, the MainPanelContent.handleTitleCommit
 *     recipe — NOT the diagram-block attr-only pattern)
 *   - hover-visible refresh — refetch the freshest saved version
 *   - retarget (NoteWindowPicker) and history (previously windowed)
 *   - open full page (deep link; PWA best-effort)
 *
 * History memory: the ordered list of targets this window has displayed
 * (every successful retarget unshifts an entry). Lives in the HOST
 * note's Y.Doc under noteWindowSubMapKey(blockId) so it travels with
 * the note but not with copy/paste (blockId is re-idd on collision —
 * see block-id-paste-hygiene). Falls back to session-local React state
 * when the host has no ydoc (plain/fallback modes).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import type * as Y from "yjs";
import { toast } from "sonner";
import {
  AppWindow,
  ExternalLink,
  FolderSearch,
  History,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Trash2,
} from "lucide-react";

import { MarkdownEditor } from "@/components/content/editor/MarkdownEditor";
import { useSettingsStore } from "@/state/settings-store";
import {
  NoteWindowPicker,
  type PickerTarget,
} from "@/components/content/editor/NoteWindowPicker";
import { contentDeepLink } from "@/lib/features/content/tree-clipboard";
import { calculateMenuPosition } from "@/lib/core/menu-positioning";
import {
  noteWindowSubMapKey,
  type NoteWindowAttrs,
} from "@/lib/domain/editor/extensions/blocks/note-window";
import {
  useCollaborationRuntime,
  getContentCollaborationCapability,
  type CollaborationRuntimeHandle,
} from "@/lib/domain/collaboration/runtime";
import {
  useContentPresence,
  isActiveTransport,
} from "@/lib/domain/collaboration/presence-poll";

/** Depth at and beyond which nested windows render as inert chips. */
const NESTED_CHIP_DEPTH = 3;
const HISTORY_CAP = 12;
const HISTORY_KEY = "history";

export interface NoteWindowNodeViewProps {
  attrs: NoteWindowAttrs;
  editor: Editor;
  getPos: () => number | undefined;
  depth: number;
  ancestorTargetIds: string[];
  getHostContentId: (() => string | undefined) | null;
  hostYdoc: Y.Doc | null;
}

export interface NoteWindowHistoryEntry {
  id: string;
  title: string;
  at: number;
}

// ── History persistence: plain JSON array on the host note's Y.Doc
// sub-map, written whole (tiny payload; LWW on the map key is fine for
// an affordance list). ──
function readYHistory(
  ydoc: Y.Doc | null,
  blockId: string | null,
): NoteWindowHistoryEntry[] {
  if (!ydoc || !blockId) return [];
  try {
    const raw = ydoc.getMap<unknown>(noteWindowSubMapKey(blockId)).get(HISTORY_KEY);
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (e): e is NoteWindowHistoryEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as { id?: unknown }).id === "string" &&
        typeof (e as { title?: unknown }).title === "string",
    );
  } catch {
    return [];
  }
}

function writeYHistory(
  ydoc: Y.Doc,
  blockId: string,
  entries: NoteWindowHistoryEntry[],
): void {
  try {
    ydoc.getMap<unknown>(noteWindowSubMapKey(blockId)).set(HISTORY_KEY, entries);
  } catch {
    // best-effort — history is an affordance, never worth breaking the UI
  }
}

function pushEntry(
  entries: NoteWindowHistoryEntry[],
  entry: NoteWindowHistoryEntry,
): NoteWindowHistoryEntry[] {
  return [entry, ...entries.filter((e) => e.id !== entry.id)].slice(
    0,
    HISTORY_CAP,
  );
}

interface TargetSnapshot {
  title: string;
  contentType: string;
  tiptapJson: JSONContent | null;
  bodyHash: string | null;
}

type FetchState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; target: TargetSnapshot }
  | { phase: "not-found" }
  | { phase: "forbidden" }
  | { phase: "error"; message: string };

type FetchResult = Exclude<FetchState, { phase: "idle" } | { phase: "loading" }>;

const EMPTY_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

function GhostIconButton({
  label,
  onClick,
  className,
  buttonRef,
  disabled,
  children,
}: {
  label: string;
  onClick?: () => void;
  className?: string;
  buttonRef?: React.Ref<HTMLButtonElement>;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      // preventDefault on mousedown keeps the host ProseMirror editor
      // from stealing focus when a header control is clicked — the same
      // rule every BubbleMenu button follows.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-6 w-6 items-center justify-center rounded text-gray-500 dark:text-gray-400 ${
        disabled
          ? "opacity-40 cursor-default"
          : "hover:bg-black/5 dark:hover:bg-white/10"
      } ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

/** Small portal dropdown listing previously windowed targets. */
function HistoryMenu({
  anchorEl,
  entries,
  onPick,
  onClear,
  onClose,
}: {
  anchorEl: HTMLElement;
  entries: NoteWindowHistoryEntry[];
  onPick: (entry: NoteWindowHistoryEntry) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pos = useMemo(() => {
    const rect = anchorEl.getBoundingClientRect();
    return calculateMenuPosition({
      triggerPosition: { x: rect.left, y: rect.bottom + 4 },
      menuDimensions: { width: 240, height: 280 },
      preferredPlacementX: "right",
      preferredPlacementY: "bottom",
    });
  }, [anchorEl]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || anchorEl.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchorEl, onClose]);

  return createPortal(
    <div
      ref={menuRef}
      style={{ position: "fixed", left: pos.x, top: pos.y, width: 240, maxHeight: 280 }}
      className="z-[130] flex flex-col rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-[#1a1a1a] shadow-xl overflow-hidden"
    >
      <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-gray-500 font-medium border-b border-black/5 dark:border-white/5">
        Previously windowed
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {entries.length === 0 ? (
          <div className="px-3 py-2 text-[11px] text-gray-500">
            Nothing windowed yet
          </div>
        ) : (
          entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onPick(entry)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-black/[0.04] dark:hover:bg-white/5"
            >
              <AppWindow className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span className="truncate">{entry.title || "Untitled"}</span>
            </button>
          ))
        )}
      </div>
      {entries.length > 0 ? (
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-2 px-3 py-1.5 text-left text-[11px] text-gray-500 hover:bg-black/[0.04] dark:hover:bg-white/5 border-t border-black/5 dark:border-white/5"
        >
          <Trash2 className="h-3 w-3" /> Clear history
        </button>
      ) : null}
    </div>,
    document.body,
  );
}

export function NoteWindowNodeView({
  attrs,
  editor,
  getPos,
  depth,
  ancestorTargetIds,
  getHostContentId,
  hostYdoc,
}: NoteWindowNodeViewProps) {
  const { blockId, targetContentId, targetTitle, height } = attrs;

  // Fetch results are stored WITH the request key that produced them;
  // "loading" is derived from a key mismatch instead of being set
  // synchronously inside the effect (react-hooks/set-state-in-effect).
  const [fetchResult, setFetchResult] = useState<{
    key: string;
    state: FetchResult;
  } | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  // Nested windows (depth 1-2) start collapsed; expanding mounts the
  // read-only snapshot. Top-level windows are always expanded.
  const [expanded, setExpanded] = useState(depth === 0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Session-local history fallback when the host note has no ydoc
  // (plain / plain-fallback modes) — durability is a collab-mode feature.
  const [localHistory, setLocalHistory] = useState<NoteWindowHistoryEntry[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  // Rename-in-header state: null = not editing; optimisticTitle covers
  // the PATCH round-trip.
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [optimisticTitle, setOptimisticTitle] = useState<string | null>(null);
  const bodyHashRef = useRef<string | null>(null);
  const retargetBtnRef = useRef<HTMLButtonElement | null>(null);
  const historyBtnRef = useRef<HTMLButtonElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const renameSettledRef = useRef(false);

  const hostEditable = editor.isEditable;

  // ── Height persistence: a height the user sets on any window becomes
  // the default for future windows. Only LIVE transitions record (the
  // ref is seeded on mount so merely opening a note with a custom-height
  // window never overwrites the user's default). Remote collab height
  // edits can slip through — accepted, single-author dominant. ──
  const setEditorSettings = useSettingsStore((s) => s.setEditorSettings);
  const prevHeightRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevHeightRef.current;
    prevHeightRef.current = height;
    if (prev === null || prev === height || !hostEditable) return;
    void setEditorSettings({ noteWindowDefaultHeight: height });
  }, [height, hostEditable, setEditorSettings]);

  const isSelfEmbed = Boolean(
    targetContentId && getHostContentId && targetContentId === getHostContentId(),
  );
  const isCycle = Boolean(
    targetContentId && ancestorTargetIds.includes(targetContentId),
  );
  const isChip = depth >= NESTED_CHIP_DEPTH || isCycle;
  const fetchKey =
    targetContentId && !isSelfEmbed && !isChip && expanded
      ? `${targetContentId}:${refreshNonce}`
      : null;

  // ── Data load (all modes): GET the target's payload snapshot. ──
  useEffect(() => {
    if (!fetchKey || !targetContentId) return;
    let cancelled = false;
    const commit = (state: FetchResult) => {
      if (!cancelled) setFetchResult({ key: fetchKey, state });
    };
    (async () => {
      try {
        const res = await fetch(
          `/api/content/content/${encodeURIComponent(targetContentId)}`,
          { credentials: "include" },
        );
        if (cancelled) return;
        if (res.status === 404) {
          commit({ phase: "not-found" });
          return;
        }
        if (res.status === 403 || res.status === 401) {
          commit({ phase: "forbidden" });
          return;
        }
        const result = (await res.json()) as {
          success?: boolean;
          data?: {
            title?: string;
            contentType?: string;
            deletedAt?: string | null;
            note?: {
              tiptapJson?: JSONContent;
              bodyHash?: string;
            };
          };
        };
        if (cancelled) return;
        if (!res.ok || !result.success || !result.data) {
          commit({ phase: "error", message: "Couldn't load the windowed note." });
          return;
        }
        if (result.data.deletedAt) {
          commit({ phase: "not-found" });
          return;
        }
        bodyHashRef.current = result.data.note?.bodyHash ?? null;
        commit({
          phase: "ready",
          target: {
            title: result.data.title ?? "",
            contentType: result.data.contentType ?? "note",
            tiptapJson: result.data.note?.tiptapJson ?? null,
            bodyHash: result.data.note?.bodyHash ?? null,
          },
        });
      } catch {
        commit({ phase: "error", message: "Couldn't load the windowed note." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchKey, targetContentId]);

  // "idle" = nothing to show (collapsed/placeholder); "loading" = the
  // stored result doesn't match the current request key yet. Memoized so
  // downstream effect deps get a stable object identity per state.
  const fetchState: FetchState = useMemo(() => {
    if (!fetchKey) return { phase: "idle" };
    return fetchResult?.key === fetchKey
      ? fetchResult.state
      : { phase: "loading" };
  }, [fetchKey, fetchResult]);

  // ── Window mode machine (the plan's state table). ──
  //
  //   editable-note  — note target, collab enabled, gate clear: acquire
  //                    the target's runtime exactly like a workspace pane
  //                    (requiresLiveTransport: false; solo editing stays
  //                    provider-less; the runtime auto-promotes if a
  //                    second session appears — CRDT safety under the
  //                    UX gate).
  //   editable-plain — sidecar target (collab-ineligible, REST-only,
  //                    X-Body-Hash 409 as the concurrency guard) or
  //                    collab env off.
  //   snapshot       — target actively open in another session (the
  //                    gate), host read-only, or nested depth ≥ 1.
  const collabEnv = process.env.NEXT_PUBLIC_COLLABORATION_ENABLED === "true";
  const isNoteTarget =
    fetchState.phase === "ready" && fetchState.target.contentType === "note";
  // Presence gate: only note targets in a top-level editable window need
  // it — sidecars produce no presence records (no runtime ever attaches).
  const presence = useContentPresence(
    isNoteTarget && depth === 0 && hostEditable && targetContentId
      ? targetContentId
      : null,
  );
  const gate = presence.activeElsewhere;
  const [conflict, setConflict] = useState(false);
  const [dirty, setDirty] = useState(false);

  type WindowMode = "snapshot" | "editable-note" | "editable-plain";
  const windowMode: WindowMode =
    fetchState.phase !== "ready" || depth > 0 || !hostEditable
      ? "snapshot"
      : isNoteTarget
        ? gate
          ? "snapshot"
          : collabEnv
            ? "editable-note"
            : "editable-plain"
        : "editable-plain";

  // ── editable-note: acquire the target's collaboration runtime as one
  // more consumer (the runtime manager dedupes per contentId — a window
  // and a pane on the same note share one entry/ydoc/socket). ──
  const collabCapability = useMemo(
    () => (collabEnv ? getContentCollaborationCapability("note") : null),
    [collabEnv],
  );
  const runtimeDescriptor = useMemo(
    () => ({
      surfaceKind: "note-window" as const,
      workspaceId: "content-workspace",
      viewInstanceId: `note-window:${blockId ?? "unassigned"}`,
      requiresEditableField: "default",
      requiresLiveTransport: false,
    }),
    [blockId],
  );
  const collaborationRuntime = useCollaborationRuntime({
    contentId: windowMode === "editable-note" ? targetContentId : null,
    capability: collabCapability,
    descriptor: runtimeDescriptor,
    initialContent:
      windowMode === "editable-note" && fetchState.phase === "ready"
        ? fetchState.target.tiptapJson
        : null,
  });

  // Best-effort flush when the gate trips mid-edit: the runtime entry
  // outlives our release (5-min idle eviction) and local edits are
  // IndexedDB-durable either way, but promoting pushes the local tail to
  // the server immediately so the "live elsewhere" session sees it.
  const lastHandleRef = useRef<CollaborationRuntimeHandle | null>(null);
  useEffect(() => {
    if (collaborationRuntime) lastHandleRef.current = collaborationRuntime;
  }, [collaborationRuntime]);
  useEffect(() => {
    if (!gate) return;
    const handle = lastHandleRef.current;
    if (
      handle &&
      (handle.state.unsyncedUpdateCount > 0 || handle.state.localDirty)
    ) {
      void handle.promote("remote-presence");
    }
  }, [gate]);

  // Provider actively syncing → content is authoritative-fresh and a REST
  // swap would be a rival-doc hazard; the refresh affordance hides.
  const providerLive = Boolean(
    collaborationRuntime?.provider &&
      isActiveTransport(collaborationRuntime.state.connectionState),
  );

  // ── History: ydoc-backed when available, session-local otherwise.
  // historyVersion bumps force a re-read after our own writes. ──
  const history = useMemo(() => {
    void historyVersion;
    if (hostYdoc && blockId) return readYHistory(hostYdoc, blockId);
    return localHistory;
  }, [hostYdoc, blockId, historyVersion, localHistory]);

  const recordHistory = useCallback(
    (entry: NoteWindowHistoryEntry) => {
      if (hostYdoc && blockId) {
        writeYHistory(hostYdoc, blockId, pushEntry(readYHistory(hostYdoc, blockId), entry));
        setHistoryVersion((v) => v + 1);
      } else {
        setLocalHistory((prev) => pushEntry(prev, entry));
      }
    },
    [hostYdoc, blockId],
  );

  const clearHistory = useCallback(() => {
    if (hostYdoc && blockId) {
      writeYHistory(hostYdoc, blockId, []);
      setHistoryVersion((v) => v + 1);
    } else {
      setLocalHistory([]);
    }
    setHistoryOpen(false);
  }, [hostYdoc, blockId]);

  // ── Node attr write-back (retarget, label self-heal). ──
  const updateAttrs = useCallback(
    (patch: Partial<NoteWindowAttrs>) => {
      const pos = getPos();
      if (typeof pos !== "number") return;
      editor
        .chain()
        .setNodeSelection(pos)
        .updateAttributes("noteWindow", patch)
        .run();
    },
    [editor, getPos],
  );

  // ── Label self-heal: the attr is a cached copy of the target's title
  // (wikiLink targetTitle convention). When the server disagrees and the
  // host editor is editable, write the fresh title back into the node. ──
  useEffect(() => {
    if (fetchState.phase !== "ready") return;
    const freshTitle = fetchState.target.title;
    if (freshTitle && freshTitle !== targetTitle && hostEditable) {
      updateAttrs({ targetTitle: freshTitle });
    }
  }, [fetchState, targetTitle, hostEditable, updateAttrs]);

  // ── editable-plain save path: the main editor's exact REST contract
  // (MainPanelContent.handleSave, simplified). X-Body-Hash is the
  // optimistic-concurrency precondition — a custom header on purpose;
  // Vercel's edge eats standard If-Match with a 412 before the function
  // runs. On 409 the window NEVER overwrites: banner + refresh is the
  // v1 resolution (no conflict-store port).
  const handlePlainSave = useCallback(
    async (
      json: JSONContent,
      meta?: { userInitiated?: boolean; secondsSinceInput?: number },
    ) => {
      if (!targetContentId) return;
      try {
        const res = await fetch(
          `/api/content/content/${encodeURIComponent(targetContentId)}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              ...(bodyHashRef.current
                ? { "X-Body-Hash": bodyHashRef.current }
                : {}),
            },
            body: JSON.stringify({
              tiptapJson: json,
              ...(meta?.userInitiated === true && { userInitiated: true }),
              ...(typeof meta?.secondsSinceInput === "number" && {
                secondsSinceInput: meta.secondsSinceInput,
              }),
            }),
          },
        );
        if (res.status === 409) {
          setConflict(true);
          return;
        }
        if (res.status === 404 || res.status === 403) {
          // Target vanished mid-session — swap the body for the same
          // placeholder the initial load would show.
          if (fetchKey) {
            setFetchResult({
              key: fetchKey,
              state:
                res.status === 404
                  ? { phase: "not-found" }
                  : { phase: "forbidden" },
            });
          }
          return;
        }
        const result = (await res.json().catch(() => null)) as {
          success?: boolean;
          data?: { note?: { bodyHash?: string } };
        } | null;
        if (!res.ok || !result?.success) return; // stay dirty; next debounce retries
        const freshHash = result.data?.note?.bodyHash;
        if (freshHash) bodyHashRef.current = freshHash;
        setDirty(false);
      } catch {
        // network hiccup — stay dirty; the editor's debounce will retry
      }
    },
    [targetContentId, fetchKey],
  );

  // ── Retarget: the pick path shared by picker + history menu. ──
  const handlePick = useCallback(
    (target: PickerTarget | NoteWindowHistoryEntry) => {
      setPickerOpen(false);
      setHistoryOpen(false);
      if (!hostEditable) return;
      if (target.id === targetContentId) return;
      const hostId = getHostContentId?.();
      if (hostId && target.id === hostId) {
        toast.error("A note can't window itself.");
        return;
      }
      setOptimisticTitle(null);
      updateAttrs({ targetContentId: target.id, targetTitle: target.title });
      recordHistory({ id: target.id, title: target.title, at: Date.now() });
      setExpanded(true);
    },
    [hostEditable, targetContentId, getHostContentId, updateAttrs, recordHistory],
  );

  const openFullPage = useCallback(() => {
    if (!targetContentId) return;
    // PWA note: in a standalone PWA this may open inside the app window —
    // no platform escape hatch exists; best-effort per the plan.
    window.open(
      contentDeepLink(targetContentId),
      "_blank",
      "noopener,noreferrer",
    );
  }, [targetContentId]);

  const refresh = useCallback(() => {
    setConflict(false);
    setDirty(false);
    setRefreshNonce((n) => n + 1);
  }, []);

  const statusValue = gate
    ? "live-elsewhere"
    : windowMode === "snapshot"
      ? "snapshot"
      : "editable";
  const statusLabel = gate
    ? `Live elsewhere${
        presence.displayNames.length > 0
          ? ` · ${presence.displayNames.join(", ")}`
          : ""
      }`
    : windowMode === "snapshot"
      ? "Snapshot"
      : windowMode === "editable-note" && providerLive
        ? "Live"
        : "Editable";

  // Ancestor chain handed to the nested editor: this window's target is
  // now "open above" everything rendered inside it.
  const nestedAncestorIds = useMemo(
    () =>
      targetContentId
        ? [...ancestorTargetIds, targetContentId]
        : ancestorTargetIds,
    [ancestorTargetIds, targetContentId],
  );

  const readyTitle =
    fetchState.phase === "ready" ? fetchState.target.title : null;
  const displayTitle =
    optimisticTitle || readyTitle || targetTitle || "Untitled";

  // ── Header rename: renames the ACTUAL target file. The recipe is
  // MainPanelContent.handleTitleCommit: optimistic + revert, PATCH
  // {title}, check success flag, then broadcast `content-updated` so the
  // sidebar tree and tab strip patch in place without a refetch. ──
  const startRename = useCallback(() => {
    if (!targetContentId) return;
    renameSettledRef.current = false;
    setTitleDraft(displayTitle);
    window.setTimeout(() => titleInputRef.current?.select(), 0);
  }, [targetContentId, displayTitle]);

  const commitRename = useCallback(async () => {
    if (renameSettledRef.current) return;
    renameSettledRef.current = true;
    const raw = titleDraft ?? "";
    setTitleDraft(null);
    const newTitle = raw.trim();
    if (!newTitle || newTitle === displayTitle || !targetContentId) return;
    const previous = optimisticTitle;
    setOptimisticTitle(newTitle);
    try {
      const res = await fetch(
        `/api/content/content/${encodeURIComponent(targetContentId)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle }),
        },
      );
      const result = (await res.json().catch(() => null)) as {
        success?: boolean;
      } | null;
      // The API can return 200 with success:false — check both.
      if (!res.ok || !result?.success) throw new Error("rename failed");
      if (hostEditable) updateAttrs({ targetTitle: newTitle });
      window.dispatchEvent(
        new CustomEvent("content-updated", {
          detail: { contentId: targetContentId, updates: { title: newTitle } },
        }),
      );
    } catch {
      setOptimisticTitle(previous);
      toast.error("Failed to rename");
    }
  }, [titleDraft, displayTitle, targetContentId, optimisticTitle, hostEditable, updateAttrs]);

  const cancelRename = useCallback(() => {
    renameSettledRef.current = true;
    setTitleDraft(null);
  }, []);

  // ── Inert chip: cycle or depth ≥ 3. No fetch, no runtime — just a
  // recognizable reference with an exit to the full page. ──
  if (isChip && targetContentId) {
    return (
      <span className="nw-placeholder">
        <AppWindow className="h-4 w-4 shrink-0" />
        <span className="nw-title">{displayTitle}</span>
        {isCycle ? <span className="text-xs">(already open above)</span> : null}
        <GhostIconButton label="Open full page" onClick={openFullPage}>
          <ExternalLink className="h-3.5 w-3.5" />
        </GhostIconButton>
      </span>
    );
  }

  // ── Unassigned: the picker IS the content. ──
  if (!targetContentId) {
    return (
      <div className="nw-placeholder">
        <AppWindow className="h-4 w-4 shrink-0" />
        <span>Choose a note to window — or create one.</span>
        <GhostIconButton
          label="Choose a note"
          buttonRef={retargetBtnRef}
          onClick={() => hostEditable && setPickerOpen((v) => !v)}
        >
          <FolderSearch className="h-4 w-4" />
        </GhostIconButton>
        {pickerOpen && retargetBtnRef.current ? (
          <NoteWindowPicker
            anchorEl={retargetBtnRef.current}
            hostContentId={getHostContentId?.() ?? null}
            recents={history}
            onPick={handlePick}
            onClose={() => setPickerOpen(false)}
          />
        ) : null}
      </div>
    );
  }

  if (isSelfEmbed) {
    return (
      <div className="nw-placeholder">
        <AppWindow className="h-4 w-4 shrink-0" />
        <span>A note can&apos;t window itself. Pick a different target.</span>
      </div>
    );
  }

  return (
    <div
      // Keystrokes inside the nested editor must not bubble into the
      // host ProseMirror (ExpandableEditor precedent).
      onKeyDown={(e) => e.stopPropagation()}
      data-note-window-block-id={blockId}
    >
      <div className="nw-header" contentEditable={false}>
        <div className="nw-header-left">
          {depth > 0 ? (
            <GhostIconButton
              label={expanded ? "Collapse" : "Expand"}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </GhostIconButton>
          ) : (
            <AppWindow className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
          )}
          {titleDraft !== null ? (
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => void commitRename()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commitRename();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelRename();
                }
              }}
              className="nw-title w-full bg-transparent border-b border-primary focus:outline-none py-1.5 my-0.5 leading-normal"
            />
          ) : (
            <span
              className="nw-title"
              onClick={startRename}
              title="Click to rename the windowed file"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") startRename();
              }}
            >
              {displayTitle}
            </span>
          )}
          <span
            className="nw-status-dot"
            data-status={statusValue}
            title={statusLabel}
          />
        </div>
        <div className="nw-actions">
          {windowMode === "editable-note" ? (
            providerLive ? null : (
              // localOnly editable: content could be stale across devices
              // while slept (bootstrap prefers the local ydoc). "Sync
              // latest" is a one-shot promote against the authoritative
              // server doc — NOT a REST fetch (never setContent a REST
              // snapshot into a ydoc-bound editor).
              <GhostIconButton
                label="Sync latest"
                onClick={() =>
                  void collaborationRuntime?.promote("explicit-live-workflow")
                }
                className="nw-refresh"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </GhostIconButton>
            )
          ) : (
            <GhostIconButton
              label={
                windowMode === "editable-plain" && dirty
                  ? "Unsaved edits — saves in ~2s"
                  : "Refresh from latest saved version"
              }
              disabled={windowMode === "editable-plain" && dirty}
              onClick={refresh}
              className="nw-refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </GhostIconButton>
          )}
          {hostEditable ? (
            <GhostIconButton
              label="Retarget this window"
              buttonRef={retargetBtnRef}
              onClick={() => setPickerOpen((v) => !v)}
            >
              <FolderSearch className="h-3.5 w-3.5" />
            </GhostIconButton>
          ) : null}
          <GhostIconButton
            label="Previously windowed"
            buttonRef={historyBtnRef}
            onClick={() => setHistoryOpen((v) => !v)}
          >
            <History className="h-3.5 w-3.5" />
          </GhostIconButton>
          <GhostIconButton label="Open full page" onClick={openFullPage}>
            <ExternalLink className="h-3.5 w-3.5" />
          </GhostIconButton>
        </div>
      </div>

      {pickerOpen && retargetBtnRef.current ? (
        <NoteWindowPicker
          anchorEl={retargetBtnRef.current}
          hostContentId={getHostContentId?.() ?? null}
          recents={history.filter((h) => h.id !== targetContentId)}
          onPick={handlePick}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
      {historyOpen && historyBtnRef.current ? (
        <HistoryMenu
          anchorEl={historyBtnRef.current}
          entries={history.filter((h) => h.id !== targetContentId)}
          onPick={handlePick}
          onClear={clearHistory}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}

      {expanded ? (
        <div
          className="nw-body"
          style={{ ["--nw-height" as string]: `${height}px` }}
        >
          {fetchState.phase === "loading" || fetchState.phase === "idle" ? (
            <div className="nw-placeholder">Loading…</div>
          ) : fetchState.phase === "not-found" ? (
            <div className="nw-placeholder">
              Target was deleted. Retarget the window to another note.
            </div>
          ) : fetchState.phase === "forbidden" ? (
            <div className="nw-placeholder">
              You no longer have access to this note.
            </div>
          ) : fetchState.phase === "error" ? (
            <div className="nw-placeholder">
              {fetchState.message}{" "}
              <GhostIconButton label="Retry" onClick={refresh}>
                <RefreshCw className="h-3.5 w-3.5" />
              </GhostIconButton>
            </div>
          ) : (
            <>
              {gate ? (
                <div className="nw-banner">
                  Live elsewhere — read-only snapshot
                  {presence.displayNames.length > 0
                    ? ` · ${presence.displayNames.join(", ")}`
                    : ""}
                </div>
              ) : null}
              {conflict ? (
                <div className="nw-banner" data-tone="warning">
                  Changed elsewhere — Refresh to load the latest version.{" "}
                  <button
                    type="button"
                    onClick={refresh}
                    className="underline underline-offset-2"
                  >
                    Refresh
                  </button>
                </div>
              ) : null}
              {windowMode === "editable-note" ? (
                <MarkdownEditor
                  key={`${targetContentId}:editable-note`}
                  contentId={targetContentId}
                  content={fetchState.target.tiptapJson ?? EMPTY_DOC}
                  editable
                  collaborationEnabled
                  collaborationRuntime={collaborationRuntime}
                  onSave={handlePlainSave}
                  onChange={() => setDirty(true)}
                  compact
                  placeholder="This note is empty."
                  noteWindowDepth={depth + 1}
                  noteWindowAncestorTargetIds={nestedAncestorIds}
                />
              ) : windowMode === "editable-plain" ? (
                <MarkdownEditor
                  key={`${targetContentId}:editable-plain:${refreshNonce}`}
                  contentId={targetContentId}
                  content={fetchState.target.tiptapJson ?? EMPTY_DOC}
                  editable={!conflict}
                  collaborationEnabled={false}
                  onSave={handlePlainSave}
                  onChange={() => setDirty(true)}
                  compact
                  placeholder="Start writing — notes are created on first edit."
                  noteWindowDepth={depth + 1}
                  noteWindowAncestorTargetIds={nestedAncestorIds}
                />
              ) : (
                <MarkdownEditor
                  key={`${targetContentId}:snapshot:${refreshNonce}`}
                  contentId={targetContentId}
                  content={fetchState.target.tiptapJson ?? EMPTY_DOC}
                  editable={false}
                  collaborationEnabled={false}
                  compact
                  placeholder="This note is empty."
                  noteWindowDepth={depth + 1}
                  noteWindowAncestorTargetIds={nestedAncestorIds}
                />
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
