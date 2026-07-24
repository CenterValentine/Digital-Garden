import type { ToolExecuteContext } from "./types";

export type ToolOutputLocation =
  | "under_chat"
  | "under_content"
  | "beside_content";

export interface ToolOutputPlacement {
  parentId: string | null;
  role?: "referenced";
  ownedByNoteId?: string;
  error?: string;
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
    | "targetFolderId"
    | "outputOwnerId"
    | "outputParentOverride"
    | "outputChatOwnerId"
    | "outputContentOwnerId"
    | "outputContentParentId"
  >,
  explicitParentId?: string | null,
  explicitLocation?: ToolOutputLocation,
): ToolOutputPlacement {
  if (explicitParentId) {
    return { parentId: explicitParentId };
  }
  if (explicitLocation === "under_chat") {
    return ctx.outputChatOwnerId
      ? {
          parentId: ctx.targetFolderId ?? null,
          role: "referenced",
          ownedByNoteId: ctx.outputChatOwnerId,
        }
      : {
          parentId: null,
          error:
            "This conversation has no materialized chat node, so an under-chat destination is unavailable.",
        };
  }
  if (
    explicitLocation === "under_content" ||
    explicitLocation === "beside_content"
  ) {
    if (!ctx.outputContentOwnerId) {
      return {
        parentId: null,
        error:
          "This conversation is not rooted in content, so that content-relative destination is unavailable.",
      };
    }
    if (explicitLocation === "beside_content") {
      return { parentId: ctx.outputContentParentId ?? null };
    }
    return {
      parentId: ctx.outputContentParentId ?? null,
      role: "referenced",
      ownedByNoteId: ctx.outputContentOwnerId,
    };
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
