/**
 * POST /api/ai/image-text — read an image's text with the user's vision model.
 * OCR-PASTE-PLAN.md D13; guide: docs/notes-feature/guides/editor/OCR-PIPELINE.md.
 *
 * The opt-in counterpart to the on-device engine: ⌥⌘V (Ctrl+Alt+V) sends the
 * pasted image here. The model is whatever the user routed to the
 * "image-text" feature (Settings → AI → Feature Routing); unrouted, the
 * registry default, else the first vision-capable model they have connected.
 *
 * Body: multipart form, field `image` (the image file, ≤ MAX_BYTES — the
 * client downscales larger images first; Vercel caps bodies at 4.5 MB).
 * Returns `{ success, text, model }` — `text` is markdown (tables as GFM
 * tables), ready for the editor's paste pipeline; `model` names who read it,
 * so the client can tell the user where the image went.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/infrastructure/auth/middleware";

const MAX_BYTES = 4_000_000;

/**
 * What the model is asked to do. Markdown out, because the editor's paste
 * parser turns GFM tables, lists and headings into real blocks.
 */
const INSTRUCTIONS = [
  "Transcribe all of the text in this image, exactly as written.",
  "Return GitHub-flavoured markdown only — no commentary, no preamble, no code fence around the whole answer.",
  "Tables: reproduce them as markdown tables with the same columns; join a cell that wraps onto several lines into one cell.",
  "Lists: keep them as markdown lists. Headings: keep them as markdown headings.",
  "Code or terminal output: put it in a fenced code block, keeping its line breaks.",
  "Ignore icons, logos, checkmarks, avatars and other purely decorative glyphs.",
  "Keep the original language and spelling; do not translate or correct.",
  "If the image contains no text, return an empty response.",
].join("\n");

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = (await requireAuth()).user.id;
  } catch {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const image = form?.get("image");
  if (!(image instanceof Blob) || !image.type.startsWith("image/")) {
    return NextResponse.json({ success: false, error: "Send an image in the `image` field." }, { status: 400 });
  }
  if (image.size > MAX_BYTES) {
    return NextResponse.json({ success: false, error: "That image is too large to send for reading." }, { status: 413 });
  }

  const [{ generateText }, { resolveChatModelFromConnection }, { resolvePrimaryRoute }] = await Promise.all([
    import("ai"),
    import("@/lib/domain/ai/providers/registry"),
    import("@/lib/domain/ai/features/router"),
  ]);

  const route = await resolvePrimaryRoute(userId, "image-text").catch(() => null);
  if (!route) {
    return NextResponse.json(
      {
        success: false,
        error:
          "No vision-capable AI model is connected. Add one in Settings → AI → Connections, or choose one under Feature Routing → Read Text in Images (AI).",
      },
      { status: 422 },
    );
  }

  try {
    const model = await resolveChatModelFromConnection(route.connection, route.modelId);
    const { text } = await generateText({
      model,
      maxOutputTokens: 4000,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: INSTRUCTIONS },
            { type: "file", data: new Uint8Array(await image.arrayBuffer()), mediaType: image.type },
          ],
        },
      ],
    });
    return NextResponse.json({
      success: true,
      text: text.trim(),
      model: `${route.connection.label} · ${route.modelId}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: `The model could not read the image: ${message}` }, { status: 502 });
  }
}
