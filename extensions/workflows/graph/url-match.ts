/**
 * URL-pattern matching for page-capture triggers — CLIENT-SAFE (no Prisma).
 * Shared by the capture auto-router (server dispatch) and the browser
 * extension chooser endpoint so "matches this page" means the same thing
 * on every surface.
 */

import { workflowGraphSchema } from "./schema";

/** Comma-separated globs → trimmed, non-empty patterns. */
export function parseUrlPatterns(raw: string): string[] {
  return raw
    .split(",")
    .map((pattern) => pattern.trim())
    .filter(Boolean);
}

/** Escape regex specials, `*` becomes `.*`; case-insensitive full match. */
export function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .trim()
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

export function urlMatchesPatterns(
  pageUrl: string,
  patterns: string[]
): boolean {
  return patterns.some((pattern) => globToRegExp(pattern).test(pageUrl));
}

export interface EntryTriggerInfo {
  /** Entry node type (e.g. "trigger-page-capture"), null if unparsable. */
  triggerType: string | null;
  /** Raw urlPattern config on a page-capture trigger ("" = catch-all). */
  urlPattern: string | null;
}

/** Parse a stored workflow definition and describe its entry trigger. */
export function readEntryTrigger(definition: unknown): EntryTriggerInfo {
  const parsed = workflowGraphSchema.safeParse(definition);
  if (!parsed.success) return { triggerType: null, urlPattern: null };
  const graph = parsed.data;
  const entry = graph.nodes.find((node) => node.id === graph.entryNodeId);
  if (!entry) return { triggerType: null, urlPattern: null };
  const urlPattern =
    entry.type === "trigger-page-capture" &&
    typeof entry.config.urlPattern === "string"
      ? entry.config.urlPattern
      : null;
  return { triggerType: entry.type, urlPattern };
}
