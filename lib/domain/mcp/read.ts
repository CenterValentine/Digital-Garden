/**
 * MCP read rendering — the egress seam for the garden's MCP server
 * (MCP-DATABASE-REACH-PLAN §2.1, §4).
 *
 * Every note that leaves the garden through MCP passes through here, and
 * nothing here may forget the private-content strip: `garden_read`, the
 * `garden://note/{id}` resource and the ChatGPT `fetch` alias all call
 * `renderNoteForMcp`. The seam is registered in
 * `scripts/validate-private-content.ts` ahead of the server itself, so the
 * gate knows it before it carries traffic.
 *
 * Pure: no Prisma, no server-only. The server passes in the JSON it loaded.
 */

import type { JSONContent } from "@tiptap/core";
import { stripPrivateContent } from "@/lib/domain/content/private-content";
import { stripCommentMarks } from "@/lib/domain/content/comments";
import { tiptapToMarkdown } from "@/lib/domain/content/markdown";

/** A note body as an external agent may see it: markdown, private prose removed, comment anchors removed (text kept). */
export function renderNoteForMcp(tiptapJson: JSONContent): string {
  return tiptapToMarkdown(stripCommentMarks(stripPrivateContent(tiptapJson)));
}
