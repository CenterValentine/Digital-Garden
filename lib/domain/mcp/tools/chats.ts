import "server-only";

/**
 * Chats over MCP (MCP-DATABASE-REACH-PLAN §2.1): a separate, read-only tool
 * set, so a model that never reaches for them never sees a chat. Scope: a
 * chat is reachable when it is associated with content inside the token's
 * roots, or when the token carries `allChats`.
 */

import {
  getConversation,
  listConversations,
  listConversationsByContent,
  type ConversationMessageView,
} from "@/lib/features/conversations";
import { stripRevertSnapshotFromParts } from "@/lib/domain/ai/compact-tool-outputs";
import { readTurnDiagnostics } from "@/lib/domain/ai/turn-diagnostics";
import type { McpScope } from "../jurisdiction";

export interface ChatHit {
  id: string;
  title: string;
  updatedAt: string;
  about: string[];
}

export async function searchChats(
  scope: McpScope,
  allChats: boolean,
  input: { query?: string; about?: string; since?: string; limit: number }
): Promise<ChatHit[]> {
  const since = input.since ? new Date(input.since) : null;
  const allowed = await scope.subtreeIds();

  if (input.about) {
    if (!(await scope.nodeInScope(input.about))) return [];
    const rows = await listConversationsByContent(scope.userId, [input.about]);
    return rows
      .filter((r) => !since || new Date(r.updatedAt) > since)
      .filter((r) => !input.query || (r.title ?? "").toLowerCase().includes(input.query.toLowerCase()))
      .slice(0, input.limit)
      .map((r) => ({
        id: r.conversationId,
        title: r.title ?? "Untitled chat",
        updatedAt: r.updatedAt,
        about: r.associations.map((a) => a.contentNodeId),
      }));
  }

  if (allChats || scope.wholeGarden) {
    const rows = await listConversations(scope.userId, {
      query: input.query,
      limit: input.limit,
    });
    return rows
      .filter((r) => !since || new Date(r.updatedAt) > since)
      .map((r) => ({ id: r.id, title: r.title ?? "Untitled chat", updatedAt: r.updatedAt, about: [] }));
  }

  // Scoped token: chats about any in-scope node.
  const ids = [...(allowed ?? [])];
  if (ids.length === 0) return [];
  const rows = await listConversationsByContent(scope.userId, ids.slice(0, 2000));
  return rows
    .filter((r) => !since || new Date(r.updatedAt) > since)
    .filter((r) => !input.query || (r.title ?? "").toLowerCase().includes(input.query.toLowerCase()))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, input.limit)
    .map((r) => ({
      id: r.conversationId,
      title: r.title ?? "Untitled chat",
      updatedAt: r.updatedAt,
      about: r.associations.map((a) => a.contentNodeId),
    }));
}

export async function chatInScope(scope: McpScope, allChats: boolean, conversationId: string): Promise<boolean> {
  if (allChats || scope.wholeGarden) return true;
  const detail = await getConversation(scope.userId, conversationId).catch(() => null);
  if (!detail) return false;
  for (const a of detail.associations) if (await scope.nodeInScope(a.contentNodeId)) return true;
  return false;
}

interface PartShape {
  type?: unknown;
  text?: unknown;
  state?: unknown;
  toolName?: unknown;
}

/** One message as markdown: text parts verbatim, tool parts folded to a line. */
function renderMessage(m: ConversationMessageView): string {
  const parts = stripRevertSnapshotFromParts(m.parts);
  const lines: string[] = [];
  if (Array.isArray(parts)) {
    for (const raw of parts) {
      const p = (raw ?? {}) as PartShape;
      const t = typeof p.type === "string" ? p.type : "";
      if (t === "text" && typeof p.text === "string") lines.push(p.text);
      else if (t.startsWith("tool-")) {
        lines.push(`[tool ${t.slice(5)}${typeof p.state === "string" ? `: ${p.state}` : ""}]`);
      }
    }
  } else if (m.textCache) {
    lines.push(m.textCache);
  }
  const body = lines.join("\n").trim() || (m.textCache ?? "").trim();
  const who = m.role === "user" ? "User" : m.role === "assistant" ? "Assistant" : m.role;
  return `**${who}** · ${m.createdAt}\n${body || "(no text)"}`;
}

export async function readChat(
  userId: string,
  conversationId: string,
  parts: ReadonlySet<string>,
  last: number
): Promise<{ text: string; structured: Record<string, unknown> } | null> {
  const detail = await getConversation(userId, conversationId).catch(() => null);
  if (!detail) return null;
  const sections: string[] = [`# ${detail.title ?? "Untitled chat"}`, `Updated ${detail.updatedAt} · ${detail.messages.length} messages`];
  const structured: Record<string, unknown> = {
    id: detail.id,
    title: detail.title,
    updatedAt: detail.updatedAt,
    messageCount: detail.messages.length,
  };

  if (parts.has("associations")) {
    const assoc = detail.associations.map((a) => ({
      contentId: a.contentNodeId,
      title: a.contentTitle ?? null,
      source: a.source,
      lastReferencedAt: a.lastReferencedAt,
    }));
    structured.associations = assoc;
    sections.push(
      `## About\n${assoc.length ? assoc.map((a) => `- ${a.title ?? a.contentId} (${a.source}, ${a.contentId})`).join("\n") : "(no associated content)"}`
    );
  }

  if (parts.has("messages")) {
    const window = detail.messages.slice(-last);
    sections.push(`## Messages (last ${window.length})\n\n${window.map(renderMessage).join("\n\n")}`);
  }

  if (parts.has("outputs")) {
    // Outputs are the content this chat produced: notes it owns and rows it
    // recorded. Both are findable from associations with source "output".
    const outputs = detail.associations.filter((a) => String(a.source).toLowerCase().includes("output"));
    structured.outputs = outputs.map((a) => ({ contentId: a.contentNodeId, title: a.contentTitle ?? null }));
    sections.push(
      `## Outputs\n${outputs.length ? outputs.map((a) => `- ${a.contentTitle ?? a.contentNodeId} (${a.contentNodeId})`).join("\n") : "(none recorded)"}`
    );
  }

  if (parts.has("diagnostics")) {
    const rows: string[] = ["| turn | model | finish | steps | tools | in | out | flags |", "|---|---|---|---|---|---|---|---|"];
    const diag: Array<Record<string, unknown>> = [];
    let turn = 0;
    for (const m of detail.messages) {
      if (m.role !== "assistant") continue;
      turn += 1;
      const meta = (m.metadata ?? {}) as Record<string, unknown>;
      const d = readTurnDiagnostics(meta);
      const route = meta.modelRoute as Record<string, unknown> | undefined;
      const model = m.modelId ?? (route?.modelId as string | undefined) ?? "?";
      const usage = (meta.usage ?? {}) as Record<string, unknown>;
      const steps = d?.segments.reduce((n, s) => n + (s.stepsUsed ?? 0), 0) ?? "";
      const tools = d?.segments.reduce((n, s) => n + (s.toolCount ?? 0), 0) ?? "";
      const flags = d?.flags.join(", ") ?? "";
      rows.push(
        `| ${turn} | ${model} | ${d?.finishReason ?? meta.finishReason ?? ""} | ${steps} | ${tools} | ${usage.inputTokens ?? ""} | ${usage.outputTokens ?? ""} | ${flags} |`
      );
      diag.push({
        turn,
        messageId: m.id,
        model,
        provider: m.providerId,
        finishReason: d?.finishReason ?? meta.finishReason ?? null,
        steps,
        tools,
        usage,
        flags: d?.flags ?? [],
        segments: d?.segments.length ?? 0,
        durationMs: meta.durationMs ?? null,
      });
    }
    structured.diagnostics = diag;
    sections.push(`## Diagnostics\n${rows.join("\n")}`);
  }

  return { text: sections.join("\n\n"), structured };
}
