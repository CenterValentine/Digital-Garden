/**
 * The template record and its model-facing description — pure, no Prisma,
 * no storage — so the tree route, client components and the server module
 * all read the same shape from `storageMetadata.custom.docxTemplate`.
 */

import { getMetadata } from "@/lib/domain/content/metadata-types";
import type { TemplateField, TemplateSection, TemplateContract } from "./renderer-client";

export const DOCX_TEMPLATE_RECORD_KEY = "docxTemplate";

/** Per-field guidance layered over the derived contract, keyed by the
 * field's dotted path (`header.name`, `experience.title`). The app's layer:
 * the renderer cannot know what "summary" should hold or how long. */
export interface TemplateFieldNote {
  description?: string;
  /** Soft guidance for the model, in characters. */
  maxLength?: number;
}

export interface DocxTemplateRecord {
  version: 1;
  markedAt: string;
  /** Checksum of the bytes the contract was derived from. */
  checksum: string;
  fields: TemplateField[];
  sections: TemplateSection[];
  warnings: string[];
  notes?: Record<string, TemplateFieldNote>;
}

export function readTemplateRecord(storageMetadata: unknown): DocxTemplateRecord | null {
  const custom = getMetadata(storageMetadata).custom;
  const record = custom?.[DOCX_TEMPLATE_RECORD_KEY] as Partial<DocxTemplateRecord> | undefined;
  if (!record || record.version !== 1 || typeof record.checksum !== "string") return null;
  return {
    version: 1,
    markedAt: typeof record.markedAt === "string" ? record.markedAt : "",
    checksum: record.checksum,
    fields: Array.isArray(record.fields) ? record.fields : [],
    sections: Array.isArray(record.sections) ? record.sections : [],
    warnings: Array.isArray(record.warnings) ? record.warnings : [],
    ...(record.notes && typeof record.notes === "object" ? { notes: record.notes } : {}),
  };
}

export function recordFromContract(
  contract: TemplateContract,
  previous: DocxTemplateRecord | null,
): DocxTemplateRecord {
  return {
    version: 1,
    markedAt: previous?.markedAt || new Date().toISOString(),
    checksum: contract.checksum,
    fields: contract.fields,
    sections: contract.sections,
    warnings: contract.warnings,
    // Notes are keyed by path, so they survive a re-inspect; a note for a
    // field the new version dropped is simply never read.
    ...(previous?.notes ? { notes: previous.notes } : {}),
  };
}

/**
 * The contract as the model reads it: one line per field, sections as
 * indented blocks. Compact on purpose — this text is what replaces the
 * template bytes in the prompt, and it is re-read on every turn that
 * fills the template.
 */
export function describeTemplateForModel(record: DocxTemplateRecord): string {
  const lines: string[] = [];
  const note = (path: string): string => {
    const n = record.notes?.[path];
    if (!n) return "";
    const parts = [n.description, n.maxLength ? `≤${n.maxLength} chars` : ""].filter(Boolean);
    return parts.length ? ` — ${parts.join("; ")}` : "";
  };
  const flag = (f: TemplateField): string =>
    [f.required ? "" : "optional", f.rich ? "link: {text,url}" : ""].filter(Boolean).join(", ");
  const fieldLine = (f: TemplateField, prefix: string, indent: string): string => {
    const flags = flag(f);
    return `${indent}${f.path}${flags ? ` (${flags})` : ""}${note(prefix + f.path)}`;
  };
  const sectionBlock = (s: TemplateSection, prefix: string, indent: string): void => {
    const shape = s.itemIsValue ? "list of strings" : "list of objects";
    lines.push(`${indent}${s.path}[] — ${shape}${note(prefix + s.path)}`);
    for (const f of s.fields) lines.push(fieldLine(f, `${prefix}${s.path}.`, indent + "  "));
    for (const sub of s.sections) sectionBlock(sub, `${prefix}${s.path}.`, indent + "  ");
  };
  for (const f of record.fields) lines.push(fieldLine(f, "", ""));
  for (const s of record.sections) sectionBlock(s, "", "");
  return lines.join("\n");
}
