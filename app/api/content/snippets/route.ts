/**
 * Snippets API - List & Create
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { getSnippetDisplayTitle } from "@/lib/domain/snippets";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/snippets";

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
      const search = searchParams.get("search");
      const aiContext = searchParams.get("aiContext");
      const visible = searchParams.get("visible");

      const where: Record<string, unknown> = { userId: session.user.id };
      if (categoryId) where.categoryId = categoryId;
      if (search) where.searchText = { contains: search, mode: "insensitive" };
      if (aiContext !== null) where.isAiContext = aiContext === "true";
      if (visible !== null) where.isVisibleInUI = visible === "true";

      const snippets = await withSpan(
        { layer: "content", name: "snippets_list" },
        undefined,
        async (span) => {
          const result = await prisma.snippet.findMany({
            where,
            select: {
              id: true,
              title: true,
              content: true,
              tiptapJson: true,
              categoryId: true,
              usageCount: true,
              lastUsedAt: true,
              isAiContext: true,
              isVisibleInUI: true,
              createdAt: true,
              updatedAt: true,
              category: { select: { id: true, name: true, slug: true } },
            },
            orderBy: [{ updatedAt: "desc" }],
          });
          span.attr("count", result.length);
          return result;
        },
      );

      const results = snippets.map((s) => ({
        id: s.id,
        title: s.title,
        displayTitle: getSnippetDisplayTitle(s.title, s.content),
        content: s.content,
        tiptapJson: s.tiptapJson,
        categoryId: s.categoryId,
        categoryName: s.category.name,
        usageCount: s.usageCount,
        lastUsedAt: s.lastUsedAt?.toISOString() ?? null,
        isAiContext: s.isAiContext,
        isVisibleInUI: s.isVisibleInUI,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      }));

      return NextResponse.json(results);
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      logger.error({
        layer: "content",
        event: "snippets_list:caught",
        summary: "list failed — 500",
        error,
      });
      return NextResponse.json(
        {
          error: "Failed to list snippets",
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
      const { title, content, tiptapJson, categoryId, isAiContext, isVisibleInUI, searchText } = body;

      if (!content || typeof content !== "string" || !content.trim()) {
        return NextResponse.json({ error: "Snippet content is required" }, { status: 400 });
      }

      if (!categoryId) {
        return NextResponse.json({ error: "Category ID is required" }, { status: 400 });
      }

      const category = await prisma.reusableCategory.findFirst({
        where: {
          id: categoryId,
          scope: "snippet",
          OR: [{ userId: session.user.id }, { userId: null }],
        },
      });

      if (!category) {
        return NextResponse.json({ error: "Category not found or not accessible" }, { status: 404 });
      }

      const displayTitle = getSnippetDisplayTitle(title, content);

      const snippet = await withSpan(
        { layer: "content", name: "snippet_create" },
        undefined,
        async (span) => {
          const created = await prisma.snippet.create({
            data: {
              title: title?.trim() || null,
              content: content.trim(),
              tiptapJson: tiptapJson || null,
              searchText: searchText || displayTitle.toLowerCase(),
              categoryId,
              userId: session.user.id,
              isAiContext: isAiContext ?? true,
              isVisibleInUI: isVisibleInUI ?? true,
            },
            include: { category: { select: { id: true, name: true, slug: true } } },
          });
          span.attr("snippet_id", created.id);
          return created;
        },
      );

      return NextResponse.json(
        {
          id: snippet.id,
          title: snippet.title,
          displayTitle,
          content: snippet.content,
          tiptapJson: snippet.tiptapJson,
          categoryId: snippet.categoryId,
          categoryName: snippet.category.name,
          usageCount: 0,
          lastUsedAt: null,
          isAiContext: snippet.isAiContext,
          isVisibleInUI: snippet.isVisibleInUI,
          createdAt: snippet.createdAt.toISOString(),
          updatedAt: snippet.updatedAt.toISOString(),
        },
        { status: 201 }
      );
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      logger.error({
        layer: "content",
        event: "snippet_create:caught",
        summary: "create failed — 500",
        error,
      });
      return NextResponse.json(
        {
          error: "Failed to create snippet",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  });
}
