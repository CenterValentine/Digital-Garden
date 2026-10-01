---
status: proposed — owner decisions (§7) and codebase review (§9) recorded 2026-10-01; awaiting approval
created: 2026-09-30
parent: EREADER-PLAN.md (R-Research — the third reader source after Books and Scriptures)
scope: research discovery, open-access full text, library import, paper reading, AI research, domain packs
---

# Research in the reader: one place to find, read and structure sources

The entry point is **+ → Reader → Research**. Today it is a "coming soon" stub
(`extensions/reader/client.tsx`). This plan does two things:

- It designs the **one interface** that can grow to cover research breadth.
  That means scholarly indexes, open-access full text, preprint servers, reference
  managers, AI research, and domain packs for law, patents, medicine, data and
  archives. The goal is that the breadth never turns into a pile of screens.
- It keeps a **registry of every service we considered**. Each entry has a value
  rating and a phase, so a service left out of V1 is still recorded with the
  reason it waits.

> **Verification note.** Prices, rate limits and terms were written from knowledge
> as of mid-2026 and **not re-checked against vendor pages** for this draft. Each
> adapter PR re-checks its service's current terms and updates its row. That check
> is part of that PR's definition of done.

---

## 1. Judged against the product principles

- **Principle 1: a research project is a folder.** Papers are ordinary content
  nodes: a PDF file node, or a link node for works we can't store. They go in the
  folder the + menu was opened on (default `Research/`), with a `WorkMeta` side
  row, just like books get `BookMeta`. There is **no separate "project" container**,
  and a Zotero collection syncs *as a folder*. Saved searches and AI research
  reports are nodes in that same folder, so the whole inquiry is one subtree the
  user can move, share, trash or open as a workbench.
- **Principle 2: unrefined → structured.** "Research / literature notes: one paper
  → Papers → Findings (claims), Sources" is a row in the principle's own table.
  The principle calls the *evidence-based record* (entity → assertions →
  provenance) the recurring shape, and this is the purest instance of it. So a
  highlight in a paper is one action away from a **Claims** row that keeps its
  locator. A paper with no extracted findings shows as a visible gap, not as
  silence.
- **Extension-gating ladder.** No new extension. Research is a third source
  inside `extensions/reader/`, next to Books and Scriptures. It reuses the shell
  hooks (create-menu items, virtual content, viewer matchers with `mimeType` and
  `externalResourceType`), the annotation store, the sidebar rail, send-to-note,
  speed read and the full-screen drawer.
- **Prefer maintained libraries** (CLAUDE.md). Parsing PDFs, resolving
  identifiers, formatting citations and extracting metadata from pages are all
  solved problems. §6 names what we adopt so we don't build those ourselves.

---

## 2. The UI: how the whole breadth fits one interface

### 2.1 The pull we must resist

Each service invites its own screen: an arXiv tab, a PubMed tab, a CourtListener
tab, a Zotero pane, a "deep research" app. The Books library already shows the
start of this. Its **Find** tab is a *source dropdown*, which works for 7 book
sources and breaks at 60 research sources. Users don't think "query OpenAlex".
They think *find work on X*, *what cites this*, *what's the law on Y*, *get me
the PDF*. **The source is provenance, not navigation.**

### 2.2 Five ideas that hold the whole thing together

1. **One noun: the Work.** Every source maps its results into a single `Work`
   record, keyed by normalized identifiers (DOI, arXiv, PMID/PMCID, ISBN, OpenAlex
   id, S2 id, NCT, court citation, patent number, URL).
   - Results from several sources merge into one card when their identifiers match.
   - A Work has a **type** (article, preprint, book, chapter, dataset, case, statute
     or regulation, patent, clinical trial, archival item, web page). Each type has
     a **face**: the fields its card, details view and reader show.
   - **Domain packs add faces, not screens.**
2. **Scopes, not sources.** One search box plus a **scope** picker:
   - *Everything scholarly · Preprints · Biomedicine · CS & ML · Law (US) ·
     Patents · Data & statistics · Archives · My library · This folder*.
   - A scope is a named bundle of sources, with default facets and an identifier
     grammar. **Installing a domain pack installs a scope.**
   - The individual sources in a scope sit behind a "Sources" disclosure, for
     power users. It works like the scripture catalog's "More traditions".
3. **The search box understands identifiers**, the way the scripture box
   understands "Alma 32:21". Pasting any of these resolves straight to the Work,
   with no search step:
   - `10.1038/…`, `arXiv:2401.01234`, `PMID 12345`, `NCT01234567`;
   - `410 U.S. 113`, `US 10,123,456 B2`, a URL, an ISBN.
4. **The access ladder on every Work.** A Work shows its best reading option first,
   then the fallbacks:
   - **Read here** (open-access full text, stored or reflowed)
   - → **Preprint version** (a different Work, linked)
   - → **Your library** (the user's OpenURL / EZproxy base URL, so paywalled items
     reach them legally)
   - → **Request** (email the author, interlibrary-loan link)
   - → **Abstract only**.

   The badge on a card is the top rung that's available.
5. **One pipeline of states, not separate apps:**
   Found → Saved (in a folder, status *to read*) → Read (annotated) → Extracted
   (claim rows) → Cited (linked from your notes).
   - Reading status extends the books' `want / reading / finished / reference`.
   - AI research is **a mode of the same search box** (Search ⇄ Ask). It isn't a
     separate product.

### 2.3 Where each surface lives (owner rules: right sidebar, no panel inside a panel)

| Surface | Where | What |
|---|---|---|
| **Find** | Main-panel tab "Research". Opened from + → Reader → Research. The + menu opened on a folder already passes that folder (`parentId`), which scopes the search and the destination to it. No new file-tree context-menu hook is needed. | Search box with scope, facets row, and merged results streaming in. A **source strip** shows which sources answered, which were slow or failed, and which paid sources are off until you click (*"Also ask Google Scholar — uses your SerpAPI key"*). |
| **Preview** | Right sidebar → **Work** view | Selecting a result shows its details, abstract / TLDR, access ladder, references, cited-by and related works. **Add to folder** and **Open**. There's no preview pane inside the Find tab. |
| **Read** | Main panel reader | Reflowable HTML when we can get it: JATS from PMC / Europe PMC, arXiv HTML, publisher HTML. Otherwise an annotated PDF (pdf.js). Same themes, marks, speed read and full screen as books. |
| **Secondary toolbar** (paper-specific) | Under the content toolbar | Sections, figures, the reflow ⇄ PDF toggle, and a references jump. Each is a shortcut into a sidebar view, not a private panel. |
| **Sidebar rail for an open paper** | Right sidebar | Existing views: Contents · Search · Notes · Display. New views: **Details · References · Cited by · Related · Claims**. Clicking a citation marker in the text opens that reference in the rail, with Add / Open. |
| **The project** | The folder itself | A **Papers** view: a query-mode database whose rows *are* the folder's paper nodes, so nothing is copied, with read-only meta columns from `WorkMeta` (authors, year, venue, type, access, status) — §9.4. Saved-search nodes show "12 new". AI reports are notes. The Claims database sits beside them. |
| **Settings** | Settings → Reader → Research | **Packs** (a catalog like scripture traditions), **Connections** (API keys: Semantic Scholar, CORE, Zotero, Exa, SerpAPI…), **Institution** (OpenURL / EZproxy), and a contact-email policy for the "polite pools". |

```
┌ Research ──────────────────────────────────────────────────────────────┐
│ [Scope: Biomedicine ▾] [ statin myopathy randomized          ] [Search|Ask] │
│ Year 2015–  · Type: article, trial · Open access only ☐ · Sort: relevance   │
│ Sources: PubMed ✓  Europe PMC ✓  OpenAlex ✓  ClinicalTrials ✓  S2 … (+2 off)│
├────────────────────────────────────────────────────────────────────────┤
│ ● Statin-associated muscle symptoms …   Lancet 2022 · RCT meta · Read here   │
│   PubMed · Europe PMC · OpenAlex         cited 412 · TLDR: …                 │
│ ● NCT01234567 — Statin rechallenge …    Trial · completed · results posted   │
│ ● …                                                                          │
└────────────────────────────────────────────────────────────────────────┘
   selecting a row shows it in the right sidebar → Work view
```

### 2.4 The deliberate exceptions (where one face isn't enough)

Some types need their own reading experience, not just a card face:

- **Statutes and regulations** (US Code, CFR, EUR-Lex, legislation.gov.uk) are
  hierarchical, versioned and cited by unit, like scripture, but the scripture
  model doesn't stretch to fit them (§9.3). It is a fixed volume → book →
  numbered chapter → numbered verse, stored locally. Statutes have arbitrary
  depth and string ids (`1026.19`, `501(c)(3)`), and are fetched remotely and
  versioned. They get a **generic hierarchical-corpus interface and a small
  statute viewer** built from the reader's shell pieces (themes, marks, sidebar,
  anchors), with links like `[[26 USC 501(c)(3)`. Scriptures can move onto that
  interface later.
- **Datasets and statistical series** (FRED, World Bank, OWID) get a chart
  preview. "Add" can drop a chart or table block into a note, not only a link node.
- **Archival images** (IIIF from LoC, Europeana, Gallica, museums) get an
  image-first face (OpenSeadragon, BSD). Annotation uses image regions instead of
  text quotes.
- **Patents** get a claims-structured face (independent / dependent claims, family,
  CPC classes).
- **Court opinions** get a citation-dense face: in-text case citations resolve to
  Works (eyecite / reporters-db grammar), and treatment is shown when available.

Everything else — articles, preprints, books, chapters, trials, theses, reports,
web pages — shares the scholarly face.

### 2.5 Ask mode (AI research) in the same box

- **Search** returns Works. **Ask** runs a research job and returns a **report
  note** in the folder, with a progress card in the tab.
- **Every claim in the report cites a Work.** Each cited Work is added to the
  folder as a node, and the report links to the exact passage (anchor) when we have
  full text.
- **Principle 2 applies:** unanswered sub-questions become explicit placeholders
  in the report, not smooth prose.
- **The AI tools call the same adapters the UI calls.** It's one adapter layer
  with two consumers: `search_research`, `get_work`, `get_full_text`,
  `citations_of`. The AI is never a second, weaker integration.
- **Long runs use durable jobs** (the `workflows` extension's run machinery). Each
  run shows a cost / step budget, and paid web-search calls follow the user's
  keys.

---

## 3. Architecture: five adapter roles over one Work model

The services differ a lot, but each does one or more of these **roles**. An
adapter declares its roles and capabilities, and the federation layer composes
them.

| Role | Contract (sketch) | Examples |
|---|---|---|
| **Discover** | `search(query, facets, page) → WorkCandidate[]` | OpenAlex, Semantic Scholar, PubMed, CourtListener, PatentsView |
| **Resolve** | `resolve(identifier) → Work` · `copies(work) → Copy[]` (full-text locations and their licences) | doi.org / Crossref, Unpaywall, arXiv, PMC, CORE, OpenURL |
| **Fetch / render** | `fullText(copy) → { kind: "jats" \| "html" \| "pdf" \| "tei" \| "text", body }` | PMC JATS, arXiv HTML, publisher PDF, GROBID TEI |
| **Enrich** | `references(work)`, `citedBy(work)`, `related(work)`, `tldr(work)`, `status(work)` (retracted / corrected) | Semantic Scholar, OpenCitations, Crossref (Retraction Watch), iCite |
| **Import / sync** | `collections()`, `items(since)`, optional `push(item)` | Zotero, BibTeX / RIS / CSL-JSON, Hypothesis, Readwise (built) |

- **Capabilities are declared per adapter:** which facets it honours, whether it
  has full text, its rate limit, its cost class (free / keyed / paid per call), and
  its auth.
  - Facets an adapter doesn't support are greyed per source in the UI, not
    silently ignored.
  - As with `pnpm ai:matrix`, a generated **`RESEARCH-SOURCE-MATRIX.md`** plus a
    `research:matrix:check` gate keeps the docs honest as adapters grow.
- **Federation runs server-side** (keys never reach the browser), with a timeout
  per source.
  - Results stream to the client as each source answers, the same streaming
    pattern as the sidebar search.
  - Results are merged by identifier, and each merged Work keeps its **provenance**
    (which sources returned it).
- **Storage** (additive schema, per the migration-first rule):
  - A `WorkMeta` side row per content node: type, identifiers JSON, face fields
    JSON, access, reading status.
  - A shared `WorkCache` of resolved metadata keyed by normalized identifier,
    re-fetched when stale.
  - Annotations reuse `ReaderAnnotation` (`targetKey: content:<id>`).
  - Saved searches are `external` nodes with `resourceType: "research-query"`, the
    same trick as scripture sessions.
- **The Books library later moves onto the same contract.** Book sources are
  Discover + Resolve adapters for `type: book`, which lets "Find" in Books become
  the *Books* scope.
- **Egress safety is reused unchanged:** the reader's SSRF-guarded fetch (DNS +
  redirect re-validation, size and time caps) and its DRM refusal.

---

## 4. Phases

This plan covers **V1.0–V1.2**. Everything marked V1.3+ — including the AI ideas in §8 that
we're not doing now — is tracked in `BACKLOG.md` under "Research reader — V1.3 and beyond".

| Phase | Contents |
|---|---|
| **V1.0 — Research core** (owner: "all of 1–4") | **Discover:** OpenAlex, Semantic Scholar, Crossref. **Resolve / full text:** Unpaywall, arXiv, Europe PMC + PMC OA, bioRxiv/medRxiv, CORE, DOAJ. **Enrich:** S2 references / cited-by / related / TLDR, OpenCitations, Crossref retractions. **Import:** Zotero (Zotero is the source of truth: collections → folders, plus Zotero's PDF annotations read-only, plus "Save to Zotero" create-only push — §7.4), BibTeX / RIS / CSL-JSON files, Hypothesis, DOI/URL paste. **Reader:** JATS/HTML reflow + annotated PDF (pdf.js), Work sidebar views, the Claims action. **Find tab** with scopes, the identifier-aware box and the access ladder. Institution setting (OpenURL / EZproxy). **Packs: Biomedicine, CS & ML.** **Law stub (a probe):** the Law scope shows in the pack catalog as "coming in V1.1". A pasted case citation resolves through CourtListener to a **case** Work, saved as a link node. **One CFR section** opens through the generic hierarchical-corpus interface over the eCFR API (§9.3). **Paid-source probe:** Google Scholar via SerpAPI (BYOK), to exercise the cost gate. **Foundations from the first PR:** the source capability matrix + its CI check; a Work model that never assumes a paper (multi-valued identifiers, open type list, per-type schema); region locators in the locator type, with Zotero image annotations as real data (listed, not drawn, until V1.2); a test-only check that one book source (Open Library) satisfies the adapter contract; the shared text-quote re-anchoring module (§9.1); and the quota / caching / key policy (§9.5). **AI:** paper context bundle, research tools, chat with the open paper, explain-selection, summaries, plain-English → filters (§8). |
| **V1.1** | **Ask mode:** port the deep-research loop onto AI SDK v6; use the provider's built-in web search first, with Exa / Tavily / Parallel / Perplexity as BYOK connections. **Screening** and **Ask this folder** (§8). **Following:** saved-search nodes with "new since", citation alerts. **Pack: Law (US)** (full). |
| **V1.2** | **Packs:** Patents, Data & statistics, Archives & humanities. **Also:** citation-graph folder view, citation node + bibliography block in notes (§7a). |
| **V1.3+ (backlog)** | **Packs:** Physics / Astro / Math, Economics & social science, Education, Earth & environment, EU / UK law. **Also:** paid PDF parsers (BYOK), scite / Consensus if their APIs fit, provider-managed deep research as a "delegate" option, SPECTER2 semantic similarity over your own library (needs pgvector — not enabled today). |

**Why these packs first.** Biomedicine and CS & ML reuse the scholarly face and
have the best free APIs in the registry, so they cost the least to add. Law
needs new faces (case, statute) and a citation grammar, but has excellent free
sources (Free Law Project), which makes it the highest-value *new* face.
Patents, data and archives each bring one exception from §2.4, so they come after
the faces pattern is proven.

---

## 5. Service registry

**How to read it.**

- **Value** ★1–5 is what the service adds to *this* product, given coverage,
  uniqueness, quality and cost.
- **Access:**
  - **F** free, no key
  - **K** free with a key or contact email
  - **$** paid, the user brings their own key
  - **I** institutional pricing
  - **L** no usable API, so link-out only
- **Phase:** V1.0 / V1.1 / V1.2 / V1.3+ (tracked in `BACKLOG.md`) / Link / Skip.

### 5.1 Scholarly discovery indexes

| Service | What it adds | Value | Access | Phase | Notes |
|---|---|---|---|---|---|
| **OpenAlex** | ~250M works, plus authors, institutions, topics, funders and citations; CC0 | ★★★★★ | K | V1.0 | The backbone. Moved to API keys and a free daily allowance in 2025, with paid tiers for heavy use — verify the current quota. Filters are rich enough for most facets. |
| **Semantic Scholar** | Search, TLDRs, recommendations, citation *contexts* (the sentence that cites), SPECTER2 embeddings | ★★★★★ | K | V1.0 | Enrich + Discover. The key raises the rate limit. Licence agreement requires attribution. |
| **Crossref REST** | Authoritative DOI metadata, funders, licences, *update notices* (retractions, corrections; Retraction Watch data has been open since 2023) | ★★★★★ | F | V1.0 | Use the polite pool (mailto). Metadata Plus (paid) only buys SLAs, not needed. |
| **doi.org content negotiation** | Any DOI → CSL-JSON / BibTeX directly | ★★★★ | F | V1.0 | The resolver behind DOI paste. Works across Crossref, DataCite and mEDRA. |
| **OpenCitations** (Index / Meta) | Open citation links, CC0 | ★★★ | K | V1.0 | Fallback for cited-by when S2 is rate-limited. An access token is recommended. |
| **DataCite** | DOIs for datasets, software, theses | ★★★ | F | V1.2 | Joins with the Data pack. |
| **ORCID public API** | Author identity, works lists | ★★★ | K | V1.1 | "All works by this author" and disambiguation. |
| **ROR** | Institution identity | ★★ | F | V1.2 | Normalizes affiliation facets. |
| **OpenAIRE Graph** | EU research graph: projects, funding, data↔paper links | ★★★ | F | V1.3+ | Overlaps with OpenAlex. Its strength is European funder links. |
| **Lens.org** | Scholarly works + patents in one API | ★★★ | K/$ | V1.2 | Access by application. Most valuable for scholarly↔patent links in the Patents pack. |
| **Dimensions** | Grants, trials, policy docs, patents | ★★★ | I | Link | API access is institutional or research-programme only. The free web app is linkable. |
| **Scopus / Web of Science** | Curated citation indexes | ★★ | I | Skip | Institutional pricing, and OpenAlex + S2 cover the need. |
| **Google Scholar** (via SerpAPI / Serper) | The broadest recall, including grey literature | ★★★ | $ | V1.1 | No official API. Offer it as an opt-in paid source in the source strip, with the per-call cost shown. |
| **BASE** (Bielefeld) | 400M+ records from repositories | ★★ | K | V1.3+ | Needs the server's IP registered — verify the terms. Largely covered by CORE + OpenAlex. |
| **Microsoft Academic** | — | — | — | Skip | Retired in 2021. OpenAlex is its successor. |

### 5.2 Open-access full text and resolvers

| Service | What it adds | Value | Access | Phase | Notes |
|---|---|---|---|---|---|
| **Unpaywall** | The legal free copy for any DOI, with licence and version (published / accepted / submitted) | ★★★★★ | K (email) | V1.0 | The heart of the access ladder. ~100k calls/day. |
| **Europe PMC** | Search plus **JATS full text** for the OA subset, preprints, grants, and a text-mined **annotations API** (genes, diseases, chemicals) | ★★★★★ | F | V1.0 | The best reflowable source. The annotations feed the Biomedicine face. |
| **PubMed Central OA subset** (+ BioC) | JATS / BioC full text | ★★★★ | K | V1.0 | Via NCBI E-utilities and the OA web service. |
| **CORE** | 30M+ full texts aggregated from repositories | ★★★★ | K | V1.0 | Catches green-OA copies Unpaywall misses. Commercial use needs CORE's paid services — we're a personal tool, verify. |
| **arXiv** | Preprints (physics, math, CS, q-bio, q-fin, stats, EESS, econ); PDF + **HTML** (ar5iv/LaTeXML) | ★★★★★ | F | V1.0 | Guidance is about 1 request per 3 s. Licences vary per paper: store the user's copy, never mirror. Prefer the HTML render for reflow. |
| **DOAJ** | 20k+ vetted OA journals; licence metadata | ★★★ | F | V1.0 | Quality signal: "in DOAJ" badge. |
| **Internet Archive Scholar** (fatcat) | Preserved copies of vanished OA papers | ★★★ | F | V1.1 | Last rung before "abstract only". |
| **Zenodo** | Papers, data, software with DOIs | ★★★ | F | V1.2 | Data pack. |
| **OSF Preprints** (PsyArXiv, SocArXiv, EdArXiv…) | Social-science and psychology preprints | ★★★ | F | V1.3+ | Econ / Social pack. |
| **HAL** | French national repository | ★★ | F | V1.3+ | |
| **Figshare**, **Dryad** | Datasets and supplements | ★★ | F | V1.2 | Data pack. |
| **Sci-Hub / LibGen / Anna's Archive** | — | — | — | **Skip** | Copyright infringement. Never integrated or linked. The access ladder uses legal routes only (OA, preprint, the user's library, request). |

### 5.3 Preprint servers and field indexes (the basis of domain packs)

| Service | Field | Value | Access | Phase | Notes |
|---|---|---|---|---|---|
| **bioRxiv / medRxiv API** | Biology, medicine | ★★★★ | F | V1.0 | Biomedicine pack. Includes "published as" links to the journal version. |
| **OpenReview API** | ML conference papers **with their peer reviews** | ★★★★ | F | V1.0 | CS & ML pack. Reviews show in the sidebar under "Reviews". |
| **DBLP** | Computer-science bibliography, CC0 | ★★★★ | F | V1.0 | CS & ML pack. Clean venue data. |
| **Hugging Face Papers** | Daily ML papers, linked models, datasets and code | ★★★ | F | V1.0 | CS & ML pack. Papers with Code was retired into this in 2025. |
| **ACL Anthology** | NLP papers (data on GitHub) | ★★★ | F | V1.2 | CS & ML pack add-on. |
| **IEEE Xplore API** | Engineering metadata | ★★ | K / I | V1.3+ | Full text needs a subscription. Metadata is mostly in OpenAlex. |
| **ACM Digital Library** | CS | ★★ | L | Link | No public API. OpenAlex + DBLP cover the metadata. |
| **ChemRxiv** | Chemistry | ★★ | F | V1.3+ | |
| **NASA ADS** | Astronomy and physics; full-text search, citations | ★★★★ | K | V1.3+ | Physics / Astro pack. Excellent. |
| **INSPIRE-HEP** | Particle physics | ★★★ | F | V1.3+ | Physics pack. |
| **zbMATH Open** | Mathematics reviews and metadata (open since 2021) | ★★★ | F | V1.3+ | Math pack. |
| **MathSciNet** | Math reviews | ★★ | I | Link | |
| **OEIS** | Integer sequences | ★★ | F | V1.3+ | Math-pack delight. |
| **RePEc / IDEAS** | Economics working papers | ★★★ | F (bulk) | V1.3+ | No live search API. Harvest RePEc metadata. |
| **NBER**, **SSRN** | Econ / law / social-science working papers | ★★ | L | Link | No API. Items appear through OpenAlex / Crossref anyway. |
| **ERIC API** | Education research | ★★★ | F | V1.3+ | Education pack. |
| **PhilPapers** | Philosophy | ★★ | L / K | V1.3+ | Limited API. |

### 5.4 Enrichment and quality signals

| Service | What it adds | Value | Access | Phase | Notes |
|---|---|---|---|---|---|
| **Crossref update notices** (Retraction Watch) | Retracted / corrected / expression of concern | ★★★★★ | F | V1.0 | A red badge on the Work and on every note that cites it. It's cheap and very valuable. |
| **S2 citation contexts + intents** | *How* a paper is cited (background / method / result) | ★★★★ | K | V1.0 | Shown in the "Cited by" view. |
| **iCite** (NIH) | Relative citation ratio, clinical citations, open citation data | ★★★ | F | V1.0 | Biomedicine pack. |
| **PubTator3** (NCBI) | Entity annotations (genes, chemicals, diseases, variants) | ★★★ | F | V1.1 | Biomedicine pack: entity chips in the reader. |
| **scite** | Smart Citations (supporting / contrasting) | ★★★★ | $ / I | V1.3+ | Individual plans exist; API access is institutional — verify. Excellent if the API becomes reachable. |
| **Altmetric** | Attention (news, policy, social) | ★★ | I | Skip | Institutional. The free badge embed can be a link. |

### 5.5 Library import and sync

| Service | What it adds | Value | Access | Phase | Notes |
|---|---|---|---|---|---|
| **Zotero Web API** | The user's existing library: collections → folders, items, notes, attachments, tags | ★★★★★ | K (OAuth) | V1.0 one-way, V1.2 two-way | Principle 1's main case: *project the library they already keep*. File download works for their own synced storage. |
| **BibTeX / BibLaTeX / RIS / CSL-JSON / EndNote XML import** | Every other manager (Mendeley, Paperpile, EndNote, JabRef, ReadCube) via export | ★★★★ | F | V1.0 | Parse with **citation-js** (MIT). |
| **Hypothesis API** | The user's web / PDF annotations (W3C Web Annotation) | ★★★★ | K | V1.0 | Same anchoring model as ours (TextQuote + TextPosition). They import as `ReaderAnnotation` with `source: "hypothesis"`. |
| **Mendeley API** | Library sync | ★★ | K | V1.3+ | Elsevier restricts new app registrations — verify. BibTeX export covers the need. |
| **Paperpile, EndNote, ReadCube Papers** | — | ★ | L | Import via file | No public APIs. |
| **Readwise** | Highlights including papers | ★★★ | K | Built | Already imported by the reader (R4). |
| **Kindle clippings** | — | — | — | Built | Books only. |

### 5.6 Identity, metadata extraction and citation formatting (libraries and services)

| Tool | What it does | Value | Licence | Phase | Notes |
|---|---|---|---|---|---|
| **Zotero translation-server** | URL / DOI / ISBN / PMID → full metadata using Zotero's 600+ site translators | ★★★ | AGPL (would be a separate service) | V1.3+, only if needed | **No new servers (§7.3).** Citation meta tags + DOI sniffing + Crossref cover most pages; it only adds the long tail of odd sites. |
| **citation-js** | Parse and emit BibTeX, RIS, CSL-JSON, Wikidata; resolve DOIs | ★★★★★ | MIT | V1.0 | Runs in-process, TypeScript-friendly. |
| **citeproc-js** + **CSL styles repo** (~10k styles) | Format citations and bibliographies in any style | ★★★★ | CPAL-1.0 / AGPL dual | V1.2 | **Check licence fit before bundling.** CPAL has attribution terms. Styles are CC-BY-SA. |
| **reporters-db / courts-db** (Free Law Project) | Legal reporter abbreviations and court data as JSON | ★★★★ | BSD | V1.1 | Law pack citation grammar in TypeScript, the way we did scripture references. |
| **eyecite** (Free Law Project) | Find and resolve legal citations in text | ★★★★ | BSD (Python) | V1.1 | Python. Use its data and tests as our grammar's fixtures, or run it as a service. |

### 5.7 Full text: reading and parsing

| Tool / service | What it does | Value | Access / licence | Phase | Notes |
|---|---|---|---|---|---|
| **pdf.js** (`pdfjs-dist`, already a dependency) | Render PDF with a text layer | ★★★★★ | Apache 2 | V1.0 | The annotated PDF face. Replaces the `<iframe>` viewer when opened in the reader. |
| **EmbedPDF** / **react-pdf-highlighter** | PDF highlight layers | ★★★★ | MIT | V1.0 | Pick one. The anchor model stays ours (W3C selectors + page). |
| **unpdf** | Server-side pdf.js for text extraction | ★★★ | MIT | V1.0 | For search text and AI capsules. |
| **JATS → HTML** (e.g. Curvenote's `jats-xml`) | Reflow PMC / Europe PMC / eLife articles | ★★★★★ | MIT (verify package) | V1.0 | Reflow beats PDF for themes, speed read, accessibility, mobile and stable anchors. |
| **arXiv HTML** (LaTeXML) | Reflow for arXiv papers | ★★★★ | F | V1.0 | Falls back to PDF when HTML conversion failed. |
| **Readability** (`@mozilla/readability`, already a dependency) | Reflow publisher HTML and web pages | ★★★ | Apache 2 | V1.0 | |
| **GROBID** | PDF → TEI: title, sections, **parsed reference list**, citation markers | ★★★ | Apache 2 (Java, Docker) | V1.3+, only if needed | **No new servers (§7.3).** Reflowed sources, Semantic Scholar's reference lists, PDF outlines and on-demand AI extraction cover it. |
| **Docling** (IBM) | PDF / DOCX / PPTX → structured doc, tables, figures | ★★★★ | MIT | V1.3+ | Stronger on tables. Alternative or complement to GROBID. |
| **PaperMage** (Ai2) | Scholarly PDF structure | ★★★ | Apache 2 | V1.3+ | |
| **Unstructured** | General document partitioning | ★★ | Apache 2 | Skip | Docling covers the need. |
| **Mathpix** | Best math / equation OCR → LaTeX / Markdown | ★★★★ | $ | V1.3+ (BYOK) | For math-heavy scans. |
| **Mistral OCR** | Fast, cheap PDF → Markdown (~$1 / 1k pages) | ★★★ | $ | V1.3+ (BYOK) | |
| **LlamaParse**, **Reducto** | Managed parsing | ★★ | $ | V1.3+ | |
| **Native PDF input** (Claude, Gemini) | The model reads the PDF directly | ★★★★ | via the user's AI connection | V1.1 | Already in the AI capability matrix. Used by Ask mode for single-paper Q&A. |
| **Marker** | PDF → Markdown | ★★ | GPL + weights with commercial limits | Skip | Licence. |
| **Nougat** (Meta) | Academic PDF → Markdown | ★★ | Weights CC-BY-NC | Skip | Non-commercial weights. |
| **MinerU**, **PyMuPDF**, **CERMINE** | PDF parsing | ★★ | AGPL / custom | Skip | Licence cost with no unique gain over GROBID + Docling. |
| **OpenSeadragon** / **Mirador** (IIIF) | Deep-zoom images, IIIF manifests | ★★★★ | BSD / Apache | V1.2 | The Archives face (§2.4). |

### 5.8 Web search and fetching for Ask mode (the user brings their own keys)

| Service | What it adds | Value | Access | Phase | Notes |
|---|---|---|---|---|---|
| **Provider built-in search** (Anthropic web search + web fetch, OpenAI web search, Gemini Google-search grounding) | Search with zero extra keys for users with an AI connection | ★★★★★ | via AI connection | V1.1 | First choice. AI SDK v6 exposes these as provider tools. |
| **OpenAI deep-research models**, **Gemini Deep Research agent** | Fully managed multi-step research | ★★★ | via AI connection | V1.3+ | Offered as "delegate to provider". Our loop remains the default so citations resolve to Works. |
| **Exa** | Neural search tuned for papers and long-form; research endpoint | ★★★★ | $ | V1.1 | Best paid fit for research. |
| **Tavily** | Search built for AI, with a monthly free allowance | ★★★★ | K / $ | V1.1 | Easy starter key. |
| **Parallel** | Search + Task API (deep research with citations) | ★★★★ | $ | V1.1 | |
| **Perplexity Sonar** (incl. deep research) | Answer + citations | ★★★ | $ | V1.1 | Answers are opaque — show its citations as Works. |
| **Brave Search API** | Independent web index | ★★★ | K / $ | V1.1 | Free tier terms changed over time — verify. |
| **Serper**, **SerpAPI** | Google results, including Scholar | ★★★ | $ | V1.1 | Also powers the Google Scholar source (§5.1). |
| **Kagi**, **You.com**, **Linkup** | Alternative indexes | ★★ | $ | V1.3+ | |
| **Firecrawl** | Crawl / scrape → Markdown | ★★★ | $ (hosted) / AGPL self-host | V1.1 | Readability covers single pages. Firecrawl is for site-wide crawls. |
| **Jina Reader** (`r.jina.ai`) | URL → clean Markdown | ★★★ | K | V1.1 | Fallback reader for hostile pages. |
| **Crawl4AI** | Open-source crawler | ★★ | Apache 2 | V1.3+ | Self-host option. |
| **SearXNG** | Self-hosted metasearch | ★★ | AGPL | V1.3+ | Zero-key option for self-hosters. |

**AI SDK fit.** The AI SDK tools registry lists drop-in tools for several of these
(Exa, Tavily, Parallel, Firecrawl, Perplexity search) — verify package names at
build time. AI SDK v6's MCP client can mount community MCP servers (Zotero,
arXiv, PubMed, multi-source paper search). **Our own adapters stay primary**, so
that UI and AI see the same Works. MCP is the escape hatch for sources we
haven't built.

### 5.9 Research agents and paper-QA systems (code to port or learn from)

| Project | What it is | Value | Licence | Use |
|---|---|---|---|---|
| **dzhng/deep-research** | Minimal TypeScript loop: queries → search → learnings → recurse → report | ★★★★★ | MIT | **Port into Ask mode** (same stack, ~500 lines). |
| **nickscamara/open-deep-research** | Next.js + AI SDK + Firecrawl deep research | ★★★★ | MIT | UI and streaming reference. |
| **jina-ai/node-DeepResearch** | TypeScript search-read-reason loop with token budgets | ★★★★ | Apache 2 | Budget and "beast mode" patterns. |
| **LearningCircuit/local-deep-research** | Research over arXiv / PubMed / SearXNG, local-first | ★★★ | MIT | Academic-source routing ideas. |
| **GPT Researcher** | Mature multi-agent researcher; has an MCP server | ★★★★ | Apache 2 | Reference design only (no new servers, §7.3). |
| **LangChain open_deep_research** | Supervisor + researcher graph | ★★★ | MIT | Reference design. |
| **Stanford STORM / Co-STORM** | Writes cited, Wikipedia-style articles through perspective-guided questioning | ★★★★ | MIT | The **"literature review note"** output format. |
| **PaperQA2** (FutureHouse) | High-accuracy cited Q&A over a PDF set; beats humans on its benchmarks | ★★★★★ | Apache 2 | "Ask this folder" — port its RCS (rerank-contextual-summarize) method (§8). |
| **Ai2 OpenScholar**, **ScholarQA / Asta** | Open scientific-literature synthesis | ★★★★ | Apache 2 | Method reference; open weights. |
| **HF smolagents open_deep_research** | Open reproduction of deep research | ★★★ | Apache 2 | Reference. |
| **Khoj** | Personal AI over your docs, with research mode | ★★ | AGPL | Reference only. |

### 5.10 Domain packs

Each pack is a catalog entry, like a scripture tradition. It bundles a **scope**
(its sources and default facets), any **new faces**, an **identifier grammar**,
and a **citation style**.

**Biomedicine — V1.0**

| Service | Adds | Value | Access |
|---|---|---|---|
| PubMed (E-utilities) | The canonical biomedical index, MeSH | ★★★★★ | K |
| Europe PMC | Full text, preprints, annotations (see §5.2) | ★★★★★ | F |
| ClinicalTrials.gov API v2 | Trials: status, arms, outcomes, results | ★★★★★ | F |
| bioRxiv / medRxiv | Preprints | ★★★★ | F |
| iCite, PubTator3 | Metrics, entity annotations | ★★★ | F |
| NIH RePORTER API | Grants and their publications | ★★★ | F |
| openFDA, DailyMed, RxNorm | Drug labels, adverse events, drug names | ★★★ | F |
| MeSH (NLM) | Controlled vocabulary for facets | ★★★ | F |
| UMLS | Concept mapping | ★★ | K (licence agreement) — V1.3+ |
| Cochrane Library | Systematic reviews | ★★★ | L (link) |
| WHO ICTRP | International trials | ★★ | L / limited — V1.3+ |

**CS & ML — V1.0:** arXiv (cs/stat), OpenReview (with reviews), DBLP, Hugging
Face Papers (models, datasets, code), Semantic Scholar, GitHub (a code link on
Works), ACL Anthology (V1.2).

**Law (US) — V1.1**

| Service | Adds | Value | Access |
|---|---|---|---|
| **CourtListener API** (Free Law Project) | Case law opinions, dockets, RECAP (PACER) archive, oral-argument audio, judges, citation network | ★★★★★ | K |
| **Caselaw Access Project** (Harvard, public bulk data since 2024) | All published US case law through 2018 | ★★★★ | F (bulk) |
| **eCFR API** | Current regulations (the scripture-corpus shape) | ★★★★ | F |
| **govinfo API** | US Code, Federal Register, CFR editions, bills, reports | ★★★★ | K (api.data.gov) |
| **Congress.gov API** | Bills, actions, members, committee reports | ★★★★ | K |
| **Federal Register API** | Rules, proposed rules, notices | ★★★ | F |
| **Regulations.gov API** | Dockets and public comments | ★★★ | K |
| **Oyez** | Supreme Court audio and summaries | ★★ | L / unofficial |
| **Justia, Casetext, Westlaw, Lexis** | — | ★ | L / I (skip) |

Faces: case, statute / regulation (corpus reader), bill, docket. Grammar:
reporter citations (`410 U.S. 113`), `26 U.S.C. § 501(c)(3)`, `12 C.F.R. 1026.19`,
Public Law numbers, docket numbers. Style: Bluebook-like CSL (limited
community styles — verify coverage).

**Law (EU / UK) — V1.3+:** EUR-Lex (web service + Cellar SPARQL),
legislation.gov.uk (open API), the National Archives' *Find Case Law* (open),
CanLII (API by request), BAILII (link).

**Patents — V1.2**

| Service | Adds | Value | Access |
|---|---|---|---|
| **USPTO Open Data Portal** (incl. PatentsView) | US grants and applications, claims, CPC, assignees, citations | ★★★★★ | K |
| **EPO Open Patent Services** | Worldwide bibliographic data, families (INPADOC), legal status | ★★★★ | K (free weekly quota) |
| **Lens.org** | Patents ↔ scholarly citations | ★★★★ | K / $ |
| **Google Patents Public Datasets** | Global full text via BigQuery | ★★ | $ (per-query) — V1.3+ |
| **WIPO PATENTSCOPE** | PCT applications | ★★ | $ / L |

Face: patent (claims tree, family, status timeline). Grammar: `US 10,123,456 B2`,
`EP1234567`, `WO2020/123456`.

**Data & statistics — V1.2:** FRED / ALFRED (K), World Bank (F), OECD (SDMX, F),
Eurostat (F), IMF (F), US Census (K), BLS (K), BEA (K), UN Comtrade (K / $),
Our World in Data (F, CC-BY), IPUMS (K), Harvard Dataverse, Zenodo, Figshare,
Dryad, DataCite, data.gov (CKAN), Kaggle (K). Google Dataset Search is link-only.
Face: series / dataset with a chart preview. **Add as chart or table block.**

**Archives & humanities — V1.2:** Library of Congress (loc.gov JSON, F),
Chronicling America (F — being folded into loc.gov; verify endpoints),
HathiTrust (bibliographic API; full text for public-domain works), Internet
Archive (F), Europeana (K), DPLA (K), Trove (K, non-commercial), Gallica
(SRU / IIIF, F), Smithsonian Open Access (K, CC0), Met Museum (F, CC0),
Biodiversity Heritage Library (K), Wikisource / Wikidata (F, already used),
Perseus / Scaife (CTS, classics), GDELT (news events, F), JSTOR (L).
Faces: archival item (IIIF image-first), newspaper page (OCR + image).

**V1.3+ packs (backlog):**

- **Physics / Astro / Math:** NASA ADS, INSPIRE-HEP, zbMATH Open, OEIS, arXiv.
- **Economics & social science:** RePEc harvest, OSF preprints, IPUMS, NBER / SSRN
  links, ICPSR (limited).
- **Education:** ERIC.
- **Earth & environment:** NASA Earthdata CMR, NOAA, USGS ScienceBase.

### 5.11 Link-only tools (no public API — offer "Open in …" from a Work)

| Tool | Why link to it | Value |
|---|---|---|
| **Connected Papers**, **ResearchRabbit**, **Litmaps** | Visual citation maps | ★★★ |
| **Inciteful**, **Local Citation Network** (MIT, OpenAlex-based — code to borrow for our graph view) | Citation networks | ★★★ |
| **Elicit**, **Consensus**, **SciSpace**, **Undermind** | AI literature assistants (Consensus has a paid API — verify fit) | ★★ |
| **Google Scholar** (direct) | "Open in Scholar" when no SerpAPI key | ★★★ |
| **Semantic Reader** (Ai2) | Augmented paper reading | ★★ |

---

## 6. What we adopt instead of building

| Need | Adopt | Instead of |
|---|---|---|
| Parse / emit bibliographic formats | citation-js | Hand-written BibTeX / RIS parsers |
| Metadata from arbitrary URLs | Citation meta-tag parsing (`citation_*`, Dublin Core, schema.org JSON-LD, COinS) + DOI sniffing → Crossref; translation-server only if the long tail matters | Per-site scrapers |
| PDF structure and references | Reflowed full text first; Semantic Scholar reference lists; the PDF's own outline (pdf.js); on-demand AI extraction; GROBID only if the gap proves real | Heuristic PDF parsing, or running a new server |
| PDF rendering + text layer | pdf.js (+ EmbedPDF or react-pdf-highlighter) | A custom renderer |
| Reflowed articles | JATS → HTML library, arXiv HTML, Readability | PDF-only reading |
| Legal citation grammar data | reporters-db / courts-db (+ eyecite fixtures) | Hand-curated reporter lists |
| Deep-research loop | Port dzhng/deep-research onto AI SDK v6 | A bespoke agent design |
| Paper Q&A method | PaperQA2's RCS approach | Naive RAG |
| Citation styles | citeproc-js + CSL (licence check) | Hand-written formatters |
| IIIF viewing | OpenSeadragon / Mirador | A custom zoom viewer |

**Built here, because nothing fits:**

- The **federation layer**: merge by identifier, streaming, per-source capability
  matrix. Existing federated-search libraries target e-commerce or site search,
  not scholarly identifier merging.
- The **Work / face model** over our ContentNode tree.
- The **access ladder**.

Record the specific gap in the code when building each.

---

## 7. Owner decisions (2026-10-01)

1. **Packs.** Biomedicine and CS & ML in V1.0. **Law (US) is stubbed in V1.0**: it
   appears in the pack catalog as "coming in V1.1", and legal citations or docket
   URLs pasted into the search box become external link nodes. It ships in full in
   V1.1. Patents, Data & statistics and Archives & humanities come in V1.2.
2. **Copies.** A paper is **stored when its licence allows** (CC-BY, public
   domain, the user's own copy of an arXiv paper). Otherwise it is **fetched on
   demand** through the SSRF-guarded fetch each time it's opened, and never
   persisted. Highlights anchor by text quote, so they survive a re-fetch, and the
   Internet Archive is the fallback if the source vanishes. When it can't be read
   in-app at all, it is an **external link node**, the same as unavailable library
   books. Every exception in §2.4 falls back the same way.
3. **No new servers.** Everything runs in the existing Next.js / Vercel app, plus
   the existing durable run machinery for long AI jobs. GROBID needs Java and
   2–4 GB of memory, so it can't run in a serverless function. The other candidate,
   translation-server, is built to run as a long-lived service. Both are replaced:
   - **References and structure:** reflowed full text (JATS, arXiv HTML) carries
     its own; Semantic Scholar serves reference lists for most papers; pdf.js reads
     a PDF's own outline; and an on-demand AI pass (models that read PDFs natively)
     covers the rest.
   - **Metadata from a URL:** publisher pages carry `citation_*` meta tags (Google
     Scholar requires them), Dublin Core, schema.org JSON-LD or COinS, and most
     expose a DOI that resolves through Crossref. An AI pass is the last resort.

   The cost is in-text citation linking for arbitrary PDFs that Semantic Scholar
   doesn't index, and the long tail of sites without metadata tags. Revisit only
   if users hit those gaps.
4. **Zotero.** Zotero stays the source of truth for library metadata and
   collections. Digital Garden owns what is made here (annotations, notes, claims),
   keyed by the Zotero item key so it survives every re-sync.
   - **V1.0:** API-key connection; incremental one-way sync using Zotero's
     `since=<version>` (polled — Zotero has no webhooks); collections → folders.
     Zotero's PDF annotations are imported read-only (`source: "zotero"`). Files
     stream on demand from Zotero storage, are cached only under §7.2, and are
     re-resolved through Unpaywall when the file lives on WebDAV or a local disk.
   - **"Save to Zotero":** create-only — push a Work found here into a chosen
     Zotero collection. This is the one write worth having; it can't conflict.
   - **What Zotero covers vs. what's ours.** Zotero manages a library: capture
     (browser connector, 600+ translators), metadata, PDF / EPUB / snapshot
     reading with annotations, retraction flags, "Find Available PDF", RSS feeds,
     group libraries, and citing in Word / Google Docs. **Much of that lives in the
     desktop client, not the Web API we can use.** Translators, add-by-identifier,
     PDF finding and retraction checks are client-only. The Web API gives us items,
     collections, tags, notes, annotations, stored files, indexed full text, and
     **formatted citations / bibliographies in any CSL style**.

     Not in Zotero at all, and so ours:
     - discovery and federated search with scopes;
     - enrichment (references, cited-by, related, TLDRs, citation contexts);
     - reflowed JATS reading;
     - text-quote anchors, links into notes, send-to-note;
     - Claims rows (Principle 2);
     - domain-pack faces (statute browsing, IIIF, data charts, patent claims trees),
       although Zotero has item *types* for case, statute, bill, patent and dataset;
     - citation alerts;
     - AI;
     - and, above all, users who don't use Zotero. Zotero is one sync partner, not
       the backend.
   - **Offload to Zotero for its users:** browser capture, citing in Word / Docs,
     and citation formatting through the Web API (which sidesteps the citeproc-js
     licence question for those users). Users without Zotero get citation-js styles.
   - **Not planned:** two-way edit sync (conflicts on metadata, moves and deletes),
     and writing annotations back (Zotero's PDF annotations use page rectangles,
     ours use text quotes).
5. **Contact email for polite pools** (Crossref, Unpaywall, OpenAlex): a
   server-configured project address, never the user's own email.

---

## 7a. Annotations and citations (owner requirement: parity with books and scriptures)

**Requirement.** Papers get everything books and scriptures have. A paper is a
content node, so its marks use the same store (`ReaderAnnotation`, `targetKey:
content:<id>`) and inherit all of this unchanged:

- highlights, underlines, notes and bookmarks;
- the sidebar Notes view;
- send-to-note, with a link back to the passage;
- `[[Paper title#` listing highlights as `annotation:` anchors, with the link
  opening at the passage;
- the AI context bundle;
- Claims rows that keep their source anchor.

**Per-viewer work** is to take an anchor and draw marks:

- **Reflowed** (JATS / arXiv HTML / publisher HTML): section href + offsets +
  text quote, the EPUB approach.
- **PDF:** page index + text quote, re-found on the pdf.js text layer.
- **Fetched on demand:** text quote with prefix / suffix (W3C TextQuoteSelector,
  fuzzy match as Hypothesis does), so marks survive a re-fetch.

**Additions** (open anchor contract, no schema change):

- `section:` and `figure:` anchors from structured full text.
- Identifier link suggestions (`[[10.1038/…`, `[[arXiv:…`) that resolve the Work
  and create its node when the link is inserted.

**Limits:**

- External-link-only Works can't be marked in-app; they are linked and noted.
- Hypothesis and Zotero imports list in Notes, and anchor once their quote is
  found. Zotero's are read-only.
- Scanned PDFs and IIIF images need region locators; that comes with the
  Archives pack (V1.2).

**Citing while writing — V1.2:**

- A **citation inline node** in notes: a wiki-link to a Work, optionally to an
  annotation anchor, rendered "(Smith 2021)".
- A **bibliography block** that collects a note's cited Works and formats them
  (citation-js; Zotero's Web API for Zotero users).
- Export carries the formatting.

The existing Google Drive integration opens Office files in Google's editors.
It has no citation support, so Zotero users keep Zotero's Word / Docs plugins.
Whether Zotero's Docs integration works inside our embedded editor is untested.

## 8. AI: what's feasible with low upkeep

**The rule.** Research adds exactly two things to the existing AI stack:
- **Research tools** (`search_works`, `get_work`, `get_full_text`,
  `references_of` / `cited_by`, `add_work_to_folder`): thin wrappers over the same
  adapters the UI uses.
- **A Work context bundle**, like the book one (`ai-capsule.ts`).

Everything else reuses what exists:
- BYOK connections and `FEATURE_REGISTRY` routes with fallback chains;
- web search (provider-native, else Tavily / Brave);
- native PDF reading (else extracted text);
- the run harness roles, iteration proposals, extraction-to-database, and the
  approval steps;
- the AI drift CI gates, which cover the new tools automatically.

**Everything works without AI**; AI only speeds it up.

| Feature | How | Effort | Phase |
|---|---|---|---|
| Chat with the open paper | Context bundle + full-text tool, or native PDF | S | V1.0 |
| Explain / define a selection | A mark-popover action, sent to chat | S | V1.0 |
| Summaries | Semantic Scholar TLDR first; AI summary on demand (cheap route), cached with model + prompt version | S | V1.0 |
| Plain English → scope + filters | Structured output; falls back to plain search with no AI connection | S–M | V1.0 |
| Highlight → Claims row | Extraction-to-database with a fixed Claims table | M | V1.0–1.1 |
| Screening (include / exclude against criteria) | Iteration proposals, cheap route, user approves | M | V1.1 |
| Ask this folder | Postgres full-text search over chunked full text, then rerank + summarize (PaperQA2's method), no vector DB | M | V1.1 |
| Ask mode (deep research → report note) | Port dzhng/deep-research onto the run harness roles with the research tools + existing web search | L | V1.1 |
| Citation check | Compare a note's claim against the anchored passage | M | V1.2 |

**Not doing, and why:**
- **Our own models** (GPU hosting).
- **Python AI sidecars:** port the methods instead.
- **Embeddings / pgvector now:** re-embedding churn and another model table to
  keep in sync. Full-text search + rerank is enough at personal scale.
- **Provider deep-research APIs as the primary path:** opaque, costly, citations
  are URLs.
- **Agent frameworks.**
- **Fine-tuning.**
- **Consuming MCP servers for research:** quality varies, many are local-only,
  results are untyped, and each is a new prompt-injection surface.

**V1.3+, app-wide:** Digital Garden as an MCP *server*, exposing the library to
outside assistants. It mostly reuses these tools; the real work is OAuth.

**Safety.** Paper and web text are untrusted. Tools that write (adding works,
creating rows) go through the existing proposal and approval steps. Research
tools get a fixture gate with recorded adapter responses, no network — the
pattern of `proposal:shape:check`.

---

## 9. Review against the codebase (2026-10-01)

The plan was checked against the code as it stands. Nothing here changes the
direction. Each finding corrects an assumption or adds V1.0 foundations.

### 9.1 Annotation parity needs text-quote re-anchoring (V1.0)

`BookReader` anchors marks **by CFI only**, and a CFI that no longer resolves is
dropped silently (`addAnnotation(...).catch(() => undefined)`). There is no
text-quote fallback, so Kindle / Readwise imports can't be drawn in the text
today either.

Papers fetched on demand, and Hypothesis / Zotero imports, rely on re-finding a
quote. So V1.0 builds **one shared re-anchoring module**: exact quote +
prefix / suffix, then fuzzy, as Hypothesis does. Every viewer uses it as the
fallback after its native locator (CFI / page) fails. Books gain in-text
display of imported highlights as a side effect.

### 9.2 Reflowed papers render through foliate-js; PDFs get one shared viewer

- **Reflowed papers.** `view.open(book)` in foliate-js accepts any object with
  `sections[]`, `toc` and `metadata`, not only parsed files. Reflowed papers
  (JATS, arXiv HTML, publisher HTML) become a **synthetic foliate book**, one
  section per article section. That inherits, almost for free:
  - the EPUB sanitizer (`extensions/reader/lib/sanitize.ts`) and iframe isolation;
  - themes, CFI marks, in-book search, TOC, speed read and progress.

  This is how annotation parity holds for the reflowed path.
- **PDFs.** The installed `foliate-js@1.0.1` has **no PDF module**, so PDFs get a
  pdf.js viewer (EmbedPDF or react-pdf-highlighter for the highlight layer). It
  is **one viewer for the whole reader**, and it also closes the existing "PDF in
  reader" backlog item for books.

### 9.3 Statutes need a generic hierarchical corpus, not the scripture model

The scripture model is fixed:

- the API is `ScriptureContents` → volumes → books → integer chapters → integer
  verses;
- the tables are `ScriptureBook` / `ScriptureVerse`, installed locally.

CFR and the US Code have arbitrary depth, string unit ids, and remote, versioned
text. The V1.0 Law probe defines a **hierarchical-corpus interface** (tree nodes
with string ids, leaf units with paragraph anchors, a remote loader, an optional
point-in-time date) and a minimal statute viewer. **Law V1.1 is larger than first
estimated because of this.** Scriptures can adopt the interface later; they don't
have to.

### 9.4 Papers and Claims use the existing database model

The app already has the pieces:

- **query-mode tables** (`DataPayload.mode = "query"`), whose rows *are* matching
  ContentNodes with nothing copied — Principle 1 exactly;
- **`contentLink` columns** pointing at ContentNodes.

So:

- **Papers** = a query-mode table. It needs two small extensions: a **folder
  scope** in `ContentQuery` (today it's tags + content types only), and
  **read-only meta columns** sourced from a typed side row (`WorkMeta`; the same
  mechanism gives Books a table from `BookMeta`).
- **Claims** = an inline table with a `contentLink` column to the paper. A claim's
  provenance needs the *passage*, so a `contentLink` cell gains an optional
  **anchor** (`annotation:<id>`), the same contract wiki-links use. That's a JSON
  cell change, not a schema change.

This replaces the earlier "folder view with Papers columns". Folder list views
have no metadata columns.

### 9.5 Shared quotas, keys and schedules

- **Quotas.** The app-level keys (OpenAlex — now key-based with a daily
  allowance — plus Semantic Scholar and CORE) are **shared by every user**.
  V1.0 needs:
  - a shared `WorkCache`;
  - per-user rate limiting at the federation layer;
  - optional **per-user keys** that override the app key.
- **Where keys live.** Use the existing stores; don't add a third:
  - **`ReaderConnection`** (encrypted, keyed by provider; it already holds
    Readwise / Hardcover / Google Books) for Zotero, Hypothesis and per-user
    S2 / CORE / OpenAlex keys;
  - **`SearchConnection`** (Tavily / Brave) for Exa / Serper / SerpAPI, so Ask
    mode's existing per-user search resolver picks them up.
- **Schedules.** Every cron in `vercel.json` is daily. Zotero sync and
  saved-search "new since" therefore run **when opened** (Zotero's
  `since=<version>` makes that cheap), with a daily cron as the backstop. No
  frequent polling.

### 9.6 Fetch on demand must respect function response limits

Proxying a 5–20 MB PDF through a Vercel function can hit the platform's
response-size limit (verify current limits for streamed responses). V1.0 picks
the transport per source:

- **direct client fetch** where the source allows CORS;
- otherwise a **short-lived transient object** in our storage (TTL-deleted,
  never a content node), which keeps the "not persisted as user content" policy.

### 9.7 Licence gates publishing, as it does for books

`BookMeta.license` already gates publishing. `WorkMeta` carries the licence
from Unpaywall / Europe PMC / arXiv, and the publishing and public-file-link
seams must **refuse a stored copy that isn't redistributable**. A
non-redistributable paper stored in the user's private storage is fine; making
it public isn't.

### 9.8 Smaller corrections

- **`[[10.1038/…` create-on-insert.** `LinkAnchorSuggester` returns *existing*
  targets, so creating a Work's node when a link is picked needs a small contract
  extension (an `onPick` resolve step). That's V1.1. Papers already in the
  library link today.
- **Where a book ends and a Work begins.** A *book* found in Research goes
  through the existing Books acquire path (`BookMeta`). `WorkMeta` covers every
  other type. Unifying them is backlog.
- **No migrations for the new annotation kinds.** `ReaderAnnotation.source` is a
  free `VarChar(20)` ("hypothesis", "zotero" fit) and `locator` is JSON (region
  selectors fit).
- **The citation node (V1.2) is a TipTap schema change:** a `Server*` variant,
  collaboration registration, a `TIPTAP_SCHEMA_VERSION` minor bump, and a
  Hocuspocus redeploy after merge.
- **AI chat on the virtual Research tab** needs the virtual-id audit noted in
  `SCRIPTURES-INTEGRATION-PLAN.md` §11.6 before chat is offered there. Chat on a
  paper node is unaffected.
