/**
 * mint-terms-sync-token.ts — issue the credential that gates terms sync to a
 * single Digital Garden account.
 *
 * Terms sync writes notes into a production garden, so it authenticates rather
 * than assuming. The credential is a `ServiceToken` (the same hashed, scoped,
 * revocable PAT table the workflows spoke uses) carrying the
 * `garden:terms-sync` scope. Because the token row carries `userId`, the writer
 * script *derives* the owner from the credential instead of being told who to
 * write as — so a leaked or stale token cannot be pointed at a different
 * account, and revoking the row kills the skill's write access immediately.
 *
 * Usage:
 *   npx tsx scripts/mint-terms-sync-token.ts --account you@example.com
 *   npx tsx scripts/mint-terms-sync-token.ts --account you@example.com --expires 2027-01-01
 *   npx tsx scripts/mint-terms-sync-token.ts --account you@example.com --revoke-existing
 *   npx tsx scripts/mint-terms-sync-token.ts --list --account you@example.com
 *
 * The plaintext token is printed exactly once and never persisted — only its
 * sha256 hash is stored. Lose it and mint a new one.
 *
 * Requires TERMS_SYNC_DATABASE_URL (see `_terms-sync-env.ts`).
 */

import "./_terms-sync-env";
import { describeTermsSyncTarget } from "./_terms-sync-env";

import crypto from "crypto";

import { prisma } from "@/lib/database/client";
import {
  hashServiceToken,
  createServiceTokenPrefix,
} from "@/extensions/workflows/server/service-token";

import {
  GARDEN_TERMS_SYNC_SCOPE,
  TERMS_SYNC_TOKEN_PREFIX,
} from "./_terms-sync-shared";

function readFlag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) return undefined;
  return value;
}

/** `dggl_` + 48 hex chars, matching the shape of the sibling token families. */
function createTermsSyncTokenValue(): string {
  return `${TERMS_SYNC_TOKEN_PREFIX}${crypto.randomBytes(24).toString("hex")}`;
}

async function main() {
  const argv = process.argv.slice(2);
  const account = readFlag(argv, "account");
  const list = argv.includes("--list");
  const revokeExisting = argv.includes("--revoke-existing");
  const name = readFlag(argv, "name") ?? "Claude Code terms sync";
  const expires = readFlag(argv, "expires");

  if (!account) {
    console.error("  ✗ --account <email> is required.");
    process.exit(1);
  }

  const target = describeTermsSyncTarget();
  console.log("");
  console.log(`  target:   ${target.host} / ${target.database}`);
  console.log(`  account:  ${account}`);
  console.log("");

  const user = await prisma.user.findUnique({
    where: { email: account.toLowerCase().trim() },
    select: { id: true, email: true, username: true },
  });

  if (!user) {
    console.error(
      `  ✗ No user with email ${account} in this database.\n` +
        "    Check TERMS_SYNC_DATABASE_URL points at the garden you mean.",
    );
    process.exit(1);
  }

  const existing = await prisma.serviceToken.findMany({
    where: {
      userId: user.id,
      scopes: { has: GARDEN_TERMS_SYNC_SCOPE },
      revokedAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
  });

  if (list) {
    if (existing.length === 0) {
      console.log("  No active terms-sync tokens for this account.\n");
    } else {
      console.log(`  ${existing.length} active terms-sync token(s):\n`);
      for (const token of existing) {
        const used = token.lastUsedAt
          ? token.lastUsedAt.toISOString().slice(0, 10)
          : "never";
        const exp = token.expiresAt
          ? token.expiresAt.toISOString().slice(0, 10)
          : "no expiry";
        console.log(
          `    ${token.tokenPrefix}…  ${token.name}  (created ${token.createdAt
            .toISOString()
            .slice(0, 10)}, last used ${used}, ${exp})`,
        );
      }
      console.log("");
    }
    return;
  }

  if (existing.length > 0 && !revokeExisting) {
    console.warn(
      `  ⚠ ${existing.length} active terms-sync token(s) already exist for this account.\n` +
        "    Minting another leaves them all valid. Pass --revoke-existing to\n" +
        "    replace them, or --list to review first.\n",
    );
  }

  if (revokeExisting && existing.length > 0) {
    const { count } = await prisma.serviceToken.updateMany({
      where: { id: { in: existing.map((t) => t.id) } },
      data: { revokedAt: new Date() },
    });
    console.log(`  ↻ revoked ${count} previous terms-sync token(s)`);
  }

  const tokenValue = createTermsSyncTokenValue();
  const record = await prisma.serviceToken.create({
    data: {
      userId: user.id,
      name,
      tokenHash: hashServiceToken(tokenValue),
      tokenPrefix: createServiceTokenPrefix(tokenValue),
      scopes: [GARDEN_TERMS_SYNC_SCOPE],
      expiresAt: expires ? new Date(expires) : null,
    },
    select: { id: true, tokenPrefix: true, expiresAt: true },
  });

  console.log("");
  console.log("  ✓ Terms-sync token minted. Shown once — copy it now.\n");
  console.log("  Add to .env.terms-sync.local:\n");
  console.log(`      TERMS_SYNC_TOKEN=${tokenValue}`);
  console.log(`      TERMS_SYNC_ACCOUNT_EMAIL=${user.email}`);
  console.log("");
  console.log(`  scope:    ${GARDEN_TERMS_SYNC_SCOPE}`);
  console.log(`  prefix:   ${record.tokenPrefix}`);
  console.log(
    `  expires:  ${record.expiresAt ? record.expiresAt.toISOString().slice(0, 10) : "never"}`,
  );
  console.log("");
  console.log(`  Revoke later: --account ${user.email} --revoke-existing`);
  console.log("");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
