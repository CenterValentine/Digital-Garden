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

import { useCallback, useEffect, useState } from "react";

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

/**
 * @param isNewest whether this card is the latest proposal of its kind in
 *   the conversation. It suppresses a STALE withdrawn flag: the flag is
 *   keyed by content hash (message ids churn when a streamed conversation
 *   persists, so id-keying vanishes on reload), which means withdrawing a
 *   schema, asking for changes, then asking to revert produces an identical
 *   re-proposal under the SAME key — and the fresh card would mount already
 *   withdrawn. A card that is the newest of its kind is by definition not
 *   the one that was withdrawn.
 */
export function useProposalRevision(
  storageKey: string,
  isNewest = false
): ProposalRevision {
  const [withdrawn, setWithdrawn] = useState(() =>
    isNewest ? false : loadWithdrawn(storageKey)
  );

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

// ── Supersession (the typed-reply path) ──────────────────────────────────
//
// Modify is the EXPLICIT exit, but most users ask for changes by typing a
// reply instead of hunting for a button — and the model is now told a
// proposal is a draft it may freely re-issue, so the conversational path is
// the common one. Left alone it produces two live Apply buttons, and
// applying the stale one builds a superseded schema in one transaction.
//
// So an older unapplied proposal of the same kind DEMOTES when a newer one
// arrives: it stays visible and still applicable, behind a confirm, under a
// note saying it was replaced. Demote rather than auto-withdraw, because
// supersession here is INFERRED from ordering — the model may legitimately
// propose two unrelated schemas in one turn — and an inference must not
// silently destroy an option the user may still want. Modify stays the
// confident path; this is the net under the other one.

export const PROPOSAL_SENTINELS = {
  linkedDatabases: '"__linkedDatabasesProposal"',
  outputDatabase: '"__outputDatabaseProposal"',
  databaseColumns: '"__databaseColumnsProposal"',
  columnOptions: '"__columnOptionsProposal"',
} as const;

export type ProposalKind = keyof typeof PROPOSAL_SENTINELS;

/** Last message index carrying a proposal of each kind. Missing = none. */
export type LatestProposalIndex = Partial<Record<ProposalKind, number>>;

/**
 * Scans serialized message parts for each proposal sentinel. A string scan,
 * not a parse: the card parsers already gate on exactly this `includes`
 * check before doing any JSON work, and this runs over every message on
 * every render, so the cheap half is the right half to reuse.
 *
 * SAME-TURN siblings are deliberately not superseded — only a STRICTLY
 * later message demotes an earlier one — so a turn that proposes two
 * related schemas leaves both live.
 */
export function latestProposalIndexByKind(
  messages: ReadonlyArray<{ parts?: unknown }>
): LatestProposalIndex {
  const latest: LatestProposalIndex = {};
  for (let i = 0; i < messages.length; i++) {
    const parts = messages[i]?.parts;
    if (!parts) continue;
    let serialized: string;
    try {
      serialized = JSON.stringify(parts);
    } catch {
      continue;
    }
    for (const [kind, sentinel] of Object.entries(PROPOSAL_SENTINELS)) {
      if (serialized.includes(sentinel)) {
        latest[kind as ProposalKind] = i;
      }
    }
  }
  return latest;
}

// ── Obsolescence (a sibling actually landed) ─────────────────────────────
//
// Demotion alone is not enough once something has been APPLIED. A superseded
// card is merely "probably not what you want"; a card whose sibling has
// already created real tables is actively dangerous, because applying it now
// does not replace that work — it duplicates it, and `propose_linked_
// databases` duplicates a whole table set in one transaction.
//
// So the rule is blunt on purpose: once ANY proposal of kind K is applied,
// every OTHER card of kind K retires and loses its Apply entirely. No index
// comparison, no "was this one newer" reasoning — if a schema of this kind
// now exists, the honest move is to ask the model what to do next, not to
// stack a second one from a stale card.
//
// Session-scoped by design: this rides the CustomEvent seam the rest of the
// database feature uses rather than persisting. After a reload the applied
// card still reads applied and its siblings still read superseded (Apply
// behind a confirm), so the failure mode of forgetting is a weaker warning,
// never a missing one.

export const PROPOSAL_APPLIED_EVENT = "dg:proposal-applied";

export interface ProposalAppliedDetail {
  kind: ProposalKind;
  /** The applying card's storage key, so it can skip its own echo. */
  key: string;
}

export function dispatchProposalApplied(
  kind: ProposalKind,
  key: string
): void {
  window.dispatchEvent(
    new CustomEvent<ProposalAppliedDetail>(PROPOSAL_APPLIED_EVENT, {
      detail: { kind, key },
    })
  );
}

/** True once a DIFFERENT card of the same kind has been applied. */
export function useProposalObsolete(
  kind: ProposalKind,
  storageKey: string
): boolean {
  const [obsolete, setObsolete] = useState(false);
  useEffect(() => {
    function onApplied(e: Event) {
      const detail = (e as CustomEvent).detail as
        | ProposalAppliedDetail
        | undefined;
      if (!detail || detail.kind !== kind) return;
      if (detail.key === storageKey) return; // our own apply
      setObsolete(true);
    }
    window.addEventListener(PROPOSAL_APPLIED_EVENT, onApplied);
    return () => window.removeEventListener(PROPOSAL_APPLIED_EVENT, onApplied);
  }, [kind, storageKey]);
  return obsolete;
}
