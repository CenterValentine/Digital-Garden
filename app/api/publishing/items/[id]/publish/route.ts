/**
 * POST /api/publishing/items/[id]/publish
 * Snapshots the working revision → published revision, sets state = published.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger";
import { withRouteTrace } from "@/lib/core/logger/route-trace";
import { withSpan } from "@/lib/core/logger/span";
import { spanPayload } from "@/lib/core/logger/span-payload";
import crypto from "crypto";

function hashJson(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 64);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withRouteTrace(
    req,
    { route: "/api/publishing/items/[id]/publish" },
    async () => {
      const session = await requireAuth();
      const { id } = await params;
      const body = await req.json().catch(() => ({}));
      const { note } = body as { note?: string };

      return withSpan(
        { layer: "content", name: "publishing:publish" },
        { summary: "publishing item publish", attrs: { public_item_id: id } },
        async (span) => {
          const item = await prisma.publicItem.findFirst({
            where: { id, ownerId: session.user.id, deletedAt: null },
            include: {
              workingRevision: true,
              contentNode: { include: { notePayload: true } },
            },
          });

          if (!item) {
            logger.warn({
              layer: "content",
              event: "publishing_publish:rejected",
              summary: "public item not found",
              attrs: { public_item_id: id },
            });
            return NextResponse.json({ error: "Not found" }, { status: 404 });
          }
          if (item.validationStatus === "blocked") {
            logger.warn({
              layer: "content",
              event: "publishing_publish:rejected",
              summary: "validation blocked publish",
              attrs: { public_item_id: id, validation_status: item.validationStatus },
            });
            return NextResponse.json(
              { error: "Validation errors must be resolved before publishing" },
              { status: 422 },
            );
          }
          if (item.state === "archived") {
            logger.warn({
              layer: "content",
              event: "publishing_publish:rejected",
              summary: "cannot publish archived item",
              attrs: { public_item_id: id, state: item.state },
            });
            return NextResponse.json(
              { error: "Cannot publish an archived item" },
              { status: 422 },
            );
          }

          // Prefer working revision body; fall back to live ContentNode note payload; then empty doc.
          const bodyJson =
            item.workingRevision?.bodyJson ??
            item.contentNode.notePayload?.tiptapJson ??
            { type: "doc", content: [] };
          const metadataSnapshot = { publicTitle: item.publicTitle, publicTags: item.publicTags };
          const now = new Date();

          const revision = await prisma.publicItemRevision.create({
            data: {
              publicItemId: id,
              bodyJson,
              metadataSnapshot,
              bodyHash: hashJson(bodyJson),
              metadataHash: hashJson(metadataSnapshot),
              note: note ?? null,
              publishedAt: now,
              authorId: session.user.id,
            },
          });

          await prisma.publicItem.update({
            where: { id },
            data: {
              state: "published",
              publishedRevisionId: revision.id,
              lastPublishedAt: now,
              firstPublishedAt: item.firstPublishedAt ?? now,
              scheduledFor: null,
            },
          });

          span
            .attr("revision_id", revision.id)
            .attr("payload_type", item.payloadType)
            .attr("body_hash", revision.bodyHash);
          await spanPayload(span, "published_revision", {
            revisionId: revision.id,
            bodyJson,
            metadataSnapshot,
            bodyHash: revision.bodyHash,
            metadataHash: revision.metadataHash,
            note,
            publishedAt: now.toISOString(),
          });

          return NextResponse.json({ ok: true, revisionId: revision.id });
        },
      );
    },
  );
}
