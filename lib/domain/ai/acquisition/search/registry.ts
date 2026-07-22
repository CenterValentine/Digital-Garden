/**
 * Search backend implementation registry (AI v3.1). Add a backend by
 * importing it and appending to SEARCH_PROVIDER_IMPLS — nothing else
 * changes. Selection is now PER-USER (via SearchConnection BYOK rows),
 * not env; this registry only maps id → implementation.
 */

import type { AppSearchProvider } from "./types";
import { tavilyProvider } from "./tavily";
import { braveProvider } from "./brave";

/** Registration order = the order shown in the settings backend picker. */
export const SEARCH_PROVIDER_IMPLS: readonly AppSearchProvider[] = [
  tavilyProvider,
  braveProvider,
];

/** Look up a backend implementation by its id ("tavily" | "brave" | …). */
export function getSearchProviderImpl(
  id: string,
): AppSearchProvider | undefined {
  return SEARCH_PROVIDER_IMPLS.find((p) => p.id === id);
}
