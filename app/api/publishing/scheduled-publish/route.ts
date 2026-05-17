/**
 * POST /api/publishing/scheduled-publish
 * Called by Vercel Cron every 5 minutes.
 * Publishes all items where state = "scheduled" AND scheduledFor <= now.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import crypto from "crypto";

function hashJson(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 64);
}

export async function POST(req: NextRequest) {
  // Verify Vercel cron signature
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const results = await Promise.allSettled(
    due.map(async (item) => {
      const bodyJson = item.workingRevision?.bodyJson ?? { type: "doc", content: [] };
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

      return item.id;
    })
  );

  const published = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  return NextResponse.json({ published, failed, total: due.length });
}
