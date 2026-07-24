/**
 * Anthropic SKILL.md import adapter (AI v3.2 T3, P5-import).
 *
 * SKILL.md = YAML frontmatter (`name`, `description`) + a markdown body whose
 * `##` sections are the playbook's phases. This is the ecosystem format the
 * whole playbook design was aligned to, so the mapping is 1:1.
 *
 * Deliberately hand-parses the two frontmatter fields we need rather than
 * pulling a YAML dependency — the shape is fixed and simple (`key: value`
 * scalars, optionally quoted). The repo has no YAML lib and doesn't need one
 * for this; a full parser can replace this if richer frontmatter ever matters.
 */

import type { SkillImportAdapter } from "./types";

// Leading `---\n … \n---` frontmatter block (tolerant of CRLF). Non-greedy so
// it stops at the FIRST closing fence, not a later `---` thematic break.
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Parse `key: value` scalar lines from a frontmatter block. */
function parseFrontmatterFields(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    // Strip a matching pair of surrounding quotes (YAML scalar).
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    out[m[1].toLowerCase()] = value;
  }
  return out;
}

export const skillMdAdapter: SkillImportAdapter = {
  id: "skill-md",
  label: "Anthropic SKILL.md",

  detect(raw) {
    const m = FRONTMATTER_RE.exec(raw.trimStart());
    if (!m) return false;
    // A SKILL.md is identified by a frontmatter block carrying a `name`.
    return Boolean(parseFrontmatterFields(m[1]).name);
  },

  parse(raw) {
    const trimmed = raw.trimStart();
    const m = FRONTMATTER_RE.exec(trimmed);
    if (!m) return null;
    const fields = parseFrontmatterFields(m[1]);
    const name = fields.name?.trim();
    if (!name) return null;
    return {
      name,
      description: fields.description?.trim() ?? "",
      bodyMarkdown: trimmed.slice(m[0].length).trim(),
    };
  },
};
