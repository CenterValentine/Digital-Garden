import type { AttrValue } from "./types";

// Belt-and-suspenders runtime guard. The primary PII firewall is the type
// system — attrs are typed Record<string, string | number | boolean>, so
// non-scalars are a compile error. This function catches accidents at runtime:
// keys named like secrets, or scalar values that ballooned past a sane size.
//
// Sized at minimum: per the Phase 0 PII audit, the codebase has zero current
// offenders. This is here to keep that property going forward, not to fix the
// current state.

const SUSPICIOUS_KEY_PATTERNS: readonly RegExp[] = [
  /password/i,
  /secret/i,
  /token/i,
  /apikey/i,
  /api_key/i,
  /cookie/i,
  /authorization/i,
];

const MAX_STRING_LENGTH = 256;

export function sanitizeAttrs(
  attrs: Record<string, AttrValue> | undefined,
): Record<string, AttrValue> | undefined {
  if (!attrs) return undefined;
  const result: Record<string, AttrValue> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (SUSPICIOUS_KEY_PATTERNS.some((p) => p.test(key))) {
      result[key] = "[REDACTED]";
      continue;
    }
    if (typeof value === "string" && value.length > MAX_STRING_LENGTH) {
      result[key] = value.slice(0, MAX_STRING_LENGTH) + "...[truncated]";
      continue;
    }
    result[key] = value;
  }
  return result;
}

export function sanitizeSummary(summary: string | undefined): string | undefined {
  if (!summary) return undefined;
  if (summary.length > MAX_STRING_LENGTH) {
    return summary.slice(0, MAX_STRING_LENGTH) + "...[truncated]";
  }
  return summary;
}
