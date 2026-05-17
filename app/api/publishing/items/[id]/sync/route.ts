/**
 * POST /api/publishing/items/[id]/sync
 * Creates or updates the working revision from the ContentNode's current content.
 * Returns hasPendingChanges so the sidebar can show "Changes pending" immediately.
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
  return withRouteTrace(req, { route: "/api/publishing/items/[id]/sync" }, async () => {
    const session = await requireAuth();
    const { id } = await params;

    return withSpan(
      { layer: "content", name: "publishing:sync" },
      { summary: "publishing item sync", attrs: { public_item_id: id } },
      async (span) => {
        const item = await prisma.publicItem.findFirst({
          where: { id, ownerId: session.user.id, deletedAt: null },
          include: {
            workingRevision: true,
            publishedRevision: { select: { bodyHash: true } },
            contentNode: { include: { notePayload: true } },
          },
        });

        if (!item) {
          logger.warn({
            layer: "content",
            event: "publishing_sync:rejected",
            summary: "public item not found",
            attrs: { public_item_id: id },
          });
          return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const liveBodyJson = item.contentNode.notePayload?.tiptapJson ?? { type: "doc", content: [] };
        const liveBodyHash = hashJson(liveBodyJson);
        const metadataSnapshot = { publicTitle: item.publicTitle, publicTags: item.publicTags };
        const metadataHash = hashJson(metadataSnapshot);

        await spanPayload(span, "source_payload", {
          liveBodyJson,
          liveBodyHash,
          metadataSnapshot,
          metadataHash,
        });

        // Upsert the working revision
        let workingRevision = item.workingRevision;
        let action: "created" | "updated" | "noop";

        if (!workingRevision) {
          workingRevision = await prisma.publicItemRevision.create({
            data: {
              publicItemId: id,
              bodyJson: liveBodyJson,
              metadataSnapshot,
              bodyHash: liveBodyHash,
              metadataHash,
              authorId: session.user.id,
            },
          });
          await prisma.publicItem.update({
            where: { id },
            data: { workingRevisionId: workingRevision.id },
          });
          action = "created";
        } else if (workingRevision.bodyHash !== liveBodyHash) {
          // Update existing working revision's body
          workingRevision = await prisma.publicItemRevision.update({
            where: { id: workingRevision.id },
            data: {
              bodyJson: liveBodyJson,
              bodyHash: liveBodyHash,
              metadataSnapshot,
              metadataHash,
            },
          });
          action = "updated";
        } else {
          action = "noop";
        }

        const hasPendingChanges =
          item.publishedRevision !== null &&
          workingRevision.bodyHash !== item.publishedRevision.bodyHash;

        span
          .attr("action", action)
          .attr("has_pending_changes", hasPendingChanges)
          .attr("body_hash", workingRevision.bodyHash);
        await spanPayload(span, "diff_summary", {
          action,
          previousBodyHash: item.workingRevision?.bodyHash ?? null,
          newBodyHash: workingRevision.bodyHash,
          publishedBodyHash: item.publishedRevision?.bodyHash ?? null,
          hasPendingChanges,
        });

        return NextResponse.json({
          ok: true,
          hasPendingChanges,
          bodyHash: workingRevision.bodyHash,
        });
      },
    );
  });
}
