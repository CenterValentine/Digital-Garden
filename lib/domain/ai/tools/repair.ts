/**
 * Tool-call repair — making a malformed call RESOLVE ITSELF instead of dying.
 *
 * PURE: no Prisma, no `ai` imports, so the rules can be unit-tested and the
 * callers stay thin.
 *
 * Two rules live here, both answering the same failure shape: the model had
 * the substance right and the form wrong, and a strict contract threw the
 * substance away.
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

// ── Item status ──────────────────────────────────────────────────────────

/** The three outcomes an iterated item can have. */
export type ItemStatus = "done" | "unreadable" | "blocked";

/**
 * Words models reach for instead of the three canonical ones. Conservative on
 * purpose: only terms whose mapping is unambiguous. Anything else falls
 * through to the evidence test below rather than being forced into a bucket.
 */
const STATUS_SYNONYMS: Readonly<Record<string, ItemStatus>> = {
  done: "done",
  complete: "done",
  completed: "done",
  analyzed: "done",
  analysed: "done",
  recorded: "done",
  success: "done",
  unreadable: "unreadable",
  unread: "unreadable",
  empty: "unreadable",
  blocked: "blocked",
  captcha: "blocked",
  login: "blocked",
  paywall: "blocked",
  forbidden: "blocked",
};

export type ItemStatusResolution =
  | { status: ItemStatus; note?: string }
  | { needsStatus: string };

/**
 * Resolve an item's status from what the model actually sent.
 *
 * `record_item_result.status` used to be a required `z.enum`, so a call that
 * omitted it was rejected by Zod BEFORE `execute` — the whole call, including
 * a full verdict, a score, and nine captured cells. A production run lost its
 * best-scoring item that way (AI-TOOL-SUMMONER-PLAN §1.3), and the model,
 * getting a hard error rather than a result, moved on without retrying.
 *
 * The rule now: a status is *resolved*, not *demanded*.
 *
 * - A recognized word — canonical or an unambiguous synonym — is taken.
 * - No usable word, but the call carries EVIDENCE the item was analyzed (a
 *   verdict, a score, a qualified flag, captured cells) → `done`. That is not
 *   a guess: an item cannot be scored 91/100 and also unread.
 * - No word and no evidence → `needsStatus`, returned from `execute` as an
 *   ordinary tool RESULT. The model can correct itself on the next step
 *   instead of taking an error it cannot act on. This is the one case where
 *   inferring would fabricate an outcome the model never claimed.
 */
export function resolveItemStatus(input: {
  status?: string;
  verdict?: string;
  fitPercent?: number;
  qualified?: boolean;
  hasCapture?: boolean;
}): ItemStatusResolution {
  const raw = input.status?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (raw) {
    const mapped = STATUS_SYNONYMS[raw];
    if (mapped) {
      return mapped === input.status
        ? { status: mapped }
        : { status: mapped, note: `status "${input.status}" read as "${mapped}"` };
    }
  }

  const analyzed =
    Boolean(input.verdict?.trim()) ||
    typeof input.fitPercent === "number" ||
    typeof input.qualified === "boolean" ||
    input.hasCapture === true;

  if (analyzed) {
    return {
      status: "done",
      note: raw
        ? `status "${input.status}" is not one of done/unreadable/blocked — recorded as "done", which the verdict you supplied implies`
        : 'status was missing — recorded as "done", which the verdict you supplied implies',
    };
  }

  return {
    needsStatus:
      'Nothing was recorded: this call had no status, and no verdict, score or captured cells to infer one from. Call record_item_result again for this item with status "done" (analyzed), "unreadable" (could not read the page) or "blocked" (login/captcha stopped you).',
  };
}
