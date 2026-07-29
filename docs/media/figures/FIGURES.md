# Showcase Figure Registry & Audit

This file is the **single source of truth and audit log** for every visual figure used in the
public showcase surfaces (README.md and docs). It serves two jobs:

1. **Audit** — the table below is auto-maintained by `pnpm showcase:figures` and always reflects
   what media actually exists on disk and where each figure appears.
2. **Capture briefs** — each figure section describes exactly what the media should demonstrate,
   so anyone (including future-you) can produce the asset without re-deriving intent.

## How to add media (the signal system)

Drop a file in **this folder** named after the figure id — that's the whole workflow:

```
docs/media/figures/fig-2-1.png     ← satisfies Fig 2-1
docs/media/figures/fig-1-2.gif     ← satisfies Fig 1-2
docs/media/figures/fig-2-5.mp4     ← satisfies Fig 2-5 (rendered as a ▶ link)
```

Then run `pnpm showcase:figures`. The script:

- Embeds the media everywhere the figure's marker appears (README, docs) and removes the
  "media pending" caption. **No empty placeholder ever renders once the file exists.**
- Updates the Status column in the audit table and the Status line in the figure's section.
- Warns about orphan files (media with no registry entry) and unplaced figures.

**Supported formats:** `.png .jpg .jpeg .webp .svg .gif` embed inline; `.mp4 .webm .mov` render
as a "▶ watch video" link (GitHub does not play committed videos inline in READMEs). If both an
image and a video exist for one id, the image embeds inline and the video is linked beneath it.

**Numbering:** `Fig <section>-<n>` — section groups follow the README's narrative
(1 = overview, 2 = AI & agentic, 3 = editor & collaboration, 4 = publishing, 5 = browser extension).
New figures take the next free `n` in their section; never renumber existing figures.

---

## Audit table (auto-generated — do not edit by hand)

<!-- figures-audit:start -->
| Fig | Title | Status | Media file | Appears in |
|---|---|---|---|---|
| 1-1 | Three-panel Content IDE (hero) | ⬜ | — | README.md |
| 1-2 | Sixty-second tour | ⬜ | — | README.md |
| 2-1 | AI chat executing tools | ⬜ | — | README.md, docs/FEATURES.md |
| 2-2 | Playbook run (progressive disclosure) | ⬜ | — | README.md |
| 2-3 | Workflow canvas + run history | ⬜ | — | README.md, docs/FEATURES.md |
| 2-4 | Folder Studio grounded chat | ⬜ | — | README.md |
| 2-5 | Resumable stream surviving a reload | ⬜ | — | README.md |
| 2-6 | Read-aloud TTS player | ⬜ | — | README.md |
| 2-7 | Model routing & BYOK connections | ⬜ | — | README.md |
| 3-1 | Block library breadth | ⬜ | — | README.md, docs/FEATURES.md |
| 3-2 | Live collaboration | ⬜ | — | README.md |
| 4-1 | Publishing composer → live page | ⬜ | — | README.md, docs/FEATURES.md |
| 4-2 | davidvalentine.org, rendered by this repo | ⬜ | — | README.md |
| 5-1 | Browser extension side panel & acquisition | ⬜ | — | README.md, docs/FEATURES.md |
<!-- figures-audit:end -->

---

## Fig 1-1 — Three-panel Content IDE (hero)
- **Status:** ⬜ awaiting media
- **Wanted:** PNG (or subtle GIF), ≥1600 px wide, dark theme
- **Demonstrates:** The flagship first impression: file tree (left), a rich note with headings,
  callout, and a mermaid or excalidraw block (center), backlinks/outline (right sidebar). Should
  read instantly as "a serious knowledge IDE," not a toy notes app.
- **Capture notes:** Use a well-groomed demo note (no personal content). Dark theme, both sidebars
  open, editor focused. Hide any dev banners.

## Fig 1-2 — Sixty-second tour
- **Status:** ⬜ awaiting media
- **Wanted:** GIF, ≤10 s, ~1200 px wide
- **Demonstrates:** Fluency of the editing loop: open a note from the tree → `/` slash command
  inserts a block → type `[[` and autocomplete a wiki-link → auto-save indicator flips
  yellow → green.
- **Capture notes:** Keep it fast; trim dead frames. One continuous take.

## Fig 2-1 — AI chat executing tools
- **Status:** ⬜ awaiting media
- **Wanted:** PNG, chat panel prominent
- **Demonstrates:** The agentic core: a chat turn where the assistant invokes visible tool calls
  (tool chips / run status) and places output into a note as a nested reference. This is the
  single most important AI figure — it shows orchestration, not just chat.
- **Capture notes:** Pick a prompt that triggers 2+ tools (e.g., search + create note). Make sure
  the tool-call UI state is visible, not collapsed.

## Fig 2-2 — Playbook run (progressive disclosure)
- **Status:** ⬜ awaiting media
- **Wanted:** PNG or GIF
- **Demonstrates:** A marked playbook note driving an agentic session: the playbook being
  discovered (`search_playbooks`), its checklist/steps injected progressively, and the agent
  working through them. The jobhunt playbook is the canonical subject.
- **Capture notes:** Scrub any real employer/contact names from the playbook content first.

## Fig 2-3 — Workflow canvas + run history
- **Status:** ⬜ awaiting media
- **Wanted:** PNG, workflow canvas front and center
- **Demonstrates:** Durable automation: the React Flow workflow canvas with a multi-node workflow,
  plus a visible run history entry showing an n8n-spoke execution round-trip (trigger → n8n →
  callback).
- **Capture notes:** A workflow with 4–6 nodes reads best. Include the Run button and a
  completed-run indicator.

## Fig 2-4 — Folder Studio grounded chat
- **Status:** ⬜ awaiting media
- **Wanted:** PNG
- **Demonstrates:** RAG-adjacent grounding: a folder's Studio view with Context docs attached and
  a chat answer that cites/uses folder content. Shows retrieval scoping, not just generation.
- **Capture notes:** Use a folder with 5+ notes so the grounding is plausible.

## Fig 2-5 — Resumable stream surviving a reload
- **Status:** ⬜ awaiting media
- **Wanted:** GIF or short MP4, ≤15 s
- **Demonstrates:** Infrastructure maturity: a long AI response streaming, the page reloaded
  mid-generation, and the stream resuming instead of dying. This one needs motion — a still can't
  prove it.
- **Capture notes:** Pick a prompt yielding a long response so the reload lands mid-stream.

## Fig 2-6 — Read-aloud TTS player
- **Status:** ⬜ awaiting media
- **Wanted:** PNG (GIF optional)
- **Demonstrates:** Multimodal pipeline: the read-aloud player active on a note (TTS generated and
  cached), showing play/pause/skip controls in context.
- **Capture notes:** Player visible with progress mid-way so it reads as "playing," not idle.

## Fig 2-7 — Model routing & BYOK connections
- **Status:** ⬜ awaiting media
- **Wanted:** PNG
- **Demonstrates:** Provider abstraction: the AI connections/settings surface with multiple
  providers configured (key states visible as configured — never the keys), and per-feature model
  routing populated from the registry.
- **Capture notes:** ⚠ Double-check no key material or account emails are visible.

## Fig 3-1 — Block library breadth
- **Status:** ⬜ awaiting media
- **Wanted:** PNG, full editor width
- **Demonstrates:** Editor depth: one note composing callouts, tabs/columns, a mermaid diagram,
  an excalidraw sketch, and a code block — the custom TipTap node inventory at a glance.
- **Capture notes:** Compose a dedicated "kitchen sink" demo note; keep it visually tidy.

## Fig 3-2 — Live collaboration
- **Status:** ⬜ awaiting media
- **Wanted:** PNG or GIF
- **Demonstrates:** Real-time Y.js collaboration: two named cursors/selections in the same note,
  presence indicators visible.
- **Capture notes:** Two browser profiles side-by-side; distinct user names/colors.

## Fig 4-1 — Publishing composer → live page
- **Status:** ⬜ awaiting media
- **Wanted:** PNG (side-by-side) or GIF (compose → publish → view)
- **Demonstrates:** The publish pipeline: authoring publishing blocks in the IDE on the left, the
  rendered public page on the right. Proves the same TipTap document drives both surfaces.
- **Capture notes:** Pick a visually rich page (hero block + cards) so both panes look designed.

## Fig 4-2 — davidvalentine.org, rendered by this repo
- **Status:** ⬜ awaiting media
- **Wanted:** PNG
- **Demonstrates:** Production proof: the live personal site (a real page, real domain) rendered
  by the publishing system in this codebase.
- **Capture notes:** Browser chrome with visible URL bar strengthens the claim.

## Fig 5-1 — Browser extension side panel & acquisition
- **Status:** ⬜ awaiting media
- **Wanted:** PNG or GIF
- **Demonstrates:** Agentic browser reach: the extension side panel open on a live page with the
  "Read full content" acquisition split-button (tap = auto ladder, hold = quick-pick), and/or a
  capture landing in the garden.
- **Capture notes:** Use a public article page. Check the Recents list for private history before
  capturing.
