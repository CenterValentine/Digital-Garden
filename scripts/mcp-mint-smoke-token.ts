/**
 * Mint an MCP token for a local smoke run, without the server-only module.
 *
 *   pnpm tsx scripts/mcp-mint-smoke-token.ts <email> [capabilities,comma,separated]
 *
 * Prints the plaintext token once. Dev database only — never run against
 * production.
 */

import crypto from "node:crypto";
import { prisma } from "../lib/database/client";
import { MCP_TOKEN_PREFIX, parseMcpCapabilities } from "../lib/domain/mcp/capabilities";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("usage: tsx scripts/mcp-mint-smoke-token.ts <email> [caps]");
    process.exit(2);
  }
  if (/neon\.tech|pooler/.test(process.env.DATABASE_URL ?? "")) {
    console.error("refusing: DATABASE_URL looks like production");
    process.exit(2);
  }
  const caps = parseMcpCapabilities(process.argv[3] ? process.argv[3].split(",") : ["garden:read", "garden:read-chats", "garden:write-rows", "garden:delete-rows", "garden:write-files", "garden:report-issues"]);
  if (!caps.ok) {
    console.error(caps.reason);
    process.exit(2);
  }
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    console.error(`no user ${email}`);
    process.exit(2);
  }
  const token = `${MCP_TOKEN_PREFIX}${crypto.randomBytes(24).toString("hex")}`;
  await prisma.mcpToken.create({
    data: {
      userId: user.id,
      name: `smoke ${new Date().toISOString()}`,
      tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
      tokenPrefix: token.slice(0, 12),
      capabilities: caps.capabilities,
      rootIds: [],
      allChats: true,
      issuedVia: "pat",
    },
  });
  console.log(token);
  await prisma.$disconnect();
}

void main();
