/**
 * Request-segment inference — reconstructs how many HTTP requests a turn
 * spanned from its persisted parts.
 *
 * Why it matters: a turn with client-executed tools (browser reads,
 * co-browse) is several server requests stitched together by the client's
 * auto-continue predicate. Legacy metadata was frozen at request #1, so the
 * only way to understand a historical turn's true shape is to re-derive the
 * request boundaries. INFERRED, and labeled as such — once the
 * self-describing-turns metadata records segments authoritatively, recorded
 * values are preferred.
 *
 * Heuristic: a step ends a request when its tool calls are client-executed
 * (the server stream ends at the call; the client executes and re-sends), or
 * when an approval paused the stream (`approval-requested` / a later
 * `output-denied`). The terminal step always closes the final request.
 */

import {
  CO_BROWSE_ACT,
  CO_BROWSE_OPEN,
  LIST_TABS,
  READ_CURRENT_PAGE,
} from "@/lib/domain/ai/tools/co-browse-tools";
import { READ_PAGE_HEADLESS_OR_BROWSER } from "@/lib/domain/ai/tools/read-page-in-browser";
import { OPEN_TAB_AND_READ } from "@/lib/domain/ai/tools/open-tab-and-read";
import type { StepDiagnostics } from "./types";

/** Tools with no server `execute` — their call ends the server stream. */
export const CLIENT_EXECUTED_TOOL_NAMES: ReadonlySet<string> = new Set([
  CO_BROWSE_OPEN,
  CO_BROWSE_ACT,
  READ_CURRENT_PAGE,
  LIST_TABS,
  READ_PAGE_HEADLESS_OR_BROWSER,
  OPEN_TAB_AND_READ,
]);

/** Part states that mean the stream paused for a user approval decision. */
const APPROVAL_PAUSE_STATES: ReadonlySet<string> = new Set([
  "approval-requested",
  "output-denied",
]);

export function isClientExecutedTool(tool: string): boolean {
  return CLIENT_EXECUTED_TOOL_NAMES.has(tool);
}

/** Whether this step's persisted shape implies the server request ended here. */
export function stepEndsRequest(step: {
  toolCalls: { tool: string; state: string; clientExecuted: boolean }[];
}): boolean {
  if (step.toolCalls.length === 0) return false;
  return step.toolCalls.some(
    (t) => t.clientExecuted || APPROVAL_PAUSE_STATES.has(t.state),
  );
}

/**
 * Count inferred HTTP requests for a turn: split after every request-ending
 * step; the trailing group (even without a request-ending step) is the final
 * request. An empty turn is one request.
 */
export function inferRequestCount(steps: StepDiagnostics[]): number {
  if (steps.length === 0) return 1;
  let requests = 0;
  let openGroup = false;
  for (const step of steps) {
    openGroup = true;
    if (step.endsRequest) {
      requests += 1;
      openGroup = false;
    }
  }
  return requests + (openGroup ? 1 : 0);
}
