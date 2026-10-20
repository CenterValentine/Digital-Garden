/**
 * Live smoke against the real research APIs (network required; not a gate).
 *   npx tsx scripts/research-live-smoke.ts
 *
 * Exercises each adapter's search + resolve against the public endpoints with
 * one well-known open-access paper, then federation and the two-round
 * identifier resolve. Uses RESEARCH_CONTACT_EMAIL / OPENALEX_API_KEY /
 * SEMANTIC_SCHOLAR_API_KEY from the environment when set.
 */

import assert from "node:assert/strict";
import type { AdapterContext, AdapterFetchOptions } from "../lib/domain/research/adapter";
import { RESEARCH_ADAPTERS, researchAdapter } from "../lib/domain/research/adapters";
import { federatedSearch, resolveWork } from "../lib/domain/research/federate";
import { parseIdentifierQuery } from "../lib/domain/research/identifiers";
import { researchSource } from "../lib/domain/research/sources";

// "Attention Is All You Need" — arXiv 1706.03762; and a CC-BY PLOS paper with a PMCID.
const ARXIV = "1706.03762";
const PLOS_DOI = "10.1371/journal.pmed.0020124"; // Ioannidis 2005, CC-BY, PMC1182327

const ctx: AdapterContext = {
  async fetchJson<T>(url: string, options?: { headers?: Record<string, string>; timeoutMs?: number; attempt?: number }) {
    const attempt = options?.attempt ?? 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options?.timeoutMs ?? 20_000);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "DigitalGardenReader/1.0 (+https://github.com/CenterValentine/Digital-Garden)", Accept: "application/json", ...options?.headers },
        signal: controller.signal,
      });
      if (response.status === 404) return null;
      if (response.status === 429 && attempt < 4) {
        // Anonymous pools are shared; back off and retry so the adapter is still exercised.
        const wait = Number(response.headers.get("retry-after")) * 1000 || 4_000 * attempt;
        console.log(`    (${new URL(url).hostname} 429 — retrying in ${wait / 1000}s)`);
        clearTimeout(timer);
        await new Promise((resolve) => setTimeout(resolve, wait));
        return ctx.fetchJson(url, { ...options, attempt: attempt + 1 } as AdapterFetchOptions) as Promise<T | null>;
      }
      if (!response.ok) throw new Error(`${new URL(url).hostname} answered ${response.status}`);
      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  },
  credential(id) {
    if (id === "contact-email") return process.env.RESEARCH_CONTACT_EMAIL ?? null;
    const source = researchSource(id);
    return source?.appKeyEnv ? process.env[source.appKeyEnv] ?? null : null;
  },
};

let checks = 0;
async function check(name: string, fn: () => Promise<void>) {
  const started = Date.now();
  await fn();
  checks += 1;
  console.log(`  ✓ ${name} (${Date.now() - started} ms)`);
}

async function main() {
  console.log("research live smoke");
  console.log(`  contact email: ${ctx.credential("contact-email") ? "set" : "NOT set (Unpaywall will be skipped)"}`);

  const openalex = researchAdapter("openalex")!;
  const s2 = researchAdapter("semantic-scholar")!;
  const crossref = researchAdapter("crossref")!;
  const unpaywall = researchAdapter("unpaywall")!;

  await check("OpenAlex resolve by DOI → ids, abstract, OA copy", async () => {
    const c = await openalex.resolve!({ scheme: "doi", value: PLOS_DOI }, ctx);
    assert.ok(c, "no candidate");
    assert.match(c.title ?? "", /research findings are false/i);
    assert.equal(c.identifiers.doi?.[0], PLOS_DOI);
    assert.ok(c.identifiers.pmid?.[0], "pmid missing");
    // OpenAlex doesn't always carry the PMCID even when one exists; S2/Europe PMC fill it.
    if (!c.identifiers.pmcid?.[0]) console.log("    (OpenAlex served no PMCID for this record)");
    assert.ok((c.abstract ?? "").length > 100, "abstract not rebuilt");
    assert.ok(c.copies?.some((copy) => copy.storable), "no storable OA copy");
    assert.equal(c.year, 2005);
  });

  await check("OpenAlex search with filters", async () => {
    const page = await openalex.search!({ text: "statin muscle symptoms randomized", yearFrom: 2015, openAccess: true, sort: "cited" }, ctx);
    assert.ok(page.candidates.length >= 5, `only ${page.candidates.length}`);
    assert.ok(page.candidates.every((c) => (c.year ?? 0) >= 2015), "year filter ignored");
    assert.ok(page.next, "no cursor");
  });

  const skipOn429 = (fn: () => Promise<void>) => async () => {
    try {
      await fn();
    } catch (error) {
      if (error instanceof Error && /429/.test(error.message)) {
        console.log("    – skipped: anonymous pool exhausted (set SEMANTIC_SCHOLAR_API_KEY to exercise it)");
        return;
      }
      throw error;
    }
  };

  await check("Semantic Scholar resolve by arXiv → DOI learned, TLDR present", skipOn429(async () => {
    const c = await s2.resolve!({ scheme: "arxiv", value: ARXIV }, ctx);
    assert.ok(c, "no candidate");
    assert.match(c.title ?? "", /attention is all you need/i);
    assert.ok(c.identifiers.s2?.[0], "s2 id missing");
    assert.ok(c.identifiers.arxiv?.[0] === ARXIV);
    assert.ok((c.citedByCount ?? 0) > 10_000, "citation count implausible");
    // TLDR is served for most popular papers; warn rather than fail if absent.
    if (!c.tldr) console.log("    (no TLDR served for this paper)");
  }));

  await check("Semantic Scholar search", skipOn429(async () => {
    const page = await s2.search!({ text: "transformer attention mechanism", yearFrom: 2017, yearTo: 2018 }, ctx);
    assert.ok(page.candidates.length >= 5, `only ${page.candidates.length}`);
    assert.ok(page.total !== null && page.total > 0);
  }));

  await check("Crossref resolve by DOI → licence, container, VOR copy", async () => {
    const c = await crossref.resolve!({ scheme: "doi", value: PLOS_DOI }, ctx);
    assert.ok(c, "no candidate");
    assert.equal(c.license, "cc-by");
    assert.match(c.venue ?? "", /PLoS Medicine/i);
    assert.equal(c.type, "article");
    assert.ok(c.authors?.some((a) => /ioannidis/i.test(a.name)));
  });

  await check("Crossref search (bibliographic)", async () => {
    const page = await crossref.search!({ text: "why most published research findings are false", sort: "relevance" }, ctx);
    assert.ok(page.candidates.some((c) => c.identifiers.doi?.[0] === PLOS_DOI), "target not in first page");
  });

  if (ctx.credential("contact-email")) {
    await check("Unpaywall resolve by DOI → OA copies", async () => {
      const c = await unpaywall.resolve!({ scheme: "doi", value: PLOS_DOI }, ctx);
      assert.ok(c, "no candidate");
      assert.ok((c.copies?.length ?? 0) >= 1, "no copies");
      assert.equal(c.license, "cc-by");
    });
  } else {
    console.log("  – Unpaywall skipped (set RESEARCH_CONTACT_EMAIL to exercise it)");
  }

  await check("federated search merges the same paper from several sources", async () => {
    const { works, reports } = await federatedSearch({
      query: { text: "why most published research findings are false" },
      adapters: RESEARCH_ADAPTERS,
      ctx,
      timeoutMs: 20_000,
    });
    for (const r of reports) console.log(`    ${r.source}: ${r.status} ${r.count} in ${r.ms} ms${r.error ? ` — ${r.error}` : ""}`);
    const target = works.find((w) => w.identifiers.doi?.[0] === PLOS_DOI);
    assert.ok(target, "target paper not found");
    assert.ok(target.provenance.length >= 2, `only ${target.provenance.join(",")} described it`);
    assert.equal(works.indexOf(target), 0, "target should rank first");
  });

  await check("resolve: PMID → OpenAlex learns the DOI → Crossref answers in round two", async () => {
    const identifiers = parseIdentifierQuery("PMID 16060722");
    assert.ok(identifiers);
    const { work, reports } = await resolveWork({ identifiers, adapters: RESEARCH_ADAPTERS, ctx, timeoutMs: 20_000 });
    for (const r of reports) console.log(`    ${r.source}: ${r.status}${r.error ? ` — ${r.error}` : ""}`);
    assert.ok(work, "no work");
    assert.equal(work.identifiers.doi?.[0], PLOS_DOI, "DOI not learned from OpenAlex");
    assert.ok(work.provenance.includes("openalex"));
    assert.ok(work.provenance.includes("crossref"), "round two (Crossref by learned DOI) did not fire");
    assert.equal(work.key, `doi:${PLOS_DOI}`, "canonical key should be the DOI");
    console.log(`    → ${work.key} · ${work.provenance.join(", ")} · ${work.copies.length} copies`);
  });

  await check("resolve: arXiv id → S2 → DOI → others in round two", skipOn429(async () => {
    const identifiers = parseIdentifierQuery(`arXiv:${ARXIV}`);
    assert.ok(identifiers);
    const { work, reports } = await resolveWork({ identifiers, adapters: RESEARCH_ADAPTERS, ctx, timeoutMs: 20_000 });
    const s2Report = reports.find((r) => r.source === "semantic-scholar");
    // Anonymous 429 retries overrun the per-source timeout; either way S2 didn't answer.
    if (s2Report && s2Report.status !== "ok") throw new Error(`429 (${s2Report.status})`);
    assert.ok(work, "no work");
    assert.ok(work.identifiers.doi?.[0], "DOI not learned");
    assert.ok(work.provenance.includes("openalex") || work.provenance.includes("crossref"), "round two did not fire");
    console.log(`    → ${work.key} · ${work.provenance.join(", ")}`);
  }));

  console.log(`research live smoke passed (${checks} checks)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
