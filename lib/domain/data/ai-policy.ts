/**
 * Per-database AI policy — client-safe, no server imports.
 *
 * A database owns the rules for what the assistant may do to it beyond
 * reading and writing cells. The first rule is deletion
 * (MCP-DATABASE-REACH-PLAN §2.8, owner 2026-10-12): rows can already be
 * soft-deleted and restored, so the only question a delete raises is
 * CONSENT, and consent is the table owner's to set, not the model's to
 * attest. Hence a policy on the table, read by every AI surface that can
 * delete (chat's `delete_rows` today; the MCP tool when it lands), rather
 * than a `confirmedByUser` flag the model sets itself.
 *
 *   confirm  (default) the call pauses on an approval card the USER answers
 *            in chat; over MCP the server asks through elicitation and
 *            refuses on clients that cannot elicit
 *   allow    delete at once; the user gets an inbox notice with an undo hint
 *   deny     refuse, naming the setting
 *
 * Stored as a Json bag (`DataPayload.aiPolicy`) so later rules join it
 * without a migration — the config-over-enum-members doctrine (Database II
 * D11). `readAiPolicy` is tolerant on the way in (an unknown or malformed
 * bag reads as the defaults) and `parseAiPolicyPatch` is strict on the way
 * out (a PATCH must name a known key with a known value), the same split
 * `encodeCell` makes for cells.
 */

export const AI_DELETE_POLICIES = ["confirm", "allow", "deny"] as const;
export type AiDeletePolicy = (typeof AI_DELETE_POLICIES)[number];

/** Ask the user. Flipping this default is a product decision, not a tidy-up. */
export const DEFAULT_AI_DELETE_POLICY: AiDeletePolicy = "confirm";

export interface DataAiPolicy {
  delete: AiDeletePolicy;
}

export const DEFAULT_AI_POLICY: DataAiPolicy = Object.freeze({
  delete: DEFAULT_AI_DELETE_POLICY,
});

export function isAiDeletePolicy(value: unknown): value is AiDeletePolicy {
  return (
    typeof value === "string" &&
    (AI_DELETE_POLICIES as readonly string[]).includes(value)
  );
}

/**
 * Read a stored bag tolerantly: anything that is not a known value for a
 * known key falls back to the default for that key. Never throws — a
 * corrupt bag must not take the table's schema read down with it.
 */
export function readAiPolicy(raw: unknown): DataAiPolicy {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ...DEFAULT_AI_POLICY };
  }
  const bag = raw as Record<string, unknown>;
  return {
    delete: isAiDeletePolicy(bag.delete) ? bag.delete : DEFAULT_AI_DELETE_POLICY,
  };
}

/**
 * One flat shape rather than a discriminated union: this repo's tsconfig
 * does not narrow unions on `ok`, so callers read `reason` / `patch` as
 * optionals and the gate asserts they are set exactly when expected.
 */
export interface AiPolicyPatchResult {
  ok: boolean;
  /** Present when ok. */
  patch?: Partial<DataAiPolicy>;
  /** Present when not ok — safe to return to the client verbatim. */
  reason?: string;
}

/**
 * Validate a PATCH body strictly. Unknown keys and unknown values are
 * refusals with a reason the route can return verbatim.
 */
export function parseAiPolicyPatch(raw: unknown): AiPolicyPatchResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: "aiPolicy must be an object" };
  }
  const bag = raw as Record<string, unknown>;
  const patch: Partial<DataAiPolicy> = {};
  for (const [key, value] of Object.entries(bag)) {
    if (key === "delete") {
      if (!isAiDeletePolicy(value)) {
        return {
          ok: false,
          reason: `aiPolicy.delete must be one of ${AI_DELETE_POLICIES.join(", ")}`,
        };
      }
      patch.delete = value;
      continue;
    }
    return { ok: false, reason: `aiPolicy has no setting named "${key}"` };
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, reason: "aiPolicy names nothing to change" };
  }
  return { ok: true, patch };
}

/** The stored bag after a validated patch — known keys only, defaults filled. */
export function mergeAiPolicy(
  current: unknown,
  patch: Partial<DataAiPolicy>
): DataAiPolicy {
  return { ...readAiPolicy(current), ...patch };
}

/** Copy for the schema rail and the control panel — one vocabulary. */
export const AI_DELETE_POLICY_LABELS: Record<
  AiDeletePolicy,
  { label: string; hint: string }
> = {
  confirm: {
    label: "Ask me",
    hint: "The assistant may delete rows only after you approve each request on a card.",
  },
  allow: {
    label: "Allowed",
    hint: "The assistant may delete rows without asking; you get an inbox notice with an undo hint.",
  },
  deny: {
    label: "Never",
    hint: "The assistant cannot delete rows here. You can still delete them in the grid.",
  },
};
