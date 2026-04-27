import { NextRequest, NextResponse } from "next/server";
import type { JSONContent } from "@tiptap/core";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { getUserSettings } from "@/lib/features/settings/operations";
import {
  EMPTY_TIPTAP_NOTE,
  getMomentForPeriodicNote,
  getPeriodicNotePeriod,
  getPeriodicNoteSettings,
  type PeriodicNoteKind,
} from "@/lib/domain/periodic-notes";
import {
  extractSearchTextFromTipTap,
  generateUniqueSlug,
} from "@/lib/domain/content";
import { instantiateTemplateContent } from "@/lib/domain/editor/template-instantiation";

interface ResolvePeriodicNoteRequest {
  kind?: PeriodicNoteKind;
  localDateTime?: string | null;
}

function isPeriodicNoteKind(value: unknown): value is PeriodicNoteKind {
  return value === "daily" || value === "weekly";
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await request.json().catch(() => ({}))) as ResolvePeriodicNoteRequest;
    const kind = body.kind ?? "daily";

    if (!isPeriodicNoteKind(kind)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Periodic note kind must be daily or weekly.",
          },
        },
        { status: 400 }
      );
    }

    const settings = await getUserSettings(session.user.id);
    const noteSettings = getPeriodicNoteSettings(settings, kind);

    if (!noteSettings.enabled) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "DISABLED",
            message: `${kind === "daily" ? "Daily" : "Weekly"} notes are disabled.`,
          },
        },
        { status: 400 }
      );
    }

    await validatePeriodicNoteFolder(session.user.id, noteSettings.folderId);
    const period = getPeriodicNotePeriod(
      kind,
      noteSettings.filenameFormat,
      body.localDateTime
    );
    const currentMoment = getMomentForPeriodicNote(body.localDateTime);
    const templateJson = await resolveTemplateJson(
      session.user.id,
      noteSettings.templateId
    );

    const resolved = await prisma.$transaction(async (tx) => {
      const existingIndex = await tx.periodicNoteIndex.findUnique({
        where: {
          ownerId_kind_periodKey: {
            ownerId: session.user.id,
            kind,
            periodKey: period.periodKey,
          },
        },
        include: {
          content: {
            select: {
              id: true,
              title: true,
              contentType: true,
              deletedAt: true,
            },
          },
        },
      });

      if (
        existingIndex?.content &&
        existingIndex.content.deletedAt === null &&
        existingIndex.content.contentType === "note"
      ) {
        return {
          created: false,
          content: existingIndex.content,
        };
      }

      const tiptapJson = templateJson
        ? instantiateTemplateContent(templateJson, {
            regenerateBlockIds: true,
            now: currentMoment.toDate(),
            periodicSummaryDates: {
              daily: currentMoment.format("YYYY-MM-DD"),
              weekly: currentMoment.clone().startOf("isoWeek").format("YYYY-MM-DD"),
            },
          })
        : EMPTY_TIPTAP_NOTE;
      const searchText = extractSearchTextFromTipTap(tiptapJson);
      const wordCount = searchText.split(/\s+/).filter(Boolean).length;
      const slug = await generateUniqueSlug(period.title, session.user.id);

      const content = await tx.contentNode.create({
        data: {
          ownerId: session.user.id,
          title: period.title,
          slug,
          contentType: "note",
          parentId: noteSettings.folderId,
          notePayload: {
            create: {
              tiptapJson,
              searchText,
              metadata: {
                wordCount,
                characterCount: searchText.length,
                readingTime: Math.ceil(wordCount / 200),
                periodicNote: {
                  kind,
                  periodKey: period.periodKey,
                },
              },
            },
          },
        },
        select: {
          id: true,
          title: true,
          contentType: true,
        },
      });

      await tx.periodicNoteIndex.upsert({
        where: {
          ownerId_kind_periodKey: {
            ownerId: session.user.id,
            kind,
            periodKey: period.periodKey,
          },
        },
        create: {
          ownerId: session.user.id,
          kind,
          periodKey: period.periodKey,
          contentId: content.id,
        },
        update: {
          contentId: content.id,
        },
      });

      if (noteSettings.templateId) {
        await tx.pageTemplate.updateMany({
          where: {
            id: noteSettings.templateId,
            OR: [{ userId: session.user.id }, { userId: null }],
          },
          data: {
            usageCount: { increment: 1 },
          },
        });
      }

      return {
        created: true,
        content,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        id: resolved.content.id,
        title: resolved.content.title,
        contentType: "note",
        created: resolved.created,
        kind,
        periodKey: period.periodKey,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to resolve periodic note";
    const isAuthError =
      message === "Unauthorized" ||
      message === "Authentication required" ||
      message.toLowerCase().includes("auth");
    const status =
      isAuthError
        ? 401
        : message.includes("not found") || message.includes("cannot be used")
        ? 400
        : 500;

    console.error("POST /api/periodic-notes/resolve error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code:
            status === 401
              ? "UNAUTHORIZED"
              : status === 400
                ? "VALIDATION_ERROR"
                : "SERVER_ERROR",
          message,
        },
      },
      { status }
    );
  }
}

async function validatePeriodicNoteFolder(
  ownerId: string,
  folderId: string | null
) {
  if (!folderId) return;

  const folder = await prisma.contentNode.findFirst({
    where: {
      id: folderId,
      ownerId,
      deletedAt: null,
    },
    select: {
      contentType: true,
      peopleGroupId: true,
      personId: true,
    },
  });

  if (!folder || folder.contentType !== "folder") {
    throw new Error("Periodic notes folder not found.");
  }

  if (folder.peopleGroupId || folder.personId) {
    throw new Error("People folders cannot be used for periodic notes.");
  }
}

async function resolveTemplateJson(
  userId: string,
  templateId: string | null
): Promise<JSONContent | null> {
  if (!templateId) return null;

  const template = await prisma.pageTemplate.findFirst({
    where: {
      id: templateId,
      OR: [{ userId }, { userId: null }],
    },
    select: {
      tiptapJson: true,
    },
  });

  if (!template || typeof template.tiptapJson !== "object" || !template.tiptapJson) {
    throw new Error("Periodic notes template not found.");
  }

  return template.tiptapJson as JSONContent;
}
