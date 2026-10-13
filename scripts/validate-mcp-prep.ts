/**
 * CI gate: the MCP preparatory layer (MCP-DATABASE-REACH-PLAN §6.8).
 *
 * Four things this PR made load-bearing, pinned without a database:
 *
 *   A. ONE search query builder. `buildSearchWhere` is pure; the gate checks
 *      the route profile (every field, case toggle, tag scope, shortcut
 *      exclusion, explicit type honoured verbatim) and the tool profile, and
 *      that BOTH callers import the builder instead of shaping a `where`.
 *   B. The conversion backup. `buildNoteHistoryEnvelope` never records an
 *      empty document; prune math keeps NOTE_HISTORY_KEEP; and every
 *      serializer-driven write site calls `recordNoteHistory` (or, for the
 *      client-side source-view toggle, POSTs to the history route).
 *   C. MCP capabilities. `garden:read` is always present; unknown grants are
 *      refused by name; the token shape is `dgmcp_` + 48 hex.
 *   D. The MCP read seam renders through the private-content strip and is
 *      registered in validate-private-content.ts.
 *
 * Mutation-tested at introduction (2026-10-12) — see the PR body.
 *
 * Usage: pnpm mcp:prep:check
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ALL_SEARCH_FIELDS,
  buildSearchWhere,
} from "../lib/domain/content/search-service";
import {
  NOTE_HISTORY_KEEP,
  NOTE_HISTORY_TTL_MS,
  buildNoteHistoryEnvelope,
  historyCutoff,
  isEmptyDoc,
  pruneBelowVersion,
} from "../lib/domain/content/note-history-envelope";
import {
  MCP_CAPABILITIES,
  MCP_TOKEN_PATTERN,
  parseMcpCapabilities,
} from "../lib/domain/mcp/capabilities";

let failures = 0;
function check(ok: boolean, message: string): void {
  if (ok) return;
  failures += 1;
  console.error(`✗ ${message}`);
}
/** Source with comments removed, so a commented-out call cannot satisfy a scan. */
function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}
function json(v: unknown): string {
  return JSON.stringify(v);
}

// ── A. search ──────────────────────────────────────────────────────────

{
  const route = buildSearchWhere({
    ownerId: "u1",
    query: "acme",
    fields: ALL_SEARCH_FIELDS,
  });
  const s = json(route);
  check(route.ownerId === "u1" && route.deletedAt === null, "search: owner-scoped and live only");
  check(json(route.contentType) === json({ not: "shortcut" }), "search: shortcuts excluded when no type is given");
  check(Array.isArray(route.OR) && route.OR.length === 6, `search: route profile has title + 5 payload groups (got ${route.OR?.length})`);
  check(s.includes('"mode":"insensitive"') && !s.includes('"mode":"default"'), "search: case-insensitive by default");
  check(s.includes('"rows":{"some":{"deletedAt":null'), "search: database rows match and roll up to the table");
  for (const key of ["notePayload", "htmlPayload", "codePayload", "filePayload", "dataPayload"]) {
    check(s.includes(`"${key}":{"isNot":null}`), `search: ${key} group guards on presence`);
  }

  const cs = buildSearchWhere({ ownerId: "u1", query: "Acme", caseSensitive: true, fields: ALL_SEARCH_FIELDS });
  check(json(cs).includes('"mode":"default"') && !json(cs).includes('"mode":"insensitive"'), "search: caseSensitive flips the mode everywhere");

  const typed = buildSearchWhere({ ownerId: "u1", query: "", types: ["shortcut"], fields: ALL_SEARCH_FIELDS });
  check(typed.contentType === "shortcut", "search: an explicit type is honoured verbatim, even shortcut");
  check(typed.OR === undefined, "search: an empty query adds no text match");

  const scoped = buildSearchWhere({ ownerId: "u1", query: "x", types: ["note", "data"], fields: ["note", "data"] });
  check(json(scoped.contentType) === json({ in: ["note", "data"] }), "search: several types become an IN");
  check(scoped.OR?.length === 3, "search: fields narrow the payload groups (title + note + data)");
  check(!json(scoped).includes('"rows"'), "search: without dataRows no row subquery is emitted");

  const tagged = buildSearchWhere({ ownerId: "u1", query: "x", tagContentIds: ["a", "b"], fields: ["note"] });
  check(json(tagged.id) === json({ in: ["a", "b"] }), "search: a tag scope restricts ids");

  const routeSrc = src("app/api/content/search/route.ts");
  const toolSrc = src("lib/domain/ai/tools/registry.ts");
  check(routeSrc.includes("buildSearchWhere(") && !/where\.OR\s*=/.test(routeSrc), "search: the route uses the builder and shapes no OR of its own");
  const toolStart = toolSrc.indexOf("search_content: tool(");
  const toolBlock = toolSrc.slice(toolStart, toolSrc.indexOf(": tool(", toolStart + 20));
  check(toolStart >= 0 && toolBlock.includes("buildSearchWhere(") && toolBlock.includes("ALL_SEARCH_FIELDS"), "search: search_content uses the builder over every field");
  check(!/searchText:\s*\{\s*contains/.test(toolBlock), "search: search_content shapes no match of its own");
}

// ── B. conversion backup ───────────────────────────────────────────────

{
  const at = new Date("2026-10-12T00:00:00Z");
  check(isEmptyDoc(undefined) && isEmptyDoc(null) && isEmptyDoc({ type: "doc" }) && isEmptyDoc({ type: "doc", content: [] }), "history: empty docs are recognised");
  check(!isEmptyDoc({ type: "doc", content: [{ type: "paragraph" }] }), "history: a doc with a block is not empty");
  check(buildNoteHistoryEnvelope({ source: "source-view", tiptapJson: { type: "doc", content: [] }, capturedAt: at }) === null, "history: an empty document is never recorded");
  const env = buildNoteHistoryEnvelope({ source: "write-note-content", mode: "replace", route: "payload", tiptapJson: { type: "doc", content: [{ type: "paragraph" }] }, capturedAt: at });
  check(env?.kind === "note-snapshot" && env.source === "write-note-content" && env.mode === "replace" && env.route === "payload" && env.capturedAt === "2026-10-12T00:00:00.000Z", "history: the envelope carries kind, source, mode, route, time");
  check(NOTE_HISTORY_KEEP >= 10, "history: keeps at least ten snapshots within the window");
  check(pruneBelowVersion(25) === 25 - NOTE_HISTORY_KEEP && pruneBelowVersion(3) < 1, "history: prune floor is latest minus keep, and nothing is pruned early");
  check(NOTE_HISTORY_TTL_MS === 24 * 60 * 60 * 1000, "history: snapshots live for exactly one day (owner, 2026-10-12)");
  check(historyCutoff(new Date("2026-10-13T07:00:00Z")).toISOString() === "2026-10-12T07:00:00.000Z", "history: the cutoff is now minus the TTL");
  const histSrc = src("lib/domain/content/note-history.ts");
  const recordFn = histSrc.slice(
    histSrc.indexOf("export async function recordNoteHistory"),
    histSrc.indexOf("export async function listNoteHistory"),
  );
  check(/changedAt: \{ lt: historyCutoff\(/.test(recordFn), "history: recording prunes by age (inside recordNoteHistory)");
  check(/changedAt: \{ gte: historyCutoff\(/.test(histSrc), "history: listing stays inside the window");
  check(/export async function purgeExpiredNoteHistory/.test(histSrc), "history: a sweep exists for notes never rewritten again");
  check(/purgeExpiredNoteHistory\(/.test(src("app/api/cron/purge-note-history/route.ts")), "history: the sweep has a cron route");
  check(/"\/api\/cron\/purge-note-history"/.test(src("vercel.json")), "history: the cron route is scheduled in vercel.json");

  const write = src("lib/domain/content/write-note-content.ts");
  const payloadFn = write.indexOf("async function writeNotePayload(");
  check(payloadFn > 0, "history: writeNotePayload exists");
  const collabPart = write.slice(0, payloadFn);
  const payloadPart = write.slice(payloadFn);
  check(/await recordNoteHistory\(/.test(collabPart) && /route: "collaboration"/.test(collabPart), "history: the collaboration route records from the live document's before");
  const payloadCall = payloadPart.indexOf("await recordNoteHistory(");
  const payloadUpsert = payloadPart.indexOf("prisma.notePayload.upsert(");
  check(payloadCall > 0 && payloadUpsert > payloadCall, "history: the payload route records BEFORE its upsert");
  check(/recordNoteHistory\(/.test(src("lib/domain/ai/run-ledger.ts")), "history: the run ledger records before its full-document upsert");
  check(/recordNoteHistory\(/.test(src("app/api/content/content/[id]/route.ts")), "history: the content PATCH records when a markdown body replaces the note");
  check(/\/history`/.test(src("components/content/content/MainPanelContent.tsx")) && /source: "source-view"/.test(src("components/content/content/MainPanelContent.tsx")), "history: the source-view toggle POSTs the pre-conversion document");
  const hist = src("lib/domain/content/note-history.ts");
  check(/catch \(error\)/.test(hist) && !/throw /.test(hist), "history: recordNoteHistory never throws");
}

// ── C. MCP capabilities ────────────────────────────────────────────────

{
  check(MCP_CAPABILITIES.includes("garden:read") && MCP_CAPABILITIES.includes("garden:delete-rows"), "mcp: the capability set includes read and delete-rows");
  const d = parseMcpCapabilities(undefined);
  check(d.ok && d.capabilities.length === 1 && d.capabilities[0] === "garden:read", "mcp: default grant is read only");
  const w = parseMcpCapabilities(["garden:write-rows"]);
  check(w.ok && w.capabilities.includes("garden:read") && w.capabilities.includes("garden:write-rows"), "mcp: read is always present");
  const bad = parseMcpCapabilities(["garden:nuke"]);
  check(!bad.ok && bad.capabilities.length === 0 && /garden:nuke/.test(bad.reason ?? ""), "mcp: an unknown capability is refused by name");
  check(!parseMcpCapabilities("garden:read").ok, "mcp: a non-list is refused");
  check(MCP_TOKEN_PATTERN.test(`dgmcp_${"a".repeat(48)}`) && !MCP_TOKEN_PATTERN.test(`dgwf_${"a".repeat(48)}`), "mcp: token shape is dgmcp_ + 48 hex");
  const tokens = src("lib/domain/mcp/tokens.ts");
  check(/createHash\("sha256"\)/.test(tokens) && /tokenHash/.test(tokens), "mcp: tokens are hashed at rest");
  check(/revokedAt\) return null/.test(tokens) && /expiresAt/.test(tokens), "mcp: validation rejects revoked and expired tokens");
}

// ── D. MCP read seam ───────────────────────────────────────────────────

{
  const read = src("lib/domain/mcp/read.ts");
  check(/tiptapToMarkdown\(stripPrivateContent\(/.test(read), "mcp: the read seam strips private content before serialising");
  check(/lib\/domain\/mcp\/read\.ts/.test(src("scripts/validate-private-content.ts")), "mcp: the read seam is registered in validate-private-content.ts");
}

if (failures > 0) {
  console.error(`\nmcp:prep:check — ${failures} failure(s)`);
  process.exit(1);
}
console.log("mcp:prep:check — OK (search builder, conversion backup, capabilities, read seam)");
