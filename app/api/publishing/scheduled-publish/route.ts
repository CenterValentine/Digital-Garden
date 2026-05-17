/**
 * POST /api/publishing/scheduled-publish
 * Called by Vercel Cron every 5 minutes (or daily on Hobby plan).
 * Publishes all items where state = "scheduled" AND scheduledFor <= now.
 *
 * Cron has no client x-trace-id, so withRouteTrace mints a fresh one and
 * surfaces it as attrs.cron_run_id for correlation with Vercel's cron history.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger";
import { withRouteTrace } from "@/lib/core/logger/route-trace";
import { withSpan, startSpan } from "@/lib/core/logger/span";
import { spanPayload } from "@/lib/core/logger/span-payload";
import { getActiveTrace } from "@/lib/core/logger/context";
import crypto from "crypto";

function hashJson(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 64);
}

export async function POST(req: NextRequest) {
  return withRouteTrace(
    req,
    { route: "/api/publishing/scheduled-publish" },
    async () => {
      // Verify Vercel cron signature
      const authHeader = req.headers.get("authorization");
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        logger.warn({
          layer: "content",
          event: "publishing_scheduled_publish:rejected",
          summary: "missing or invalid cron secret",
          attrs: { reason: "unauthorized" },
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const traceId = getActiveTrace()?.trace_id ?? "no-trace";

      return withSpan(
        { layer: "content", name: "publishing:scheduled_publish_batch" },
        {
          summary: "scheduled-publish cron batch",
          attrs: { cron_run_id: traceId },
        },
        async (batchSpan) => {
          const now = new Date();

          const due = await prisma.publicItem.findMany({
            where: {
              state: "scheduled",
              scheduledFor: { lte: now },
              deletedAt: null,
              validationStatus: { not: "blocked" },
            },
            include: { workingRevision: true },
          });

          batchSpan.attr("due_count", due.length);

          const results = await Promise.allSettled(
            due.map(async (item) => {
              // Open a per-item child span. Cron iterates items in parallel via
              // Promise.allSettled, so each gets its own span with its own attrs;
              // they all share the batch's trace_id but get distinct span_ids.
              const itemSpan = startSpan({
                layer: "content",
                name: "publishing:scheduled_publish_item",
              }, {
                summary: "scheduled-publish item",
                attrs: { public_item_id: item.id, payload_type: item.payloadType },
              });

              try {
                const bodyJson =
                  item.workingRevision?.bodyJson ?? { type: "doc", content: [] };
                const metadataSnapshot = {
                  publicTitle: item.publicTitle,
                  publicTags: item.publicTags,
                };

                const revision = await prisma.publicItemRevision.create({
                  data: {
                    publicItemId: item.id,
                    bodyJson,
                    metadataSnapshot,
                    bodyHash: hashJson(bodyJson),
                    metadataHash: hashJson(metadataSnapshot),
                    note: "Scheduled publish",
                    publishedAt: now,
                    authorId: item.ownerId,
                  },
                });

                await prisma.publicItem.update({
                  where: { id: item.id },
                  data: {
                    state: "published",
                    publishedRevisionId: revision.id,
                    lastPublishedAt: now,
                    firstPublishedAt: item.firstPublishedAt ?? now,
                    scheduledFor: null,
                  },
                });

                itemSpan.attr("revision_id", revision.id);
                await spanPayload(itemSpan, "result", {
                  outcome: "published",
                  publicItemId: item.id,
                  revisionId: revision.id,
                });
                itemSpan.end();

                return item.id;
              } catch (error) {
                itemSpan.fail(error);
                throw error;
              }
            }),
          );

          const published = results.filter((r) => r.status === "fulfilled").length;
          const failed = results.filter((r) => r.status === "rejected").length;

          // Per-failure structured log for postmortem analysis
          for (let i = 0; i < results.length; i++) {
            const r = results[i]!;
            if (r.status === "rejected") {
              logger.error({
                layer: "content",
                event: "publishing_scheduled_publish_item:caught",
                summary: "scheduled publish item failed",
                attrs: {
                  public_item_id: due[i]!.id,
                  payload_type: due[i]!.payloadType,
                },
                error: r.reason,
              });
            }
          }

          batchSpan
            .attr("published_count", published)
            .attr("failed_count", failed)
            .attr("total_count", due.length);
          await spanPayload(batchSpan, "batch_summary", {
            published,
            failed,
            total: due.length,
            cronRunId: traceId,
          });

          return NextResponse.json({ published, failed, total: due.length });
        },
      );
    },
  );
}
