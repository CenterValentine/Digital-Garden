/**
 * Word document properties (File → Properties) and safe file names for
 * generated documents — one module for every producer of .docx files
 * (`create_docx`'s converter and the template renderer) so the AI's
 * `properties` argument means the same thing on both paths.
 *
 * Pure: no Node, no Prisma.
 */

/** The core properties a generated document may carry. `author` and
 * `comments` are Word's Author and Comments boxes. */
export interface DocxProperties {
  title?: string;
  subject?: string;
  /** Comma-separated, as Word stores and shows it — what an ATS reads. */
  keywords?: string;
  author?: string;
  comments?: string;
}

/** OOXML core properties are capped at 255 characters (python-docx raises
 * above it; Word truncates). Mirrors server/docx-renderer/render.py. */
export const DOCX_PROPERTY_LIMIT = 255;
const KEYS: ReadonlyArray<keyof DocxProperties> = ["title", "subject", "keywords", "author", "comments"];

/**
 * Keep the known fields, trimmed and bounded. Keywords may arrive as a
 * list or a comma string; blanks and duplicates are dropped and an
 * over-long list is cut at the last WHOLE keyword. Tolerant on purpose:
 * the schema describes the shape, this judges it.
 */
export function normalizeDocxProperties(raw: unknown): DocxProperties {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const out: DocxProperties = {};
  for (const key of KEYS) {
    let value = source[key];
    if (key === "keywords") {
      const parts = (Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [])
        .map((v) => String(v).trim())
        .filter(Boolean);
      const seen = new Set<string>();
      const kept: string[] = [];
      for (const part of parts) {
        const id = part.toLowerCase();
        if (seen.has(id)) continue;
        const next = [...kept, part].join(", ");
        if (next.length > DOCX_PROPERTY_LIMIT) break;
        seen.add(id);
        kept.push(part);
      }
      value = kept.join(", ");
    }
    if (typeof value === "string" && value.trim()) {
      out[key] = value.trim().slice(0, DOCX_PROPERTY_LIMIT);
    }
  }
  return out;
}

export function hasDocxProperties(properties: DocxProperties | undefined): boolean {
  return !!properties && KEYS.some((key) => !!properties[key]);
}

/**
 * A file name from a document title. Keeps what reads naturally in a
 * resume name — letters, digits, spaces, `-`, `&`, `.`, `,`, `'`, `(`, `)`
 * — turns typographic dashes and quotes into plain ones, folds accents to
 * ASCII, and drops the rest (path and shell metacharacters among them).
 * ASCII-only so the name is valid everywhere it is used, HTTP headers
 * included. "AT&T – Analyst" → "AT&T - Analyst.docx".
 */
export function docxFileName(title: string, fallback = "Document"): string {
  const base = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019\u201a\u2032]/g, "'")
    .replace(/[\u201c\u201d\u201e\u2033]/g, "")
    .replace(/\.docx$/i, "")
    .replace(/[^A-Za-z0-9 \-&.,'()]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "")
    .slice(0, 200)
    .trim();
  return `${base || fallback}.docx`;
}

/**
 * `Content-Disposition` for a stored file name of any origin (uploads keep
 * the user's own name, accents and all): an ASCII fallback `filename=` for
 * old clients plus RFC 6266/5987 `filename*` with the exact UTF-8 name.
 * The raw name in a header threw for any character outside Latin-1 and
 * broke on a `"`.
 */
export function contentDisposition(fileName: string, mode: "inline" | "attachment"): string {
  const ascii = fileName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${mode}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
