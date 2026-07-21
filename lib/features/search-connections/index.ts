/**
 * Search Connections (AI v3.1) — server barrel. BYOK web-search backend
 * keys. Do NOT import from a `"use client"` module (pulls Prisma); client
 * components read backend metadata from
 * `@/lib/domain/ai/acquisition/search/metadata` and connection views from
 * the `/api/ai/search-connections` routes.
 */

export {
  listSearchConnections,
  upsertSearchConnection,
  setDefaultSearchConnection,
  deleteSearchConnection,
} from "./service";
export type {
  SearchConnectionView,
  UpsertSearchConnectionInput,
} from "./service";
