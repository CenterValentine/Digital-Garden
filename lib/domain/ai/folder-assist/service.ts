/**
 * Folder Assistant — server service.
 *
 * One-shot AI agent (no chat tool-belt entry) that decides where to place
 * selected file-tree nodes from a natural-language description, then either
 * moves them directly or returns candidates to confirm.
 *
 * Reuses existing infra: feature-routing model resolution (mirrors
 * follow-ups), `generateObject` for a structured decision, and
 * `updateMaterializedPath` for tree consistency. "Working memory" + failure
 * recall live in `User.settings.ai.folderAssistant.recent` (a small ring
 * buffer) — deliberately NOT a Conversation, which would pollute the chat
 * sidebar.
 */

import { generateObject } from "ai";
import { z } from "zod/v4";
import { prisma } from "@/lib/database/client";
import { resolveChatModelFromConnection } from "@/lib/domain/ai/providers/registry";
import { resolvePrimaryRoute } from "@/lib/domain/ai/features/router";
import { getUserSettings, updateUserSettings } from "@/lib/features/settings";
import { updateMaterializedPath, generateUniqueSlug } from "@/lib/domain/content";
import { logger } from "@/lib/core/logger";
import type {
  FolderAssistResult,
  FolderCandidate,
  UndoPayload,
} from "./types";

const MEMORY_CAP = 12;
const MAX_FOLDERS_IN_PROMPT = 400;

interface MemoryEntry {
  prompt: string;
  status: "success" | "failed";
  targetFolderId?: string;
  targetPath?: string;
  at: number;
}

// ── settings / memory ────────────────────────────────────────────────────

export async function isFolderAssistantEnabled(userId: string): Promise<boolean> {
  const settings = await getUserSettings(userId);
  return settings.ai?.folderAssistant?.enabled !== false;
}

async function readMemory(userId: string): Promise<MemoryEntry[]> {
  const settings = await getUserSettings(userId);
  return (settings.ai?.folderAssistant?.recent as MemoryEntry[] | undefined) ?? [];
}

async function recordMemory(userId: string, entry: MemoryEntry): Promise<void> {
  try {
    const recent = [entry, ...(await readMemory(userId))].slice(0, MEMORY_CAP);
    await updateUserSettings(userId, {
      ai: { folderAssistant: { recent } },
    });
  } catch (err) {
    // Memory is best-effort — never fail the placement over it.
    logger.warn({
      layer: "ai",
      event: "folder_assist.memory.write_failed",
      summary: "could not persist folder-assist memory",
      error: err,
    });
  }
}

// ── folder index + paths ─────────────────────────────────────────────────

interface FolderRow {
  id: string;
  title: string;
  parentId: string | null;
}

async function loadFolderIndex(userId: string) {
  const folders = await prisma.contentNode.findMany({
    where: { ownerId: userId, contentType: "folder", deletedAt: null },
    select: { id: true, title: true, parentId: true },
    orderBy: { updatedAt: "desc" },
  });
  const byId = new Map<string, FolderRow>(folders.map((f) => [f.id, f]));

  /** Full display path of a folder id (includes the folder's own name). */
  const pathOfFolder = (id: string): string => {
    const parts: string[] = [];
    let cur: FolderRow | undefined = byId.get(id);
    let guard = 0;
    while (cur && guard++ < 64) {
      parts.unshift(cur.title);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return parts.join(" / ");
  };

  /** Display path of a node's PARENT chain (for "currently in"). */
  const pathOfParent = (parentId: string | null): string =>
    parentId ? pathOfFolder(parentId) || "Root" : "Root";

  return { folders, byId, pathOfFolder, pathOfParent };
}

/** True if `folderId` is the same as, or a descendant of, `nodeId`. */
function isSelfOrDescendant(
  byId: Map<string, FolderRow>,
  folderId: string,
  nodeId: string,
): boolean {
  let cur: FolderRow | undefined = byId.get(folderId);
  let guard = 0;
  while (cur && guard++ < 64) {
    if (cur.id === nodeId) return true;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return false;
}

// ── model resolution (mirrors follow-ups) ────────────────────────────────

async function resolveModel(userId: string) {
  const route = await resolvePrimaryRoute(userId, "folder-assistant");
  if (!route) {
    throw new Error(
      "No AI model is available for the Folder Assistant. Add a connection in Settings → AI, or configure a Feature Route.",
    );
  }
  return resolveChatModelFromConnection(route.connection, route.modelId);
}

// ── tree mutation ────────────────────────────────────────────────────────

async function repath(id: string, isFolder: boolean): Promise<void> {
  await updateMaterializedPath(id);
  if (!isFolder) return;
  const kids = await prisma.contentNode.findMany({
    where: { parentId: id, deletedAt: null },
    select: { id: true, contentType: true },
  });
  for (const k of kids) await repath(k.id, k.contentType === "folder");
}

/** Label for a set of moved ids: the single file's name, else "N files". */
async function formatMovedLabel(
  userId: string,
  movedIds: string[],
): Promise<string> {
  if (movedIds.length === 1) {
    const node = await prisma.contentNode.findFirst({
      where: { id: movedIds[0], ownerId: userId },
      select: { title: true },
    });
    return node?.title ? `“${node.title}”` : "1 file";
  }
  return `${movedIds.length} files`;
}

/** Move files into a folder, capturing previous parents for undo. */
async function executeMove(
  userId: string,
  fileIds: string[],
  targetFolderId: string,
): Promise<Record<string, string | null>> {
  const prevParents: Record<string, string | null> = {};
  for (const id of fileIds) {
    const node = await prisma.contentNode.findFirst({
      where: { id, ownerId: userId, deletedAt: null },
      select: { id: true, parentId: true, contentType: true },
    });
    if (!node) continue;
    prevParents[id] = node.parentId;
    await prisma.contentNode.update({
      where: { id },
      data: { parentId: targetFolderId },
    });
    await repath(id, node.contentType === "folder");
  }
  return prevParents;
}

async function createFolder(
  userId: string,
  name: string,
  underFolderId: string | null,
): Promise<{ id: string; name: string }> {
  const slug = await generateUniqueSlug(name, userId);
  const folder = await prisma.contentNode.create({
    data: {
      ownerId: userId,
      title: name,
      slug,
      contentType: "folder",
      parentId: underFolderId,
    },
    select: { id: true, title: true },
  });
  await updateMaterializedPath(folder.id);
  return { id: folder.id, name: folder.title };
}

// ── decision ─────────────────────────────────────────────────────────────

// NOTE: every field is required-but-nullable (`.nullable()`, NOT
// `.optional()`). OpenAI's strict structured-output mode rejects schemas
// where any property is absent from `required`; nullable keeps the key
// present while letting the model omit a value.
const DecisionSchema = z.object({
  action: z.enum(["move", "create_and_move", "candidates", "abstain"]),
  targetFolderId: z.string().nullable(),
  newFolderName: z.string().nullable(),
  underFolderId: z.string().nullable(),
  candidates: z
    .array(z.object({ folderId: z.string(), reason: z.string() }))
    .nullable(),
  confidence: z.number().min(0).max(1),
  /**
   * True ONLY when the user's request is an explicit back-reference to a
   * remembered placement ("same as last time", "the one we just used"). A
   * fresh topical description is NOT a reference. Gates the silent-move path.
   */
  userReferencedMemory: z.boolean(),
  reason: z.string(),
});

async function decide(args: {
  userId: string;
  files: { title: string; parentId: string | null; contentType: string }[];
  prompt: string;
  index: Awaited<ReturnType<typeof loadFolderIndex>>;
  memory: MemoryEntry[];
}) {
  const { files, prompt, index, memory } = args;
  const model = await resolveModel(args.userId);

  const folderLines = index.folders
    .slice(0, MAX_FOLDERS_IN_PROMPT)
    .map((f) => `${f.id} :: ${index.pathOfFolder(f.id)}`)
    .join("\n");

  const fileLines = files
    .map(
      (f) =>
        `- "${f.title}" (currently in: ${index.pathOfParent(f.parentId)})`,
    )
    .join("\n");

  const successMem = memory
    .filter((m) => m.status === "success" && m.targetPath)
    .slice(0, 5)
    .map((m) => `• "${m.prompt}" → ${m.targetPath}`)
    .join("\n");
  const failMem = memory
    .filter((m) => m.status === "failed")
    .slice(0, 5)
    .map(
      (m) =>
        `• REJECTED: "${m.prompt}" → ${m.targetPath ?? m.targetFolderId ?? "?"} (do not repeat)`,
    )
    .join("\n");

  const system = [
    "You are a file-organization assistant for a personal knowledge base.",
    "Decide which EXISTING folder the user's selected files should move into,",
    "based on their request. Only choose folder ids from the provided list.",
    "",
    "Rules:",
    "- Prefer an existing folder. Use `action:\"move\"` with `targetFolderId`.",
    "- Only use `action:\"create_and_move\"` if the user EXPLICITLY asks for a",
    "  new folder (e.g. 'make a new folder…'); set `newFolderName` and",
    "  `underFolderId` (null for root) — underFolderId must be an existing id.",
    "- If you are unsure, return `action:\"candidates\"` with 2-3 ranked",
    "  options instead of guessing.",
    "- If the request is too vague to act on at all, return `action:\"abstain\"`.",
    "- `confidence` (0-1) reflects how sure you are of the single best target.",
    "- Honor the memory below: reuse successful placements when the user",
    "  references them ('same as last time'); never repeat a REJECTED one.",
    "- Set `userReferencedMemory` true ONLY when the request is an explicit",
    "  back-reference to a remembered placement (e.g. 'same as last time',",
    "  'the one we just used', 'again'). A fresh topical description like",
    "  'App Testing folder' is NOT a reference — set it false.",
  ].join("\n");

  const promptText = [
    `User request: "${prompt}"`,
    "",
    "Files to place:",
    fileLines,
    "",
    "Available folders (id :: path):",
    folderLines || "(none)",
    successMem ? `\nRecent successful placements:\n${successMem}` : "",
    failMem ? `\nRecently rejected (avoid):\n${failMem}` : "",
  ].join("\n");

  const { object } = await generateObject({
    model,
    schema: DecisionSchema,
    system,
    prompt: promptText,
  });
  return object;
}

// ── public API ───────────────────────────────────────────────────────────

function toCandidate(
  index: Awaited<ReturnType<typeof loadFolderIndex>>,
  folderId: string,
  reason: string,
): FolderCandidate | null {
  const folder = index.byId.get(folderId);
  if (!folder) return null;
  return { folderId, path: index.pathOfFolder(folderId), reason };
}

/**
 * Folder ids whose NAME loosely matches the request, shallowest first. Used
 * to widen the confirm list so the user also sees the more general matching
 * folder (e.g. "App Testing" surfaces `appTesting` alongside the model's
 * deeper `appTesting/Chats` pick), not just the single model choice.
 */
function relatedFolderIds(
  index: Awaited<ReturnType<typeof loadFolderIndex>>,
  query: string,
  isValid: (id: string) => boolean,
): string[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const q = norm(query);
  if (q.length < 2) return [];
  return index.folders
    .filter((f) => {
      if (!isValid(f.id)) return false;
      const n = norm(f.title);
      return n.length >= 2 && (n.includes(q) || q.includes(n));
    })
    .map((f) => ({
      id: f.id,
      depth: index.pathOfFolder(f.id).split(" / ").length,
    }))
    .sort((a, b) => a.depth - b.depth)
    .map((f) => f.id);
}

export async function runFolderAssist(args: {
  userId: string;
  fileIds: string[];
  prompt: string;
  feelingLucky: boolean;
}): Promise<FolderAssistResult> {
  const { userId, fileIds, prompt, feelingLucky } = args;

  const files = await prisma.contentNode.findMany({
    where: { id: { in: fileIds }, ownerId: userId, deletedAt: null },
    select: { id: true, title: true, parentId: true, contentType: true },
  });
  if (files.length === 0) return { status: "abstain", reason: "No files selected." };

  const index = await loadFolderIndex(userId);
  const memory = await readMemory(userId);
  const decision = await decide({ userId, files, prompt, index, memory });

  // Validate any referenced folder ids and reject cycles.
  const validTarget = (id: string | null | undefined): id is string =>
    !!id &&
    index.byId.has(id) &&
    !fileIds.some((fid) => isSelfOrDescendant(index.byId, id, fid));

  // Silent move via memory requires BOTH:
  //  1. the model judged the request to be an explicit back-reference to a
  //     remembered placement (not just a fresh description that happens to
  //     match a folder used before), AND
  //  2. that folder's MOST RECENT outcome was a success (`memory` is
  //     newest-first, so a later rejection from "undo & try again" wins and
  //     forces a confirm).
  const memoryReferenced =
    decision.action === "move" &&
    validTarget(decision.targetFolderId) &&
    decision.userReferencedMemory === true &&
    memory.find((m) => m.targetFolderId === decision.targetFolderId)?.status ===
      "success";

  // ── direct move (existing folder) ──
  if (decision.action === "move" && validTarget(decision.targetFolderId)) {
    const targetId = decision.targetFolderId;
    // Auto-move ONLY when the user opted in ("I'm feeling lucky") or the
    // assistant is reusing a folder it accurately recalled from memory.
    // Model confidence alone never triggers a silent move — otherwise we
    // confirm.
    if (feelingLucky || memoryReferenced) {
      return await moveAndRespond(userId, fileIds, targetId, index, prompt);
    }
    // Confirm — lead with the model's pick, then widen with other folders
    // whose name matches the request (e.g. the more general parent), capped
    // at 3 so the user can choose.
    const ids: string[] = [targetId];
    for (const id of relatedFolderIds(index, prompt, validTarget)) {
      if (!ids.includes(id)) ids.push(id);
    }
    const candidates = ids
      .slice(0, 3)
      .map((id) =>
        toCandidate(
          index,
          id,
          id === targetId ? decision.reason : "Also matches your description",
        ),
      )
      .filter((c): c is FolderCandidate => c !== null);
    return {
      status: "needs_confirmation",
      candidates,
      reason: decision.reason,
    };
  }

  // ── create + move ──
  if (decision.action === "create_and_move" && decision.newFolderName) {
    const under = decision.underFolderId ?? null;
    const underValid = under === null || index.byId.has(under);
    if (underValid) {
      const underPath = under ? index.pathOfFolder(under) : "Root";
      if (feelingLucky) {
        const created = await createFolder(userId, decision.newFolderName, under);
        const prevParents = await executeMove(userId, fileIds, created.id);
        const targetPath = index.pathOfFolder(under ? under : "")
          ? `${underPath} / ${created.name}`
          : created.name;
        await recordMemory(userId, {
          prompt,
          status: "success",
          targetFolderId: created.id,
          targetPath,
          at: Date.now(),
        });
        return {
          status: "moved",
          targetPath,
          movedCount: Object.keys(prevParents).length,
          movedLabel: await formatMovedLabel(userId, Object.keys(prevParents)),
          createdFolder: created,
          undo: { prevParents, createdFolderId: created.id, prompt, targetFolderId: created.id },
          reason: decision.reason,
        };
      }
      // Creating is consequential — always confirm unless feeling lucky.
      return {
        status: "needs_confirmation",
        candidates: [],
        createSuggestion: {
          name: decision.newFolderName,
          underFolderId: under,
          underPath,
          reason: decision.reason,
        },
        reason: decision.reason,
      };
    }
  }

  // ── explicit candidates ──
  if (decision.action === "candidates" && decision.candidates?.length) {
    const candidates = decision.candidates
      .filter((c) => validTarget(c.folderId))
      .map((c) => toCandidate(index, c.folderId, c.reason))
      .filter((c): c is FolderCandidate => c !== null)
      .slice(0, 3);
    if (candidates.length > 0) {
      return { status: "needs_confirmation", candidates, reason: decision.reason };
    }
  }

  return {
    status: "abstain",
    reason: decision.reason || "Couldn't determine where these should go.",
  };
}

/** Shared move+memory+response for a validated existing-folder target. */
async function moveAndRespond(
  userId: string,
  fileIds: string[],
  targetFolderId: string,
  index: Awaited<ReturnType<typeof loadFolderIndex>>,
  prompt: string,
): Promise<FolderAssistResult> {
  const targetPath = index.pathOfFolder(targetFolderId);
  const prevParents = await executeMove(userId, fileIds, targetFolderId);
  await recordMemory(userId, {
    prompt,
    status: "success",
    targetFolderId,
    targetPath,
    at: Date.now(),
  });
  return {
    status: "moved",
    targetPath,
    movedCount: Object.keys(prevParents).length,
    movedLabel: await formatMovedLabel(userId, Object.keys(prevParents)),
    undo: { prevParents, prompt, targetFolderId },
    reason: "",
  };
}

/** Execute a user-confirmed placement (existing folder OR create + move). */
export async function confirmPlacement(args: {
  userId: string;
  fileIds: string[];
  prompt: string;
  folderId?: string;
  createFolder?: { name: string; underFolderId: string | null };
}): Promise<FolderAssistResult> {
  const { userId, fileIds, prompt } = args;
  const index = await loadFolderIndex(userId);

  if (args.createFolder?.name) {
    const under = args.createFolder.underFolderId;
    if (under !== null && !index.byId.has(under)) {
      return { status: "abstain", reason: "Parent folder no longer exists." };
    }
    const created = await createFolder(userId, args.createFolder.name, under);
    const prevParents = await executeMove(userId, fileIds, created.id);
    const targetPath = under
      ? `${index.pathOfFolder(under)} / ${created.name}`
      : created.name;
    await recordMemory(userId, {
      prompt,
      status: "success",
      targetFolderId: created.id,
      targetPath,
      at: Date.now(),
    });
    return {
      status: "moved",
      targetPath,
      movedCount: Object.keys(prevParents).length,
      movedLabel: await formatMovedLabel(userId, Object.keys(prevParents)),
      createdFolder: created,
      undo: { prevParents, createdFolderId: created.id, prompt, targetFolderId: created.id },
      reason: "",
    };
  }

  if (args.folderId && index.byId.has(args.folderId)) {
    // Re-check cycle safety against the selection.
    if (fileIds.some((fid) => isSelfOrDescendant(index.byId, args.folderId!, fid))) {
      return { status: "abstain", reason: "Can't move a folder into itself." };
    }
    return await moveAndRespond(userId, fileIds, args.folderId, index, prompt);
  }

  return { status: "abstain", reason: "Selected folder no longer exists." };
}

/** Reverse a placement and record the failure so the model avoids it next time. */
export async function undoPlacement(args: {
  userId: string;
  undo: UndoPayload;
}): Promise<void> {
  const { userId, undo } = args;

  for (const [fileId, prevParentId] of Object.entries(undo.prevParents)) {
    const node = await prisma.contentNode.findFirst({
      where: { id: fileId, ownerId: userId, deletedAt: null },
      select: { id: true, contentType: true },
    });
    if (!node) continue;
    await prisma.contentNode.update({
      where: { id: fileId },
      data: { parentId: prevParentId },
    });
    await repath(fileId, node.contentType === "folder");
  }

  // Remove a folder the assistant created, if it's now empty.
  if (undo.createdFolderId) {
    const remaining = await prisma.contentNode.count({
      where: { parentId: undo.createdFolderId, deletedAt: null },
    });
    if (remaining === 0) {
      await prisma.contentNode.deleteMany({
        where: { id: undo.createdFolderId, ownerId: userId },
      });
    }
  }

  await recordMemory(userId, {
    prompt: undo.prompt,
    status: "failed",
    targetFolderId: undo.targetFolderId,
    at: Date.now(),
  });
}
