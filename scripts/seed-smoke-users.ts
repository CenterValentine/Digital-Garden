/**
 * Seed two smoke-test users (smoke_alice / smoke_bob) and mint 24h session
 * tokens for API smoke testing. Prints JSON with ids + tokens.
 *
 * Usage (DATABASE_URL must be set; .env.local has it):
 *   DATABASE_URL=... npx tsx scripts/seed-smoke-users.ts
 *
 * Curl with:  -H "Cookie: session_token=<token>"
 */
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../lib/database/generated/prisma";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function ensureUser(username: string, email: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  return prisma.user.create({
    data: { username, email, role: "member" },
  });
}

async function mintSession(userId: string) {
  const token = randomUUID();
  await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  return token;
}

async function main() {
  const alice = await ensureUser("smoke_alice", "smoke-alice@test.local");
  const bob = await ensureUser("smoke_bob", "smoke-bob@test.local");
  const [aliceToken, bobToken] = await Promise.all([
    mintSession(alice.id),
    mintSession(bob.id),
  ]);
  console.log(
    JSON.stringify({
      alice: { id: alice.id, token: aliceToken },
      bob: { id: bob.id, token: bobToken },
    }),
  );
  await prisma.$disconnect();
  await pool.end();
}

void main();
