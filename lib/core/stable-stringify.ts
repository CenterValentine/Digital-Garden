/**
 * Deterministic stringify: object keys sorted at every depth.
 *
 * JSONB round-trips and TipTap sanitization reorder object keys, so plain
 * JSON.stringify produces different strings for semantically identical values
 * — the false-conflict bug fixed in PR #56. Compare content identity through
 * this form.
 *
 * Lives apart from stable-hash.ts because that module imports `node:crypto`
 * for the sha256 digest, which a "use client" component cannot pull in. The
 * client needs only the canonical FORM: comparing two canonical strings is
 * exactly equivalent to comparing their hashes, without the hash.
 */
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
