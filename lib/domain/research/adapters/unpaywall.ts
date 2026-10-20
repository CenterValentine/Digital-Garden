/**
 * Unpaywall adapter — the legal open copy of a DOI (RESEARCH-READER-PLAN.md
 * §5.2), the heart of the access ladder. Resolve-only: it returns a candidate
 * whose `copies` and `license` merge into the Work.
 *
 * API: https://unpaywall.org/products/api — `?email=` is required (the
 * project contact address, plan §7.5).
 */

import {
  copyVersion,
  hostOf,
  isStorableLicense,
  normalizeLicense,
  query,
  yearOf,
  type ResearchAdapter,
} from "../adapter";
import { addIdentifier } from "../identifiers";
import { researchSource } from "../sources";
import type { WorkCandidate, WorkCopy } from "../types";

interface UnpaywallLocation {
  url?: string | null;
  url_for_pdf?: string | null;
  url_for_landing_page?: string | null;
  license?: string | null;
  version?: string | null;
  host_type?: "publisher" | "repository" | string | null;
  repository_institution?: string | null;
}

export interface UnpaywallRecord {
  doi: string;
  title?: string | null;
  year?: number | null;
  journal_name?: string | null;
  is_oa?: boolean;
  oa_status?: string | null;
  best_oa_location?: UnpaywallLocation | null;
  oa_locations?: UnpaywallLocation[] | null;
}

export function candidateFromUnpaywall(record: UnpaywallRecord): WorkCandidate {
  const identifiers = {};
  addIdentifier(identifiers, "doi", record.doi);

  const copies: WorkCopy[] = [];
  for (const location of record.oa_locations ?? []) {
    const url = location.url_for_pdf;
    if (!url) continue;
    const license = normalizeLicense(location.license);
    copies.push({
      url,
      format: "pdf",
      version: copyVersion(location.version),
      license,
      host:
        location.repository_institution ??
        (location.host_type === "publisher" ? record.journal_name ?? hostOf(url) : hostOf(url)),
      source: "unpaywall",
      storable: isStorableLicense(license),
    });
  }

  const best = record.best_oa_location;
  return {
    source: "unpaywall",
    identifiers,
    title: record.title ?? undefined,
    year: yearOf(record.year),
    copies,
    // Only the published version's licence describes the Work itself.
    license: copyVersion(best?.version) === "published" ? normalizeLicense(best?.license) : null,
  };
}

export const unpaywallAdapter: ResearchAdapter = {
  info: researchSource("unpaywall")!,

  async resolve(identifier, ctx) {
    if (identifier.scheme !== "doi") return null;
    const email = ctx.credential("contact-email");
    // Unpaywall refuses requests without an email; without one, skip quietly.
    if (!email) return null;
    const record = await ctx.fetchJson<UnpaywallRecord | null>(
      `https://api.unpaywall.org/v2/${identifier.value.split("/").map(encodeURIComponent).join("/")}${query({ email })}`
    );
    return record?.doi ? candidateFromUnpaywall(record) : null;
  },
};
