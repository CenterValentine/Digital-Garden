/**
 * Admin API - AI Run Inspector list
 *
 * GET /api/admin/ai-runs - List conversations with derived run diagnostics.
 *
 * Owner role required. Read-only: diagnostics are DERIVED on demand from
 * persisted parts + metadata (lib/domain/ai/run-inspector/), never stored.
 * Analysis runs only over the fetched page (25 rows) — owner tooling, no
 * precompute/caching in the MVP.
 *
 * Query params:
 *   page        1-based page number (default 1)
 *   provider    filter: conversations with an assistant turn on this providerId
 *   model       filter: same, by modelId
 *   since       ISO date — only conversations updated at/after it
 *   hasAnomaly  "1"/"true" — only rows with at least one finding (post-analysis)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireRole } from "@/lib/infrastructure/auth/middleware";
import { handleApiError, logAuditAction } from "@/lib/domain/admin/audit";
import { AUDIT_ACTIONS } from "@/lib/domain/admin/api-types";
import { analyzeConversation } from "@/lib/domain/ai/run-inspector";
import {
  AI_RUNS_PAGE_SIZE,
  type AiRunListData,
  type AiRunSummary,
} from "@/lib/domain/ai/run-inspector/api-types";

export async function GET(request: NextRequest) {
  try {
    const session = await requireRole("owner");

    const params = request.nextUrl.searchParams;
    const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
    const provider = params.get("provider") ?? undefined;
    const model = params.get("model") ?? undefined;
    const sinceRaw = params.get("since");
    const since = sinceRaw ? new Date(sinceRaw) : undefined;
    const hasAnomaly = ["1", "true"].includes(params.get("hasAnomaly") ?? "");

    const assistantFilter =
      provider || model
        ? {
            role: "assistant" as const,
            ...(provider ? { providerId: provider } : {}),
            ...(model ? { modelId: model } : {}),
          }
        : undefined;

    const conversations = await prisma.conversation.findMany({
      where: {
        deletedAt: null,
        ...(since && !Number.isNaN(since.getTime())
          ? { updatedAt: { gte: since } }
          : {}),
        ...(assistantFilter ? { messages: { some: assistantFilter } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * AI_RUNS_PAGE_SIZE,
      take: AI_RUNS_PAGE_SIZE + 1,
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        owner: { select: { email: true } },
        messages: {
          where: { isHidden: false },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            role: true,
            providerId: true,
            modelId: true,
            createdAt: true,
            parts: true,
            metadata: true,
          },
        },
      },
    });

    const hasMore = conversations.length > AI_RUNS_PAGE_SIZE;
    const pageRows = conversations.slice(0, AI_RUNS_PAGE_SIZE);

    let rows: AiRunSummary[] = pageRows.map((conversation) => {
      const diagnostics = analyzeConversation(
        { id: conversation.id, title: conversation.title },
        conversation.messages,
      );
      const kinds = Object.keys(
        diagnostics.totals.findingsByKind,
      ) as AiRunSummary["findingKinds"];
      return {
        conversationId: conversation.id,
        title: conversation.title ?? undefined,
        ownerEmail: conversation.owner?.email ?? undefined,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
        assistantTurns: diagnostics.totals.assistantTurns,
        models: diagnostics.modelsUsed,
        totals: {
          inputTokens: diagnostics.totals.inputTokens,
          outputTokens: diagnostics.totals.outputTokens,
          reasoningTokens: diagnostics.totals.reasoningTokens,
          requestCount: diagnostics.totals.requestCount,
        },
        findings: diagnostics.totals.findingsBySeverity,
        findingKinds: kinds,
      };
    });

    if (hasAnomaly) {
      rows = rows.filter((row) => row.findings.error + row.findings.warning > 0);
    }

    await logAuditAction(
      session.user.id,
      AUDIT_ACTIONS.VIEW_AI_RUN_LIST,
      { page, provider: provider ?? null, model: model ?? null },
      request,
    );

    const data: AiRunListData = {
      rows,
      page,
      pageSize: AI_RUNS_PAGE_SIZE,
      hasMore,
    };
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleApiError(error);
  }
}
