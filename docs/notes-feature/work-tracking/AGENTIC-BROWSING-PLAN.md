---
title: Agentic Browsing Plan — extension-executed, co-browsing-governed, tool-based
status: >
  Phase 0 + hardening + Phase 1 (research loop) + Phase 2a (read-completion
  launcher + ONE deterministic reader `read_page_headless_or_browser`) SHIPPED on
  feat/agentic-browsing, owner-validated (2026-08-01). PR pending (rebase after
  PR #142). Phase 2b (supervised navigation) NEXT — spike done + **D-ENG RESOLVED
  → raw CDP first behind BrowserActuator** (playwright-crx deferred to form-fill);
  still open: D-TGT, D-BANNER. Interaction reliability is held to a two-category
  standard (Category A cross-frame / Category B actionability — see plan §). Deferred
  to after 2b: layer #2 (in-chat read-mode toggle, defaults to opening the browser)
  + layer #3 (live per-phase step display, shared with 2b nav steps).
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
- **D3 — Free where safe, gated where sensitive.** The agent reads, navigates,
  and iterates *freely* wherever safety is ascertainable (no sensitive
  submission). Co-browsing is **narrow and targeted, not "approve every move"**:
  the user authorizes each **sensitive submission** (PII / consent / payment,
  login, purchase) and each **communication** *before* it executes. That
  authorization is a safety rail while the product hardens — post-hardening it may
  become *removable* in explicitly-opted-in environments, but **never by
  default**; autonomy over sensitive actions is the rare exception, not the rule.
- **D4 — Waivers gate high-risk classes.** Some classes carry consequences that
  reach *beyond the user's own data* — **communications** (messages, emails,
  connection requests, posts) send content to other people and are the first such
  class. Enabling one requires a **waiver**: a one-time, user-authorized informed
  consent that the class is on. The waiver *enables the capability*; per-action
  co-browsing (D3) still governs each individual use.
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
| **Raw `chrome.debugger` + CDP** | full control, no dep, native MV3 fit, trusted input; a11y-first targeting sidesteps most of the "flaky" surface | we own a **bounded** actionability pipeline (not the exotic long-tail) | **PRIMARY — locked for Phase 2b (2026-08-01)** |
| `playwright-crx` (Playwright in-extension over CDP) | actionability engine (wait/retry/frames/shadow-DOM), `ariaSnapshot`, `setInputFiles`; `newCDPSession()` keeps raw CDP available | 51 MB unpacked, offscreen-doc MV3 model, single-maintainer, **dormant ~11 mo** (last release v0.15.0 Jun-2025) | **deferred `BrowserActuator` swap for the form-fill / hard-acting phases** |

**Recommendation (revised 2026-08-01, post-spike — reverses the earlier lean).**
**Raw CDP is the LOCKED primary engine, built behind the `BrowserActuator`
interface; `playwright-crx` is the deferred swap for the form-fill / hard-acting
phases.** The [playwright-crx spike](#) found three things that flipped the prior
"playwright-crx preferred" call: (1) **maintenance** — dormant ~11 months (no
commit since Sep-2025), single maintainer, tracking fast-moving upstreams
(Playwright + Chrome), so as the *primary* engine it's a standing liability; (2)
**weight** — 51 MB unpacked → forces offscreen + code-split complexity for a
Phase-2b slice that doesn't need it; (3) **lifecycle** — the MV3 SW-suspend hazard
that most justified playwright-crx is now **solved by Chrome itself** (an active
`chrome.debugger` session keeps the SW alive), and that keepalive helps raw CDP
equally. Phase 2b needs only a **narrow, supervised, read/navigate-dominant** CDP
surface (`Page.navigate`, `Input.dispatch*`, `Accessibility.getFullAXTree`,
`Runtime.evaluate`), which raw CDP covers with **trusted** input and zero
dependency risk. What we consciously defer — Playwright's hardened actionability
for *unattended acting on hostile SPAs* — is exactly the **form-fill phase**,
which is the `BrowserActuator` swap trigger. See **Interaction reliability** below
for the two failure categories this engine choice must design against, and the
band-aid pipeline that keeps the raw-CDP actionability layer bounded.

**Where playwright-crx would run *when swapped in* (bundle placement).** It lives
in a **lazily-created offscreen document** — *never* a content script (never loads
per page) and *never* the service worker (stays light for fast MV3 cold-starts).
Created on session start, drives the debuggee tab(s) over CDP, torn down when
sessions end; **code-split** into its own chunk. Normal browsing pays only on-disk
size. Raw CDP (the locked primary) needs **no offscreen doc for the 2b MVP** — the
debugger-keepalive covers the SW lifecycle during an active session, with a
`runtime.connect()` port as belt-and-suspenders for long multi-step runs.

**The debugger banner.** `chrome.debugger` shows a non-hideable "extension started
debugging this browser" info bar (a Chrome security feature). Mitigation: attach
only during an *active* co-browse session, detach the instant it ends; frame the
banner in-product as the visible sign the agent is driving (consistent with D1's
visibility promise).

### Interaction reliability — two failure categories to design against (raw CDP)

> **Read this before debugging any "the agent clicked the wrong thing / didn't
> act / read nothing" issue.** Choosing raw CDP as the primary engine (see D-ENG)
> means we own the reliability scaffolding Playwright would otherwise give us.
> The failure surface is **two categories**. Every interaction fix, regression,
> or new nav capability should be reasoned about in these terms. When a category
> starts dominating our bugs on *unattended* acting, that's the signal to swap in
> `playwright-crx` behind `BrowserActuator` (see the swap triggers at the end).

**Category A — Cross-origin iframes (OOPIF).** The target isn't in the top
document; it's in a child frame with its own execution context and coordinate
origin. **Where it bites (broader than just "apply forms"):**
- **Embedded-ATS job boards** — Greenhouse (`boards.greenhouse.io`) / Lever
  (`jobs.lever.co`) are iframed into `company.com/careers`, so the **job list,
  each expanded description, and pagination** are all cross-frame. This is the
  north-star use case, so cross-frame handling is needed at the **read/navigate**
  layer, not only at submit.
- **Consent / CMP walls** (OneTrust, TrustArc, Sourcepoint, Quantcast) — usually a
  cross-origin frame; the agent often *must* click "Accept/Reject" **inside it**
  just to reach content. Pure navigation, nowhere near a form.
- **Captcha / challenge frames** (reCAPTCHA, Turnstile) — always cross-origin, but
  here we **detect and hand off to the human** (Phase 2a visible-tab escalation),
  we don't act. Needs cross-frame *reading*, not acting.
- **Embedded viewers / search widgets / comment threads** (PDF/Scribd, Algolia,
  Disqus) — cross-frame *reads*.

*How hard it bites — the read/act split:* **cross-frame reading is easy** —
`Target.setAutoAttach({autoAttach:true, flatten:true})` surfaces every child frame
over one connection (routed by `sessionId`); call `Accessibility.getFullAXTree`
per frame and stitch. **Cross-frame acting is the real work** — input is dispatched
at the **root** viewport in **root coordinates** (the compositor routes the hit
into the iframe), but a deep element's `DOM.getBoxModel` returns **frame-local**
coords, so you must translate frame-local → root (sum iframe offsets across
nesting). ~100–150 lines Playwright gives free via `frameLocator()`. **Severity:
medium-high for job boards** (the embedded-ATS pattern is guaranteed) but
**bounded** — attach once per frame, then operate within it; not a per-action tax.

**Category B — Actionability (the scaffolding around a trusted dispatch).** The
trusted `Input.*` event is identical to Playwright's; what differs is the
*re-resolve / wait / hit-test / scroll* scaffolding around it. Known misses on
naive "resolve box once → dispatch," and the band-aid that squashes each:

| Failure mode | Trigger | Band-aid (all raw CDP) |
|---|---|---|
| Target outside viewport / **nested scroll container** | result #40; item in a scrollable modal | **`DOM.scrollIntoViewIfNeeded(backendNodeId)`** — one native call, walks scroll-parents itself (same primitive Playwright uses) |
| **Detached / re-created** element (SPA re-render) → stale `backendNodeId` | React/Vue re-render on filter/hover | **`resolveFresh(role,name)`** — re-read AX tree + re-match immediately before each action; never cache a node-id/coord |
| **Moving target** / layout shift between read and act | lazy image / cookie banner shoves list down → click lands on wrong element | resolveFresh + **2-frame box stability** check |
| **Covered / overlay** (login gradient, chat bubble on top) | LinkedIn/Indeed "sign in to see more" wall | **prepare-to-act gate**: `DOM.getNodeForLocation(x,y)` hit-test — is the node at the point my target (or child)? |
| **Degenerate** (0×0, `visibility:hidden`, `pointer-events:none`) | collapsed regions | same gate: non-zero box + AX `hidden`/`ignored` flags (already parsed) |
| **Virtualized lists** (react-window) — row #200 not in DOM until scrolled | LinkedIn, large boards; "collect all results" | **scroll-collect loop** = scrollIntoViewIfNeeded/step-scroll → settle (Phase-0 loop) → re-read AX → dedupe by semantic key → repeat to a cap. *Composed of the above, not new machinery.* |
| **Collapsed accordions / disclosures** hide content | `<details>`, ARIA `aria-expanded=false` | **expand-collapsed pre-scrape pass** — AX exposes `expanded` **as a property**, so detection is a field read; expansion is a normal trusted click + settle + re-read. One of the *most* reliably-nailable cases. |

**The consolidating design: one pre-flight pipeline, not a fix-per-mode.** Route
*every* action (click/hover/type) through
`resolveFresh → scrollIntoViewIfNeeded → prepare-to-act gate → dispatch`. Because
click, hover, and type all resolve+prepare identically, that single pipeline buys
viewport/nested-scroll + detach + layout-shift + covered + degenerate handling
across all three. A11y-first targeting is what makes it cheap: accordion
`expanded` and element `hidden`/`ignored` are **AX-tree properties we already
parse**, not pixel heuristics. *Honest residual:* `scrollIntoViewIfNeeded` won't
beat deliberate scroll-jacking; the gate *detects* an overlay but *dismissing* it
is separate logic; `resolveFresh` needs a stable semantic key (duplicate role+name
→ nth-index / nearby-text disambiguator).

**`BrowserActuator` swap triggers → playwright-crx.** Keep these OUT of the
raw-CDP layer (they need per-keystroke event fidelity or Playwright's hardened
frame engine); when they start dominating, swap: **rich text editors**
(ProseMirror/Draft.js/Quill — deprioritized per owner), **controlled/masked
`<input>`s** (React state desync on bulk `insertText`), **autocomplete/combobox**
(needs real `keydown` to fire the async listbox), **cross-frame *acting*** on
deeply-nested OOPIFs, and the **exotic unattended long-tail**. All concentrate in
the form-fill / apply phases — the natural swap point.

### Where we sit vs. the mature stacks (checked 2026-07)

Agentic browsing splits into **two categories** that are easy to conflate:
- **Automation frameworks** — Playwright, Stagehand (TS on Playwright), Browser
  Use (Python; moved to direct CDP; ~89% WebVoyager SOTA), Skyvern, Browserbase.
  Developer tools that **launch a dedicated or cloud browser** for autonomous
  automation at scale — *not* the user's everyday session.
- **Agentic-browser products** — Perplexity Comet, The Browser Company's Dia,
  Nanobrowser (extension). Agents that drive the **user's own browser**. This is
  our category.

Every stack runs the same **perceive → decide → act** loop, differing on two
axes: **perception** (DOM / accessibility-tree vs vision / screenshot) and
**runtime** (a launched/cloud browser vs the user's real one).

| Stack | Perception | Runtime | Fit for us |
|---|---|---|---|
| Playwright + LLM | DOM / a11y | launches its own browser | pattern yes, runtime no |
| Stagehand | DOM / a11y (NL→action) | Playwright / Browserbase | ergonomics *if* via `playwright-crx` |
| Browser Use | DOM + vision | own CDP process (Python) | pattern yes; wrong language/runtime |
| Computer Use / CUA | vision | VM / sandbox screen | fallback pattern only; model-locked |
| **Ours** | **a11y + DOM (vision fallback)** | **user's real browser (`chrome.debugger`/CDP)** | — |

**Our position is deliberately the product category, not the framework one.** We
optimize for *supervised action in the user's own logged-in, visible browser*
(D1) — auth for free, co-browsing, the user watches. The frameworks optimize for
*autonomous scale in isolated/cloud browsers*. So we **borrow their perception
pattern** (a11y-tree + DOM — mainstream, deterministic, token-efficient) and
their **execution primitive** (CDP — the same protocol Playwright uses under the
hood, and the one Browser Use migrated to in 2026), **reuse our own AI-SDK agent
loop** (identical loop shape), and add **bespoke governance** (co-browsing,
sensitivity gating, ledger, garden-ownership) that none of them have — because
none is built for "the user watches their own browser get driven and approves the
sensitive moments." That gap *is* the product.

**Why not adopt one wholesale:** their runtime layer assumes a Node/Python process
that *launches* a browser; an MV3 extension has neither — the browser is the
user's Chrome via `chrome.debugger`. `playwright-crx` is the only bridge that
repackages Playwright to run *inside* an extension over CDP — the sole path to
Stagehand-like ergonomics against the user's browser, at the cost of a large
in-extension dependency (evaluate maintenance + bundle at Phase 2).

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
2. **Classifier** stamps criticality from **sensitivity detection** (next
   section) — the deterministic floor; the agent may *escalate*, never downgrade
   (D-CRIT). Navigation and pagination are not gated; a *sensitive submission* is.
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

## Sensitivity detection — what actually triggers the gate

The gate is **not** "any act." Navigation and pagination — clicking *Next* /
*Load more*, scrolling, expanding to reach the end of an incomplete read —
iterate **freely** (getting to a different place on a page is not a risk). The
gate fires on a **sensitive submission**, detected deterministically first, with
the LLM as an **escalator, never a downgrader** (D-CRIT). Signals, cheapest-first:

- **PII / payment fields (primary, reliable).** The **HTML `autocomplete`
  vocabulary** (W3C/WHATWG standard) is the clean signal — a field carrying
  `name`, `email`, `tel`, `street-address`, `postal-code`, `cc-number`, `cc-exp`,
  `cc-csc`, `password`, etc. Backed by input `type` (`email|tel|password`) and
  name/id heuristics when `autocomplete` is absent. This is exactly what browsers
  and password managers key on — we reuse the *standard*, not a bespoke detector.
- **Consent / contractual language.** A checkbox beside "I agree / authorize /
  verify / consent / accept the terms" (excluding pure cookie banners) →
  sensitive. Heuristic on label text near required checkboxes.
- **Communications drafts.** A compose surface with a pending draft → sensitive +
  waiver (D4). Signal: a registered **`beforeunload` handler** (the "Leave site?"
  warning Gmail installs for unsaved drafts), readable via CDP
  `DOMDebugger.getEventListeners(window)`. A *Send* in that context never fires
  without the gate.
- **LLM escalator.** The agent may additionally flag an action sensitive from
  context — it can only *raise* the gate, never skip a deterministically-detected
  one, so prompt injection can't argue an action out of its gate.

**Default when uncertain = gated.** Friction drops only where safety is
*ascertainable* (clearly-benign navigation); anything submission-like that isn't
clearly benign is gated. **No mature drop-in "sensitive-form gate" library
exists** — the detector is a small deterministic ruleset over the `autocomplete`
standard + `beforeunload` + consent keywords (reuse the standard, don't reinvent).

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
- **npm dependencies:** **none through Phase 2b** — Phases 0–1 are content-script
  reads; Phase 2b runs on **raw `chrome.debugger`/CDP (native, no npm dep)**.
  **`playwright-crx` is deferred to the form-fill / hard-acting phases**, dropped
  in behind the swappable `BrowserActuator` interface then (D-ENG resolved
  2026-08-01); a vision/set-of-marks helper only if the D-TGT fallback is built.
  Agent loop reuses the AI SDK — **no new agent framework** (browser-use /
  Nanobrowser inform the *pattern*, not the code; they're Python/standalone).

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

- **Tab topology — amended 2026-08-17 (owner): BIND-FIRST.** The page the user
  is on is the default target; a fresh agent-owned tab is the exception. Decided
  in CODE from real tab facts (`session.js startSession`), not by prompt:
  no url, or a url on the **same site** as the user's active tab → bind that tab
  in place (no reload — their filters/personalized list/signed-in state survive);
  an existing session's tab is kept when it's the same-site match (a mid-run
  re-open or a post-eviction recovery must never spawn a sibling tab); a new tab
  only for a **different site** (obvious mismatch) or an explicit `newTab: true`
  (user asked for one). "The user's active tab" is scoped to the **panel's own
  window** (`panelWindowId` stamped by the panel host — `tabs.query({active})`
  alone returns one tab per window). Binding **replaces** a session on another
  tab (session-manager policy) while the executor's single-session invariant
  stays strict. Why: the earlier default ("new tab unless the model omits `url`")
  made every fallback path — a mis-resolved bind, a `NO_SESSION` recovery, plain
  prompt bias toward passing the URL it can see — end in a duplicate tab.
- **Document identity, not URL text.** Every act reports `documentChanged` from
  the top frame's CDP `loaderId` (`snapshot.js currentDocId`): true = a real
  navigation (`back` returns), false = the same document updated in place even if
  its query string changed (results pages load details beside the list; `back`
  there is wrong, and `history.back()` after a real navigation reloads a list that
  may re-rank). Site-agnostic; URL-path comparison is only the fallback.
- **Primary-scroller scrolling.** `scroll`/`collect` drive the page's PRIMARY
  scroller — the window when it has real travel, else the dominant visible inner
  `overflow:auto` container (≥25 % of the viewport; a sidebar/code block never
  wins) — so two-pane results layouts, mail clients and dashboards enumerate
  fully instead of `atBottom` on an unmoving window (`actions.js SCROLLER_JS`;
  reports `scroller`). Per-item runs iterate a **frozen** enumerated list by
  observed `href` (never re-derive "next" from a re-read list).
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
| Navigate / iterate | click a link, "Next" / "Load more", scroll, expand — reach the end of a read | **free** (safety ascertainable — no submission) |
| Act — non-critical | fill a field (no submit); a *non-sensitive* submit (search, filter, sort) | visible; reversible; not gated |
| **Act — sensitive submission** | **submit a form carrying PII / consent / payment; log in; purchase** (detected — see Sensitivity detection) | **co-browsing hard stop** |
| **Act — communications** | send message / email / DM, connect, post | **waiver (D4) + co-browsing (D3)** |
| Autonomous sensitive/comms | — | rare exception; post-hardening, opted-in only (D3) |

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

### Phase 2a — Read-completion launcher + one deterministic reader  *(SHIPPED 2026-08-01)*
- **What shipped:** the read-completion **tab launcher** (`open_tab_and_read`) — a
  consent-gated VISIBLE-tab read for pages a background tab can't load, gated on
  the Browser Bookmarks `capture.allowTabLaunch` setting and reusing the existing
  acquisition policy gate (SSRF/private-net) so `visible` only changes *how* the
  tab opens, never *whether* the URL is allowed. Then, to make reads CONSISTENT
  (owner: the model kept picking the server-only `read_page` dead end), collapsed
  to **one deterministic reader** `read_page_headless_or_browser`: the route drops
  `read_page` when the extension is present, so the CODE (not the model) runs the
  whole ladder — headless fetch → background tab → visible tab (auto when the
  setting is on) — in ONE call. `open_tab_and_read` stays for an EXPLICIT "open a
  tab" request. Action-expressive chips ("Read page (headless)" / "opened a
  browser tab") + an `escalationNote` the model narrates give visibility. No new
  permission (rides the existing extension acquire). Principle: **the model
  decides WHETHER to read; the code decides HOW.**
- **Deferred (owner, after 2b):** **layer #2** — an in-chat read-mode toggle
  (defaults to opening the browser); **layer #3** — live per-phase step display
  (the chip shows the current rung *as it runs* via a progress channel through
  the acquire ladder — build shared with 2b's nav-step UI).

### Phase 2b — Supervised navigation (P4)  *(NEXT)*
- **Goal:** agent navigates (click/paginate/expand/scroll) in a visible,
  session-owned tab; user watching; no critical acts.
- **Components:** raw-CDP executor (Input/Accessibility/Page) in `src/agentic/cdp/`
  behind the `BrowserActuator` interface; the **actionability pipeline**
  (`resolveFresh → scrollIntoViewIfNeeded → prepare-to-act gate → dispatch`) that
  every action routes through; **cross-frame (OOPIF) support** via
  `Target.setAutoAttach({flatten:true})` (read-first: per-frame `getFullAXTree`;
  root-coordinate translation for acting); the **expand-collapsed** + **scroll-
  collect** passes; `navigate` tool family; a11y-tree target resolution (D-TGT);
  synthetic cursor overlay (rides B4); session+tab manager + teleport; interrupt
  control; **live step display (layer #3 — shared with reads)**. The two failure
  categories in **Interaction reliability** are the **standard this phase upholds**
  — every nav capability is measured against Category A (cross-frame) + Category B
  (actionability).
- **Libs/perms/data:** **add `debugger` permission** (+ `notifications` for
  checkpoints); **raw CDP = no npm dependency and no offscreen doc for the MVP**
  (Chrome's debugger-keepalive covers the SW lifecycle; `runtime.connect()` port as
  belt-and-suspenders). `playwright-crx` is NOT added here — it's the deferred
  form-fill-phase swap behind `BrowserActuator`. No Prisma change.
- **Decisions:** **D-ENG RESOLVED → raw CDP first** (behind `BrowserActuator`;
  playwright-crx deferred). Still open: D-TGT (a11y vs +vision), D-BANNER (accept
  the chrome.debugger banner).
- **De-risk (step one) — ✅ core validated (Slice 4, `feat/agentic-slice-4`, 2026-08-04):**
  drove the actionability pipeline directly against deliberately-hard real pages.
  **Cross-frame acting is PROVEN** — clicking a control inside a live OOPIF opened
  it (`frameOffset` frame-local→root translation works on raw CDP), retiring the
  engine's biggest unknown. Matching validated on two sites with opposite structures
  (LinkedIn title-leading `button`s → starts-with tier; Greenhouse company-leading
  `link`s → substring tier) via a 3-tier matcher; captcha detect-and-pause + frame
  skipping landed. `collect` dedup+termination confirmed. **No `playwright-crx` swap
  trigger hit — every miss was raw-CDP-fixable; the deferral now holds on evidence.**
  Not-yet-run (lower risk, deferable): a true *embedded* board's pagination (same
  proven `frameOffset` mechanism) and a consent-wall cross-frame dismiss (re-proof
  of cross-frame acting). The "surprise miss" risk for 2b's action set is measured,
  not asserted.
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

## Phase 1 — Build Spec (scoped 2026-07-31, recon-backed)

**Shape: rides the existing AI-SDK tool loop; no bespoke controller.** The
"research loop" is the model looping over the registered read tool + a new
`extract_structured` tool under a gated **research methodology** system-prompt,
bounded by a per-run budget + a raised step cap. Everything downstream reuses
machinery that already exists — the net-new surface is one prompt section and
two tools.

**Recon confirmed the write path is 100% reuse** (`lib/domain/ai/`):
`createNote` (`registry.ts:638`, markdown→TipTap, `needsApproval`, Prisma
create) · `resolveToolOutputPlacement` (`tools/output-placement.ts:22`) ·
`upsertRunLedger` (`run-ledger.ts:58` — a **working** per-run ledger note keyed
by `runKey`, append-only markdown in `NotePayload.metadata`) ·
`markdownToTiptap` with **real GFM table → TipTap `table` node** support
(`content/markdown.ts:52`, `editor/extensions-server.ts:129`) ·
`addAutoAssociation(...,"tool-call")` (`features/conversations/associations.ts:219`).
So the ledger-per-objective, the structured table, and the landing are all
existing primitives.

### The run boundary = a research-plan card (resolves D-OBJ)
New `propose_research_run` tool, `needsApproval: true` (reuses the AI-SDK HITL
pattern `createNote`/`phase_checkpoint` already use). Before any reading the
agent proposes:
```
{ objective, sources[], autoFollowDepth, pageBudget,
  target: OutputTarget, ledger: { runKey? | "new", label } }
```
User approves / edits / declines; on approval the tool returns the locked run
config and the loop proceeds. This one card fixes **cost** (pageBudget),
**destination** (target), and **audit home** (ledger runKey) up front — the
Phase-1 analogue of Phase 3's per-action checkpoint, at *run* granularity. It is
where "one ledger per objective; same-flavor together" lives: the agent proposes
an existing `runKey` (append) or `"new"`.

### Read primitive = whichever read tool is registered
Browser sidebar (extension present) → `read_page_in_browser` (self-escalates P1
direct → P3 session-tab, so it covers cheap *and* hostile pages). App surface
(no extension) → server `read_page` (P1–P2, public only). The methodology prompt
says "read the page"; the model uses the tool it has. Reading hostile pages in a
research run is therefore a browser-sidebar capability, consistent with D1.

### `extract_structured` tool (resolves D-SCHEMA)
New server tool mirroring the `generateObject` pattern (`follow-ups.ts:137`,
`folder-assist/service.ts:296`), cheap model resolved via
`resolvePrimaryRoute(userId, "tool-result-extraction")` (as
`acquisition/extract-relevant.ts:37`). Input `{ content, schema? }`. **Schema =
both, agent-inferred by default, user-supplied overrides:** named columns
(objective or user) are honored exactly; else the agent passes an inferred set.
Output = structured rows the model accumulates and later renders as a GFM table.

### Governors (breadth/depth + budget caps)
- **Per-run page budget** (plan card, default ~12), enforced at the read
  boundary on *both* paths: (a) browser reads — a **client-side per-run counter**
  in `use-conversation-engine.ts` `onToolCall`, seeded from the approved budget,
  returns `output-error` "budget reached" when spent (the server has no `execute`
  to gate a client tool, so this is the only place it can live); (b) server reads
  — raise the ctx `createAcquisitionBudget` (`acquisition/types.ts:79`, today a
  hard 5/turn) to the run budget. Spent → reads refuse → model synthesizes what
  it has.
- **Auto-follow depth: default 1** (seed index → into items); deeper only if the
  objective needs it. Depth *guides*; the page budget is the hard cap.
- **Step cap = a function of the page budget (P1-c resolved).** Not a fixed
  number: `stopWhen: stepCountIs(researchMode ? pageBudget * 2 + 4 : 7/8)` per
  server leg (today's cap is `route.ts:1565`). The step cap is a *safety
  ceiling*, not the depth lever — deriving it from the budget means a run you
  sized (and paid) for N pages always has the steps to finish N pages, and a
  small run doesn't carry a needlessly high ceiling. Browser-read runs span
  multiple legs via the resume predicate — each leg re-bounded — so the per-run
  *page* budget, not the step cap, is the true run bound. **Cost note:** the real
  driver is accumulating context × steps (each step re-sends prior read content),
  so `extract_structured` produces compact rows and the loop is prompted to lean
  on rows rather than re-reading raw pages; the page budget caps total context.
- **Backstop:** the extension's existing 10-pages/5-min rate limit stays a hard
  ceiling.

### Roll-up (all reused)
On synthesis: (1) resolve destination via `resolveToolOutputPlacement(ctx,
parentId?, location?)` = the plan-card `target`; (2) build the body — prose
synthesis + a **GFM markdown table** of the rows — via `markdownToTiptap`;
(3) persist via `createNote` (or a `contentNode.create` mirroring it);
(4) append the run to the **objective ledger** via `upsertRunLedger(..., {
runKey })` — pages read + synthesis, keyed by the per-objective `runKey`;
(5) `addAutoAssociation(...,"tool-call")` for each created node.

### Enablement (contextual, not a global toggle)
`propose_research_run` + `extract_structured` register when a read tool is
available AND the surface opts in (same predicate as the browser tools). The
agent invokes `propose_research_run` for research-shaped requests; the card is
the cost gate. `hasResearchTools` flag on `SystemPromptContext`
(`system-prompt.ts` near `:114`), set from `"extract_structured" in tools`
(`route.ts:1566-1600`), drives the methodology section co-located with the
`hasBrowserReadTool` branch (`:225`).

### Files
- **New:** `extract_structured` + `propose_research_run` (`tools/registry.ts`);
  research methodology section + `hasResearchTools` (`system-prompt.ts`,
  `tools/types.ts`); client-side per-run read budget
  (`use-conversation-engine.ts`); a research-plan approval-card component
  (client).
- **Modified:** `app/api/ai/chat/route.ts` — conditional research-tool
  registration, raised step cap + acquisition budget in research mode, thread the
  approved run config into ctx.
- **Reused unchanged:** `run-ledger.ts`, `tools/output-placement.ts`,
  `output-target.ts`, `content/markdown*.ts`, `associations.ts`.

### Libs / perms / data
**None new.** No npm dep, no permission, **no Prisma change** (ledger is
`NotePayload.metadata`; `ConversationAssociation` exists). Matches the roadmap's
"Phase 1: none new."

### Gate (unchanged)
"research these 3 boards for X" → N pages read (within budget, auditable) → a
synthesized note + a structured table, landed in the chosen place, with a full
per-objective ledger of every page read.

### Sub-decisions — RESOLVED (owner, 2026-07-31)
- **P1-a Budget placement → client-side, run-scoped, fail-open.** The per-run
  budget lives in the engine's `onToolCall` and only exists while a research run
  is active (set on plan-card approval, cleared when the turn settles to
  `status: "ready"`). No active run → the budget path isn't entered → **normal
  reads are untouched**. Fail-open (lost run = unbudgeted, never falsely blocked),
  soft-stop (budget reached → "synthesize what you have", not a crash), and only
  *successful* reads decrement. Server `read_page` ctx budget raised in parallel.
- **P1-b Plan-card mechanism → reuse `needsApproval` now.** The rich/previewable
  approval-card overhaul is backlogged (BACKLOG 2026-07-31) and benefits every
  HITL surface; not a Phase 1 blocker.
- **P1-c Step cap → derived from the page budget** (`pageBudget * 2 + 4`), not a
  fixed number. Budget is the depth lever; step cap is the safety ceiling that
  follows it.
- **Budget surface:** per-run field in the plan card (adjust on a dime); static
  default in `settings/ai`; later a quick "depth" gauge in the **AI 3.8 chat
  control panel** / **3.7 resource governance** (both already roadmapped) — no
  rework, same number.

### Smoke-test outcomes (2026-08-01) — validated + refinements
First multi-source run (HN + lobste.rs + reddit → comparison table) cleared the
gate: plan card → reads → `extract_structured` → synthesis note **with a real
table** → ledger + reference chips. Two refinements applied from it:
- **`extract_structured` now infers interpretive columns.** It was leaving
  columns like `topic` blank because the prompt said "use `""` for a column not
  present". Now: FACTUAL columns verbatim-or-blank (never invented), INTERPRETIVE
  columns (topic/category/summary) inferred from the item's content.
- **Approval-card field labels humanized** (camelCase → "Spaced Label") in the
  generic renderer (`ChatMessage.tsx`) — helps every approval card. Per-field
  TOOLTIPS (from each tool's zod `.describe()`) remain part of the backlogged
  rich-approval overhaul (needs the descriptions threaded to the client).

**Deferred → Phase 2: read-completion tab launcher (owner request, 2026-08-01).**
When a source can't be read (bot-blocked, device-blocked like the tester's
Reddit, or the background session tab fails), offer a consent affordance to
**auto-launch the URL in a VISIBLE tab to finish the read** — approve → open +
read via the extension; **decline → continue without that resource** (partial
result, acknowledged). Toggle-able from **BOTH** the app and the browser-sidebar
settings. This is a Phase 2 primitive (visible, session-owned tabs — the lightest,
read-only slice of supervised navigation), so it lands in Phase 2, not Phase 1.
Until then a failed research read degrades gracefully (the agent flags which
sources failed + suggests the extension). NOTE: in the browser **sidebar** the
loop already escalates blocked reads to the extension's *background* session tab
(`read_page_in_browser`); the launcher is the escalation BEYOND that, for pages
even a background tab can't load (aggressive bot-detection / device blocks).

---

## Consolidated open decisions (your call — needed to lock the plan)

- **D-ENG** (Phase 2): **RESOLVED (2026-08-01) → raw CDP FIRST**, built behind the
  swappable `BrowserActuator` interface; `playwright-crx` deferred to the
  form-fill / hard-acting phases. The spike reversed the earlier "playwright-crx
  preferred" lean: it's dormant ~11 mo + 51 MB, and the MV3-lifecycle problem it
  best solved is now handled by Chrome (active `chrome.debugger` sessions keep the
  SW alive). Owner: *"we will put Playwright in at some point"* — the interaction
  cases in **Interaction reliability** (Category A cross-frame + Category B
  actionability) are the ones to be prepared for; each is the swap signal. See
  that section for the raw-CDP band-aid pipeline that keeps the actionability layer
  bounded for supervised 2b nav.
- **D-TGT** (Phase 2): **RESOLVED (2026-08-02) → accessibility-tree-first, vision
  fallback deferred.** The band-aid pipeline depends on it (accordion `expanded`,
  element `hidden`/`ignored` are AX properties); vision is a clean later add behind
  the same target-resolver.
- **D-CRIT** (Phase 3): **sensitivity detection** is the deterministic floor
  (`autocomplete`-PII + consent checkbox + `beforeunload`/draft), LLM
  escalator-only. The gate fires on a *sensitive submission* — not every submit;
  benign submits (search / filter) run free; uncertain → gated. OK? What is
  always-on the floor (PII fields, payment, password, consent checkbox, email-send)?
- **D-GRAN** (Phase 3): per-action approval by default; is "approve this batch /
  this domain this session" allowed, and if so, bounded how?
- **D-OBJ** (Phase 1): objective-boundary = agent-proposes / user-confirms.
  **RESOLVED → the research-plan card** (see Phase 1 Build Spec); one card fixes
  objective + budget + target + ledger before any read.
- **D-SCHEMA** (Phase 1): structured-extraction schema. **RESOLVED → both,
  agent-inferred by default, user-supplied overrides** (see `extract_structured`
  in the Build Spec).
- **auto-follow depth** (Phase 1): **RESOLVED → default 1, hard-capped by the
  per-run page budget** (depth guides, budget bounds).
- **D-WAIVER** (Phase 5): waiver scope — class / domain / session? Durable table vs
  device-local settings?
- **D-BANNER** (Phase 2): **RESOLVED (2026-08-02) → accepted.** The
  `chrome.debugger` "…is debugging this browser" infobar stands as the visible
  "agent is driving" signal, paired with our own in-app co-browsing indicator +
  one-click Stop (detach + dismiss). Attach only during an active co-browse
  session; detach the instant it ends.
  **Amended 2026-08-17 — scope + on-page banner.** The infobar is a *global*
  Chromium infobar: it appears in every tab of every window of the profile,
  standalone-PWA windows included, and there is no extension-side way to scope
  it to the driven tab. The only suppressions are browser-side and all-or-nothing:
  the `--silent-debugger-extension-api` launch flag (local/dev remedy), or
  installing the extension via the `ExtensionInstallForcelist` policy (policy-
  installed extensions never raise the infobar — the eventual distribution-time
  fix; needs a packed CRX + hosted `update.xml` + a managed-preferences plist for
  Vivaldi/Chrome). We therefore stopped relying on the infobar as the per-page
  signal: the extension now paints its own **on-page banner** into the driven tab
  (`agentic/cdp/banner.js`) — `chrome.scripting`-injected (not CDP) so it can be
  removed after an out-of-band detach and re-painted on every navigation from
  `tabs.onUpdated`, and passive (`pointer-events:none`, `aria-hidden`) so it never
  occludes the hit-test gate or enters the a11y snapshot. Stop remains in the panel.

## Explicitly out of scope (recorded)

- Headless/sandbox execution (D1) — a separate project if ever wanted.
- Autonomous critical actions or communications as a *default* (D3/D4).
- Trellis/workflow-hub *ownership* of the subsystem (D5) — initiator only, later.
- Credential storage — the extension uses the existing session; no passwords stored.
