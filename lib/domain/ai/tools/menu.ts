/**
 * THE TOOL MENU — one place for every "when would I reach for this?" line.
 *
 * CLIENT-SAFE: data and pure functions only, no Prisma, no `ai` import.
 *
 * Why this file exists (AI-TOOL-SUMMONER-PLAN §3). A tool's `description`
 * carries two different jobs welded together: *identification* ("this reads
 * database rows", ~20 tokens) and *operation* (filter operators, lifetime
 * semantics, budget protocol — the other ~1,000). The model needs the first to
 * SELECT and the second only to CALL. Serializing all 65 descriptions into
 * every request spent 31,149 tokens — 24% of a 128k window, on every step —
 * to tell the model about tools it would not touch.
 *
 * So: a short line each, here; the full schema arrives when the tool is
 * summoned. Selection logic is edited in this file and nowhere else — change
 * how a tool gets chosen by changing its `selectWhen`, not by rewriting a
 * description the model may never read.
 *
 * `selectWhen` is MODEL-facing and terse. It is not the user-facing settings
 * copy in `metadata.ts` (second person, mentions Settings paths) — two
 * audiences, two strings, deliberately not shared.
 */

/** Groups a summon can name wholesale: `summon(["databases"])`. */
export type ToolFamily =
  | "reading"
  | "writing"
  | "databases"
  | "web"
  | "browser"
  | "editor"
  | "runs"
  | "flashcards"
  | "workflows"
  | "media"
  | "dialog";

export interface ToolMenuEntry {
  /** One clause, model-facing: when to reach for this. ~15 tokens. */
  selectWhen: string;
  family: ToolFamily;
}

/**
 * Every real tool, including harness-internal ones that carry no settings
 * metadata. `pnpm ai:drift:check` asserts this covers the tool set exactly —
 * a new tool with no menu line is a tool the model can never discover.
 */
export const TOOL_MENU: Readonly<Record<string, ToolMenuEntry>> = {
  // ── reading ────────────────────────────────────────────────────────────
  read_content: { family: "reading", selectWhen: "Read any item by id — note, folder notes, database (schema + row preview), file text, link, code, page" },
  search_content: { family: "reading", selectWhen: "Find items by text when you do not have an id" },
  read_folder_context: { family: "reading", selectWhen: "Read a folder's selected sources and children" },
  search_charters: { family: "reading", selectWhen: "Find a charter/playbook note by name when none is loaded" },

  // ── writing ────────────────────────────────────────────────────────────
  create_note: { family: "writing", selectWhen: "Create a new note (only when the user explicitly asked for one)" },
  update_note: { family: "writing", selectWhen: "Write new content into an existing note" },
  rename_note: { family: "writing", selectWhen: "Change an item's title" },
  create_folder: { family: "writing", selectWhen: "Create a folder to hold new items" },
  create_shortcut: { family: "writing", selectWhen: "Place an alias to an existing item somewhere else in the tree" },
  create_docx: { family: "writing", selectWhen: "Produce a .docx file the user can download" },

  // ── databases ──────────────────────────────────────────────────────────
  query_database: { family: "databases", selectWhen: "Read rows — filtered, searched, sorted, counted, or deduped against" },
  describe_database: { family: "databases", selectWhen: "Profile a table: fill rates, value ranges, sample rows, read cost" },
  insert_rows: { family: "databases", selectWhen: "Append new rows to a database" },
  update_row: { family: "databases", selectWhen: "Change cells in ONE row" },
  update_rows: { family: "databases", selectWhen: "Change cells across SEVERAL rows in one transaction — sweep a column, backfill a field" },
  propose_output_database: { family: "databases", selectWhen: "Propose ONE new table for the user to approve" },
  propose_linked_databases: { family: "databases", selectWhen: "Propose SEVERAL tables that reference each other, in one card" },
  propose_database_columns: { family: "databases", selectWhen: "Propose new columns on a table the user already has" },
  propose_column_options: { family: "databases", selectWhen: "Propose the option set for a select/status/multi-select column" },

  // ── web ────────────────────────────────────────────────────────────────
  search_web: { family: "web", selectWhen: "Find pages on the open web" },
  read_page: { family: "web", selectWhen: "Fetch one web page's text" },
  read_page_headless_or_browser: { family: "web", selectWhen: "Fetch a page, escalating into the user's browser when a plain fetch is blocked" },
  open_tab_and_read: { family: "web", selectWhen: "Open a visible tab to read a page the user must see or unblock" },
  extract_structured: { family: "web", selectWhen: "Turn page text you already read into compact rows" },
  propose_research_run: { family: "web", selectWhen: "Propose a bounded multi-page research run for approval" },
  record_research_findings: { family: "web", selectWhen: "Close an approved research run with its audit ledger" },

  // ── browser (co-browsing side panel) ───────────────────────────────────
  co_browse_open: { family: "browser", selectWhen: "Open a page in the user's own browser session" },
  co_browse_act: { family: "browser", selectWhen: "Click, type, scroll or collect on the page the user is watching" },
  read_current_page: { family: "browser", selectWhen: "Read the tab the user is already on, without navigating" },
  list_tabs: { family: "browser", selectWhen: "List the user's open tabs (only when they ask you to work across them)" },

  // ── editor (a document is open) ────────────────────────────────────────
  read_first_chunk: { family: "editor", selectWhen: "Start reading a long open document in pieces" },
  read_next_chunk: { family: "editor", selectWhen: "Continue forward through a chunked document" },
  read_previous_chunk: { family: "editor", selectWhen: "Go back through a chunked document" },
  list_document_outline: { family: "editor", selectWhen: "List top-level blocks with handles — use when the text to change appears more than once" },
  list_document_blocks: { family: "editor", selectWhen: "List rich blocks with their ids and attributes — the read before update_block" },
  append_to_document: { family: "editor", selectWhen: "Add content to the END of the open document; needs no prior read" },
  apply_diff: { family: "editor", selectWhen: "Make a targeted text edit in the MIDDLE of the open document" },
  update_block: { family: "editor", selectWhen: "Replace one block's content in the open document" },
  insert_block: { family: "editor", selectWhen: "Insert a rich block — callout, table, columns, accordion, diagram, embed" },
  insert_image: { family: "editor", selectWhen: "Place an image into the open document" },
  replace_document: { family: "editor", selectWhen: "Replace the open document wholesale (rare; prefer targeted edits)" },

  // ── runs (per-item iteration harness) ──────────────────────────────────
  propose_item_iteration: { family: "runs", selectWhen: "Propose processing a whole enumerated set item by item, for approval" },
  record_item_result: { family: "runs", selectWhen: "Record ONE item's outcome inside an approved run" },
  record_batch_checkpoint: { family: "runs", selectWhen: "Reconcile a completed batch inside a batched run" },
  record_iteration_findings: { family: "runs", selectWhen: "Close an approved run after every item is recorded" },
  add_quest_ledger_column: { family: "runs", selectWhen: "Add a ledger column mid-run when the data needs one" },
  phase_checkpoint: { family: "runs", selectWhen: "Mark a charter phase complete and report what it produced" },

  // ── flashcards ─────────────────────────────────────────────────────────
  list_decks: { family: "flashcards", selectWhen: "See what decks exist" },
  search_decks: { family: "flashcards", selectWhen: "Find a deck by name or subject" },
  get_deck: { family: "flashcards", selectWhen: "Read one deck's cards" },
  propose_deck: { family: "flashcards", selectWhen: "Propose an empty deck for approval" },
  propose_deck_with_cards: { family: "flashcards", selectWhen: "Propose a deck and its cards together, for approval" },
  propose_image_cards: { family: "flashcards", selectWhen: "Propose cards whose prompts are images" },
  propose_sound_id_cards: { family: "flashcards", selectWhen: "Propose cards whose prompts are sounds" },
  propose_cards_from_media: { family: "flashcards", selectWhen: "Propose cards drawn from a media file the user has" },

  // ── workflows ──────────────────────────────────────────────────────────
  list_workflows: { family: "workflows", selectWhen: "See what automation workflows exist" },
  get_workflow: { family: "workflows", selectWhen: "Read one workflow's definition" },
  get_workflow_node_catalog: { family: "workflows", selectWhen: "See which workflow node types are available before authoring" },
  propose_workflow: { family: "workflows", selectWhen: "Propose a new automation workflow for approval" },
  update_workflow: { family: "workflows", selectWhen: "Change an existing workflow's definition" },
  push_workflow_to_n8n: { family: "workflows", selectWhen: "Publish a workflow to the user's n8n instance" },
  run_workflow: { family: "workflows", selectWhen: "Trigger a workflow run" },

  // ── media ──────────────────────────────────────────────────────────────
  generate_image: { family: "media", selectWhen: "Generate an image from a prompt" },
  generate_speech: { family: "media", selectWhen: "Read text aloud as generated audio" },

  // ── dialog ─────────────────────────────────────────────────────────────
  ask_user: { family: "dialog", selectWhen: "Ask a blocking question only the user can answer" },
  notify_user: { family: "dialog", selectWhen: "Tell the user something mid-task without stopping" },
  finish_with_summary: { family: "dialog", selectWhen: "Close a long task with a structured summary" },
  plan: { family: "dialog", selectWhen: "Lay out the steps of a multi-step task before doing it" },
};

/**
 * Always advertised, whenever they are registered at all.
 *
 * The test for core membership is "would a turn be crippled if the model had
 * to discover this?" — the generalist read, the finder, the ordinary writes,
 * and the ways to talk to the user. Everything else is one summon away.
 *
 * `summon` itself is core by construction and is not listed here.
 */
export const CORE_TOOL_IDS: readonly string[] = [
  "read_content",
  "search_content",
  "read_folder_context",
  "create_note",
  "update_note",
  "rename_note",
  "notify_user",
];

/**
 * Advertised whenever the surrounding mode is active — these are not
 * discretionary in their mode: a co-browse turn without `co_browse_act`, or an
 * approved run without `record_item_result`, is a broken turn, not a frugal
 * one. `runs` is deliberately absent: the run harness is advertised by the
 * route only while a run is live.
 */
export const MODE_TOOL_IDS: Readonly<Record<string, readonly string[]>> = {
  // Everything the system prompt's editor section NAMES must be advertised, or
  // the prompt instructs the model to call tools the request withheld — the
  // failure this branch exists to remove. `insert_block` stays summonable
  // despite being an editing tool: at 5,221 tokens it is 17% of the entire
  // prefix on its own, more than this whole mode costs otherwise, and it is
  // reached for far less often than a diff or an append.
  editor: [
    "read_first_chunk",
    "read_next_chunk",
    "read_previous_chunk",
    "list_document_outline",
    "append_to_document",
    "apply_diff",
    "replace_document",
    "plan",
    "ask_user",
    "finish_with_summary",
  ],
  browser: ["co_browse_open", "co_browse_act", "read_current_page", "list_tabs"],
  runs: [
    "propose_item_iteration",
    "record_item_result",
    "record_batch_checkpoint",
    "record_iteration_findings",
    "add_quest_ledger_column",
    "phase_checkpoint",
  ],
};

/** Family order in the rendered menu, most-reached-for first. */
const FAMILY_ORDER: readonly ToolFamily[] = [
  "databases",
  "reading",
  "writing",
  "web",
  "browser",
  "editor",
  "runs",
  "media",
  "flashcards",
  "workflows",
  "dialog",
];

const FAMILY_LABELS: Readonly<Record<ToolFamily, string>> = {
  reading: "Reading",
  writing: "Writing",
  databases: "Databases",
  web: "Web",
  browser: "The user's browser",
  editor: "The open document",
  runs: "Bounded runs",
  flashcards: "Flashcards",
  workflows: "Workflows",
  media: "Media",
  dialog: "Talking to the user",
};

/**
 * Render the menu of tools that exist but are NOT currently advertised.
 *
 * Advertised tools are omitted on purpose: their full schemas are already in
 * the request, and a menu line for them would be a second, weaker copy.
 *
 * `leadWith` puts a family first — during a run, the families that run touches
 * come before the rest. Ordering is the only focus mechanism a menu has: tool
 * absence used to keep a run on task, and discoverability gives that up, so
 * what the model reads first has to earn its place.
 */
export function buildToolMenu(input: {
  /** Every tool registered this turn. */
  registered: Iterable<string>;
  /** Those already advertised in full — excluded from the menu. */
  advertised: ReadonlySet<string>;
  /** Families to hoist to the top, in order. */
  leadWith?: readonly ToolFamily[];
}): string | null {
  const summonable = [...input.registered].filter(
    (id) => !input.advertised.has(id) && TOOL_MENU[id],
  );
  if (summonable.length === 0) return null;

  const lead = input.leadWith ?? [];
  const order = [
    ...lead,
    ...FAMILY_ORDER.filter((f) => !lead.includes(f)),
  ];

  const lines: string[] = [];
  for (const family of order) {
    const inFamily = summonable.filter((id) => TOOL_MENU[id].family === family);
    if (inFamily.length === 0) continue;
    lines.push(`${FAMILY_LABELS[family]}:`);
    for (const id of inFamily) {
      lines.push(`  ${id} — ${TOOL_MENU[id].selectWhen}`);
    }
  }

  return (
    "TOOLS YOU CAN SUMMON. These exist but their instructions are not loaded. " +
    "Call `summon` with the ids (or a family name) you need, then call them on the next step — " +
    "one summon can name several. Summon only what the current step actually needs.\n\n" +
    lines.join("\n")
  );
}

/**
 * Flatten a summon argument into plain names.
 *
 * Models send this three ways: an array, one name, or — twice in one
 * production turn (2026-09-18) — a JSON-encoded array in the string slot,
 * `"[\"web\"]"`. The lenient `array | string` schema accepted that third form
 * and then treated the whole literal as one tool id, so both summons were
 * refused and one tool was never obtained. Unwrap it here, where every caller
 * benefits.
 */
export function flattenSummonNames(names: readonly string[] | string): string[] {
  const raw = Array.isArray(names) ? names : [names];
  const out: string[] = [];
  for (const entry of raw) {
    const trimmed = entry.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (typeof item === "string" && item.trim()) out.push(item.trim());
          }
          continue;
        }
      } catch {
        // Not JSON after all — fall through and treat it as a literal name.
      }
    }
    if (trimmed) out.push(trimmed);
  }
  return out;
}

/**
 * Re-derive what the CURRENT turn has already summoned, from the transcript.
 *
 * A "turn" is one user message plus every assistant step that answers it —
 * but it is NOT one HTTP request. Client-executed tools (`co_browse_*`,
 * `read_current_page`, `list_tabs`, the browser readers) submit their results
 * from the browser, and each submission opens a NEW request. The route's
 * activation set is per-request, so before this, the first browser action
 * silently erased every summon that preceded it.
 *
 * What that looked like in production (2026-09-18): nine tools summoned at
 * step 2, a `read_current_page` at step 3, and for the remaining nineteen
 * steps those tools were unadvertised — still callable, but with no schema in
 * front of the model. It proposed a 20-item run with `items` as bare strings,
 * `source` as prose, `budget` instead of `itemCap`, no `url` on any item and
 * no `captureTo` at all. Every one of those is the signature of a model
 * writing arguments blind.
 *
 * Scanning stops at the last user message: a new user turn is a fresh intent,
 * and carrying activations forever would defeat the point of a menu.
 */
export function activationsFromHistory(
  messages: readonly unknown[],
  registered: ReadonlySet<string>,
): string[] {
  const activate = new Set<string>();

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: string; parts?: unknown };
    if (m?.role === "user") break; // start of this turn — stop here
    if (!Array.isArray(m?.parts)) continue;
    for (const part of m.parts) {
      const p = part as {
        type?: string;
        state?: string;
        input?: { names?: readonly string[] | string };
      };
      if (p?.type !== "tool-summon" || p.state !== "output-available") continue;
      const names = p.input?.names;
      if (names === undefined) continue;
      // Re-resolve rather than parsing the human-readable output: the input is
      // what the model asked for, and the resolver already knows families,
      // stringified arrays and what is actually registered this turn.
      for (const id of resolveSummonNames(names, registered).activate) {
        activate.add(id);
      }
    }
  }

  return [...activate];
}

/** Resolve a summon argument — a tool id or a family name — to tool ids. */
export function resolveSummonNames(
  names: readonly string[] | string,
  registered: ReadonlySet<string>,
): { activate: string[]; unknown: string[] } {
  const activate = new Set<string>();
  const unknown: string[] = [];

  for (const raw of flattenSummonNames(names)) {
    const name = raw.trim();
    if (registered.has(name) && TOOL_MENU[name]) {
      activate.add(name);
      continue;
    }
    const family = name.toLowerCase() as ToolFamily;
    const inFamily = [...registered].filter(
      (id) => TOOL_MENU[id]?.family === family,
    );
    if (inFamily.length > 0) {
      for (const id of inFamily) activate.add(id);
      continue;
    }
    unknown.push(name);
  }

  return { activate: [...activate], unknown };
}
