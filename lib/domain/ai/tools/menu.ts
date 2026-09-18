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
  update_row: { family: "databases", selectWhen: "Change cells in existing rows" },
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
  list_document_blocks: { family: "editor", selectWhen: "See the open document's block structure before editing it" },
  apply_diff: { family: "editor", selectWhen: "Make a targeted text edit in the open document" },
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
  editor: [
    "read_first_chunk",
    "read_next_chunk",
    "read_previous_chunk",
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

/** Resolve a summon argument — a tool id or a family name — to tool ids. */
export function resolveSummonNames(
  names: readonly string[],
  registered: ReadonlySet<string>,
): { activate: string[]; unknown: string[] } {
  const activate = new Set<string>();
  const unknown: string[] = [];

  for (const raw of names) {
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
