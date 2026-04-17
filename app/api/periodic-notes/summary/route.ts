import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/client";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";

const MAX_SUMMARY_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;

function parseDateParam(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

interface PathNode {
  id: string;
  title: string;
  parentId: string | null;
  peopleGroupId: string | null;
  personId: string | null;
}

interface PeopleGroupPathNode {
  id: string;
  name: string;
  parentGroupId: string | null;
}

interface PersonPathNode {
  id: string;
  displayName: string;
  primaryGroupId: string;
}

function buildFolderPathSegments(
  parentId: string | null,
  folderMap: Map<string, PathNode>
) {
  const labels: string[] = [];
  const seen = new Set<string>();
  let currentId: string | null = parentId;

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const current = folderMap.get(currentId);
    if (!current) break;
    labels.unshift(current.title);
    currentId = current.parentId;
  }

  return labels;
}

function buildPeopleGroupPathSegments(
  groupId: string,
  peopleGroupMap: Map<string, PeopleGroupPathNode>
) {
  const labels: string[] = [];
  const seen = new Set<string>();
  let currentId: string | null = groupId;

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const current = peopleGroupMap.get(currentId);
    if (!current) break;
    labels.unshift(current.name);
    currentId = current.parentGroupId;
  }

  if (labels[0]?.toLowerCase() === "people") return labels;
  return ["People", ...labels];
}

function buildPeoplePathSegments(
  peopleGroupId: string | null,
  personId: string | null,
  peopleGroupMap: Map<string, PeopleGroupPathNode>,
  personMap: Map<string, PersonPathNode>
) {
  if (personId) {
    const person = personMap.get(personId);
    if (!person) return ["People"];
    return [
      ...buildPeopleGroupPathSegments(person.primaryGroupId, peopleGroupMap),
      person.displayName,
    ];
  }

  if (peopleGroupId) {
    return buildPeopleGroupPathSegments(peopleGroupId, peopleGroupMap);
  }

  return ["Root"];
}

function getInheritedPeopleAssignment(
  node: PathNode,
  folderMap: Map<string, PathNode>
) {
  if (node.peopleGroupId || node.personId) {
    return {
      peopleGroupId: node.peopleGroupId,
      personId: node.personId,
    };
  }

  const seen = new Set<string>();
  let currentId: string | null = node.parentId;

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const current = folderMap.get(currentId);
    if (!current) break;
    if (current.peopleGroupId || current.personId) {
      return {
        peopleGroupId: current.peopleGroupId,
        personId: current.personId,
      };
    }
    currentId = current.parentId;
  }

  return {
    peopleGroupId: null,
    personId: null,
  };
}

function buildLocationPathLabel(
  node: PathNode,
  folderMap: Map<string, PathNode>,
  peopleGroupMap: Map<string, PeopleGroupPathNode>,
  personMap: Map<string, PersonPathNode>
) {
  const assignment = getInheritedPeopleAssignment(node, folderMap);
  const baseSegments = buildPeoplePathSegments(
    assignment.peopleGroupId,
    assignment.personId,
    peopleGroupMap,
    personMap
  );
  const folderSegments = buildFolderPathSegments(node.parentId, folderMap);

  return [...baseSegments, ...folderSegments].join(" / ");
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const start = parseDateParam(searchParams.get("start"));
    const end = parseDateParam(searchParams.get("end"));

    if (!start || !end || start >= end) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "A valid start and end time are required.",
          },
        },
        { status: 400 }
      );
    }

    if (end.getTime() - start.getTime() > MAX_SUMMARY_WINDOW_MS) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Summary windows cannot be longer than ten days.",
          },
        },
        { status: 400 }
      );
    }

    const nodes = await prisma.contentNode.findMany({
      where: {
        ownerId: session.user.id,
        deletedAt: null,
        contentType: { not: "folder" },
        role: { not: "system" },
        OR: [
          {
            createdAt: {
              gte: start,
              lt: end,
            },
          },
          {
            updatedAt: {
              gte: start,
              lt: end,
            },
          },
        ],
      },
      select: {
        id: true,
        title: true,
        contentType: true,
        customIcon: true,
        iconColor: true,
        parentId: true,
        peopleGroupId: true,
        personId: true,
        createdAt: true,
        updatedAt: true,
        filePayload: {
          select: {
            mimeType: true,
          },
        },
        visualizationPayload: {
          select: {
            engine: true,
          },
        },
      },
    });

    const folders = await prisma.contentNode.findMany({
      where: {
        ownerId: session.user.id,
        deletedAt: null,
        contentType: "folder",
      },
      select: {
        id: true,
        title: true,
        parentId: true,
        peopleGroupId: true,
        personId: true,
      },
    });
    const folderMap = new Map(folders.map((folder) => [folder.id, folder]));

    const [peopleGroups, people] = await Promise.all([
      prisma.peopleGroup.findMany({
        where: {
          ownerId: session.user.id,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          parentGroupId: true,
        },
      }),
      prisma.person.findMany({
        where: {
          ownerId: session.user.id,
          deletedAt: null,
        },
        select: {
          id: true,
          displayName: true,
          primaryGroupId: true,
        },
      }),
    ]);
    const peopleGroupMap = new Map(
      peopleGroups.map((group) => [group.id, group])
    );
    const personMap = new Map(people.map((person) => [person.id, person]));

    const items = nodes
      .map((node) => {
        const createdAt = node.createdAt.getTime();
        const updatedAt = node.updatedAt.getTime();
        const createdInPeriod =
          createdAt >= start.getTime() && createdAt < end.getTime();
        const editedInPeriod =
          updatedAt >= start.getTime() && updatedAt < end.getTime();
        const locationPath = buildLocationPathLabel(
          node,
          folderMap,
          peopleGroupMap,
          personMap
        );

        return {
          id: node.id,
          title: node.title,
          contentType: node.contentType,
          customIcon: node.customIcon,
          iconColor: node.iconColor,
          fileMimeType: node.filePayload?.mimeType ?? null,
          visualizationEngine: node.visualizationPayload?.engine ?? null,
          createdAt: node.createdAt.toISOString(),
          updatedAt: node.updatedAt.toISOString(),
          activity: createdInPeriod ? "created" : "edited",
          path: locationPath,
          sortTime: createdInPeriod ? createdAt : updatedAt,
          include: createdInPeriod || editedInPeriod,
        };
      })
      .filter((item) => item.include)
      .sort((a, b) => {
        if (a.activity !== b.activity) {
          return a.activity === "created" ? -1 : 1;
        }
        return b.sortTime - a.sortTime;
      })
      .map((item) => ({
        id: item.id,
        title: item.title,
        contentType: item.contentType,
        customIcon: item.customIcon,
        iconColor: item.iconColor,
        fileMimeType: item.fileMimeType,
        visualizationEngine: item.visualizationEngine,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        activity: item.activity,
        path: item.path,
      }));

    return NextResponse.json({
      success: true,
      data: {
        start: start.toISOString(),
        end: end.toISOString(),
        items,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load summary";
    const isAuthError =
      message === "Unauthorized" ||
      message === "Authentication required" ||
      message.toLowerCase().includes("auth");

    console.error("GET /api/periodic-notes/summary error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: isAuthError ? "UNAUTHORIZED" : "SERVER_ERROR",
          message,
        },
      },
      { status: isAuthError ? 401 : 500 }
    );
  }
}
