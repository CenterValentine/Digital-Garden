import "server-only";

/**
 * `garden_delete_content` — the MCP may trash content an MCP token drafted.
 *
 * Owner rule (2026-10-14): the MCP may delete what it authored, with any of
 * the user's tokens, straight to the trash and with an inbox notice — no
 * confirmation. Authorship is `ContentNode.draftedBy = "mcp"`, stamped once
 * at creation (lib/domain/content/authorship.ts); content the user wrote, or
 * anything created before authorship was recorded, is refused by name.
 *
 * A folder goes only when everything inside it was MCP-drafted too: a
 * folder the MCP made but the user has since filled must not take the
 * user's own notes into the trash with it.
 *
 * Deleting content the user NAMES by title (with one more fact to settle an
 * ambiguous title) is the planned next step — DOCX-TEMPLATE-RENDERER-PLAN /
 * MCP-DATABASE-REACH-PLAN — not this tool.
 *
 * The delete itself is the app's own trash path (trashContentNode):
 * restorable for 30 days, with every cascade a user's delete runs.
 */

import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger";
import { isMcpDrafted } from "@/lib/domain/content/authorship";
import { trashContentNode } from "@/lib/domain/content/trash-content";
import { publishEvent } from "@/lib/domain/notifications/service";
import type { McpPrincipal } from "../auth";
import type { McpScope } from "../jurisdiction";
import { internalError, ok, refuse, type McpToolResult } from "../results";

/** Bounds on the folder walk — a deeper or larger tree is refused, not walked. */
const FOLDER_WALK_MAX_DEPTH = 25;
const FOLDER_WALK_MAX_NODES = 2000;

interface DescendantCheck {
  ok: boolean;
  /** Titles of descendants the MCP did not draft (first few). */
  userWritten: string[];
  userWrittenCount: number;
  total: number;
  tooLarge?: boolean;
}

/** Every live descendant of a folder, and whether each was MCP-drafted. */
async function checkDescendants(ownerId: string, rootId: string): Promise<DescendantCheck> {
  let frontier = [rootId];
  const seen = new Set<string>([rootId]);
  const userWritten: string[] = [];
  let userWrittenCount = 0;
  let total = 0;
  for (let depth = 0; depth < FOLDER_WALK_MAX_DEPTH && frontier.length > 0; depth++) {
    const children = await prisma.contentNode.findMany({
      where: { parentId: { in: frontier }, ownerId, deletedAt: null },
      select: { id: true, title: true, draftedBy: true },
    });
    const fresh = children.filter((c) => !seen.has(c.id));
    for (const child of fresh) {
      seen.add(child.id);
      total++;
      if (!isMcpDrafted(child)) {
        userWrittenCount++;
        if (userWritten.length < 3) userWritten.push(child.title);
      }
    }
    if (total > FOLDER_WALK_MAX_NODES) {
      return { ok: false, userWritten, userWrittenCount, total, tooLarge: true };
    }
    frontier = fresh.map((c) => c.id);
  }
  if (frontier.length > 0) return { ok: false, userWritten, userWrittenCount, total, tooLarge: true };
  return { ok: userWrittenCount === 0, userWritten, userWrittenCount, total };
}

export async function deleteContent(
  scope: McpScope,
  principal: McpPrincipal,
  input: { id: string; reason: string }
): Promise<McpToolResult> {
  try {
    const node = await prisma.contentNode.findFirst({
      where: { id: input.id, ownerId: scope.userId, deletedAt: null },
      select: { id: true, title: true, contentType: true, draftedBy: true },
    });
    if (!node || !(await scope.nodeInScope(node.id))) {
      return refuse("That item is not reachable with this token (or is already in the trash).");
    }
    if (!isMcpDrafted(node)) {
      return refuse(
        `"${node.title}" was not drafted by the MCP, so this tool will not delete it. It trashes only content an MCP token created; the user wrote this one (or it predates authorship records). Ask the user to delete it in the app.`,
        { id: node.id, draftedBy: node.draftedBy ?? "user" }
      );
    }
    if (node.contentType === "folder") {
      const check = await checkDescendants(scope.userId, node.id);
      if (check.tooLarge) {
        return refuse(`"${node.title}" holds more than ${FOLDER_WALK_MAX_NODES} items or nests deeper than ${FOLDER_WALK_MAX_DEPTH} levels — too large to verify. Ask the user to delete it in the app.`, { id: node.id });
      }
      if (!check.ok) {
        return refuse(
          `"${node.title}" was drafted by the MCP, but ${check.userWrittenCount} item${check.userWrittenCount === 1 ? "" : "s"} inside it ${check.userWrittenCount === 1 ? "was" : "were"} not (e.g. ${check.userWritten.map((t) => `"${t}"`).join(", ")}). Deleting the folder would trash the user's own content, so it was refused. Delete the MCP-drafted items individually, or ask the user.`,
          { id: node.id, userWritten: check.userWrittenCount }
        );
      }
    }

    const outcome = await trashContentNode(scope.userId, node.id);
    if (!outcome.ok) return refuse("That item could not be moved to the trash (it may have been deleted meanwhile).");

    try {
      await publishEvent(prisma, {
        kind: "ai.notify",
        actorType: "ai",
        actorLabel: `MCP token "${principal.token.name}"`,
        payload: {
          title: `MCP moved "${node.title}" to the trash`,
          body: `${input.reason}\nIt was drafted by the MCP. Restore it from the trash within 30 days if this was wrong.`,
        },
        subjectType: "content",
        subjectId: node.id,
        recipients: [{ userId: scope.userId }],
      });
    } catch (error) {
      logger.warn({ layer: "ai", event: "mcp:delete_content_notice_failed", summary: "inbox notice not posted", error });
    }

    return ok(
      `Moved "${node.title}" (${node.contentType}) to the trash. The user can restore it for 30 days; they were notified.`,
      {
        id: node.id,
        contentType: node.contentType,
        trashed: true,
        scheduledDeletion: outcome.scheduledDeletion?.toISOString() ?? null,
      }
    );
  } catch (error) {
    logger.warn({ layer: "ai", event: "mcp:delete_content_caught", summary: "garden_delete_content failed", error });
    return internalError("garden_delete_content", error, Object.keys(input));
  }
}
