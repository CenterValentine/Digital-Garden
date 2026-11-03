/**
 * Canvas archive — the planner (CANVAS-ARCHIVE-PLAN.md §6, §9).
 *
 * Pure: a snapshot plus the links an earlier import left behind → the list of
 * nodes to create, replace or leave alone, the conflicts to put in front of
 * the user, and what Canvas no longer has. Nothing here writes; the server
 * applies the plan once the user has settled every conflict, so a re-import
 * is "plan, then apply" in one pass.
 *
 * Pinned by `pnpm canvas:check` (scripts/validate-canvas.ts).
 */

import {
  nodeKindForItem,
  courseFolderTitle,
  type CanvasLinkType,
  type CanvasNodeKind,
  type ConflictResolution,
  type CourseSnapshot,
  type SnapshotItem,
} from "./types";

/** What an earlier import left: one row per CanvasSyncLink, joined to its node. */
export interface ExistingLink {
  linkKey: string;
  canvasType: string;
  /** Null once the node was purged from the trash. */
  contentId: string | null;
  moduleId: string | null;
  remoteVersion: string | null;
  importedHash: string | null;
  status: string;
  nodeTitle: string | null;
  /** The node sits in the trash. */
  inTrash: boolean;
  /** The node's content fingerprint now (notes), checksum (files) or url (links). */
  currentHash: string | null;
}

export interface PlanScope {
  /** Module ids to (re)import, or every courseModule. */
  modules: "all" | string[];
  /** The course folder's own children outside modules: the syllabus. */
  course: boolean;
}

export interface PlanInput {
  snapshot: CourseSnapshot;
  existing: ExistingLink[];
  scope: PlanScope;
  /** The user's answers for conflicts, by link key. Unanswered → skip. */
  resolutions?: Record<string, ConflictResolution>;
}

export type PlanAction =
  /** Nothing imported yet: create it. */
  | "create"
  /** Canvas changed it and the user hasn't touched our copy: overwrite. */
  | "replace"
  /** Same version as last time. */
  | "unchanged"
  /** Canvas changed it AND the user edited our copy: the user decides. */
  | "conflict"
  /** The user deleted our copy: never recreate it. */
  | "dismissed";

export interface PlannedNode {
  linkKey: string;
  linkType: CanvasLinkType;
  kind: CanvasNodeKind;
  title: string;
  /** Null = the course folder's parent (the folder the import targets). */
  parentLinkKey: string | null;
  moduleId: string | null;
  /** Position among its siblings, in Canvas order. */
  position: number;
  item: SnapshotItem | null;
  action: PlanAction;
  /** The existing node, when there is one. */
  contentId: string | null;
  /** Canvas renamed it: the title follows (titles belong to Canvas). */
  retitle: boolean;
  version: string | null;
  /** Conflicts only: what the user chose (default skip). */
  resolution?: ConflictResolution;
  /**
   * Out-of-scope nodes are planned (so links INTO them still resolve to
   * wiki-links) but never written.
   */
  inScope: boolean;
}

export interface RemovedUpstream {
  linkKey: string;
  contentId: string;
  title: string | null;
  moduleId: string | null;
}

export interface CoursePlan {
  /** Parents before children; siblings in Canvas order. */
  nodes: PlannedNode[];
  conflicts: PlannedNode[];
  removedUpstream: RemovedUpstream[];
}

export const COURSE_LINK_KEY = "course";
export const SYLLABUS_LINK_KEY = "syllabus";
export const REPORT_LINK_KEY = "report";

export function moduleLinkKey(moduleId: string): string {
  return `module:${moduleId}`;
}

export function itemLinkKey(itemKey: string): string {
  return `item:${itemKey}`;
}

function isDismissed(link: ExistingLink | undefined): boolean {
  return Boolean(link && (link.contentId === null || link.inTrash));
}

/** The rule for one leaf (§9.3). Containers never conflict. */
function leafAction(link: ExistingLink | undefined, version: string | null): PlanAction {
  if (!link) return "create";
  if (isDismissed(link)) return "dismissed";
  // A version we can't read (null) never reports a change.
  if (version === null || version === link.remoteVersion) return "unchanged";
  // No recorded hash (an older import) means we can't prove the copy is
  // untouched, so the user decides.
  if (link.importedHash !== null && link.currentHash === link.importedHash) return "replace";
  return "conflict";
}

export function planCourse(input: PlanInput): CoursePlan {
  const { snapshot, scope } = input;
  const byKey = new Map(input.existing.map((link) => [link.linkKey, link]));
  const nodes: PlannedNode[] = [];
  const seen = new Set<string>();
  const dismissedContainers = new Set<string>();

  const inScope = (moduleId: string) => scope.modules === "all" || scope.modules.includes(moduleId);

  function push(
    node: Omit<PlannedNode, "action" | "contentId" | "retitle" | "resolution"> & { leaf: boolean }
  ): PlannedNode {
    const link = byKey.get(node.linkKey);
    seen.add(node.linkKey);
    let action: PlanAction;
    if (node.parentLinkKey && dismissedContainers.has(node.parentLinkKey)) {
      action = "dismissed";
    } else if (node.leaf) {
      action = leafAction(link, node.version);
    } else {
      action = !link ? "create" : isDismissed(link) ? "dismissed" : "unchanged";
    }
    if (!node.leaf && action === "dismissed") dismissedContainers.add(node.linkKey);
    const contentId = link && !isDismissed(link) ? link.contentId : null;
    const planned: PlannedNode = {
      linkKey: node.linkKey,
      linkType: node.linkType,
      kind: node.kind,
      title: node.title,
      parentLinkKey: node.parentLinkKey,
      moduleId: node.moduleId,
      position: node.position,
      item: node.item,
      version: node.version,
      inScope: node.inScope,
      action,
      contentId,
      retitle: Boolean(contentId && link?.nodeTitle !== null && link?.nodeTitle !== node.title),
    };
    if (action === "conflict") {
      planned.resolution = input.resolutions?.[node.linkKey] ?? "skip";
    }
    nodes.push(planned);
    return planned;
  }

  push({
    linkKey: COURSE_LINK_KEY,
    linkType: "course",
    kind: "folder",
    title: courseFolderTitle(snapshot),
    parentLinkKey: null,
    moduleId: null,
    position: 0,
    item: null,
    version: null,
    inScope: true,
    leaf: false,
  });

  let coursePosition = 0;
  if (snapshot.syllabus) {
    push({
      linkKey: SYLLABUS_LINK_KEY,
      linkType: "syllabus",
      kind: "note",
      title: "Syllabus",
      parentLinkKey: COURSE_LINK_KEY,
      moduleId: null,
      position: coursePosition,
      item: null,
      version: snapshot.syllabus.version,
      inScope: scope.course,
      leaf: true,
    });
  }
  coursePosition += 1;

  for (const courseModule of snapshot.modules) {
    const modulePosition = coursePosition++;
    const moduleInScope = inScope(courseModule.id);
    const moduleKey = moduleLinkKey(courseModule.id);
    push({
      linkKey: moduleKey,
      linkType: "module",
      kind: "folder",
      title: courseModule.title,
      parentLinkKey: COURSE_LINK_KEY,
      moduleId: courseModule.id,
      position: modulePosition,
      item: null,
      version: null,
      inScope: moduleInScope,
      leaf: false,
    });

    // A SubHeader groups the items below it, up to the next SubHeader, into
    // a folder of its own (§13.1, owner default 2026-11-02).
    let parent = moduleKey;
    let position = 0;
    let subPosition = 0;
    for (const item of courseModule.items) {
      if (item.type === "subheader") {
        const key = itemLinkKey(item.key);
        push({
          linkKey: key,
          linkType: "subheader",
          kind: "folder",
          title: item.title,
          parentLinkKey: moduleKey,
          moduleId: courseModule.id,
          position: position++,
          item,
          version: null,
          inScope: moduleInScope,
          leaf: false,
        });
        parent = key;
        subPosition = 0;
        continue;
      }
      const inSub = parent !== moduleKey;
      push({
        linkKey: itemLinkKey(item.key),
        linkType: item.type,
        kind: nodeKindForItem(item.type),
        title: item.title,
        parentLinkKey: parent,
        moduleId: courseModule.id,
        position: inSub ? subPosition++ : position++,
        item,
        version: item.version,
        inScope: moduleInScope,
        leaf: true,
      });
    }
  }

  // What Canvas no longer has, within scope. A removed module's id can be in
  // scope even though the snapshot doesn't list it.
  const removedUpstream: RemovedUpstream[] = [];
  for (const link of input.existing) {
    if (seen.has(link.linkKey) || link.linkKey === REPORT_LINK_KEY) continue;
    if (link.status !== "linked" || isDismissed(link) || !link.contentId) continue;
    const scoped =
      link.linkKey === SYLLABUS_LINK_KEY
        ? scope.course
        : link.moduleId !== null && inScope(link.moduleId);
    if (!scoped) continue;
    removedUpstream.push({
      linkKey: link.linkKey,
      contentId: link.contentId,
      title: link.nodeTitle,
      moduleId: link.moduleId,
    });
  }

  return {
    nodes,
    conflicts: nodes.filter((node) => node.inScope && node.action === "conflict"),
    removedUpstream,
  };
}

/** Per-module change counts for the sidebar's "Check for changes" list (§9.1). */
export interface ModuleChangeSummary {
  moduleId: string;
  title: string;
  created: number;
  replaced: number;
  conflicts: number;
  removed: number;
  /** The module itself is gone from Canvas. */
  moduleRemoved: boolean;
}

export function summarizeChanges(plan: CoursePlan, existing: ExistingLink[]): {
  modules: ModuleChangeSummary[];
  course: { syllabusChanged: boolean; syllabusConflict: boolean; syllabusNew: boolean; syllabusRemoved: boolean };
} {
  const modules = new Map<string, ModuleChangeSummary>();
  const ensure = (moduleId: string, title: string): ModuleChangeSummary => {
    let summary = modules.get(moduleId);
    if (!summary) {
      summary = { moduleId, title, created: 0, replaced: 0, conflicts: 0, removed: 0, moduleRemoved: false };
      modules.set(moduleId, summary);
    }
    return summary;
  };
  for (const node of plan.nodes) {
    if (node.linkType === "module" && node.moduleId) ensure(node.moduleId, node.title);
  }
  for (const node of plan.nodes) {
    if (!node.moduleId || node.linkType === "module") continue;
    const summary = ensure(node.moduleId, node.moduleId);
    if (node.action === "create") summary.created += 1;
    if (node.action === "replace") summary.replaced += 1;
    if (node.action === "conflict") summary.conflicts += 1;
  }
  const titleOfModule = new Map(
    existing
      .filter((link) => link.canvasType === "module" && link.moduleId)
      .map((link) => [link.moduleId as string, link.nodeTitle ?? "Removed module"])
  );
  for (const removed of plan.removedUpstream) {
    if (!removed.moduleId) continue;
    const summary = ensure(removed.moduleId, titleOfModule.get(removed.moduleId) ?? "Removed module");
    if (removed.linkKey === moduleLinkKey(removed.moduleId)) summary.moduleRemoved = true;
    else summary.removed += 1;
  }
  const syllabus = plan.nodes.find((node) => node.linkKey === SYLLABUS_LINK_KEY);
  return {
    modules: [...modules.values()],
    course: {
      syllabusChanged: syllabus?.action === "replace",
      syllabusConflict: syllabus?.action === "conflict",
      syllabusNew: syllabus?.action === "create",
      syllabusRemoved: plan.removedUpstream.some((removed) => removed.linkKey === SYLLABUS_LINK_KEY),
    },
  };
}
