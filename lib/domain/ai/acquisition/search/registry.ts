/**
 * Search backend registry (AI v3.1). Add a backend by importing it and
 * appending to SEARCH_PROVIDERS — nothing else changes.
 *
 * Active-backend selection:
 *   1. `APP_SEARCH_PROVIDER` env (explicit id) if that backend is configured.
 *   2. Otherwise the first registered backend that IS configured.
 *   3. Otherwise none — app search is simply unavailable and `search_web`
 *      won't attach for non-native providers (honest no-op, not an error).
 */

import type { AppSearchProvider } from "./types";
import { tavilyProvider } from "./tavily";
import { braveProvider } from "./brave";

/** Registration order = auto-selection preference when no explicit env. */
export const SEARCH_PROVIDERS: readonly AppSearchProvider[] = [
  tavilyProvider,
  braveProvider,
];

/** The active backend, or null when none is configured. */
export function getActiveSearchProvider(): AppSearchProvider | null {
  const explicit = process.env.APP_SEARCH_PROVIDER?.trim().toLowerCase();
  if (explicit) {
    const chosen = SEARCH_PROVIDERS.find((p) => p.id === explicit);
    if (chosen?.isConfigured()) return chosen;
    // Explicit-but-unconfigured falls through to auto so a stale env var
    // never silently disables a working backend.
  }
  return SEARCH_PROVIDERS.find((p) => p.isConfigured()) ?? null;
}

/** True when any search backend can serve queries. */
export function isAppSearchConfigured(): boolean {
  return getActiveSearchProvider() !== null;
}
