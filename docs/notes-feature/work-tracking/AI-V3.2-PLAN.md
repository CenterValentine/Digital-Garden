# AI v3.2 — The Six Unbuilt (hardening + polish)

Successor round to AI v3.1 (built; PR pending). Scope = the six backlog
items that were deferred behind the 3.1 UX work, promoted to a plan by the
owner 2026-07-22. Ordered so the foundational hardening (T1) lands before
the feature that sits on it (T2). Branch continues on
`worktree-ai-v3-core` (or a fresh `ai-v3.2` branch if 3.1 merges first).

The AI V4 thread (conversation memory bank, JIT retrieval, validated
compaction) stays separate — see `AI-V3.1-PLAN.md`'s final section.

## T1 — Harden the markdown ↔ TipTap translation seam

The owner directive ("I don't like this patching approach… manage
translations in a hardened way"). Recon (2026-07-21) found the
architecture already right — `lib/domain/content/markdown.ts` is the hub
for 12 of 17 call sites — but the **failure contract** is wrong: the
converter's `catch` silently wraps raw markdown in one paragraph, which is
the root of the R6 degraded-note bug AND the reason `registry.ts` carries
a band-aid.

- **Explicit failure, not silent fallback.** The converter returns a typed
  result that signals degradation, so a bad conversion is detectable at
  the call site and flaggable in note metadata — never shipped as
  invisible plain text.
- **One canonical entry point.** Formalize `markdown.ts` as THE converter;
  route `browser-extension/service.ts` through it and delete the
  `registry.ts` `isMarkdownFallback`/`paragraphSplitFallback` band-aid.
  Leave the two HTML-*rendering* files (`export/converters/html.ts`,
  `components/public/TipTapContent.tsx`) — different concern.
- **Round-trip tests.** markdown → TipTap → markdown over the real
  node/mark set (headings, lists, tables, callouts, code, links, marks) —
  the regression guarantee.
- **Collab-aware writes.** The converter stays pure; the R6 lesson (Y.doc
  is authoritative for collab notes) becomes a documented guard at the
  write sites. Fold the R6 salvage script (`pnpm notes:regen`) in as the
  backfill arm.
- **OWNER DECISION (pending):** when conversion genuinely can't produce
  structure, (a) hard-fail the AI tool call with a clear error, or (b)
  write a marked-degraded note (content preserved, flagged in metadata +
  visible badge, recoverable by the sweep). *Recommendation: (b) for AI
  writes — never lose the user's content; hard-fail only leaves them
  emptier-handed. Confirm before building.*
- **Gate:** round-trip tests pass over the full node set; a deliberately
  malformed input produces the chosen failure signal (flagged note or
  clear error), never silent plain text; the `registry.ts` band-aid is
  gone; existing degraded notes heal via the folded-in sweep.

## T2 — Markdown ↔ TipTap source-view toggle

Owner request; the natural companion to T1 (excluded from 3.1
deliberately). A toolbar toggle to view/edit a note's markdown *source*
alongside the rich-text editor.

- Toggle in the editor toolbar: rich-text ⇄ markdown source. Source view
  renders `tiptapToMarkdown(json)`; edits re-parse via the (now hardened,
  T1) `markdownToTiptap`.
- Collab-safe: source-edit commits go through the same write path as
  normal edits; for collab notes the Y.doc stays authoritative.
- **Gate:** round-trip a formatted note through source view with no
  content loss; a source edit reflects in rich-text on toggle-back.
- **Recon (2026-07-22):** integration map — the note editor lives in
  `MainPanelContent.tsx` (the `editorElement`, title header at ~2033 +
  the TipTap `MarkdownEditor`); `ContentToolbar` (line ~2198) is the
  toggle's home. There's an existing DEBUG markdown view
  (`state/debug-view-store.ts` → `MarkdownDebugView`) but it's read-only
  and dev-only — T2 is a separate USER-facing editable mode, not an
  extension of it. Approach: a `sourceMode` state; when on, swap the
  MarkdownEditor for a textarea seeded from `tiptapToMarkdown(noteContent)`;
  on toggle-off, `markdownToTiptapResult(text)` → setNoteContent → save
  (reuses T1's hardened converters + degraded flag). Collab-safe: routes
  through the existing `handleSave`, so Y.doc-backed notes stay
  authoritative. Sensitive surface (core editor) — build with care.

## T3 — S4c playbook progressive-disclosure registry

Deferred from v3 S4. Playbooks are invoked today by @-mentioning the note;
the registry adds discovery + per-phase disclosure.

- A registry of known playbooks (surface: a picker / slash affordance in
  chat) so users find procedures without knowing the note name.
- Progressive disclosure: expose a phase's detail only when the run
  reaches it, keeping the model's context proportional to the active
  phase (ties into the R5 context-discipline work).
- **Gate:** a user starts a playbook from the registry (no @-mention);
  phase detail loads per-phase, verifiable in the token meter.

## T4 — Resumable-stream store (live re-attach)

The S1 "survives reload" gate ships at the no-lost-work level (server
`consumeStream` + idempotent persistence); live re-attach to an in-flight
stream needs a resumable-stream store (Redis-class).

- Stand up a store (Upstash via Vercel Marketplace, or Redis on the
  Coolify homeserver) and wire `useChat` resume / `resumeStream`.
- **Gate:** reload mid-stream → the SAME in-flight response continues
  rendering live, not just the completed message on next load.

## T5 — Conversation title strategy for quick URL chats

Deferred S3-time call: page title vs. first-message summary for chats
opened from a URL.

- Decide + implement the title source for quick/URL-opened chats
  (first-message summary is the likely answer; confirm at build).
- **Gate:** a URL-opened chat gets a meaningful title without manual
  rename, consistent with sidebar-created chats.

## T6 — Acquisition explainer (owner walkthrough)

Umbrella post-V3 queue: a knowledge-transfer session/doc, not a build —
walk the owner through the Acquisition Service (envelope, policy engine,
P0 native search × 4, P1 server-fetch/read_page, garden hydration, and now
the app-executed BYOK search) so its extension points are owned, not
rediscovered.

- Deliverable: a concise architecture doc under
  `docs/notes-feature/guides/ai/` + a live walkthrough.
- **Gate:** owner can point to where a new acquisition provider or search
  backend plugs in without re-deriving it.

## Verification conventions

`pnpm typecheck → lint → build` per repo standard, plus in-app browser
smoke per session gate against localhost. T1 additionally ships unit
round-trip tests (the first test coverage this subsystem has had).

## Sequencing note

T1 → T2 are a pair (T2 depends on T1's hardened converter). T3–T5 are
independent and can reorder by owner priority. T4 needs infra (a Redis-
class store) provisioned before it starts. T6 is a doc/walkthrough,
schedulable any time.
