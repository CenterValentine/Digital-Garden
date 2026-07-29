---
title: Developer Presence & AI Competency Showcase Plan
status: IN PROGRESS — S1 executed 2026-07-29
created: 2026-07-29
last_updated: 2026-07-29
owner: davidvalentine
audience: recruiters, hiring managers, engineering peers
---

> **Execution log**
> - **2026-07-29 — S1 SHIPPED** (branch `feat/tone-system-and-extension-tts`): README overhauled
>   (AI-first, competency table, 2 Mermaid diagrams, 14 figure slots); **figure signal system**
>   built (`docs/media/figures/` + FIGURES.md audit registry + `pnpm showcase:figures` sync
>   script — drop `fig-<id>.<ext>` in the folder, run the script, media embeds; no broken
>   placeholders ever); `/demo` page live-ready (placeholder + custom-demo CTA → /contact);
>   GitHub description/homepage/topics updated; maintenance guide
>   (`guides/showcase/SHOWCASE-MAINTENANCE.md`) + `/update-showcase` Claude skill added.
>   Gates: typecheck ✅ lint ✅. Owner decisions applied: Tier-3 demo **deferred**, video demo
>   page **placeholder-first**. Still open: license choice.
> - **2026-07-29 — S2 SHIPPED** (same branch): `docs/FEATURES.md` (full inventory, ✅/🚧/🔭
>   labels, ContentNode ERD + workflow diagrams inline — landed there instead of a separate
>   docs/architecture/ to keep it one hop from the README); `docs/DEPLOYMENT.md` (real env
>   reference from code scan of origin/main, migration-baseline caveat, Hocuspocus redeploy
>   rules, post-deploy verification); **`.env.example` created** (README's `cp .env.example`
>   instruction had been broken since April — file never existed; whitelisted in .gitignore);
>   `MCP-PLAN.md` design of record (server: tools/resources/playbooks-as-prompts over Streamable
>   HTTP via mcp-handler, PAT→OAuth 2.1 auth ladder, M1 read-only slice; client: AI SDK MCP
>   client with namespacing + injection defenses); README wired to all three + figure slots
>   added to FEATURES.md (sync run ✅).
> - **Next:** S3 — owner captures the 14 figures + records video (deferred until after release).
>   S4 — showcase seed vault + MCP M1.

# Developer Presence & AI Competency Showcase Plan

**Objective:** Make the Digital Garden repo and its public surfaces legible to employer recruiters in under 90 seconds, with AI Automation Engineer core competencies identifiable at a glance — while staying strictly honest about what is shipped vs. planned.

**Framing constraint:** Recruiters skim; engineers doing due diligence dig. Every artifact below serves the skimmer first (headline, diagram, GIF) and rewards the digger second (code entry points, plan docs, PR history).

---

## 1. Current-State Audit (2026-07-29)

| Surface | State | Problem |
|---|---|---|
| README.md | Stale (Apr 26) | **Zero AI mentions.** Predates AI v3.x, workflows/Trellis, browser reach, playbooks, TTS/STT, publishing, Folder Studio. Stale paths (`stores/` vs `state/`), wrong dev port (3000 vs 3015), unclosed code fence in Hocuspocus section, `[Your License Here]` placeholder |
| GitHub repo meta | Public ✅ | No topics, generic description, no social preview image, no LICENSE file |
| Architecture diagrams | None in repo | 90+ docs exist but no visual system map anywhere |
| Screenshots/video | None | No visual evidence of the product at all |
| Live demo | Partial | davidvalentine.org runs the publishing system (public); the IDE itself is auth-gated with no demo path |
| Feature inventory | Scattered | Capabilities live across CLAUDE.md, STATUS.md, 7 plan docs, and 136 PRs — no single consumable list |
| Deployment docs | Stale | README deploy section predates the 3-service topology (Vercel + Cloud Run Hocuspocus + n8n on home server) |
| MCP | **Not present** | A gap for the "AI competency" story — addressed via Workstream G (plan-first, implement later) |

**What already exists but is invisible:** ~25 modules in `lib/domain/ai/` (multi-model routing with fallback chains, tool registry, playbooks, run-ledger, resumable streams, TTS/STT/image, acquisition), the Trellis workflow subsystem with n8n spoke, the browser extension acquisition ladder, Y.js/Hocuspocus collaboration with CI schema gates, and the publishing system that renders davidvalentine.org.

---

## 2. Competency Map — feature → AI Automation Engineer skill → proof

This table is the skeleton for the README's AI section and FEATURES.md. Every row must link to a real code entry point (recruiters' engineers WILL click).

| Competency | Shipped evidence | Entry point |
|---|---|---|
| LLM orchestration & tool calling | 13+ registered AI tools, client-safe metadata / server-only registry split | `lib/domain/ai/tools/` |
| Multi-model routing & fallback | `FEATURE_REGISTRY`, `resolveFeatureRoute()`, `executeWithFallback()`, registry-authoritative model catalog (PR #133) | `lib/domain/ai/features/` |
| Agent skills / progressive disclosure | Playbooks: marked notes/folders injected progressively, `search_playbooks` tool | `lib/domain/ai/` playbooks modules |
| Durable/agentic workflows | Trellis hub tables + WDK + triggers + React Flow canvas; n8n spoke w/ webhook callbacks | `extensions/workflows/` |
| Resource governance | Run-ledger, tool-output compaction, dangling-tool repair; budgets planned (v3.7) | `lib/domain/ai/run-ledger.ts`, `compact-tool-outputs.ts` |
| Resilient streaming | Resumable AI streams over Upstash (PR #130); SSE chat | `app/api/ai/chat/` |
| Multimodal pipelines | TTS generate+store, STT transcription, AI image gen, media injection into notes | `lib/domain/ai/speech/`, `transcribe/`, `image/` |
| Agentic browser reach | Extension as acquisition provider (sw-fetch / session-tab ladder), overlay projection, capture-policy safety gates | `extensions/browser-bookmarks/` + extension repo dirs |
| Grounded generation (RAG-adjacent) | Folder Studio grounded chat + Context docs + auto-context | `extensions/studio/` |
| BYOK & provider abstraction | Anthropic/OpenAI provider factories, encrypted key storage | `lib/domain/ai/providers/` |
| MCP (interoperability) | **PLANNED** — design doc first (Workstream G), implementation follows | `docs/.../MCP-PLAN.md` (to create) |
| Eng rigor around AI surfaces | CI gates: collab schema check, publishing schema check, drift audits, lint ratchet | `.github/workflows/`, `scripts/` |

**Honesty rule (non-negotiable):** every planned-but-unshipped item is labeled `🔭 Planned` with a link to its design doc. Nothing planned appears in a "Features" list without the label. Recruiters' technical screeners check; an inflated README costs more credibility than a gap.

---

## 3. Workstreams

### A. README overhaul (highest leverage, do first)
- New structure: hero paragraph → 1 screenshot/GIF → **"AI & Agentic Systems" section near the top** (competency table from §2, condensed) → architecture diagram (Mermaid, renders natively on GitHub) → feature tour → quickstart → deployment → docs index → license.
- Lead positioning: "AI-native knowledge IDE" — not "Obsidian-inspired notes app." The Obsidian comparison buries the differentiator.
- Fix all stale content: paths, port 3015, broken code fence, heap-size note, `pnpm dev:collab` requirement.
- Badges: CI status (quality.yml), Next.js 16 / React 19 / TypeScript strict, license.
- Cross-link: davidvalentine.org (live publishing output), AGENTS.md/CLAUDE.md (signals mature AI-assisted dev practice — itself a competency).

### B. Architecture diagrams (Mermaid, in-repo)
All as Mermaid in markdown so GitHub renders them without image maintenance:
1. **System topology** — Vercel app ⇄ Postgres (Neon prod / Docker dev) ⇄ Hocuspocus (Cloud Run) ⇄ storage providers ⇄ n8n (home server, Cloudflare Tunnel) ⇄ browser extension.
2. **AI request lifecycle** — chat request → feature route resolution → model fallback chain → tool loop (registry) → run-ledger → resumable stream → persistence.
3. **ContentNode v2.0 data model** — the polymorphic payload ERD.
4. **Workflow subsystem** — trigger → hub → n8n spoke → callback.
Diagram 2 is the recruiter-facing money shot; put it in the README, others in `docs/architecture/`.

### C. Visual walkthrough
- 6–8 screenshots (light+dark where it matters): three-panel IDE, AI chat with tool call visible, workflow canvas (React Flow), playbook in action, publishing composer, published page on davidvalentine.org, browser extension panel.
- 2–3 short GIFs (≤10s each): slash command insert, AI chat placing output into a note, read-aloud TTS player.
- One 2–3 min narrated video (Loom/YouTube unlisted): the jobhunt playbook flow end-to-end. Recruiters won't clone the repo; video is the only "demo" most will consume.
- Store stills in `docs/media/` (or `.github/assets/`); video linked, not committed.

### D. Use-case narrative
- **Flagship: the jobhunt playbook** — "I built an agentic system and use it to run my own job search": playbook doc marked in the garden → progressive-disclosure injection → chat agent executes with tools → outputs filed as references under the chat → workflow triggers for follow-ups. This is self-demonstrating and memorable.
- Secondary narratives: (1) capture-to-knowledge pipeline (browser extension acquisition → note → AI enrichment → published page); (2) spaced-repetition learning loop (notes → AI-proposed flashcards → FSRS scheduling).
- Format: `docs/USE-CASES.md` + condensed version in README + long-form case study post on davidvalentine.org (dogfoods the publishing system — the medium is itself evidence).

### E. Working demonstration
Three tiers, cheapest-credible first:
1. **Tier 1 (ship now):** davidvalentine.org IS a working demo of the publishing pipeline — label it as such ("this site is rendered by this repo's publishing system").
2. **Tier 2:** the narrated video (Workstream C) as the demo of auth-gated surfaces.
3. **Tier 3 (decision needed):** live demo account — seeded read-mostly "demo vault" user, server-side rate-limited AI on owner's key or disabled-with-explainer. Real cost/abuse surface (BYOK, storage). **Recommend deferring Tier 3** until 1–2 land; a good video captures 90% of the value at 5% of the risk.
- Enhance `pnpm db:seed` into a showcase vault (notes exercising every block type, a playbook, a workflow) — doubles as reviewer-quickstart and Tier 3 foundation.

### F. Feature inventory + deployment instructions
- `docs/FEATURES.md`: full inventory grouped by domain (AI, editor, collaboration, publishing, extensions, infra), each with status (✅ shipped / 🔭 planned), competency tags, and code entry point. The §2 table is the AI section; non-AI sections follow the same grammar.
- Deployment guide rewrite (`docs/DEPLOYMENT.md`, README links to it): honest 3-service topology — Vercel (app), Cloud Run (Hocuspocus, `cloudbuild.hocuspocus.yaml`), n8n (any host), Postgres, storage providers; env var reference; migration baseline caveat (`migrate resolve --applied 00000000000000_baseline` for existing DBs); local dev incl. Docker Postgres + `pnpm dev:collab` + `NODE_OPTIONS` heap note. Deploying a multi-service system is itself an automation-engineer competency — document it as one.

### G. MCP strategy (fills the competency gap — owner-directed)
Plan-first so the competency is present and credible before code lands:
1. **`docs/notes-feature/work-tracking/MCP-PLAN.md`** — spec-accurate design doc:
   - **MCP server** exposing the garden: tools (`search_notes`, `read_note`, `create_note`, `list_tree`, `run_workflow`), resources (notes as `garden://` URIs), auth via existing session/token infra. Lets Claude Desktop/Code/other agents operate on the user's garden.
   - **MCP client** in the chat engine: consume external MCP servers as dynamic tools alongside the native registry (AI SDK v6 has MCP client support — natural fit with the existing tool registry).
   - Sequencing, security model (capability scoping per token), and how it composes with playbooks + workflows.
2. README/FEATURES.md list it as `🔭 Planned — [design doc]`. A rigorous, spec-accurate design doc demonstrates the competency honestly; shipping even the read-only server later upgrades the label.
3. Suggested first slice: read-only MCP server (search + read) — small, safe, and immediately demoable from Claude Desktop.

### H. Repo & profile hygiene (cheap, do with Workstream A)
- **LICENSE** — currently none + placeholder text. ⚠ Owner decision: MIT (max approachability) vs. source-available (e.g., PolyForm Noncommercial) if protecting the product is a concern. Recruiter-optimal is MIT; do not leave the placeholder.
- GitHub topics: `nextjs`, `typescript`, `ai`, `agents`, `ai-sdk`, `tiptap`, `yjs`, `knowledge-management`, `mcp` (once planned doc exists), etc.
- Repo description: rewrite to lead with AI ("AI-native knowledge IDE — agentic chat, durable workflows, real-time collab. Next.js 16 / TypeScript").
- Social preview image (the README hero shot).
- Pin the repo on the GitHub profile; align profile README if one exists.
- Optional: `CHANGELOG.md` distilled from the 136-PR history — the shipping cadence itself is a strong signal.

---

## 4. Sequencing

| Sprint | Scope | Effort |
|---|---|---|
| **S1 — Legibility** | Workstream A (README) + H (hygiene, minus LICENSE decision) + B diagrams 1–2 | 1 session |
| **S2 — Inventory & MCP** | F (FEATURES.md + DEPLOYMENT.md) + G1 (MCP-PLAN.md) + B diagrams 3–4 | 1 session |
| **S3 — Show, don't tell** | C (screenshots, GIFs, video) + D (use-case narrative + site case study) | 1–2 sessions (video needs owner) |
| **S4 — Demo depth** | E (seed vault; Tier 3 decision) + G3 (read-only MCP server slice) | 1–2 sessions |

S1 alone converts the repo from "invisible AI" to "legible AI." Ship it first; everything else compounds on it.

## 5. Owner decisions needed (non-blocking for S1 except license)

1. **License** — MIT vs. source-available vs. all-rights-reserved-but-viewable. (Blocks the LICENSE file only; README can ship with "License: TBD" removed and section omitted.)
2. **Tier 3 live demo** — go/no-go on a seeded demo account (recommend: defer).
3. **Video** — owner narration vs. captioned screen-capture only.
4. **Repo rename?** — `Digital-Garden` is fine; only revisit if positioning shifts.

## 6. Success criteria

- A recruiter can answer "what is this and why is this person an AI automation engineer?" from the README above the fold, in <90s.
- A technical screener clicking any competency row lands on real, current code within one click.
- Zero claims in public docs that the codebase cannot substantiate (planned items labeled).
- README/diagram content survives `main` drift — paths and commands verified against the tree at time of writing.
