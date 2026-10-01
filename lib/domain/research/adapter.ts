/**
 * The research adapter contract (RESEARCH-READER-PLAN.md §3).
 *
 * Adapters are PURE with respect to I/O: every network call goes through
 * `ctx.fetchJson`, which the server wires to the SSRF-guarded reader fetch and
 * `pnpm research:check` wires to recorded fixtures. That keeps adapters
 * testable without a network and free of `server-only` imports.
 *
 * Roles map to optional methods. An adapter that resolves a DOI to its open
 * copies (Unpaywall) is just `resolve` returning a candidate with `copies` —
 * merging folds those into the Work. Enrichment that returns other Works
 * (references, cited-by, related) returns a CandidatePage.
 */

import type { ResearchSourceInfo } from "./sources";
import type {
  CandidatePage,
  ResearchQuery,
  Work,
  WorkCandidate,
  WorkIdentifier,
} from "./types";

export interface AdapterFetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface AdapterContext {
  /** Resolves to null when the source answers 404 ("no such record"). */
  fetchJson<T>(url: string, options?: AdapterFetchOptions): Promise<T | null>;
  /**
   * The key or contact value for a source, resolved by its `keyPolicy`
   * (the user's own connection first for `app-or-user`, else the app's).
   * `"contact-email"` is the project's polite-pool address (plan §7.5),
   * never the user's own email.
   */
  credential(sourceId: string): string | null;
}

export interface ResearchAdapter {
  info: ResearchSourceInfo;
  search?(query: ResearchQuery, ctx: AdapterContext, cursor?: string | null): Promise<CandidatePage>;
  resolve?(identifier: WorkIdentifier, ctx: AdapterContext): Promise<WorkCandidate | null>;
  references?(work: Work, ctx: AdapterContext, cursor?: string | null): Promise<CandidatePage>;
  citedBy?(work: Work, ctx: AdapterContext, cursor?: string | null): Promise<CandidatePage>;
  related?(work: Work, ctx: AdapterContext): Promise<CandidatePage>;
}

export const EMPTY_PAGE: CandidatePage = { candidates: [], total: 0, next: null };

/** Encode query parameters, dropping empty values. */
export function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

/** Strip JATS/HTML tags some sources embed in titles and abstracts. */
export function plainText(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value
    .replace(/<jats:title>[^<]*<\/jats:title>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

export function yearOf(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const year = typeof value === "number" ? value : Number(String(value).slice(0, 4));
  return Number.isInteger(year) && year > 1000 && year < 3000 ? year : null;
}

/** Licences we may store a copy under (plan §7.2). */
export function isStorableLicense(license: string | null | undefined): boolean {
  if (!license) return false;
  const value = license.toLowerCase().replace(/[\s_]/g, "-");
  return (
    value.startsWith("cc-by") ||
    value === "cc0" ||
    value.startsWith("cc-zero") ||
    value === "public-domain" ||
    value === "pd"
  );
}

/**
 * Creative Commons / public-domain licence URL → short id ("cc-by",
 * "cc-by-nc-nd", "cc0", "public-domain"). Other URLs → null (unknown terms).
 */
export function licenseFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const value = url.toLowerCase();
  if (value.includes("creativecommons.org/publicdomain/zero")) return "cc0";
  if (value.includes("creativecommons.org/publicdomain/mark")) return "public-domain";
  const match = value.match(/creativecommons\.org\/licenses\/([a-z-]+)\//);
  return match ? `cc-${match[1]}` : null;
}

/** Source licence spellings ("CC-BY", "cc_by_nc", "pd") → one form. */
export function normalizeLicense(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (!text || text === "unknown" || text === "other-oa" || text === "implied-oa") return null;
  if (text === "pd" || text === "public-domain") return "public-domain";
  if (text.startsWith("http")) return licenseFromUrl(text);
  // Semantic Scholar writes "CCBY", "CCBYNCND"; others "cc-by-nc". One form.
  const compact = text.replace(/-/g, "");
  if (compact === "cc0" || compact === "cczero") return "cc0";
  if (/^ccby(nc)?(nd|sa)?$/.test(compact)) return `cc-${compact.slice(2).match(/by|nc|nd|sa/g)!.join("-")}`;
  return text;
}

export function copyVersion(value: string | null | undefined): "published" | "accepted" | "submitted" | undefined {
  switch ((value ?? "").toLowerCase()) {
    case "publishedversion":
    case "vor":
      return "published";
    case "acceptedversion":
    case "am":
      return "accepted";
    case "submittedversion":
      return "submitted";
    default:
      return undefined;
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
