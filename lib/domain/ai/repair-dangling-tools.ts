/**
 * Dangling tool-call repair (AI v3 core S4 — found by the first playbook
 * smoke, 2026-07-18).
 *
 * Anthropic's API requires every `tool_use` block to be answered by a
 * `tool_result` in the next message. A needsApproval pause that never
 * executes (network error mid-approval, user typed a new message past a
 * pending approval, stream death before execution) leaves an assistant
 * message whose tool part has NO output — and every later send then 400s
 * with "tool_use ids were found without tool_result blocks", poisoning
 * the conversation permanently.
 *
 * Repair rule: any tool part still in a pre-output state on an assistant
 * message that is NOT the final message (the conversation moved on) is
 * rewritten to `output-error` with an honest explanation. The final
 * message is left untouched — that's the live resume path the approval
 * flow depends on.
 */

import type { UIMessage } from "ai";

const PRE_OUTPUT_STATES = new Set([
  "input-streaming",
  "input-available",
  "approval-requested",
  "approval-responded",
]);

export const INTERRUPTED_TOOL_MESSAGE =
  "Interrupted — this tool call never executed (the conversation moved on before approval or execution completed). Re-issue the action if it is still wanted.";

export function repairDanglingToolCalls(messages: UIMessage[]): UIMessage[] {
  return messages.map((message, index) => {
    if (message.role !== "assistant" || index === messages.length - 1) {
      return message;
    }
    let touched = false;
    const parts = (message.parts as Array<Record<string, unknown>>).map(
      (part) => {
        const type = typeof part?.type === "string" ? part.type : "";
        const isTool = type.startsWith("tool-") || type === "dynamic-tool";
        if (!isTool) return part;
        const state = typeof part.state === "string" ? part.state : "";
        if (!PRE_OUTPUT_STATES.has(state)) return part;
        touched = true;
        return {
          ...part,
          state: "output-error",
          errorText: INTERRUPTED_TOOL_MESSAGE,
          // An unanswered approval must not resurrect as actionable.
          approval: undefined,
        };
      },
    );
    return touched
      ? ({ ...message, parts } as unknown as UIMessage)
      : message;
  });
}
