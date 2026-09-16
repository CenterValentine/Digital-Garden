"use client";

/**
 * Withdraw-and-revise for proposal cards.
 *
 * The problem this solves (owner report, 2026-09-15): a model that has
 * already proposed one database, and then realises a second linked table
 * would be the better design, has no way to amend the card it just wrote.
 * Its tool descriptions correctly forbid it from claiming an unapplied table
 * exists, and `propose_linked_databases`'s `extend` needs a table that is
 * real — so it reasons itself into asking the user to Apply first, purely so
 * it can reference the result. The user is made to commit to a design the
 * model has already outgrown.
 *
 * Re-proposing was always allowed — nothing server-side blocks a second card
 * (there is no pending-proposal guard in data-tools.ts). What was missing is
 * an exit for the FIRST card: re-propose alone leaves two live Apply buttons
 * in the transcript, and applying the stale one builds the superseded schema.
 *
 * So the exit is the user's, not a heuristic: Modify withdraws this card and
 * pre-fills the composer with a revision request. Nothing auto-sends — the
 * user says what should change, which is the whole point, and matches the
 * one existing card→model loop-back in the panel (ChatPanel's
 * "flashcard-request-next-batch" handler, which deliberately fills the input
 * rather than submitting).
 *
 * Withdrawal is REVERSIBLE. A blocked state must always show its exit
 * (save-conflict arc, PRs #236-#241) — clicking Modify and changing your
 * mind must not destroy the proposal.
 */

import { useCallback, useState } from "react";

/** Fired at ChatPanel, which pre-fills the composer with `detail.prompt`. */
export const PROPOSAL_REVISE_EVENT = "dg:proposal-revise";

export interface ProposalReviseDetail {
  prompt: string;
}

/**
 * Withdrawal is keyed off the card's OWN applied-state key, which is a hash
 * of what was proposed rather than a message id — a streamed message's id
 * changes when the conversation is persisted, so an id-keyed flag vanishes
 * on the first reload (observed 2026-08-31). Content-keying means a revised
 * proposal is a different card and starts live, which is exactly right.
 */
function withdrawnKey(storageKey: string): string {
  return `${storageKey}:withdrawn`;
}

function loadWithdrawn(storageKey: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(withdrawnKey(storageKey)) === "1";
  } catch {
    /* storage unavailable — the card stays live, which is the safe default */
    return false;
  }
}

export interface ProposalRevision {
  withdrawn: boolean;
  /** Withdraw this card and pre-fill the composer with `prompt`. */
  requestRevision: (prompt: string) => void;
  /** Undo the withdrawal — the card goes live again. */
  restore: () => void;
}

export function useProposalRevision(storageKey: string): ProposalRevision {
  const [withdrawn, setWithdrawn] = useState(() => loadWithdrawn(storageKey));

  const persist = useCallback(
    (value: boolean) => {
      try {
        if (value) window.localStorage.setItem(withdrawnKey(storageKey), "1");
        else window.localStorage.removeItem(withdrawnKey(storageKey));
      } catch {
        /* non-fatal: the flag is a convenience, the card state is in React */
      }
    },
    [storageKey]
  );

  const requestRevision = useCallback(
    (prompt: string) => {
      setWithdrawn(true);
      persist(true);
      window.dispatchEvent(
        new CustomEvent<ProposalReviseDetail>(PROPOSAL_REVISE_EVENT, {
          detail: { prompt },
        })
      );
    },
    [persist]
  );

  const restore = useCallback(() => {
    setWithdrawn(false);
    persist(false);
  }, [persist]);

  return { withdrawn, requestRevision, restore };
}
