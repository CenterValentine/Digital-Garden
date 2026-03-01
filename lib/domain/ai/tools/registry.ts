/**
 * Base AI Tools Registry
 *
 * Hard-coded tools available to the AI chat system.
 * Each tool has a Zod parameter schema and an execute function
 * that runs server-side with authenticated user context.
 *
 * Tools are passed to AI SDK's `streamText({ tools })`.
 * The model decides when to invoke them based on conversation context.
 */

import { tool } from "ai";
import { z } from "zod/v4";
import { prisma } from "@/lib/database/client";
import {
  generateUniqueSlug,
  extractSearchTextFromTipTap,
  markdownToTiptap,
} from "@/lib/domain/content";
import type { ToolExecuteContext } from "./types";

/**
 * Create the base AI tools, bound to a specific user's context.
 *
 * We return a factory function (not a static object) because each tool's
 * `execute` needs the authenticated `userId` — which is only available
 * at request time in the API route.
 */
export function createBaseTools(ctx: ToolExecuteContext) {
  return {
    searchNotes: tool({
      description:
        "Search the user's notes by title or content. Returns matching note titles and excerpts.",
      inputSchema: z.object({
        query: z.string().describe("Search query to find notes"),
        limit: z
          .number()
          .min(1)
          .max(20)
          .optional()
          .describe("Maximum number of results (default 5)"),
      }),
      execute: async ({ query, limit = 5 }) => {
        const results = await prisma.contentNode.findMany({
          where: {
            ownerId: ctx.userId,
            deletedAt: null,
            contentType: "note",
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              {
                notePayload: {
                  searchText: { contains: query, mode: "insensitive" },
                },
              },
            ],
          },
          include: {
            notePayload: {
              select: { searchText: true },
            },
          },
          orderBy: { updatedAt: "desc" },
          take: limit,
        });

        if (results.length === 0) {
          return `No notes found matching "${query}".`;
        }

        const summaries = results.map((r, i) => {
          const excerpt = r.notePayload?.searchText?.slice(0, 150) || "";
          return `${i + 1}. "${r.title}" (id: ${r.id})${excerpt ? `\n   ${excerpt}...` : ""}`;
        });

        return `Found ${results.length} note${results.length !== 1 ? "s" : ""} matching "${query}":\n\n${summaries.join("\n\n")}`;
      },
    }),

    getCurrentNote: tool({
      description:
        "Get the full content of a specific note by its ID. Useful for reading context about a note the user is viewing.",
      inputSchema: z.object({
        contentId: z.string().uuid().describe("The content node ID to read"),
      }),
      execute: async ({ contentId }) => {
        const content = await prisma.contentNode.findFirst({
          where: {
            id: contentId,
            ownerId: ctx.userId,
            deletedAt: null,
          },
          include: {
            notePayload: {
              select: { searchText: true },
            },
          },
        });

        if (!content) {
          return `Note with ID "${contentId}" not found or not accessible.`;
        }

        if (content.contentType !== "note" || !content.notePayload) {
          return `Content "${content.title}" is a ${content.contentType}, not a note. Cannot read its text content.`;
        }

        const text = content.notePayload.searchText || "(empty note)";
        return `Title: ${content.title}\nType: ${content.contentType}\nUpdated: ${content.updatedAt.toISOString()}\n\nContent:\n${text}`;
      },
    }),

    createNote: tool({
      description:
        "Create a new note in the user's Digital Garden. Returns the new note's ID and title.",
      inputSchema: z.object({
        title: z
          .string()
          .min(1)
          .max(255)
          .describe("Title for the new note"),
        content: z
          .string()
          .optional()
          .describe("Markdown content for the note (optional)"),
      }),
      execute: async ({ title, content = "" }) => {
        const slug = await generateUniqueSlug(title, ctx.userId);
        const tiptapJson = content
          ? markdownToTiptap(content)
          : { type: "doc", content: [{ type: "paragraph" }] };
        const searchText = extractSearchTextFromTipTap(tiptapJson);
        const wordCount = searchText.split(/\s+/).filter(Boolean).length;

        const node = await prisma.contentNode.create({
          data: {
            ownerId: ctx.userId,
            title,
            slug,
            contentType: "note",
            notePayload: {
              create: {
                tiptapJson,
                searchText,
                metadata: {
                  wordCount,
                  characterCount: searchText.length,
                  readingTime: Math.ceil(wordCount / 200),
                },
              },
            },
          },
        });

        return `Created note "${title}" (id: ${node.id}). ${content ? `Contains ${wordCount} words.` : "Empty note created."}`;
      },
    }),
  };
}

// Tool IDs and metadata are in ./metadata.ts (client-safe, no Prisma imports)
