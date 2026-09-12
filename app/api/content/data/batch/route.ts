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
 * Owner-only by contract. `applyLinkedSchema` resolves every table against
 * the caller's own live nodes, so a relation can never be drawn into — or a
 * column added to — a database someone else owns, even one shared with edit
 * rights. Extending a shared table stays the single-column route's job,
 * which has the jurisdiction ladder.
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

const ROUTE_PATH = "/api/content/data/batch";

interface BatchBody {
  tables?: Array<{
    title?: unknown;
    description?: unknown;
    parentId?: unknown;
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
          columns: (Array.isArray(t?.columns)
            ? t.columns
            : []) as LinkedColumnSpec[],
        })
      );
      const extend = (Array.isArray(body?.extend) ? body.extend : []).map(
        (e) => ({
          database: typeof e?.database === "string" ? e.database : "",
          columns: (Array.isArray(e?.columns)
            ? e.columns
            : []) as LinkedColumnSpec[],
        })
      );

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
