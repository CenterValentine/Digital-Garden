import "server-only";

/**
 * MCP prompts (MCP-PLAN §3.3, MCP-DATABASE-REACH-PLAN §2.8): the user's
 * charters as pickable, compiled instruction sets, plus the issue-filing
 * prompt. `prompts/get` returns the RENDERED charter — progressive
 * disclosure is an in-engine optimisation; an external client gets the
 * compiled form, private content stripped by the charter renderer.
 */

import type { JSONContent } from "@tiptap/core";
import { prisma } from "@/lib/database/client";
import { listCharters } from "@/lib/domain/ai/charters/registry";
import { parseCharter } from "@/lib/domain/ai/charters/parse";
import { renderCharterSection } from "@/lib/domain/ai/charters/render";
import { getServerExtensions } from "@/lib/domain/editor/extensions-server";
import type { McpScope } from "./jurisdiction";

export interface CharterPrompt {
  id: string;
  title: string;
  description: string;
  phaseCount: number;
}

export async function listCharterPrompts(scope: McpScope): Promise<CharterPrompt[]> {
  const all = await listCharters(scope.userId);
  const out: CharterPrompt[] = [];
  for (const c of all) {
    if (!(await scope.nodeInScope(c.id))) continue;
    out.push({ id: c.id, title: c.title, description: c.description, phaseCount: c.phaseCount });
  }
  return out;
}

/** The compiled charter: standing rules, then every phase in order. */
export async function renderCharter(scope: McpScope, charterId: string): Promise<string | null> {
  if (!(await scope.nodeInScope(charterId))) return null;
  const node = await prisma.contentNode.findFirst({
    where: { id: charterId, ownerId: scope.userId, deletedAt: null },
    select: { title: true, notePayload: { select: { tiptapJson: true } } },
  });
  const json = node?.notePayload?.tiptapJson as JSONContent | undefined;
  if (!node || !json) return null;
  const parsed = parseCharter(json);
  const ext = getServerExtensions();
  const parts: string[] = [`# Charter: ${node.title}`];
  const standing = renderCharterSection(parsed.standingRules.content, ext);
  if (standing.trim()) parts.push(`## Standing rules\n${standing}`);
  parsed.phases.forEach((phase, i) => {
    const body = renderCharterSection(phase.content, ext);
    parts.push(`## Phase ${i + 1}: ${phase.title}\n${body}`);
  });
  return parts.join("\n\n");
}

export const REPORT_ISSUE_PROMPT = `You are working in a Digital Garden through its MCP server. Something misbehaved: a tool returned an unexpected error twice with the same inputs, or a result contradicted what you had just read. File it with garden_report_issue:
- kind "bug", a title that names the tool and the symptom
- body: what you called (tool and input shape, never the user's content), what came back, what you expected, and the errorId if a result carried one
- area "mcp"
Then tell the user the issue number and continue with a safer path (append instead of replace, narrow instead of whole-table reads).`;
