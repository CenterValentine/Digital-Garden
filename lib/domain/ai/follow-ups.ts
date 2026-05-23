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
    const model = route
      ? await resolveChatModelFromConnection(route.connection, route.modelId)
      : await resolveChatModel({
          providerId: (args.fallbackProviderId ?? "anthropic") as
            | "anthropic"
            | "openai"
            | "google"
            | "xai"
            | "mistral"
            | "groq",
          modelId: args.fallbackModelId ?? "claude-haiku-3-5",
        });

    const result = await generateObject({
      // resolveChat* returns the right language-model shape but the
      // shared type is wider; cast at the call boundary keeps the helper
      // tolerant to both direct and connection-routed models.
      model,
      schema: FollowUpsSchema,
      prompt: [
        "You are helping a user continue an AI chat.",
        "Given the exchange below, return 2-3 short follow-up prompts the",
        "user could reasonably send next. Phrase them as questions or",
        "instructions in the user's voice (first-person, imperative or",
        "interrogative). Each must stand alone and be under ~120 chars.",
        "Do not number them. Do not preface with 'You could ask:' etc.",
        "",
        `User: ${truncate(lastUserText, 800)}`,
        `Assistant: ${truncate(lastAssistantText, 1600)}`,
      ].join("\n"),
    });

    return result.object.suggestions;
  } catch {
    return [];
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
