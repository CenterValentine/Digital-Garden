/**
 * Snippet by ID - Read, Update & Delete
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { getSnippetDisplayTitle } from "@/lib/domain/snippets";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/snippets/[id]";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withRouteTrace(_request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id } = await params;

      const snippet = await prisma.snippet.findFirst({
        where: { id, userId: session.user.id },
        include: { category: { select: { id: true, name: true, slug: true } } },
      });

      if (!snippet) {
        return NextResponse.json({ error: "Snippet not found" }, { status: 404 });
      }

      return NextResponse.json({
        id: snippet.id,
        title: snippet.title,
        displayTitle: getSnippetDisplayTitle(snippet.title, snippet.content),
        content: snippet.content,
        tiptapJson: snippet.tiptapJson,
        categoryId: snippet.categoryId,
        categoryName: snippet.category.name,
        usageCount: snippet.usageCount,
        lastUsedAt: snippet.lastUsedAt?.toISOString() ?? null,
        isAiContext: snippet.isAiContext,
        isVisibleInUI: snippet.isVisibleInUI,
        createdAt: snippet.createdAt.toISOString(),
        updatedAt: snippet.updatedAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      logger.error({
        layer: "content",
        event: "snippet_read:caught",
        summary: "GET caught — translated to 500",
        error,
      });
      return NextResponse.json(
        {
          error: "Failed to get snippet",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id } = await params;
      const body = await request.json();
      const { title, content, tiptapJson, categoryId, searchText, isAiContext, isVisibleInUI } = body;

      const snippet = await prisma.snippet.findFirst({
        where: { id, userId: session.user.id },
      });

      if (!snippet) {
        return NextResponse.json({ error: "Snippet not found" }, { status: 404 });
      }

      const updateData: Record<string, unknown> = {};

      if (title !== undefined) updateData.title = title?.trim() || null;
      if (content !== undefined) {
        if (typeof content !== "string" || !content.trim()) {
          return NextResponse.json({ error: "Content cannot be empty" }, { status: 400 });
        }
        updateData.content = content.trim();
      }
      if (tiptapJson !== undefined) updateData.tiptapJson = tiptapJson;
      if (categoryId !== undefined) {
        const category = await prisma.reusableCategory.findFirst({
          where: {
            id: categoryId,
            scope: "snippet",
            OR: [{ userId: session.user.id }, { userId: null }],
          },
        });
        if (!category) {
          return NextResponse.json({ error: "Category not found" }, { status: 404 });
        }
        updateData.categoryId = categoryId;
      }
      if (searchText !== undefined) updateData.searchText = searchText;
      if (isAiContext !== undefined) updateData.isAiContext = Boolean(isAiContext);
      if (isVisibleInUI !== undefined) updateData.isVisibleInUI = Boolean(isVisibleInUI);

      if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
      }

      const updated = await withSpan(
        { layer: "content", name: "snippet_update" },
        { attrs: { snippet_id: id } },
        async () =>
          prisma.snippet.update({
            where: { id },
            data: updateData,
            include: { category: { select: { id: true, name: true, slug: true } } },
          }),
      );

      return NextResponse.json({
        id: updated.id,
        title: updated.title,
        displayTitle: getSnippetDisplayTitle(updated.title, updated.content),
        content: updated.content,
        tiptapJson: updated.tiptapJson,
        categoryId: updated.categoryId,
        categoryName: updated.category.name,
        usageCount: updated.usageCount,
        lastUsedAt: updated.lastUsedAt?.toISOString() ?? null,
        isAiContext: updated.isAiContext,
        isVisibleInUI: updated.isVisibleInUI,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      logger.error({
        layer: "content",
        event: "snippet_update:caught",
        summary: "PATCH caught — translated to 500",
        error,
      });
      return NextResponse.json(
        {
          error: "Failed to update snippet",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withRouteTrace(_request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { id } = await params;

      const snippet = await prisma.snippet.findFirst({
        where: { id, userId: session.user.id },
      });

      if (!snippet) {
        return NextResponse.json({ error: "Snippet not found" }, { status: 404 });
      }

      await withSpan(
        { layer: "content", name: "snippet_delete" },
        { attrs: { snippet_id: id } },
        async () => prisma.snippet.delete({ where: { id } }),
      );

      return NextResponse.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      logger.error({
        layer: "content",
        event: "snippet_delete:caught",
        summary: "DELETE caught — translated to 500",
        error,
      });
      return NextResponse.json(
        {
          error: "Failed to delete snippet",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  });
}
