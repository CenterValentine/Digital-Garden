/**
 * Canonical (key-order-insensitive) JSON hashing.
 *
 * JSONB round-trips and TipTap sanitization reorder object keys, so plain
 * JSON.stringify produces different strings for semantically identical
 * values — the false-conflict bug fixed in PR #56. Hash content identity
 * through this module instead.
 */

import { createHash } from "crypto";
import { stableStringify } from "./stable-stringify";

// Canonical form lives in ./stable-stringify (crypto-free, client-safe);
// re-exported here so existing server imports keep working unchanged.
export { stableStringify };

/** sha256 hex digest of the canonical form. */
export function stableHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}
