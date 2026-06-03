/**
 * Suggested follow-ups (Session 7).
 *
 * After an assistant reply finishes, the client calls
 * `/api/ai/follow-ups` which delegates to `generateFollowUps()` below.
 * The model is chosen via Feature Routing under the `follow-ups`
 * feature; when no route is configured we fall back to the active
 * conversation's provider/model so something always works.
 *
 * Output: a small array of next-prompt suggestions (2-3 items).
 * Failures return an empty array — UX never blocks on this.
 */

import { generateObject } from "ai";
import { z } from "zod/v4";
import { resolveChatModel } from "@/lib/domain/ai/providers/registry";
import { resolvePrimaryRoute } from "@/lib/domain/ai/features/router";
import { resolveChatModelFromConnection } from "@/lib/domain/ai/providers/registry";
import {
  getConnectionWithKey,
  listConnections,
} from "@/lib/features/ai-connections";
import { getUserSettings } from "@/lib/features/settings";
import { logger } from "@/lib/core/logger";

/** Zod schema for the generator's structured output. */
const FollowUpsSchema = z.object({
  suggestions: z
    .array(z.string().min(1).max(140))
    .min(2)
    .max(3)
    .describe(
      "Two or three short follow-up prompts the user could reasonably send next.",
    ),
});

export interface GenerateFollowUpsArgs {
  userId: string;
  lastUserText: string;
  lastAssistantText: string;
  /** Provider stamped on the last assistant message — used as fallback. */
  fallbackProviderId?: string;
  fallbackModelId?: string;
}

/**
 * Generate 2-3 short follow-up prompt suggestions.
 *
 * Returns `[]` on any failure so callers can render nothing instead of
 * an error state — follow-ups are decorative, not load-bearing.
 */
export async function generateFollowUps(
  args: GenerateFollowUpsArgs,
): Promise<string[]> {
  const { userId, lastUserText, lastAssistantText } = args;
  if (!lastAssistantText.trim()) return [];

  try {
    const route = await resolvePrimaryRoute(userId, "follow-ups");
    let model;
    if (route) {
      // Configured Feature Route wins.
      model = await resolveChatModelFromConnection(
        route.connection,
        route.modelId,
      );
    } else {
      // Try Connection-based fallback first: look up any of the user's
      // active Connections whose presetId matches the active chat's
      // provider. This keeps follow-ups working even without an
      // explicit Feature Route, AND avoids the legacy `resolveChatModel`
      // path (which still references the deleted AIProviderKey table).
      const fallbackProvider = args.fallbackProviderId ?? null;
      const fallbackModel = args.fallbackModelId ?? null;
      const all = await listConnections(userId);
      const conn =
        (fallbackProvider &&
          all.find((c) => c.presetId === fallbackProvider)) ||
        all[0];
      if (conn && fallbackModel) {
        // resolveChatModelFromConnection needs the decrypted key.
        const withKey = await getConnectionWithKey(userId, conn.id);
        model = await resolveChatModelFromConnection(withKey, fallbackModel);
      } else {
        // Last-resort legacy path. May throw if the AIProviderKey
        // table is gone — caller catches and renders no suggestions.
        model = await resolveChatModel({
          providerId: (fallbackProvider ?? "anthropic") as
            | "anthropic"
            | "openai"
            | "google"
            | "xai"
            | "mistral"
            | "groq",
          modelId: fallbackModel ?? "claude-haiku-3-5",
        });
      }
    }

    // Optional user-supplied steering — appended to the default
    // instructions so the model can still produce well-formed structured
    // output. Read defensively: bad/missing settings must not break
    // generation (we just fall back to the default prompt).
    let userGuidance = "";
    try {
      const settings = await getUserSettings(userId);
      const raw = (settings.ai as { followUpsPrompt?: unknown } | undefined)
        ?.followUpsPrompt;
      if (typeof raw === "string" && raw.trim().length > 0) {
        userGuidance = raw.trim().slice(0, 600);
      }
    } catch {
      /* settings unavailable — generate with defaults */
    }

    const promptLines = [
      "You are helping a user continue an AI chat.",
      "Given the exchange below, return 2-3 short follow-up prompts the",
      "user could reasonably send next. Phrase them as questions or",
      "instructions in the user's voice (first-person, imperative or",
      "interrogative). Each must stand alone and be under ~120 chars.",
      "Do not number them. Do not preface with 'You could ask:' etc.",
    ];
    if (userGuidance) {
      promptLines.push(
        "",
        "Additional guidance from the user (steers the suggestions):",
        userGuidance,
      );
    }
    promptLines.push(
      "",
      `User: ${truncate(lastUserText, 800)}`,
      `Assistant: ${truncate(lastAssistantText, 1600)}`,
    );

    const result = await generateObject({
      // resolveChat* returns the right language-model shape but the
      // shared type is wider; cast at the call boundary keeps the helper
      // tolerant to both direct and connection-routed models.
      model,
      schema: FollowUpsSchema,
      prompt: promptLines.join("\n"),
    });

    return result.object.suggestions;
  } catch (err) {
    // Log the actual failure so the silent return-[] doesn't hide
    // real bugs (e.g. resolver broken, schema validation failing).
    logger.warn({
      layer: "ai",
      event: "follow_ups.generate.failed",
      summary: "follow-up generation failed; returning empty list",
      error: err,
      attrs: {
        fallback_provider: args.fallbackProviderId ?? null,
        fallback_model: args.fallbackModelId ?? null,
      },
    });
    return [];
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
