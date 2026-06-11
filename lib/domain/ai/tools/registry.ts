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
import type { Prisma } from "@/lib/database/generated/prisma";
import {
  generateUniqueSlug,
  extractSearchTextFromTipTap,
  markdownToTiptap,
} from "@/lib/domain/content";
import { generateAndStoreImage } from "@/lib/domain/ai/image/generate-and-store";
import { IMAGE_PROVIDER_CATALOG } from "@/lib/domain/ai/image/catalog";
import type { ImageProviderId, ImageModelId, ImageSize } from "@/lib/domain/ai/image/types";
import { generateAndStoreSpeech } from "@/lib/domain/ai/speech/generate-and-store";
import { SPEECH_PROVIDER_CATALOG } from "@/lib/domain/ai/speech/catalog";
import {
  describeSpeechError,
  type SpeechProviderId,
  type SpeechModelId,
} from "@/lib/domain/ai/speech/types";
import type { ToolExecuteContext } from "./types";

/**
 * Detect markdownToTiptap's silent fallback. The fallback wraps the
 * entire markdown string as a SINGLE plain-text paragraph — so the user
 * sees raw `### Heading` / `- **Bold**` text in the rendered note
 * instead of structured TipTap nodes (Bug G). When this happens we
 * upgrade to a paragraph-per-blank-line split so at least newline
 * structure survives.
 */
function isMarkdownFallback(
  json: { content?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> },
  source: string,
): boolean {
  const doc = json.content;
  if (!doc || doc.length !== 1) return false;
  const p = doc[0];
  if (!p || p.type !== "paragraph") return false;
  const text = p.content?.[0]?.text;
  return typeof text === "string" && text.trim() === source.trim();
}

function paragraphSplitFallback(source: string) {
  const blocks = source.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  return {
    type: "doc" as const,
    content: blocks.length
      ? blocks.map((block) => ({
          type: "paragraph" as const,
          content: [{ type: "text" as const, text: block }],
        }))
      : [{ type: "paragraph" as const }],
  };
}

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
        "Create a NEW note in the user's Digital Garden. Use this only when the user EXPLICITLY asks for a new file. " +
        "Ambiguous phrasings to watch for: 'update the note in this chat', 'add to this conversation's notes', 'put X in the note' — these do NOT mean 'create a new note'. They typically refer to an existing note. When the phrasing is ambiguous, ASK the user whether to create a new note or update an existing one before calling this tool. " +
        "If they confirm a new note, this is the right tool. If they name an existing note, use `searchNotes` to find its id then use `updateNote`. " +
        "By default the new note is placed in the same folder as the active chat (when the user is chatting from a chat content page). Pass `parentId` to override.",
      inputSchema: z.object({
        title: z
          .string()
          .min(1)
          .max(255)
          .describe("Title for the new note"),
        content: z
          .string()
          .optional()
          .describe(
            "Markdown content for the note (optional). Use standard markdown: # headings, **bold**, *italic*, `code`, bulleted/numbered lists, tables, blockquotes, links, images. The system converts it to rich text.",
          ),
        parentId: z
          .string()
          .uuid()
          .optional()
          .describe(
            "Optional UUID of a folder to create the note in. Defaults to the active chat's parent folder. Omit unless the user names a specific folder.",
          ),
      }),
      execute: async ({ title, content = "", parentId }) => {
        // Resolve the parent folder. Priority:
        //   1. AI-supplied parentId (validated to exist + belong to user)
        //   2. Chat's own parent folder (when in a chat context)
        //   3. null (vault root)
        let resolvedParentId: string | null = null;
        if (parentId) {
          const candidate = await prisma.contentNode.findFirst({
            where: {
              id: parentId,
              ownerId: ctx.userId,
              deletedAt: null,
              contentType: "folder",
            },
            select: { id: true },
          });
          if (candidate) resolvedParentId = candidate.id;
        }
        if (!resolvedParentId && ctx.chatContentId) {
          const chatNode = await prisma.contentNode.findFirst({
            where: { id: ctx.chatContentId, ownerId: ctx.userId },
            select: { parentId: true },
          });
          resolvedParentId = chatNode?.parentId ?? null;
        }

        const slug = await generateUniqueSlug(title, ctx.userId);
        // markdownToTiptap → marked → generateJSON pipeline. If it throws,
        // the internal fallback wraps raw markdown as plain text — which
        // produces the "raw ### headings showing in the note" bug. Detect
        // that fallback (single paragraph whose text equals the input) and
        // upgrade to a paragraph-per-blank-line split so at least line
        // breaks survive. The full markdown features depend on the
        // pipeline succeeding upstream.
        let tiptapJson = content
          ? markdownToTiptap(content)
          : { type: "doc", content: [{ type: "paragraph" }] };
        if (content && isMarkdownFallback(tiptapJson, content)) {
          tiptapJson = paragraphSplitFallback(content);
        }
        const searchText = extractSearchTextFromTipTap(tiptapJson);
        const wordCount = searchText.split(/\s+/).filter(Boolean).length;

        const node = await prisma.contentNode.create({
          data: {
            ownerId: ctx.userId,
            title,
            slug,
            contentType: "note",
            parentId: resolvedParentId,
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

        // Structured payload so ChatMessage renders a clickable link to the
        // new note + a signal the client uses to refresh the file tree
        // without a full page reload. Mirrors the __imagePayload pattern.
        return JSON.stringify({
          __notePayload: true,
          kind: "created",
          contentId: node.id,
          title,
          parentId: resolvedParentId,
          wordCount,
        });
      },
    }),

    updateNote: tool({
      description:
        "Update the markdown/TipTap notes attached to a content item. " +
        "WORKS ON ANY CONTENT TYPE: notes (full-page editor), chats (the 'Add notes' panel below the chat), folders, files, externals, etc. — every content type has an optional sidecar NotePayload keyed by its contentId. " +
        "Common phrasings: 'update this conversation's notes', 'add to my Sourdough note', 'put X in the notes for this chat'. " +
        "If the user is chatting in a full-page chat and asks to update 'the note in this chat' or 'this chat's notes', pass the CHAT's contentId here — that updates the notes panel attached to the chat itself, not a separate file. " +
        "Do NOT use this to create new top-level notes — use `createNote` for that. " +
        "RENAME RULE: do NOT set the `title` argument unless the user EXPLICITLY asks to rename (e.g. 'rename this to X'). Mentioning a topic or theme is NOT a rename request. NEVER set `title` when the target is the user's open chat — renaming a chat while updating its notes is wrong.",
      inputSchema: z.object({
        contentId: z
          .string()
          .uuid()
          .describe(
            "UUID of the content whose notes to update. For 'this chat's notes' this is the CHAT's contentId, not a separate note.",
          ),
        content: z
          .string()
          .min(1)
          .describe(
            "Full new markdown content for the notes. This replaces the current notes; if the user wants to append, include the existing content in this string.",
          ),
        title: z
          .string()
          .min(1)
          .max(255)
          .optional()
          .describe(
            "New title for the content. ONLY set this if the user explicitly asked to rename. NEVER set when updating a chat's notes.",
          ),
      }),
      execute: async ({ contentId, content, title }) => {
        // Allow updateNote against ANY content type the user owns —
        // notes, chats (their 'Add notes' sidecar), folders, files, etc.
        // The legacy filter of `contentType: "note"` was the cause of the
        // "you can't update this chat's notes" behavior the user reported.
        const existing = await prisma.contentNode.findFirst({
          where: {
            id: contentId,
            ownerId: ctx.userId,
            deletedAt: null,
          },
          select: { id: true, title: true, contentType: true },
        });
        if (!existing) {
          return `Content "${contentId}" not found or deleted. Use searchNotes to find the right id.`;
        }

        // Hard rename-guard: never rename when the target IS the active
        // chat. This protects against the AI inferring a title from the
        // user's update prompt and silently rewriting the chat's name.
        const isUpdatingActiveChat =
          ctx.chatContentId !== undefined && contentId === ctx.chatContentId;
        const titleToApply = isUpdatingActiveChat ? undefined : title;

        let tiptapJson = markdownToTiptap(content);
        if (isMarkdownFallback(tiptapJson, content)) {
          tiptapJson = paragraphSplitFallback(content);
        }
        const searchText = extractSearchTextFromTipTap(tiptapJson);
        const wordCount = searchText.split(/\s+/).filter(Boolean).length;

        // Upsert (not nested update) because non-note content types may
        // not have a NotePayload row yet. Mirrors the PATCH route's
        // unified write path.
        await prisma.notePayload.upsert({
          where: { contentId },
          update: {
            tiptapJson: tiptapJson as unknown as Prisma.InputJsonValue,
            searchText,
            metadata: {
              wordCount,
              characterCount: searchText.length,
              readingTime: Math.ceil(wordCount / 200),
            },
          },
          create: {
            contentId,
            tiptapJson: tiptapJson as unknown as Prisma.InputJsonValue,
            searchText,
            metadata: {
              wordCount,
              characterCount: searchText.length,
              readingTime: Math.ceil(wordCount / 200),
            },
          },
        });
        if (titleToApply) {
          await prisma.contentNode.update({
            where: { id: contentId },
            data: { title: titleToApply },
          });
        }

        return JSON.stringify({
          __notePayload: true,
          kind: "updated",
          contentId: existing.id,
          title: titleToApply ?? existing.title,
          wordCount,
          targetKind: existing.contentType,
        });
      },
    }),

    generate_image: tool({
      description:
        "Generate an AI image from a text prompt. The image is saved to storage and can be inserted into a document. " +
        "Available providers: " +
        IMAGE_PROVIDER_CATALOG.map((p) => `${p.name} (${p.models.map((m) => m.name).join(", ")})`).join("; ") +
        ". Choose the provider and model best suited to the user's request. Default to dall-e-3 if the user doesn't specify.",
      inputSchema: z.object({
        prompt: z
          .string()
          .min(1)
          .describe("Detailed text prompt describing the desired image. Be specific about style, composition, colors, and subject."),
        providerId: z
          .enum(["openai", "google", "deepai", "fal", "together", "fireworks", "runway", "artbreeder"] as const)
          .optional()
          .default("openai")
          .describe("Image generation provider to use"),
        modelId: z
          .string()
          .optional()
          .default("dall-e-3")
          .describe("Specific model ID (e.g. dall-e-3, gpt-image-1, imagen-3, fal-flux-dev)"),
        size: z
          .enum(["256x256", "512x512", "1024x1024", "1024x1792", "1792x1024"] as const)
          .optional()
          .default("1024x1024")
          .describe("Image dimensions. Use 1024x1792 for portrait, 1792x1024 for landscape."),
        quality: z
          .enum(["standard", "hd"] as const)
          .optional()
          .describe("Quality level (OpenAI only). HD produces more detailed images."),
        style: z
          .enum(["natural", "vivid"] as const)
          .optional()
          .describe("Style hint (DALL-E 3 only). Vivid is more dramatic, natural is more realistic."),
      }),
      execute: async ({ prompt, providerId, modelId, size, quality, style }) => {
        try {
          const stored = await generateAndStoreImage({
            prompt,
            userId: ctx.userId,
            providerId: providerId as ImageProviderId,
            modelId: modelId as ImageModelId,
            size: size as ImageSize,
            quality,
            style,
          });

          // Return structured result for ChatMessage rendering
          return JSON.stringify({
            __imagePayload: true,
            contentId: stored.contentId,
            url: stored.url,
            prompt,
            revisedPrompt: stored.revisedPrompt,
            providerId: stored.providerId,
            modelId: stored.modelId,
            width: stored.width,
            height: stored.height,
            fileName: stored.fileName,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Image generation failed";
          return `Image generation failed: ${message}`;
        }
      },
    }),

    generate_speech: tool({
      description:
        "Convert text to spoken audio (text-to-speech). The audio is saved to storage and rendered as an inline player. " +
        "Available providers: " +
        SPEECH_PROVIDER_CATALOG.map((p) => `${p.name} (${p.models.map((m) => m.name).join(", ")})`).join("; ") +
        ". Default to OpenAI tts-1 if the user doesn't specify a provider or voice.",
      inputSchema: z.object({
        text: z
          .string()
          .min(1)
          .describe("The text to speak aloud. Keep it concise; long passages cost more and take longer."),
        providerId: z
          .enum(["openai", "elevenlabs", "google"] as const)
          .optional()
          .default("openai")
          .describe("Text-to-speech provider to use"),
        modelId: z
          .string()
          .optional()
          .default("tts-1")
          .describe("Specific model ID (e.g. tts-1, tts-1-hd, eleven_multilingual_v2, google-tts-neural2)"),
        voice: z
          .string()
          .optional()
          .describe("Voice id/name (e.g. alloy, nova for OpenAI; a voiceId for ElevenLabs; en-US-Neural2-A for Google)"),
        language: z
          .string()
          .optional()
          .describe("Language hint as an ISO 639-1 code (e.g. en, es, fr) when relevant"),
      }),
      execute: async ({ text, providerId, modelId, voice, language }) => {
        try {
          const stored = await generateAndStoreSpeech({
            text,
            userId: ctx.userId,
            providerId: providerId as SpeechProviderId,
            modelId: modelId as SpeechModelId,
            voice,
            language,
          });

          // Return structured result for ChatMessage rendering (mirrors
          // __imagePayload).
          return JSON.stringify({
            __audioPayload: true,
            contentId: stored.contentId,
            url: stored.url,
            text,
            mimeType: stored.mimeType,
            durationSeconds: stored.durationSeconds,
            providerId: stored.providerId,
            modelId: stored.modelId,
            fileName: stored.fileName,
          });
        } catch (error) {
          // Swap the low-level "no key" error for actionable setup guidance
          // (points at Connections + Feature Routing → Text-to-Speech).
          return `Speech generation failed: ${describeSpeechError(error)}`;
        }
      },
    }),
  };
}

// Tool IDs and metadata are in ./metadata.ts (client-safe, no Prisma imports)
