/**
 * Playbook import adapters (AI v3.2 T3, P5-import)
 *
 * A playbook is framework-agnostic internally (a note: title + `##` phases +
 * `[[refs]]` + `metadata.playbook`). Frameworks exist ONLY as import adapters
 * that convert an external format into that internal note. SKILL.md
 * (Anthropic Agent Skills) is adapter #1; fabric patterns, MCP prompt
 * templates, etc. are future adapters behind this same interface — the
 * runtime never learns about them.
 *
 * See docs/notes-feature/work-tracking/AI-V3.2-T3-PLAYBOOKS-PLAN.md §2.
 *
 * Adapters are PURE (no Prisma, no server-only) so they run client-side for
 * preview and under tsx for tests. Note creation from an ImportedCharter is
 * a separate server concern (the import route).
 */

/** The internal shape every adapter produces from its source format. */
export interface ImportedCharter {
  /** → the playbook note's title. */
  name: string;
  /** → `metadata.playbookDescription` (the /playbook picker one-liner). */
  description: string;
  /** → the note body via markdownToTiptap (`##` sections become phases). */
  bodyMarkdown: string;
}

/** One importable external format. */
export interface SkillImportAdapter {
  /** Stable id, e.g. "skill-md" | "fabric" | "mcp-prompt". */
  id: string;
  /** Human label for the picker, e.g. "Anthropic SKILL.md". */
  label: string;
  /** Cheap sniff: does this raw text look like this format? */
  detect(raw: string): boolean;
  /** Parse to the internal shape, or null if it isn't actually this format. */
  parse(raw: string): ImportedCharter | null;
}
