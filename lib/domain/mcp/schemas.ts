/**
 * Tool input schemas for the garden's MCP server (MCP-DATABASE-REACH-PLAN
 * §2, §8.3).
 *
 * Every schema is a flat object with named properties, enums for closed
 * sets, a description on every field and defaults stated in the
 * description: that is the subset of JSON Schema every vendor's client
 * converts the same way (Claude, OpenAI, Gemini, and the open-weight
 * harnesses that are sloppier still). No top-level unions, no recursive
 * refs — which is why `filters` is a flat list and never the DataView tree.
 *
 * Pure: the gate loads this file and asserts the rules above.
 */

import { z } from "zod";

const CONTENT_TYPES = [
  "note",
  "folder",
  "data",
  "file",
  "code",
  "html",
  "external",
  "visualization",
  "workflow",
  "shortcut",
] as const;

const id = z.string().describe("A content id (UUID) from garden_search or garden_list_tree");
const database = z
  .string()
  .describe("The database's id, or its exact title when it is unique within the token's reach");

const cellValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]);

export const CELL_VALUE_LEGEND =
  "Cell values by column type — number: a number or numeric string (\"1,234.50\" is fine); date: YYYY-MM-DD or ISO; checkbox: true/false; select/status: an option label; multiSelect: labels (freeform columns accept new ones); relation: the linked rows' titles or [handles]; file/contentLink: content ids; computed columns (formula, rollup, lookup, autoNumber, created/updated) cannot be written.";

export const searchInput = z.object({
  query: z
    .string()
    .describe("Text to match against titles and indexed content. Empty = list the most recently updated items of `types`."),
  types: z
    .array(z.enum(CONTENT_TYPES))
    .optional()
    .describe('Restrict to these content types ("data" = a database). Default: note, folder, data.'),
  tags: z.array(z.string()).optional().describe("Tag slugs the item must carry ALL of."),
  limit: z.number().int().min(1).max(50).optional().describe("Maximum hits. Default 10, max 50."),
});

export const listTreeInput = z.object({
  rootId: z
    .string()
    .optional()
    .describe("Folder to list from. Default: the token's root folders."),
  depth: z.number().int().min(1).max(3).optional().describe("Levels to descend. Default 1, max 3."),
});

export const READ_PARTS = ["body", "tags", "backlinks", "outline", "profile", "context"] as const;

export const readInput = z.object({
  id,
  parts: z
    .array(z.enum(READ_PARTS))
    .optional()
    .describe('What to include. Default ["body", "tags", "context"]. Add "backlinks" (what links here), "outline" (blocks with their ids and types), "profile" (databases only: value distributions over up to 5,000 rows). Omit "body" for a cheap metadata read.'),
  backlinkTypes: z
    .array(z.enum([...CONTENT_TYPES, "conversation"]))
    .optional()
    .describe('Content types to include among backlinks. Default: every type EXCEPT "conversation" (chats are opt-in).'),
});

export const FILTER_OPS = [
  "equals",
  "notEquals",
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
  "isEmpty",
  "isNotEmpty",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "notIn",
  "before",
  "after",
] as const;

export const queryRowsInput = z.object({
  database,
  filters: z
    .array(
      z.object({
        column: z.string().describe("Column name"),
        op: z.enum(FILTER_OPS).describe("Comparison"),
        value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional().describe("Value; omitted for isEmpty/isNotEmpty"),
      })
    )
    .optional()
    .describe("Flat list of conditions, ANDed."),
  search: z.string().optional().describe("Text to match against any cell."),
  rows: z
    .array(z.string())
    .max(100)
    .optional()
    .describe("Fetch THESE rows by [handle] or id (max 100). Pair with columns: \"all\" for every property."),
  view: z.string().optional().describe("Apply a saved view's filters and sorts, by name or id."),
  columns: z
    .union([z.literal("all"), z.array(z.string())])
    .optional()
    .describe('Columns to return: a list of names, or "all". Default: the index tier (title + a few columns + one linked title per relation, about 65 tokens a row).'),
  relations: z
    .enum(["titles", "handles", "counts"])
    .optional()
    .describe('How relation cells render. "titles" (default), "handles" (so you can fetch the linked rows), or "counts".'),
  digests: z.boolean().optional().describe("Append each row's one-line AI digest when the database keeps them. Default false."),
  sortBy: z.string().optional().describe("Column to sort by."),
  sortDirection: z.enum(["asc", "desc"]).optional().describe("Default asc."),
  groupBy: z.string().optional().describe("Group counts by this column instead of listing rows."),
  limit: z.number().int().min(1).max(1000).optional().describe("Rows per page. Default 100."),
  cursor: z.string().optional().describe("Continue from a previous result's nextCursor."),
});

export const insertRowsInput = z.object({
  database,
  rows: z
    .array(z.record(z.string(), cellValue))
    .min(1)
    .max(25)
    .describe(`Rows to append, each {columnName: value}; max 25. ${CELL_VALUE_LEGEND}`),
  dedupeBy: z
    .string()
    .optional()
    .describe("Column name: a row whose value here already exists is returned (with its handle) instead of inserted."),
});

export const updateRowsInput = z.object({
  database,
  updates: z
    .array(
      z.object({
        row: z.string().describe("The row's [handle] or id from garden_query_rows"),
        cells: z.record(z.string(), cellValue).describe("ONLY the columns to change: {columnName: newValue}; null clears"),
        merge: z.array(z.string()).optional().describe("Columns (from cells) to MERGE into rather than replace — multi-value cells only"),
        expect: z
          .record(z.string(), cellValue)
          .describe("The values you last read for the columns you are changing. Required: the write fails if a cell changed meanwhile (compare-and-set)."),
      })
    )
    .min(1)
    .max(25)
    .describe(`Rows to change; max 25; all-or-nothing. ${CELL_VALUE_LEGEND}`),
});

export const deleteRowsInput = z.object({
  database,
  rows: z.array(z.string()).min(1).max(25).describe("The rows to soft-delete, by [handle] or id; max 25."),
  reason: z.string().min(1).max(280).describe("Why these rows go, in the user's words. Shown when the user is asked to confirm."),
});

export const writeNoteInput = z.object({
  id: z.string().optional().describe("The note to write to. Omit to CREATE a new note."),
  title: z.string().optional().describe("Title for a new note (required when id is omitted)."),
  parentId: z
    .string()
    .optional()
    .describe("Folder for a new note. Required unless the token has exactly one root folder. Never the garden root — use garden_list_tree to choose where the user keeps this kind of thing."),
  content: z.string().describe("Markdown. Leave any ```dg-block fences you read exactly as they were — they are blocks the serializer could not express as markdown."),
  mode: z
    .enum(["append", "replace"])
    .optional()
    .describe('"append" (default) adds blocks at the end and can never lose content. "replace" rewrites the whole note and requires expectUpdatedAt.'),
  expectUpdatedAt: z
    .string()
    .optional()
    .describe("The note's updatedAt you last read (ISO). Required for replace: the write fails if the note changed meanwhile."),
});

export const writeCodeInput = z.object({
  id: z.string().optional().describe("The code node to overwrite. Omit to create one."),
  parentId: z.string().optional().describe("Folder for a new code node (required when id is omitted)."),
  title: z.string().optional().describe("Title for a new code node (required when id is omitted)."),
  language: z.string().optional().describe("Language id, e.g. typescript, python, sql (new nodes)."),
  code: z.string().describe("The full source text."),
  expectUpdatedAt: z.string().optional().describe("The node's updatedAt you last read (ISO). Required when id is given."),
});

export const uploadFileInput = z.object({
  parentId: z.string().describe("Folder to upload into."),
  filename: z.string().min(1).max(255).describe("File name with extension."),
  mimeType: z.string().describe("MIME type, e.g. image/png, application/pdf, text/csv."),
  base64: z.string().optional().describe("The bytes, base64-encoded. Max 2 MB decoded. Use sourceUrl for anything you did not generate yourself."),
  sourceUrl: z.string().url().optional().describe("A fetchable https URL; the server downloads the bytes so nothing passes through your output."),
  overwriteContentId: z.string().optional().describe("Replace this existing file node's bytes in place (same id, every reference follows)."),
});

export const createFolderInput = z.object({
  parentId: z.string().describe("Parent folder."),
  title: z.string().min(1).max(255).describe("Folder title. An existing folder with this title is returned instead of duplicated."),
});

export const insertBlockInput = z.object({
  noteId: z.string().describe("The note to insert into."),
  blockType: z.string().describe("A block type from the catalog (see garden_read with parts: [\"outline\"], or the server instructions)."),
  attrs: z.record(z.string(), z.unknown()).optional().describe("The block's attributes, validated against its schema."),
  content: z.string().optional().describe("Markdown for blocks that hold content (columns, tabs, card panel)."),
  afterBlockId: z.string().optional().describe("Insert after this block id (from the outline). Default: append."),
});

export const updateBlockInput = z.object({
  noteId: z.string().describe("The note that holds the block."),
  blockId: z.string().describe("The block id from the outline."),
  attrs: z.record(z.string(), z.unknown()).describe("Attributes to change; validated against the block's schema."),
});

export const updateAiContextInput = z.object({
  id,
  oneLiner: z.string().max(280).optional().describe("A one-line index line for this node."),
  sections: z
    .record(z.string(), z.string())
    .optional()
    .describe("Context sections by kind, e.g. {\"summary\": \"…\", \"howToUse\": \"…\"}."),
  mode: z.enum(["merge", "replace"]).optional().describe("merge (default) updates the given keys; replace rewrites the context."),
});

export const chatsSearchInput = z.object({
  query: z.string().optional().describe("Matches chat titles and any visible message's text. Empty = most recent."),
  about: z.string().optional().describe("A content id: only chats bound to or associated with it."),
  since: z.string().optional().describe("ISO date: only chats updated after it."),
  limit: z.number().int().min(1).max(20).optional().describe("Default 10, max 20."),
});

export const CHAT_PARTS = ["messages", "associations", "outputs", "diagnostics"] as const;

export const chatReadInput = z.object({
  id: z.string().describe("The conversation id from garden_chats_search."),
  parts: z
    .array(z.enum(CHAT_PARTS))
    .optional()
    .describe('Default ["messages"]. "associations": the content this chat is about; "outputs": notes and rows it produced; "diagnostics": per-turn model route, token usage, finish reason, tool count and flags.'),
  range: z
    .object({
      last: z.number().int().min(1).max(200).optional().describe("The last N messages. Default 40."),
    })
    .optional()
    .describe("Message window."),
});

export const reportIssueInput = z.object({
  kind: z.enum(["bug", "feature", "small-change"]).describe("What is being filed."),
  title: z.string().min(4).max(120).describe("Short title."),
  body: z.string().min(10).max(4000).describe("What happened, what you expected, how to reproduce. Never paste note content."),
  area: z.string().optional().describe("Area label if known (e.g. databases, editor, mcp)."),
  errorId: z.string().optional().describe("The errorId from a failed tool result, if this reports one."),
});

/** ChatGPT connector aliases (§8.4). */
export const chatgptSearchInput = z.object({ query: z.string().describe("Search text.") });
export const chatgptFetchInput = z.object({ id: z.string().describe("An id from search results.") });

export type ReadPart = (typeof READ_PARTS)[number];
export type ChatPart = (typeof CHAT_PARTS)[number];
