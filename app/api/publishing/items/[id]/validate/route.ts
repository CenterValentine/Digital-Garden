/**
 * POST /api/publishing/items/[id]/validate
 * Runs validation rules against the item, stores results, returns issues.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger";
import { withRouteTrace } from "@/lib/core/logger/route-trace";
import { withSpan } from "@/lib/core/logger/span";
import { spanPayload } from "@/lib/core/logger/span-payload";

interface ValidationIssue {
  code: string;
  message: string;
  severity: "info" | "warn" | "error";
}

// ─── Block JSON validation ────────────────────────────────────────────────────

interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
}

// Maps block node type → JSON attrs to validate and their required fields.
const BLOCK_JSON_SPECS: Record<string, Array<{ attrKey: string; requiredFields: string[] }>> = {
  featureList:  [{ attrKey: "items", requiredFields: ["title"] }],
  timeline:     [{ attrKey: "items", requiredFields: ["date", "title"] }],
  processSteps: [{ attrKey: "steps", requiredFields: ["title"] }],
  metricsStrip: [{ attrKey: "items", requiredFields: ["value", "label"] }],
  skillBadges:  [{ attrKey: "items", requiredFields: ["label"] }],
  logoStrip:    [{ attrKey: "items", requiredFields: ["src"] }],
  socialLinks:  [{ attrKey: "links", requiredFields: ["platform", "url"] }],
  tagCloud:     [{ attrKey: "items", requiredFields: ["label"] }],
  personCard:   [{ attrKey: "links", requiredFields: ["platform", "url"] }],
  faqAccordion: [{ attrKey: "items", requiredFields: ["question", "answer"] }],
};

function validateBlockNodes(bodyJson: TipTapNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  function walk(node: TipTapNode) {
    const specs = BLOCK_JSON_SPECS[node.type];
    if (specs) {
      for (const { attrKey, requiredFields } of specs) {
        const raw = (node.attrs?.[attrKey] as string) ?? "[]";
        let items: Record<string, unknown>[];
        try {
          items = JSON.parse(raw) as Record<string, unknown>[];
        } catch {
          issues.push({
            code: `block-invalid-json`,
            message: `"${node.type}" block has invalid JSON in "${attrKey}" — edit the block to fix it.`,
            severity: "warn",
          });
          continue;
        }
        for (let i = 0; i < items.length; i++) {
          const item = items[i]!;
          const missing = requiredFields.filter(
            (f) => item[f] === undefined || item[f] === null || String(item[f]).trim() === ""
          );
          if (missing.length > 0) {
            issues.push({
              code: `block-missing-fields`,
              message: `"${node.type}" block item ${i + 1} is missing: ${missing.join(", ")}.`,
              severity: "warn",
            });
          }
        }
      }
    }
    if (node.content) {
      for (const child of node.content) walk(child);
    }
  }

  if (bodyJson.content) {
    for (const child of bodyJson.content) walk(child);
  }
  return issues;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withRouteTrace(
    req,
    { route: "/api/publishing/items/[id]/validate" },
    async () => {
      const session = await requireAuth();
      const { id } = await params;

      return withSpan(
        { layer: "content", name: "publishing:validate" },
        { summary: "publishing item validate", attrs: { public_item_id: id } },
        async (span) => {
          const item = await prisma.publicItem.findFirst({
            where: { id, tenant: { ownerId: session.user.id }, deletedAt: null },
            include: {
              workingRevision: true,
              contentNode: { include: { notePayload: true } },
            },
          });

          if (!item) {
            logger.warn({
              layer: "content",
              event: "publishing_validate:rejected",
              summary: "public item not found",
              attrs: { public_item_id: id },
            });
            return NextResponse.json({ error: "Not found" }, { status: 404 });
          }

          const issues: ValidationIssue[] = [];

          // Rule: must have a title
          if (!item.publicTitle) {
            issues.push({
              code: "missing-title",
              message: "Public title is required before publishing.",
              severity: "error",
            });
          }

          // Rule: must have body content (check working revision first, then live note payload)
          const bodyJson = (item.workingRevision?.bodyJson ??
            item.contentNode.notePayload?.tiptapJson) as unknown as TipTapNode | null;
          const hasContent =
            bodyJson?.content && Array.isArray(bodyJson.content) && bodyJson.content.length > 0;
          if (!hasContent) {
            issues.push({
              code: "empty-body",
              message: "Content body is empty. Add some content before publishing.",
              severity: "error",
            });
          }

          // Rule: validate block JSON attrs
          if (bodyJson) {
            issues.push(...validateBlockNodes(bodyJson));
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

          span
            .attr("status", status)
            .attr("issue_count", issues.length)
            .attr("error_count", issues.filter((i) => i.severity === "error").length)
            .attr("warning_count", issues.filter((i) => i.severity === "warn").length);
          await spanPayload(span, "validation_report", { status, issues });

          return NextResponse.json({ status, issues });
        },
      );
    },
  );
}
