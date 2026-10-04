/**
 * Client-safe search-backend metadata (AI v3.1) — for the Settings → AI →
 * Search picker. Derived from the impl registry (fetch-only, no server
 * deps), so it can be imported into client components without pulling in
 * the resolver (which touches Prisma).
 */

import { SEARCH_PROVIDER_IMPLS } from "./registry";

export interface SearchBackendMeta {
  id: string;
  label: string;
  apiKeyHint: string;
  apiKeyDocsURL: string;
  model?: string;
}

export const SEARCH_BACKENDS_META: readonly SearchBackendMeta[] =
  SEARCH_PROVIDER_IMPLS.map((p) => ({
    id: p.id,
    label: p.label,
    apiKeyHint: p.apiKeyHint,
    apiKeyDocsURL: p.apiKeyDocsURL,
    ...(p.model ? { model: p.model } : {}),
  }));

/** How a search service is named in the UI: a search model by its model id. */
export function searchServiceDisplayName(providerId: string): string {
  const meta = SEARCH_BACKENDS_META.find((m) => m.id === providerId);
  if (!meta) return providerId;
  return meta.model ? `${meta.label} · ${meta.model}` : meta.label;
}
