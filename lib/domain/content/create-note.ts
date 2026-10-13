import "server-only";

/**
 * Create a note from markdown — the server-side half of "write a new note".
 *
 * Chat's `create_note` does the same inline (slug, hardened conversion,
 * wiki-link enrichment, search text, stats). This service exists so the
 * MCP server creates notes exactly that way; chat's inline copy is
 * backlogged to converge on it.
 */

import type { JSONContent } from "@tiptap/core";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { generateUniqueSlug } from "@/lib/domain/content/slug";
import { markdownToTiptapResult } from "@/lib/domain/content/markdown";
import { extractSearchTextFromTipTap } from "@/lib/domain/content/search-text";
import { linkifyWikiRefsInTiptap } from "@/lib/domain/editor/wiki-link-refs";

export interface CreateNoteInput {
  ownerId: string;
  title: string;
  parentId: string | null;
  markdown: string;
}

export interface CreateNoteResult {
  id: string;
  slug: string;
  degraded: boolean;
  json: JSONContent;
}

export async function createNoteFromMarkdown(input: CreateNoteInput): Promise<CreateNoteResult> {
  const slug = await generateUniqueSlug(input.title, input.ownerId);
  const conversion = input.markdown.trim()
    ? markdownToTiptapResult(input.markdown)
    : { json: { type: "doc", content: [{ type: "paragraph" }] } as JSONContent, degraded: false };
  const tiptapJson = linkifyWikiRefsInTiptap(conversion.json);
  const searchText = extractSearchTextFromTipTap(tiptapJson);
  const wordCount = searchText.split(/\s+/).filter(Boolean).length;

  const node = await prisma.contentNode.create({
    data: {
      ownerId: input.ownerId,
      title: input.title,
      slug,
      contentType: "note",
      parentId: input.parentId,
      notePayload: {
        create: {
          tiptapJson: tiptapJson as unknown as Prisma.InputJsonValue,
          searchText,
          metadata: {
            wordCount,
            characterCount: searchText.length,
            readingTime: Math.ceil(wordCount / 200),
            ...(conversion.degraded ? { markdownDegraded: true } : {}),
          } as unknown as Prisma.InputJsonValue,
        },
      },
    },
    select: { id: true, slug: true },
  });
  return { id: node.id, slug: node.slug, degraded: conversion.degraded, json: tiptapJson };
}
