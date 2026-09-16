"use client";

/**
 * The two halves of withdraw-and-revise, shared by every proposal card.
 *
 * `ProposalWithdrawnNotice` replaces the whole card once withdrawn, so a
 * retired proposal cannot be applied by accident — and carries Restore, so
 * withdrawing is never a one-way door.
 *
 * `ModifyProposalButton` sits beside Apply. It reads "Modify" rather than
 * "Reject": the user is not refusing the idea, they are sending it back for
 * another pass, and the wording should not make asking for a change feel
 * like starting over.
 */

import { useState } from "react";
import { History, PencilLine, RotateCcw } from "lucide-react";

export function ProposalWithdrawnNotice({
  label,
  onRestore,
}: {
  /** What was withdrawn, e.g. "database proposal" — used in the sentence. */
  label: string;
  onRestore: () => void;
}) {
  return (
    <div className="inline-flex max-w-md flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm">
      <PencilLine className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">
        Sent back for changes — this {label} was not created.
      </span>
      <button
        type="button"
        onClick={onRestore}
        className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted"
      >
        <RotateCcw className="h-3 w-3" />
        Restore
      </button>
    </div>
  );
}

export function ModifyProposalButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Withdraw this proposal and ask for changes"
      className="inline-flex items-center gap-1.5 rounded-md border border-border/70 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
    >
      <PencilLine className="h-3.5 w-3.5" />
      Modify
    </button>
  );
}

/**
 * The demotion banner for a proposal a NEWER one has replaced.
 *
 * Deliberately not a withdrawal: supersession is inferred from message
 * order, and the model may legitimately propose two unrelated schemas. So
 * the card stays, reads as replaced, and Apply survives behind one
 * confirmation — the user keeps the option, they just cannot take it by
 * reflex while scrolling back through a transcript.
 */
export function ProposalSupersededNotice() {
  return (
    <div className="flex items-start gap-1.5 rounded-md border border-amber-400/40 bg-amber-500/[0.06] px-2 py-1.5 text-[11px] text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/[0.08] dark:text-amber-200">
      <History className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        A newer proposal replaced this one. Applying it now creates the
        earlier design.
      </span>
    </div>
  );
}

/**
 * One confirmation step in front of a superseded card's primary action.
 *
 * Returns the handler the button should call and the label it should show.
 * The first click on a superseded card ARMS rather than applies; the second
 * commits. Arming is component-local and dies with the card, because a
 * stale "are you sure" left armed across a scroll is its own footgun.
 */
export function useSupersededGuard(
  superseded: boolean,
  apply: () => void
): { onClick: () => void; confirming: boolean } {
  const [armed, setArmed] = useState(false);
  if (!superseded) return { onClick: apply, confirming: false };
  return {
    onClick: armed ? apply : () => setArmed(true),
    confirming: armed,
  };
}

/**
 * Terminal state for a card whose sibling already landed. No Apply at all:
 * at this point the tables exist, and a second apply duplicates them rather
 * than revising anything. The exit is the conversation, not this card.
 */
export function ProposalObsoleteNotice({ label }: { label: string }) {
  return (
    <div className="inline-flex max-w-md flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm">
      <History className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">
        Another {label} from this conversation was already created — this
        older proposal is no longer offered.
      </span>
    </div>
  );
}
