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

import { useCallback, useMemo, useState } from "react";
import { Layers, Check, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { slugifyDeckName } from "@/lib/domain/flashcards";
import { useExistingDeckPaths } from "./use-existing-deck-paths";
import { DeckPathField } from "./DeckPathField";

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

  // Editable deck path — Stage 4. Same pattern as the cards card.
  const [pathDraft, setPathDraft] = useState(payload.proposedPath);
  const existingDecks = useExistingDeckPaths();

  const slugifyPath = useCallback((raw: string): string => {
    return raw
      .split("/")
      .map((s) => slugifyDeckName(s))
      .filter(Boolean)
      .join("/");
  }, []);

  const {
    effectivePath,
    effectiveLeafName,
    effectiveParentPath,
    effectiveDeckExists,
    effectiveParentDeckId,
    effectiveParentResolved,
  } = useMemo(() => {
    const slugged = slugifyPath(pathDraft);
    const segments = slugged.split("/").filter(Boolean);
    const leafSlug = segments.at(-1) ?? "";
    const parentSegments = segments.slice(0, -1);
    const parentPath = parentSegments.join("/");

    const matchingDeck = existingDecks.find((d) => d.path === slugged);
    const matchingParent = parentPath
      ? existingDecks.find((d) => d.path === parentPath)
      : null;

    const leafName =
      matchingDeck?.name ??
      leafSlug
        .split("-")
        .filter(Boolean)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(" ");

    return {
      effectivePath: slugged,
      effectiveLeafName: leafName,
      effectiveParentPath: parentPath || null,
      effectiveDeckExists: !!matchingDeck,
      effectiveParentDeckId: matchingParent?.id ?? null,
      effectiveParentResolved: !parentPath || !!matchingParent,
    };
  }, [pathDraft, existingDecks, slugifyPath]);

  const parentLabel = effectiveParentPath
    ? effectiveParentResolved
      ? effectiveParentPath
      : `${effectiveParentPath} (will also be created)`
    : "(root)";

  const handleCreate = useCallback(async () => {
    if (effectiveDeckExists) {
      toast.error("This deck already exists.");
      return;
    }
    setState({ status: "creating" });
    try {
      const res = await fetch("/api/flashcards/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: effectiveLeafName,
          ...(effectiveParentDeckId
            ? { parentDeckId: effectiveParentDeckId }
            : effectiveParentPath
              ? { parentDeckPath: effectiveParentPath }
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

      const createdPath = json.data?.path ?? effectivePath;
      const createdId = json.data?.id ?? null;
      // Notify the shared deck-paths cache + sibling cards. The next
      // render of any FlashcardCardProposalList picks up the new deck
      // through useExistingDeckPaths.
      window.dispatchEvent(
        new CustomEvent("flashcard-deck-created", {
          detail: { deckPath: createdPath, deckId: createdId },
        }),
      );
      setState({ status: "created", deckPath: createdPath });
      toast.success(`Deck "${effectiveLeafName}" created`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Network error creating deck";
      setState({ status: "error", message });
      toast.error(message);
    }
  }, [
    effectiveDeckExists,
    effectiveLeafName,
    effectiveParentDeckId,
    effectiveParentPath,
    effectivePath,
  ]);

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
            Proposed deck: {effectiveLeafName || "(unnamed)"}
          </div>
          {/* Stage 4 — editable path with themed autocomplete */}
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
            <span className="shrink-0">Path:</span>
            <DeckPathField
              value={pathDraft}
              onChange={setPathDraft}
              disabled={state.status === "creating"}
              placeholder="e.g. spanish/irregular-verbs"
              accent="emerald"
              ariaLabel="Deck path"
              resetValueOnBlankBlur={payload.proposedPath}
            />
          </div>
          <div className="text-[11px] text-gray-400 dark:text-gray-500">
            <span className="font-mono">{effectivePath || "(empty path)"}</span>
            {" · Parent: "}
            <span>{parentLabel}</span>
            {effectivePath !== payload.proposedPath && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => setPathDraft(payload.proposedPath)}
                  className="text-emerald-700 hover:underline dark:text-emerald-300"
                >
                  reset
                </button>
              </>
            )}
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
        disabled={state.status === "creating" || !effectivePath}
        title={
          !effectivePath
            ? "Deck path is empty — type a path or pick from the dropdown"
            : undefined
        }
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
