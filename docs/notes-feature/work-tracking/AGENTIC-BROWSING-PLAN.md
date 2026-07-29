---
title: Agentic Browsing Plan — extension-executed, co-browsing-governed, tool-based
status: architecture draft 2026-07-29 (owner review pending); build not started (Phase 0 next)
owner: centervalentine
extends: >
  BROWSER-REACH-PLAN.md B4–B6 (P4 supervised-nav, P5 CDP agent, executor spoke).
  Those directions consolidate here and are DECOUPLED from Trellis (see D5).
related:
  - lib/domain/ai/acquisition/            # Acquisition Service — the READ half (P0–P3 built through B5/PR #136)
  - lib/domain/browser-extension/         # bridges + acquire ladder (page-bridge-client, panel-bridge, acquire-url)
  - extensions/browser-bookmarks/browser-extension/  # the only execution surface (D1)
  - lib/domain/ai/                        # agent runtime: tool loop, approval cards, run-ledger, context discipline
  - docs/notes-feature/work-tracking/WORKFLOWS-FOUNDATION-PLAN.md  # Trellis — an initiator later, never the home (D5)
---

# Agentic Browsing Plan

**Premise.** An AI agent that reads, navigates, and — under strict governance —
*acts* in the user's own browser to accomplish multi-step goals. Research and
advanced acquisition first; gated actuation later. A **standalone subsystem**
built from three existing pillars — the Acquisition Service (read), the browser
extension (execution), the AI agent runtime (loop + approvals + run-ledger) —
plus a **co-browsing** governance model that keeps the user in authority over
every critical action.

**North-star use case.** End-to-end job hunting: research postings (read) →
tailor the résumé → apply (act, co-browsed) → track in the garden.

---

## Founding decisions (rationale recorded — do not re-litigate without owner)

- **D1 — Extension-only execution surface.** All browsing runs in the user's
  *real* browser via the extension. **Headless/sandbox execution is explicitly
  out.** The product's promise is *visibility into every AI action*; headless is
  opaque and costly to govern. Isolated headless automation, if ever wanted, is a
  separate project.
- **D2 — Read and Act are separate layers.** *Acquisition* (read, no side effects,
  `untrusted-web`) and *Actuation* (side-effectful) have different safety models
  and are never conflated. Liberal on reads; conservative on acts.
- **D3 — Co-browsing is the rule; autonomy the rare exception.** The user
  authorizes every *critical* action before it executes (form submission above
  all). A safety rail while the product hardens; post-hardening it may become
  *removable* in explicitly-opted-in environments, but removal will **never be the
  default**.
- **D4 — Waivers gate high-risk classes.** Communications first (messages, emails,
  connection requests, posts): explicit, user-authorized informed consent *on top
  of* co-browsing (D3), before the class is enabled.
- **D5 — Standalone subsystem now; Trellis is a future *initiator*, never the
  home.** Scheduling/hub orchestration is deferred until workflows hardens.
- **D6 — Full audit.** Every read and act appends to a generated ledger note; an
  agentic session is a reviewable record, live and after the fact.

---

## What is actually new vs. reused (true scope)

Most of this subsystem is composition, not invention. The net-new surface is
small and concentrated in the CDP executor + the checkpoint protocol.

| Capability | Reused | Net-new |
|---|---|---|
| Read a page (P1–P3) | `acquire()` ladder, `acquire-url.ts`, Readability | — |
| App↔extension transport | page-bridge, panel-bridge, `sendRuntimeMessage` | new message *types* (act/checkpoint) |
| Agent multi-step loop | AI SDK tool loop, `use-conversation-engine.ts` | `onToolCall` client-tool wiring (Phase 0) |
| Approvals | "pretty approval cards" (`needsApproval`) | co-browsing *specialization* (action preview) |
| Audit note | Run-Ledger note pattern, output-placement | read-only region enforcement (non-blocking) |
| Overlay/immersion | B4 overlay projection | synthetic agent-cursor |
| **Navigate / click / type / upload** | — | **CDP executor via `chrome.debugger`** |
| Target identification | — | a11y-tree + DOM (+ vision fallback) |
| Action policy | B3-B capture-policy pattern | action-class dimension |
| Waivers | — | consent records (Phase 5) |

---

## System architecture

Three planes, one data flow. The **agent** decides, the **extension** executes,
the **garden** owns the record.

```
┌── APP / AGENT plane (Next.js) ──────────────┐
│ Chat + AI SDK tool loop  (reused)           │
│  ├─ browser tools: read / extract / nav /   │  registered per-turn,
│  │   fill / submit / send        (new)      │  conditional on extension + surface
│  ├─ co-browsing checkpoint = needsApproval  │
│  │   card w/ action preview      (new-ish)  │
│  └─ ledger writer → Run-Ledger note (new)   │
│  lib/domain/ai/agentic-browsing/*           │
└──────────────┬──────────────────────────────┘
   page-bridge / panel-bridge  (reused; +act/checkpoint message types)
┌──────────────┴── EXTENSION plane (MV3) ─────┐
│ Background SW orchestrator        (new)      │
│  ├─ session+tab manager: chatId→sessionId→   │
│  │   tabId map, claim/detach, teleport (new) │
│  ├─ READ: content-script + Readability(reuse)│
│  ├─ ACT: CDP executor via chrome.debugger    │
│  │   (Input/DOM/Accessibility/Page)   (new)  │
│  ├─ synthetic agent-cursor overlay    (new)  │
│  └─ OS notifications (chrome.notifications)  │
│  extensions/…/src/agentic/*                  │
└──────────────┬──────────────────────────────┘
   /api/ai/acquisition (reuse) + /api/ai/agentic/* (new, thin)
┌──────────────┴── GARDEN plane ──────────────┐
│ Run-Ledger note (NotePayload, generated)     │
│ Acquired/produced content, targeted, owned   │
└──────────────────────────────────────────────┘
```

**Trust boundary stays the network + the human.** The extension is untrusted
input to the server (server builds envelopes; server re-checks policy), and the
human is the trust anchor for every critical act (co-browsing).

---

## Browser-automation engine (the core technical decisions)

### Reading — unchanged (built in B5)
Content-script fetch/extract + `@mozilla/readability`; server builds the trusted
`AcquiredContent` envelope. No banner, cheap, no new permission. Structured
"advanced acquisition" = an AI-extraction pass with an optional JSON schema,
reusing the `extract-relevant.ts` cheap-model pattern.

### Navigate / interact / upload — **CDP via `chrome.debugger`**
The forcing functions: (1) **trusted input** — `Input.dispatchMouseEvent` /
`dispatchKeyEvent` produce `isTrusted=true` events sites can't distinguish from a
real user; content-script synthetic events (`isTrusted=false`) are rejected by
many real forms. (2) **File upload** — `DOM.setFileInputFiles` is the *only* way
to attach a résumé to `<input type=file>` (JS cannot set a file input's value).
So the actuation engine must be CDP-based.

**CDP domains we use:** `Input` (mouse/keyboard), `DOM` + `DOM.setFileInputFiles`,
`Accessibility.getFullAXTree` (targets), `Page` (navigate, `captureScreenshot`),
`Runtime` (scoped evaluate), `Target` (frames).

**Engine options (decision D-ENG):**
| Option | Pros | Cons | Call |
|---|---|---|---|
| Content-script synthetic events | zero dep, no banner | untrusted events, **no file upload**, fragile | reads only |
| **Raw `chrome.debugger` + CDP** | full trusted control, file upload, no dep | verbose, we own the wrappers | **MVP recommendation** |
| `playwright-crx` (Playwright in-extension over CDP) | locators, auto-wait, mature API | large dep + bundle, extra abstraction | optional ergonomic layer (evaluate at Phase 2) |

**Recommendation:** raw CDP for the MVP (thin typed wrappers in
`src/agentic/cdp/`), reassess `playwright-crx` when navigation complexity grows.

**The debugger banner.** `chrome.debugger` shows a non-hideable "extension started
debugging this browser" info bar (a Chrome security feature). Mitigation: attach
only during an *active* co-browse session, detach the instant it ends; frame the
banner in-product as the visible sign the agent is driving (consistent with D1's
visibility promise).

### Target identification (decision D-TGT)
- **Primary: accessibility tree** (`Accessibility.getFullAXTree`) — semantic,
  interactable elements with role+name; token-efficient; the model selects by
  role/name. This is the modern agentic pattern (browser-use / WebVoyager).
- **Supplement: DOM snapshot** for precise selectors + bounding boxes.
- **Fallback: set-of-marks vision** — overlay numbered marks on interactive
  elements, send screenshot+marks to a vision model, it returns a mark number —
  for pages the a11y tree handles poorly (canvas/custom widgets). Deferred until a
  read/nav phase proves it's needed.

---

## Action & checkpoint protocol

Every act flows through one protocol so co-browsing + audit are unavoidable:

1. **Agent proposes** an action (tool call): `{sessionId, kind, target(a11y ref /
   selector), value?, criticality}`.
2. **Classifier** stamps criticality from the hardcoded floor list (agent may
   *escalate*, never downgrade — decision D-CRIT).
3. **Non-critical** → executes immediately (visible); **critical/comms** →
   **co-browsing checkpoint**: the agent *pauses*; a `needsApproval` card renders
   the exact action (target, value, destination, a screenshot/preview); OS
   notification fires (names the session).
4. **User resolves** approve / edit / decline. Approve → the SW's CDP executor
   runs it in the (foregrounded) tab; edit → user amends value then approves;
   decline → agent adapts or stops.
5. **Result + append** to the session's Run-Ledger note (timestamp, kind, target,
   value, result, approver, screenshot ref). The loop continues.

Transport reuses the bridges with new message types (`agentic-act`,
`agentic-checkpoint`, `agentic-result`); parallel sessions are disambiguated by
`sessionId` throughout.

---

## Session & state model

- **In-memory (SW):** `Map<chatId, Map<sessionId, SessionState>>` where
  `SessionState = { tabId, ledgerNodeId, gate, debuggee, cursor }`. Ephemeral;
  rebuilt from the ledger on SW restart.
- **Durable record = the Run-Ledger note** (below). The ledger IS the audit
  record — **no `AgenticSession` table required for the MVP** (add one later only
  if we need cross-device listing/search).
- **Claim-then-detach:** a session claims the current tab, then owns it;
  `chrome.tabs.update(tabId,{active:true})` + `windows.update({focused:true})` is
  the teleport.
- **Parallel from day one:** every gate/ledger/tab is keyed by `sessionId`; nothing
  is a singleton; pending approvals queue, each named.

---

## Data, persistence & permissions

- **Run-Ledger note = `NotePayload`, no new payload.** A generated read-only
  region (tool timeline) + the user's editable notes region. Marked as a session
  ledger via ContentNode metadata + a chat association (reuse output-placement).
  Read-only enforcement is a TipTap locked-node concern and **non-blocking** —
  ship the convention first. **No Prisma change for the ledger.**
- **Action policy** = `chrome.storage` (extension-local) + app user-settings
  (allow/deny/ask by domain + action-class), reusing the B3-B capture-policy
  module shape. **No Prisma change.**
- **Waivers (Phase 5)** = durable per-user consent records (class, granted-at,
  terms-version, scope). **This is the one likely Prisma addition** — an
  `AutomationWaiver` table (or a user-settings JSON if we accept device-local).
  Flagged as a Phase 5 schema dependency (DB checklist applies).
- **Manifest permissions to add:** `debugger` (CDP — significant; enables the
  banner), `notifications` (OS checkpoints). Already have `tabs`, `scripting`,
  `cookies`, `<all_urls>`, `sidePanel`.
- **npm dependencies:** **none required for the MVP** (raw CDP). Optional later:
  `playwright-crx` (ergonomics), a vision/set-of-marks helper if D-TGT fallback
  is built. Agent loop reuses the AI SDK — **no new agent framework** (browser-use
  / Nanobrowser inform the *pattern*, not the code; they're Python/standalone).

---

## No new content type — Read/Act are tools

Browser reading and acting are **AI tools**, not a content type — the ContentNode
payload pattern stays absolute. Security comes from the governance gates + the
enforced ledger, not from being content.

- **Contextual enablement (predicate: extension reachable AND surface opts in):**
  browser-sidebar chat → tools **on by default**; app-chat-opened-in-browser →
  **off, toggle to enable**.
- **app→browser hand-off is a context-menu action** ("Continue this chat in the
  browser, co-browsing on") — pure UX, not data model.

## Co-browsing presence — session-owned tabs

- **Teleport** (above). **Two modes:** *immersive* (watch the synthetic agent
  cursor — overlay, not the OS pointer) vs *ambient* (wander; agent runs
  read/navigate, pauses at every critical checkpoint, OS-notifies, you return to
  approve). The agent **waits at the gate** — nothing critical happens while away.
- Background-tab throttling is fine for read/navigate; the critical act runs
  foreground because you were pulled there to approve it.

## Threat model

The defining risk is **prompt injection → unauthorized action** (a page the agent
*reads* saying "submit this / send that"). Defenses: trust-tiering (`untrusted-web`
informs, never instructs) + co-browsing (D3) + waivers (D4) + action policy +
audit (D6). The extension acts in the user's real session — auth for free, but
real side effects; co-browsing is the mitigation.

## Criticality tiers

| Tier | Examples | Governance |
|---|---|---|
| Read | fetch/extract a page | Acquisition policy + budget (auto) |
| Navigate | click a link, paginate, scroll | visible; auto/light |
| Act — non-critical | fill a field (no submit), filter, preview | visible; reversible |
| **Act — critical** | **submit, log in, purchase, irreversible** | **co-browsing hard stop** |
| **Act — communications** | send message/email/DM, connect, post | **waiver (D4) + co-browsing (D3)** |
| Autonomous critical/comms | — | rare exception; post-hardening, opted-in only (D3) |

---

## Roadmap (per-phase spec; each independently shippable)

### Phase 0 — AI browser-acquisition tool  *(NEXT)*
- **Goal:** the chat AI reads a page the server can't (bot-hostile / behind the
  user's session).
- **Components:** `read_page_in_browser` tool (client-side, no server `execute`) →
  `onToolCall` in `use-conversation-engine.ts` → `acquireUrlVia(url,"session-tab")`
  → `addToolResult`. Chat-route reads a `browserExtensionAvailable` flag; registry
  registers the tool conditionally; system-prompt decline+CTA when absent.
- **Libs/perms/data:** none new. Read-only; appends a first ledger entry.
- **Decisions:** none blocking (structured-extraction hook reserved, not built).
- **Gate:** in a chat, "read <bot-hostile url>" → escalates P1→P3 → returns
  content; with no extension, the AI declines with a CTA.

### Phase 1 — Multi-step read agent (research)
- **Goal:** agent reads a *graph* of pages to satisfy a research goal, synthesizing
  into the garden.
- **Components:** a research loop (plan → read → follow/gather → synthesize) on the
  existing tool loop; breadth/depth + acquisition-budget caps; `extract_structured`
  tool (optional JSON schema → structured rows); roll-up into the objective ledger
  + a target note/folder.
- **Libs/perms/data:** none new. First real use of the ledger-per-objective note.
- **Decisions:** D-SCHEMA (user-supplied vs agent-inferred schema); D-OBJ
  (objective-boundary = agent-proposes/user-confirms); auto-follow depth.
- **Gate:** "research these 3 boards for X" → N pages → synthesized note + a
  structured table, landed in a chosen place, full ledger.

### Phase 2 — Supervised navigation (P4)
- **Goal:** agent navigates (click/paginate/expand/scroll) in a visible,
  session-owned tab; user watching; no critical acts.
- **Components:** CDP executor (Input/Accessibility/Page) in `src/agentic/cdp/`;
  `navigate` tool family; a11y-tree target resolution (D-TGT); synthetic cursor
  overlay (rides B4); session+tab manager + teleport; interrupt control.
- **Libs/perms/data:** **add `debugger` permission**; evaluate `playwright-crx`
  here. No Prisma change.
- **Decisions:** D-ENG (raw CDP vs playwright-crx); D-TGT (a11y vs +vision).
- **Gate:** "page through these results and collect them" → multi-page nav in a
  visible tab, cursor glides, you can interrupt; still read/navigate only.

### Phase 3 — Co-browsing foundation + non-critical actuation  *(linchpin)*
- **Goal:** the governance machinery; first non-critical acts (fill, no submit).
- **Components:** the **checkpoint protocol** (propose→classify→present→
  approve/edit/decline→execute→append); per-session gate/state; **action policy
  engine** (domain + action-class allow/deny/ask); **OS notifications**; ledger
  action-entry schema; **critical-classification floor list**; non-critical tools
  (`fill_field`, `select_option`, `preview_form`) via CDP (trusted input).
- **Libs/perms/data:** **add `notifications` permission**; action-policy in
  `chrome.storage` + settings. No Prisma change.
- **Decisions:** D-GRAN (per-action vs batch/session-scoped approval); D-CRIT
  (floor-list contents + escalate-only); action-policy UI/home.
- **Gate:** agent fills a form (no submit); you see every field in a checkpoint;
  approve/edit/decline works; a denied domain/action refuses visibly; all logged.

### Phase 4 — Critical actuation via co-browsing
- **Goal:** gated form submission — the apply-to-job flow (incl. résumé upload).
- **Components:** submit checkpoint (renders the filled form + destination +
  values + screenshot); `submit_form` (critical); **`DOM.setFileInputFiles`** for
  résumé upload; dry-run/preview; partial-submit recovery; receipt into the ledger.
- **Libs/perms/data:** none new (CDP already present). No Prisma change.
- **Decisions:** what the submit card must show for *informed* approval; batch
  approvals for repetitive applies (each vs batch-with-review, bounded by D-GRAN).
- **Gate:** agent fills a real application (résumé attached) → you review the exact
  filled form → approve → it submits. Nothing submits without that "yes."

### Phase 5 — Communications behind a waiver
- **Goal:** messaging/outreach behind waiver + co-browsing.
- **Components:** **waiver system** (consent records + UI + revocation); comms tools
  (`send_message`, `connect`, `post`) each critical; per-message preview+approval;
  rate/etiquette limits.
- **Libs/perms/data:** **likely a Prisma `AutomationWaiver` table** (DB checklist).
- **Decisions:** D-WAIVER (scope: class / domain / session); per-message approval
  always vs waiver-covers-a-reviewed-batch; ToS guardrails.
- **Gate:** sending requires a signed waiver *and* per-message approval; off by
  default; bulk-without-approval blocked.

### Later — Trellis as an initiator
- **Goal:** scheduled/triggered sessions once workflows hardens.
- **Components:** a "start browser session with goal" workflow step; unattended
  constraint (read/navigate only unless pre-authorized); result feedback.
- **Decisions:** what (if anything) is pre-authorizable for unattended runs.
- **Gate:** a scheduled workflow runs a read/navigate session, lands results, and
  pauses+notifies (or skips) anything critical.

---

## Consolidated open decisions (your call — needed to lock the plan)

- **D-ENG** (Phase 2): raw CDP for the MVP, `playwright-crx` optional later — OK?
- **D-TGT** (Phase 2): accessibility-tree-first, vision fallback deferred — OK?
- **D-CRIT** (Phase 3): hardcoded critical *floor* list, agent may escalate never
  downgrade — OK? What's on the floor list (submit, login, purchase, upload, …)?
- **D-GRAN** (Phase 3): per-action approval by default; is "approve this batch /
  this domain this session" allowed, and if so, bounded how?
- **D-OBJ** (Phase 1): objective-boundary = agent-proposes / user-confirms — OK?
- **D-SCHEMA** (Phase 1): structured-extraction schema user-supplied, agent-inferred,
  or both?
- **D-WAIVER** (Phase 5): waiver scope — class / domain / session? Durable table vs
  device-local settings?
- **D-BANNER** (Phase 2): accept the `chrome.debugger` banner as the visible
  "agent is driving" signal — OK?

## Explicitly out of scope (recorded)

- Headless/sandbox execution (D1) — a separate project if ever wanted.
- Autonomous critical actions or communications as a *default* (D3/D4).
- Trellis/workflow-hub *ownership* of the subsystem (D5) — initiator only, later.
- Credential storage — the extension uses the existing session; no passwords stored.
