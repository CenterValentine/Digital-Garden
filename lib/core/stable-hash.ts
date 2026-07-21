/**
 * Canonical (key-order-insensitive) JSON hashing.
 *
 * JSONB round-trips and TipTap sanitization reorder object keys, so plain
 * JSON.stringify produces different strings for semantically identical
 * values — the false-conflict bug fixed in PR #56. Hash content identity
 * through this module instead.
 */

import { createHash } from "crypto";

/** Deterministic stringify: object keys sorted at every depth. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const body = Object.keys(obj)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(",");
  return `{${body}}`;
}

/** sha256 hex digest of the canonical form. */
export function stableHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}
