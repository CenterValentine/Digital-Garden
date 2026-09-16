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

import { PencilLine, RotateCcw } from "lucide-react";

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
