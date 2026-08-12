/**
 * Content Path API
 *
 * GET /api/content/content/[id]/path - Ancestor chain for a content node
 *
 * Returns the node's ancestors root-first (excluding the node itself), for
 * the main-panel path breadcrumb. Owner-scoped like the tree endpoint: the
 * breadcrumb mirrors the user's own file tree, so shared content a user can
 * merely view has no path here.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/content/[id]/path";

/** Safety cap mirroring generateContentPath's tree-depth limit. */
const MAX_DEPTH = 100;

type Params = Promise<{ id: string }>;

export interface ContentPathAncestor {
  id: string;
  title: string;
  contentType: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id } = await params;

      const content = await prisma.contentNode.findUnique({
        where: { id },
        select: { id: true, ownerId: true, parentId: true, deletedAt: true },
      });

      if (!content || content.deletedAt) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "NOT_FOUND", message: "Content not found" },
          },
          { status: 404 }
        );
      }

      if (content.ownerId !== session.user.id) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "FORBIDDEN", message: "Access denied" },
          },
          { status: 403 }
        );
      }

      const ancestors = await withSpan(
        { layer: "content", name: "ancestor_walk" },
        { attrs: { content_id: id } },
        async (span) => {
          const chain: ContentPathAncestor[] = [];
          let currentId = content.parentId;

          while (currentId && chain.length < MAX_DEPTH) {
            const node = await prisma.contentNode.findUnique({
              where: { id: currentId },
              select: {
                id: true,
                title: true,
                contentType: true,
                parentId: true,
                ownerId: true,
                deletedAt: true,
              },
            });

            // Stop at anything that wouldn't appear in this user's tree —
            // the breadcrumb must never name folders the user doesn't own.
            if (!node || node.deletedAt || node.ownerId !== session.user.id) {
              break;
            }

            chain.unshift({
              id: node.id,
              title: node.title,
              contentType: node.contentType,
            });
            currentId = node.parentId;
          }

          span.attr("depth", chain.length).summary(`${chain.length} ancestors`);
          return chain;
        },
      );

      return NextResponse.json({ success: true, data: { ancestors } });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch content path";
      const isAuthError = message === "Authentication required";

      if (!isAuthError) {
        logger.error({
          layer: "content",
          event: "path:caught",
          summary: "content path fetch failed — 500",
          error,
        });
      }

      return NextResponse.json(
        {
          success: false,
          error: {
            code: isAuthError ? "AUTHENTICATION_REQUIRED" : "SERVER_ERROR",
            message: isAuthError ? "Authentication required" : message,
          },
        },
        { status: isAuthError ? 401 : 500 }
      );
    }
  });
}
