/**
 * Playbook import registry (AI v3.2 T3, P5-import).
 *
 * Adding a framework = append an adapter here; the import route and the
 * playbook runtime are untouched (they operate on the internal note only).
 * See AI-V3.2-T3-PLAYBOOKS-PLAN.md §2 for the backlog adapters (fabric,
 * mcp-prompt, …).
 *
 * Pure module (no Prisma) — importable client-side for preview and under tsx.
 */

import { skillMdAdapter } from "./skill-md";
import type { ImportedPlaybook, SkillImportAdapter } from "./types";

/** Registered import formats, in detection priority order. */
export const IMPORT_ADAPTERS: SkillImportAdapter[] = [skillMdAdapter];

/** First adapter that recognizes the raw text, or null. */
export function detectAdapter(raw: string): SkillImportAdapter | null {
  return IMPORT_ADAPTERS.find((a) => a.detect(raw)) ?? null;
}

/** Detect + parse in one step. Null when nothing recognizes/parses it. */
export function importPlaybook(
  raw: string,
): { adapter: SkillImportAdapter; parsed: ImportedPlaybook } | null {
  const adapter = detectAdapter(raw);
  if (!adapter) return null;
  const parsed = adapter.parse(raw);
  if (!parsed) return null;
  return { adapter, parsed };
}

export { skillMdAdapter } from "./skill-md";
export type { ImportedPlaybook, SkillImportAdapter } from "./types";
