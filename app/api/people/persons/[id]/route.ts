import { NextRequest, NextResponse } from "next/server";
import type { JSONContent } from "@tiptap/core";
import type { Prisma } from "@/lib/database/generated/prisma";

import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { generateSlug } from "@/lib/domain/content/slug";

type FolderViewMode = "list" | "gallery" | "kanban" | "dashboard" | "canvas";

type Params = Promise<{ id: string }>;

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function extractTextFromJsonContent(content: JSONContent | null | undefined): string {
  if (!content) return "";

  let text = "";
  if (typeof content.text === "string") {
    text += content.text;
  }

  if (Array.isArray(content.content)) {
    for (const child of content.content) {
      text += ` ${extractTextFromJsonContent(child as JSONContent)}`;
    }
  }

  return text.trim();
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function mergeOptionalString(currentValue: unknown, nextValue: string | null | undefined): string | null {
  if (nextValue === undefined) {
    return readString(currentValue);
  }

  return nextValue?.trim() || null;
}

function isFolderViewMode(value: unknown): value is FolderViewMode {
  return value === "list" || value === "gallery" || value === "kanban" || value === "dashboard" || value === "canvas";
}

function readContentViewMetadata(metadata: Record<string, unknown>) {
  const contentView = asObject(metadata.contentView);
  return {
    viewMode: isFolderViewMode(contentView.viewMode) ? contentView.viewMode : "list",
    viewPrefs: asObject(contentView.viewPrefs),
  };
}

function asInputJsonObject(value: Record<string, unknown>): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}

async function buildContentAncestorIds(contentParentId: string | null) {
  const ids: string[] = [];
  let currentId = contentParentId;

  while (currentId) {
    const node = await prisma.contentNode.findUnique({
      where: { id: currentId },
      select: {
        id: true,
        parentId: true,
      },
    });

    if (!node) {
      break;
    }

    ids.unshift(node.id);
    currentId = node.parentId;
  }

  return ids;
}

async function buildPersonTreePresence(ownerId: string, personId: string) {
  const person = await prisma.person.findFirst({
    where: {
      id: personId,
      ownerId,
      deletedAt: null,
    },
    include: {
      fileTreeMounts: {
        orderBy: { createdAt: "asc" },
      },
      primaryGroup: {
        include: {
          parentGroup: true,
          fileTreeMounts: {
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  if (!person) {
    return null;
  }

  const groupChain: Array<{
    id: string;
    parentGroupId: string | null;
    fileTreeMounts: Array<{ contentParentId: string | null }>;
  }> = [];

  let currentGroupId: string | null = person.primaryGroupId;
  while (currentGroupId) {
    const group: {
      id: string;
      parentGroupId: string | null;
      fileTreeMounts: Array<{ contentParentId: string | null }>;
    } | null = await prisma.peopleGroup.findFirst({
      where: {
        id: currentGroupId,
        ownerId,
        deletedAt: null,
      },
      select: {
        id: true,
        parentGroupId: true,
        fileTreeMounts: {
          select: {
            contentParentId: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (!group) {
      break;
    }

    groupChain.unshift(group);
    currentGroupId = group.parentGroupId;
  }

  const directMount = person.fileTreeMounts[0] ?? null;
  const mountedAncestorIndex = [...groupChain].reverse().findIndex((group) => group.fileTreeMounts.length > 0);
  const mountedAncestorGroup =
    mountedAncestorIndex >= 0
      ? groupChain[groupChain.length - 1 - mountedAncestorIndex]
      : null;

  const mountSource = directMount ? "person" : mountedAncestorGroup ? "group" : null;
  const mountContentParentId =
    directMount?.contentParentId ?? mountedAncestorGroup?.fileTreeMounts[0]?.contentParentId ?? null;

  const mountedGroupStartIndex = mountedAncestorGroup
    ? groupChain.findIndex((group) => group.id === mountedAncestorGroup.id)
    : -1;

  return {
    isVisibleInFileTree: Boolean(mountSource),
    selectedNodeId: `person:${person.id}`,
    mountSource,
    mountedGroupId: mountedAncestorGroup?.id ?? null,
    contentAncestorIds: await buildContentAncestorIds(mountContentParentId),
    peopleAncestorIds:
      mountedGroupStartIndex >= 0
        ? groupChain.slice(mountedGroupStartIndex).map((group) => `peopleGroup:${group.id}`)
        : [],
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const person = await prisma.person.findFirst({
      where: {
        id,
        ownerId: session.user.id,
        deletedAt: null,
      },
      include: {
        primaryGroup: {
          select: {
            id: true,
            name: true,
          },
        },
        fileTreeMounts: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (!person) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Person not found",
          },
        },
        { status: 404 }
      );
    }

    const metadata = asObject(person.metadata);
    const address = asObject(metadata.address);

    return NextResponse.json({
      success: true,
      data: {
        personId: person.id,
        displayName: person.displayName,
        slug: person.slug,
        givenName: person.givenName,
        familyName: person.familyName,
        email: person.email,
        phone: person.phone,
        avatarUrl: person.avatarUrl,
        primaryGroupId: person.primaryGroupId,
        primaryGroupName: person.primaryGroup.name,
        createdAt: person.createdAt,
        updatedAt: person.updatedAt,
        mount: person.fileTreeMounts[0]
          ? {
              id: person.fileTreeMounts[0].id,
              contentParentId: person.fileTreeMounts[0].contentParentId,
              displayOrder: person.fileTreeMounts[0].displayOrder,
            }
          : null,
        metadata: {
          organization: typeof metadata.organization === "string" ? metadata.organization : null,
          jobTitle: typeof metadata.jobTitle === "string" ? metadata.jobTitle : null,
          birthday: typeof metadata.birthday === "string" ? metadata.birthday : null,
          website: typeof metadata.website === "string" ? metadata.website : null,
          notes: typeof metadata.notes === "string" ? metadata.notes : null,
          notesTiptapJson: asObject(metadata.notesTiptapJson),
          contentView: readContentViewMetadata(metadata),
          address: {
            line1: typeof address.line1 === "string" ? address.line1 : null,
            line2: typeof address.line2 === "string" ? address.line2 : null,
            city: typeof address.city === "string" ? address.city : null,
            region: typeof address.region === "string" ? address.region : null,
            postalCode: typeof address.postalCode === "string" ? address.postalCode : null,
            country: typeof address.country === "string" ? address.country : null,
          },
        },
        treePresence: await buildPersonTreePresence(session.user.id, person.id),
      },
    });
  } catch (error) {
    console.error("GET /api/people/persons/[id] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to fetch person",
        },
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = (await request.json()) as {
      displayName?: string;
      primaryGroupId?: string | null;
      givenName?: string | null;
      familyName?: string | null;
      email?: string | null;
      phone?: string | null;
      avatarUrl?: string | null;
      organization?: string | null;
      jobTitle?: string | null;
      birthday?: string | null;
      website?: string | null;
      addressLine1?: string | null;
      addressLine2?: string | null;
      city?: string | null;
      region?: string | null;
      postalCode?: string | null;
      country?: string | null;
      notes?: string | null;
      notesTiptapJson?: JSONContent | null;
      contentViewMode?: FolderViewMode;
      contentViewPrefs?: Record<string, unknown> | null;
    };

    const person = await prisma.person.findFirst({
      where: {
        id,
        ownerId: session.user.id,
        deletedAt: null,
      },
      select: {
        id: true,
        displayName: true,
        givenName: true,
        familyName: true,
        email: true,
        phone: true,
        avatarUrl: true,
        metadata: true,
      },
    });

    if (!person) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Person not found",
          },
        },
        { status: 404 }
      );
    }

    const nextDisplayName = body.displayName?.trim() || person.displayName;
    if (!nextDisplayName) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "displayName is required",
          },
        },
        { status: 400 }
      );
    }

    if (body.primaryGroupId) {
      const group = await prisma.peopleGroup.findFirst({
        where: {
          id: body.primaryGroupId,
          ownerId: session.user.id,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!group) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Primary group not found",
            },
          },
          { status: 404 }
        );
      }
    }

    let slug = undefined as string | undefined;
    if (nextDisplayName !== person.displayName) {
      const baseSlug = generateSlug(nextDisplayName) || "person";
      let candidate = baseSlug;
      let suffix = 2;

      while (true) {
        const existing = await prisma.person.findFirst({
          where: {
            ownerId: session.user.id,
            slug: candidate,
            id: { not: id },
          },
          select: { id: true },
        });

        if (!existing) {
          slug = candidate;
          break;
        }

        candidate = `${baseSlug}-${suffix}`;
        suffix += 1;
      }
    }

    const existingMetadata = asObject(person.metadata);
    const existingAddress = asObject(existingMetadata.address);
    const existingContentView = readContentViewMetadata(existingMetadata);
    const nextNotesTiptapJson =
      body.notesTiptapJson === undefined ? existingMetadata.notesTiptapJson : body.notesTiptapJson;
    const nextNotesText =
      body.notesTiptapJson !== undefined
        ? extractTextFromJsonContent(body.notesTiptapJson).slice(0, 5000) || null
        : body.notes !== undefined
          ? body.notes?.trim() || null
          : readString(existingMetadata.notes);

    const updated = await prisma.person.update({
      where: {
        id,
      },
      data: {
        displayName: nextDisplayName,
        ...(slug ? { slug } : {}),
        primaryGroupId: body.primaryGroupId ?? undefined,
        givenName: mergeOptionalString(person.givenName, body.givenName),
        familyName: mergeOptionalString(person.familyName, body.familyName),
        email: mergeOptionalString(person.email, body.email),
        phone: mergeOptionalString(person.phone, body.phone),
        avatarUrl: mergeOptionalString(person.avatarUrl, body.avatarUrl),
        metadata: {
          ...asInputJsonObject(existingMetadata),
          organization: mergeOptionalString(existingMetadata.organization, body.organization),
          jobTitle: mergeOptionalString(existingMetadata.jobTitle, body.jobTitle),
          birthday: mergeOptionalString(existingMetadata.birthday, body.birthday),
          website: mergeOptionalString(existingMetadata.website, body.website),
          address: {
            ...asInputJsonObject(existingAddress),
            line1: mergeOptionalString(existingAddress.line1, body.addressLine1),
            line2: mergeOptionalString(existingAddress.line2, body.addressLine2),
            city: mergeOptionalString(existingAddress.city, body.city),
            region: mergeOptionalString(existingAddress.region, body.region),
            postalCode: mergeOptionalString(existingAddress.postalCode, body.postalCode),
            country: mergeOptionalString(existingAddress.country, body.country),
          },
          notes: nextNotesText,
          notesTiptapJson: (nextNotesTiptapJson ?? null) as never,
          contentView: {
            viewMode: body.contentViewMode ?? existingContentView.viewMode,
            viewPrefs:
              body.contentViewPrefs === undefined
                ? asInputJsonObject(existingContentView.viewPrefs)
                : asInputJsonObject(body.contentViewPrefs ?? {}),
          },
        },
      },
      include: {
        primaryGroup: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        personId: updated.id,
        displayName: updated.displayName,
        slug: updated.slug,
        primaryGroupId: updated.primaryGroupId,
        primaryGroupName: (updated as any).primaryGroup?.name ?? null,
        metadata: {
          contentView: readContentViewMetadata(asObject(updated.metadata)),
        },
      },
    });
  } catch (error) {
    console.error("PATCH /api/people/persons/[id] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to update person",
        },
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Params }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const person = await prisma.person.findFirst({
      where: {
        id,
        ownerId: session.user.id,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            contentNodes: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
    });

    if (!person) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Person not found",
          },
        },
        { status: 404 }
      );
    }

    if (person._count.contentNodes > 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "PERSON_HAS_CONTENT",
            message: "This contact still owns files or folders. Move or delete that content before deleting the contact.",
          },
        },
        { status: 409 }
      );
    }

    await prisma.person.update({
      where: {
        id: person.id,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        personId: person.id,
      },
    });
  } catch (error) {
    console.error("DELETE /api/people/persons/[id] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to delete person",
        },
      },
      { status: 500 }
    );
  }
}
