"use client";

/**
 * FlashcardDeckProposalCard — Session 2 interactive card.
 *
 * Renders a __deckProposal payload from the propose_deck AI tool.
 * Primary action: POST /api/flashcards/decks to actually create the
 * proposed deck. On success, the card collapses into a confirmation
 * row. On 409 (name conflict at the proposed level), surfaces the
 * conflict message so the user knows to pick a different name.
 *
 * Similar-existing-deck paths render as static text-only chips for
 * Session 2 — the model can already act on a follow-up like "use
 * spanish/verbs instead", so interactivity here is deferred.
 */

import { useCallback, useEffect, useState } from "react";
import { Layers, Check, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface DeckProposalPayload {
  __deckProposal: true;
  name: string;
  parentDeckPath: string | null;
  parentDeckId: string | null;
  parentResolved: boolean;
  proposedPath: string;
  rationale: string;
  similarExistingPaths: string[];
}

type CreateState =
  | { status: "idle" }
  | { status: "creating" }
  | { status: "created"; deckPath: string }
  | { status: "error"; message: string; code?: string };

export function FlashcardDeckProposalCard({
  payload,
}: {
  payload: DeckProposalPayload;
}) {
  const [state, setState] = useState<CreateState>({ status: "idle" });

  // Local mirrors of payload.parentDeckId / payload.parentResolved.
  // When the user is creating a nested topic (e.g. "spanish/irregular-
  // verbs") the model can propose BOTH the parent ("spanish") and the
  // child in the same turn. The child's parent doesn't exist when its
  // propose_deck call runs, so parentResolved is false and parentDeckId
  // is null — but as soon as the user clicks Create on the parent's
  // card, it dispatches `flashcard-deck-created`. We adopt that event's
  // deckId so this child can post with the right parentDeckId instead
  // of landing at root.
  const [parentDeckIdLocal, setParentDeckIdLocal] = useState<string | null>(
    payload.parentDeckId,
  );
  const [parentResolvedLocal, setParentResolvedLocal] = useState(
    payload.parentResolved,
  );

  useEffect(() => {
    if (!payload.parentDeckPath || parentResolvedLocal) return;
    function handleDeckCreated(e: Event) {
      const detail = (e as CustomEvent).detail as
        | { deckPath?: string; deckId?: string | null }
        | undefined;
      if (!detail) return;
      if (detail.deckPath !== payload.parentDeckPath) return;
      if (detail.deckId) {
        setParentDeckIdLocal(detail.deckId);
        setParentResolvedLocal(true);
      }
    }
    window.addEventListener("flashcard-deck-created", handleDeckCreated);
    return () =>
      window.removeEventListener("flashcard-deck-created", handleDeckCreated);
  }, [payload.parentDeckPath, parentResolvedLocal]);

  const parentLabel = payload.parentDeckPath
    ? parentResolvedLocal
      ? payload.parentDeckPath
      : `${payload.parentDeckPath} (will also be created)`
    : "(root)";

  const handleCreate = useCallback(async () => {
    // The server cascade-creates missing parents when we pass
    // parentDeckPath instead of parentDeckId, so we can commit even
    // when the parent isn't created yet. Prefer the resolved id when
    // we have it (faster, no walk).
    setState({ status: "creating" });
    try {
      const res = await fetch("/api/flashcards/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: payload.name,
          ...(parentDeckIdLocal
            ? { parentDeckId: parentDeckIdLocal }
            : payload.parentDeckPath
              ? { parentDeckPath: payload.parentDeckPath }
              : {}),
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | {
            success: boolean;
            data?: { id?: string; path?: string };
            error?: { code?: string; message?: string };
          }
        | null;

      if (!res.ok || !json?.success) {
        const code = json?.error?.code;
        const msg =
          json?.error?.message ??
          (res.status === 409
            ? "A deck with this name already exists at that level."
            : `Failed to create deck (${res.status})`);
        setState({ status: "error", message: msg, code });
        toast.error(msg);
        return;
      }

      const createdPath = json.data?.path ?? payload.proposedPath;
      const createdId = json.data?.id ?? null;
      // Notify any sibling CardProposalList rendered in the same chat
      // that this deck now exists, so its "Add selected" button enables
      // even though its payload was captured before the POST. Match by
      // path because the cards proposal carries the deck path too.
      window.dispatchEvent(
        new CustomEvent("flashcard-deck-created", {
          detail: { deckPath: createdPath, deckId: createdId },
        }),
      );
      setState({ status: "created", deckPath: createdPath });
      toast.success(`Deck "${payload.name}" created`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Network error creating deck";
      setState({ status: "error", message });
      toast.error(message);
    }
  }, [payload, parentDeckIdLocal]);

  if (state.status === "created") {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-500/[0.06] px-3 py-2 text-sm dark:border-emerald-400/30 dark:bg-emerald-500/[0.08]">
        <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span className="text-gray-700 dark:text-gray-200">
          Created deck{" "}
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {payload.name}
          </span>{" "}
          at{" "}
          <span className="font-mono text-[12px] text-emerald-700 dark:text-emerald-300">
            {state.deckPath}
          </span>
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/[0.04] p-3 text-sm dark:border-emerald-400/20 dark:bg-emerald-500/[0.06] max-w-md space-y-2">
      <div className="flex items-start gap-2">
        <Layers className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-gray-900 dark:text-gray-100">
            Proposed deck: {payload.name}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400">
            Path: {payload.proposedPath} · Parent: {parentLabel}
          </div>
        </div>
      </div>

      <p className="text-[13px] text-gray-700 dark:text-gray-300">
        {payload.rationale}
      </p>

      {payload.similarExistingPaths.length > 0 && (
        <div className="text-[11px] text-gray-500 dark:text-gray-400">
          <div className="mb-1">
            Similar existing decks (tell the AI to use one instead):
          </div>
          <div className="flex flex-wrap gap-1">
            {payload.similarExistingPaths.map((path) => (
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

      {state.status === "error" && (
        <div className="flex items-start gap-1.5 rounded-md bg-red-500/10 px-2 py-1.5 text-[12px] text-red-700 dark:text-red-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{state.message}</span>
        </div>
      )}

      <button
        type="button"
        onClick={handleCreate}
        disabled={state.status === "creating"}
        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/[0.08] px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-500/[0.14] disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-400/30 dark:bg-emerald-500/[0.10] dark:text-emerald-300 dark:hover:bg-emerald-500/[0.18]"
      >
        {state.status === "creating" ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Creating…
          </>
        ) : state.status === "error" ? (
          "Retry"
        ) : (
          "Create deck"
        )}
      </button>
    </div>
  );
}
