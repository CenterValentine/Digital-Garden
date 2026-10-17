/**
 * Identifier parsing and normalization (client-safe, pure).
 *
 * The search box understands identifiers the way the scripture box understands
 * "Alma 32:21" (RESEARCH-READER-PLAN.md §2.2.3): a pasted DOI, arXiv id, PMID,
 * trial number, case citation, CFR/USC section, patent number or URL resolves
 * straight to the Work. Merging results from several sources also hinges on
 * these being normalized identically — "10.1038/NATURE12373",
 * "https://doi.org/10.1038/nature12373" and "doi:10.1038/nature12373." are one
 * key.
 *
 * Legal citations here are a V1.0 stub (common federal reporters, CFR, USC);
 * the Law pack (V1.1) replaces the reporter list with reporters-db data.
 */

import {
  IDENTIFIER_SCHEMES,
  type IdentifierScheme,
  type WorkIdentifier,
  type WorkIdentifiers,
} from "./types";

// ── Per-scheme normalizers (return null when the input isn't one) ────────

const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/;

export function normalizeDoi(raw: string): string | null {
  let value = raw.trim();
  value = value.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  value = value.replace(/^doi:\s*/i, "");
  try {
    value = decodeURIComponent(value);
  } catch {
    // keep as-is: a literal "%" in a DOI is legal
  }
  value = trimTrailingPunctuation(value);
  if (!DOI_PATTERN.test(value)) return null;
  // DOIs are case-insensitive by spec; lower-case is the canonical comparison form.
  return value.toLowerCase();
}

const ARXIV_NEW = /^(\d{4}\.\d{4,5})(v\d+)?$/;
const ARXIV_OLD = /^([a-z-]+(?:\.[a-z]{2})?\/\d{7})(v\d+)?$/i;

/** arXiv id without its version — versions are copies of one Work. */
export function normalizeArxiv(raw: string): string | null {
  let value = raw.trim();
  value = value.replace(/^https?:\/\/(www\.|export\.)?arxiv\.org\/(abs|pdf|html)\//i, "");
  value = value.replace(/^arxiv:\s*/i, "");
  value = value.replace(/\.pdf$/i, "").replace(/\/$/, "");
  const modern = value.match(ARXIV_NEW);
  if (modern) return modern[1];
  const legacy = value.match(ARXIV_OLD);
  if (legacy) return legacy[1].toLowerCase();
  return null;
}

export function normalizePmid(raw: string): string | null {
  const value = raw.trim().replace(/^pmid:?\s*/i, "");
  return /^\d{1,9}$/.test(value) ? String(Number(value)) : null;
}

export function normalizePmcid(raw: string): string | null {
  const value = raw.trim().replace(/^pmcid:?\s*/i, "");
  const match = value.match(/^pmc(\d+)$/i);
  return match ? `PMC${match[1]}` : null;
}

export function normalizeNct(raw: string): string | null {
  const match = raw.trim().match(/^nct(\d{8})$/i);
  return match ? `NCT${match[1]}` : null;
}

export function normalizeOpenAlex(raw: string): string | null {
  const value = raw.trim().replace(/^https?:\/\/(api\.)?openalex\.org\/(works\/)?/i, "");
  const match = value.match(/^w(\d+)$/i);
  return match ? `W${match[1]}` : null;
}

export function normalizeS2(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  return /^[0-9a-f]{40}$/.test(value) ? value : null;
}

/** ISBN → ISBN-13 digits, checksum-validated (ISBN-10 is converted). */
export function normalizeIsbn(raw: string): string | null {
  const value = raw.trim().replace(/^isbn(-1[03])?:?\s*/i, "").replace(/[\s-]/g, "").toUpperCase();
  if (/^\d{9}[\dX]$/.test(value)) {
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += (value[i] === "X" ? 10 : Number(value[i])) * (10 - i);
    if (sum % 11 !== 0) return null;
    return isbn13From12(`978${value.slice(0, 9)}`);
  }
  if (/^97[89]\d{10}$/.test(value)) {
    return isbn13From12(value.slice(0, 12)) === value ? value : null;
  }
  return null;
}

function isbn13From12(twelve: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(twelve[i]) * (i % 2 === 0 ? 1 : 3);
  return `${twelve}${(10 - (sum % 10)) % 10}`;
}

/**
 * Federal reporters the V1.0 stub recognises, keyed by their normalized form
 * (lower-case, no dots or spaces). The Law pack swaps in reporters-db.
 */
const CASE_REPORTERS: Record<string, string> = {
  us: "U.S.",
  sct: "S. Ct.",
  led: "L. Ed.",
  led2d: "L. Ed. 2d",
  f: "F.",
  f2d: "F.2d",
  f3d: "F.3d",
  f4th: "F.4th",
  fsupp: "F. Supp.",
  fsupp2d: "F. Supp. 2d",
  fsupp3d: "F. Supp. 3d",
  fappx: "F. App'x",
};

const CASE_PATTERN =
  /\b(\d{1,4})\s+(U\.\s?S\.|S\.\s?Ct\.|L\.\s?Ed\.(?:\s?2d)?|F\.\s?(?:2d|3d|4th)|F\.(?!\s?(?:Supp|App))|F\.\s?Supp\.(?:\s?[23]d)?|F\.\s?App'x)\s+(\d{1,5})\b/i;

function reporterKey(reporter: string): string {
  return reporter.toLowerCase().replace(/[.\s']/g, "");
}

export function normalizeCaseCitation(raw: string): string | null {
  const match = raw.trim().match(CASE_PATTERN);
  if (!match) return null;
  const key = reporterKey(match[2]);
  if (!CASE_REPORTERS[key]) return null;
  return `${Number(match[1])} ${key} ${Number(match[3])}`;
}

/** "410 us 113" → "410 U.S. 113" for display. */
export function formatCaseCitation(normalized: string): string {
  const [volume, key, page] = normalized.split(" ");
  return `${volume} ${CASE_REPORTERS[key] ?? key} ${page}`;
}

const CFR_PATTERN = /\b(\d{1,2})\s*C\.?\s?F\.?\s?R\.?\s*(?:§+|part|sec(?:tion)?\.?)?\s*(\d+(?:\.\d+[a-z]?)?)/i;

export function normalizeCfr(raw: string): string | null {
  const match = raw.trim().match(CFR_PATTERN);
  return match ? `${Number(match[1])} cfr ${match[2].toLowerCase()}` : null;
}

const USC_PATTERN = /\b(\d{1,2})\s*U\.?\s?S\.?\s?C\.?\s*(?:§+|sec(?:tion)?\.?)?\s*(\d+[a-z]*(?:\([a-z0-9]+\))*)/i;

export function normalizeUsc(raw: string): string | null {
  const match = raw.trim().match(USC_PATTERN);
  return match ? `${Number(match[1])} usc ${match[2].toLowerCase()}` : null;
}

const PATENT_PATTERN = /^(US|EP|WO|JP|CN|DE|GB|FR|KR|CA|AU)\s?([\d,/]{5,14})\s?([A-Z]\d?)?$/i;

/** "US 10,123,456 B2" → "US10123456B2"; "WO2020/123456" → "WO2020123456". */
export function normalizePatent(raw: string): string | null {
  const match = raw.trim().match(PATENT_PATTERN);
  if (!match) return null;
  const digits = match[2].replace(/[,/]/g, "");
  if (digits.length < 5) return null;
  return `${match[1].toUpperCase()}${digits}${(match[3] ?? "").toUpperCase()}`;
}

/** URLs compare without fragment or trailing slash; scheme and host lower-cased. */
export function normalizeUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    const text = url.toString();
    return text.endsWith("/") && url.pathname !== "/" ? text.slice(0, -1) : text;
  } catch {
    return null;
  }
}

const NORMALIZERS: Partial<Record<IdentifierScheme, (raw: string) => string | null>> = {
  doi: normalizeDoi,
  arxiv: normalizeArxiv,
  pmid: normalizePmid,
  pmcid: normalizePmcid,
  nct: normalizeNct,
  isbn: normalizeIsbn,
  case: normalizeCaseCitation,
  cfr: normalizeCfr,
  usc: normalizeUsc,
  patent: normalizePatent,
  openalex: normalizeOpenAlex,
  s2: normalizeS2,
  url: normalizeUrl,
};

/** Normalize a value already known to be of `scheme`. Unknown schemes pass through trimmed. */
export function normalizeIdentifier(scheme: IdentifierScheme, raw: string): string | null {
  const normalizer = NORMALIZERS[scheme];
  if (!normalizer) {
    const value = raw.trim();
    return value || null;
  }
  return normalizer(raw);
}

// ── URL → identifiers ────────────────────────────────────────────────────

/**
 * Identifiers a URL carries. Always includes the URL itself; known hosts add
 * their scheme (an arXiv abs page → arxiv), and any DOI in a publisher path
 * (`/doi/10.1002/…`, `/article/10.1007/…`) is lifted out.
 */
export function identifiersFromUrl(raw: string): WorkIdentifier[] {
  const url = normalizeUrl(raw);
  if (!url) return [];
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^www\./, "");
  const path = decodeURIComponentSafe(parsed.pathname);
  const found: WorkIdentifier[] = [];
  const add = (scheme: IdentifierScheme, value: string | null) => {
    if (value) found.push({ scheme, value });
  };

  if (host === "doi.org" || host === "dx.doi.org") add("doi", normalizeDoi(path.slice(1)));
  else if (host.endsWith("arxiv.org")) add("arxiv", normalizeArxiv(path.replace(/^\/(abs|pdf|html)\//, "")));
  else if (host === "pubmed.ncbi.nlm.nih.gov") add("pmid", normalizePmid(path.replace(/\//g, "")));
  else if (host === "pmc.ncbi.nlm.nih.gov" || host === "ncbi.nlm.nih.gov") {
    add("pmcid", normalizePmcid(path.match(/PMC\d+/i)?.[0] ?? ""));
  } else if (host === "europepmc.org") {
    const med = path.match(/\/(?:article|abstract)\/MED\/(\d+)/i);
    const pmc = path.match(/PMC\d+/i);
    if (med) add("pmid", normalizePmid(med[1]));
    if (pmc) add("pmcid", normalizePmcid(pmc[0]));
  } else if (host === "clinicaltrials.gov") add("nct", normalizeNct(path.match(/NCT\d{8}/i)?.[0] ?? ""));
  else if (host === "openalex.org" || host === "api.openalex.org") add("openalex", normalizeOpenAlex(path.split("/").pop() ?? ""));
  else if (host === "semanticscholar.org" || host === "api.semanticscholar.org") {
    add("s2", normalizeS2(path.split("/").pop() ?? ""));
  } else if (host === "courtlistener.com") {
    const opinion = path.match(/\/opinion\/(\d+)\//);
    if (opinion) add("courtlistener", `opinion/${opinion[1]}`);
  } else if (host === "ecfr.gov") {
    const title = path.match(/title-(\d+)/);
    const section = path.match(/section-(\d+(?:\.\d+[a-z]?)?)/i);
    if (title && section) add("cfr", `${Number(title[1])} cfr ${section[1].toLowerCase()}`);
  }

  // A DOI inside a publisher path (Wiley /doi/…, Springer /article/…, ACM /doi/…).
  if (!found.some((id) => id.scheme === "doi")) {
    const embedded = path.match(/(10\.\d{4,9}\/[^\s?#]+)/);
    if (embedded) add("doi", normalizeDoi(embedded[1].replace(/\/(full|abstract|pdf|epdf)$/i, "")));
  }

  found.push({ scheme: "url", value: url });
  return dedupe(found);
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// ── Free text → identifiers ──────────────────────────────────────────────

/**
 * The identifier a whole search-box query names, or null when the query is
 * words. "10.1038/nature12373", "arXiv:2401.01234v2", "PMID 123",
 * "NCT01234567", "410 U.S. 113", "12 CFR 1026.19", a URL — each is one
 * identifier and jumps straight to the Work (§2.2.3).
 */
export function parseIdentifierQuery(raw: string): WorkIdentifier[] | null {
  const text = raw.trim();
  if (!text) return null;

  if (/^https?:\/\//i.test(text) && !/\s/.test(text)) {
    const fromUrl = identifiersFromUrl(text);
    return fromUrl.length ? fromUrl : null;
  }

  const attempts: Array<[IdentifierScheme, RegExp]> = [
    ["doi", /^(doi:\s*)?10\.\d{4,9}\/\S+$/i],
    ["arxiv", /^(arxiv:\s*)?(\d{4}\.\d{4,5}|[a-z-]+(\.[a-z]{2})?\/\d{7})(v\d+)?$/i],
    ["pmcid", /^(pmcid:?\s*)?pmc\d+$/i],
    ["pmid", /^pmid:?\s*\d{1,9}$/i],
    ["nct", /^nct\d{8}$/i],
    ["isbn", /^(isbn(-1[03])?:?\s*)?[\d][\d\s-]{8,16}[\dX]$/i],
    ["openalex", /^w\d{4,}$/i],
    ["s2", /^[0-9a-f]{40}$/i],
    ["patent", PATENT_PATTERN],
  ];
  for (const [scheme, pattern] of attempts) {
    if (!pattern.test(text)) continue;
    const value = normalizeIdentifier(scheme, text);
    if (value) return [{ scheme, value }];
  }

  // Legal citations are matched against the whole query (a citation is the
  // entire input, optionally with a case name before it).
  for (const scheme of ["case", "cfr", "usc"] as const) {
    const value = normalizeIdentifier(scheme, text);
    if (value && legalCitationCoversQuery(scheme, text)) return [{ scheme, value }];
  }
  return null;
}

/** "Roe v. Wade, 410 U.S. 113 (1973)" counts; "statins and 12 CFR" doesn't. */
function legalCitationCoversQuery(scheme: "case" | "cfr" | "usc", text: string): boolean {
  const pattern = scheme === "case" ? CASE_PATTERN : scheme === "cfr" ? CFR_PATTERN : USC_PATTERN;
  const rest = text.replace(pattern, "").replace(/\(\d{4}\)/, "").trim();
  if (!rest) return true;
  // Case name before the citation: "X v. Y," — allow it, nothing else.
  return scheme === "case" && /^[\w.'&\s-]+\sv\.?\s[\w.'&\s-]+,?$/i.test(rest);
}

// ── Keys and merging ─────────────────────────────────────────────────────

export function identifierKey(identifier: WorkIdentifier): string {
  return `${identifier.scheme}:${identifier.value}`;
}

export function parseIdentifierKey(key: string): WorkIdentifier | null {
  const index = key.indexOf(":");
  if (index <= 0) return null;
  return { scheme: key.slice(0, index), value: key.slice(index + 1) };
}

const SCHEME_RANK = new Map<string, number>(IDENTIFIER_SCHEMES.map((scheme, index) => [scheme, index]));

function rank(scheme: string): number {
  return SCHEME_RANK.get(scheme) ?? IDENTIFIER_SCHEMES.length;
}

/** The Work's canonical key: its highest-precedence identifier. */
export function workKeyOf(identifiers: WorkIdentifiers): string | null {
  const schemes = Object.keys(identifiers)
    .filter((scheme) => identifiers[scheme]?.length)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const scheme = schemes[0];
  if (!scheme) return null;
  return identifierKey({ scheme, value: identifiers[scheme]![0] });
}

/** Every `scheme:value` key a Work answers to (for cache aliases and dedupe). */
export function identifierKeys(identifiers: WorkIdentifiers): string[] {
  const keys: string[] = [];
  for (const [scheme, values] of Object.entries(identifiers)) {
    for (const value of values ?? []) keys.push(identifierKey({ scheme, value }));
  }
  return keys;
}

export function identifiersFrom(list: WorkIdentifier[]): WorkIdentifiers {
  const out: WorkIdentifiers = {};
  for (const { scheme, value } of list) {
    const values = (out[scheme] ??= []);
    if (!values.includes(value)) values.push(value);
  }
  return out;
}

/**
 * Add a raw identifier, normalizing it first; invalid values are dropped
 * silently (sources send junk — an empty DOI, "N/A").
 */
export function addIdentifier(
  target: WorkIdentifiers,
  scheme: IdentifierScheme,
  raw: string | number | null | undefined
): void {
  if (raw === null || raw === undefined || raw === "") return;
  const value = normalizeIdentifier(scheme, String(raw));
  if (!value) return;
  const values = (target[scheme] ??= []);
  if (!values.includes(value)) values.push(value);
}

export function mergeIdentifiers(a: WorkIdentifiers, b: WorkIdentifiers): WorkIdentifiers {
  const out: WorkIdentifiers = {};
  for (const source of [a, b]) {
    for (const [scheme, values] of Object.entries(source)) {
      const merged = (out[scheme] ??= []);
      for (const value of values ?? []) if (!merged.includes(value)) merged.push(value);
    }
  }
  return out;
}

/**
 * Schemes that identify a Work strongly enough to merge on. `url` is left out:
 * aggregator landing pages and PDF links are shared by unrelated records too
 * often to trust, and `zotero` keys are per-user.
 */
const MERGE_SCHEMES = new Set<string>(
  IDENTIFIER_SCHEMES.filter((scheme) => scheme !== "url" && scheme !== "zotero")
);

export function sharesIdentifier(a: WorkIdentifiers, b: WorkIdentifiers): boolean {
  for (const [scheme, values] of Object.entries(a)) {
    if (!MERGE_SCHEMES.has(scheme) && SCHEME_RANK.has(scheme)) continue;
    const other = b[scheme];
    if (!other) continue;
    if ((values ?? []).some((value) => other.includes(value))) return true;
  }
  return false;
}

// ── helpers ──────────────────────────────────────────────────────────────

function trimTrailingPunctuation(value: string): string {
  let out = value.replace(/[.,;:'"\]}>]+$/, "");
  // A trailing ")" belongs to the DOI only when the DOI opened one.
  while (out.endsWith(")") && count(out, "(") < count(out, ")")) out = out.slice(0, -1);
  return out;
}

function count(text: string, char: string): number {
  return text.split(char).length - 1;
}

function dedupe(list: WorkIdentifier[]): WorkIdentifier[] {
  const seen = new Set<string>();
  return list.filter((identifier) => {
    const key = identifierKey(identifier);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
