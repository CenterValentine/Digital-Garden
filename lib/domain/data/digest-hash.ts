/**
 * Row source hash for AI digests (AI-BULK-ROW-READING-PLAN §5.2).
 *
 * Read-time staleness is a HASH comparison, never a timestamp: writing the
 * digest itself bumps `updatedAt`, so time cannot tell a digest apart from
 * an edit. The hash covers the row's cells (key-sorted, so JSONB key order
 * cannot perturb it) plus its forward relation link ids, so an undo back to
 * the same content reads fresh again and a re-link reads stale.
 *
 * Server-side (node:crypto); the canonical JSON helper is shared with the
 * column-config comparison in mutations.ts.
 */

import { createHash } from "node:crypto";

/** Key-sorted stringify so a value round-tripped through jsonb compares equal. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * sha256 over the row's data and its forward link ids. `forwardLinkIds`
 * is sorted here so caller order never matters.
 */
export function rowSourceHash(
  data: Record<string, unknown>,
  forwardLinkIds: Iterable<string>
): string {
  const links = [...forwardLinkIds].sort();
  return createHash("sha256")
    .update(canonicalJson(data))
    .update("|")
    .update(links.join(","))
    .digest("hex");
}
