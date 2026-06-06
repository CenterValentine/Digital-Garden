"use client";

/**
 * FlashcardCardProposalList — Session 2 interactive list.
 *
 * Renders a __cardProposal payload from the propose_cards AI tool.
 *
 * Per-card state:
 *   - Checkbox (default checked) — controls whether the card is in the
 *     batch when "Add selected" fires.
 *   - Front + Back are AdaptiveFlashcardEditor in "plain" mode so the
 *     user can tweak the AI's wording before commit. Plain mode
 *     restricts to Document/Paragraph/Text — single-paragraph editing,
 *     which fits the flashcard front/back shape.
 *   - Status: idle | creating | created | error (per row).
 *
 * Commit flow ("Add selected"):
 *   - Loops POST /api/flashcards for each checked + non-created card.
 *   - On 201: marks the row as created (✓), stays in the list as a
 *     visual receipt rather than disappearing — the user can see what
 *     was actually saved.
 *   - On failure: marks the row as error with the message inline; the
 *     row stays in the list so the user can edit + retry.
 *   - Disabled when deckExists is false (deck must be created first
 *     via the DeckProposalCard above) or when no rows are checked.
 *
 * "Ask for next batch" link (only when requestedCount > batchLimit):
 *   - Dispatches a CustomEvent("flashcard-request-next-batch") on the
 *     window with { deckPath, sourceContentId, alreadyProposed }. The
 *     chat panel listens and sends a synthetic message asking the model
 *     to propose the next batch. This is the ONE deliberate model-loop-
 *     back in the design — natural conversational flow for pagination.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import {
  BookOpen,
  Check,
  Loader2,
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronRight as ChevronRightIcon,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  createTextTiptapDoc,
  extractPlainTextFromTiptap,
} from "@/lib/domain/flashcards";
import { AdaptiveFlashcardEditor } from "@/extensions/flashcards/components/AdaptiveFlashcardEditor";

/**
 * Stage 3 payload — propose_deck_with_cards. Deck info is embedded so
 * the commit step is self-sufficient: when `deck.deckExists` is false
 * the client creates the deck (using deck.name + deck.parentDeckId)
 * before posting the cards. When the parent itself hasn't been
 * created yet either (deck.parentResolved === false), the card waits
 * for a sibling propose_deck card to fire `flashcard-deck-created`
 * with the matching parent path before "Add selected" enables.
 */
interface DeckWithCardsProposalPayload {
  __deckWithCardsProposal: true;
  deck: {
    name: string;
    proposedPath: string;
    parentDeckPath: string | null;
    parentDeckId: string | null;
    parentResolved: boolean;
    rationale: string | null;
    similarExistingPaths: string[];
    deckExists: boolean;
    deckId: string | null;
    existingName: string | null;
  };
  cards: Array<{
    front: string;
    back: string;
    frontLabel?: string;
    backLabel?: string;
  }>;
  requestedCount: number;
  batchLimit: number;
  sourceContentId: string | null;
}

/**
 * Per-proposal localStorage of "already-added card indices" so the
 * commit state survives chat reloads. Without this the row state
 * (which lives in component state) resets to idle on remount, the
 * "Add selected" button re-enables, and the user can re-submit the
 * same batch — duplicating cards in the deck.
 *
 * Key shape: flashcards:proposal-added:<proposalId>. proposalId is
 * threaded from ChatMessage as <messageId>-cards-<proposalIndex>,
 * which is stable across reloads (messages are persisted with their
 * AI SDK ids via the Conversation entity).
 */
const ADDED_STORAGE_PREFIX = "flashcards:proposal-added:";

function loadAddedIndices(proposalId: string | undefined): Set<number> {
  if (!proposalId || typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(ADDED_STORAGE_PREFIX + proposalId);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((n): n is number => typeof n === "number"));
  } catch {
    return new Set();
  }
}

function saveAddedIndices(
  proposalId: string | undefined,
  indices: Set<number>,
): void {
  if (!proposalId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      ADDED_STORAGE_PREFIX + proposalId,
      JSON.stringify(Array.from(indices)),
    );
  } catch {
    /* quota exceeded or storage disabled — silent fail, the in-memory state
       still works for the rest of this session */
  }
}

type RowStatus =
  | { status: "idle" }
  | { status: "creating" }
  | { status: "created" }
  | { status: "error"; message: string };

interface RowState {
  checked: boolean;
  /**
   * Whether the row is expanded into its TipTap editors. Default false —
   * the compact view (front → back as plain text on one line) gives a
   * scannable bullet list. Click the row's text area to expand for
   * inline editing. Rows automatically expand when their status flips
   * to "error" so the user sees what failed without an extra click.
   */
  expanded: boolean;
  frontContent: JSONContent;
  backContent: JSONContent;
  frontLabel: string;
  backLabel: string;
  status: RowStatus;
}

export function FlashcardCardProposalList({
  payload,
  proposalId,
}: {
  payload: DeckWithCardsProposalPayload;
  /**
   * Stable id used to persist commit state across chat reloads. When
   * provided, indices of successfully-added cards are written to
   * localStorage; on remount the rows whose indices are persisted come
   * back as `status: "created"` (checkbox disabled, button respects
   * allDone). Without this, "Add selected" re-enables on reload and the
   * user can duplicate the batch.
   */
  proposalId?: string;
}) {
  // Initialize per-row state from the payload AND from any persisted
  // commit state. Plain-text front/back are converted to single-
  // paragraph TipTap docs via createTextTiptapDoc (client-safe helper
  // from the flashcards domain).
  const initialRows = useMemo<RowState[]>(() => {
    const added = loadAddedIndices(proposalId);
    return payload.cards.map((card, idx) => {
      const wasAdded = added.has(idx);
      return {
        // Already-added cards default unchecked: the user can't re-add
        // them (status is created), and showing them unchecked makes
        // the "X of Y selected" counter accurate.
        checked: !wasAdded,
        expanded: false,
        frontContent: createTextTiptapDoc(card.front),
        backContent: createTextTiptapDoc(card.back),
        frontLabel: card.frontLabel ?? "Question",
        backLabel: card.backLabel ?? "Answer",
        status: (wasAdded
          ? { status: "created" }
          : { status: "idle" }) as RowStatus,
      };
    });
  }, [payload.cards, proposalId]);
  const [rows, setRows] = useState<RowState[]>(initialRows);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  // Local mirrors of the embedded deck state. Three things track:
  //   - deckExistsLocal / deckIdLocal: does the leaf deck exist? If
  //     no, the commit step creates it before posting cards. Updated
  //     when a sibling propose_deck card with the matching leaf path
  //     fires `flashcard-deck-created` (rare since we absorbed leaf
  //     proposals, but still possible if the model called both).
  //   - parentDeckIdLocal / parentResolvedLocal: when the parent
  //     itself hasn't been created yet, the commit step can't run
  //     (creating the leaf would land at root instead of under the
  //     intended parent). Updated when a sibling propose_deck card
  //     with the matching parent path fires `flashcard-deck-created`.
  const [deckExistsLocal, setDeckExistsLocal] = useState(payload.deck.deckExists);
  const [deckIdLocal, setDeckIdLocal] = useState<string | null>(
    payload.deck.deckId,
  );
  const [parentDeckIdLocal, setParentDeckIdLocal] = useState<string | null>(
    payload.deck.parentDeckId,
  );
  const [parentResolvedLocal, setParentResolvedLocal] = useState(
    payload.deck.parentResolved,
  );

  useEffect(() => {
    function handleDeckCreated(e: Event) {
      const detail = (e as CustomEvent).detail as
        | { deckPath?: string; deckId?: string | null }
        | undefined;
      if (!detail || !detail.deckPath) return;
      // Did the sibling create the leaf path we're targeting?
      if (detail.deckPath === payload.deck.proposedPath) {
        setDeckExistsLocal(true);
        if (detail.deckId) setDeckIdLocal(detail.deckId);
        return;
      }
      // Or did it create our parent?
      if (
        payload.deck.parentDeckPath &&
        detail.deckPath === payload.deck.parentDeckPath
      ) {
        if (detail.deckId) {
          setParentDeckIdLocal(detail.deckId);
          setParentResolvedLocal(true);
        }
      }
    }
    window.addEventListener("flashcard-deck-created", handleDeckCreated);
    return () =>
      window.removeEventListener("flashcard-deck-created", handleDeckCreated);
  }, [payload.deck.proposedPath, payload.deck.parentDeckPath]);

  const updateRow = useCallback(
    (index: number, patch: Partial<RowState>) => {
      setRows((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], ...patch };
        return next;
      });
    },
    [],
  );

  const proposedCount = rows.length;
  const checkedCount = rows.filter(
    (r) => r.checked && r.status.status !== "created",
  ).length;
  const createdCount = rows.filter((r) => r.status.status === "created").length;
  const showTruncationHint =
    payload.requestedCount > payload.batchLimit && createdCount < proposedCount;

  const headerLine =
    payload.requestedCount > proposedCount
      ? `Proposed ${proposedCount} of ${payload.requestedCount} requested cards (limit: ${payload.batchLimit} per batch)`
      : `Proposed ${proposedCount} cards (limit: ${payload.batchLimit} per batch)`;

  // Three deck-state cases:
  //   1. exists → use deckIdLocal directly
  //   2. doesn't exist, parent resolved → create-then-add
  //   3. doesn't exist, parent unresolved → blocked (waiting for parent)
  const deckLabel = deckExistsLocal
    ? payload.deck.proposedPath
    : parentResolvedLocal
      ? `${payload.deck.proposedPath} (will be created)`
      : `${payload.deck.proposedPath} (create parent "${payload.deck.parentDeckPath}" first)`;

  const handleSubmitSelected = useCallback(async () => {
    setBulkSubmitting(true);
    let successCount = 0;
    let failureCount = 0;
    // Track successful indices in this batch so we can persist them
    // alongside any previously-persisted indices once the loop ends.
    const successfulIndices: number[] = [];

    // ─── Phase 1: ensure the target deck exists ───
    // If the embedded deck is new, create it before posting cards. This
    // is the "cascading absorb" of Stage 3 — what used to be a sibling
    // propose_deck card is now a phase of the same commit.
    let targetDeckId = deckIdLocal;
    if (!deckExistsLocal) {
      if (!parentResolvedLocal) {
        toast.error(
          `Create the parent deck "${payload.deck.parentDeckPath}" above first.`,
        );
        setBulkSubmitting(false);
        return;
      }
      try {
        const res = await fetch("/api/flashcards/decks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: payload.deck.name,
            parentDeckId: parentDeckIdLocal ?? undefined,
          }),
        });
        const json = (await res.json().catch(() => null)) as
          | { success: boolean; data?: { id?: string; path?: string }; error?: { message?: string } }
          | null;
        if (!res.ok || !json?.success || !json.data?.id) {
          toast.error(
            json?.error?.message ?? `Failed to create deck (${res.status})`,
          );
          setBulkSubmitting(false);
          return;
        }
        targetDeckId = json.data.id;
        setDeckIdLocal(targetDeckId);
        setDeckExistsLocal(true);
        // Notify siblings (and anything else listening) so future card
        // proposals targeting this same path can adopt the new id.
        window.dispatchEvent(
          new CustomEvent("flashcard-deck-created", {
            detail: {
              deckPath: json.data.path ?? payload.deck.proposedPath,
              deckId: targetDeckId,
            },
          }),
        );
        toast.success(`Created deck "${payload.deck.name}"`);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Network error creating deck",
        );
        setBulkSubmitting(false);
        return;
      }
    }

    // ─── Phase 2: POST each selected card ───
    if (!targetDeckId) {
      // Shouldn't happen given the branch above, but be defensive.
      setBulkSubmitting(false);
      return;
    }

    // Snapshot the indexes we're submitting so async writes don't race
    // with state changes the user might make mid-flight.
    const indexesToSubmit = rows
      .map((r, i) => (r.checked && r.status.status !== "created" ? i : -1))
      .filter((i) => i >= 0);

    for (const i of indexesToSubmit) {
      updateRow(i, { status: { status: "creating" } });
      try {
        const row = rows[i];
        const res = await fetch("/api/flashcards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deckId: targetDeckId,
            frontContent: row.frontContent,
            backContent: row.backContent,
            frontLabel: row.frontLabel,
            backLabel: row.backLabel,
            isFrontRichText: false,
            sourceContentId: payload.sourceContentId ?? undefined,
          }),
        });
        const json = (await res.json().catch(() => null)) as
          | { success: boolean; error?: { message?: string } }
          | null;

        if (!res.ok || !json?.success) {
          const message =
            json?.error?.message ?? `Failed (${res.status})`;
          updateRow(i, {
            status: { status: "error", message },
            expanded: true,
          });
          failureCount++;
          continue;
        }
        updateRow(i, { status: { status: "created" } });
        successfulIndices.push(i);
        successCount++;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Network error";
        updateRow(i, {
          status: { status: "error", message },
          expanded: true,
        });
        failureCount++;
      }
    }

    // Persist the newly-created indices alongside any that were already
    // saved (e.g. from a previous partial-success submit). Survives a
    // chat reload — the next mount reads these and starts those rows
    // as `status: "created"` so "Add selected" stays disabled.
    if (successfulIndices.length > 0) {
      const existing = loadAddedIndices(proposalId);
      for (const idx of successfulIndices) existing.add(idx);
      saveAddedIndices(proposalId, existing);
    }

    setBulkSubmitting(false);
    if (successCount > 0) {
      toast.success(
        `Added ${successCount} card${successCount === 1 ? "" : "s"} to ${payload.deck.proposedPath}`,
      );
    }
    if (failureCount > 0) {
      toast.error(
        `${failureCount} card${failureCount === 1 ? "" : "s"} failed — see inline errors`,
      );
    }
  }, [
    deckIdLocal,
    deckExistsLocal,
    parentResolvedLocal,
    parentDeckIdLocal,
    payload,
    rows,
    updateRow,
    proposalId,
  ]);

  const handleAskForNextBatch = useCallback(() => {
    const alreadyProposed = rows
      .filter((r) => r.status.status === "created")
      .map((r, i) => `${i + 1}`);
    window.dispatchEvent(
      new CustomEvent("flashcard-request-next-batch", {
        detail: {
          deckPath: payload.deck.proposedPath,
          deckId: deckIdLocal,
          sourceContentId: payload.sourceContentId,
          alreadyProposedCount: alreadyProposed.length,
          totalRequested: payload.requestedCount,
          batchLimit: payload.batchLimit,
        },
      }),
    );
  }, [deckIdLocal, payload, rows]);

  const allDone =
    rows.length > 0 &&
    rows.every((r) => r.status.status === "created");

  return (
    <div className="rounded-xl border border-amber-400/30 bg-amber-500/[0.04] p-3 text-sm dark:border-amber-400/20 dark:bg-amber-500/[0.06] max-w-md space-y-2">
      <div className="flex items-start gap-2">
        <BookOpen className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-gray-900 dark:text-gray-100">
            {headerLine}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400">
            Target deck: {deckLabel}
          </div>
          {payload.sourceContentId && (
            <div className="text-[11px] text-gray-500 dark:text-gray-400">
              Source: linked to the open note
            </div>
          )}
        </div>
      </div>

      {/*
        Absorbed deck-create affordance — Stage 3. When the leaf deck
        doesn't yet exist, surface the rationale + similar-existing
        chips so the user sees what's about to be created on commit.
        This is the inline equivalent of the old separate
        DeckProposalCard.
      */}
      {!deckExistsLocal && (
        <div className="rounded-md border border-emerald-400/30 bg-emerald-500/[0.04] p-2 text-[12px] dark:border-emerald-400/20 dark:bg-emerald-500/[0.06] space-y-1.5">
          <div className="flex items-start gap-1.5">
            <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
            <div className="min-w-0 flex-1">
              <span className="text-gray-700 dark:text-gray-300">
                On commit, will create deck{" "}
                <span className="font-mono text-emerald-700 dark:text-emerald-300">
                  {payload.deck.proposedPath}
                </span>
              </span>
            </div>
          </div>
          {payload.deck.rationale && (
            <p className="text-gray-600 dark:text-gray-400">
              {payload.deck.rationale}
            </p>
          )}
          {payload.deck.similarExistingPaths.length > 0 && (
            <div className="text-[11px] text-gray-500 dark:text-gray-400">
              <div className="mb-1">
                Similar existing decks (tell the AI to use one instead):
              </div>
              <div className="flex flex-wrap gap-1">
                {payload.deck.similarExistingPaths.map((path) => (
                  <span
                    key={path}
                    className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] text-emerald-700 dark:text-emerald-300"
                  >
                    {path}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/*
        Gallery: compact bullet list by default (one row per card,
        front → back as plain text), expandable on click into the full
        TipTap editors. Max-height + scroll keeps the cards panel from
        dominating the chat when there are 10. Rows auto-expand when
        their status flips to "error" so the user sees what failed.
      */}
      <div className="max-h-[480px] overflow-y-auto rounded-md border border-amber-400/20 bg-white/30 dark:border-amber-400/15 dark:bg-white/[0.02] divide-y divide-amber-400/15 dark:divide-amber-400/10">
        {rows.map((row, i) => {
          const isCreated = row.status.status === "created";
          const isCreating = row.status.status === "creating";
          const isError = row.status.status === "error";
          const frontPreview =
            extractPlainTextFromTiptap(row.frontContent) || "(empty)";
          const backPreview =
            extractPlainTextFromTiptap(row.backContent) || "(empty)";
          return (
            <div
              key={i}
              className={`${
                isCreated
                  ? "bg-emerald-500/[0.04]"
                  : isError
                    ? "bg-red-500/[0.04]"
                    : ""
              }`}
            >
              {/* Compact row — checkbox + summary + status icon + chevron */}
              <div className="flex items-center gap-2 px-2 py-1.5">
                <input
                  type="checkbox"
                  checked={row.checked}
                  disabled={isCreated || isCreating}
                  onChange={(e) =>
                    updateRow(i, { checked: e.target.checked })
                  }
                  aria-label={`Include card ${i + 1}`}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-amber-500 disabled:cursor-not-allowed"
                />
                {/*
                  Horizontal scroll-to-peek pattern on the flex item:
                  whitespace-nowrap keeps the row one line tall,
                  overflow-x-auto lets the user wheel/trackpad/drag-
                  scroll to peek at the truncated definition. min-w-0 +
                  flex-1 + shrink-0 on the icon column keep the status
                  icons unobstructed regardless of text length. The
                  scrollbar itself is HIDDEN (scrollbar-width:none for
                  Firefox; ::-webkit-scrollbar display:none for
                  Chromium/Safari) — the gesture is invisible by design;
                  the user discovers it by swiping. Click still triggers
                  expand because a tap-without-drag fires onClick before
                  the scroll gesture is recognized.
                */}
                <button
                  type="button"
                  onClick={() =>
                    updateRow(i, { expanded: !row.expanded })
                  }
                  className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-left text-[12px] text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100 [&::-webkit-scrollbar]:hidden"
                  style={{ scrollbarWidth: "none" }}
                  aria-expanded={row.expanded}
                  aria-controls={`card-editor-${i}`}
                  title={row.expanded ? "Collapse" : `${frontPreview} → ${backPreview}`}
                >
                  <span className="mr-1 font-medium text-gray-500 dark:text-gray-400">
                    {i + 1}.
                  </span>
                  {frontPreview}
                  <span className="mx-1 text-gray-400 dark:text-gray-500">
                    →
                  </span>
                  <span className="text-gray-600 dark:text-gray-400">
                    {backPreview}
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  {isCreated && (
                    <Check
                      className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                      aria-label="Added"
                    />
                  )}
                  {isCreating && (
                    <Loader2
                      className="h-4 w-4 animate-spin text-amber-600 dark:text-amber-400"
                      aria-label="Adding"
                    />
                  )}
                  {isError && (
                    <AlertTriangle
                      className="h-4 w-4 text-red-600 dark:text-red-400"
                      aria-label="Error"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      updateRow(i, { expanded: !row.expanded })
                    }
                    className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    aria-label={row.expanded ? "Collapse" : "Expand to edit"}
                  >
                    {row.expanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRightIcon className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Expanded editors */}
              {row.expanded && (
                <div
                  id={`card-editor-${i}`}
                  className="space-y-1.5 px-2 pb-2 pl-8"
                >
                  <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {row.frontLabel}
                  </div>
                  {/*
                    `tight` overrides `compact` here — the term side is
                    one line by default and auto-grows on wrap. Compact
                    was overkill: 120px min-height for a one-word term.
                  */}
                  <AdaptiveFlashcardEditor
                    value={row.frontContent}
                    onChange={(value) =>
                      updateRow(i, { frontContent: value })
                    }
                    mode="plain"
                    placeholder="Front"
                    editable={!isCreated && !isCreating}
                    ariaLabel={`Card ${i + 1} front`}
                    tight
                  />
                  <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {row.backLabel}
                  </div>
                  <AdaptiveFlashcardEditor
                    value={row.backContent}
                    onChange={(value) =>
                      updateRow(i, { backContent: value })
                    }
                    mode="plain"
                    placeholder="Back"
                    editable={!isCreated && !isCreating}
                    ariaLabel={`Card ${i + 1} back`}
                    compact
                  />
                  {row.status.status === "error" && (
                    <div className="flex items-start gap-1.5 rounded bg-red-500/10 px-1.5 py-1 text-[11px] text-red-700 dark:text-red-300">
                      <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                      <span>{row.status.message}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="text-[11px] text-gray-500 dark:text-gray-400">
          {allDone
            ? `All ${createdCount} added`
            : `${checkedCount} of ${proposedCount} selected${
                createdCount > 0 ? ` · ${createdCount} added` : ""
              }`}
        </div>
        <div className="flex items-center gap-2">
          {showTruncationHint && (
            <button
              type="button"
              onClick={handleAskForNextBatch}
              className="inline-flex items-center gap-1 text-[11px] text-amber-700 hover:underline dark:text-amber-300"
              title={`Ask the AI to propose the next ${payload.batchLimit}`}
            >
              Ask for next batch
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            onClick={handleSubmitSelected}
            disabled={
              // Block when the parent isn't created yet (we can't
              // create the leaf into a non-existent parent — the slug
              // would land at root). When the leaf exists OR the
              // parent exists, the commit can proceed.
              (!deckExistsLocal && !parentResolvedLocal) ||
              checkedCount === 0 ||
              bulkSubmitting ||
              allDone
            }
            title={
              !deckExistsLocal && !parentResolvedLocal
                ? `Create parent deck "${payload.deck.parentDeckPath}" first`
                : undefined
            }
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/[0.08] px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-500/[0.14] disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-400/30 dark:bg-amber-500/[0.10] dark:text-amber-300 dark:hover:bg-amber-500/[0.18]"
          >
            {bulkSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {!deckExistsLocal ? "Creating + adding…" : "Adding…"}
              </>
            ) : !deckExistsLocal ? (
              `Create deck & add${checkedCount > 0 ? ` (${checkedCount})` : ""}`
            ) : (
              `Add selected${checkedCount > 0 ? ` (${checkedCount})` : ""}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
