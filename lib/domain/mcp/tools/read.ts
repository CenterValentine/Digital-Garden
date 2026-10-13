import "server-only";

/**
 * Find tools over MCP (MCP-DATABASE-REACH-PLAN §2.1): search, the tree,
 * and the type-dispatched read. Notes render through the ONE MCP seam
 * (`renderNoteForMcp`, private content stripped); databases render through
 * the same preview chat's `read_content` uses, plus a structured schema.
 */

import type { JSONContent } from "@tiptap/core";
import { prisma } from "@/lib/database/client";
import { logger } from "@/lib/core/logger";
import { ALL_SEARCH_FIELDS, buildSearchWhere, SEARCH_ORDER } from "@/lib/domain/content/search-service";
import { resolveTagScope } from "@/lib/domain/content/search-service.server";
import { findBacklinks } from "@/lib/domain/content/backlinks";
import { stripPrivateContent } from "@/lib/domain/content/private-content";
import { extractSearchTextFromTipTap } from "@/lib/domain/content/search-text";
import type { ContentType } from "@/lib/domain/content/types";
import { renderDataNodePreview } from "@/lib/domain/data/server/read-preview";
import { buildDataSchemaDigest } from "@/lib/domain/data/server/digest";
import { loadTable } from "@/lib/domain/data/server/queries";
import { rowHandle } from "@/lib/domain/data/read-format";
import { assembleFolderCapsule } from "@/lib/domain/ai-context/capsule";
import { findBlocksInDoc } from "@/lib/domain/ai/tools/editor-tools";
import { listNoteImages } from "@/lib/domain/content/note-images";
import { listConversationsByContent } from "@/lib/features/conversations";
import { imageBlock, imageBlocks, presignFile, rewriteDownloadLinks, type ImageBlock } from "../media";
import type { McpPrincipal } from "../auth";
import { renderNoteForMcp } from "../read";
import type { McpScope } from "../jurisdiction";
import { listTree, renderTree } from "../tree";
import { capText, internalError, ok, refuse, type McpToolResult } from "../results";
import { readAiContext, renderAiContext } from "./context";
import { DEFAULT_READ_TOKEN_CAP } from "./data";

const SEARCH_DEFAULT_TYPES: ContentType[] = ["note", "folder", "data"];

export async function search(
  scope: McpScope,
  input: { query: string; types?: string[]; tags?: string[]; limit?: number }
): Promise<McpToolResult> {
  try {
    const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
    const types = (input.types && input.types.length > 0 ? input.types : SEARCH_DEFAULT_TYPES) as ContentType[];
    const tagContentIds = await resolveTagScope(scope.userId, input.tags ?? []);
    if (tagContentIds && tagContentIds.length === 0) return ok("No items carry all of those tags.", { hits: [] });
    const allowed = await scope.subtreeIds();
    const where = buildSearchWhere({ ownerId: scope.userId, query: input.query, types, tagContentIds, fields: ALL_SEARCH_FIELDS });
    const rows = await prisma.contentNode.findMany({
      where,
      select: {
        id: true,
        title: true,
        contentType: true,
        updatedAt: true,
        parent: { select: { title: true, parent: { select: { title: true } } } },
        notePayload: { select: { searchText: true } },
        dataPayload: { select: { description: true, rowCount: true } },
        filePayload: { select: { mimeType: true } },
      },
      orderBy: SEARCH_ORDER,
      take: allowed ? limit * 4 : limit,
    });
    const term = input.query.trim().toLowerCase();
    const hits: Array<Record<string, unknown>> = [];
    for (const r of rows) {
      if (allowed && !allowed.has(r.id)) continue;
      const path = [r.parent?.parent?.title, r.parent?.title].filter(Boolean).join(" / ");
      const hit: Record<string, unknown> = { id: r.id, type: r.contentType, title: r.title, path: path || null, updatedAt: r.updatedAt.toISOString() };
      if (r.notePayload?.searchText) {
        const text = r.notePayload.searchText;
        const at = term ? text.toLowerCase().indexOf(term) : -1;
        hit.snippet = at >= 0 ? text.slice(Math.max(0, at - 60), at + 100).replace(/\s+/g, " ") : text.slice(0, 150).replace(/\s+/g, " ");
      }
      if (r.dataPayload) {
        hit.rowCount = r.dataPayload.rowCount;
        if (r.dataPayload.description) hit.snippet = r.dataPayload.description;
        if (term) {
          const row = await prisma.dataRow.findFirst({
            where: { tableId: r.id, deletedAt: null, searchText: { contains: term, mode: "insensitive" } },
            select: { id: true, searchText: true },
          });
          if (row) hit.matchedRow = { handle: rowHandle(row.id), snippet: row.searchText.slice(0, 120) };
        }
      }
      if (r.filePayload) hit.mimeType = r.filePayload.mimeType;
      hits.push(hit);
      if (hits.length >= limit) break;
    }
    const lines = hits.map((h, i) => {
      const where = h.path ? ` — in ${h.path}` : "";
      const row = h.matchedRow ? ` · row ${(h.matchedRow as { handle: string }).handle}: ${(h.matchedRow as { snippet: string }).snippet}` : "";
      return `${i + 1}. [${h.type}] "${h.title}" (${h.id})${where}${h.rowCount !== undefined ? ` · ${h.rowCount} rows` : ""}${h.snippet ? `\n   ${h.snippet}` : ""}${row}`;
    });
    const head = term ? `${hits.length} hit${hits.length === 1 ? "" : "s"} for "${input.query.trim()}"` : `${hits.length} most recently updated (${types.join(", ")})`;
    return ok(`${head}:\n\n${lines.join("\n\n") || "(nothing)"}`, { hits });
  } catch (error) {
    logger.warn({ layer: "ai", event: "mcp:search_caught", summary: "garden_search failed", error });
    return internalError("garden_search", error, Object.keys(input));
  }
}

export async function tree(scope: McpScope, input: { rootId?: string; depth?: number }): Promise<McpToolResult> {
  try {
    const result = await listTree(scope, input.rootId ?? null, Math.min(Math.max(input.depth ?? 1, 1), 3));
    if ("refusal" in result) return refuse(result.refusal);
    return ok(renderTree(result.roots, result.entries), { roots: result.roots, entries: result.entries });
  } catch (error) {
    logger.warn({ layer: "ai", event: "mcp:tree_caught", summary: "garden_list_tree failed", error });
    return internalError("garden_list_tree", error, Object.keys(input));
  }
}

const FENCE = /```dg-block/g;

export async function read(
  scope: McpScope,
  principal: McpPrincipal,
  input: { id: string; parts?: string[]; backlinkTypes?: string[] }
): Promise<McpToolResult> {
  try {
    if (!(await scope.nodeInScope(input.id))) return refuse("That item is not reachable with this token.");
    const node = await prisma.contentNode.findFirst({
      where: { id: input.id, ownerId: scope.userId, deletedAt: null },
      include: {
        notePayload: { select: { tiptapJson: true } },
        codePayload: { select: { code: true, language: true } },
        htmlPayload: { select: { searchText: true } },
        externalPayload: { select: { url: true, description: true, readingStatus: true, resourceType: true } },
        filePayload: { select: { fileName: true, mimeType: true, fileSize: true, searchText: true } },
        dataPayload: { select: { rowCount: true, description: true } },
        contentTags: { select: { tag: { select: { name: true, slug: true } } } },
        parent: { select: { id: true, title: true } },
      },
    });
    if (!node) return refuse("That item does not exist.");
    const parts = new Set(input.parts && input.parts.length > 0 ? input.parts : ["body", "tags", "context"]);
    const cap = principal.token.readTokenCap ?? DEFAULT_READ_TOKEN_CAP;
    const structured: Record<string, unknown> = {
      id: node.id,
      type: node.contentType,
      title: node.title,
      updatedAt: node.updatedAt.toISOString(),
      parent: node.parent ? { id: node.parent.id, title: node.parent.title } : null,
    };
    const sections: string[] = [`# ${node.title}\n(${node.contentType}, ${node.id}, updated ${node.updatedAt.toISOString()}${node.parent ? `, in "${node.parent.title}"` : ""})`];
    const images: ImageBlock[] = [];

    if (parts.has("tags")) {
      const tags = node.contentTags.map((t) => t.tag.slug);
      structured.tags = tags;
      if (tags.length > 0) sections.push(`Tags: ${tags.map((t) => `#${t}`).join(" ")}`);
    }

    if (parts.has("body")) {
      let body = "";
      switch (node.contentType) {
        case "note": {
          const json = (node.notePayload?.tiptapJson as JSONContent | undefined) ?? { type: "doc", content: [] };
          body = renderNoteForMcp(json);
          // In-app download links need a session cookie no MCP client has;
          // swap them for short-lived storage URLs (fetchable by anyone who
          // holds this result for the next 15 minutes).
          const links = await rewriteDownloadLinks(scope.userId, body);
          body = links.text;
          if (links.rewritten > 0) structured.presignedLinks = links.rewritten;
          const fences = (body.match(FENCE) ?? []).length;
          if (fences > 0) body += `\n\n[${fences} \`\`\`dg-block fence${fences === 1 ? "" : "s"} above: blocks the serializer could not express as markdown. Leave them exactly as they are if you write this note back.]`;
          break;
        }
        case "data": {
          body = (await renderDataNodePreview(node.id, { viewerId: scope.userId })) ?? "(empty database)";
          if (parts.has("profile")) {
            const profile = await buildDataSchemaDigest(node.id, { profile: true, viewerId: scope.userId });
            if (profile) body = `${profile}\n\n${body}`;
          }
          const table = await loadTable(node.id, scope.userId);
          if (table) {
            structured.database = {
              rowCount: table.rowCount,
              description: table.description,
              columns: table.columns
                .filter((c) => !c.deletedAt)
                .map((c) => ({ key: c.key, name: c.name, type: c.type, description: c.description, config: c.config })),
              views: table.views.map((v) => ({ id: v.id, name: v.name, mode: v.mode })),
              aiPolicy: table.aiPolicy,
            };
          }
          break;
        }
        case "folder": {
          const listing = await listTree(scope, node.id, 1);
          body = "refusal" in listing ? listing.refusal : renderTree([], listing.entries);
          const capsule = await assembleFolderCapsule(scope.userId, node.id).catch(() => null);
          if (capsule?.text) body = `${capsule.text}\n\n## Contents\n${body}`;
          break;
        }
        case "code":
          body = `\`\`\`${node.codePayload?.language ?? ""}\n${node.codePayload?.code ?? ""}\n\`\`\``;
          structured.language = node.codePayload?.language ?? null;
          break;
        case "html":
          body = node.htmlPayload?.searchText ?? "";
          break;
        case "external":
          body = [`URL: ${node.externalPayload?.url ?? ""}`, node.externalPayload?.description ? `Description: ${node.externalPayload.description}` : "", `Reading status: ${node.externalPayload?.readingStatus ?? ""}`].filter(Boolean).join("\n");
          structured.url = node.externalPayload?.url ?? null;
          break;
        case "file": {
          const f = node.filePayload;
          structured.file = f ? { fileName: f.fileName, mimeType: f.mimeType, bytes: Number(f.fileSize) } : null;
          body = f
            ? `${f.fileName} (${f.mimeType}, ${Number(f.fileSize)} bytes)${f.searchText ? `\n\n## Extracted text\n${f.searchText}` : "\n\n(No text was extracted for this file.)"}`
            : "(no file payload)";
          // A fetchable URL for clients that can fetch, and for images the
          // pixels themselves, so a model sees the picture without a cookie.
          const signed = await presignFile(scope.userId, node.id).catch(() => null);
          if (signed) {
            structured.presignedUrl = signed.url;
            structured.presignedExpiresInSeconds = 900;
            body += `\n\nDownload (15 min): ${signed.url}`;
          }
          if (f?.mimeType.startsWith("image/")) {
            const block = await imageBlock(scope.userId, node.id).catch(() => null);
            if (block) {
              images.push(block);
              body += "\n\n[The image itself is attached to this result.]";
            } else {
              body += "\n\n[Image too large to attach; use the download link.]";
            }
          }
          break;
        }
        case "shortcut":
          body = "This is a shortcut; read its target instead.";
          break;
        default:
          body = `(${node.contentType} content has no text rendering yet)`;
      }
      const capped = capText(body, cap, "Narrow the read with parts, or for a database use garden_query_rows.");
      structured.truncated = capped.truncated;
      // The body goes into BOTH channels. Claude Code renders only
      // structuredContent when a tool returns one, so a body that lives
      // only in the text block never reaches that client.
      structured.body = capped.text;
      sections.push(capped.text);
    }

    if (parts.has("outline") && node.notePayload?.tiptapJson) {
      const json = node.notePayload.tiptapJson as JSONContent;
      const blocks = findBlocksInDoc(stripPrivateContent(json)).map((b) => ({
        blockId: b.blockId,
        blockType: b.blockType,
        attrs: Object.fromEntries(Object.entries(b.attrs).filter(([k]) => k !== "blockId" && k !== "blockType")),
      }));
      const headings = (json.content ?? [])
        .filter((n) => n.type === "heading")
        .map((n) => `${"#".repeat(Number((n.attrs as { level?: number } | undefined)?.level ?? 1))} ${extractSearchTextFromTipTap(n)}`);
      structured.outline = { headings, blocks };
      sections.push(`## Outline\n${headings.join("\n") || "(no headings)"}\n\nBlocks (${blocks.length}):\n${blocks.map((b) => `- ${b.blockType} [${b.blockId}]`).join("\n") || "(none)"}`);
    }

    if (parts.has("backlinks")) {
      const wantTypes = new Set(input.backlinkTypes && input.backlinkTypes.length > 0 ? input.backlinkTypes : ["note", "folder", "data", "file", "code", "html", "external", "visualization", "workflow", "shortcut"]);
      const found = await findBacklinks(scope.userId, { id: node.id, slug: node.slug, title: node.title });
      const allowed = await scope.subtreeIds();
      const links: Array<Record<string, unknown>> = [];
      for (const b of found.backlinks.slice(0, 50)) {
        if (allowed && !allowed.has(b.id)) continue;
        links.push({ id: b.id, type: "note", title: b.title, excerpt: b.excerpt });
      }
      if (wantTypes.has("conversation") && principal.token.capabilities.includes("garden:read-chats")) {
        const chats = await listConversationsByContent(scope.userId, [node.id]);
        for (const c of chats) {
          const a = c.associations.find((x) => x.contentNodeId === node.id);
          links.push({ id: c.conversationId, type: "conversation", title: c.title ?? "Untitled chat", source: a?.source ?? null, lastReferencedAt: a?.lastReferencedAt ?? null });
        }
      }
      structured.backlinks = links;
      structured.backlinksTotal = found.backlinks.length;
      sections.push(`## Backlinks (${links.length}${found.backlinks.length > 50 ? ` of ${found.backlinks.length}` : ""})\n${links.map((l) => `- [${l.type}] ${l.title} (${l.id})${l.excerpt ? ` — ${l.excerpt}` : ""}`).join("\n") || "(none)"}`);
    }

    if (parts.has("context")) {
      const ctx = await readAiContext(scope.userId, node.id);
      structured.aiContext = ctx;
      sections.push(renderAiContext(ctx));
    }

    if (parts.has("images") && node.notePayload?.tiptapJson) {
      const refs = listNoteImages(stripPrivateContent(node.notePayload.tiptapJson as JSONContent))
        .map((i) => i.contentId)
        .filter((id): id is string => typeof id === "string");
      const got = await imageBlocks(scope.userId, refs);
      images.push(...got.blocks);
      structured.images = got.blocks.map((b) => b._meta);
      sections.push(`## Images\n${got.blocks.length} attached${got.skipped > 0 ? `, ${got.skipped} skipped (too large, not an image, or over the per-read cap)` : ""}.`);
    }

    const result = ok(sections.join("\n\n"), structured);
    result.content.push(...images);
    return result;
  } catch (error) {
    logger.warn({ layer: "ai", event: "mcp:read_caught", summary: "garden_read failed", error });
    return internalError("garden_read", error, Object.keys(input));
  }
}
