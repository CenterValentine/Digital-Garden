/**
 * Tool-call repair — the net under a model that names a tool the way the
 * *other* half of this namespace is named.
 *
 * PURE: no Prisma, no `ai` imports, so the rules can be unit-tested and the
 * route stays thin.
 *
 * Why this is needed (AI-TOOL-SUMMONER-PLAN §P2). The tool namespace mixes
 * conventions — `getCurrentNote`, `createNote`, `updateNote`, `renameNote` are
 * camelCase; the other sixty-one ids are snake_case. A model that has settled
 * into one convention emits the other (`create_note`, `queryDatabase`), and
 * the SDK answers with `NoSuchToolError` — a hard failure for what is purely a
 * spelling difference.
 *
 * Deliberately NOT fuzzy matching. Only separator/case differences resolve: a
 * genuine near-miss like `search_database` must stay an error, because
 * guessing which tool a model *meant* can execute the wrong one. Normalization
 * is a rename; similarity is a guess.
 */

/** Comparison key: case-folded, separators stripped. */
function normalizeToolName(name: string): string {
  return name.replace(/[_\-\s]+/g, "").toLowerCase();
}

/**
 * The real tool id for a called name that differs only in case or separators,
 * or `null` when the call needs no repair or cannot be repaired safely.
 *
 * Returns `null` for an exact hit (nothing to repair), for an unknown name,
 * and for the pathological case where two real ids normalize alike — there,
 * silence beats a coin flip.
 */
export function resolveToolNameAlias(
  called: string,
  known: Iterable<string>,
): string | null {
  const names = [...known];
  if (names.includes(called)) return null;

  const key = normalizeToolName(called);
  const matches = names.filter((n) => normalizeToolName(n) === key);
  return matches.length === 1 ? matches[0] : null;
}
