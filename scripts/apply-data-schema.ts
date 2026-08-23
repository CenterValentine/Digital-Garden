/**
 * Splice the database content-type models into prisma/schema.prisma.
 *
 *   pnpm tsx scripts/apply-data-schema.ts          # apply / repair
 *   pnpm tsx scripts/apply-data-schema.ts --check  # report, change nothing
 *
 * `prisma/` is human-owned (CLAUDE.md), so the agent surfaces schema rather
 * than writing it. This script exists because the alternative — hand-pasting
 * a 180-line block and two back-relations into a 2,400-line file — is the
 * kind of manual step that silently half-lands.
 *
 * Every edit is scoped to a named model block. An earlier version matched
 * `viewGrants ViewGrant[]` globally to find `User`, and hit `ContentNode`
 * first — both models carry that field, and a non-global `replace` takes the
 * first match. The back-relation landed on the wrong model and Prisma
 * rejected the schema. Anchors are now resolved INSIDE a model, never across
 * the file.
 *
 * Idempotent and self-repairing: re-running fixes a misplaced back-relation
 * rather than refusing to act.
 *
 * Source of truth for the block:
 *   docs/notes-feature/work-tracking/data-schema-additions.prisma
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SCHEMA_PATH = resolve(process.cwd(), "prisma/schema.prisma");
const BLOCK_PATH = resolve(
  process.cwd(),
  "docs/notes-feature/work-tracking/data-schema-additions.prisma"
);

const CHECK_ONLY = process.argv.includes("--check");

const OLD_PAYLOAD = /model DataPayload \{[\s\S]*?\n\}\n/;

interface BackRelation {
  model: string;
  /** Field name, used for both detection and removal. */
  field: string;
  /** A field that exists in the target model, to anchor placement after. */
  anchorField: string;
  line: string;
}

const BACK_RELATIONS: BackRelation[] = [
  {
    model: "ContentNode",
    field: "promotedFromRow",
    anchorField: "dataPayload",
    line: '  promotedFromRow      DataRow?              @relation("PromotedDataRow")',
  },
  {
    model: "User",
    field: "dataViews",
    anchorField: "viewGrants",
    line: '  dataViews               DataView[]                @relation("DataViewOwner")',
  },
];

/** The span of `model <name> { … }`, so edits cannot escape it. */
function findModelBlock(
  schema: string,
  modelName: string
): { start: number; end: number; body: string } | null {
  const header = new RegExp(`^model ${modelName} \\{$`, "m");
  const match = header.exec(schema);
  if (!match) return null;
  const start = match.index;
  const close = schema.indexOf("\n}", start);
  if (close === -1) return null;
  const end = close + 2;
  return { start, end, body: schema.slice(start, end) };
}

function hasField(body: string, field: string): boolean {
  return new RegExp(`^\\s*${field}\\s`, "m").test(body);
}

function removeField(body: string, field: string): string {
  return body.replace(new RegExp(`^\\s*${field}\\s+[^\\n]*\\n`, "m"), "");
}

function addFieldAfter(body: string, anchorField: string, line: string): string | null {
  const anchor = new RegExp(`^\\s*${anchorField}\\s+[^\\n]*$`, "m");
  if (!anchor.test(body)) return null;
  return body.replace(anchor, (m) => `${m}\n${line}`);
}

function main() {
  let schema = readFileSync(SCHEMA_PATH, "utf8");
  const rawBlock = readFileSync(BLOCK_PATH, "utf8");

  const blockStart = rawBlock.search(/^(enum|model) /m);
  if (blockStart === -1) {
    console.error("Could not find a model or enum in the schema block.");
    process.exit(1);
  }
  const block = rawBlock.slice(blockStart).trimEnd();

  const notes: string[] = [];

  // ── 1. Models ────────────────────────────────────────────────────────
  if (/model DataColumn \{/.test(schema)) {
    notes.push("· models already present");
  } else if (!OLD_PAYLOAD.test(schema)) {
    console.error(
      "Could not find `model DataPayload { … }` to replace, and DataColumn is\n" +
        "absent. The schema may have been edited by hand — apply manually."
    );
    process.exit(1);
  } else {
    schema = schema.replace(OLD_PAYLOAD, `${block}\n`);
    notes.push("+ data models (DataColumnType, DataPayload, DataColumn, DataRow, DataRowLink, DataView)");
  }

  // ── 2. Back-relations, scoped per model ──────────────────────────────
  //
  // Strip the field from EVERY model first, then add it to the right one.
  // That is what makes a misplacement self-repairing instead of sticky.
  for (const relation of BACK_RELATIONS) {
    const modelNames = [...schema.matchAll(/^model (\w+) \{$/gm)].map((m) => m[1]);

    for (const name of modelNames) {
      if (name === relation.model) continue;
      const other = findModelBlock(schema, name);
      if (!other || !hasField(other.body, relation.field)) continue;
      schema =
        schema.slice(0, other.start) +
        removeField(other.body, relation.field) +
        schema.slice(other.end);
      notes.push(`- ${relation.field} removed from ${name} (misplaced)`);
    }

    const target = findModelBlock(schema, relation.model);
    if (!target) {
      notes.push(`! model ${relation.model} not found — add ${relation.field} by hand`);
      continue;
    }
    if (hasField(target.body, relation.field)) {
      notes.push(`· ${relation.model}.${relation.field} already present`);
      continue;
    }

    const updated = addFieldAfter(target.body, relation.anchorField, relation.line);
    if (!updated) {
      notes.push(
        `! anchor \`${relation.anchorField}\` not found in ${relation.model} — add ${relation.field} by hand`
      );
      continue;
    }
    schema = schema.slice(0, target.start) + updated + schema.slice(target.end);
    notes.push(`+ ${relation.model}.${relation.field}`);
  }

  if (CHECK_ONLY) {
    console.log("--check: would apply");
    notes.forEach((n) => console.log(`  ${n}`));
    console.log("\nNo files written.");
    return;
  }

  writeFileSync(SCHEMA_PATH, schema, "utf8");

  console.log("✓ prisma/schema.prisma updated");
  notes.forEach((n) => console.log(`  ${n}`));
  console.log(
    "\nVerify, then migrate:\n" +
      "  npx prisma validate\n" +
      "  SHADOW_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/shadow \\\n" +
      "    npx prisma migrate dev --name data_content_type\n" +
      "  npx prisma generate\n" +
      "  pnpm db:seed:data"
  );
}

main();
