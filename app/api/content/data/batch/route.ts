/**
 * POST /api/content/data/batch — apply a LINKED schema in one transaction.
 *
 * The Apply endpoint for the AI's linked-database proposal card (plan
 * AI-RELATIONAL-DATABASE-REACH P2). The proposing tool writes nothing; this
 * click is the commit, and it is all-or-nothing.
 *
 * Why a second create route rather than a flag on the first: the single-table
 * route answers "make me a table" and returns one id, a contract several
 * callers already depend on. This one answers "wire these tables together",
 * where the interesting part of the result is the edges. Both run the same
 * `applyLinkedSchema` core, so there is one implementation of the rules.
 *
 * Authorization is this route's job, not the domain function's: new tables
 * belong to the caller, and every table in `extend` goes through the same
 * `canAlterSchema` ladder the single-column route uses — so a database shared
 * with owner-level rights can join a schema, while one shared for editing
 * cannot have columns added to it. Relation TARGETS stay owner-resolved
 * inside `applyLinkedSchema`: drawing a relation into a table also mints a
 * column there.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";
import {
  applyLinkedSchema,
  LinkedSchemaError,
  touchedTableIds,
  type LinkedColumnSpec,
} from "@/lib/domain/data/server/linked-schema";
import { markContextDirty } from "@/lib/domain/ai-context/context-dirty";
import { prisma } from "@/lib/database/client";
import {
  canAlterSchema,
  resolveDataTableAccess,
} from "@/lib/domain/data/server/access";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function badRequest(message: string) {
  return NextResponse.json(
    { success: false, error: { code: "BAD_REQUEST", message } },
    { status: 400 }
  );
}

const ROUTE_PATH = "/api/content/data/batch";

interface BatchBody {
  tables?: Array<{
    title?: unknown;
    description?: unknown;
    parentId?: unknown;
    ownerContentId?: unknown;
    columns?: unknown;
  }>;
  extend?: Array<{ database?: unknown; columns?: unknown }>;
}

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await requireAuth();
      const body = (await request.json().catch(() => null)) as BatchBody | null;

      const tables = (Array.isArray(body?.tables) ? body.tables : []).map(
        (t) => ({
          title: typeof t?.title === "string" ? t.title : "",
          description:
            typeof t?.description === "string" && t.description.trim()
              ? t.description.trim()
              : null,
          parentId: typeof t?.parentId === "string" ? t.parentId : null,
          ownerContentId:
            typeof t?.ownerContentId === "string" ? t.ownerContentId : null,
          columns: (Array.isArray(t?.columns)
            ? t.columns
            : []) as LinkedColumnSpec[],
        })
      );
      // Resolve + authorize each extend target before anything is written.
      const extend: Array<{
        tableId: string;
        title: string;
        columns: LinkedColumnSpec[];
      }> = [];
      for (const raw of Array.isArray(body?.extend) ? body.extend : []) {
        const ref = typeof raw?.database === "string" ? raw.database.trim() : "";
        if (!ref) {
          return badRequest("Every extend entry needs a database id or title.");
        }
        const node = await prisma.contentNode.findFirst({
          where: {
            contentType: "data",
            deletedAt: null,
            OR: [
              { id: UUID_RE.test(ref) ? ref : undefined },
              { title: ref, ownerId: session.user.id },
            ],
          },
          select: { id: true, title: true },
        });
        if (!node) return badRequest(`"${ref}" is not one of your databases.`);
        const level = await resolveDataTableAccess(node.id, session.user.id);
        if (!canAlterSchema(level)) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: "FORBIDDEN",
                message: `Only "${node.title}"'s owner can add columns to it.`,
              },
            },
            { status: 403 }
          );
        }
        extend.push({
          tableId: node.id,
          title: node.title,
          columns: (Array.isArray(raw?.columns)
            ? raw.columns
            : []) as LinkedColumnSpec[],
        });
      }

      const result = await withSpan(
        { layer: "content", name: "data_linked_schema_apply" },
        {
          summary: "apply a linked database schema",
          attrs: { tables: tables.length, extend: extend.length },
        },
        async () => applyLinkedSchema(session.user.id, { tables, extend })
      );

      // Every table in the graph has a new schema digest — including the
      // targets that only received a backlink (plan B1 route discipline).
      const dirty = touchedTableIds(result);
      if (dirty.length > 0) after(() => markContextDirty(dirty));

      logger.info({
        layer: "content",
        event: "data:linked_schema_created",
        summary: `linked schema applied: ${result.tables.length} new, ${result.relations} relations`,
        attrs: {
          tables: result.tables.length,
          extended: result.extended.length,
          relations: result.relations,
          computed: result.computed,
        },
      });

      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      // A rejected spec is the user's card being wrong, not the server
      // breaking — it names the column and nothing was written.
      if (error instanceof LinkedSchemaError) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "BAD_REQUEST", message: error.message },
          },
          { status: 400 }
        );
      }
      logger.error({
        layer: "content",
        event: "data:linked_schema:caught",
        summary: "failed to apply a linked schema",
        error,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Nothing was created — applying the schema failed.",
          },
        },
        { status: 500 }
      );
    }
  });
}
