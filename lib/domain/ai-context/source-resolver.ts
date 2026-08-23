/**
 * SourceContentResolver — turns a ContentNode into prompt-ready text.
 *
 * This is the ingestion seam for folder chat and every studio tool. Each
 * payload type has its own resolver; the `external` case is an OG-metadata-only
 * stub that the future web-search plan fills in place (see plan → Non-goals).
 *
 * SERVER-ONLY: imports Prisma. Never import this from a "use client" module —
 * keep it behind API routes / server runtime. Lives under `server/` to make
 * that boundary obvious.
 */

import type { JSONContent } from "@tiptap/core";
import { prisma } from "@/lib/database/client";
import { tiptapToMarkdown } from "@/lib/domain/content/markdown";
import type {
  ResolvedSourceContent,
  ResolverNodeRef,
  SourceContentResolver,
} from "./types";
import { estimateTokens, truncateToTokens } from "./tokens";

export interface SourceResolverOptions {
  /**
   * Per-node token ceiling. One oversized file shouldn't devour the whole
   * budget before selection accounting runs; hard cases get truncated here and
   * flagged so the picker can show it. Generous default; the real budget is
   * enforced at selection time (Phase 3).
   */
  maxTokensPerNode?: number;
}

const DEFAULT_MAX_TOKENS_PER_NODE = 8_000;

function empty(
  nodeId: string,
  warning: string
): ResolvedSourceContent {
  return {
    nodeId,
    text: "",
    estimatedTokens: 0,
    empty: true,
    truncated: false,
    warning,
  };
}

function finalize(
  nodeId: string,
  raw: string,
  maxTokens: number,
  warning?: string
): ResolvedSourceContent {
  const trimmed = raw.trim();
  if (!trimmed) {
    return empty(nodeId, warning ?? "No extractable text");
  }
  const { text, truncated } = truncateToTokens(trimmed, maxTokens);
  return {
    nodeId,
    text,
    estimatedTokens: estimateTokens(text),
    empty: false,
    truncated,
    warning,
  };
}

/**
 * Databases resolve to a SCHEMA digest, never row content (plan B1). This
 * case is what keeps a `data` node out of the permanently-uncovered set:
 * without it the sweep would retry the node every cycle and never resolve.
 * Because the digest is schema-derived, `sourceContentHash` is too — cell
 * edits cannot dirty context, while description edits (semantic) do.
 */
async function resolveData(
  node: ResolverNodeRef,
  maxTokens: number
): Promise<ResolvedSourceContent> {
  const { buildDataSchemaDigest } = await import(
    "@/lib/domain/data/server/digest"
  );
  const digest = await buildDataSchemaDigest(node.id);
  if (!digest) return empty(node.id, "Database has no payload");
  return finalize(node.id, digest, maxTokens);
}

/**
 * Build a resolver bound to the given options. Stateless otherwise, so a single
 * instance can be reused across a whole selection.
 */
export function createSourceContentResolver(
  options: SourceResolverOptions = {}
): SourceContentResolver {
  const maxTokens = options.maxTokensPerNode ?? DEFAULT_MAX_TOKENS_PER_NODE;

  return {
    async resolve(node: ResolverNodeRef): Promise<ResolvedSourceContent> {
      switch (node.contentType) {
        case "note":
          return resolveNote(node, maxTokens);
        case "file":
          return resolveFile(node, maxTokens);
        case "html":
          return resolveHtml(node, maxTokens);
        case "code":
          return resolveCode(node, maxTokens);
        case "external":
          return resolveExternal(node, maxTokens);
        case "folder":
          // Folders carry no payload text; their context comes from the
          // metadata roll-up (Phase 2), not from this resolver.
          return empty(node.id, "Folder — summarized via its Context doc");
        case "data":
          return resolveData(node, maxTokens);
        default:
          return empty(node.id, `Unsupported source type: ${node.contentType}`);
      }
    },
  };
}

async function resolveNote(
  node: ResolverNodeRef,
  maxTokens: number
): Promise<ResolvedSourceContent> {
  const payload = await prisma.notePayload.findUnique({
    where: { contentId: node.id },
    select: { tiptapJson: true, searchText: true },
  });
  if (!payload) return empty(node.id, "Note has no content yet");

  // Markdown preserves headings/lists/links — better structure for the model
  // than flat search text. Fall back to searchText if serialization yields
  // nothing (e.g. a doc of only unsupported blocks).
  let text = "";
  try {
    text = tiptapToMarkdown(payload.tiptapJson as unknown as JSONContent);
  } catch {
    text = "";
  }
  if (!text.trim()) text = payload.searchText;

  return finalize(node.id, `# ${node.title}\n\n${text}`, maxTokens);
}

async function resolveFile(
  node: ResolverNodeRef,
  maxTokens: number
): Promise<ResolvedSourceContent> {
  const payload = await prisma.filePayload.findUnique({
    where: { contentId: node.id },
    select: { searchText: true },
  });
  if (!payload || !payload.searchText.trim()) {
    // Blank extraction: the file is real but moot in studio. Honest flag so the
    // picker can tell the user rather than silently contributing nothing.
    return empty(node.id, "No extractable text — this file is empty to studio");
  }
  return finalize(node.id, `# ${node.title}\n\n${payload.searchText}`, maxTokens);
}

async function resolveHtml(
  node: ResolverNodeRef,
  maxTokens: number
): Promise<ResolvedSourceContent> {
  const payload = await prisma.htmlPayload.findUnique({
    where: { contentId: node.id },
    select: { searchText: true },
  });
  if (!payload) return empty(node.id, "HTML document has no content");
  return finalize(node.id, `# ${node.title}\n\n${payload.searchText}`, maxTokens);
}

async function resolveCode(
  node: ResolverNodeRef,
  maxTokens: number
): Promise<ResolvedSourceContent> {
  const payload = await prisma.codePayload.findUnique({
    where: { contentId: node.id },
    select: { code: true, language: true },
  });
  if (!payload) return empty(node.id, "Code file has no content");
  const fenced = `# ${node.title}\n\n\`\`\`${payload.language}\n${payload.code}\n\`\`\``;
  return finalize(node.id, fenced, maxTokens);
}

/**
 * WEB-SEARCH SEAM. Today an ExternalPayload only carries Open Graph metadata
 * (title/description) — we do not fetch full page text. This resolver returns
 * that metadata and warns the caller. The web-search plan replaces the body of
 * this function with real fetched/scraped text; nothing else changes.
 */
async function resolveExternal(
  node: ResolverNodeRef,
  maxTokens: number
): Promise<ResolvedSourceContent> {
  const payload = await prisma.externalPayload.findUnique({
    where: { contentId: node.id },
    select: { url: true, description: true, sourceDomain: true, preview: true },
  });
  if (!payload) return empty(node.id, "Link has no metadata");

  const cached = readOgPreview(payload.preview);
  const title = cached.title ?? node.title;
  const description = cached.description ?? payload.description ?? "";
  const site = cached.siteName ?? payload.sourceDomain ?? "";

  const parts = [
    `# ${title}`,
    site ? `Source: ${site}` : "",
    `URL: ${payload.url}`,
    description,
  ].filter(Boolean);

  return finalize(
    node.id,
    parts.join("\n\n"),
    maxTokens,
    "Link preview only — full-page text not yet supported"
  );
}

/** Defensive read of the `{ mode, cached }` preview JSON blob. */
function readOgPreview(preview: unknown): {
  title?: string;
  description?: string;
  siteName?: string;
} {
  if (!preview || typeof preview !== "object") return {};
  const cached = (preview as Record<string, unknown>).cached;
  if (!cached || typeof cached !== "object") return {};
  const c = cached as Record<string, unknown>;
  return {
    title: typeof c.title === "string" ? c.title : undefined,
    description: typeof c.description === "string" ? c.description : undefined,
    siteName: typeof c.siteName === "string" ? c.siteName : undefined,
  };
}
