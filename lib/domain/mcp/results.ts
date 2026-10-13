/**
 * Result shapes every MCP tool shares (MCP-DATABASE-REACH-PLAN §8.3, §2.8).
 *
 * Every tool returns a `text` block (the Responses API and 2025-era clients
 * read only that) and, where there is a machine-readable shape, the same
 * facts under `structuredContent`. Refusals and internal errors are tool
 * results with `isError`, never thrown: a thrown error becomes a JSON-RPC
 * failure the model cannot reason about, while an error result carries the
 * reason and, for internal failures, a prefilled issue the agent can file
 * with `garden_report_issue` in one call.
 *
 * Pure: no server imports, so the gate can load it.
 */

import { estimateTokens } from "@/lib/domain/ai-context/tokens";

export type McpContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string; _meta?: Record<string, unknown> };

export interface McpToolResult {
  content: McpContentBlock[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  [key: string]: unknown;
}

export function ok(text: string, structured?: Record<string, unknown>): McpToolResult {
  return {
    content: [{ type: "text", text }],
    ...(structured ? { structuredContent: structured } : {}),
  };
}

/** A refusal the model should relay, with the reason in plain words. */
export function refuse(reason: string, structured?: Record<string, unknown>): McpToolResult {
  return {
    content: [{ type: "text", text: reason }],
    structuredContent: { refused: true, reason, ...(structured ?? {}) },
    isError: true,
  };
}

/** The capability refusal, worded so the agent names the grant to the user. */
export function needsCapability(cap: string, action: string): McpToolResult {
  return refuse(
    `This token cannot ${action}: it lacks the "${cap}" capability. Ask the user to mint a token with it on Settings → MCP, or to do this in the app.`,
    { missingCapability: cap }
  );
}

/**
 * An internal failure. `reportable` plus a prefilled issue body (tool,
 * input shape, error id — never content) make filing one call.
 */
export function internalError(tool: string, error: unknown, inputShape: string[]): McpToolResult {
  const id = `mcp-${Date.now().toString(36)}`;
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: "text",
        text: `${tool} failed with an internal error (${id}). Nothing may have changed. If it happens again with the same inputs, file it with garden_report_issue.`,
      },
    ],
    structuredContent: {
      error: true,
      errorId: id,
      reportable: true,
      issue: {
        kind: "bug",
        title: `MCP ${tool} failed: ${message.slice(0, 80)}`,
        body: `Tool: ${tool}\nError id: ${id}\nInput keys: ${inputShape.join(", ")}\nMessage: ${message.slice(0, 400)}`,
      },
    },
    isError: true,
  };
}

/** Rough token count of a result's text, for the per-call cap. */
export function tokensOf(text: string): number {
  return estimateTokens(text);
}

/**
 * Cut text at a token cap on a line boundary, telling the model what to do
 * next. Used by reads that have no cursor of their own.
 */
export function capText(text: string, cap: number, next: string): { text: string; truncated: boolean } {
  if (tokensOf(text) <= cap) return { text, truncated: false };
  const lines = text.split("\n");
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    const t = tokensOf(line) + 1;
    if (used + t > cap) break;
    kept.push(line);
    used += t;
  }
  return { text: `${kept.join("\n")}\n\n[Cut at the token cap. ${next}]`, truncated: true };
}
