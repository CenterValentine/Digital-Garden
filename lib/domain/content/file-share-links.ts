/**
 * Public file share links — server side.
 *
 * A file becomes reachable outside the app through a capability URL,
 * `/f/<token>`, backed by `FilePayload.publicToken`. The token is the whole
 * secret: anyone holding the link can fetch the bytes (same trust model as a
 * Google Drive "anyone with the link" file or a Slack file URL). Nothing else
 * about the file is exposed, and rotating the token revokes every copy.
 *
 * Tokens are minted lazily — the first time a link is requested for a file —
 * so files that were never opened in a copy-capable editor never carry one,
 * and files uploaded before this column existed pick one up the first time
 * they are.
 *
 * The URL layer is deliberately a redirect to a short-lived presigned URL
 * (see app/f/[token]/route.ts) rather than a byte proxy: `<img>` tags,
 * markdown renderers and fetch() all follow 302s, and the presign is what
 * keeps the underlying bucket private.
 */

import crypto from "crypto";
import { prisma } from "@/lib/database/client";

export const PUBLIC_FILE_PATH_PREFIX = "/f/";

export const PUBLIC_FILE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/** base64url of 18 random bytes → 24 URL-safe chars, 144 bits of entropy. */
export function mintPublicFileToken(): string {
  return crypto.randomBytes(18).toString("base64url");
}

export function publicFilePath(token: string): string {
  return `${PUBLIC_FILE_PATH_PREFIX}${token}`;
}

const MAX_BATCH = 200;

/**
 * Resolve (minting where missing) the public link path for each of the
 * caller's ready, live files. Ids the caller does not own, that are trashed,
 * or that are not finished uploading are silently omitted from the result —
 * the client treats a missing entry as "not shareable yet" and falls back.
 */
export async function ensurePublicFileLinks(
  ownerId: string,
  contentIds: readonly string[],
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(contentIds)).slice(0, MAX_BATCH);
  if (unique.length === 0) return {};

  const rows = await prisma.filePayload.findMany({
    where: {
      contentId: { in: unique },
      uploadStatus: "ready",
      content: { ownerId, deletedAt: null },
    },
    select: { contentId: true, publicToken: true },
  });

  const links: Record<string, string> = {};
  const missing: string[] = [];
  for (const row of rows) {
    if (row.publicToken) links[row.contentId] = publicFilePath(row.publicToken);
    else missing.push(row.contentId);
  }

  for (const contentId of missing) {
    const candidate = mintPublicFileToken();
    // Only claim the slot if it is still empty. A concurrent minter that wins
    // the race keeps its token and we read it back, so both callers hand out
    // the same link instead of one of them handing out a dead one.
    const claimed = await prisma.filePayload.updateMany({
      where: { contentId, publicToken: null },
      data: { publicToken: candidate },
    });
    if (claimed.count === 1) {
      links[contentId] = publicFilePath(candidate);
      continue;
    }
    const winner = await prisma.filePayload.findUnique({
      where: { contentId },
      select: { publicToken: true },
    });
    if (winner?.publicToken) links[contentId] = publicFilePath(winner.publicToken);
  }

  return links;
}
