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
 * Why this is needed (AI-TOOL-SUMMONER-PLAN §P2). Two sources of wrong-form
 * names, one resolver:
 *
 * 1. **Convention drift.** Ids are snake_case (see NAMING, below). A model
 *    carrying camelCase habits emits `queryDatabase` for `query_database` and
 *    takes a hard `NoSuchToolError` for a spelling difference.
 * 2. **The 2026-09-17 renames.** Four ids were camelCase until the namespace
 *    was made consistent. Those old names live on in places this codebase does
 *    not own: users' charter notes that instruct "read it with getCurrentNote",
 *    and the transcripts of every conversation recorded before the rename. A
 *    semantic rename cannot be reached by normalization, so it is declared.
 *
 * Deliberately NOT fuzzy matching. Only declared aliases and separator/case
 * differences resolve: a genuine near-miss like `search_database` stays an
 * error, because guessing which tool a model *meant* can execute the wrong
 * one. A rename is a fact; similarity is a guess.
 */

/**
 * NAMING — how to mint a new tool id.
 *
 * `snake_case`, matching `^[a-z][a-z0-9]*(_[a-z0-9]+)*$`. No camelCase, no
 * hyphens, no leading verbs in a different tense than the family around it.
 *
 * - **verb_noun**, imperative: `read_content`, `create_note`, `query_database`,
 *   `record_item_result`. The verb says what happens, not what is returned.
 * - **Name the thing it actually operates on**, at the widest scope it truly
 *   covers. `getCurrentNote` was wrong twice over: it read any content type,
 *   not just notes, and it took an explicit id rather than anything "current".
 *   A name that undersells the tool teaches the model not to reach for it.
 * - **Match the family** an adjacent tool already established
 *   (`read_*`, `search_*`, `propose_*`, `record_*`), so selection generalizes.
 * - **Renaming is not free**: user charters and recorded transcripts hold the
 *   old name. A rename ships with a `LEGACY_TOOL_IDS` entry, a settings
 *   carry-forward, and a client display alias — all three, or old chats and
 *   old charters break quietly.
 *
 * `pnpm ai:drift:check` asserts the pattern, so a wrong-shaped id fails CI.
 */

/** Comparison key: case-folded, separators stripped. */
function normalizeToolName(name: string): string {
  return name.replace(/[_\-\s]+/g, "").toLowerCase();
}

/**
 * Ids that were renamed, old → new. These cannot be derived: the words
 * themselves changed. Entries are permanent — a charter note written in 2026
 * still says `getCurrentNote`, and that user is not going to edit it.
 */
export const LEGACY_TOOL_IDS: Readonly<Record<string, string>> = {
  // 2026-09-17 — namespace made consistently snake_case.
  getCurrentNote: "read_content",
  createNote: "create_note",
  updateNote: "update_note",
  renameNote: "rename_note",
  // Earlier rename, previously carried as a special case in the chat route.
  searchNotes: "search_content",
};

/**
 * The real tool id for a called name that is a declared legacy id, or that
 * differs only in case or separators. `null` when the call needs no repair or
 * cannot be repaired safely.
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

  const legacy = LEGACY_TOOL_IDS[called];
  if (legacy && names.includes(legacy)) return legacy;

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

// ── Iteration source ─────────────────────────────────────────────────────

/** Where an iteration run enumerated its items from. */
export type IterationSource =
  | "list-page"
  | "open-tabs"
  | "urls"
  | "database-rows";

/**
 * Resolve `propose_item_iteration.source` from what the model actually wrote.
 *
 * It was a strict `z.enum`, so a run described in prose rather than in the
 * vocabulary — `"open browser tabs (LinkedIn job postings; screened in
 * place)"` — was rejected along with the 24-item enumeration it carried
 * (production, 2026-09-18). The enumeration is the expensive part of that
 * call: it is the output of a browsing pass the model must otherwise redo.
 *
 * Matching is on the distinguishing WORD, not the exact token, because the
 * four sources are mutually exclusive in practice: tabs are not URLs are not
 * a list page are not table rows.
 */
export function resolveIterationSource(
  source: string | undefined,
): IterationSource | null {
  const s = source?.trim().toLowerCase();
  if (!s) return null;
  if (/\btabs?\b/.test(s)) return "open-tabs";
  if (/\b(database|table)[\s-]?rows?\b|\brows?\b/.test(s)) return "database-rows";
  if (/\blist[\s-]?page\b|\bsearch results?\b|\bresults? page\b/.test(s)) return "list-page";
  if (/\burls?\b|\blinks?\b/.test(s)) return "urls";
  return null;
}

// ── Malformed tool-call JSON ─────────────────────────────────────────────

/** Bare words that are legal JSON values and must not be quoted. */
const JSON_LITERALS = new Set(["true", "false", "null"]);

/**
 * Repair tool-call arguments that are not valid JSON, or return `null` when
 * they parse already or cannot be repaired safely.
 *
 * The one failure seen in production (2026-09-18) is an unquoted bare word
 * where a value belongs — `{"budget": large}` — which kills the parse before
 * any schema sees it, so no amount of schema leniency can catch it. Quoting
 * the word is a conservative repair: it cannot change the meaning of a value
 * that was never valid, and a field whose type then disagrees is still
 * rejected by its own schema.
 *
 * Deliberately narrow. It does not balance brackets, close strings, or strip
 * trailing commas — a truncated call is genuinely incomplete, and guessing at
 * its missing half would invent arguments the model never wrote.
 */
export function repairToolInputJson(text: string): string | null {
  try {
    JSON.parse(text);
    return null; // already valid — nothing to repair
  } catch {
    // fall through
  }

  const repaired = text.replace(
    /:(\s*)([A-Za-z_][A-Za-z0-9_-]*)(\s*)([,}\]])/g,
    (whole, pre: string, word: string, post: string, close: string) =>
      JSON_LITERALS.has(word.toLowerCase())
        ? whole
        : `:${pre}"${word}"${post}${close}`,
  );
  if (repaired === text) return null;

  try {
    JSON.parse(repaired);
    return repaired;
  } catch {
    return null; // still broken — let the real error stand
  }
}
