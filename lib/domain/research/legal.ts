/**
 * Legal citations in V1.0 (RESEARCH-READER-PLAN.md §7.1 — the Law stub).
 *
 * Until the Law pack (V1.1) resolves them through CourtListener / eCFR, a
 * pasted case citation, CFR or USC section becomes a link node to where it
 * can be read, typed so the Law pack can upgrade it in place later.
 */

import { formatCaseCitation } from "./identifiers";
import type { WorkType } from "./types";

export interface LegalLink {
  title: string;
  url: string;
  type: WorkType;
}

export function isLegalScheme(scheme: string): boolean {
  return scheme === "case" || scheme === "cfr" || scheme === "usc";
}

/** Where a legal citation can be read until the Law pack resolves it (V1.1). */
export function legalLink(scheme: string, value: string): LegalLink | null {
  if (scheme === "case") {
    const display = formatCaseCitation(value);
    return { title: display, url: `https://www.courtlistener.com/?q=${encodeURIComponent(`"${display}"`)}`, type: "case" };
  }
  if (scheme === "cfr") {
    const [title, , section] = value.split(" ");
    return { title: `${title} C.F.R. § ${section}`, url: `https://www.ecfr.gov/current/title-${title}/section-${section}`, type: "regulation" };
  }
  if (scheme === "usc") {
    const [title, , section] = value.split(" ");
    const base = section.replace(/\(.*$/, "");
    return {
      title: `${title} U.S.C. § ${section}`,
      url: `https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title${title}-section${base}&num=0&edition=prelim`,
      type: "statute",
    };
  }
  return null;
}

