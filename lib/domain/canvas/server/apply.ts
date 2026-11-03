/**
 * Canvas archive — applying a plan (server-only, §6, §9).
 *
 * Every node the plan creates gets its id BEFORE anything is written, so the
 * map of "Canvas reference → imported node" is complete up front and each
 * note is converted once, with its links already pointing at the archive.
 *
 * Order matters:
 *   1. folders (course, modules, SubHeaders), parents before children;
 *   2. files and links, so a failed download is known before any note links
 *      to it (a failed node is taken out of the link map);
 *   3. notes: fetch HTML, store its Canvas images, rewrite links, convert;
 *   4. upstream removals, ordering (the user's notes stay where they put
 *      them — order.ts), and the import report.
 *
 * A single item that fails never fails the import: it becomes a line in the
 * report, so what wasn't captured is visible instead of silent.
 */

import "server-only";
import crypto from "node:crypto";
import type { JSONContent } from "@tiptap/core";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { writeNoteContent } from "@/lib/domain/content/write-note-content";
import { invalidateCachedContent } from "@/lib/domain/content/content-cache";
import { syncImageReferences } from "@/lib/domain/content/image-refs";
import { composeReportHtml, composeSyllabusHtml, type CourseAttribution } from "../compose";
import { listImageSources, rewriteCanvasHtml, type RefTarget } from "../html";
import { mergeOrder } from "../order";
import { COURSE_LINK_KEY, REPORT_LINK_KEY, type CoursePlan, type PlannedNode } from "../plan";
import type { CanvasImportSummary, CanvasProgressEvent, CourseSnapshot } from "../types";
import { CanvasFileTooLarge, type CanvasSource, type FileBody } from "./source";
import { htmlToNoteJson, noteHash, noteSearchAndMetadata, replaceFileBody, storeFileBody, uniqueSlug, urlHash } from "./write";

export interface ApplyInput {
  ownerId: string;
  connectionId: string;
  source: CanvasSource;
  snapshot: CourseSnapshot;
  plan: CoursePlan;
  /** Where a NEW course folder goes (null = top of the tree). */
  targetParentId: string | null;
  /** The import report node from an earlier run, if any. */
  reportContentId: string | null;
  kind: "import" | "re-import";
  emit: (event: CanvasProgressEvent) => void;
}

type Counts = CanvasImportSummary["counts"];

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function monthYear(date: Date): string {
  return date.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

export async function applyCoursePlan(input: ApplyInput): Promise<CanvasImportSummary> {
  const { ownerId, connectionId, source, snapshot, plan, emit } = input;
  const counts: Counts = {
    created: 0,
    replaced: 0,
    unchanged: 0,
    conflictsSkipped: 0,
    siblingsAdded: 0,
    removedUpstream: 0,
    dismissed: 0,
    failed: 0,
  };
  const problems: string[] = [];
  const attribution: CourseAttribution = {
    courseTitle: plan.nodes[0]?.title ?? snapshot.name,
    teachers: snapshot.teachers,
    term: snapshot.term,
    sourceLabel: source.sourceLabel,
    htmlUrl: snapshot.htmlUrl,
  };

  // ── 1. Ids up front ────────────────────────────────────────────────────────
  // A node will exist after this run if it exists now, or the plan creates it
  // in scope. Only those may be link targets.
  const ids = new Map<string, string>();
  for (const node of plan.nodes) {
    if (node.action === "dismissed") continue;
    if (node.contentId) ids.set(node.linkKey, node.contentId);
    else if (node.inScope && node.action === "create") ids.set(node.linkKey, crypto.randomUUID());
  }
  const refTargets = new Map<string, RefTarget>();
  const fileNodeIds = new Set<string>();
  for (const node of plan.nodes) {
    const id = ids.get(node.linkKey);
    if (!id || !node.item) continue;
    const target = { contentId: id, title: node.title };
    if (node.item.refKey && !refTargets.has(node.item.refKey)) refTargets.set(node.item.refKey, target);
    refTargets.set(`item:${node.item.key}`, target);
    if (node.kind === "file") fileNodeIds.add(id);
  }
  function dropTarget(contentId: string) {
    for (const [key, target] of refTargets) if (target.contentId === contentId) refTargets.delete(key);
    fileNodeIds.delete(contentId);
  }

  const created = new Set<string>();
  /** original node id → sibling copies added after it (§9.4). */
  const siblingsAfter = new Map<string, string[]>();

  function linkData(node: PlannedNode, importedHash: string | null): Prisma.CanvasSyncLinkCreateWithoutContentInput {
    return {
      connection: { connect: { id: connectionId } },
      courseId: snapshot.courseId,
      canvasType: node.linkType,
      canvasKey: node.linkKey,
      moduleId: node.moduleId,
      remoteVersion: node.version,
      importedHash,
      status: "linked",
    };
  }

  function parentIdOf(node: PlannedNode): string | null {
    return node.parentLinkKey ? ids.get(node.parentLinkKey) ?? null : input.targetParentId;
  }

  async function retitle(node: PlannedNode) {
    if (!node.retitle || !node.contentId) return;
    await prisma.contentNode.update({
      where: { id: node.contentId },
      data: { title: node.title, slug: await uniqueSlug(node.title, ownerId, node.contentId) },
    });
    invalidateCachedContent(node.contentId);
  }

  // ── 2. Folders ────────────────────────────────────────────────────────────
  const folders = plan.nodes.filter((node) => node.kind === "folder" && node.inScope);
  emit({ type: "progress", phase: "folders", done: 0, total: folders.length, message: "Creating folders" });
  for (const node of folders) {
    if (node.action === "dismissed") continue;
    if (node.action !== "create") {
      await retitle(node);
      continue;
    }
    const id = ids.get(node.linkKey) as string;
    await prisma.contentNode.create({
      data: {
        id,
        ownerId,
        title: node.title,
        slug: await uniqueSlug(node.title, ownerId),
        contentType: "folder",
        parentId: parentIdOf(node),
        displayOrder: node.position,
        customIcon: node.linkType === "course" ? "lucide:GraduationCap" : null,
        folderPayload: {
          create: { viewMode: "list", sortMode: null, viewPrefs: {}, includeReferencedContent: false },
        },
        canvasSyncLink: { create: linkData(node, null) },
      },
    });
    created.add(id);
  }
  const courseRootId = ids.get(COURSE_LINK_KEY);
  if (!courseRootId) throw new Error("The course folder is missing");

  // ── 3/4. Leaves: files and links first, then notes ────────────────────────
  const leaves = plan.nodes.filter((node) => node.kind !== "folder" && node.inScope);
  const ordered = [...leaves.filter((node) => node.kind !== "note"), ...leaves.filter((node) => node.kind === "note")];
  let done = 0;

  async function buildNote(node: PlannedNode, parentId: string | null): Promise<{ json: JSONContent; media: string[] }> {
    const media: string[] = [];
    const storeMedia = async (file: FileBody): Promise<RefTarget | null> => {
      const stored = await storeFileBody({ ownerId, parentId, file, role: "referenced", dedupe: true });
      media.push(stored.contentId);
      return { contentId: stored.contentId, title: stored.fileName };
    };
    let html: string;
    if (node.linkType === "syllabus") {
      html = composeSyllabusHtml(await source.syllabusHtml(), attribution);
    } else if (node.item) {
      html = await source.noteHtml(node.item, storeMedia);
    } else {
      html = "";
    }
    const images = new Map<string, string>();
    for (const src of listImageSources(html)) {
      const refKey = source.resolver.refKeyOf(src);
      const target = refKey ? refTargets.get(refKey) : undefined;
      if (target && fileNodeIds.has(target.contentId)) {
        images.set(src, target.contentId);
        continue;
      }
      if (!source.resolver.isInternal(src)) continue;
      const file = await source.fileForUrl(src);
      if (!file || !file.mimeType.startsWith("image/")) continue;
      const stored = await storeMedia(file);
      if (stored) images.set(src, stored.contentId);
    }
    const rewritten = rewriteCanvasHtml({ html, resolver: source.resolver, targets: refTargets, images });
    for (const src of rewritten.unresolvedImages) problems.push(`${node.title}: an image couldn't be captured (${src.slice(0, 120)})`);
    for (const embed of rewritten.droppedEmbeds) problems.push(`${node.title}: embedded content kept as a link only (${embed.slice(0, 120)})`);
    if (rewritten.unresolvedLinks.length) {
      problems.push(
        `${node.title}: ${rewritten.unresolvedLinks.length} link(s) to Canvas pages that weren't imported (kept as Canvas links)`
      );
    }
    return { json: htmlToNoteJson(rewritten.html), media };
  }

  async function adoptMedia(noteId: string, media: string[], json: JSONContent) {
    if (media.length) {
      await prisma.contentNode.updateMany({
        where: { id: { in: media }, ownerId, role: "referenced", ownedByNoteId: null },
        data: { ownedByNoteId: noteId },
      });
    }
    await syncImageReferences(noteId, json, ownerId);
  }

  async function createNote(node: PlannedNode, id: string, parentId: string | null, title: string, link: boolean) {
    const { json, media } = await buildNote(node, parentId);
    const { searchText, metadata } = noteSearchAndMetadata(json);
    await prisma.contentNode.create({
      data: {
        id,
        ownerId,
        title,
        slug: await uniqueSlug(title, ownerId),
        contentType: "note",
        parentId,
        displayOrder: node.position,
        notePayload: {
          create: {
            tiptapJson: json as unknown as Prisma.InputJsonValue,
            searchText,
            metadata: link
              ? metadata
              : ({ ...(metadata as Record<string, unknown>), canvasSnapshotOf: node.linkKey } as Prisma.InputJsonValue),
          },
        },
        ...(link ? { canvasSyncLink: { create: linkData(node, noteHash(json)) } } : {}),
      },
    });
    await adoptMedia(id, media, json);
  }

  async function createExternal(node: PlannedNode, id: string, parentId: string | null, title: string, url: string, link: boolean) {
    await prisma.contentNode.create({
      data: {
        id,
        ownerId,
        title,
        slug: await uniqueSlug(title, ownerId),
        contentType: "external",
        parentId,
        displayOrder: node.position,
        externalPayload: { create: { url, resourceType: `canvas-${node.linkType}` } },
        ...(link ? { canvasSyncLink: { create: linkData(node, urlHash(url)) } } : {}),
      },
    });
  }

  async function createFile(node: PlannedNode, id: string, parentId: string | null, title: string, link: boolean) {
    if (!node.item) throw new Error("No file to fetch");
    try {
      const file = await source.file(node.item);
      const checksum = crypto.createHash("sha256").update(file.body).digest("hex");
      await storeFileBody({ ownerId, parentId, file: { ...file, fileName: title }, id, ...(link ? { link: linkData(node, checksum) } : {}) });
    } catch (error) {
      if (!(error instanceof CanvasFileTooLarge) || !node.item.htmlUrl) throw error;
      // Too big to copy: keep a link to it in Canvas, and say so. It's no
      // longer a file, so no image may point at it.
      fileNodeIds.delete(id);
      await createExternal(node, id, parentId, title, node.item.htmlUrl, link);
      problems.push(`${title}: ${error.message}, kept as a link to Canvas`);
    }
  }

  async function createLeaf(node: PlannedNode, id: string, parentId: string | null, title: string, link: boolean) {
    if (node.kind === "note") return createNote(node, id, parentId, title, link);
    if (node.kind === "file") return createFile(node, id, parentId, title, link);
    const url = node.item?.externalUrl;
    if (!url) throw new Error("No address to link to");
    return createExternal(node, id, parentId, title, url, link);
  }

  async function replaceLeaf(node: PlannedNode, contentId: string) {
    let importedHash: string;
    if (node.kind === "note") {
      const current = await prisma.contentNode.findUnique({ where: { id: contentId }, select: { parentId: true } });
      const { json, media } = await buildNote(node, current?.parentId ?? null);
      await writeNoteContent({ contentId, ownerId, mode: "replace", content: json, destructiveApproved: true });
      const { searchText } = noteSearchAndMetadata(json);
      await prisma.notePayload.update({ where: { contentId }, data: { searchText } }).catch(() => undefined);
      await adoptMedia(contentId, media, json);
      importedHash = noteHash(json);
    } else if (node.kind === "file") {
      if (!node.item) throw new Error("No file to fetch");
      importedHash = await replaceFileBody(ownerId, contentId, await source.file(node.item));
    } else {
      const url = node.item?.externalUrl;
      if (!url) throw new Error("No address to link to");
      await prisma.externalPayload.update({ where: { contentId }, data: { url } });
      importedHash = urlHash(url);
    }
    await prisma.canvasSyncLink.update({
      where: { contentId },
      data: { remoteVersion: node.version, importedHash, status: "linked" },
    });
    // The content GET keeps a per-process cache; an open tab must see the new copy.
    invalidateCachedContent(contentId);
  }

  async function addSibling(node: PlannedNode, originalId: string) {
    const original = await prisma.contentNode.findUnique({ where: { id: originalId }, select: { parentId: true } });
    const id = crypto.randomUUID();
    const title = `${node.title} (Canvas, ${monthYear(new Date())})`.slice(0, 255);
    await createLeaf(node, id, original?.parentId ?? null, title, false);
    siblingsAfter.set(originalId, [...(siblingsAfter.get(originalId) ?? []), id]);
  }

  emit({ type: "progress", phase: "items", done: 0, total: ordered.length, message: "Importing items" });
  for (const node of ordered) {
    const id = ids.get(node.linkKey);
    try {
      switch (node.action) {
        case "dismissed":
          counts.dismissed += 1;
          break;
        case "unchanged":
          counts.unchanged += 1;
          await retitle(node);
          break;
        case "create":
          await createLeaf(node, id as string, parentIdOf(node), node.title, true);
          created.add(id as string);
          counts.created += 1;
          break;
        case "replace":
          await replaceLeaf(node, node.contentId as string);
          await retitle(node);
          counts.replaced += 1;
          break;
        case "conflict":
          if (node.resolution === "sibling") {
            await addSibling(node, node.contentId as string);
            counts.siblingsAdded += 1;
          } else {
            counts.conflictsSkipped += 1;
          }
          // Either way the user has now seen this Canvas version.
          await prisma.canvasSyncLink.update({
            where: { contentId: node.contentId as string },
            data: { remoteVersion: node.version },
          });
          await retitle(node);
          break;
      }
    } catch (error) {
      counts.failed += 1;
      problems.push(`${node.title}: ${messageOf(error)}`);
      if (node.action === "create" && id && !created.has(id)) {
        dropTarget(id);
        ids.delete(node.linkKey);
      }
    }
    done += 1;
    emit({ type: "progress", phase: "items", done, total: ordered.length, message: node.title });
  }

  // ── 5. What Canvas no longer has ──────────────────────────────────────────
  if (plan.removedUpstream.length) {
    await prisma.canvasSyncLink.updateMany({
      where: { contentId: { in: plan.removedUpstream.map((removed) => removed.contentId) } },
      data: { status: "removed_upstream" },
    });
    counts.removedUpstream = plan.removedUpstream.length;
  }

  // ── 6. The import report ──────────────────────────────────────────────────
  emit({ type: "progress", phase: "report", done: 0, total: 1, message: "Writing the import report" });
  const reportHtml = composeReportHtml({
    attribution,
    importedAt: new Date().toISOString(),
    kind: input.kind,
    counts,
    unmoduled: snapshot.unmoduled,
    problems,
  });
  const reportJson = htmlToNoteJson(reportHtml);
  let reportId = input.reportContentId;
  try {
    if (reportId) {
      await writeNoteContent({ contentId: reportId, ownerId, mode: "replace", content: reportJson, destructiveApproved: true });
      invalidateCachedContent(reportId);
      const { searchText } = noteSearchAndMetadata(reportJson);
      await prisma.notePayload.update({ where: { contentId: reportId }, data: { searchText } }).catch(() => undefined);
    } else {
      reportId = crypto.randomUUID();
      const { searchText, metadata } = noteSearchAndMetadata(reportJson);
      await prisma.contentNode.create({
        data: {
          id: reportId,
          ownerId,
          title: "Import report",
          slug: await uniqueSlug("Import report", ownerId),
          contentType: "note",
          parentId: courseRootId,
          displayOrder: 100_000,
          notePayload: { create: { tiptapJson: reportJson as unknown as Prisma.InputJsonValue, searchText, metadata } },
          canvasSyncLink: {
            create: {
              connection: { connect: { id: connectionId } },
              courseId: snapshot.courseId,
              canvasType: "report",
              canvasKey: REPORT_LINK_KEY,
              status: "linked",
            },
          },
        },
      });
    }
  } catch (error) {
    problems.push(`Import report: ${messageOf(error)}`);
  }

  // ── 7. Order: Canvas order, the user's notes where they put them ──────────
  emit({ type: "progress", phase: "order", done: 0, total: 1, message: "Ordering" });
  const containers = plan.nodes.filter(
    (node) => node.kind === "folder" && (node.inScope || node.linkKey === COURSE_LINK_KEY) && ids.has(node.linkKey)
  );
  for (const container of containers) {
    const containerId = ids.get(container.linkKey) as string;
    const children = await prisma.contentNode.findMany({
      where: { parentId: containerId, ownerId, deletedAt: null, role: "primary" },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, displayOrder: true },
    });
    const siblingIds = new Set([...siblingsAfter.values()].flat());
    const current: string[] = [];
    for (const child of children) {
      if (siblingIds.has(child.id)) continue;
      current.push(child.id, ...(siblingsAfter.get(child.id) ?? []));
    }
    const canvasOrder = plan.nodes
      .filter((node) => node.parentLinkKey === container.linkKey && node.action !== "dismissed")
      .sort((a, b) => a.position - b.position)
      .map((node) => ids.get(node.linkKey))
      .filter((id): id is string => Boolean(id) && current.includes(id as string));
    if (container.linkKey === COURSE_LINK_KEY && reportId && current.includes(reportId)) canvasOrder.push(reportId);
    const merged = mergeOrder(current, canvasOrder);
    const before = new Map(children.map((child) => [child.id, child.displayOrder]));
    const updates = merged
      .map((id, index) => ({ id, index }))
      .filter(({ id, index }) => before.get(id) !== index)
      .map(({ id, index }) => prisma.contentNode.update({ where: { id }, data: { displayOrder: index } }));
    if (updates.length) await prisma.$transaction(updates);
    for (const id of merged) if (before.get(id) !== merged.indexOf(id)) invalidateCachedContent(id);
  }

  return {
    type: "done",
    courseRootId,
    courseTitle: attribution.courseTitle,
    counts,
    problems,
  };
}
