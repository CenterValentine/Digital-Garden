/**
 * Admin API — Collaboration Document Maintenance
 *
 * GET  /api/admin/collab-doc  — list CollaborationDocuments with optional filters
 * DELETE /api/admin/collab-doc — flush Y.js state for a specific contentId
 *
 * Flushing a doc forces Hocuspocus to re-bootstrap from the canonical TipTap
 * JSON in NotePayload on next open. unsupportedBlock placeholders that have
 * originalJson are revived by tryReviveUnsupportedNode during bootstrap.
 *
 * Owner role required.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireRole } from "@/lib/infrastructure/auth/middleware";
import {
  logAuditAction,
  handleApiError,
} from "@/lib/domain/admin/audit";
import { AUDIT_ACTIONS } from "@/lib/domain/admin/api-types";

// ── GET — list collab docs ────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const session = await requireRole("owner");
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search") ?? "";
    const onlyUnsupported = searchParams.get("onlyUnsupported") === "true";
    const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 200);
    const offset = Number(searchParams.get("offset") ?? "0");

    const docs = await prisma.collaborationDocument.findMany({
      where: {
        content: {
          deletedAt: null,
          ...(search
            ? { title: { contains: search, mode: "insensitive" } }
            : {}),
        },
      },
      select: {
        id: true,
        contentId: true,
        documentName: true,
        schemaVersion: true,
        enabledAt: true,
        updatedAt: true,
        ydocState: true,
        content: {
          select: {
            title: true,
            contentType: true,
            owner: { select: { username: true } },
            notePayload: { select: { tiptapJson: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
    });

    // Annotate each doc with whether its TipTap JSON contains unsupportedBlock nodes
    const annotated = docs.map((doc) => {
      const json = doc.content.notePayload?.tiptapJson as
        | { content?: unknown[] }
        | null
        | undefined;
      const hasUnsupported = json ? containsUnsupportedBlock(json) : false;
      return {
        id: doc.id,
        contentId: doc.contentId,
        documentName: doc.documentName,
        schemaVersion: doc.schemaVersion,
        enabledAt: doc.enabledAt,
        updatedAt: doc.updatedAt,
        hasYdocState: doc.ydocState !== null && doc.ydocState.length > 0,
        ydocStateBytes: doc.ydocState?.length ?? 0,
        contentTitle: doc.content.title,
        contentType: doc.content.contentType,
        ownerUsername: doc.content.owner.username,
        hasUnsupportedBlocks: hasUnsupported,
      };
    });

    const filtered = onlyUnsupported
      ? annotated.filter((d) => d.hasUnsupportedBlocks)
      : annotated;

    await logAuditAction(
      session.user.id,
      AUDIT_ACTIONS.VIEW_COLLAB_DOCS,
      { search, onlyUnsupported, resultCount: filtered.length },
      request
    );

    return NextResponse.json({
      success: true,
      data: { items: filtered, total: filtered.length },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ── DELETE — flush Y.js state for a content ID ────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireRole("owner");
    const body = await request.json();
    const { contentId } = body as { contentId?: string };

    if (!contentId || typeof contentId !== "string") {
      return NextResponse.json(
        { success: false, error: "contentId is required" },
        { status: 400 }
      );
    }

    // Verify the doc exists and fetch title for the audit log
    const doc = await prisma.collaborationDocument.findUnique({
      where: { contentId },
      select: {
        id: true,
        documentName: true,
        content: { select: { title: true } },
      },
    });

    if (!doc) {
      return NextResponse.json(
        { success: false, error: "CollaborationDocument not found for this contentId" },
        { status: 404 }
      );
    }

    // Delete the document — Hocuspocus re-bootstraps from NotePayload on next open
    await prisma.collaborationDocument.delete({ where: { contentId } });

    await logAuditAction(
      session.user.id,
      AUDIT_ACTIONS.FLUSH_COLLAB_DOC,
      {
        contentId,
        documentName: doc.documentName,
        contentTitle: doc.content.title,
      },
      request
    );

    return NextResponse.json({
      success: true,
      data: { contentId, contentTitle: doc.content.title },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function containsUnsupportedBlock(node: unknown): boolean {
  if (typeof node !== "object" || node === null) return false;
  const n = node as Record<string, unknown>;
  if (n.type === "unsupportedBlock" || n.type === "unsupportedInline") return true;
  if (Array.isArray(n.content)) {
    return n.content.some(containsUnsupportedBlock);
  }
  return false;
}
