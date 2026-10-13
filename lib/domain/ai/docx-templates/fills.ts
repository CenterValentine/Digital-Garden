/**
 * Filled documents — the output side of a template fill.
 *
 * A filled .docx remembers its values and provenance on its own payload
 * (`storageMetadata.custom.docxFill`, record.ts), which is what makes two
 * things possible without a model turn: re-rendering after the user edits
 * a field, and showing where each fact came from. Both the AI tool and the
 * rerender route go through `rerenderDocxFill` / `writeFillRecord`, so the
 * judge and the overwrite path are the same whichever asked.
 *
 * Server-only.
 */

import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { getMetadata } from "@/lib/domain/content/metadata-types";
import { storeDocxDocument } from "@/lib/domain/ai/documents";
import { logger } from "@/lib/core/logger";
import {
  DOCX_FILL_RECORD_KEY,
  readFillRecord,
  type DocxFillCompactReport,
  type DocxFillRecord,
  type FillProvenance,
} from "./record";
import { loadDocxTemplate } from "./templates";
import { renderDocxTemplate, type TemplateValue } from "./renderer-client";
import { judgeRender, type RenderVerdict } from "./judge";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Provenance

export interface ProvenanceCheck {
  /** Cited row ids that exist in one of the user's databases. */
  verified: number;
  /** Citations that are not row ids (handles, free text) — kept, not checked. */
  unverified: string[];
  /** Row ids cited that do NOT exist for this user — a fabricated or mistyped citation. */
  notFound: string[];
  total: number;
}

/**
 * Citations are source-of-record row ids (the evidence database's claim
 * rows). A UUID that does not resolve to one of the user's rows is a
 * refusal upstream (the model cited something it never read); anything
 * that is not a UUID is carried as-is and reported unverified.
 */
export async function verifyProvenance(ownerId: string, provenance: FillProvenance): Promise<ProvenanceCheck> {
  const all = [...new Set(Object.values(provenance).flat().map((s) => String(s).trim()).filter(Boolean))];
  const uuids = all.filter((s) => UUID_RE.test(s));
  const unverified = all.filter((s) => !UUID_RE.test(s));
  let found = new Set<string>();
  if (uuids.length > 0) {
    const rows = await prisma.dataRow.findMany({
      where: { id: { in: uuids }, deletedAt: null, table: { content: { ownerId, deletedAt: null } } },
      select: { id: true },
    });
    found = new Set(rows.map((r) => r.id));
  }
  return {
    verified: found.size,
    unverified,
    notFound: uuids.filter((id) => !found.has(id)),
    total: all.length,
  };
}

// ---------------------------------------------------------------------------
// The fill record

export function compactReport(verdict: RenderVerdict): DocxFillCompactReport | undefined {
  const r = verdict.report;
  if (!r) return undefined;
  return {
    filled: `${r.filled.fields} of ${r.filled.declared} fields`,
    ...(Object.keys(r.sectionCounts).length > 0 ? { sections: r.sectionCounts } : {}),
    ...(r.overLength.length > 0 ? { overLength: r.overLength } : {}),
    ...(r.uncited.length > 0 ? { uncited: r.uncited } : {}),
    ...(r.links > 0 ? { links: r.links } : {}),
    textChars: r.textChars,
  };
}

/**
 * Store the fill record on the output file and emit the one telemetry
 * event the templated-vs-markdown comparison reads
 * (`docx_templates:fill` — durationMs, bytes, fields, citations).
 */
export async function writeFillRecord(
  contentId: string,
  record: DocxFillRecord,
  telemetry: { overwritten: boolean; renderMs: number; bytes: number; provenance?: ProvenanceCheck; via: "tool" | "rerender" },
): Promise<void> {
  const payload = await prisma.filePayload.findUnique({ where: { contentId }, select: { storageMetadata: true } });
  const current = getMetadata(payload?.storageMetadata);
  const next = { ...current, custom: { ...(current.custom ?? {}), [DOCX_FILL_RECORD_KEY]: record } };
  await prisma.filePayload.update({
    where: { contentId },
    data: { storageMetadata: next as unknown as Prisma.InputJsonValue },
  });
  logger.info({
    layer: "ai",
    event: "docx_templates:fill",
    summary: `${telemetry.via}: template ${record.templateId} → ${contentId}${telemetry.overwritten ? " (overwritten)" : ""}`,
    attrs: {
      contentId,
      templateId: record.templateId,
      via: telemetry.via,
      overwritten: telemetry.overwritten,
      renderMs: telemetry.renderMs,
      bytes: telemetry.bytes,
      fields: Object.keys(record.values).length,
      citedVerified: telemetry.provenance?.verified ?? 0,
      citedUnverified: telemetry.provenance?.unverified.length ?? 0,
      sectionItems: Object.values(record.report?.sections ?? {}).reduce((n, c) => n + c, 0),
    },
  });
}

// ---------------------------------------------------------------------------
// Rerender without a model turn

export interface RerenderOutcome {
  ok: boolean;
  refusal?: string;
  problems?: string[];
  report?: DocxFillCompactReport;
  /** The template file changed since this document was first filled. */
  templateChanged?: boolean;
  error?: string;
}

/**
 * Re-fill an existing output with edited values: same template, same
 * node id, same judge. Fails without touching the existing file.
 */
export async function rerenderDocxFill(
  ownerId: string,
  contentId: string,
  input: { values?: Record<string, TemplateValue>; provenance?: FillProvenance },
): Promise<RerenderOutcome> {
  const node = await prisma.contentNode.findFirst({
    where: { id: contentId, ownerId, contentType: "file", deletedAt: null },
    select: { id: true, title: true, filePayload: { select: { storageMetadata: true, fileName: true } } },
  });
  if (!node?.filePayload) return { ok: false, error: "That document was not found." };
  const fill = readFillRecord(node.filePayload.storageMetadata);
  if (!fill) return { ok: false, error: "That document was not produced from a template." };

  const loaded = await loadDocxTemplate(ownerId, fill.templateId);
  const template = loaded.template;
  if (!loaded.ok || !template) {
    return { ok: false, error: loaded.error ?? "The template could not be loaded." };
  }
  const values = (input.values ?? fill.values) as Record<string, TemplateValue>;
  const provenance = input.provenance ?? fill.provenance;

  const rendered = await renderDocxTemplate(template.bytes, values, {
    expectedChecksum: template.record.checksum,
    fileName: template.node.filePayload.fileName,
  });
  const docx = rendered.docx;
  const diagnostics = rendered.diagnostics;
  if (!rendered.ok || !docx || !diagnostics) {
    return { ok: false, refusal: rendered.error?.message ?? "The renderer did not return a document." };
  }
  const verdict = judgeRender(template.record, values, diagnostics, { provenance });
  if (!verdict.accept) {
    return { ok: false, refusal: verdict.refusal, problems: verdict.gaps };
  }

  const stored = await storeDocxDocument(ownerId, {
    title: node.title.replace(/\.docx$/i, ""),
    buffer: docx,
    searchText: rendered.text ?? "",
    overwriteContentId: node.id,
  });
  const report = compactReport(verdict);
  await writeFillRecord(
    stored.contentNodeId,
    {
      version: 1,
      templateId: fill.templateId,
      templateChecksum: template.record.checksum,
      values,
      ...(provenance ? { provenance } : {}),
      renderedAt: new Date().toISOString(),
      ...(report ? { report } : {}),
    },
    { overwritten: true, renderMs: diagnostics.durationMs, bytes: diagnostics.bytes, via: "rerender" },
  );
  return {
    ok: true,
    report,
    templateChanged: fill.templateChecksum !== "" && fill.templateChecksum !== template.record.checksum,
  };
}
