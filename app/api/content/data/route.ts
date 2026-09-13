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
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";
import {
  applyLinkedSchema,
  LinkedSchemaError,
  touchedTableIds,
  type LinkedColumnSpec,
} from "@/lib/domain/data/server/linked-schema";
import { markContextDirty } from "@/lib/domain/ai-context/context-dirty";
import { after } from "next/server";

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
 * table + columns + descriptions + option vocabularies in one call.
 *
 * The body is a one-table `LinkedSchemaSpec`, so this route inherits relation
 * / lookup / rollup columns and real transactionality from `applyLinkedSchema`
 * (plan AI-RELATIONAL-DATABASE-REACH P2). A relation here targets a table
 * that ALREADY exists; a set of tables that reference each other goes to
 * POST /api/content/data/batch, which can resolve `$new:` references.
 */
export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const body = (await request.json().catch(() => null)) as {
        title?: unknown;
        parentId?: unknown;
        columns?: unknown;
        /** Nest the table as a reference under this chat/content (optional). */
        ownerContentId?: unknown;
        /** Table-level purpose (≤280) — feeds the AI schema digest (plan B1/D9). */
        description?: unknown;
      } | null;

      const title =
        typeof body?.title === "string" ? body.title.trim().slice(0, 120) : "";
      const description =
        typeof body?.description === "string" && body.description.trim()
          ? body.description.trim().slice(0, 280)
          : null;
      if (!title) {
        return NextResponse.json(
          { success: false, error: { code: "BAD_REQUEST", message: "title is required" } },
          { status: 400 }
        );
      }
      const rawColumns = Array.isArray(body?.columns) ? body!.columns : [];

      // Optional parent — validated inside applyLinkedSchema against the
      // caller's own live nodes.
      const parentId =
        typeof body?.parentId === "string" && body.parentId ? body.parentId : null;
      const ownerContentId =
        typeof body?.ownerContentId === "string" && body.ownerContentId
          ? body.ownerContentId
          : null;

      let created: Awaited<ReturnType<typeof applyLinkedSchema>>;
      try {
        created = await applyLinkedSchema(session.user.id, {
          tables: [
            {
              title,
              description,
              parentId,
              ownerContentId,
              columns: rawColumns as LinkedColumnSpec[],
            },
          ],
        });
      } catch (error) {
        if (error instanceof LinkedSchemaError) {
          return NextResponse.json(
            { success: false, error: { code: "BAD_REQUEST", message: error.message } },
            { status: 400 }
          );
        }
        throw error;
      }
      const node = created.tables[0];

      // A relation column here mints a backlink on its target, whose schema
      // digest just changed with it (plan B1 route discipline).
      const dirty = touchedTableIds(created);
      if (dirty.length > 0) after(() => markContextDirty(dirty));

      logger.info({
        layer: "content",
        event: "data:table_created",
        summary: `database created via POST: ${title}`,
        attrs: {
          tableId: node.id,
          columns: rawColumns.length,
          relations: created.relations,
        },
      });
      return NextResponse.json({
        success: true,
        data: {
          id: node.id,
          title: node.title,
          slug: node.slug,
          relations: created.relations,
          computed: created.computed,
        },
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
