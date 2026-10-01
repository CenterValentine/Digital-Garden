/**
 * Research gate (RESEARCH-READER-PLAN.md). Runs with `pnpm research:check`
 * (tsx, no database, no network).
 *
 * Pins what every research surface stands on:
 *   - identifier parsing / normalization (the search box's jump-to-Work)
 *   - each adapter's mapping from its source's response shape to a candidate
 *   - merging across sources (field precedence, transitive identity, rank fusion)
 *   - federation (timeouts, errors, skips, streaming) and two-round resolve
 *   - per-type faces
 *
 * Fixtures are SYNTHETIC records shaped after each API's documented response
 * (identifiers are well-formed but invented). The research hosts aren't
 * reachable from the build sandbox; a live smoke against the real APIs is a
 * separate, manual step.
 */

import assert from "node:assert/strict";
import type { AdapterContext, ResearchAdapter } from "../lib/domain/research/adapter";
import { isStorableLicense, licenseFromUrl, normalizeLicense } from "../lib/domain/research/adapter";
import { RESEARCH_ADAPTERS } from "../lib/domain/research/adapters";
import { candidateFromCrossref, crossrefAdapter, crossrefFilter, retractionOf, type CrossrefWork } from "../lib/domain/research/adapters/crossref";
import {
  abstractFromInvertedIndex,
  candidateFromOpenAlex,
  openAlexAdapter,
  openAlexFilter,
  type OpenAlexWork,
} from "../lib/domain/research/adapters/openalex";
import { candidateFromS2, s2SearchParams, semanticScholarAdapter, type S2Paper } from "../lib/domain/research/adapters/semantic-scholar";
import { candidateFromUnpaywall, unpaywallAdapter, type UnpaywallRecord } from "../lib/domain/research/adapters/unpaywall";
import { cleanFace } from "../lib/domain/research/faces";
import { federatedSearch, resolveWork, type FederationEvent } from "../lib/domain/research/federate";
import {
  formatCaseCitation,
  identifiersFrom,
  identifiersFromUrl,
  normalizeArxiv,
  normalizeDoi,
  normalizeIsbn,
  parseIdentifierQuery,
  sharesIdentifier,
  workKeyOf,
} from "../lib/domain/research/identifiers";
import { mergeCandidates } from "../lib/domain/research/merge";
import { RESEARCH_SCOPES } from "../lib/domain/research/scopes";
import { RESEARCH_SOURCES } from "../lib/domain/research/sources";
import type { WorkCandidate } from "../lib/domain/research/types";

let checks = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  checks += 1;
  console.log(`  ✓ ${name}`);
}

// ── Synthetic fixtures (one paper, as each source describes it) ──────────

const DOI = "10.1371/journal.pone.0123456";
const PMID = "25000001";
const PMCID = "PMC4000001";
const S2_ID = "0123456789abcdef0123456789abcdef01234567";

const openAlexWork: OpenAlexWork = {
  id: "https://openalex.org/W2000000001",
  doi: `https://doi.org/${DOI.toUpperCase()}`,
  ids: {
    openalex: "https://openalex.org/W2000000001",
    doi: `https://doi.org/${DOI}`,
    pmid: `https://pubmed.ncbi.nlm.nih.gov/${PMID}`,
    pmcid: `https://www.ncbi.nlm.nih.gov/pmc/articles/${PMCID}`,
  },
  display_name: "Statin rechallenge after muscle symptoms: a randomized trial",
  publication_year: 2015,
  publication_date: "2015-04-09",
  type: "article",
  primary_location: {
    is_oa: true,
    landing_page_url: `https://doi.org/${DOI}`,
    pdf_url: "https://journals.plos.org/plosone/article/file?id=10.1371/journal.pone.0123456&type=printable",
    license: "cc-by",
    version: "publishedVersion",
    source: { display_name: "PLoS ONE", issn: ["1932-6203"], host_organization_name: "Public Library of Science", type: "journal" },
  },
  locations: [
    {
      is_oa: true,
      landing_page_url: `https://doi.org/${DOI}`,
      pdf_url: "https://journals.plos.org/plosone/article/file?id=10.1371/journal.pone.0123456&type=printable",
      license: "cc-by",
      version: "publishedVersion",
      source: { display_name: "PLoS ONE" },
    },
    { is_oa: false, landing_page_url: "https://example.org/paywalled", pdf_url: null, source: { display_name: "Mirror" } },
  ],
  authorships: [
    { author: { display_name: "Ada Example", orcid: "https://orcid.org/0000-0002-1825-0097" } },
    { author: { display_name: "Ben Sample" } },
    { author: null },
  ],
  cited_by_count: 42,
  referenced_works_count: 30,
  abstract_inverted_index: { Statins: [0], are: [1], widely: [2], used: [3], "drugs.": [4] },
  is_retracted: false,
  biblio: { volume: "10", issue: "4", first_page: "e0123456", last_page: "e0123456" },
  primary_topic: { display_name: "Statin therapy", field: { display_name: "Medicine" } },
};

const s2Paper: S2Paper = {
  paperId: S2_ID,
  externalIds: { DOI, PubMed: PMID, PubMedCentral: "4000001", CorpusId: 99 },
  url: `https://www.semanticscholar.org/paper/${S2_ID}`,
  title: "Statin Rechallenge After Muscle Symptoms: A Randomized Trial",
  abstract: "Statins are widely used drugs. Muscle symptoms are a common reason to stop them.",
  venue: "PLoS ONE",
  year: 2015,
  publicationDate: "2015-04-09",
  publicationTypes: ["JournalArticle"],
  journal: { name: "PLoS ONE", volume: "10" },
  authors: [{ name: "A. Example" }, { name: "B. Sample" }],
  citationCount: 40,
  referenceCount: 31,
  openAccessPdf: { url: "https://journals.plos.org/plosone/article/file?id=10.1371/journal.pone.0123456&type=printable", status: "GOLD", license: "CCBY" },
  tldr: { text: "Most patients tolerated a statin on rechallenge." },
  fieldsOfStudy: ["Medicine"],
};

const crossrefWork: CrossrefWork = {
  DOI: DOI.toUpperCase(),
  title: ["Statin rechallenge after muscle symptoms"],
  subtitle: ["a randomized trial"],
  author: [
    { given: "Ada", family: "Example", ORCID: "http://orcid.org/0000-0002-1825-0097" },
    { given: "Ben", family: "Sample" },
  ],
  issued: { "date-parts": [[2015, 4, 9]] },
  "container-title": ["PLOS ONE"],
  publisher: "Public Library of Science (PLoS)",
  type: "journal-article",
  volume: "10",
  issue: "4",
  page: "e0123456",
  ISSN: ["1932-6203"],
  license: [{ URL: "http://creativecommons.org/licenses/by/4.0/", "content-version": "vor" }],
  link: [{ URL: "https://journals.plos.org/plosone/article/file?id=10.1371/journal.pone.0123456&type=printable", "content-type": "application/pdf", "content-version": "vor" }],
  abstract: "<jats:p>Statins are <jats:italic>widely</jats:italic> used.</jats:p>",
  "is-referenced-by-count": 38,
  "references-count": 30,
  URL: `https://doi.org/${DOI}`,
  "updated-by": [
    { type: "correction", DOI: "10.1371/journal.pone.0999999", updated: { "date-parts": [[2016, 1, 2]] } },
  ],
};

const unpaywallRecord: UnpaywallRecord = {
  doi: DOI,
  title: "Statin rechallenge after muscle symptoms",
  year: 2015,
  journal_name: "PLOS ONE",
  is_oa: true,
  oa_status: "gold",
  best_oa_location: {
    url_for_pdf: "https://journals.plos.org/plosone/article/file?id=10.1371/journal.pone.0123456&type=printable",
    license: "cc-by",
    version: "publishedVersion",
    host_type: "publisher",
  },
  oa_locations: [
    {
      url_for_pdf: "https://journals.plos.org/plosone/article/file?id=10.1371/journal.pone.0123456&type=printable",
      license: "cc-by",
      version: "publishedVersion",
      host_type: "publisher",
    },
    {
      url_for_pdf: `https://europepmc.org/articles/${PMCID}?pdf=render`,
      license: "cc-by",
      version: "publishedVersion",
      host_type: "repository",
      repository_institution: "Europe PMC",
    },
    { url_for_pdf: null, url_for_landing_page: "https://example.org/landing", host_type: "repository" },
  ],
};

/** A fixture context: routes URLs to canned JSON and records every call. */
function fixtureContext(
  routes: Array<[RegExp, unknown]>,
  credentials: Record<string, string | null> = { "contact-email": "research@example.org" }
): AdapterContext & { calls: Array<{ url: string; headers: Record<string, string> }> } {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  return {
    calls,
    async fetchJson<T>(url: string, options?: { headers?: Record<string, string> }) {
      calls.push({ url, headers: options?.headers ?? {} });
      for (const [pattern, body] of routes) {
        if (pattern.test(url)) return (body instanceof Error ? Promise.reject(body) : (body as T)) as T | null;
      }
      return null; // 404
    },
    credential: (id) => credentials[id] ?? null,
  };
}

async function main() {
  console.log("research:check");

  // ── identifiers ──
  await check("DOI forms normalize to one key", () => {
    for (const raw of [
      "10.1038/NATURE12373",
      "https://doi.org/10.1038/nature12373",
      "doi:10.1038/nature12373.",
      "http://dx.doi.org/10.1038%2Fnature12373",
    ]) {
      assert.equal(normalizeDoi(raw), "10.1038/nature12373", raw);
    }
    // A ")" belongs to the DOI only when the DOI opened one.
    assert.equal(normalizeDoi("10.1002/(SICI)1097-4636(199709)36:3<345::AID-JBM6>3.0.CO;2-K)"), "10.1002/(sici)1097-4636(199709)36:3<345::aid-jbm6>3.0.co;2-k");
    assert.equal(normalizeDoi("not a doi"), null);
  });

  await check("arXiv ids drop versions; old-style ids keep their archive", () => {
    assert.equal(normalizeArxiv("arXiv:2401.01234v3"), "2401.01234");
    assert.equal(normalizeArxiv("https://arxiv.org/pdf/2401.01234v2.pdf"), "2401.01234");
    assert.equal(normalizeArxiv("hep-th/9901001v1"), "hep-th/9901001");
    assert.equal(normalizeArxiv("math.GT/0309136"), "math.gt/0309136");
  });

  await check("ISBN-10 converts to ISBN-13; bad checksums are refused", () => {
    assert.equal(normalizeIsbn("0-306-40615-2"), "9780306406157");
    assert.equal(normalizeIsbn("978-0-306-40615-7"), "9780306406157");
    assert.equal(normalizeIsbn("0-306-40615-3"), null);
  });

  await check("the search box recognizes whole-query identifiers", () => {
    const one = (text: string) => parseIdentifierQuery(text)?.map((id) => `${id.scheme}:${id.value}`);
    assert.deepEqual(one("10.1038/nature12373"), ["doi:10.1038/nature12373"]);
    assert.deepEqual(one("arXiv:2401.01234v2"), ["arxiv:2401.01234"]);
    assert.deepEqual(one("PMID: 25000001"), ["pmid:25000001"]);
    assert.deepEqual(one("pmc4000001"), ["pmcid:PMC4000001"]);
    assert.deepEqual(one("nct01234567"), ["nct:NCT01234567"]);
    assert.deepEqual(one("Roe v. Wade, 410 U.S. 113 (1973)"), ["case:410 us 113"]);
    assert.deepEqual(one("12 C.F.R. § 1026.19"), ["cfr:12 cfr 1026.19"]);
    assert.deepEqual(one("26 U.S.C. § 501(c)(3)"), ["usc:26 usc 501(c)(3)"]);
    assert.deepEqual(one("US 10,123,456 B2"), ["patent:US10123456B2"]);
    assert.equal(formatCaseCitation("410 us 113"), "410 U.S. 113");
    // Words are a search, not an identifier.
    assert.equal(parseIdentifierQuery("statin muscle symptoms"), null);
    assert.equal(parseIdentifierQuery("statins and 12 CFR rules"), null);
    assert.equal(parseIdentifierQuery("2024"), null);
  });

  await check("URLs carry their identifiers (and DOIs in publisher paths)", () => {
    const keys = (url: string) => identifiersFromUrl(url).map((id) => `${id.scheme}:${id.value}`);
    assert.deepEqual(keys("https://arxiv.org/abs/2401.01234v2"), ["arxiv:2401.01234", "url:https://arxiv.org/abs/2401.01234v2"]);
    assert.ok(keys("https://pubmed.ncbi.nlm.nih.gov/25000001/").includes("pmid:25000001"));
    assert.ok(keys("https://pmc.ncbi.nlm.nih.gov/articles/PMC4000001/").includes("pmcid:PMC4000001"));
    assert.ok(keys("https://onlinelibrary.wiley.com/doi/full/10.1002/abc.123").includes("doi:10.1002/abc.123"));
    assert.ok(keys("https://clinicaltrials.gov/study/NCT01234567").includes("nct:NCT01234567"));
    assert.ok(keys("https://www.ecfr.gov/current/title-12/chapter-X/part-1026/section-1026.19").includes("cfr:12 cfr 1026.19"));
    assert.ok(keys("https://www.courtlistener.com/opinion/108713/roe-v-wade/").includes("courtlistener:opinion/108713"));
  });

  await check("Work keys follow scheme precedence; URLs never merge Works", () => {
    assert.equal(workKeyOf({ url: ["https://x.org"], pmid: ["1"], doi: ["10.1/a"] }), "doi:10.1/a");
    assert.equal(workKeyOf({ s2: [S2_ID], arxiv: ["2401.01234"] }), "arxiv:2401.01234");
    assert.equal(sharesIdentifier({ url: ["https://x.org"] }, { url: ["https://x.org"] }), false);
    assert.equal(sharesIdentifier({ pmid: ["1"] }, { pmid: ["1"], doi: ["10.1/a"] }), true);
  });

  // ── licences ──
  await check("licences: CC-BY / CC0 / public domain are storable, others aren't", () => {
    assert.equal(licenseFromUrl("http://creativecommons.org/licenses/by-nc-nd/4.0/"), "cc-by-nc-nd");
    assert.equal(licenseFromUrl("https://creativecommons.org/publicdomain/zero/1.0/"), "cc0");
    assert.equal(isStorableLicense("cc-by"), true);
    assert.equal(isStorableLicense("cc-by-nc"), true); // personal storage is fine; publishing is gated separately (§9.7)
    assert.equal(isStorableLicense("publisher-specific-oa"), false);
    assert.equal(isStorableLicense(null), false);
    assert.equal(normalizeLicense("CCBYNCND"), "cc-by-nc-nd");
    assert.equal(normalizeLicense("cc_by_sa"), "cc-by-sa");
    assert.equal(normalizeLicense("CC0"), "cc0");
    assert.equal(normalizeLicense("other-oa"), null);
  });

  // ── adapters: response shape → candidate ──
  await check("OpenAlex: abstract rebuilt, ids normalized, only OA PDFs are copies", () => {
    assert.equal(abstractFromInvertedIndex(openAlexWork.abstract_inverted_index), "Statins are widely used drugs.");
    const candidate = candidateFromOpenAlex(openAlexWork, 0);
    assert.deepEqual(candidate.identifiers, {
      openalex: ["W2000000001"],
      doi: [DOI],
      pmid: [PMID],
      pmcid: [PMCID],
    });
    assert.equal(candidate.type, "article");
    assert.equal(candidate.copies?.length, 1);
    assert.equal(candidate.copies?.[0].storable, true);
    assert.equal(candidate.authors?.[0].orcid, "0000-0002-1825-0097");
    assert.equal(candidate.authors?.length, 2);
    assert.equal(candidate.face?.pages, "e0123456");
  });

  await check("OpenAlex: filters for years, OA, types and the pack fields", () => {
    assert.equal(
      openAlexFilter({ text: "x", yearFrom: 2018, openAccess: true, types: ["article", "preprint"], field: "biomedicine" }),
      "publication_year:2018-,is_oa:true,type:article|review|letter|preprint,primary_topic.domain.id:1|4"
    );
    assert.equal(openAlexFilter({ text: "x" }), null);
  });

  await check("Semantic Scholar: PMC ids gain their prefix; TLDR kept; arXiv-only papers are preprints", () => {
    const candidate = candidateFromS2(s2Paper);
    assert.deepEqual(candidate.identifiers.pmcid, [PMCID]);
    assert.equal(candidate.tldr, "Most patients tolerated a statin on rechallenge.");
    assert.equal(candidate.copies?.[0].license, "cc-by"); // S2 spells it "CCBY"
    assert.equal(candidate.copies?.[0].storable, true);
    const preprint = candidateFromS2({ paperId: S2_ID, title: "A preprint", externalIds: { ArXiv: "2401.01234" }, publicationTypes: [] });
    assert.equal(preprint.type, "preprint");
    assert.deepEqual(s2SearchParams({ text: "q", yearFrom: 2020, field: "computer-science" }), {
      query: "q",
      year: "2020-",
      openAccessPdf: null,
      fieldsOfStudy: "Computer Science",
      venue: null,
    });
  });

  await check("Crossref: title + subtitle, JATS stripped, VOR licence, most serious notice wins", () => {
    const candidate = candidateFromCrossref(crossrefWork);
    assert.equal(candidate.title, "Statin rechallenge after muscle symptoms: a randomized trial");
    assert.equal(candidate.abstract, "Statins are widely used.");
    assert.equal(candidate.license, "cc-by");
    assert.equal(candidate.copies?.length, 1);
    assert.equal(candidate.retraction?.status, "corrected");
    assert.equal(candidate.year, 2015);
    assert.equal(
      retractionOf([
        { type: "correction", DOI: "10.1/c" },
        { type: "retraction", DOI: "10.1/r", updated: { "date-parts": [[2020, 5]] } },
      ])?.status,
      "retracted"
    );
    // Paywalled publisher PDFs are not copies.
    const closed = candidateFromCrossref({ ...crossrefWork, license: [{ URL: "https://www.elsevier.com/tdm/userlicense/1.0/", "content-version": "tdm" }] });
    assert.equal(closed.copies?.length, 0);
    assert.equal(crossrefFilter({ text: "x", yearFrom: 2018, types: ["preprint"] }), "from-pub-date:2018,type:posted-content");
  });

  await check("Unpaywall: every OA PDF is a copy; repositories named; work licence from the published version", () => {
    const candidate = candidateFromUnpaywall(unpaywallRecord);
    assert.equal(candidate.copies?.length, 2);
    assert.equal(candidate.copies?.[1].host, "Europe PMC");
    assert.equal(candidate.license, "cc-by");
  });

  // ── merge ──
  await check("four sources merge into one Work with field precedence", () => {
    const works = mergeCandidates([
      candidateFromOpenAlex(openAlexWork, 0),
      candidateFromS2(s2Paper, 0),
      candidateFromCrossref(crossrefWork, 0),
      candidateFromUnpaywall(unpaywallRecord),
    ]);
    assert.equal(works.length, 1);
    const work = works[0];
    assert.equal(work.key, `doi:${DOI}`);
    assert.deepEqual(work.provenance.sort(), ["crossref", "openalex", "semantic-scholar", "unpaywall"]);
    assert.equal(work.title, "Statin rechallenge after muscle symptoms: a randomized trial"); // Crossref
    assert.equal(work.abstract, "Statins are widely used drugs. Muscle symptoms are a common reason to stop them."); // S2
    assert.equal(work.tldr, "Most patients tolerated a statin on rechallenge.");
    assert.equal(work.citedByCount, 42); // OpenAlex
    assert.equal(work.license, "cc-by"); // Unpaywall
    assert.equal(work.retraction?.status, "corrected");
    // The same PDF from four sources is one copy, plus the repository copy.
    assert.equal(work.copies.length, 2);
    assert.deepEqual(work.identifiers.s2, [S2_ID]);
    assert.equal(work.face.volume, "10");
  });

  await check("identity is transitive across sources", () => {
    const works = mergeCandidates([
      { source: "a", identifiers: { doi: ["10.1/x"], pmid: ["5"] }, title: "X" },
      { source: "b", identifiers: { pmid: ["5"], arxiv: ["2401.00001"] }, title: "X" },
      { source: "c", identifiers: { arxiv: ["2401.00001"] }, title: "X" },
      { source: "d", identifiers: { doi: ["10.1/other"] }, title: "Other" },
    ]);
    assert.equal(works.length, 2);
  });

  await check("rank fusion floats Works several sources rank highly", () => {
    const candidates: WorkCandidate[] = [
      { source: "a", rank: 0, identifiers: { doi: ["10.1/solo"] }, title: "Solo top" },
      { source: "a", rank: 1, identifiers: { doi: ["10.1/both"] }, title: "Both" },
      { source: "b", rank: 0, identifiers: { doi: ["10.1/both"] }, title: "Both" },
    ];
    assert.deepEqual(
      mergeCandidates(candidates).map((work) => work.title),
      ["Both", "Solo top"]
    );
  });

  // ── faces ──
  await check("faces keep valid fields and drop the rest, per field", () => {
    assert.deepEqual(cleanFace("trial", { phase: "Phase 3", enrollment: -4, status: "", junk: 1, hasResults: true }), {
      phase: "Phase 3",
      hasResults: true,
    });
    assert.deepEqual(cleanFace("unknown-type", { a: 1 }), {});
    assert.deepEqual(cleanFace("statute", { path: ["Title 12", "Part 1026"], asOf: "2026-01" }), {
      path: ["Title 12", "Part 1026"],
      asOf: "2026-01",
    });
  });

  // ── federation ──
  await check("federated search streams merged results; timeouts, errors and gates are reported", async () => {
    const slow: ResearchAdapter = {
      info: { ...openAlexAdapter.info, id: "slow" },
      search: () => new Promise(() => undefined),
    };
    const broken: ResearchAdapter = {
      info: { ...openAlexAdapter.info, id: "broken" },
      search: () => Promise.reject(new Error("api.example answered 500")),
    };
    const paid: ResearchAdapter = {
      info: { ...openAlexAdapter.info, id: "paid" },
      search: () => Promise.reject(new Error("should not be called")),
    };
    const ctx = fixtureContext([
      [/api\.openalex\.org\/works\?/, { meta: { count: 1, next_cursor: "c2" }, results: [openAlexWork] }],
      [/semanticscholar\.org\/graph\/v1\/paper\/search/, { total: 1, next: 25, data: [s2Paper] }],
    ]);
    const events: FederationEvent[] = [];
    const result = await federatedSearch({
      query: { text: "statin rechallenge" },
      adapters: [openAlexAdapter, semanticScholarAdapter, slow, broken, paid],
      ctx,
      timeoutMs: 50,
      gate: (source) => (source === "paid" ? "Paid source — not enabled" : null),
      onEvent: (event) => events.push(event),
    });
    assert.equal(result.works.length, 1);
    assert.deepEqual(result.works[0].provenance.sort(), ["openalex", "semantic-scholar"]);
    const status = Object.fromEntries(result.reports.map((report) => [report.source, report.status]));
    assert.deepEqual(status, { openalex: "ok", "semantic-scholar": "ok", slow: "timeout", broken: "error", paid: "skipped" });
    assert.equal(result.reports.find((report) => report.source === "openalex")?.next, "c2");
    assert.equal(events.filter((event) => event.type === "works").length, 2);
    // The S2 key goes in a header; OpenAlex's in the query.
    assert.ok(ctx.calls.some((call) => call.url.includes("api.openalex.org") && call.url.includes("mailto=research%40example.org")));
  });

  await check("resolve: arXiv → S2 learns the DOI → Crossref and Unpaywall answer in round two", async () => {
    const arxivPaper: S2Paper = { ...s2Paper, externalIds: { ...s2Paper.externalIds, ArXiv: "1501.00001" } };
    const ctx = fixtureContext([
      [/graph\/v1\/paper\/ARXIV%3A1501\.00001/, arxivPaper],
      [/api\.crossref\.org\/works\/10\.1371\/journal\.pone\.0123456/, { message: crossrefWork }],
      [/api\.unpaywall\.org\/v2\/10\.1371\/journal\.pone\.0123456/, unpaywallRecord],
      [/api\.openalex\.org\/works\/doi:10\.1371\/journal\.pone\.0123456/, openAlexWork],
    ]);
    const { work, reports } = await resolveWork({
      identifiers: [{ scheme: "arxiv", value: "1501.00001" }],
      adapters: RESEARCH_ADAPTERS,
      ctx,
    });
    assert.ok(work);
    assert.deepEqual(work.provenance.sort(), ["crossref", "openalex", "semantic-scholar", "unpaywall"]);
    assert.equal(work.identifiers.arxiv?.[0], "1501.00001");
    assert.ok(reports.every((report) => report.status === "ok"));
    // OpenAlex was asked with the raw DOI path, not an escaped one.
    assert.ok(ctx.calls.some((call) => call.url.includes("/works/doi:10.1371/journal.pone.0123456")));
  });

  await check("resolve: unknown identifiers give null; Unpaywall is skipped without a contact email", async () => {
    const ctx = fixtureContext([], {});
    const { work } = await resolveWork({ identifiers: [{ scheme: "doi", value: "10.1/none" }], adapters: RESEARCH_ADAPTERS, ctx });
    assert.equal(work, null);
    assert.ok(!ctx.calls.some((call) => call.url.includes("unpaywall")));
    const keyed = fixtureContext([[/graph\/v1\/paper\/DOI/, s2Paper]], { "semantic-scholar": "s2-key" });
    await semanticScholarAdapter.resolve!({ scheme: "doi", value: DOI }, keyed);
    assert.equal(keyed.calls[0].headers["x-api-key"], "s2-key");
    await crossrefAdapter.resolve!({ scheme: "pmid", value: "1" }, keyed); // not a DOI — no call
    await unpaywallAdapter.resolve!({ scheme: "doi", value: DOI }, keyed); // no email — no call
    assert.equal(keyed.calls.length, 1);
  });

  // ── catalog consistency ──
  await check("catalog: one adapter per source; scopes name only known sources", () => {
    assert.deepEqual(
      RESEARCH_ADAPTERS.map((adapter) => adapter.info.id).sort(),
      RESEARCH_SOURCES.map((source) => source.id).sort()
    );
    for (const adapter of RESEARCH_ADAPTERS) {
      assert.equal(Boolean(adapter.search), adapter.info.roles.includes("discover"), `${adapter.info.id}: discover ⇔ search`);
      assert.equal(Boolean(adapter.resolve), adapter.info.roles.includes("resolve"), `${adapter.info.id}: resolve ⇔ resolve`);
    }
    const known = new Set(RESEARCH_SOURCES.map((source) => source.id));
    for (const scope of RESEARCH_SCOPES) {
      for (const source of scope.sources) assert.ok(known.has(source), `${scope.id} names unknown source ${source}`);
    }
    assert.deepEqual(identifiersFrom([{ scheme: "doi", value: "a" }, { scheme: "doi", value: "a" }]), { doi: ["a"] });
  });

  console.log(`research:check passed (${checks} checks)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
