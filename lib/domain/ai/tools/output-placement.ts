import type { ToolExecuteContext } from "./types";

export interface ToolOutputPlacement {
  parentId: string | null;
  role?: "referenced";
  ownedByNoteId?: string;
}

/**
 * Resolve the configured destination for an AI-created ContentNode.
 *
 * An explicit destination from the user's request always wins. Otherwise a
 * selected folder produces a primary node there, while chat/content targets
 * produce referenced children whose storage parent remains the target folder.
 */
export function resolveToolOutputPlacement(
  ctx: Pick<
    ToolExecuteContext,
    "targetFolderId" | "outputOwnerId" | "outputParentOverride"
  >,
  explicitParentId?: string | null,
): ToolOutputPlacement {
  if (explicitParentId) {
    return { parentId: explicitParentId };
  }
  if (ctx.outputParentOverride) {
    return { parentId: ctx.outputParentOverride };
  }
  if (ctx.outputOwnerId) {
    return {
      parentId: ctx.targetFolderId ?? null,
      role: "referenced",
      ownedByNoteId: ctx.outputOwnerId,
    };
  }
  return { parentId: ctx.targetFolderId ?? null };
}
