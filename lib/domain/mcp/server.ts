import { deleteContent } from "./tools/content";
import type { ContentDrafter } from "@/lib/domain/content/authorship";
import "server-only";

/**
 * The garden's MCP server (MCP-DATABASE-REACH-PLAN): one `McpServer`
 * factory that registers every tool, resource and prompt against a
 * verified principal. The route mounts it behind bearer auth; nothing
 * here reads a request header.
 *
 * Design rules carried from the plan: tools call domain services, never
 * Prisma where a service exists; every result has a text block and, where
 * useful, `structuredContent`; read tools are annotated read-only; every
 * write tool checks its capability first; notes leave through ONE seam.
 */

import {
  McpServer,
  ResourceTemplate,
  type CallToolResult,
  type InputRequiredResult,
  type ServerContext,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import { hasCapability, principalFrom, type McpPrincipal } from "./auth";
import { McpScope } from "./jurisdiction";
import { needsCapability, ok, refuse, type McpToolResult } from "./results";
import {
  chatReadInput,
  chatsSearchInput,
  chatgptFetchInput,
  chatgptSearchInput,
  createFolderInput,
  deleteRowsInput,
  deleteContentInput,
  insertBlockInput,
  insertRowsInput,
  listTreeInput,
  queryRowsInput,
  readInput,
  reportIssueInput,
  searchInput,
  updateAiContextInput,
  updateBlockInput,
  updateRowsInput,
  uploadFileInput,
  writeCodeInput,
  writeNoteInput,
  CELL_VALUE_LEGEND,
} from "./schemas";
import { read, search, tree } from "./tools/read";
import { deleteRows, insertRows, queryRows, updateRows } from "./tools/data";
import { blockCatalogText, createFolder, insertBlock, updateBlock, uploadFile, writeCode, writeNote } from "./tools/files";
import { updateAiContext } from "./tools/context";
import { chatInScope, readChat, searchChats } from "./tools/chats";
import { reportIssue } from "./tools/issues";
import { REPORT_ISSUE_PROMPT, listCharterPrompts, renderCharter } from "./prompts";
import {
  databaseSchemaResource,
  fileResource,
  listDatabaseResources,
  noteResource,
  rowResource,
  viewResource,
} from "./resources";

export const SERVER_INFO = { name: "digital-garden", version: "1.0.0" } as const;

export const SERVER_INSTRUCTIONS = `This is a user's Digital Garden: notes, folders, databases (tables with typed columns and rows), files and chats.
Find before you guess: garden_search (empty query + types lists what exists), garden_list_tree, then garden_read for one item. Databases: garden_read gives the schema and a preview; garden_query_rows pages rows — start from the index tier, narrow with columns/filters/view, follow nextCursor until it is null before claiming completeness. Rows are addressed by [8-hex handles].
Writes need the token's capability and are named for their consent model: garden_insert_rows (partial on bad cells), garden_update_rows (all-or-nothing, expect is required), garden_delete_rows (the table's own policy decides; you may be asked to confirm), garden_write_note (append by default; replace requires expectUpdatedAt, and a destructive rewrite is approved only for a note an AI drafted), garden_write_code, garden_upload_file, garden_create_folder, garden_delete_content (trashes only content an MCP token drafted; the user's own content is refused), garden_insert_block / garden_update_block (typed blocks by catalog), garden_update_ai_context (when a read says the context is stale).
Two writable text slots on every item: its NOTES (a note's body, or the notes panel of a database, folder, file or chat — garden_write_note with the item's id) and its AI CONTEXT (garden_update_ai_context). Notes are what the user reads; context is what agents read. A summary or write-up the user asks for goes in the notes unless they say "context" or "AI context"; then say in your reply that the context can be updated too. If the request names both, or you cannot tell which reader is meant, ask before writing.
Leave any \`\`\`dg-block fences exactly as read. Never create at the garden root. Chats are a separate tool pair (garden_chats_search, garden_chat_read) and read-only.
If a tool fails twice with the same internal error, or a result contradicts what you just read, file it with garden_report_issue (never paste note content), then continue on a safer path.`;

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false } as const;

type Session = { principal: McpPrincipal; scope: McpScope };

/** Content an MCP token creates is stamped as MCP-drafted (authorship.ts):
 * it may later be rewritten freely and trashed by garden_delete_content. */
function mcpDrafter(s: Session): ContentDrafter {
  return { kind: "mcp", ref: s.principal.token.id };
}

function sessionFrom(ctx: ServerContext): Session | null {
  const principal = principalFrom(ctx.http?.authInfo);
  if (!principal) return null;
  return { principal, scope: new McpScope(principal) };
}

const UNAUTHENTICATED: McpToolResult = refuse("No valid MCP token on this request.");

type ToolReturn = CallToolResult | InputRequiredResult;

function withSession<A>(
  fn: (s: Session, args: A, ctx: ServerContext) => Promise<ToolReturn>
): (args: A, ctx: ServerContext) => Promise<ToolReturn> {
  return async (args, ctx) => {
    const s = sessionFrom(ctx);
    if (!s) return UNAUTHENTICATED as CallToolResult;
    return fn(s, args, ctx);
  };
}

function requireCapability(s: Session, cap: Parameters<typeof hasCapability>[1], action: string): McpToolResult | null {
  return hasCapability(s.principal, cap) ? null : needsCapability(cap, action);
}

export function createGardenMcpServer(server: McpServer): void {
  // ── find ──────────────────────────────────────────────────────────────
  server.registerTool(
    "garden_search",
    {
      title: "Search the garden",
      description:
        "Search notes, folders, databases and files by title and indexed content, including text inside database rows (a row hit surfaces its table with the row's handle). Empty query + types lists the most recent items of those types — use that to see what exists before guessing names or ids.",
      inputSchema: searchInput,
      annotations: READ,
    },
    withSession(async (s, args) => search(s.scope, args))
  );

  server.registerTool(
    "garden_list_tree",
    {
      title: "List folders and items",
      description: "List the folder tree from a root (default: the token's roots), up to 3 levels, with each item's type, id and child count. Use it to choose where a new note belongs.",
      inputSchema: listTreeInput,
      annotations: READ,
    },
    withSession(async (s, args) => tree(s.scope, args))
  );

  server.registerTool(
    "garden_read",
    {
      title: "Read one item",
      description:
        'Read one item by id. Notes come back as markdown (the same text garden_write_note accepts) with any file links rewritten to 15-minute download URLs; databases as their schema plus a 25-row preview (add parts: ["profile"] for value distributions); folders as their AI context and contents; files as their extracted text plus a download URL, and an image file is attached as an image you can see. parts may add "images" (a note\'s images attached as images, up to 6), "backlinks" (what links here; chats only when backlinkTypes includes "conversation"), "outline" (headings and typed blocks with ids), and may omit "body". Every read includes the item\'s AI context and whether it is stale.',
      inputSchema: readInput,
      annotations: READ,
    },
    withSession(async (s, args) => read(s.scope, s.principal, args))
  );

  // ── databases ─────────────────────────────────────────────────────────
  server.registerTool(
    "garden_query_rows",
    {
      title: "Query database rows",
      description:
        'Read rows from a database. A PAGE call (filters, search, a saved view) answers "which rows" and returns the index tier (~65 tokens a row: title, a few columns, one linked title per relation). A FETCH call (rows: [handles] + columns: "all") returns every property of those rows. Results carry {returned, total, nextCursor}: keep paging until nextCursor is null before saying you read everything. relations: "handles" gives linked rows\' handles so you can fetch them from their table. groupBy returns counts instead of rows.',
      inputSchema: queryRowsInput,
      annotations: READ,
    },
    withSession(async (s, args) => queryRows(s.scope, s.principal, args))
  );

  server.registerTool(
    "garden_insert_rows",
    {
      title: "Insert database rows",
      description: `Append up to 25 rows to a database. Partial on bad cells: rows are created without the rejected cells and the rejections are reported, so fix them with garden_update_rows. dedupeBy returns an existing row instead of inserting a duplicate. Relation cells link by the target rows' titles or handles. ${CELL_VALUE_LEGEND}`,
      inputSchema: insertRowsInput,
      annotations: WRITE,
    },
    withSession(async (s, args) => requireCapability(s, "garden:write-rows", "insert rows") ?? insertRows(s.scope, args))
  );

  server.registerTool(
    "garden_update_rows",
    {
      title: "Update database rows",
      description: `Change cells across up to 25 rows in ONE transaction, all-or-nothing. expect (the values you last read for the columns you change) is required: if a cell changed meanwhile, nothing is written and the current values come back. null clears a cell; a relation cell REPLACES that row's links. ${CELL_VALUE_LEGEND}`,
      inputSchema: updateRowsInput,
      annotations: WRITE,
    },
    withSession(async (s, args) => requireCapability(s, "garden:write-rows", "update rows") ?? updateRows(s.scope, args))
  );

  server.registerTool(
    "garden_delete_rows",
    {
      title: "Delete database rows",
      description:
        "Soft-delete up to 25 rows (the user can restore them from the grid's Undo). The database's owner sets its AI deletion policy: Ask me (default) — you will be asked to get the user's confirmation; Allowed — deleted at once and the user is notified; Never — refused. Give the reason in the user's words. Only delete rows the user named or clearly described.",
      inputSchema: deleteRowsInput,
      annotations: DESTRUCTIVE,
    },
    withSession(async (s, args, ctx) => requireCapability(s, "garden:delete-rows", "delete rows") ?? deleteRows(s.scope, s.principal, args, ctx))
  );

  server.registerTool(
    "garden_delete_content",
    {
      title: "Delete content the MCP drafted",
      description:
        "Move a note, folder, file or code item to the trash — only one an MCP token created (any of the user's tokens). Content the user wrote is refused; a folder is refused if anything inside it was not MCP-drafted. Restorable for 30 days; the user gets an inbox notice. Give the reason in the user's words.",
      inputSchema: deleteContentInput,
      annotations: DESTRUCTIVE,
    },
    withSession(async (s, args) => requireCapability(s, "garden:delete-content", "delete content") ?? deleteContent(s.scope, s.principal, args))
  );

  // ── files ─────────────────────────────────────────────────────────────
  server.registerTool(
    "garden_write_note",
    {
      title: "Write a note",
      description:
        "Create a note (omit id; give title and parentId — never the garden root, use garden_list_tree to choose) or write to an existing item. With a note's id this writes the note; with a database, folder, file or chat id it writes that item's notes panel (\"Add notes\" in the app) — the place a summary the USER asked for belongs, where they will read it. AI context is a different slot (garden_update_ai_context). mode append (default) adds markdown at the end and can never lose content. mode replace rewrites the whole document, requires expectUpdatedAt from your last read, and is refused if it would destroy most of it. Leave any ```dg-block fences you read exactly as they were.",
      inputSchema: writeNoteInput,
      annotations: WRITE,
    },
    withSession(async (s, args) => requireCapability(s, "garden:write-files", "write notes") ?? writeNote(s.scope, args, mcpDrafter(s)))
  );

  server.registerTool(
    "garden_write_code",
    {
      title: "Write a code file",
      description: "Create a code node (parentId, title, language, code) or overwrite one (id, code, expectUpdatedAt from your last read).",
      inputSchema: writeCodeInput,
      annotations: WRITE,
    },
    withSession(async (s, args) => requireCapability(s, "garden:write-files", "write code") ?? writeCode(s.scope, args, mcpDrafter(s)))
  );

  server.registerTool(
    "garden_upload_file",
    {
      title: "Upload a file",
      description:
        "Store a file in a folder: base64 for bytes you generated (max 2 MB decoded), or sourceUrl for anything already hosted (the server fetches it, max 25 MB). overwriteContentId replaces an existing file's bytes in place. Text is extracted for search where the format allows.",
      inputSchema: uploadFileInput,
      annotations: WRITE,
    },
    withSession(async (s, args) => requireCapability(s, "garden:write-files", "upload files") ?? uploadFile(s.scope, args, mcpDrafter(s)))
  );

  server.registerTool(
    "garden_create_folder",
    {
      title: "Create a folder",
      description: "Create a folder under a parent, or return the existing one with that title.",
      inputSchema: createFolderInput,
      annotations: WRITE,
    },
    withSession(async (s, args) => requireCapability(s, "garden:write-files", "create folders") ?? createFolder(s.scope, args, mcpDrafter(s)))
  );

  server.registerTool(
    "garden_insert_block",
    {
      title: "Insert a typed block",
      description: `Insert a rich block (hero, pricing card, timeline, columns, callout…) into a note by catalog type, with attrs validated against the block's schema. Append by default, or after a block id from garden_read parts: ["outline"]. Blocks that stack children (accordion, cardPanel, listContainer) accept markdown in content.\n\n${blockCatalogText()}`,
      inputSchema: insertBlockInput,
      annotations: WRITE,
    },
    withSession(async (s, args) => requireCapability(s, "garden:write-files", "insert blocks") ?? insertBlock(s.scope, args))
  );

  server.registerTool(
    "garden_update_block",
    {
      title: "Update a typed block",
      description: "Change a block's attributes by its block id (from the outline). Unknown attribute names are refused with the valid list.",
      inputSchema: updateBlockInput,
      annotations: WRITE,
    },
    withSession(async (s, args) => requireCapability(s, "garden:write-files", "update blocks") ?? updateBlock(s.scope, args))
  );

  // ── AI context ────────────────────────────────────────────────────────
  server.registerTool(
    "garden_update_ai_context",
    {
      title: "Update AI context",
      description:
        'Write a node\'s AI context — the standing description the garden\'s assistant and other agents read first. It is NOT the item\'s notes: a summary the user asked to read goes in the notes via garden_write_note; write context when the user says "context" or "AI context", or when a read reports it stale, and otherwise offer it. Writable: sections.summary (required), sections.structure, sections.signals (kept only when the node\'s context mode is Enhanced; garden_read shows the mode), and oneLiner. Anything else you send is reported back under "dropped" with the reason, not stored. Use it when garden_read reports the context as stale after you have read the whole item. merge (default) updates the keys you give; replace rewrites. Opted-out nodes refuse.',
      inputSchema: updateAiContextInput,
      annotations: WRITE,
    },
    withSession(async (s, args) => {
      const gate = requireCapability(s, "garden:write-files", "update AI context");
      if (gate) return gate;
      if (!(await s.scope.nodeInScope(args.id))) return refuse("That item is not reachable with this token.");
      const result = await updateAiContext({
        userId: s.scope.userId,
        nodeId: args.id,
        writerLabel: `mcp:${s.principal.token.name}`,
        oneLiner: args.oneLiner,
        sections: args.sections,
        mode: args.mode ?? "merge",
      });
      if (!result.ok) return refuse(result.reason ?? "Could not update AI context.", { dropped: result.dropped });
      const droppedText = result.dropped.length > 0 ? ` NOT stored: ${result.dropped.map((d) => `${d.section} (${d.reason})`).join("; ")}.` : "";
      return ok(`AI context ${result.changed ? "updated" : "unchanged"} for ${args.id}.${droppedText}`, { id: args.id, changed: result.changed, dropped: result.dropped });
    })
  );

  // ── chats ─────────────────────────────────────────────────────────────
  server.registerTool(
    "garden_chats_search",
    {
      title: "Find chats",
      description: "Find the user's past assistant chats by words in their titles or messages, by the content they were about (about: a content id), or by recency. Returns chat ids for garden_chat_read.",
      inputSchema: chatsSearchInput,
      annotations: READ,
    },
    withSession(async (s, args) => {
      const gate = requireCapability(s, "garden:read-chats", "read chats");
      if (gate) return gate;
      const hits = await searchChats(s.scope, s.principal.token.allChats, { ...args, limit: Math.min(args.limit ?? 10, 20) });
      return ok(hits.length ? hits.map((h, i) => `${i + 1}. "${h.title}" (${h.id}) · updated ${h.updatedAt}`).join("\n") : "No chats matched.", { hits });
    })
  );

  server.registerTool(
    "garden_chat_read",
    {
      title: "Read a chat",
      description: 'Read a chat transcript (last 40 messages by default). parts may add "associations" (what it was about), "outputs" (what it produced) and "diagnostics" (per assistant turn: model, finish reason, steps, tool count, tokens, flags — what the owner reads when a turn goes wrong).',
      inputSchema: chatReadInput,
      annotations: READ,
    },
    withSession(async (s, args) => {
      const gate = requireCapability(s, "garden:read-chats", "read chats");
      if (gate) return gate;
      if (!(await chatInScope(s.scope, s.principal.token.allChats, args.id))) return refuse("That chat is not reachable with this token.");
      const parts = new Set(args.parts && args.parts.length > 0 ? args.parts : ["messages"]);
      const result = await readChat(s.scope.userId, args.id, parts, args.range?.last ?? 40);
      return result ? ok(result.text, result.structured) : refuse("That chat does not exist.");
    })
  );

  // ── issues ────────────────────────────────────────────────────────────
  server.registerTool(
    "garden_report_issue",
    {
      title: "Report a bug or request a feature",
      description:
        "File a bug, feature request or small change against the garden's public repository on the user's behalf. Use it when a garden tool fails twice with the same internal error or a result contradicts what you just read. Never paste the user's note content; describe the tool, inputs' shape and the errorId.",
      inputSchema: reportIssueInput,
      annotations: { ...WRITE, openWorldHint: true },
    },
    withSession(async (s, args) => {
      const gate = requireCapability(s, "garden:report-issues", "file issues");
      if (gate) return gate;
      const r = await reportIssue({ userId: s.scope.userId, tokenName: s.principal.token.name, ...args });
      if (r.status === "filed") return ok(`Filed #${r.number}: ${r.url}`, { number: r.number, url: r.url, labels: r.labels });
      if (r.status === "fallback") return ok(`Could not file automatically (${r.reason}). Give the user this link to file it themselves: ${r.url}`, { fallbackUrl: r.url, title: r.title });
      return refuse(r.reason);
    })
  );

  // ── ChatGPT connector aliases (§8.4) ──────────────────────────────────
  server.registerTool(
    "search",
    {
      title: "Search (ChatGPT connector)",
      description: "ChatGPT connector alias of garden_search: returns {results: [{id, title, url}]} as JSON text.",
      inputSchema: chatgptSearchInput,
      annotations: READ,
    },
    withSession(async (s, args) => {
      const r = await search(s.scope, { query: args.query, limit: 10 });
      const hits = ((r.structuredContent?.hits as Array<Record<string, unknown>> | undefined) ?? []).map((h) => ({ id: h.id, title: h.title, url: `garden://item/${h.id}` }));
      return { content: [{ type: "text", text: JSON.stringify({ results: hits }) }] };
    })
  );

  server.registerTool(
    "fetch",
    {
      title: "Fetch (ChatGPT connector)",
      description: "ChatGPT connector alias of garden_read: returns {id, title, text, url, metadata} as JSON text.",
      inputSchema: chatgptFetchInput,
      annotations: READ,
    },
    withSession(async (s, args) => {
      const r = await read(s.scope, s.principal, { id: args.id, parts: ["body", "tags"] });
      // ChatGPT's fetch contract is text-only; an attached image (a file
      // read) stays out of the JSON — the presigned URL in the text covers it.
      const text = r.content.map((c) => (c.type === "text" ? c.text : "")).filter(Boolean).join("\n");
      const sc = (r.structuredContent ?? {}) as Record<string, unknown>;
      return { content: [{ type: "text", text: JSON.stringify({ id: args.id, title: sc.title ?? args.id, text, url: `garden://item/${args.id}`, metadata: { type: sc.type ?? null, updatedAt: sc.updatedAt ?? null } }) }] };
    })
  );

  // ── resources (§3) ────────────────────────────────────────────────────
  const notFound = (uri: URL) => ({ contents: [{ uri: uri.href, mimeType: "text/plain", text: "Not found or not reachable with this token." }] });

  server.registerResource(
    "note",
    new ResourceTemplate("garden://note/{id}", { list: undefined }),
    { title: "Note", description: "A note as markdown, private content removed", mimeType: "text/markdown" },
    async (uri, vars, ctx) => {
      const s = sessionFrom(ctx);
      const text = s ? await noteResource(s.scope, String(vars.id)) : null;
      return text === null ? notFound(uri) : { contents: [{ uri: uri.href, mimeType: "text/markdown", text }] };
    }
  );

  server.registerResource(
    "file",
    new ResourceTemplate("garden://file/{id}", { list: undefined }),
    { title: "File", description: "A code, HTML or uploaded file as text", mimeType: "text/markdown" },
    async (uri, vars, ctx) => {
      const s = sessionFrom(ctx);
      const file = s ? await fileResource(s.scope, String(vars.id)) : null;
      if (!file) return notFound(uri);
      return file.kind === "blob"
        ? { contents: [{ uri: uri.href, mimeType: file.mimeType, blob: file.data }] }
        : { contents: [{ uri: uri.href, mimeType: file.mimeType, text: file.text }] };
    }
  );

  server.registerResource(
    "database",
    new ResourceTemplate("garden://database/{id}", {
      list: async (ctx) => {
        const s = sessionFrom(ctx);
        if (!s) return { resources: [] };
        const dbs = await listDatabaseResources(s.scope);
        return {
          resources: dbs.map((d) => ({ uri: `garden://database/${d.id}`, name: d.title, title: d.title, description: `Schema of ${d.title}`, mimeType: "text/markdown" })),
        };
      },
    }),
    { title: "Database schema", description: "A database's columns, types and relations", mimeType: "text/markdown" },
    async (uri, vars, ctx) => {
      const s = sessionFrom(ctx);
      const text = s ? await databaseSchemaResource(s.scope, String(vars.id)) : null;
      return text === null ? notFound(uri) : { contents: [{ uri: uri.href, mimeType: "text/markdown", text }] };
    }
  );

  server.registerResource(
    "database-view",
    new ResourceTemplate("garden://database/{id}/view/{viewId}", {
      list: async (ctx) => {
        const s = sessionFrom(ctx);
        if (!s) return { resources: [] };
        const dbs = await listDatabaseResources(s.scope);
        return {
          resources: dbs.flatMap((d) =>
            d.views.map((v) => ({ uri: `garden://database/${d.id}/view/${v.id}`, name: `${d.title} › ${v.name}`, title: `${d.title} › ${v.name}`, mimeType: "text/markdown" }))
          ),
        };
      },
    }),
    { title: "Database view", description: "The first page of a saved view, index tier", mimeType: "text/markdown" },
    async (uri, vars, ctx) => {
      const s = sessionFrom(ctx);
      const text = s ? await viewResource(s.scope, String(vars.id), String(vars.viewId)) : null;
      return text === null ? notFound(uri) : { contents: [{ uri: uri.href, mimeType: "text/markdown", text }] };
    }
  );

  server.registerResource(
    "row",
    new ResourceTemplate("garden://row/{tableId}/{rowId}", { list: undefined }),
    { title: "Database row", description: "One row's properties", mimeType: "text/markdown" },
    async (uri, vars, ctx) => {
      const s = sessionFrom(ctx);
      const text = s ? await rowResource(s.scope, String(vars.tableId), String(vars.rowId)) : null;
      return text === null ? notFound(uri) : { contents: [{ uri: uri.href, mimeType: "text/markdown", text }] };
    }
  );

  // ── prompts ───────────────────────────────────────────────────────────
  server.registerPrompt(
    "report-garden-issue",
    { title: "Report a garden issue", description: "How to file a bug about the garden's MCP tools without leaking content" },
    async () => ({ messages: [{ role: "user", content: { type: "text", text: REPORT_ISSUE_PROMPT } }] })
  );

  server.registerPrompt(
    "charter",
    {
      title: "Run a charter",
      description: "One of the user's charters (operating procedures), compiled: standing rules then phases. Give the charter's id or exact title; call with no argument to list them.",
      argsSchema: z.object({ charter: z.string().optional().describe("Charter id or exact title; omit to list") }),
    },
    async (args, ctx) => {
      const s = sessionFrom(ctx);
      if (!s) return { messages: [{ role: "user", content: { type: "text", text: "No valid MCP token." } }] };
      const charters = await listCharterPrompts(s.scope);
      const wanted = args.charter?.trim().toLowerCase();
      const pick = wanted ? charters.find((c) => c.id === args.charter || c.title.trim().toLowerCase() === wanted) : null;
      if (!pick) {
        const list = charters.map((c) => `- ${c.title} (${c.id}) — ${c.description || "no description"} · ${c.phaseCount} phase${c.phaseCount === 1 ? "" : "s"}`).join("\n");
        return { messages: [{ role: "user", content: { type: "text", text: `Charters reachable with this token:\n${list || "(none)"}\nCall this prompt again with charter = an id or exact title.` } }] };
      }
      const text = (await renderCharter(s.scope, pick.id)) ?? "That charter could not be rendered.";
      return { messages: [{ role: "user", content: { type: "text", text } }] };
    }
  );
}
