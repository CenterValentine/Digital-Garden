export type PeoplePolicyNodeKind = "content" | "person" | "peopleGroup";

export type PeopleAssignment =
  | { kind: "person"; personId: string }
  | { kind: "peopleGroup"; groupId: string }
  | { kind: "none" };

export type PeopleMountTarget = Exclude<PeopleAssignment, { kind: "none" }>;

export type PeopleMountConflict = {
  mountId: string;
  target: PeopleMountTarget;
  contentParentId: string | null;
  reason:
    | "same-target-mounted"
    | "descendant-person-mounted"
    | "descendant-group-mounted"
    | "ancestor-group-mounted";
};

export type PeoplePolicyDecision =
  | { ok: true; action: "allow" }
  | { ok: true; action: "require-confirmation"; reason: string; conflicts: PeopleMountConflict[] }
  | { ok: false; action: "deny"; reason: string; conflicts?: PeopleMountConflict[] };

export type EvaluatePeopleMountInput = {
  target: PeopleMountTarget;
  existingTargetMount?: PeopleMountConflict;
  conflictingMounts?: PeopleMountConflict[];
  allowRemount?: boolean;
};

export type EvaluatePeopleControlledMoveInput = {
  sourceAssignment: PeopleAssignment;
  targetAssignment: PeopleAssignment;
  leavingPeopleAreaConfirmed?: boolean;
};

export function isPeopleAssigned(assignment: PeopleAssignment): boolean {
  return assignment.kind !== "none";
}

export function isSamePeopleAssignment(
  left: PeopleAssignment,
  right: PeopleAssignment
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "none") return true;
  if (left.kind === "person") return left.personId === (right as Extract<PeopleAssignment, { kind: "person" }>).personId;
  return left.groupId === (right as Extract<PeopleAssignment, { kind: "peopleGroup" }>).groupId;
}

export function evaluatePeopleMount(input: EvaluatePeopleMountInput): PeoplePolicyDecision {
  const conflicts = [
    ...(input.existingTargetMount ? [input.existingTargetMount] : []),
    ...(input.conflictingMounts ?? []),
  ];

  if (conflicts.length === 0) {
    return { ok: true, action: "allow" };
  }

  if (!input.allowRemount) {
    return {
      ok: true,
      action: "require-confirmation",
      reason: "This group overlaps with people or groups already represented in the file tree.",
      conflicts,
    };
  }

  return { ok: true, action: "allow" };
}

export function evaluatePeopleControlledMove(
  input: EvaluatePeopleControlledMoveInput
): PeoplePolicyDecision {
  const { sourceAssignment, targetAssignment } = input;

  if (!isPeopleAssigned(sourceAssignment)) {
    return { ok: true, action: "allow" };
  }

  if (isPeopleAssigned(targetAssignment)) {
    return { ok: true, action: "allow" };
  }

  if (!input.leavingPeopleAreaConfirmed) {
    return {
      ok: true,
      action: "require-confirmation",
      reason: "Moving this item outside the People area will detach its People assignment.",
      conflicts: [],
    };
  }

  return { ok: true, action: "allow" };
}

export function assertExclusivePeopleAssignment(input: {
  peopleGroupId?: string | null;
  personId?: string | null;
}): void {
  if (input.peopleGroupId && input.personId) {
    throw new Error("Content cannot be assigned to both a person and a People group.");
  }
}

export function assertSingleMountTarget(input: {
  groupId?: string | null;
  personId?: string | null;
}): void {
  const hasGroup = Boolean(input.groupId);
  const hasPerson = Boolean(input.personId);

  if (hasGroup === hasPerson) {
    throw new Error("A People file-tree mount must target exactly one person or group.");
  }
}
