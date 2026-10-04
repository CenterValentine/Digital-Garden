/**
 * Per-tool approval policy (ITERATION-RUN-HARNESS-FIXES §10 round 6c,
 * owner decision 2026-09-30: "Why do we need approval to create documents if
 * the user explicitly states they want that?").
 *
 * The create tools pause for approval because the harness cannot tell a
 * request the user made from output the model decided on — a blanket guard
 * from AI v3 core S4b/A4. Every one of the 25 approval requests in the four
 * days before this change was approved. So the user decides, per tool, in
 * `ai.toolConfig[<id>].autoApprove` (Chat controls and Settings → AI):
 *
 *   - create_docx — a new document runs without a card; an OVERWRITE runs
 *     without one only for a document this chat created (associated with
 *     the conversation and created after it began). A file that predates
 *     the chat always asks.
 *   - create_note — a new note runs without a card.
 *   - phase_checkpoint — the FINAL phase's checkpoint closes without a
 *     pause (the Run Ledger is still written and the integrity gate still
 *     refuses a premature checkpoint). Checkpoints between phases are real
 *     review points — the next phase loads on the next turn — and still ask.
 *
 * Everything else keeps its own rule: run proposals, destructive note
 * rewrites, workflow tools, and database reads (the read threshold).
 * Pure; the gate pins it.
 */

/** The tools whose approval the user may turn off. */
export const AUTO_APPROVABLE_TOOLS = ["create_docx", "create_note", "phase_checkpoint"] as const;
export type AutoApprovableTool = (typeof AUTO_APPROVABLE_TOOLS)[number];

export type ToolApprovalAction =
  | { tool: "create_docx"; overwrite?: { targetCreatedInThisChat: boolean } }
  | { tool: "create_note" }
  | { tool: "phase_checkpoint"; finalPhase: boolean };

/** The auto-approved tool ids in a user's `ai.toolConfig`. */
export function autoApprovedToolsFrom(toolConfig: unknown): ReadonlySet<string> {
  const out = new Set<string>();
  if (!toolConfig || typeof toolConfig !== "object") return out;
  for (const id of AUTO_APPROVABLE_TOOLS) {
    const entry = (toolConfig as Record<string, unknown>)[id];
    if (entry && typeof entry === "object" && (entry as { autoApprove?: unknown }).autoApprove === true) {
      out.add(id);
    }
  }
  return out;
}

/** True when the user's setting lets this call run without an approval card. */
export function toolAutoApproves(
  autoApproved: ReadonlySet<string> | undefined,
  action: ToolApprovalAction,
): boolean {
  if (!autoApproved?.has(action.tool)) return false;
  switch (action.tool) {
    case "create_docx":
      return action.overwrite ? action.overwrite.targetCreatedInThisChat : true;
    case "create_note":
      return true;
    case "phase_checkpoint":
      return action.finalPhase;
  }
}

/** What a final checkpoint returns when the setting closed it (never "APPROVED" — nobody clicked). */
export const AUTO_CLOSED_CHECKPOINT_NEXT =
  "FINAL PHASE RECORDED — closed without a pause by the user's setting. Give the short completion summary now: artifacts, where they were saved, and the charter's gate results.";
