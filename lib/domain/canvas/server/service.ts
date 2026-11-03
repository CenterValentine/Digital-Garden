/**
 * Canvas archive — the operations the routes expose (server-only).
 *
 *   listCourses   your Canvas courses (past and current), marked when imported
 *   importCourse  first import from the API (or a full re-run of one)
 *   importCartridge  the same from an uploaded .imscc
 *   checkCourse   "Check for changes": per-module counts + the conflicts (§9.1)
 *   reimportCourse  re-import the modules the user ticked, conflicts settled (§9.2)
 *   provenance    what the Canvas sidebar tab shows for one node
 *   linkedContentIds  which nodes the Canvas tab can claim
 */

import "server-only";
import { prisma } from "@/lib/database/client";
import { parseCartridge } from "../cartridge";
import {
  COURSE_LINK_KEY,
  REPORT_LINK_KEY,
  moduleLinkKey,
  planCourse,
  summarizeChanges,
  type ExistingLink,
  type ModuleChangeSummary,
  type PlanScope,
} from "../plan";
import {
  CANVAS_CARTRIDGE_SIZE_LIMIT,
  type CanvasImportSummary,
  type CanvasProgressEvent,
  type ConflictResolution,
} from "../types";
import { createApiSource } from "./api-source";
import { applyCoursePlan } from "./apply";
import { createCartridgeSource } from "./cartridge-source";
import { apiForConnection, ensureCartridgeConnection, listApiConnections, type ResolvedConnection } from "./connection";
import { CanvasError } from "./http";
import type { CanvasSource } from "./source";
import { noteHash, urlHash } from "./write";

type Emit = (event: CanvasProgressEvent) => void;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** A folder holds the course; any other item makes it a sibling; missing → top of the tree. */
async function resolveFolderTarget(ownerId: string, parentId: string | null | undefined): Promise<string | null> {
  let candidate = parentId ?? null;
  for (let hop = 0; candidate && hop < 3; hop++) {
    const node: { id: string; contentType: string; parentId: string | null } | null = await prisma.contentNode.findFirst({
      where: { id: candidate, ownerId, deletedAt: null },
      select: { id: true, contentType: true, parentId: true },
    });
    if (!node) return null;
    if (node.contentType === "folder") return node.id;
    candidate = node.parentId;
  }
  return null;
}

async function loadExisting(connectionId: string, courseId: string): Promise<ExistingLink[]> {
  const links = await prisma.canvasSyncLink.findMany({
    where: { connectionId, courseId },
    include: {
      content: {
        select: {
          title: true,
          deletedAt: true,
          notePayload: { select: { tiptapJson: true } },
          filePayload: { select: { checksum: true } },
          externalPayload: { select: { url: true } },
        },
      },
    },
  });
  return links.map((link) => {
    const content = link.content;
    const currentHash = content?.notePayload
      ? noteHash(content.notePayload.tiptapJson)
      : content?.filePayload
        ? content.filePayload.checksum
        : content?.externalPayload
          ? urlHash(content.externalPayload.url)
          : null;
    return {
      linkKey: link.canvasKey,
      canvasType: link.canvasType,
      contentId: link.contentId,
      moduleId: link.moduleId,
      remoteVersion: link.remoteVersion,
      importedHash: link.importedHash,
      status: link.status,
      nodeTitle: content?.title ?? null,
      inTrash: Boolean(content?.deletedAt),
      currentHash,
    };
  });
}

async function readStoredFile(ownerId: string, contentId: string): Promise<Uint8Array> {
  const node = await prisma.contentNode.findFirst({
    where: { id: contentId, ownerId, contentType: "file" },
    select: { filePayload: { select: { storageKey: true, storageProvider: true, fileSize: true, fileName: true } } },
  });
  const file = node?.filePayload;
  if (!file) throw new CanvasError("The uploaded course export couldn't be found", 404);
  if (Number(file.fileSize) > CANVAS_CARTRIDGE_SIZE_LIMIT) {
    throw new CanvasError(
      `${file.fileName} is ${Math.round(Number(file.fileSize) / 1024 / 1024)} MB. Course exports over ${CANVAS_CARTRIDGE_SIZE_LIMIT / 1024 / 1024} MB can't be imported here.`,
      413
    );
  }
  const { getUserStorageProvider } = await import("@/lib/infrastructure/storage");
  const storage = await getUserStorageProvider(ownerId, file.storageProvider as "r2" | "s3" | "vercel");
  const stream = await storage.getFileStream(file.storageKey);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

/** The course a node belongs to (via its link), or a clear error. */
async function courseOf(ownerId: string, courseRootId: string) {
  const link = await prisma.canvasSyncLink.findUnique({
    where: { contentId: courseRootId },
    include: { connection: true },
  });
  if (!link || link.connection.ownerId !== ownerId || link.canvasType !== "course") {
    throw new CanvasError("That folder isn't an imported Canvas course", 404);
  }
  return link;
}

async function sourceFor(
  ownerId: string,
  connectionId: string,
  kind: string,
  courseId: string,
  cartridgeContentId: string | null | undefined
): Promise<{ source: CanvasSource; connection: ResolvedConnection }> {
  if (kind === "api") {
    const { api, connection } = await apiForConnection(ownerId, connectionId);
    return { source: createApiSource(api, courseId), connection };
  }
  if (!cartridgeContentId) {
    throw new CanvasError("This course came from a course export. Upload a newer export (.imscc) to check it for changes.", 409);
  }
  const parsed = await parseCartridge(await readStoredFile(ownerId, cartridgeContentId));
  if (parsed.snapshot.courseId !== courseId) {
    throw new CanvasError(`That export is a different course ("${parsed.snapshot.name}").`, 422);
  }
  return { source: createCartridgeSource(parsed), connection: await ensureCartridgeConnection(ownerId) };
}

interface RunInput {
  ownerId: string;
  connection: ResolvedConnection;
  source: CanvasSource;
  parentId: string | null | undefined;
  kind: "import" | "re-import";
  scope: PlanScope;
  resolutions?: Record<string, ConflictResolution>;
  emit: Emit;
}

async function run(input: RunInput): Promise<CanvasImportSummary> {
  input.emit({ type: "progress", phase: "snapshot", done: 0, total: 1, message: "Reading the course" });
  const snapshot = await input.source.snapshot();
  let existing = await loadExisting(input.connection.id, snapshot.courseId);
  const courseLink = existing.find((link) => link.linkKey === COURSE_LINK_KEY);
  if (input.kind === "import" && courseLink && (courseLink.contentId === null || courseLink.inTrash)) {
    // The course folder itself was deleted: importing again starts fresh.
    await prisma.canvasSyncLink.deleteMany({ where: { connectionId: input.connection.id, courseId: snapshot.courseId } });
    existing = [];
  }
  const plan = planCourse({ snapshot, existing, scope: input.scope, resolutions: input.resolutions });
  const report = existing.find((link) => link.linkKey === REPORT_LINK_KEY && link.contentId && !link.inTrash);
  const summary = await applyCoursePlan({
    ownerId: input.ownerId,
    connectionId: input.connection.id,
    source: input.source,
    snapshot,
    plan,
    targetParentId: await resolveFolderTarget(input.ownerId, input.parentId),
    reportContentId: report?.contentId ?? null,
    kind: input.kind,
    emit: input.emit,
  });
  await prisma.canvasConnection.update({ where: { id: input.connection.id }, data: { lastUsedAt: new Date() } });
  return summary;
}

// ── Operations ───────────────────────────────────────────────────────────────

export interface CanvasCourseDto {
  id: string;
  name: string;
  courseCode: string | null;
  term: string | null;
  state: "completed" | "active";
  imported: { contentId: string; title: string } | null;
}

interface ApiCourseListing {
  id: number;
  name?: string;
  course_code?: string;
  term?: { name?: string | null } | null;
  access_restricted_by_date?: boolean;
}

export async function listCourses(ownerId: string, connectionId?: string | null) {
  const connections = await listApiConnections(ownerId);
  const chosen = connectionId ? connections.find((connection) => connection.id === connectionId) : connections.find((connection) => connection.connected);
  if (!chosen) throw new CanvasError("Connect to Canvas first", 409);
  const { api } = await apiForConnection(ownerId, chosen.id);
  const params = { "include[]": ["term"] };
  const [completed, active] = await Promise.all([
    api.getAll<ApiCourseListing>("/api/v1/courses", { ...params, enrollment_state: "completed" }, "your past courses"),
    api.getAll<ApiCourseListing>("/api/v1/courses", { ...params, enrollment_state: "active" }, "your current courses"),
  ]);
  const seen = new Set<string>();
  const courses: CanvasCourseDto[] = [];
  for (const [list, state] of [[completed, "completed"], [active, "active"]] as const) {
    for (const course of list) {
      const id = String(course.id);
      // Hidden concluded courses come back as stubs without a name.
      if (seen.has(id) || course.access_restricted_by_date || !course.name) continue;
      seen.add(id);
      courses.push({ id, name: course.name, courseCode: course.course_code ?? null, term: course.term?.name ?? null, state, imported: null });
    }
  }
  const links = await prisma.canvasSyncLink.findMany({
    where: { connectionId: chosen.id, canvasKey: COURSE_LINK_KEY, courseId: { in: courses.map((course) => course.id) }, contentId: { not: null } },
    select: { courseId: true, contentId: true, content: { select: { title: true, deletedAt: true } } },
  });
  for (const link of links) {
    if (!link.content || link.content.deletedAt) continue;
    const course = courses.find((candidate) => candidate.id === link.courseId);
    if (course) course.imported = { contentId: link.contentId as string, title: link.content.title };
  }
  return { connection: chosen, courses };
}

export async function importCourse(input: {
  ownerId: string;
  connectionId: string;
  courseId: string;
  parentId: string | null;
  emit: Emit;
}): Promise<CanvasImportSummary> {
  const { api, connection } = await apiForConnection(input.ownerId, input.connectionId);
  return run({
    ownerId: input.ownerId,
    connection,
    source: createApiSource(api, input.courseId),
    parentId: input.parentId,
    kind: "import",
    scope: { modules: "all", course: true },
    emit: input.emit,
  });
}

export async function importCartridge(input: {
  ownerId: string;
  fileContentId: string;
  parentId: string | null;
  emit: Emit;
}): Promise<CanvasImportSummary> {
  input.emit({ type: "progress", phase: "snapshot", done: 0, total: 1, message: "Unpacking the export" });
  const parsed = await parseCartridge(await readStoredFile(input.ownerId, input.fileContentId));
  const summary = await run({
    ownerId: input.ownerId,
    connection: await ensureCartridgeConnection(input.ownerId),
    source: createCartridgeSource(parsed),
    parentId: input.parentId,
    kind: "import",
    scope: { modules: "all", course: true },
    emit: input.emit,
  });
  await trashStagedUpload(input.ownerId, input.fileContentId);
  return summary;
}

/** The uploaded .imscc was only a vehicle; once imported it goes to the trash (recoverable). */
async function trashStagedUpload(ownerId: string, contentId: string) {
  await prisma.contentNode.updateMany({
    where: { id: contentId, ownerId, deletedAt: null, canvasSyncLink: { is: null } },
    data: { deletedAt: new Date(), deletedBy: ownerId },
  });
}

export interface CourseChangeReport {
  courseRootId: string;
  courseTitle: string;
  sourceKind: "api" | "cartridge";
  modules: ModuleChangeSummary[];
  course: ReturnType<typeof summarizeChanges>["course"];
  conflicts: Array<{ linkKey: string; title: string; contentId: string; moduleId: string | null; kind: string }>;
  unchanged: boolean;
}

export async function checkCourse(input: {
  ownerId: string;
  courseRootId: string;
  cartridgeContentId?: string | null;
}): Promise<CourseChangeReport> {
  const link = await courseOf(input.ownerId, input.courseRootId);
  const { source } = await sourceFor(input.ownerId, link.connectionId, link.connection.kind, link.courseId, input.cartridgeContentId);
  const snapshot = await source.snapshot();
  const existing = await loadExisting(link.connectionId, link.courseId);
  const plan = planCourse({ snapshot, existing, scope: { modules: "all", course: true } });
  const summary = summarizeChanges(plan, existing);
  const conflicts = plan.conflicts.map((node) => ({
    linkKey: node.linkKey,
    title: node.title,
    contentId: node.contentId as string,
    moduleId: node.moduleId,
    kind: node.kind,
  }));
  const changedModules = summary.modules.filter(
    (courseModule) => courseModule.created || courseModule.replaced || courseModule.conflicts || courseModule.removed || courseModule.moduleRemoved
  );
  const course = await prisma.contentNode.findUnique({ where: { id: input.courseRootId }, select: { title: true } });
  return {
    courseRootId: input.courseRootId,
    courseTitle: course?.title ?? snapshot.name,
    sourceKind: link.connection.kind === "api" ? "api" : "cartridge",
    modules: changedModules,
    course: summary.course,
    conflicts,
    unchanged:
      !changedModules.length &&
      !summary.course.syllabusChanged &&
      !summary.course.syllabusConflict &&
      !summary.course.syllabusNew &&
      !summary.course.syllabusRemoved,
  };
}

export async function reimportCourse(input: {
  ownerId: string;
  courseRootId: string;
  moduleIds: string[];
  includeCourse: boolean;
  resolutions: Record<string, ConflictResolution>;
  cartridgeContentId?: string | null;
  emit: Emit;
}): Promise<CanvasImportSummary> {
  const link = await courseOf(input.ownerId, input.courseRootId);
  const { source, connection } = await sourceFor(
    input.ownerId,
    link.connectionId,
    link.connection.kind,
    link.courseId,
    input.cartridgeContentId
  );
  const summary = await run({
    ownerId: input.ownerId,
    connection,
    source,
    parentId: null,
    kind: "re-import",
    scope: { modules: input.moduleIds, course: input.includeCourse },
    resolutions: input.resolutions,
    emit: input.emit,
  });
  if (input.cartridgeContentId) await trashStagedUpload(input.ownerId, input.cartridgeContentId);
  return summary;
}

export interface CanvasProvenanceDto {
  contentId: string;
  canvasType: string;
  status: string;
  importedAt: string;
  sourceKind: "api" | "cartridge";
  sourceLabel: string;
  course: { rootId: string | null; title: string | null; htmlUrl: string | null };
  module: { id: string; title: string | null; contentId: string | null } | null;
  /** "Open in Canvas" for this node, when the source is a live Canvas. */
  htmlUrl: string | null;
  titleLocked: boolean;
}

export async function provenance(ownerId: string, contentId: string): Promise<CanvasProvenanceDto | null> {
  const link = await prisma.canvasSyncLink.findUnique({ where: { contentId }, include: { connection: true } });
  if (!link || link.connection.ownerId !== ownerId) return null;
  const isApi = link.connection.kind === "api";
  const base = isApi ? link.connection.baseUrl : null;
  const keys = [COURSE_LINK_KEY, ...(link.moduleId ? [moduleLinkKey(link.moduleId)] : [])];
  const related = await prisma.canvasSyncLink.findMany({
    where: { connectionId: link.connectionId, courseId: link.courseId, canvasKey: { in: keys } },
    select: { canvasKey: true, contentId: true, content: { select: { title: true } } },
  });
  const course = related.find((row) => row.canvasKey === COURSE_LINK_KEY);
  const courseModule = link.moduleId ? related.find((row) => row.canvasKey === moduleLinkKey(link.moduleId as string)) : undefined;
  const courseUrl = base ? `${base}/courses/${link.courseId}` : null;
  let htmlUrl: string | null = courseUrl;
  if (courseUrl && link.canvasKey.startsWith("item:")) htmlUrl = `${courseUrl}/modules/items/${link.canvasKey.slice(5)}`;
  else if (courseUrl && link.canvasType === "module" && link.moduleId) htmlUrl = `${courseUrl}/modules#module_${link.moduleId}`;
  else if (courseUrl && link.canvasType === "syllabus") htmlUrl = `${courseUrl}/assignments/syllabus`;
  return {
    contentId,
    canvasType: link.canvasType,
    status: link.status,
    importedAt: link.importedAt.toISOString(),
    sourceKind: isApi ? "api" : "cartridge",
    sourceLabel: isApi ? link.connection.baseUrl : "a course export (.imscc)",
    course: { rootId: course?.contentId ?? null, title: course?.content?.title ?? null, htmlUrl: courseUrl },
    module: link.moduleId
      ? { id: link.moduleId, title: courseModule?.content?.title ?? null, contentId: courseModule?.contentId ?? null }
      : null,
    htmlUrl,
    titleLocked: link.status === "linked" && link.canvasType !== "report",
  };
}

export async function linkedContentIds(ownerId: string): Promise<string[]> {
  const rows = await prisma.canvasSyncLink.findMany({
    where: { connection: { ownerId }, contentId: { not: null } },
    select: { contentId: true },
  });
  return rows.map((row) => row.contentId as string);
}
