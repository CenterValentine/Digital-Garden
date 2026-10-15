/**
 * Document templates — a user's own .docx files, marked in place.
 *
 * Principle 1 (PRODUCT-PRINCIPLES.md): the template IS the file the user
 * already keeps, in the folder they already keep it in. Marking stores a
 * small record on the file's own payload (`storageMetadata.custom.
 * docxTemplate`) — no parallel template table, no copy. Overwriting the
 * file keeps the record (overwrite-file.ts never touches storageMetadata);
 * the record's checksum then disagrees with the payload's, and the next
 * load re-inspects so the contract follows the file.
 *
 * Server-only: Prisma + storage.
 */

import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { getMetadata, setMetadata } from "@/lib/domain/content/metadata-types";
import { getUserStorageProvider } from "@/lib/infrastructure/storage";
import { logger } from "@/lib/core/logger";
import { inspectDocxTemplate, type TemplateContract } from "./renderer-client";
import {
  DOCX_TEMPLATE_RECORD_KEY as RECORD_KEY,
  readTemplateRecord,
  recordFromContract,
  type DocxTemplateRecord,
  type TemplateFieldNote,
} from "./record";

export { describeTemplateForModel, readTemplateRecord } from "./record";
export type { DocxTemplateRecord, TemplateFieldNote } from "./record";

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export interface DocxTemplateSummary {
  contentId: string;
  title: string;
  fileName: string;
  parentId: string | null;
  checksum: string;
  markedAt: string;
  fieldCount: number;
  sectionCount: number;
}

// ---------------------------------------------------------------------------
// Loading

interface TemplateNode {
  id: string;
  title: string;
  parentId: string | null;
  filePayload: {
    fileName: string;
    mimeType: string;
    checksum: string;
    storageKey: string;
    storageProvider: string;
    storageMetadata: unknown;
  };
}

async function findTemplateNode(ownerId: string, contentId: string): Promise<TemplateNode | null> {
  const node = await prisma.contentNode.findFirst({
    where: { id: contentId, ownerId, contentType: "file", deletedAt: null },
    select: {
      id: true,
      title: true,
      parentId: true,
      filePayload: {
        select: {
          fileName: true,
          mimeType: true,
          checksum: true,
          storageKey: true,
          storageProvider: true,
          storageMetadata: true,
        },
      },
    },
  });
  return node?.filePayload ? (node as TemplateNode) : null;
}

/** Download a stored file's bytes — the same signed-URL path the reader,
 * transcription and download routes use (there is no shared helper). */
export async function fetchFileBytes(ownerId: string, node: TemplateNode): Promise<Buffer> {
  const storage = await getUserStorageProvider(
    ownerId,
    node.filePayload.storageProvider as "r2" | "s3" | "vercel",
  );
  const url = await storage.generateDownloadUrl(node.filePayload.storageKey, 600);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not read the template file from storage (HTTP ${response.status}).`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function isDocxNode(node: TemplateNode): boolean {
  return (
    node.filePayload.mimeType === DOCX_MIME ||
    node.filePayload.fileName.toLowerCase().endsWith(".docx")
  );
}

async function persistRecord(
  contentId: string,
  storageMetadata: unknown,
  record: DocxTemplateRecord | null,
): Promise<void> {
  const current = getMetadata(storageMetadata);
  const custom = { ...(current.custom ?? {}) };
  if (record) custom[RECORD_KEY] = record;
  else delete custom[RECORD_KEY];
  // setMetadata deep-merges, which cannot DELETE a key — write `custom`
  // whole so an unmark actually removes the record.
  const next = { ...setMetadata(current, {}), custom };
  await prisma.filePayload.update({
    where: { contentId },
    data: { storageMetadata: next as unknown as Prisma.InputJsonValue },
  });
}

export interface MarkOutcome {
  ok: boolean;
  record?: DocxTemplateRecord;
  summary?: DocxTemplateSummary;
  /** Preflight errors from the renderer — the file is NOT marked. */
  errors?: TemplateContract["errors"];
  error?: string;
}

/**
 * Inspect the file and store its contract. A template whose tags do not
 * parse is not marked: the user gets the paragraph to fix instead of a
 * template that fails on first use.
 */
export async function markDocxTemplate(ownerId: string, contentId: string): Promise<MarkOutcome> {
  const node = await findTemplateNode(ownerId, contentId);
  if (!node) return { ok: false, error: "That file was not found." };
  if (!isDocxNode(node)) return { ok: false, error: "Only Word (.docx) files can be document templates." };

  const bytes = await fetchFileBytes(ownerId, node);
  const contract = await inspectDocxTemplate(bytes, node.filePayload.fileName);
  if (!contract.ok) {
    return { ok: false, errors: contract.errors, error: "The template has a tag that does not parse." };
  }
  const previous = readTemplateRecord(node.filePayload.storageMetadata);
  const record = recordFromContract(contract, previous);
  await persistRecord(node.id, node.filePayload.storageMetadata, record);
  logger.info({
    layer: "ai",
    event: "docx_templates:marked",
    summary: `"${node.title}" marked as a document template`,
    attrs: { contentId: node.id, fields: record.fields.length, sections: record.sections.length },
  });
  return { ok: true, record, summary: summarize(node, record) };
}

export async function unmarkDocxTemplate(ownerId: string, contentId: string): Promise<{ ok: boolean; error?: string }> {
  const node = await findTemplateNode(ownerId, contentId);
  if (!node) return { ok: false, error: "That file was not found." };
  await persistRecord(node.id, node.filePayload.storageMetadata, null);
  return { ok: true };
}

export async function updateTemplateNotes(
  ownerId: string,
  contentId: string,
  notes: Record<string, TemplateFieldNote>,
): Promise<{ ok: boolean; error?: string }> {
  const node = await findTemplateNode(ownerId, contentId);
  if (!node) return { ok: false, error: "That file was not found." };
  const record = readTemplateRecord(node.filePayload.storageMetadata);
  if (!record) return { ok: false, error: "That file is not a document template." };
  await persistRecord(node.id, node.filePayload.storageMetadata, { ...record, notes });
  return { ok: true };
}

function summarize(node: TemplateNode, record: DocxTemplateRecord): DocxTemplateSummary {
  return {
    contentId: node.id,
    title: node.title,
    fileName: node.filePayload.fileName,
    parentId: node.parentId,
    checksum: record.checksum,
    markedAt: record.markedAt,
    fieldCount: record.fields.length,
    sectionCount: record.sections.length,
  };
}

export async function listDocxTemplates(ownerId: string): Promise<DocxTemplateSummary[]> {
  const nodes = await prisma.contentNode.findMany({
    where: {
      ownerId,
      contentType: "file",
      deletedAt: null,
      filePayload: { storageMetadata: { path: ["custom", RECORD_KEY, "version"], equals: 1 } },
    },
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      parentId: true,
      filePayload: {
        select: {
          fileName: true,
          mimeType: true,
          checksum: true,
          storageKey: true,
          storageProvider: true,
          storageMetadata: true,
        },
      },
    },
  });
  const out: DocxTemplateSummary[] = [];
  for (const node of nodes) {
    const record = node.filePayload && readTemplateRecord(node.filePayload.storageMetadata);
    if (record) out.push(summarize(node as TemplateNode, record));
  }
  return out;
}

export interface LoadedTemplate {
  node: TemplateNode;
  record: DocxTemplateRecord;
  bytes: Buffer;
  /** True when the file changed since it was marked and was re-inspected now. */
  refreshed: boolean;
}

/**
 * Bytes + current contract for a render. If the file was overwritten
 * since marking (payload checksum ≠ record checksum) the contract is
 * re-derived first, so the values are always judged against the file
 * that will actually be filled.
 */
/** Flat result (no union narrowing without strictNullChecks): `ok: true`
 * guarantees `template`; `ok: false` guarantees `error`. */
export interface LoadTemplateOutcome {
  ok: boolean;
  template?: LoadedTemplate;
  error?: string;
  errors?: TemplateContract["errors"];
}

export async function loadDocxTemplate(ownerId: string, contentId: string): Promise<LoadTemplateOutcome> {
  const node = await findTemplateNode(ownerId, contentId);
  if (!node) return { ok: false, error: "That template file was not found." };
  let record = readTemplateRecord(node.filePayload.storageMetadata);
  if (!record) return { ok: false, error: `"${node.title}" is not marked as a document template.` };

  const bytes = await fetchFileBytes(ownerId, node);
  let refreshed = false;
  if (record.checksum !== node.filePayload.checksum) {
    const contract = await inspectDocxTemplate(bytes, node.filePayload.fileName);
    if (!contract.ok) {
      return { ok: false, error: "The template changed and its tags no longer parse.", errors: contract.errors };
    }
    record = recordFromContract(contract, record);
    await persistRecord(node.id, node.filePayload.storageMetadata, record);
    refreshed = true;
  }
  return { ok: true, template: { node, record, bytes, refreshed } };
}

/**
 * The current contract without downloading the file — unless the file
 * changed since marking, in which case it is re-inspected (one download)
 * so the model never reads a contract the file no longer matches.
 */
export interface TemplateRecordOutcome {
  ok: boolean;
  title?: string;
  record?: DocxTemplateRecord;
  refreshed?: boolean;
  error?: string;
  errors?: TemplateContract["errors"];
}

export async function getDocxTemplateRecord(ownerId: string, contentId: string): Promise<TemplateRecordOutcome> {
  const node = await findTemplateNode(ownerId, contentId);
  if (!node) return { ok: false, error: "That template file was not found." };
  const record = readTemplateRecord(node.filePayload.storageMetadata);
  if (!record) return { ok: false, error: `"${node.title}" is not marked as a document template.` };
  if (record.checksum === node.filePayload.checksum) {
    return { ok: true, title: node.title, record, refreshed: false };
  }
  const loaded = await loadDocxTemplate(ownerId, contentId);
  const template = loaded.template;
  if (!loaded.ok || !template) {
    return { ok: false, error: loaded.error ?? "Could not load the template.", errors: loaded.errors };
  }
  return { ok: true, title: template.node.title, record: template.record, refreshed: true };
}
