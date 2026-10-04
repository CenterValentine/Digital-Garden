# Stage-2 Charter Recipe — capture, refine, and tailor from database rows

**Status:** P3 documentation deliverable (EXTRACTION-TO-DATABASE-PLAN §3.3–§3.5).
**Audience:** charter authors (and the AI, which follows the same shapes via the system prompt).

The capture pipeline has two stages sharing one machinery:

- **Stage 1 (acquisition):** a charter run iterates pages (`source: "urls"` / `"list-page"` / `"open-tabs"`), scores each item, and lands admitted items as rows via `captureTo` + `capture.cells` on `record_item_result`.
- **Stage 2 (refinement/investigation):** a later run iterates **the rows themselves** — `source: "database-rows"` — and stamps results back to each row in place. A refinement pass is just an iteration whose items happen to be rows.

## 1. The output database

Prefer binding to a table you already keep (existing-structure principle). When none fits, the AI proposes one (`propose_output_database` — the generation card); your Apply creates it. Either way, the canonical Job Leads shape:

| Column | Type | Why |
|---|---|---|
| Title | text | free vocabulary — never select |
| Company | text | free vocabulary |
| URL | url | **the dedupe column** — url-tier identity |
| Location | text | the web invents these; text |
| Fit % | number | from `fitPercent` (display layer adds the %) |
| Stage | select (owner-curated: Sourced / Screened / Investigated / Materials / Applied) | the multi-pass ratchet — a closed set YOU control |
| Qualified | checkbox | from `qualified` |
| Notes | longText | from `verdict` |
| Materials | file | tailored artifacts, attached in place (§3 below) |

**The charter must CONTAIN everything its rubric references.** A scoring rubric that says "against my profile" needs the profile IN the charter (a `## Profile` block: target role, stack, seniority, location, dealbreakers) — the charter is the commissioning document, and its content rides into every sitting automatically. A rubric pointing at missing context stalls an honest model ("I'd rather not fabricate Fit % values" — first production run, 2026-09-04) and silently corrupts a dishonest one. Rubric grounding is verdict quality, the same way description quality is capture quality.

**Write a description on every column.** Descriptions are the model's mapping context for scraped content ("Fit %" → *"0–100 score from this charter's rubric"*). A description-less column forces a guess, and guesses are where inconsistent capture comes from. The preflight flags blanks; the generation card requires them.

**Select/status only for vocabularies you control; text for vocabularies the web controls.** An option-less select rejects every captured value — the generation card refuses to propose one, and the run preflight warns when it finds one.

## 2. Stage-2 runs (`source: "database-rows"`)

The charter's stage-2 phase proposes with:

- `source: "database-rows"` and `captureTo` naming the same table — it is both the item source and the stamp-back target.
- Optionally `rowIds` (from a `query_database` look) to refine a subset — "rows where Stage is Screened", in that order. Omitted = the whole table in grid order, capped by `itemCap`.
- Item keys are **row ids** (`keyTier: "row"` — the strongest identity). `capture.cells` **update that row in place**: no new rows are ever created by a rows pass; a vanished row rejects and the run moves on.

Typical stage-2 cells: advance `Stage` (Screened → Investigated), refresh `Fit %`, append findings to `Notes`, attach `Materials`.

## 3. Materials lifecycle — one artifact per lead, updated in place

Long-form materials (tailored resume, cover letter) never go in cells; cells hold **pointers**:

1. First tailoring: `create_docx` produces the artifact; the lead row's **Materials (file) cell** references that node.
2. Re-tailoring: `create_docx` with **`overwriteContentId`** — same node id, new bytes. Every File cell and shortcut referencing it sees the new version. Never a trail of copies.
3. Prose research that outgrows `Notes` lives under the **promoted row page** (row → page), not in a second table column.

## 4. Shortcut directives in charter prose

Charters maintain a **single source** — never copied per run, per company, or per lead. Outputs keep **one canonical home; shortcuts mirror**. Charter prose can direct both, and the tools already honor it:

> *"File the tailored resume under the lead's row; shortcut it into `job-search/{Company}`."*

- `create_docx` respects the active charter's output routing (`outputLocation`) and takes `alsoShortcutTo` for the mirror in the same call.
- `create_shortcut` covers after-the-fact placement (no approval gate; find-or-create; chains collapse).

Combined with `overwriteContentId`, the whole materials lifecycle is single-source: one artifact node, mirrored wherever useful, updated in place.

## 5. URL field guide — which links can actually be read

Learned the expensive way (first production sittings, 2026-09: five of nine URLs were unreadable). What each URL shape does under the default headless tier — see `ACQUISITION-QUICK-REFERENCE.md` for the escalation ladder that changes some of these:

| URL shape | Headless outcome | Guidance |
|---|---|---|
| `job-boards.greenhouse.io/<company>/jobs/<id>`, Lever/Ashby postings, company career pages | ✅ Reads fully | The canonical posting form — prefer these |
| `linkedin.com/jobs/view/<id>` | ⚠ Partial — sidebar/summary only, often enough for an honest score | Fine for scan passes; use browser escalation for full text |
| `indeed.com/…?vjk=<id>` | ❌ HTTP 403 (bot wall) | Needs the visible-tab tier, or find the employer's own posting |
| Any search-results page (Indeed SERP, LinkedIn search) | ❌ Not a posting — nothing scoreable | Never feed a SERP as an item; extract the posting links first |
| `my.greenhouse.io/applications/<id>` | ❌ HTTP 406 — your logged-in candidate PORTAL, structurally never a posting | No tier can turn this into a job description; find the public posting |

Two rules of thumb: **a URL that shows YOUR data (portals, dashboards) is never an item**, and **a URL that lists many things is a source to extract from, not an item to score**. Unreadable items are recorded honestly (`unreadable` status with the HTTP reason) — never scored from guesswork.

## 6. Quests tie the stages together

With the charter attached, both stages run inside the same **quest**: one quest ledger remembers every item any sitting scored (rejects included — the cross-sitting dedup), one quest log holds the narrative, and the charter's master ledger links quest ledger + output table + quest log on the quest's row. A stage-2 run continues the quest by name; already-scored items skip automatically unless you ask for a refresh.

Sculpting: a scoring charter can declare its criteria as extra ledger columns (`questColumns` at proposal; values via `questCells` per item), and a mid-run discovery can add **one column at a time** (`add_quest_ledger_column` — quest ledgers only, logged in the quest log).
