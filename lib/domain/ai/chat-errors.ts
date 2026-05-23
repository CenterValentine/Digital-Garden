/**
 * Chat error parsing.
 *
 * AI SDK v6's useChat surfaces server failures with the raw response
 * body as `error.message`. Our chat route returns structured JSON
 * (`{ success: false, error: { code, message, providerId? } }`), so the
 * client sees that JSON blob as a string — not a friendly message.
 *
 * `parseChatError()` recognizes the structured shape and pulls out the
 * useful fields. Unrecognized shapes fall through with the original
 * message preserved so we never lose information.
 */

export interface ParsedChatError {
  code: string;
  message: string;
  providerId?: string;
}

/** Server error shapes the route returns today. */
const KNOWN_CODES = new Set([
  "UNAUTHORIZED",
  "BYOK_REQUIRED",
  "SERVER_ERROR",
  "RATE_LIMITED",
  "MODEL_NOT_FOUND",
  "CONTEXT_OVERFLOW",
  "TIMEOUT",
  "CONTENT_FILTERED",
  "QUOTA_EXCEEDED",
  "INVALID_API_KEY",
]);

/**
 * Heuristic match against the underlying error message. Upstream
 * providers usually leak recognizable phrases ("rate limit", "context
 * length exceeded", "invalid api key") even when the chat route wraps
 * them as SERVER_ERROR. We sniff for those and re-classify so the user
 * sees a useful copy line instead of "Something went wrong."
 */
function inferCodeFromMessage(msg: string): string | null {
  const m = msg.toLowerCase();
  if (m.includes("rate limit") || m.includes("rate_limit") || m.includes("429")) {
    return "RATE_LIMITED";
  }
  if (m.includes("model not found") || m.includes("model_not_found") || m.includes("no such model") || m.includes("unknown model")) {
    return "MODEL_NOT_FOUND";
  }
  if (m.includes("context length") || m.includes("context_length") || m.includes("maximum context") || m.includes("too long")) {
    return "CONTEXT_OVERFLOW";
  }
  if (m.includes("timeout") || m.includes("timed out") || m.includes("etimedout")) {
    return "TIMEOUT";
  }
  if (m.includes("content policy") || m.includes("content filter") || m.includes("content_filter") || m.includes("safety")) {
    return "CONTENT_FILTERED";
  }
  if (m.includes("quota") || m.includes("billing") || m.includes("insufficient_quota")) {
    return "QUOTA_EXCEEDED";
  }
  if (m.includes("invalid api key") || m.includes("invalid_api_key") || m.includes("incorrect api key") || m.includes("401")) {
    return "INVALID_API_KEY";
  }
  return null;
}

export function parseChatError(raw: string | undefined | null): ParsedChatError {
  if (!raw) return { code: "UNKNOWN", message: "Chat request failed." };

  // Fast path: not JSON, return as-is.
  if (!raw.trim().startsWith("{")) {
    return { code: "UNKNOWN", message: raw };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "error" in parsed &&
      typeof (parsed as { error: unknown }).error === "object" &&
      (parsed as { error: unknown }).error !== null
    ) {
      const err = (parsed as { error: Record<string, unknown> }).error;
      const rawCode = typeof err.code === "string" ? err.code : "UNKNOWN";
      const message =
        typeof err.message === "string" && err.message.length > 0
          ? err.message
          : "Chat request failed.";
      const providerId =
        typeof err.providerId === "string" ? err.providerId : undefined;
      // If the server bucketed it as SERVER_ERROR or UNKNOWN, sniff the
      // message for a more specific cause. Otherwise trust the server.
      const code =
        rawCode === "SERVER_ERROR" || rawCode === "UNKNOWN"
          ? (inferCodeFromMessage(message) ?? rawCode)
          : rawCode;
      return { code, message, providerId };
    }
  } catch {
    /* fall through */
  }

  // Last attempt: if the raw string isn't structured JSON at all, still
  // try to classify by its message contents.
  const inferred = inferCodeFromMessage(raw);
  return { code: inferred ?? "UNKNOWN", message: raw };
}

/** Convenience: human-readable label for a known error code. */
export function describeChatError(parsed: ParsedChatError): string {
  if (parsed.code === "BYOK_REQUIRED") {
    const provider = parsed.providerId
      ? capitalizeProvider(parsed.providerId)
      : "this provider";
    return `${provider} isn't set up yet. Add a Connection in Settings → AI to use it.`;
  }
  if (parsed.code === "UNAUTHORIZED") return "Please sign in to continue.";
  if (parsed.code === "RATE_LIMITED") {
    return "The provider is rate-limiting requests. Wait a moment and try again, or switch to a different model.";
  }
  if (parsed.code === "MODEL_NOT_FOUND") {
    return "The selected model isn't recognized by the Connection routing this turn. Check the model ID in Settings → AI → Connections.";
  }
  if (parsed.code === "CONTEXT_OVERFLOW") {
    return "This turn exceeds the model's context window. Shorten the conversation, drop attachments, or switch to a higher-context model.";
  }
  if (parsed.code === "TIMEOUT") return "The provider didn't respond in time. Try again.";
  if (parsed.code === "CONTENT_FILTERED") {
    return "The provider's safety filter blocked this turn. Rephrase the prompt or switch providers.";
  }
  if (parsed.code === "QUOTA_EXCEEDED") {
    return "This Connection's billing quota is exhausted. Check the provider's billing dashboard or use a different Connection.";
  }
  if (parsed.code === "INVALID_API_KEY") {
    return "The API key on the routing Connection was rejected. Update it in Settings → AI → Connections.";
  }
  if (parsed.code === "SERVER_ERROR") return "Something went wrong on the server. Try again in a moment.";
  // Known but uncategorized — show whatever the server said.
  if (KNOWN_CODES.has(parsed.code)) return parsed.message;
  return parsed.message;
}

/**
 * Should the banner offer a "Go to AI Settings" CTA? True when the
 * cause points at a missing/broken Connection or auth — not for
 * transient or content-related failures.
 */
export function shouldOfferSettingsCta(parsed: ParsedChatError): boolean {
  return (
    parsed.code === "BYOK_REQUIRED" ||
    parsed.code === "UNAUTHORIZED" ||
    parsed.code === "MODEL_NOT_FOUND" ||
    parsed.code === "INVALID_API_KEY" ||
    parsed.code === "QUOTA_EXCEEDED"
  );
}

function capitalizeProvider(id: string): string {
  if (id === "openai") return "OpenAI";
  if (id === "xai") return "xAI";
  return id.charAt(0).toUpperCase() + id.slice(1);
}
