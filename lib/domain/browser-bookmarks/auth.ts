import crypto from "crypto";
import { prisma } from "@/lib/database/client";
import { BROWSER_BOOKMARKS_SCOPE } from "./types";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createBrowserExtensionTokenValue() {
  return `dgext_${crypto.randomBytes(24).toString("hex")}`;
}

export function createBrowserExtensionTokenPrefix(token: string) {
  return token.slice(0, 12);
}

export async function validateBrowserExtensionToken(token: string) {
  const tokenHash = hashToken(token.trim());
  const record = await prisma.browserExtensionToken.findUnique({
    where: { tokenHash },
    include: {
      install: true,
      user: {
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
        },
      },
    },
  });

  if (!record) {
    return null;
  }

  if (record.revokedAt) {
    return null;
  }

  if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  if (!record.scopes.includes(BROWSER_BOOKMARKS_SCOPE)) {
    return null;
  }

  if (record.install?.revokedAt) {
    return null;
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.browserExtensionToken.update({
      where: { id: record.id },
      data: { lastUsedAt: now },
    }),
    ...(record.install
      ? [
          prisma.browserExtensionInstall.update({
            where: { id: record.install.id },
            data: { lastSeenAt: now },
          }),
        ]
      : []),
  ]);

  return record;
}

export function hashBrowserExtensionToken(token: string) {
  return hashToken(token.trim());
}
