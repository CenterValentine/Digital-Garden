/**
 * POST /api/publishing/items/[id]/validate
 * Runs validation rules against the item, stores results, returns issues.
 * Full rule engine wired in a later phase. Currently: title + body presence checks.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";

interface ValidationIssue {
  code: string;
  message: string;
  severity: "info" | "warn" | "error";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  

  const { id } = await params;

  const item = await prisma.publicItem.findFirst({
    where: { id, ownerId: session.user.id, deletedAt: null },
    include: { workingRevision: true },
  });

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const issues: ValidationIssue[] = [];

  // Rule: must have a title
  if (!item.publicTitle) {
    issues.push({
      code: "missing-title",
      message: "Public title is required before publishing.",
      severity: "error",
    });
  }

  // Rule: must have body content
  const bodyJson = item.workingRevision?.bodyJson as { content?: unknown[] } | null;
  const hasContent =
    bodyJson?.content && Array.isArray(bodyJson.content) && bodyJson.content.length > 0;
  if (!hasContent) {
    issues.push({
      code: "empty-body",
      message: "Content body is empty. Add some content before publishing.",
      severity: "error",
    });
  }

  const hasErrors = issues.some((i) => i.severity === "error");
  const hasWarnings = issues.some((i) => i.severity === "warn");
  const status = hasErrors ? "blocked" : hasWarnings ? "warnings" : "ok";

  await prisma.publicItem.update({
    where: { id },
    data: {
      validationStatus: status,
      validationCheckedAt: new Date(),
      validationIssues: issues as unknown as never,
    },
  });

  return NextResponse.json({ status, issues });
}
