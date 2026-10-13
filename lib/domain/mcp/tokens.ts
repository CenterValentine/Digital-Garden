import "server-only";

/**
 * MCP personal access tokens (MCP-DATABASE-REACH-PLAN §4).
 *
 * Mirrors the workflow service-token module: sha256 at rest, a 12-char
 * display prefix, the plaintext returned exactly once at creation and never
 * stored. `validateMcpToken` is the ONE verifier — a PAT minted on the
 * settings page and a token issued through the OAuth flow are the same row,
 * so the MCP route's `verifyToken` has a single implementation (§8.1).
 */

import crypto from "crypto";
import { prisma } from "@/lib/database/client";
import type { McpToken } from "@/lib/database/generated/prisma";
import {
  MCP_TOKEN_PREFIX,
  parseMcpCapabilities,
  type McpCapability,
} from "./capabilities";

export interface McpTokenDto {
  id: string;
  name: string;
  tokenPrefix: string;
  capabilities: McpCapability[];
  rootIds: string[];
  allChats: boolean;
  readTokenCap: number | null;
  dailyCallCap: number | null;
  issuedVia: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface McpTokenCreateDto {
  /** Plaintext, shown once. */
  token: string;
  record: McpTokenDto;
}

export function hashMcpToken(token: string): string {
  return crypto.createHash("sha256").update(token.trim()).digest("hex");
}

export function createMcpTokenValue(): string {
  return `${MCP_TOKEN_PREFIX}${crypto.randomBytes(24).toString("hex")}`;
}

export function createMcpTokenPrefix(token: string): string {
  return token.slice(0, 12);
}

function asIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function formatRecord(token: McpToken): McpTokenDto {
  return {
    id: token.id,
    name: token.name,
    tokenPrefix: token.tokenPrefix,
    capabilities: token.capabilities as McpCapability[],
    rootIds: token.rootIds,
    allChats: token.allChats,
    readTokenCap: token.readTokenCap,
    dailyCallCap: token.dailyCallCap,
    issuedVia: token.issuedVia,
    createdAt: token.createdAt.toISOString(),
    lastUsedAt: asIso(token.lastUsedAt),
    expiresAt: asIso(token.expiresAt),
    revokedAt: asIso(token.revokedAt),
  };
}

export { formatRecord as formatMcpTokenRecord };

/** The verified identity an MCP request runs as. */
export interface McpTokenContext {
  userId: string;
  record: McpTokenDto;
}

/**
 * Null on any failure: unknown, revoked, expired, or missing the required
 * capability. Stamps `lastUsedAt` best-effort.
 */
export async function validateMcpToken(
  token: string,
  requiredCapability: McpCapability = "garden:read"
): Promise<McpTokenContext | null> {
  if (!token.trim().startsWith(MCP_TOKEN_PREFIX)) return null;
  const record = await prisma.mcpToken.findUnique({ where: { tokenHash: hashMcpToken(token) } });
  if (!record) return null;
  if (record.revokedAt) return null;
  if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) return null;
  if (!record.capabilities.includes(requiredCapability)) return null;
  try {
    await prisma.mcpToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } });
  } catch {
    // the token is valid regardless of the stamp
  }
  return { userId: record.userId, record: formatRecord(record) };
}

export async function listMcpTokens(userId: string): Promise<McpTokenDto[]> {
  const tokens = await prisma.mcpToken.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  return tokens.map(formatRecord);
}

export interface CreateMcpTokenInput {
  name?: string;
  capabilities?: unknown;
  rootIds?: string[];
  allChats?: boolean;
  readTokenCap?: number | null;
  dailyCallCap?: number | null;
  expiresAt?: string | null;
  issuedVia?: "pat" | "oauth";
}

export async function createMcpTokenRecord(
  userId: string,
  input: CreateMcpTokenInput
): Promise<McpTokenCreateDto> {
  const caps = parseMcpCapabilities(input.capabilities);
  if (!caps.ok) throw new Error(caps.reason ?? "invalid capabilities");
  const rootIds = (input.rootIds ?? []).filter((id) => typeof id === "string" && id.length > 0);
  if (rootIds.length > 0) {
    // Roots must be the owner's own nodes; a foreign id is dropped, not trusted.
    const owned = await prisma.contentNode.findMany({
      where: { id: { in: rootIds }, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((n) => n.id));
    if (ownedIds.size !== rootIds.length) {
      throw new Error("Every root must be one of your own folders or databases");
    }
  }
  const tokenValue = createMcpTokenValue();
  const token = await prisma.mcpToken.create({
    data: {
      userId,
      name: input.name?.trim() || "MCP token",
      tokenHash: hashMcpToken(tokenValue),
      tokenPrefix: createMcpTokenPrefix(tokenValue),
      capabilities: caps.capabilities,
      rootIds,
      allChats: input.allChats === true,
      readTokenCap: input.readTokenCap ?? null,
      dailyCallCap: input.dailyCallCap ?? null,
      issuedVia: input.issuedVia ?? "pat",
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
  });
  return { token: tokenValue, record: formatRecord(token) };
}

export async function revokeMcpToken(userId: string, tokenId: string): Promise<McpTokenDto> {
  const token = await prisma.mcpToken.findFirst({ where: { id: tokenId, userId } });
  if (!token) throw new Error("MCP token not found");
  const updated = await prisma.mcpToken.update({
    where: { id: token.id },
    data: { revokedAt: new Date() },
  });
  return formatRecord(updated);
}

export async function deleteMcpToken(userId: string, tokenId: string): Promise<{ id: string }> {
  const token = await prisma.mcpToken.findFirst({ where: { id: tokenId, userId } });
  if (!token) throw new Error("MCP token not found");
  await prisma.mcpToken.delete({ where: { id: token.id } });
  return { id: token.id };
}
