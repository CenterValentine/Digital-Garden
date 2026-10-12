/**
 * CI gate: AI row deletion is consent-gated (MCP-DATABASE-REACH-PLAN §2.8).
 *
 * Two halves, no database:
 *   A. the PURE policy module — a missing, malformed or foreign bag reads as
 *      "confirm"; values are matched exactly; a PATCH must name a known key
 *      with a known value; merge fills defaults and keeps nothing unknown;
 *   B. the WIRING, by source scan — the chat tool exists, asks for approval
 *      through `needsApproval` (never a model-set flag), deletes through the
 *      soft-delete service, and is registered in every parallel table
 *      (tool ids, settings metadata, the summon menu); the schema rail
 *      offers the policy; the table PATCH accepts it.
 *
 * Mutation-tested at introduction (2026-10-12), five mutants killed:
 * flipping the default to "allow", accepting a mis-cased value, renaming
 * `needsApproval` off the tool (a word-boundary match — a substring match
 * let that one survive on the first run), unregistering the tool from the
 * menu, and skipping the strict parse in the route.
 *
 * Usage: pnpm data:delete-policy:check
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AI_DELETE_POLICIES,
  DEFAULT_AI_DELETE_POLICY,
  mergeAiPolicy,
  parseAiPolicyPatch,
  readAiPolicy,
} from "../lib/domain/data/ai-policy";

let failures = 0;
function check(ok: boolean, message: string): void {
  if (ok) return;
  failures += 1;
  console.error(`✗ ${message}`);
}

// ── A. pure module ─────────────────────────────────────────────────────

check(DEFAULT_AI_DELETE_POLICY === "confirm", "the default delete policy must be confirm");
check(
  AI_DELETE_POLICIES.length === 3 && AI_DELETE_POLICIES.includes("deny"),
  "the policy set is confirm | allow | deny"
);

for (const raw of [undefined, null, 42, "allow", [], {}, { delete: "ALLOW" }, { delete: 1 }, { other: "allow" }]) {
  check(
    readAiPolicy(raw).delete === "confirm",
    `readAiPolicy(${JSON.stringify(raw)}) must fall back to confirm`
  );
}
check(readAiPolicy({ delete: "allow" }).delete === "allow", "readAiPolicy honours allow");
check(readAiPolicy({ delete: "deny" }).delete === "deny", "readAiPolicy honours deny");

const okPatch = parseAiPolicyPatch({ delete: "deny" });
check(okPatch.ok && okPatch.patch?.delete === "deny" && okPatch.reason === undefined, "a valid patch parses");
const badPatch = parseAiPolicyPatch({ delete: "nuke" });
check(!badPatch.ok && typeof badPatch.reason === "string" && badPatch.patch === undefined, "an unknown value is refused with a reason");
check(!parseAiPolicyPatch({ delete: "Allow" }).ok, "values are matched exactly, not case-folded");
check(!parseAiPolicyPatch({ erase: "allow" }).ok, "an unknown key is refused");
check(!parseAiPolicyPatch({}).ok, "an empty patch is refused");
check(!parseAiPolicyPatch("allow").ok, "a non-object patch is refused");

const merged = mergeAiPolicy({ delete: "allow", junk: true }, { delete: "deny" });
check(merged.delete === "deny", "merge applies the patch");
check(!("junk" in merged), "merge keeps nothing unknown");
check(mergeAiPolicy(undefined, {}).delete === "confirm", "merge fills the default");

// ── B. wiring by source scan ───────────────────────────────────────────

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const tools = src("lib/domain/ai/tools/data-tools.ts");
const toolStart = tools.indexOf("delete_rows: tool(");
check(toolStart >= 0, "data-tools.ts defines delete_rows");
if (toolStart >= 0) {
  // The tool's own block runs to the next `: tool(` definition.
  const next = tools.indexOf(": tool(", toolStart + "delete_rows: tool(".length);
  const block = tools.slice(toolStart, next === -1 ? undefined : next);
  check(/\bneedsApproval\s*:/.test(block), "delete_rows asks through needsApproval");
  check(!block.includes("confirmedByUser"), "delete_rows never takes a model-set confirmation flag");
  check(block.includes("softDeleteRows("), "delete_rows deletes through the soft-delete service");
  check(block.includes("readAiPolicy") || tools.includes("readAiPolicy("), "delete_rows reads the table policy through readAiPolicy");
  check(block.includes("\"deny\""), "delete_rows handles the deny policy");
  check(block.includes("publishEvent("), "the allow policy posts an inbox notice");
}

const metadata = src("lib/domain/ai/tools/data-metadata.ts");
check(/DATA_TOOL_IDS\s*=\s*\[[^\]]*"delete_rows"/.test(metadata), "delete_rows is in DATA_TOOL_IDS");
check(/delete_rows:\s*\{\s*name:/.test(metadata), "delete_rows has settings metadata");

const menu = src("lib/domain/ai/tools/menu.ts");
check(/^\s*delete_rows:\s*\{\s*family:\s*"databases"/m.test(menu), "delete_rows has a TOOL_MENU line in the databases family");

const rail = src("components/content/data/DataSchemaRail.tsx");
check(rail.includes("AI_DELETE_POLICIES"), "the schema rail offers the delete policy");
check(rail.includes("aiPolicy"), "the schema rail patches aiPolicy");

const route = src("app/api/content/data/[id]/route.ts");
check(route.includes("parseAiPolicyPatch("), "the table PATCH validates aiPolicy through parseAiPolicyPatch");

const queries = src("lib/domain/data/server/queries.ts");
check(queries.includes("readAiPolicy("), "loadTable reads the stored bag through readAiPolicy");

if (failures > 0) {
  console.error(`\nai delete policy gate: ${failures} failure(s)`);
  process.exit(1);
}
console.log("ai delete policy gate: ok");
