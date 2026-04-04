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
import { generateImage } from "@/lib/domain/ai/image/generate";
import { IMAGE_PROVIDER_CATALOG } from "@/lib/domain/ai/image/catalog";
import type { ImageProviderId, ImageModelId, ImageSize } from "@/lib/domain/ai/image/types";
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
          const result = await generateImage(
            {
              prompt,
              providerId: providerId as ImageProviderId,
              modelId: modelId as ImageModelId,
              size: size as ImageSize,
              quality,
              style,
            },
            ctx.userId
          );

          // Download/decode the image and upload to storage
          let imageBuffer: Buffer;

          if (result.base64) {
            imageBuffer = Buffer.from(result.base64, "base64");
          } else if (result.url) {
            const imageRes = await fetch(result.url);
            if (!imageRes.ok) {
              throw new Error(`Failed to download generated image: ${imageRes.statusText}`);
            }
            imageBuffer = Buffer.from(await imageRes.arrayBuffer());
          } else {
            throw new Error("Image generation returned neither URL nor base64 data");
          }

          // Upload to storage
          const { getUserStorageProvider } = await import("@/lib/infrastructure/storage");
          const storageProvider = await getUserStorageProvider(ctx.userId);
          const crypto = await import("crypto");
          const checksum = crypto.createHash("sha256").update(imageBuffer).digest("hex");
          const fileExtension = result.mimeType === "image/jpeg" ? "jpg" : "png";
          const timestamp = Date.now();
          const storageKey = `uploads/${ctx.userId}/ai-gen-${timestamp}-${crypto.randomBytes(8).toString("hex")}.${fileExtension}`;

          await storageProvider.uploadFile(storageKey, imageBuffer, result.mimeType);

          // Create ContentNode + FilePayload
          const truncatedPrompt = prompt.slice(0, 60).replace(/[^a-zA-Z0-9\s-]/g, "").trim();
          const fileName = `${truncatedPrompt || "ai-image"}.${fileExtension}`;
          const slug = await generateUniqueSlug(fileName, ctx.userId);

          const content = await prisma.contentNode.create({
            data: {
              ownerId: ctx.userId,
              title: fileName,
              slug,
              contentType: "file",
              parentId: null,
              role: "referenced",
              displayOrder: 0,
              filePayload: {
                create: {
                  fileName,
                  fileExtension,
                  mimeType: result.mimeType,
                  fileSize: BigInt(imageBuffer.length),
                  checksum,
                  storageProvider: "r2",
                  storageKey,
                  searchText: `AI generated image: ${prompt}`,
                  uploadStatus: "ready",
                  uploadedAt: new Date(),
                  isProcessed: true,
                  processingStatus: "complete",
                  width: result.width || null,
                  height: result.height || null,
                },
              },
            },
          });

          const publicUrl = await storageProvider.generateDownloadUrl(storageKey);

          // Return structured result for ChatMessage rendering
          return JSON.stringify({
            __imagePayload: true,
            contentId: content.id,
            url: publicUrl,
            prompt,
            revisedPrompt: result.revisedPrompt || null,
            providerId: result.providerId,
            modelId: result.modelId,
            width: result.width,
            height: result.height,
            fileName,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Image generation failed";
          return `Image generation failed: ${message}`;
        }
      },
    }),
  };
}

// Tool IDs and metadata are in ./metadata.ts (client-safe, no Prisma imports)
