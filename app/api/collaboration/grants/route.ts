import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, spanPayload, withRouteTrace, withSpan } from "@/lib/core/logger";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCESS_LEVELS = new Set(["view", "edit"]);
const ROUTE_PATH = "/api/collaboration/grants";

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const contentId = request.nextUrl.searchParams.get("contentId")?.trim();

      if (!contentId || !UUID_RE.test(contentId)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "A valid contentId is required",
            },
          },
          { status: 400 }
        );
      }

      const content = await withSpan(
        { layer: "collab", name: "content_lookup" },
        { attrs: { content_id: contentId } },
        async (span) => {
          const result = await prisma.contentNode.findFirst({
            where: {
              id: contentId,
              deletedAt: null,
            },
            select: {
              id: true,
              ownerId: true,
              title: true,
              isPublished: true,
            },
          });
          span.attr("found", Boolean(result));
          return result;
        },
      );

      if (!content) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Content not found",
            },
          },
          { status: 404 }
        );
      }

      if (content.ownerId !== session.user.id) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Only the content owner can manage collaboration access",
            },
          },
          { status: 403 }
        );
      }

      const grants = await withSpan(
        { layer: "collab", name: "grants_read" },
        { attrs: { content_id: contentId } },
        async (span) => {
          const result = await prisma.viewGrant.findMany({
            where: {
              contentId,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            orderBy: [{ grantedAt: "desc" }, { id: "desc" }],
            select: {
              id: true,
              contentId: true,
              userId: true,
              accessLevel: true,
              grantedAt: true,
              expiresAt: true,
              user: {
                select: {
                  id: true,
                  email: true,
                  username: true,
                },
              },
            },
          });
          span.attr("count", result.length).summary(`${result.length} grants`);
          await spanPayload(span, "grants", result);
          return result;
        },
      );

      return NextResponse.json({
        success: true,
        data: {
          content,
          grants,
        },
      });
    } catch (error) {
      logger.error({
        layer: "collab",
        event: "grants_read:caught",
        summary: "GET caught — translated to 500",
        error,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "SERVER_ERROR",
            message: "Failed to load collaboration access",
          },
        },
        { status: 500 }
      );
    }
  });
}

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const body = (await request.json()) as {
        contentId?: string;
        email?: string;
        accessLevel?: string;
      };

      const contentId = body.contentId?.trim();
      const email = body.email?.trim().toLowerCase();
      const accessLevel = body.accessLevel?.trim().toLowerCase();

      if (!contentId || !UUID_RE.test(contentId)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "A valid contentId is required",
            },
          },
          { status: 400 }
        );
      }

      if (!email) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "A target user email is required",
            },
          },
          { status: 400 }
        );
      }

      if (!accessLevel || !ACCESS_LEVELS.has(accessLevel)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "accessLevel must be either view or edit",
            },
          },
          { status: 400 }
        );
      }

      const content = await withSpan(
        { layer: "collab", name: "content_lookup" },
        { attrs: { content_id: contentId } },
        async (span) => {
          const result = await prisma.contentNode.findFirst({
            where: {
              id: contentId,
              deletedAt: null,
            },
            select: {
              id: true,
              ownerId: true,
              title: true,
            },
          });
          span.attr("found", Boolean(result));
          return result;
        },
      );

      if (!content) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Content not found",
            },
          },
          { status: 404 }
        );
      }

      if (content.ownerId !== session.user.id) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Only the content owner can grant collaboration access",
            },
          },
          { status: 403 }
        );
      }

      // Email is used internally for user lookup. Not logged in attrs — the
      // logger emits go to stdout in dev and could end up in a log drain.
      const targetUser = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          username: true,
        },
      });

      if (!targetUser) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "No user exists for that email",
            },
          },
          { status: 404 }
        );
      }

      if (targetUser.id === session.user.id) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Owners already have full collaboration access",
            },
          },
          { status: 400 }
        );
      }

      const grant = await withSpan(
        { layer: "collab", name: "grants_write" },
        {
          attrs: {
            content_id: contentId,
            access_level: accessLevel,
            op: "upsert",
          },
        },
        async (span) => {
          const result = await prisma.viewGrant.upsert({
            where: {
              contentId_userId: {
                contentId,
                userId: targetUser.id,
              },
            },
            create: {
              contentId,
              userId: targetUser.id,
              accessLevel,
            },
            update: {
              accessLevel,
              expiresAt: null,
            },
            select: {
              id: true,
              contentId: true,
              userId: true,
              accessLevel: true,
              grantedAt: true,
              expiresAt: true,
              user: {
                select: {
                  id: true,
                  email: true,
                  username: true,
                },
              },
            },
          });
          span.summary(`${accessLevel} granted`);
          return result;
        },
      );

      return NextResponse.json({
        success: true,
        data: {
          grant,
          content: {
            id: content.id,
            title: content.title,
          },
          user: targetUser,
        },
      });
    } catch (error) {
      logger.error({
        layer: "collab",
        event: "grants_write:caught",
        summary: "POST caught — translated to 500",
        error,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "SERVER_ERROR",
            message: "Failed to grant collaboration access",
          },
        },
        { status: 500 }
      );
    }
  });
}

export async function DELETE(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const body = (await request.json()) as {
        contentId?: string;
        email?: string;
        userId?: string;
        grantId?: string;
      };

      const contentId = body.contentId?.trim();
      const email = body.email?.trim().toLowerCase();
      const userId = body.userId?.trim();
      const grantId = body.grantId?.trim();

      if (!contentId || !UUID_RE.test(contentId)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "A valid contentId is required",
            },
          },
          { status: 400 }
        );
      }

      if (!email && !userId && !grantId) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "A target user email, userId, or grantId is required",
            },
          },
          { status: 400 }
        );
      }

      const content = await withSpan(
        { layer: "collab", name: "content_lookup" },
        { attrs: { content_id: contentId } },
        async (span) => {
          const result = await prisma.contentNode.findFirst({
            where: {
              id: contentId,
              deletedAt: null,
            },
            select: {
              ownerId: true,
            },
          });
          span.attr("found", Boolean(result));
          return result;
        },
      );

      if (!content) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Content not found",
            },
          },
          { status: 404 }
        );
      }

      if (content.ownerId !== session.user.id) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Only the content owner can revoke collaboration access",
            },
          },
          { status: 403 }
        );
      }

      let targetUserId = userId;
      if (!targetUserId && email) {
        const targetUser = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
          },
        });

        if (!targetUser) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: "NOT_FOUND",
                message: "No user exists for that email",
              },
            },
            { status: 404 }
          );
        }

        targetUserId = targetUser.id;
      }

      await withSpan(
        { layer: "collab", name: "grants_write" },
        {
          attrs: { content_id: contentId, op: "revoke" },
          summary: "revoke",
        },
        async (span) => {
          const result = await prisma.viewGrant.deleteMany({
            where: {
              contentId,
              ...(grantId ? { id: grantId } : {}),
              ...(targetUserId ? { userId: targetUserId } : {}),
            },
          });
          span.attr("deleted", result.count).summary(`${result.count} revoked`);
        },
      );

      return NextResponse.json({
        success: true,
      });
    } catch (error) {
      logger.error({
        layer: "collab",
        event: "grants_write:caught",
        summary: "DELETE caught — translated to 500",
        error,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "SERVER_ERROR",
            message: "Failed to revoke collaboration access",
          },
        },
        { status: 500 }
      );
    }
  });
}
