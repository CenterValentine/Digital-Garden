"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import type { FlashcardDeckRecordDto } from "@/lib/domain/flashcards";

// ─── Tree model ──────────────────────────────────────────────────

export interface DeckTreeNode {
  deck: FlashcardDeckRecordDto;
  children: DeckTreeNode[];
  /** Cards in this deck PLUS every descendant — what "Play" will run. */
  subtreeCardCount: number;
}

/**
 * Build a nested tree from the flat `parentDeckId` list returned by
 * GET /api/flashcards/decks/tree.
 *
 * The endpoint already orders rows by `path` asc then `displayOrder`, so
 * preserving insertion order within each parent gives a stable,
 * path-sorted tree without a second sort here. A node whose parent is
 * missing (deleted out from under it) is promoted to a root so it never
 * silently disappears.
 *
 * subtreeCardCount is summed bottom-up so a parent "skill" advertises how
 * many cards a Play on it would pull — the per-deck `cardCount` from the
 * API is only the cards filed directly on that node.
 */
export function buildDeckTree(
  decks: FlashcardDeckRecordDto[],
): DeckTreeNode[] {
  const byId = new Map<string, DeckTreeNode>();
  for (const deck of decks) {
    byId.set(deck.id, {
      deck,
      children: [],
      subtreeCardCount: deck.cardCount ?? 0,
    });
  }

  const roots: DeckTreeNode[] = [];
  for (const node of byId.values()) {
    const parentId = node.deck.parentDeckId;
    const parent = parentId ? byId.get(parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  // Roll subtree totals up from the leaves. Walk deepest-first by sorting
  // on path length descending so a child is always summed before its
  // parent reads it.
  const nodesDeepestFirst = [...byId.values()].sort(
    (a, b) => b.deck.path.length - a.deck.path.length,
  );
  for (const node of nodesDeepestFirst) {
    const parentId = node.deck.parentDeckId;
    const parent = parentId ? byId.get(parentId) : undefined;
    if (parent) parent.subtreeCardCount += node.subtreeCardCount;
  }

  return roots;
}

// ─── Persistence ─────────────────────────────────────────────────

const EXPANDED_STORAGE_KEY = "flashcards:deck-tree-expanded";

function loadExpanded(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(EXPANDED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? new Set(parsed.filter((v): v is string => typeof v === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

// ─── Context menu ─────────────────────────────────────────────────

interface ContextMenuState {
  deck: FlashcardDeckRecordDto;
  x: number;
  y: number;
}

// ─── Component ───────────────────────────────────────────────────

interface FlashcardDeckTreeProps {
  decks: FlashcardDeckRecordDto[];
  loading: boolean;
  selectedDeckId: string | null;
  playingDeckId: string | null;
  onSelect: (deck: FlashcardDeckRecordDto) => void;
  onPlay: (deck: FlashcardDeckRecordDto) => void;
  onRename: (deck: FlashcardDeckRecordDto) => void;
  onDelete: (deck: FlashcardDeckRecordDto) => void;
  onQuickAdd?: (deckPath: string) => void;
  /**
   * Render prop called for the selected deck's node, giving the panel
   * control over what inline content appears beneath it. Receives the
   * deck and the indentation depth (one level deeper than the deck row)
   * so card rows can line up with the tree.
   */
  renderInlineCards?: (
    deck: FlashcardDeckRecordDto,
    depth: number,
  ) => React.ReactNode;
}

export function FlashcardDeckTree({
  decks,
  loading,
  selectedDeckId,
  playingDeckId,
  onSelect,
  onPlay,
  onRename,
  onDelete,
  onQuickAdd,
  renderInlineCards,
}: FlashcardDeckTreeProps) {
  const tree = useMemo(() => buildDeckTree(decks), [decks]);
  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback((id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          EXPANDED_STORAGE_KEY,
          JSON.stringify([...next]),
        );
      }
      return next;
    });
  }, []);

  // Auto-expand a deck when it is selected so its cards appear immediately
  // without requiring a second click. The user can still collapse afterward.
  const handleSelect = useCallback(
    (deck: FlashcardDeckRecordDto) => {
      setExpanded((current) => {
        if (current.has(deck.id)) return current;
        const next = new Set(current);
        next.add(deck.id);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            EXPANDED_STORAGE_KEY,
            JSON.stringify([...next]),
          );
        }
        return next;
      });
      onSelect(deck);
    },
    [onSelect],
  );

  const openContextMenu = useCallback(
    (deck: FlashcardDeckRecordDto, x: number, y: number) => {
      setContextMenu({ deck, x, y });
    },
    [],
  );

  // Close context menu when clicking anywhere outside it.
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenu]);

  if (loading && decks.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-3 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading skills…
      </div>
    );
  }

  if (decks.length === 0) {
    return (
      <p className="rounded-md border border-black/10 dark:border-white/10 px-3 py-2 text-sm text-gray-500">
        No skills yet. Add a card to create one.
      </p>
    );
  }

  const cm = contextMenu;

  return (
    <>
      <div role="tree" className="space-y-0.5">
        {tree.map((node) => (
          <DeckTreeRow
            key={node.deck.id}
            node={node}
            depth={0}
            expanded={expanded}
            selectedDeckId={selectedDeckId}
            playingDeckId={playingDeckId}
            onToggle={toggle}
            onSelect={handleSelect}
            onPlay={onPlay}
            onRename={onRename}
            onDelete={onDelete}
            onOpenContextMenu={openContextMenu}
            renderInlineCards={renderInlineCards}
          />
        ))}
      </div>

      {/* Context menu — fixed-positioned to escape scroll containers. */}
      {cm && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[160px] overflow-hidden rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-[#1e2d3a] py-1 shadow-xl"
          style={{ left: cm.x, top: cm.y }}
        >
          <button
            type="button"
            onClick={() => {
              onQuickAdd?.(cm.deck.path);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
          >
            <Plus className="h-4 w-4 text-gold-primary" />
            Add card here
          </button>
          <div className="my-1 border-t border-black/10 dark:border-white/10" />
          <button
            type="button"
            onClick={() => {
              onPlay(cm.deck);
              setContextMenu(null);
            }}
            disabled={(cm.deck.cardCount ?? 0) === 0}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play className="h-4 w-4" />
            Play
          </button>
          <button
            type="button"
            onClick={() => {
              onRename(cm.deck);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
          >
            <Pencil className="h-4 w-4" />
            Rename
          </button>
          <button
            type="button"
            onClick={() => {
              onDelete(cm.deck);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-500 hover:bg-red-500/10"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      )}
    </>
  );
}

// ─── Row ─────────────────────────────────────────────────────────

interface DeckTreeRowProps {
  node: DeckTreeNode;
  depth: number;
  expanded: Set<string>;
  selectedDeckId: string | null;
  playingDeckId: string | null;
  onToggle: (id: string) => void;
  onSelect: (deck: FlashcardDeckRecordDto) => void;
  onPlay: (deck: FlashcardDeckRecordDto) => void;
  onRename: (deck: FlashcardDeckRecordDto) => void;
  onDelete: (deck: FlashcardDeckRecordDto) => void;
  onOpenContextMenu: (
    deck: FlashcardDeckRecordDto,
    x: number,
    y: number,
  ) => void;
  renderInlineCards?: (
    deck: FlashcardDeckRecordDto,
    depth: number,
  ) => React.ReactNode;
}

function DeckTreeRow({
  node,
  depth,
  expanded,
  selectedDeckId,
  playingDeckId,
  onToggle,
  onSelect,
  onPlay,
  onRename,
  onDelete,
  onOpenContextMenu,
  renderInlineCards,
}: DeckTreeRowProps) {
  const { deck, children, subtreeCardCount } = node;
  const hasChildren = children.length > 0;
  const hasCards = (deck.cardCount ?? 0) > 0;
  const isOpen = expanded.has(deck.id);
  const isSelected = selectedDeckId === deck.id;
  const isPlaying = playingDeckId === deck.id;
  const canPlay = subtreeCardCount > 0;
  // Show a chevron whenever the node is expandable: has sub-skills OR has own
  // cards (regardless of selection state, so it's visible on initial load).
  const showChevron = hasChildren || hasCards;

  return (
    <>
      <div
        role="treeitem"
        aria-expanded={hasChildren ? isOpen : undefined}
        aria-selected={isSelected}
        className={`group flex items-center gap-1 rounded-md pr-1 transition-colors ${
          isSelected
            ? "bg-gold-primary/10 text-gold-primary"
            : "text-gray-800 dark:text-gray-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
        }`}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
        onContextMenu={(e) => {
          e.preventDefault();
          onOpenContextMenu(deck, e.clientX, e.clientY);
        }}
      >
        {/* Twisty — always visible when the node has sub-skills or own cards.
            For nodes with sub-skills: click toggles expand/collapse only.
            For leaf nodes with cards: click selects (which auto-expands). */}
        <button
          type="button"
          onClick={() => {
            if (!showChevron) return;
            if (isSelected || hasChildren) {
              // Already selected or has sub-skills: chevron collapses/expands.
              onToggle(deck.id);
            } else {
              // Unselected leaf with cards: chevron click selects (auto-expands).
              onSelect(deck);
            }
          }}
          tabIndex={showChevron ? 0 : -1}
          className={`flex h-7 w-5 shrink-0 items-center justify-center rounded ${
            showChevron
              ? "text-gray-500 dark:text-gray-400 hover:text-gold-primary"
              : "cursor-default opacity-0"
          }`}
          aria-label={isOpen ? "Collapse" : "Expand"}
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {/* Label — selects/filters the Cards list below. */}
        <button
          type="button"
          onClick={() => onSelect(deck)}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
          title={deck.path}
        >
          <span className="truncate text-sm font-semibold">{deck.name}</span>
          {subtreeCardCount > 0 ? (
            <span className="shrink-0 rounded bg-black/[0.05] dark:bg-white/10 px-1.5 py-0.5 text-[11px] text-gray-700 dark:text-gray-300">
              {subtreeCardCount}
            </span>
          ) : null}
        </button>

        {/* Row actions — always visible on touch, hover-revealed on desktop. */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          <button
            type="button"
            onClick={() => onPlay(deck)}
            disabled={!canPlay || isPlaying}
            className="flex h-7 w-7 items-center justify-center rounded text-gray-600 dark:text-gray-300 hover:bg-gold-primary/10 hover:text-gold-primary disabled:cursor-not-allowed disabled:opacity-30"
            title={
              canPlay
                ? hasChildren
                  ? "Play this skill and everything under it"
                  : "Play this deck"
                : "No cards to play"
            }
            aria-label="Play deck"
          >
            {isPlaying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={() => onRename(deck)}
            className="flex h-7 w-7 items-center justify-center rounded text-gray-600 dark:text-gray-300 hover:bg-black/[0.05] dark:hover:bg-white/10 hover:text-gold-primary"
            title="Rename skill"
            aria-label="Rename deck"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(deck)}
            className="flex h-7 w-7 items-center justify-center rounded text-gray-600 dark:text-gray-300 hover:bg-red-500/10 hover:text-red-500"
            title="Delete skill"
            aria-label="Delete deck"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Sub-skills (only when expanded). */}
      {hasChildren && isOpen
        ? children.map((child) => (
            <DeckTreeRow
              key={child.deck.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedDeckId={selectedDeckId}
              playingDeckId={playingDeckId}
              onToggle={onToggle}
              onSelect={onSelect}
              onPlay={onPlay}
              onRename={onRename}
              onDelete={onDelete}
              onOpenContextMenu={onOpenContextMenu}
              renderInlineCards={renderInlineCards}
            />
          ))
        : null}

      {/* Inline cards — shown for any expanded deck with own cards.
          The render prop filters to card.deckId === deck.id client-side. */}
      {isOpen && (hasCards || isSelected) ? renderInlineCards?.(deck, depth + 1) : null}
    </>
  );
}
