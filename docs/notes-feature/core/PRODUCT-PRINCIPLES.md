---
last_updated: 2026-10-20
audience: contributors and AI assistants
---

# Product Principles

Why features here are shaped the way they are. Architecture docs say *how* the
system is built; this says *what it is for*, so a design decision can be judged
before it is implemented.

Principles are added when a shipped feature clarifies one — each carries the
feature that made it legible.

---

## 1. Make the user's existing structure the path of least resistance

**Digital Garden's job is to lower the cost of acting inside the notes system
the user already has** — not to offer a faster surface beside it.

The failure this guards against: a user has a thought, and the quickest way to
capture or act on it is *outside* their organization — a scratch note, a
free-floating list, a custom container that duplicates a folder they already
maintain. Each of those is a small win now and a debt to the notes system
later. Structure erodes one convenient shortcut at a time.

So when a feature could either (a) let the user build a new parallel structure
or (b) make their existing files and folders directly actionable, prefer (b) —
even when (a) is more flexible. Flexibility that competes with the user's own
organization is a cost, not a feature.

**Worked example — Workbenches** (PR #177). A workspace with a view can turn
the folders under its view root into workspaces of their own: each folder
becomes a place to actually work, with its own tabs and layout, reachable in
one hover. Deliberately, **users cannot create custom workbenches** — folders
are the only vocabulary. That constraint is the point: it makes it hard *not*
to use the existing file/folder structure, and it gives instant access to
recurring work whose shape already matches a folder. Hiding and reordering
exist so the projection can be tuned, never so it can be invented.

**Design tests.** Before adding a way to organize something, ask:

- Does this duplicate a structure the user already maintains elsewhere? If so,
  can the feature *project* that structure instead of asking for it again?
- Does the fast path lead into the notes system, or around it? The convenient
  route and the structurally sound route should be the same route.
- Is the new vocabulary earned? A new kind of container needs to express
  something folders, tags, and content types genuinely cannot.
- When work recurs, does the feature get the user back to it in one action —
  or does it ask them to reconstruct the context each time?

Related: the extension gating ladder in `CLAUDE.md` ("Before Adding an
Extension Module") applies the same instinct one layer down — compose from what
exists before introducing a new layer.

---

## 2. Unrefined → structured is the core loop, not an edge case

**Digital Garden exists to take unrefined thinking and work it into structure
without leaving the place where the thinking happened.** Notes are where ideas
are cheap to capture; databases are where they become queryable, linkable, and
reusable. The product's job is the path between them — in both directions, and
at every scale from one sentence to one monumental ledger.

The failure this guards against: a note that has been quietly accumulating
repeated units — meetings, sources, experiences, leads — reaches the point
where prose can no longer hold it, and the only ways forward are a hand
re-type into a grid or a copy out to another tool. Either way the structure is
built *beside* the note instead of *from* it, and the note's provenance is
lost at the exact moment it was most valuable.

**Worked example — the career evidence ledger** (2026-09-12). A 28-section
note (one accordion per experience, ~28k characters) needed to become a
four-table linked library: Experiences, with Claims and metrics and Sources
fanning out from each, tied together by an index. Every existing route was
either manual or blocked: the @mention capsule injects only a note's first
2,000 characters; the per-item iteration machinery enumerates web pages and
database rows but not the sections of a document; CSV import is a reserved
shape with no implementation. The operation itself, though, is not unique to
that ledger — it is the same shape every time.

**The shape that repeats.** A container note with repeated sub-units
(accordions, headings, bullets, dated entries, table rows); each unit → one
row in a primary table; sub-facts inside the unit fan out to one or two
satellite tables; and controlled vocabularies (select/multiSelect options)
that grow *during* capture. Most instances stay small; a few — the ones that
matter most to the user — grow until only a database can hold them.

| Use case | Unit in the note | Primary table | Satellites | Vocabulary that grows |
|---|---|---|---|---|
| Meeting / 1:1 notes | one meeting | Meetings | Action items, Decisions, People | owners, projects |
| Reading notes | one book / article | Books | Highlights, Quotes, Concepts | topics, authors |
| Research / literature notes | one paper | Papers | Findings (claims), Sources | methods, fields |
| Job hunt log | one posting | Job Leads | Contacts, Interviews | stage, company |
| Career evidence / STAR stories | one experience | Experiences | Claims and metrics, Sources | tools, skills |
| Daily / periodic notes | one dated line | Expenses / Habits / Mood | — | categories |
| Bug or incident log | one incident | Issues | Root causes, Fixes | severity, component |
| Project retros | one project | Projects | Lessons, Risks | tags |
| Customer feedback notes | one piece of feedback | Feedback | Themes, Customers | theme vocabulary |
| Recipes | one recipe | Recipes | Ingredients | cuisine, diet |
| Trip planning | one place | Places | Bookings, Costs | city, type |
| Collections / inventory | one item | Items | Purchases, Condition | category |
| Course notes → study | one concept | Concepts | Flashcards, Examples | topic |
| Decision journal | one decision | Decisions | Options, Outcomes | domain |
| Platform migration (Evernote, Notion) | a page's table or list | any | — | — |
| This repo's own tracking docs | one backlog item | Backlog | Sprints, PRs | epoch, status |

**The evidence-based record** deserves its own name because it recurs across
so many rows of that table: *entity → assertions about it → provenance for
each assertion*. Experiences / Claims / Sources, paper / findings / citations,
matter / facts / exhibits, decision / assumptions / data. A "claims + sources"
satellite pair is close to a reusable template, and any tooling built for one
instance should be built for the shape.

**Gaps are data.** When a note is worked into structure, the *absence* of a
claim or a source for an entity is itself information — it says what the
user still needs to find, verify, or recall. Capture should therefore create
every relationship the schema calls for, even as a placeholder that names the
gap, rather than leaving the link empty and indistinguishable from "not yet
processed". A column description that says an empty value may be deliberate
is model-facing capture context, and an AI filling the table must never
invent what the note does not support.

**Design tests.** When a feature touches the note ↔ database boundary, ask:

- Can the structure be built *from* the note's own units (its blocks, with
  their stable ids) so provenance survives, rather than from a re-type?
- Does the AI read the whole note, or only what a context cap happens to
  admit — and does it *know* when it is only seeing a fraction?
- Are vocabulary collisions handled once, up front (propose the option set,
  then load), instead of one approval per item?
- Does the result live under the user's existing structure (rows pointing at
  notes, prose under row pages) or beside it as a second copy?
- Is a missing link represented as a deliberate gap the user can see, or as
  silence?

Related: `docs/notes-feature/work-tracking/EXTRACTION-TO-DATABASE-PLAN.md`
(the web → rows instance of the same loop) and the flashcards extension (the
note → cards instance, with a fixed schema) — both are special cases of this
principle, and tooling that serves the general case should eventually serve
them too.

---

## 3. AI context is the user's money — make it legible

**When the user brings their own key, every token the AI reads is billed to
them. They should be able to see what the model is carrying, what it cost,
and why, and they should be able to change it.** We call this practice *AI
context analytics*: attribute every token, measure it, show it where the
decision is made, and hand the user the controls.

The failure this guards against: spend that happens out of sight. On the Job
Hunt chat a one-word "Hello" after a finished run read 47,134 input tokens,
and nothing on screen said why. Measured across the context-economics work,
input is 90–98% of what a chat costs, and on one 21.9M-token run the model's
own words were 2% of it. A user cannot manage a cost they cannot see. On a
subscription product that waste is the vendor's margin; with BYOK it is a
line on the user's own invoice, and an unexplained one reads as being
overcharged. Users also choose the provider and model themselves, and they
need real numbers to make that choice well.

**Worked example — the context window editor** (PR #309). A chat's **Model**
tab shows the next request by bucket (system prompt, tool definitions,
attachments, history), each turn's billed read beside what it still carries,
every automatic fold as a chip that says why, and controls to remove a part,
drop an exchange, or draw "the model reads from here". Building it made a
cost visible that a history-only view would have hidden: on a full chat the
fixed overhead (a ~7.7k-token prompt plus ~11k tokens of tool schemas) was
larger than the conversation it carried (~13k). The prompt and tool sizes are
measured on the server per request, not estimated.

**What already exists.** New work extends this stack rather than starting a
parallel one:

| Level | What the user sees | Where |
|---|---|---|
| Before spending | "Ask before reads over N tokens" approval for bulk database reads | `ChatControlPanel` |
| Per part | Fold chips with a reason; remove / restore marks | `context-diet.ts`, `ChatMessage` (#250, #309) |
| Per request | The context ledger: buckets, measured prompt + tool sizes | `ContextLedger`, `TurnSegment` (#309) |
| Per step | The avatar meter's step chain: tokens each step read | `turn-diagnostics.ts` (#253) |
| Per turn | Tokens in/out, duration, estimated cost; an unpriced model says so, never $0 | `COST-METERING-PLAN.md` |
| Per session | Cumulative tokens and cost beside each turn's numbers | `sessionUsage` |
| Per connection | Requests, cost, by-model table, with a pill naming the data source | `ConnectionUsageCard` |

**Design tests.** When a feature changes what the AI reads, or how much,
ask:

- **Attributed?** Can the user tell which bucket a cost belongs to, and
  which turn or step paid it?
- **Measured, or labelled as a guess?** Measure on the server where we can.
  An estimate says it is one. An unknown price never displays as $0, and a
  usage figure names its source.
- **Does every automatic reduction have a face?** If the harness folds,
  strips or dedupes something, a chip says so, drawn from the same verdict
  map the model-facing transform uses. Silent savings are as opaque as
  silent spend.
- **Visibility for control, never enforcement.** Show the cost and offer the
  lever: remove, detach, switch the tool off, choose a cheaper model.
  Suggestions may offer, but nothing marks, caps or prunes on the user's
  behalf. Caps and automatic elision were both tried and rejected because
  they fail without warning. The user decides.
- **Does it ship with its analytics?** A new tool, prompt section or
  attachment type says where its cost will show up: a ledger bucket, a
  meter, a chip. This sits beside the rule that a tool with a large
  output/input ratio needs a compaction story before it ships.
- **Shown where the decision is made?** Numbers belong at the point of
  action (the bubble, the approval card, the composer), not only on a
  settings page.

The direction this sets, and the next concrete gaps, are tracked under "AI
context analytics" in `docs/notes-feature/work-tracking/BACKLOG.md`.

Related: `docs/notes-feature/guides/ai/AGENTIC-RESOURCE-DISCIPLINE.md`
principle 8 ("observability is a control, not a report") is the agent-facing
form of the same idea, and §1b covers the transforms whose effects this
principle makes visible. The two decisions that keep this consent-first:
token-cap enforcement was rejected on 2026-09-04
(`EXTRACTION-TO-DATABASE-PLAN.md` §9.2: a mid-run cap wastes everything in
flight), and automatic read elision on 2026-08-08 (`CONTEXT-WINDOW-EDITOR-PLAN.md`
§2: fuzzy folding silently flipped verdicts).
