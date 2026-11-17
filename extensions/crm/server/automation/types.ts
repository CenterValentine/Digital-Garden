/**
 * The CRM's automation seam.
 *
 * Division of labour (CRM milestone 1):
 *  - Digital Garden OWNS the customer-facing state: records, drafts, and the
 *    visible follow-up status on each opportunity. It decides.
 *  - The executor (n8n is the intended one) CARRIES OUT timed work — sending
 *    the follow-up text when it falls due — and is told when DG's decision
 *    changes. It never becomes the source of truth for what the operator sees.
 *
 * Same shape as the workflows extension's `WorkflowEngineAdapter`
 * (extensions/workflows/server/engines/types.ts): a small interface, a
 * registry keyed by id, swappable per business (`CrmConfig.automation`).
 * The local simulator is the default so the CRM works with no n8n at all.
 *
 * Inbound events travel the other way through ONE seam regardless of
 * executor — `ingestCrmEvent` (../events.ts) — so the simulator and a real
 * n8n webhook exercise the same code.
 */

export interface CrmFollowUpRef {
  ownerId: string;
  folderId: string;
  opportunityId: string;
  opportunityTitle: string;
  contactId: string | null;
}

export interface CrmAutomationOutcome {
  /** False when the executor could not be told — DG's state still stands. */
  delivered: boolean;
  /** One line for the activity log: what the executor was told, and by whom. */
  detail: string;
}

export interface CrmAutomationAdapter {
  id: string;
  /** Shown in the UI next to follow-up status. */
  label: string;
  /** True when nothing leaves this process — the UI labels it as simulated. */
  simulated: boolean;
  /** DG paused a follow-up (e.g. the customer replied): stop the timer. */
  pauseFollowUp(ref: CrmFollowUpRef, reason: string): Promise<CrmAutomationOutcome>;
}
