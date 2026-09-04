/**
 * Databases list — what the left-panel rail renders (plan B8 surface 6).
 *
 * GET /api/content/data
 *
 * The caller's databases with their views. Views are personal-filtered the
 * same way loadTable filters them (plan O14) — someone else's personal view
 * never appears in your rail. Scoping is exactly the file tree's (plan O17):
 * owned content, no database-specific scoping of its own.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";
import { createColumn } from "@/lib/domain/data/server/mutations";
import { generateColumnKey, type DataColumn } from "@/lib/domain/data";
import { generateUniqueSlug } from "@/lib/domain/content";

const ROUTE_PATH = "/api/content/data";

export async function GET(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();

      const nodes = await withSpan(
        { layer: "content", name: "data_rail_list" },
        { summary: "list databases for the rail" },
        async (span) => {
          const result = await prisma.contentNode.findMany({
            where: {
              ownerId: session.user.id,
              contentType: "data",
              deletedAt: null,
            },
            orderBy: { title: "asc" },
            select: {
              id: true,
              title: true,
              dataPayload: {
                select: {
                  rowCount: true,
                  defaultViewId: true,
                  views: {
                    where: {
                      OR: [
                        { access: { not: "personal" } },
                        { ownerId: session.user.id },
                      ],
                    },
                    orderBy: { position: "asc" },
                    select: { id: true, name: true, mode: true, access: true },
                  },
                },
              },
            },
          });
          span.attr("count", result.length);
          return result;
        }
      );

      return NextResponse.json({
        success: true,
        data: {
          databases: nodes
            .filter((n) => n.dataPayload)
            .map((n) => ({
              id: n.id,
              title: n.title,
              rowCount: n.dataPayload!.rowCount,
              defaultViewId: n.dataPayload!.defaultViewId,
              views: n.dataPayload!.views,
            })),
        },
      });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "data:rail_list:caught",
        summary: "failed to list databases",
        error,
      });
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to list databases" } },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/content/data — create a database with a full schema in one call.
 *
 * The apply endpoint for the AI's output-database proposal card (P5,
 * EXTRACTION-TO-DATABASE-PLAN §3.7): the card's Apply click is the commit —
 * the proposing tool wrote nothing. Also usable by any client that wants
 * table + columns + descriptions + option vocabularies atomically-ish
 * (node first, then columns in order).
 */
export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const body = (await request.json().catch(() => null)) as {
        title?: unknown;
        parentId?: unknown;
        columns?: unknown;
      } | null;

      const title =
        typeof body?.title === "string" ? body.title.trim().slice(0, 120) : "";
      if (!title) {
        return NextResponse.json(
          { success: false, error: { code: "BAD_REQUEST", message: "title is required" } },
          { status: 400 }
        );
      }
      const rawColumns = Array.isArray(body?.columns) ? body!.columns : [];
      if (rawColumns.length === 0 || rawColumns.length > 30) {
        return NextResponse.json(
          { success: false, error: { code: "BAD_REQUEST", message: "1-30 columns required" } },
          { status: 400 }
        );
      }
      const creatableTypes = new Set([
        "text", "longText", "number", "url", "date", "checkbox",
        "select", "multiSelect", "status", "file", "email", "phone",
      ]);
      const columns: Array<{
        name: string;
        type: DataColumn["type"];
        description: string;
        options?: Array<{ label: string; color?: string; group?: "todo" | "active" | "done" }>;
        primary?: boolean;
      }> = [];
      const seenNames = new Set<string>();
      for (const raw of rawColumns) {
        const c = (raw ?? {}) as Record<string, unknown>;
        const name = typeof c.name === "string" ? c.name.trim().slice(0, 120) : "";
        const type = typeof c.type === "string" ? c.type : "";
        if (!name || !creatableTypes.has(type)) {
          return NextResponse.json(
            { success: false, error: { code: "BAD_REQUEST", message: `invalid column ${name || "(unnamed)"} / type ${type}` } },
            { status: 400 }
          );
        }
        const lower = name.toLowerCase();
        if (seenNames.has(lower)) {
          return NextResponse.json(
            { success: false, error: { code: "BAD_REQUEST", message: `duplicate column name ${name}` } },
            { status: 400 }
          );
        }
        seenNames.add(lower);
        columns.push({
          name,
          type: type as DataColumn["type"],
          description:
            typeof c.description === "string" ? c.description.trim().slice(0, 500) : "",
          ...(Array.isArray(c.options)
            ? {
                options: (c.options as Array<Record<string, unknown>>)
                  .map((o) => {
                    const group: "todo" | "active" | "done" | undefined =
                      o.group === "todo" || o.group === "active" || o.group === "done"
                        ? (o.group as "todo" | "active" | "done")
                        : undefined;
                    return {
                      label: typeof o.label === "string" ? o.label.trim().slice(0, 120) : "",
                      ...(typeof o.color === "string" && /^[a-z][a-z0-9-]{0,23}$/.test(o.color)
                        ? { color: o.color }
                        : {}),
                      ...(group ? { group } : {}),
                    };
                  })
                  .filter((o) => o.label.length > 0)
                  .slice(0, 50),
              }
            : {}),
          ...(c.primary === true ? { primary: true } : {}),
        });
      }

      // Optional parent — must be the caller's own live folder-ish node.
      let parentId: string | null = null;
      if (typeof body?.parentId === "string" && body.parentId) {
        const parent = await prisma.contentNode.findFirst({
          where: { id: body.parentId, ownerId: session.user.id, deletedAt: null },
          select: { id: true },
        });
        parentId = parent?.id ?? null;
      }

      const slug = await generateUniqueSlug(title, session.user.id);
      const node = await prisma.contentNode.create({
        data: {
          ownerId: session.user.id,
          title,
          slug,
          contentType: "data",
          parentId,
          displayOrder: 0,
          dataPayload: {
            create: {
              mode: "inline",
              source: {} as unknown as Prisma.InputJsonValue,
              searchText: title.toLowerCase(),
            },
          },
        },
        select: { id: true },
      });
      for (const col of columns) {
        await createColumn(node.id, {
          name: col.name,
          type: col.type,
          description: col.description || null,
          ...(col.options
            ? {
                config: {
                  options: col.options.map((o) => ({
                    id: generateColumnKey(),
                    label: o.label,
                    ...(o.color ? { color: o.color } : {}),
                    ...(o.group ? { group: o.group } : {}),
                  })),
                },
              }
            : {}),
        });
      }
      const primaryName = columns.find((c) => c.primary)?.name;
      if (primaryName) {
        await prisma.dataColumn.updateMany({
          where: { tableId: node.id, name: primaryName },
          data: { isPrimary: true },
        });
      }

      logger.info({
        layer: "content",
        event: "data:table_created",
        summary: `database created via POST: ${title}`,
        attrs: { tableId: node.id, columns: columns.length },
      });
      return NextResponse.json({
        success: true,
        data: { id: node.id, title, slug },
      });
    } catch (error) {
      logger.error({
        layer: "content",
        event: "data:table_create:caught",
        summary: "failed to create database",
        error,
      });
      return NextResponse.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Failed to create database" } },
        { status: 500 }
      );
    }
  });
}
