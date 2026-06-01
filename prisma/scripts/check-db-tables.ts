/* eslint-disable no-console -- CLI script: stdout is the user-facing output */
/**
 * One-shot probe: list which chat/connection-relevant tables actually
 * exist in the live dev database. Used to disambiguate confusing
 * `prisma migrate diff` output. Disposable — delete after.
 */

import { prisma } from "../../lib/database/client";

const TARGETS = [
  "AIConnection",
  "AIFeatureRoute",
  "Conversation",
  "ConversationMessage",
  "ConversationAssociation",
  "TenantHost",
];

async function main() {
  const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])
     ORDER BY table_name`,
    TARGETS,
  );

  const found = new Set(rows.map((r) => r.table_name));
  console.log("\n=== DB table presence ===");
  for (const name of TARGETS) {
    const present = found.has(name);
    console.log(`  ${present ? "✓" : "✗"} ${name}`);
  }
  console.log("");
}

main()
  .catch((err) => {
    console.error("[check-db-tables] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
