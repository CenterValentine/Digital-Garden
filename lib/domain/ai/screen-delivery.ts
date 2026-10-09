/**
 * Hand `view_screen` screenshots to the model. AI-VIEW-SCREEN-PLAN.md D8.
 *
 * The transcript stores a screenshot as a URL inside the tool's JSON result
 * (D7). Converted as-is, every provider would receive that JSON as text: the
 * model would read a link and never see the picture. This post-pass runs on
 * the MODEL messages, after convertToModelMessages, and rewrites only
 * image-bearing results (`view_screen`, `view_image`) that still carry an image.
 * Also applied in prepareStep, so a server-run view_image is seen in the same
 * request:
 *
 *   - "native": the result becomes text + image-url content — the image is
 *     the tool's own output. Anthropic and OpenAI's Responses API accept this
 *     (read in their adapters, 2026-10-09).
 *   - "user-part": the result becomes the text summary, followed by ONE user
 *     message holding the image(s), labelled as tool output. Every vision
 *     provider accepts an image in a user message, and the SDK downloads the
 *     URL for those that cannot take one (Google). Used for every adapter not
 *     verified native — Google takes only inline bytes in a tool result, and
 *     xAI / Mistral / DeepSeek / Groq / OpenAI-compatible endpoints stringify
 *     tool-result content.
 *
 * Why a post-pass rather than `convertToModelMessages(…, { tools })`: that
 * would change how EVERY tool's history converts. This touches only
 * view_screen parts, so every other byte — and the prompt cache — stays put.
 *
 * Folded results (an earlier turn, context-diet D9) are plain-text stubs with
 * no image, so they pass through untouched and their URLs are never sent.
 * Pure and idempotent; pinned by `pnpm view-screen:check`.
 */
import type { ModelMessage } from "ai";

import { VIEW_IMAGE } from "./tools/view-image";
import { VIEW_SCREEN, screenImageOf, screenSummary, type ViewScreenResult } from "./tools/view-screen";

/** Tools whose result carries an image for the model (same result shape). */
export const IMAGE_TOOL_NAMES: ReadonlySet<string> = new Set([VIEW_SCREEN, VIEW_IMAGE]);

export type ScreenDeliveryMode = "native" | "user-part";

/** Adapters whose tool results carry images (verified in their converters). */
const NATIVE_ADAPTERS = new Set(["anthropic", "openai"]);

/**
 * Keyed on the connection's ADAPTER, not the vendor: a gateway serving
 * `anthropic/…` names vendor anthropic but speaks the gateway's protocol,
 * which is unverified for tool-result images.
 */
export function screenDeliveryMode(adapterKind: string | null | undefined): ScreenDeliveryMode {
  return adapterKind && NATIVE_ADAPTERS.has(adapterKind) ? "native" : "user-part";
}

type ToolMessage = Extract<ModelMessage, { role: "tool" }>;
type ToolContentPart = ToolMessage["content"][number];

/** The label on a user-part image — so the model never mistakes it for the user speaking. */
export function screenUserPartLabel(calls: Array<{ toolName: string; toolCallId: string }>): string {
  const named = calls.map((c) => `${c.toolName} call ${c.toolCallId}`).join(", ");
  return `Image${calls.length > 1 ? "s" : ""} returned by ${named}. This is tool output, not a message from the user.`;
}

/** The JSON value of a converted tool result, or null. */
function jsonOutputOf(part: ToolContentPart): ViewScreenResult | null {
  if (part.type !== "tool-result" || !IMAGE_TOOL_NAMES.has(part.toolName)) return null;
  const output = part.output as { type?: string; value?: unknown };
  if (output?.type !== "json") return null;
  return screenImageOf(output.value) ? (output.value as ViewScreenResult) : null;
}

export function deliverScreenCaptures(messages: ModelMessage[], mode: ScreenDeliveryMode): ModelMessage[] {
  const out: ModelMessage[] = [];
  let changed = false;
  for (const message of messages) {
    if (message.role !== "tool") {
      out.push(message);
      continue;
    }
    const images: Array<{ toolName: string; toolCallId: string; url: string; mediaType: string }> = [];
    const content = message.content.map((part): ToolContentPart => {
      const result = jsonOutputOf(part);
      if (!result || part.type !== "tool-result") return part;
      const image = screenImageOf(result)!;
      const text = screenSummary(result);
      if (mode === "native") {
        return {
          ...part,
          output: { type: "content", value: [{ type: "text", text }, { type: "image-url", url: image.url }] },
        };
      }
      images.push({ toolName: part.toolName, toolCallId: part.toolCallId, ...image });
      return { ...part, output: { type: "text", value: text } };
    });
    if (content.every((part, i) => part === message.content[i])) {
      out.push(message);
      continue;
    }
    changed = true;
    out.push({ ...message, content });
    if (images.length > 0) {
      out.push({
        role: "user",
        content: [
          { type: "text", text: screenUserPartLabel(images) },
          ...images.map((i) => ({ type: "image" as const, image: new URL(i.url), mediaType: i.mediaType })),
        ],
      });
    }
  }
  return changed ? out : messages;
}
