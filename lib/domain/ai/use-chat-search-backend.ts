"use client";

/**
 * Per-chat web-search preference (owner-requested, 2026-09-30).
 *
 * `native` (the default) lets a model with its own search tool use it —
 * OpenAI, Claude, Gemini and Grok search inside the model call. `app` routes
 * the chat's `search_web` through the user's search connection instead
 * (Tavily, Brave, …): repeat-guarded, refusable in the reserved tail, and
 * priced by that service. The server re-checks both conditions — a model
 * without native search and a user without a connection fall back to what
 * exists — so this is a preference, never a promise.
 *
 * Stored per chat in localStorage like the model pin. Reads the
 * conversation key, then the content key, so a choice made before the chat
 * had a conversation id carries over without a promotion step. A same-tab
 * event keeps the sidebar panel and the full-page viewer in step.
 */

import { useCallback, useEffect, useState } from "react";
import { SEARCH_BACKENDS_META } from "./acquisition/search/metadata";

export type SearchBackendPreference = "native" | "app";

const EVENT = "dg:search-backend";

function storageKeys(conversationId: string | null | undefined, contentId: string | null | undefined): string[] {
  return [
    conversationId ? `dg:search-backend:conv:${conversationId}` : null,
    contentId ? `dg:search-backend:content:${contentId}` : null,
  ].filter((k): k is string => k !== null);
}

function readStored(keys: string[]): SearchBackendPreference {
  if (typeof window === "undefined") return "native";
  try {
    for (const key of keys) {
      if (window.localStorage.getItem(key) === "app") return "app";
    }
  } catch {
    /* storage blocked — the default applies */
  }
  return "native";
}

export function useChatSearchBackend(
  conversationId: string | null | undefined,
  contentId: string | null | undefined,
): [SearchBackendPreference, (next: SearchBackendPreference) => void] {
  const keys = storageKeys(conversationId, contentId);
  const keySignature = keys.join("|");
  const [value, setValue] = useState<SearchBackendPreference>(() => readStored(keys));

  // Rehydrate when the chat changes (the panel stays mounted across chats).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-read storage for the new chat's keys
    setValue(readStored(keySignature ? keySignature.split("|") : []));
  }, [keySignature]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ keys?: unknown; value?: unknown }>).detail;
      const changed = Array.isArray(detail?.keys) ? (detail.keys as unknown[]) : [];
      if (changed.some((k) => typeof k === "string" && keySignature.split("|").includes(k))) {
        setValue(detail?.value === "app" ? "app" : "native");
      }
    };
    window.addEventListener(EVENT, onEvent);
    return () => window.removeEventListener(EVENT, onEvent);
  }, [keySignature]);

  const set = useCallback(
    (next: SearchBackendPreference) => {
      setValue(next);
      if (typeof window === "undefined") return;
      const current = keySignature ? keySignature.split("|") : [];
      try {
        for (const key of current) {
          if (next === "app") window.localStorage.setItem(key, "app");
          else window.localStorage.removeItem(key);
        }
        window.dispatchEvent(new CustomEvent(EVENT, { detail: { keys: current, value: next } }));
      } catch {
        /* non-blocking — the choice stays in memory for this session */
      }
    },
    [keySignature],
  );

  return [value, set];
}

/** Vendors whose models carry their own search tool (the route's NATIVE_TOOL_VENDORS). */
const NATIVE_SEARCH_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Claude",
  google: "Google",
  xai: "Grok",
};

/**
 * The name of the model's own search, or null when it has none (then the
 * preference does not apply and the control is hidden). A gateway id
 * (`anthropic/claude-…`) names its vendor in the id.
 */
export function nativeSearchLabel(
  providerId: string | null | undefined,
  modelId: string | null | undefined,
): string | null {
  const vendor = modelId?.includes("/") ? modelId.split("/")[0] : providerId;
  return (vendor && NATIVE_SEARCH_LABELS[vendor.toLowerCase()]) ?? null;
}

let searchServiceCache: Promise<string | null> | null = null;

/**
 * The user's default search service as the chat controls name it — a
 * search model by its model id (`gpt-5-search-api`, so it never reads as a
 * second "OpenAI" beside the model's own search), otherwise its label
 * ("Tavily") — or null when they have none. Fetched once per page load.
 */
export function loadSearchServiceName(): Promise<string | null> {
  searchServiceCache ??= fetch("/api/ai/search-connections")
    .then((r) => (r.ok ? r.json() : null))
    .then((json: { data?: Array<{ provider?: string; isDefault?: boolean }> } | null) => {
      const rows = json?.data ?? [];
      const row = rows.find((c) => c.isDefault) ?? rows[0];
      if (!row?.provider) return null;
      const meta = SEARCH_BACKENDS_META.find((m) => m.id === row.provider);
      return meta?.model ?? meta?.label ?? row.provider;
    })
    .catch(() => {
      searchServiceCache = null;
      return null;
    });
  return searchServiceCache;
}
