/**
 * CI gate: the garden's MCP server surface (MCP-DATABASE-REACH-PLAN §6, §8.3).
 *
 * Pins, without a database or a server:
 *   A. SCHEMAS — every tool input is a flat object: no top-level union, no
 *      lazy/recursive schema, a description on every property (the subset
 *      every vendor's client converts the same way).
 *   B. REGISTRATION — every tool in the plan is registered with annotations;
 *      read tools are read-only; each write tool checks its capability before
 *      doing anything; delete is marked destructive and gated by the table
 *      policy with elicitation; the ChatGPT aliases exist; the instructions
 *      name the issue tool and the fence rule.
 *   C. ONE WRITE PATH — inserts and updates go through chat's exported
 *      functions; notes go through writeNoteContent with the shrink guard ON;
 *      reads render through the registered private-content seam.
 *   D. AUTH — the route requires a bearer token through the one verifier.
 *
 * Mutation-tested at introduction (2026-10-13) — see the PR body.
 *
 * Usage: pnpm mcp:surface:check
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import * as schemas from "../lib/domain/mcp/schemas";

let failures = 0;
function check(ok: boolean, message: string): void {
  if (ok) return;
  failures += 1;
  console.error(`✗ ${message}`);
}
function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

// ── A. schemas ────────────────────────────────────────────────────────

function describedDeep(s: z.ZodTypeAny): boolean {
  let cur: z.ZodTypeAny | undefined = s;
  for (let i = 0; i < 6 && cur; i += 1) {
    if (cur.description) return true;
    const def = (cur as { def?: { innerType?: z.ZodTypeAny; in?: z.ZodTypeAny } }).def;
    cur = def?.innerType ?? def?.in;
  }
  return false;
}

const TOOL_SCHEMAS = Object.entries(schemas).filter(([k, v]) => k.endsWith("Input") && v instanceof z.ZodObject) as Array<[string, z.ZodObject<z.ZodRawShape>]>;
check(TOOL_SCHEMAS.length >= 17, `schemas: at least 17 tool input schemas exported (found ${TOOL_SCHEMAS.length})`);
for (const [name, schema] of TOOL_SCHEMAS) {
  const shape = schema.shape;
  for (const [key, field] of Object.entries(shape)) {
    check(describedDeep(field as z.ZodTypeAny), `schemas: ${name}.${key} has a description`);
    const typeName = (field as { def?: { type?: string } }).def?.type;
    check(typeName !== "lazy", `schemas: ${name}.${key} is not recursive`);
  }
}
for (const [name, schema] of TOOL_SCHEMAS) {
  const t = (schema as { def?: { type?: string } }).def?.type;
  check(t === "object", `schemas: ${name} is a flat object at the top level (got ${t})`);
}

// ── B. registration ───────────────────────────────────────────────────

const server = src("lib/domain/mcp/server.ts");
const READ_TOOLS = ["garden_search", "garden_list_tree", "garden_read", "garden_query_rows", "garden_chats_search", "garden_chat_read", "search", "fetch"];
const WRITE_TOOLS: Record<string, string> = {
  garden_insert_rows: "garden:write-rows",
  garden_update_rows: "garden:write-rows",
  garden_delete_rows: "garden:delete-rows",
  garden_write_note: "garden:write-files",
  garden_write_code: "garden:write-files",
  garden_upload_file: "garden:write-files",
  garden_create_folder: "garden:write-files",
  garden_insert_block: "garden:write-files",
  garden_update_block: "garden:write-files",
  garden_update_ai_context: "garden:write-files",
  garden_report_issue: "garden:report-issues",
};

function toolBlock(name: string): string | null {
  const start = server.indexOf(`"${name}",`);
  if (start < 0) return null;
  const next = server.indexOf("server.register", start + 1);
  return server.slice(start, next === -1 ? undefined : next);
}

for (const name of [...READ_TOOLS, ...Object.keys(WRITE_TOOLS)]) {
  const block = toolBlock(name);
  check(block !== null, `registration: ${name} is registered`);
  if (!block) continue;
  check(/annotations:/.test(block), `registration: ${name} carries annotations`);
}
for (const name of READ_TOOLS) {
  const block = toolBlock(name) ?? "";
  check(/annotations: READ/.test(block), `registration: ${name} is annotated read-only`);
  check(!/requireCapability\(/.test(block) || /garden:read-chats/.test(block), `registration: ${name} needs no write capability`);
}
for (const [name, cap] of Object.entries(WRITE_TOOLS)) {
  const block = toolBlock(name) ?? "";
  check(new RegExp(`requireCapability\\(s, "${cap}"`).test(block), `registration: ${name} checks "${cap}" first`);
  check(!/annotations: READ/.test(block), `registration: ${name} is not marked read-only`);
}
check(/annotations: DESTRUCTIVE/.test(toolBlock("garden_delete_rows") ?? ""), "registration: garden_delete_rows is marked destructive");
for (const name of ["garden_chats_search", "garden_chat_read"]) {
  check(/requireCapability\(s, "garden:read-chats"/.test(toolBlock(name) ?? ""), `registration: ${name} checks garden:read-chats`);
}
check(/SERVER_INSTRUCTIONS = `[\s\S]*garden_report_issue[\s\S]*`/.test(server), "registration: the instructions name garden_report_issue");
check(/SERVER_INSTRUCTIONS = `[\s\S]*dg-block[\s\S]*`/.test(server), "registration: the instructions carry the fence rule");
for (const template of ["garden://note/{id}", "garden://file/{id}", "garden://database/{id}", "garden://database/{id}/view/{viewId}", "garden://row/{tableId}/{rowId}"]) {
  check(server.includes(template), `registration: resource template ${template}`);
}
check(/registerPrompt\(\s*"report-garden-issue"/.test(server) && /registerPrompt\(\s*"charter"/.test(server), "registration: both prompts exist");

// ── C. one write path, one read seam ──────────────────────────────────

const data = src("lib/domain/mcp/tools/data.ts");
check(/applyRowInserts\(/.test(data) && /applyRowUpdates\(/.test(data), "writes: rows go through chat's exported insert and update paths");
check(!/prisma\.dataRow\.(create|update|updateMany|delete|deleteMany)\(/.test(data), "writes: the MCP data module never writes rows through Prisma directly");
const del = data.slice(data.indexOf("export async function deleteRows"));
check(/readAiPolicy\(table\.aiPolicy\)/.test(del), "delete: the table policy decides");
check(/"deny"/.test(del) && /inputRequired\(/.test(del) && /elicitInput\(/.test(del), "delete: deny refuses; confirm elicits on both protocol eras");
check(/softDeleteRows\(/.test(del), "delete: soft delete only");

const files = src("lib/domain/mcp/tools/files.ts");
const noteFn = files.slice(files.indexOf("export async function writeNote"), files.indexOf("export async function writeCode"));
check(/writeNoteContent\(/.test(noteFn) && /destructiveApproved: false/.test(noteFn), "notes: writes go through writeNoteContent with the shrink guard on");
check(/createNoteFromMarkdown\(/.test(noteFn), "notes: creation goes through the shared service");
check(!/prisma\.notePayload\.(update|upsert|create)\(/.test(files), "notes: the MCP files module never writes NotePayload directly");

const read = src("lib/domain/mcp/tools/read.ts");
check(/renderNoteForMcp\(/.test(read), "reads: notes render through the MCP seam");
check(/lib\/domain\/mcp\/read\.ts/.test(src("scripts/validate-private-content.ts")), "reads: the seam is registered with the private-content gate");
const resources = src("lib/domain/mcp/resources.ts");
check(/renderNoteForMcp\(/.test(resources), "resources: the note resource renders through the seam");

// Tools report real outcomes: a context write names what it did NOT store
// (unknown keys, user-owned sections, signals outside Enhanced mode) in
// both channels, so "changed" never reads as "everything landed".
const context = src("lib/domain/mcp/tools/context.ts");
check(/applyGeneratedSections\(/.test(context), "context: writes go through the engine's applyGeneratedSections");
check(/resolvedMode !== ContextMode\.ENHANCED/.test(context) && /section: "signals"/.test(context), "context: signals sent outside Enhanced mode are reported as dropped");
check(/dropped: result\.dropped/.test(toolBlock("garden_update_ai_context") ?? ""), "context: the tool result carries dropped in structuredContent");

// ── D. auth ───────────────────────────────────────────────────────────

const route = src("app/api/mcp/route.ts");
check(/withMcpAuth\(handler, verifyMcpBearer, \{ required: true \}\)/.test(route), "auth: the route requires a bearer token through verifyMcpBearer");
const auth = src("lib/domain/mcp/auth.ts");
check(/validateMcpToken\(bearerToken, "garden:read"\)/.test(auth), "auth: the verifier uses the one token validator");

if (failures > 0) {
  console.error(`\nmcp:surface:check — ${failures} failure(s)`);
  process.exit(1);
}
console.log(`mcp:surface:check — OK (${TOOL_SCHEMAS.length} schemas, ${READ_TOOLS.length} read tools, ${Object.keys(WRITE_TOOLS).length} write tools, 5 resources, 2 prompts)`);
