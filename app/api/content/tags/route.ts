/**
 * Tags API - List & Create Tags
 *
 * GET /api/content/tags?search=query
 * Returns all tags for authenticated user with optional search filter
 *
 * POST /api/content/tags
 * Creates a new tag for authenticated user
 *
 * M6: Search & Knowledge Features - Tags
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import type { Prisma } from "@/lib/database/generated/prisma";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/content/tags";

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );
      const { searchParams } = new URL(request.url);
      const search = searchParams.get("search") || "";

      const where: Prisma.TagWhereInput = {
        userId: session.user.id,
      };

      if (search) {
        where.name = { contains: search, mode: "insensitive" };
      }

      const tags = await withSpan(
        { layer: "content", name: "tags_list" },
        { attrs: { has_search: Boolean(search) } },
        async (span) => {
          const result = await prisma.tag.findMany({
            where,
            select: {
              id: true,
              name: true,
              slug: true,
              color: true,
              createdAt: true,
              _count: { select: { contentTags: true } },
            },
            orderBy: [
              { contentTags: { _count: "desc" } },
              { name: "asc" },
            ],
          });
          span.attr("count", result.length).summary(`${result.length} tags`);
          return result;
        },
      );

      const results = tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
        color: tag.color,
        usageCount: tag._count.contentTags,
        createdAt: tag.createdAt.toISOString(),
      }));

      return NextResponse.json(results);
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      logger.error({
        layer: "content",
        event: "tags_list:caught",
        summary: "list failed — 500",
        error,
      });
      return NextResponse.json(
        { error: "Failed to list tags", details: error instanceof Error ? error.message : "Unknown error" },
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
      const { name, color } = body;

      if (!name || typeof name !== "string" || !name.trim()) {
        return NextResponse.json({ error: "Tag name is required" }, { status: 400 });
      }

      const slug = name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "");

      const existing = await prisma.tag.findUnique({
        where: { userId_slug: { userId: session.user.id, slug } },
      });

      if (existing) {
        return NextResponse.json({
          id: existing.id,
          name: existing.name,
          slug: existing.slug,
          color: existing.color,
          createdAt: existing.createdAt.toISOString(),
        });
      }

      const tag = await withSpan(
        { layer: "content", name: "tag_create" },
        undefined,
        async (span) => {
          const created = await prisma.tag.create({
            data: {
              userId: session.user.id,
              name: name.trim(),
              slug,
              color: color || null,
            },
          });
          span.attr("tag_id", created.id).summary("created");
          return created;
        },
      );

      return NextResponse.json({
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
        color: tag.color,
        createdAt: tag.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Authentication required") {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }
      logger.error({
        layer: "content",
        event: "tag_create:caught",
        summary: "create failed — 500",
        error,
      });
      return NextResponse.json(
        { error: "Failed to create tag", details: error instanceof Error ? error.message : "Unknown error" },
        { status: 500 }
      );
    }
  });
}
