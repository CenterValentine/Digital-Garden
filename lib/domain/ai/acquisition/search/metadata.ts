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
}

export const SEARCH_BACKENDS_META: readonly SearchBackendMeta[] =
  SEARCH_PROVIDER_IMPLS.map((p) => ({
    id: p.id,
    label: p.label,
    apiKeyHint: p.apiKeyHint,
    apiKeyDocsURL: p.apiKeyDocsURL,
  }));
