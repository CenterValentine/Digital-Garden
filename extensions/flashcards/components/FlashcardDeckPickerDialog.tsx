"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, Layers, Plus, X } from "lucide-react";
import type { FlashcardDeckRecordDto } from "@/lib/domain/flashcards";

// Controlled dialog (Epoch 19, Sprint 5). Renders a portal-mounted
// modal with a tree of the user's decks + an inline "Create new deck"
// form. Used by the editor block's no-deck state to close the loop
// from `/flashcards` insertion → working embed.

interface FlashcardDeckPickerDialogProps {
  open: boolean;
  // Pre-selected parent for the "Create new" form. Optional; defaults
  // to no parent (root deck).
  defaultParentDeckId?: string | null;
  onClose: () => void;
  onSelect: (deckId: string) => void;
}

interface DeckNode extends FlashcardDeckRecordDto {
  children: DeckNode[];
}

// Build a tree from the flat deck list returned by /decks/tree.
// Decks are pre-ordered by `path` ASC, so the second pass to attach
// children doesn't need a separate sort.
function buildTree(flat: FlashcardDeckRecordDto[]): DeckNode[] {
  const byId = new Map<string, DeckNode>();
  for (const d of flat) byId.set(d.id, { ...d, children: [] });
  const roots: DeckNode[] = [];
  for (const node of byId.values()) {
    if (node.parentDeckId && byId.has(node.parentDeckId)) {
      byId.get(node.parentDeckId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export function FlashcardDeckPickerDialog({
  open,
  defaultParentDeckId = null,
  onClose,
  onSelect,
}: FlashcardDeckPickerDialogProps) {
  const [decks, setDecks] = useState<FlashcardDeckRecordDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set of deck ids that are expanded in the tree view. Defaults to
  // expanded for roots so the user can see something immediately.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Inline create-new form state.
  const [creatingName, setCreatingName] = useState("");
  const [creatingParentId, setCreatingParentId] = useState<string | null>(
    defaultParentDeckId,
  );
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  // Search filter.
  const [query, setQuery] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/flashcards/decks/tree", {
        credentials: "include",
      });
      const raw = (await response.json()) as Record<string, unknown>;
      if (raw?.success === true && Array.isArray(raw.data)) {
        const list = raw.data as FlashcardDeckRecordDto[];
        setDecks(list);
        // Auto-expand all roots so first paint isn't empty-looking.
        setExpanded(new Set(list.filter((d) => !d.parentDeckId).map((d) => d.id)));
      } else {
        setError(
          ((raw?.error as { message?: string } | undefined)?.message) ??
            "Failed to load decks.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load decks.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCreatingName("");
      setCreatingParentId(defaultParentDeckId);
      setCreateError(null);
      void refresh();
    }
  }, [open, defaultParentDeckId, refresh]);

  // Keyboard: Esc closes. We attach once when open so the listener
  // doesn't leak when the dialog is unmounted.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const tree = useMemo(() => buildTree(decks), [decks]);

  // Filter the tree by query. Match on name OR path so a user can
  // type "spanish/verbs" to jump straight to a leaf. When filtering,
  // we flatten matching results so they're not buried behind collapsed
  // parents.
  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return null;
    return decks.filter((d) => {
      const hay = `${d.name} ${d.path}`.toLowerCase();
      return hay.includes(trimmed);
    });
  }, [decks, query]);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelect = useCallback(
    (deckId: string) => {
      onSelect(deckId);
      onClose();
    },
    [onClose, onSelect],
  );

  const handleCreate = useCallback(async () => {
    const name = creatingName.trim();
    if (!name) {
      setCreateError("Name is required.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const response = await fetch("/api/flashcards/decks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          parentDeckId: creatingParentId,
        }),
      });
      const raw = (await response.json()) as Record<string, unknown>;
      if (raw?.success === true) {
        const created = raw.data as FlashcardDeckRecordDto;
        // Pick the new deck immediately — saves the user a second
        // click. Matches the Anki "create + use" flow.
        handleSelect(created.id);
      } else {
        const message =
          ((raw?.error as { message?: string } | undefined)?.message) ??
          "Failed to create deck.";
        setCreateError(message);
      }
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create deck.",
      );
    } finally {
      setCreating(false);
    }
  }, [creatingName, creatingParentId, handleSelect]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-[#1a2530] text-gray-900 dark:text-white shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-black/10 dark:border-white/10 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Pick a flashcard deck</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Choose an existing deck or create a new one.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-md text-gray-600 dark:text-gray-400 hover:bg-black/[0.05] dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="shrink-0 border-b border-black/10 dark:border-white/10 px-4 py-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search decks…"
            className="w-full rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-[#0f1620] px-3 py-1.5 text-sm outline-none focus:border-gold-primary"
            autoFocus
          />
        </div>

        {/* Deck list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading && (
            <p className="px-2 py-4 text-center text-sm text-gray-500">Loading…</p>
          )}
          {!loading && error && (
            <p className="px-2 py-4 text-center text-sm text-red-600 dark:text-red-300">
              {error}
            </p>
          )}
          {!loading && !error && decks.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-gray-500">
              You don&apos;t have any decks yet. Create your first one below.
            </p>
          )}
          {!loading && !error && filtered ? (
            // Flat filtered list — no nesting when search is active.
            <ul>
              {filtered.length === 0 && (
                <li className="px-2 py-2 text-sm text-gray-500">
                  No decks match &ldquo;{query}&rdquo;.
                </li>
              )}
              {filtered.map((deck) => (
                <li key={deck.id}>
                  <DeckRow
                    deck={deck}
                    indent={0}
                    expanded={false}
                    hasChildren={false}
                    onSelect={handleSelect}
                    onToggle={() => {}}
                    showPath
                  />
                </li>
              ))}
            </ul>
          ) : (
            <ul>
              {tree.map((node) => (
                <DeckTreeNode
                  key={node.id}
                  node={node}
                  indent={0}
                  expanded={expanded}
                  onSelect={handleSelect}
                  onToggle={toggleExpand}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Create new */}
        <div className="shrink-0 border-t border-black/10 dark:border-white/10 px-4 py-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            New deck
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="text"
              value={creatingName}
              onChange={(e) => setCreatingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
              placeholder="Deck name (e.g. Spanish Verbs)"
              className="flex-1 rounded-md border border-black/10 dark:border-white/10 bg-white dark:bg-[#0f1620] px-3 py-1.5 text-sm outline-none focus:border-gold-primary"
              disabled={creating}
            />
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating || !creatingName.trim()}
              className="inline-flex items-center gap-1 rounded-md border border-gold-primary bg-gold-primary px-3 py-1.5 text-sm font-medium text-black hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              Create
            </button>
          </div>
          {creatingParentId && (
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
              Will be created under deck{" "}
              <span className="font-mono">
                {decks.find((d) => d.id === creatingParentId)?.name ?? creatingParentId}
              </span>{" "}
              ·{" "}
              <button
                type="button"
                onClick={() => setCreatingParentId(null)}
                className="underline hover:text-gold-primary"
              >
                make it a root
              </button>
            </p>
          )}
          {createError && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-300">
              {createError}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Tree row helpers ──────────────────────────────────────────────

function DeckTreeNode({
  node,
  indent,
  expanded,
  onSelect,
  onToggle,
}: {
  node: DeckNode;
  indent: number;
  expanded: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const isOpen = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  return (
    <li>
      <DeckRow
        deck={node}
        indent={indent}
        expanded={isOpen}
        hasChildren={hasChildren}
        onSelect={onSelect}
        onToggle={onToggle}
      />
      {isOpen && hasChildren && (
        <ul>
          {node.children.map((child) => (
            <DeckTreeNode
              key={child.id}
              node={child}
              indent={indent + 1}
              expanded={expanded}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function DeckRow({
  deck,
  indent,
  expanded,
  hasChildren,
  onSelect,
  onToggle,
  showPath = false,
}: {
  deck: FlashcardDeckRecordDto;
  indent: number;
  expanded: boolean;
  hasChildren: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  showPath?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
      style={{ paddingLeft: 8 + indent * 16 }}
    >
      {hasChildren ? (
        <button
          type="button"
          onClick={() => onToggle(deck.id)}
          aria-label={expanded ? "Collapse" : "Expand"}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-black/[0.05] dark:hover:bg-white/10"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>
      ) : (
        <span className="h-5 w-5 shrink-0" />
      )}
      <Layers className="h-3.5 w-3.5 shrink-0 text-gold-primary opacity-80" />
      <button
        type="button"
        onClick={() => onSelect(deck.id)}
        className="flex flex-1 items-center justify-between gap-2 text-left text-sm"
      >
        <span className="truncate">
          {deck.name}
          {showPath && deck.path !== deck.name && (
            <span className="ml-1 text-[11px] text-gray-500">· {deck.path}</span>
          )}
        </span>
        <span className="shrink-0 text-[11px] text-gray-500">
          {deck.cardCount ?? 0}
          {(deck.dueCount ?? 0) > 0 && (
            <span className="ml-1 text-emerald-600 dark:text-emerald-300">
              · {deck.dueCount} due
            </span>
          )}
        </span>
      </button>
    </div>
  );
}
