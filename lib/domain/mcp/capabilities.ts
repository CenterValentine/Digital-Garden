/**
 * MCP token capabilities — the PURE vocabulary (MCP-DATABASE-REACH-PLAN §4).
 *
 * One grant per write family, so a token can be as narrow as "read, plus
 * fill this one ledger". Chats are their own grant because folder roots
 * cannot scope them. No server imports: the gate loads this file.
 */

export const MCP_CAPABILITIES = [
  "garden:read",
  "garden:read-chats",
  "garden:write-rows",
  "garden:delete-rows",
  "garden:write-files",
  "garden:report-issues",
] as const;

export type McpCapability = (typeof MCP_CAPABILITIES)[number];

/** Every token can read; the rest are opt-in. */
export const DEFAULT_MCP_CAPABILITIES: readonly McpCapability[] = ["garden:read"];

export function isMcpCapability(value: unknown): value is McpCapability {
  return (
    typeof value === "string" && (MCP_CAPABILITIES as readonly string[]).includes(value)
  );
}

/**
 * Normalise a requested grant list: unknown entries are refused by name,
 * duplicates collapse, and `garden:read` is always present because every
 * other capability is meaningless without it.
 */
export interface McpCapabilitiesParse {
  ok: boolean;
  /** Always present; empty when not ok. */
  capabilities: McpCapability[];
  /** Present when not ok. (A flat shape: this tsconfig does not narrow unions on `ok`.) */
  reason?: string;
}

export function parseMcpCapabilities(raw: unknown): McpCapabilitiesParse {
  if (raw === undefined) return { ok: true, capabilities: [...DEFAULT_MCP_CAPABILITIES] };
  if (!Array.isArray(raw)) {
    return { ok: false, capabilities: [], reason: "capabilities must be a list" };
  }
  const out = new Set<McpCapability>(["garden:read"]);
  for (const entry of raw) {
    if (!isMcpCapability(entry)) {
      return { ok: false, capabilities: [], reason: `unknown capability "${String(entry)}"` };
    }
    out.add(entry);
  }
  return { ok: true, capabilities: MCP_CAPABILITIES.filter((c) => out.has(c)) };
}

/** Token string shape: `dgmcp_` + 48 hex. Distinct from `dgext_` and `dgwf_`. */
export const MCP_TOKEN_PREFIX = "dgmcp_";
export const MCP_TOKEN_PATTERN = /^dgmcp_[0-9a-f]{48}$/;
