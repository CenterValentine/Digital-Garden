/**
 * Saved Blocks API - List & Create
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, spanPayload, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/saved-blocks";

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { searchParams } = new URL(request.url);
      const categoryId = searchParams.get("categoryId");
      const blockType = searchParams.get("blockType");
      const search = searchParams.get("search");

      const where: Record<string, unknown> = {
        OR: [{ userId: session.user.id }, { userId: null }],
      };
      if (categoryId) where.categoryId = categoryId;
      if (blockType) where.blockType = blockType;
      if (search) where.searchText = { contains: search, mode: "insensitive" };

      const blocks = await withSpan(
        { layer: "content", name: "saved_blocks_list" },
        undefined,
        async (span) => {
          const result = await prisma.savedBlock.findMany({
            where,
            select: {
              id: true,
              title: true,
              blockType: true,
              tiptapJson: true,
              categoryId: true,
              userId: true,
              usageCount: true,
              lastUsedAt: true,
              createdAt: true,
              updatedAt: true,
              category: { select: { id: true, name: true, slug: true } },
            },
            orderBy: [{ usageCount: "desc" }, { updatedAt: "desc" }],
          });
          span.attr("count", result.length);
          await spanPayload(span, "saved_blocks", result);
          return result;
        },
      );

      const results = blocks.map((block) => ({
        id: block.id,
        title: block.title,
        blockType: block.blockType,
        tiptapJson: block.tiptapJson,
        categoryId: block.categoryId,
        categoryName: block.category.name,
        isSystem: block.userId === null,
        usageCount: block.usageCount,
        lastUsedAt: block.lastUsedAt?.toISOString() ?? null,
        createdAt: block.createdAt.toISOString(),
        updatedAt: block.updatedAt.toISOString(),
      }));

      return NextResponse.json(results);
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      logger.error({
        layer: "content",
        event: "saved_blocks_list:caught",
        summary: "list failed — 500",
        error,
      });
      return NextResponse.json(
        {
          error: "Failed to list saved blocks",
          details: error instanceof Error ? error.message : "Unknown error",
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
      const body = await request.json();
      const { title, blockType, tiptapJson, categoryId, searchText } = body;

      if (!title || typeof title !== "string" || !title.trim()) {
        return NextResponse.json({ error: "Block title is required" }, { status: 400 });
      }

      if (!blockType || typeof blockType !== "string") {
        return NextResponse.json({ error: "Block type is required" }, { status: 400 });
      }

      if (!tiptapJson || typeof tiptapJson !== "object") {
        return NextResponse.json({ error: "TipTap JSON content is required" }, { status: 400 });
      }

      if (!categoryId) {
        return NextResponse.json({ error: "Category ID is required" }, { status: 400 });
      }

      const category = await prisma.reusableCategory.findFirst({
        where: {
          id: categoryId,
          scope: "saved_block",
          OR: [{ userId: session.user.id }, { userId: null }],
        },
      });

      if (!category) {
        return NextResponse.json(
          { error: "Category not found or not accessible" },
          { status: 404 }
        );
      }

      const block = await withSpan(
        { layer: "content", name: "saved_block_create" },
        { attrs: { block_type: blockType } },
        async (span) => {
          const created = await prisma.savedBlock.create({
            data: {
              title: title.trim(),
              blockType,
              tiptapJson,
              searchText: searchText || title.trim().toLowerCase(),
              categoryId,
              userId: session.user.id,
            },
            include: { category: { select: { id: true, name: true, slug: true } } },
          });
          span.attr("block_id", created.id);
          return created;
        },
      );

      return NextResponse.json(
        {
          id: block.id,
          title: block.title,
          blockType: block.blockType,
          tiptapJson: block.tiptapJson,
          categoryId: block.categoryId,
          categoryName: block.category.name,
          isSystem: false,
          usageCount: 0,
          lastUsedAt: null,
          createdAt: block.createdAt.toISOString(),
          updatedAt: block.updatedAt.toISOString(),
        },
        { status: 201 }
      );
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      logger.error({
        layer: "content",
        event: "saved_block_create:caught",
        summary: "create failed — 500",
        error,
      });
      return NextResponse.json(
        {
          error: "Failed to create saved block",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  });
}
