/**
 * Argument resolution for the document-writing tools — PURE (no Prisma),
 * so `pnpm run-harness:check` pins it.
 *
 * "Schemas describe shape; execute judges" applies here exactly as it does
 * to the run-loop tools (AI-ARCHITECTURE §5). Prod f51fa2d8 (deepseek-v4-pro,
 * 2026-09-29): the model drafted a complete resume and sent it as
 * `content` — create_note's key — where create_docx wanted `markdown`. The
 * schema rejected the call before execute, the turn was on its forced last
 * step (an approval continuation with ONE step left), and the resume was
 * lost to a field name. Same concept, same key, everywhere: the body is
 * accepted under every name a sibling tool uses, and a genuine miss comes
 * back as a result that names the accepted keys.
 */

/** Body keys the model has used across the write tools. First wins. */
export const DOCUMENT_BODY_KEYS = ["markdown", "content", "body", "text", "document"] as const;

/** Title keys the model has used. */
export const DOCUMENT_TITLE_KEYS = ["title", "name", "fileName", "filename"] as const;

export const DOCUMENT_OUTPUT_LOCATIONS = ["under_chat", "under_content", "beside_content"] as const;
export type DocumentOutputLocation = (typeof DOCUMENT_OUTPUT_LOCATIONS)[number];

export const DOCUMENT_TITLE_MAX = 200;

export interface ResolvedDocumentArgs {
  ok: boolean;
  title?: string;
  body?: string;
  outputLocation?: DocumentOutputLocation;
  /** Normalizations applied — reported on the result, never silent. */
  shapeNotes: string[];
  /** When `ok` is false: what was received, what is accepted, the fix. */
  refusal?: string;
}

function firstString(
  raw: Record<string, unknown>,
  keys: readonly string[],
): { key: string; value: string } | null {
  for (const key of keys) {
    const v = raw[key];
    if (typeof v === "string" && v.trim().length > 0) return { key, value: v };
  }
  return null;
}

/** The first markdown heading of a body, as a title fallback. */
function titleFromBody(body: string): string | null {
  const m = body.match(/^\s*#{1,6}\s+(.+?)\s*$/m);
  return m ? m[1].replace(/[*_`]/g, "").trim() : null;
}

/**
 * Resolve a write tool's title/body/placement from whatever the model sent.
 * `canonicalBodyKey` is the tool's documented key (so the note says what was
 * read differently); `toolName` is for the refusal text.
 */
export function resolveDocumentArgs(
  rawInput: unknown,
  options: { toolName: string; canonicalBodyKey: "markdown" | "content" },
): ResolvedDocumentArgs {
  const shapeNotes: string[] = [];
  const raw =
    rawInput && typeof rawInput === "object" && !Array.isArray(rawInput)
      ? (rawInput as Record<string, unknown>)
      : {};

  const bodyHit = firstString(raw, [
    options.canonicalBodyKey,
    ...DOCUMENT_BODY_KEYS.filter((k) => k !== options.canonicalBodyKey),
  ]);
  if (!bodyHit) {
    const received = Object.keys(raw);
    return {
      ok: false,
      shapeNotes,
      refusal:
        `${options.toolName} needs the document body in \`${options.canonicalBodyKey}\` (also read from: ${DOCUMENT_BODY_KEYS.filter((k) => k !== options.canonicalBodyKey).join(", ")}). ` +
        `Received keys: ${received.length > 0 ? received.join(", ") : "none"}. ` +
        `Call ${options.toolName} again with \`${options.canonicalBodyKey}\` set to the full markdown — nothing was written.`,
    };
  }
  if (bodyHit.key !== options.canonicalBodyKey) {
    shapeNotes.push(`body was sent as \`${bodyHit.key}\` — read as \`${options.canonicalBodyKey}\``);
  }

  const titleHit = firstString(raw, DOCUMENT_TITLE_KEYS);
  let title = titleHit?.value.trim() ?? "";
  if (titleHit && titleHit.key !== "title") {
    shapeNotes.push(`title was sent as \`${titleHit.key}\` — read as \`title\``);
  }
  if (!title) {
    const derived = titleFromBody(bodyHit.value);
    if (derived) {
      title = derived;
      shapeNotes.push(`no title given — used the first heading: "${derived.slice(0, 60)}"`);
    } else {
      title = "Untitled document";
      shapeNotes.push('no title given and no heading in the body — titled "Untitled document"');
    }
  }
  if (title.length > DOCUMENT_TITLE_MAX) {
    title = `${title.slice(0, DOCUMENT_TITLE_MAX - 1).trimEnd()}…`;
    shapeNotes.push(`title clipped to ${DOCUMENT_TITLE_MAX} characters`);
  }

  let outputLocation: DocumentOutputLocation | undefined;
  const loc = raw.outputLocation;
  if (typeof loc === "string" && loc.trim()) {
    const norm = loc.trim().toLowerCase().replace(/[\s-]+/g, "_");
    const match = DOCUMENT_OUTPUT_LOCATIONS.find((l) => l === norm);
    if (match) {
      outputLocation = match;
      if (norm !== loc) shapeNotes.push(`outputLocation "${loc}" read as "${match}"`);
    } else {
      shapeNotes.push(
        `outputLocation "${loc}" is not one of ${DOCUMENT_OUTPUT_LOCATIONS.join(", ")} — ignored; the configured output target applies`,
      );
    }
  }

  return { ok: true, title, body: bodyHit.value, outputLocation, shapeNotes };
}
