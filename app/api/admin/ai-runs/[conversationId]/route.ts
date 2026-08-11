/**
 * Admin API - AI Run Inspector detail
 *
 * GET /api/admin/ai-runs/[conversationId] - Full diagnostics for one
 * conversation: analyzed turns (steps, inferred request segments, findings)
 * plus the raw persisted messages for the part-level JSON viewer.
 *
 * Owner role required. Read-only; hidden (superseded-by-edit) messages are
 * excluded from analysis but included in the raw passthrough, flagged.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireRole } from "@/lib/infrastructure/auth/middleware";
import { handleApiError, logAuditAction } from "@/lib/domain/admin/audit";
import { AUDIT_ACTIONS } from "@/lib/domain/admin/api-types";
import { analyzeConversation } from "@/lib/domain/ai/run-inspector";
import type { AiRunDetailData } from "@/lib/domain/ai/run-inspector/api-types";

interface RouteContext {
  params: Promise<{ conversationId: string }>;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireRole("owner");
    const { conversationId } = await context.params;

    if (!UUID_PATTERN.test(conversationId)) {
      return NextResponse.json(
        { success: false, error: "Invalid conversation id" },
        { status: 400 },
      );
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, deletedAt: null },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        owner: { select: { email: true } },
        associations: { select: { contentNodeId: true, source: true } },
        messages: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            role: true,
            providerId: true,
            modelId: true,
            createdAt: true,
            isHidden: true,
            parts: true,
            metadata: true,
          },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { success: false, error: "Conversation not found" },
        { status: 404 },
      );
    }

    const visibleMessages = conversation.messages.filter((m) => !m.isHidden);
    const diagnostics = analyzeConversation(
      { id: conversation.id, title: conversation.title },
      visibleMessages,
    );

    await logAuditAction(
      session.user.id,
      AUDIT_ACTIONS.VIEW_AI_RUN_DETAIL,
      { conversationId },
      request,
    );

    const data: AiRunDetailData = {
      conversation: {
        id: conversation.id,
        title: conversation.title ?? undefined,
        ownerEmail: conversation.owner?.email ?? undefined,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
        associations: conversation.associations,
      },
      diagnostics,
      messages: conversation.messages.map((message) => ({
        id: message.id,
        role: message.role,
        providerId: message.providerId,
        modelId: message.modelId,
        createdAt: message.createdAt.toISOString(),
        isHidden: message.isHidden,
        parts: message.parts,
        metadata: message.metadata,
      })),
    };
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleApiError(error);
  }
}
