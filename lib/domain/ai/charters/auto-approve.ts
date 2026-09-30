/**
 * Charter auto-approval (ITERATION-RUN-HARNESS-FIXES §10 round 6, owner
 * request 2026-09-30: "in nearly every run I am having to authorize
 * proposals at least 3 times").
 *
 * Evidence: the last three charter runs (e5b899a2, e9ca56f2, 36237eb8) each
 * paused three times — create_docx, create_note, phase_checkpoint — and every
 * one of the 25 approval requests in four days was approved. In a charter
 * chat those pauses re-ask consent the user already gave: the charter's
 * Required outputs name the resume and the review note, and a one-phase
 * charter's checkpoint is the gate right before the closing summary.
 *
 * With the user's setting `ai.charterAutoApprove` on, a CHARTER chat stops
 * asking for exactly these, and nothing else:
 *   - creating a document or note (new content; the user can delete it);
 *   - overwriting a document THIS chat created (the document check's
 *     fix-and-rewrite loop) — a file that predates the chat still asks;
 *   - the FINAL phase's checkpoint — intermediate checkpoints are real
 *     review points (the next phase loads on the next turn) and still ask;
 *   - database reads over the approval threshold (the model's hard ceiling
 *     still refuses an oversized read in execute).
 * A run proposal (propose_item_iteration) always asks: it carries the scope
 * and item budget, which is a decision, not a formality.
 *
 * Pure; the gate pins it.
 */

export interface CharterApprovalContext {
  /** A charter is attached, mentioned, or rooted in this chat. */
  charterActive: boolean;
  /** The user's setting `ai.charterAutoApprove`. */
  autoApprove: boolean;
}

export type CharterApprovalAction =
  | { kind: "create" }
  | { kind: "overwrite"; targetCreatedInThisChat: boolean }
  | { kind: "checkpoint"; finalPhase: boolean }
  | { kind: "bulk-read" };

/** True when the setting lets this action run without an approval card. */
export function charterAutoApproves(
  ctx: CharterApprovalContext,
  action: CharterApprovalAction,
): boolean {
  if (!ctx.charterActive || !ctx.autoApprove) return false;
  switch (action.kind) {
    case "create":
    case "bulk-read":
      return true;
    case "overwrite":
      return action.targetCreatedInThisChat;
    case "checkpoint":
      return action.finalPhase;
  }
}

/** The line a final checkpoint returns when the setting closed it (never "APPROVED" — nobody clicked). */
export const AUTO_CLOSED_CHECKPOINT_NEXT =
  "FINAL PHASE RECORDED — closed without a pause by the user's setting (charter auto-approval). Give the short completion summary now: artifacts, where they were saved, and the charter's gate results.";
