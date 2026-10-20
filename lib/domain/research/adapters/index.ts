/**
 * Every built research adapter. `research:matrix:check` asserts this list and
 * `RESEARCH_SOURCES` name exactly the same sources.
 */

import type { ResearchAdapter } from "../adapter";
import { crossrefAdapter } from "./crossref";
import { openAlexAdapter } from "./openalex";
import { semanticScholarAdapter } from "./semantic-scholar";
import { unpaywallAdapter } from "./unpaywall";

export const RESEARCH_ADAPTERS: ResearchAdapter[] = [
  openAlexAdapter,
  semanticScholarAdapter,
  crossrefAdapter,
  unpaywallAdapter,
];

export function researchAdapter(id: string): ResearchAdapter | undefined {
  return RESEARCH_ADAPTERS.find((adapter) => adapter.info.id === id);
}
