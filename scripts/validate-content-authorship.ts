/**
 * content:authorship:check — who drafted a node, and what that permits.
 *
 * Owner rules (2026-10-14): an AI may rewrite a note an AI drafted without
 * the destructive-rewrite guard; the MCP may trash content the MCP drafted.
 * Both read ONE record — ContentNode.draftedBy / draftedByRef / draftedAt,
 * stamped once at creation (lib/domain/content/authorship.ts). This gate
 * pins:
 *
 *   1. the pure helpers (what counts as AI- and MCP-drafted);
 *   2. the schema columns and the migration that adds them;
 *   3. every chat create path stamps `ai-chat` — note, folder, shortcuts,
 *      docx, template fill — and an OVERWRITE never stamps (an AI rewriting
 *      the user's file must not make it AI-drafted);
 *   4. update_note lifts the card and the backstop only for AI-drafted notes;
 *   5. the content DELETE route and garden_delete_content share one trash
 *      path (trashContentNode).
 *
 * The MCP side (stamping, the scoped rewrite lift, garden_delete_content's
 * refusals) is pinned in mcp:surface:check.
 *
 * Run: pnpm content:authorship:check (in `build` and quality.yml).
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

async function main(): Promise<void> {
  // ── 1. Pure helpers ─────────────────────────────────────────────────────
  const { draftedFields, isAiDrafted, isMcpDrafted } = await import("@/lib/domain/content/authorship");
  assert.deepEqual(draftedFields(null), {}, "no drafter → no fields (a user create stays unstamped)");
  const chat = draftedFields({ kind: "ai-chat", ref: "conv-1" });
  assert.equal(chat.draftedBy, "ai-chat");
  assert.equal(chat.draftedByRef, "conv-1");
  assert.ok(chat.draftedAt instanceof Date);
  assert.equal(draftedFields({ kind: "mcp", ref: "x".repeat(80) }).draftedByRef?.length, 64, "ref bounded to the column width");
  assert.ok(isAiDrafted({ draftedBy: "ai-chat" }) && isAiDrafted({ draftedBy: "mcp" }), "chat and MCP both count as AI-drafted");
  assert.ok(!isAiDrafted({ draftedBy: null }) && !isAiDrafted({}) && !isAiDrafted(null) && !isAiDrafted({ draftedBy: "user" }), "null / unknown is the user");
  assert.ok(isMcpDrafted({ draftedBy: "mcp" }) && !isMcpDrafted({ draftedBy: "ai-chat" }), "only MCP-drafted content is the MCP's to delete");

  // ── 2. Schema + migration ───────────────────────────────────────────────
  const schema = read("prisma/schema.prisma");
  const contentNode = schema.slice(schema.indexOf("model ContentNode {"), schema.indexOf("}", schema.indexOf("model ContentNode {")));
  for (const col of [/draftedBy\s+String\?\s+@db\.VarChar\(16\)/, /draftedByRef\s+String\?\s+@db\.VarChar\(64\)/, /draftedAt\s+DateTime\?\s+@db\.Timestamptz\(6\)/]) {
    assert.match(contentNode, col, `ContentNode has ${col}`);
  }
  const migrationDir = readdirSync(path.join(ROOT, "prisma/migrations")).find((d) => d.endsWith("_content_drafted_by"));
  assert.ok(migrationDir, "a content_drafted_by migration exists");
  const sql = read(`prisma/migrations/${migrationDir}/migration.sql`);
  for (const col of ["draftedAt", "draftedBy", "draftedByRef"]) {
    assert.match(sql, new RegExp(`ADD COLUMN\\s+"${col}"`), `the migration adds ${col}`);
  }
  assert.doesNotMatch(sql, /NOT NULL|DROP|ALTER COLUMN/, "additive and nullable — deploys ahead of the code");

  // ── 3. Chat creates stamp ai-chat; overwrites never stamp ──────────────
  const registry = read("lib/domain/ai/tools/registry.ts");
  const CHAT = /drafter: \{ kind: "ai-chat" as const, ref: ctx\.conversationId \?\? null \}/;
  const between = (from: string, to: string) => registry.slice(registry.indexOf(from), registry.indexOf(to, registry.indexOf(from)));
  const createNote = between("create_note: tool({", "update_note: tool({");
  assert.match(createNote, /\.\.\.draftedFields\(\{ kind: "ai-chat" as const, ref: ctx\.conversationId \?\? null \}\)/, "create_note stamps ai-chat");
  const createFolder = between("create_folder: tool({", "create_shortcut: tool({");
  assert.match(createFolder, CHAT, "create_folder stamps ai-chat");
  const shortcutCalls = registry.match(/findOrCreateShortcut\([\s\S]*?\)\);?|findOrCreateShortcut\([^;]*?\}\s*\)/g) ?? [];
  assert.ok(shortcutCalls.length >= 4, `found the shortcut calls (${shortcutCalls.length})`);
  for (const call of shortcutCalls) assert.match(call, CHAT, `every chat shortcut is stamped: ${call.slice(0, 60)}…`);
  const createDocx = between("create_docx: tool({", "read_docx_template: tool({");
  assert.match(createDocx, /parentFolderId: destination,\s*\.\.\.withProperties,\s*drafter: \{ kind: "ai-chat"/, "create_docx's CREATE path stamps ai-chat");
  assert.doesNotMatch(createDocx.slice(createDocx.indexOf("if (overwriteContentId)"), createDocx.indexOf("resolveToolOutputPlacement(")), /drafter:/, "create_docx's OVERWRITE path never stamps");
  const fill = registry.slice(registry.indexOf("fill_docx_template: tool({"));
  assert.match(fill, /storeDocxDocument\(ctx\.userId, \{\s*\.\.\.stored,\s*parentFolderId: destination,\s*drafter: \{ kind: "ai-chat"/, "fill_docx_template's CREATE path stamps ai-chat");
  assert.match(fill, /storeDocxDocument\(ctx\.userId, \{ \.\.\.stored, overwriteContentId \}\)/, "fill_docx_template's overwrite passes no drafter");

  const documents = read("lib/domain/ai/documents.ts");
  const store = documents.slice(documents.indexOf("export async function storeDocxDocument("));
  const overwriteBranch = store.slice(0, store.indexOf("if (!input.parentFolderId)"));
  assert.doesNotMatch(overwriteBranch, /draftedFields|drafter/, "storeDocxDocument's overwrite branch never stamps");
  assert.match(store, /contentType: "file",\s*\.\.\.draftedFields\(input\.drafter\)/, "storeDocxDocument's create stamps the drafter");
  assert.doesNotMatch(read("lib/features/content/overwrite-file.ts"), /drafted/, "overwriteFileNode leaves authorship alone");
  assert.match(read("lib/domain/content/create-note.ts"), /\.\.\.draftedFields\(input\.drafter\)/, "the shared note-create service stamps its drafter");

  // ── 4. update_note: the lift is scoped to AI-drafted notes ─────────────
  const updateNote = between("update_note: tool({", "rename_note: tool({");
  assert.match(updateNote, /needsApproval: async \(\{ contentId, mode, content \}\) =>\s*!\(await contentIsAiDrafted\(ctx\.userId, contentId\)\) &&/, "no approval card for an AI-drafted note");
  assert.match(updateNote, /destructiveApproved:\s*isAiDrafted\(existing\) \|\|/, "the backstop is lifted for an AI-drafted note");
  assert.doesNotMatch(updateNote, /destructiveApproved: true/, "update_note never approves a destructive rewrite unconditionally");
  assert.match(read("lib/domain/content/write-note-content.ts"), /recordNoteHistory\(/, "writeNoteContent keeps the pre-write snapshot that makes a free rewrite undoable");

  // ── 5. One trash path ───────────────────────────────────────────────────
  const route = read("app/api/content/content/[id]/route.ts");
  const del = route.slice(route.indexOf("export async function DELETE("));
  assert.match(del, /trashContentNode\(session\.user\.id, id\)/, "the DELETE route trashes through trashContentNode");
  assert.doesNotMatch(del, /prisma\.trashBin\.upsert|deletedAt: now/, "the DELETE route no longer carries its own copy of the trash logic");
  const trash = read("lib/domain/content/trash-content.ts");
  assert.match(trash, /prisma\.trashBin\.upsert\(/, "trashContentNode writes the TrashBin row (restorable)");
  assert.match(trash, /cascadeOwnedDeletes\(/, "…and runs the owned-content cascade");

  console.log(
    "✓ content:authorship:check — chat and MCP creates record who drafted them, overwrites never do, AI-drafted notes rewrite freely with a snapshot, and every delete shares one trash path",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
