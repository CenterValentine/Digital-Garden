import type { PeopleMountTarget } from "@/lib/domain/people";

export interface PeopleMountRequestBody {
  target?: {
    kind?: string;
    groupId?: string;
    personId?: string;
  };
  contentParentId?: string | null;
  displayOrder?: number;
  allowRemount?: boolean;
}

export function parsePeopleMountTarget(body: PeopleMountRequestBody): PeopleMountTarget | null {
  const target = body.target;
  if (!target) return null;

  if (target.kind === "peopleGroup" && target.groupId) {
    return {
      kind: "peopleGroup",
      groupId: target.groupId,
    };
  }

  if (target.kind === "person" && target.personId) {
    return {
      kind: "person",
      personId: target.personId,
    };
  }

  return null;
}

export function parsePeopleMountParentId(body: PeopleMountRequestBody): string | null {
  const contentParentId = body.contentParentId ?? null;

  if (
    contentParentId?.startsWith("peopleGroup:") ||
    contentParentId?.startsWith("person:")
  ) {
    throw new Error(
      "Contacts and groups can only be placed at the root or inside real folders. They cannot be nested directly under another contact or group card."
    );
  }

  return contentParentId;
}
