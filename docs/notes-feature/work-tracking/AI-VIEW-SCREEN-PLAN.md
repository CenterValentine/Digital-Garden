---
last_updated: 2026-10-09
status: phases 1–2 built on `feat/ai-view-screen` (gates green, 22/22 mutants killed) — production smoke after deploy; phase 3 (co-browse bound tab) held behind the owner's co-browse postponement
---

# `view_screen` — the assistant looks at what you are looking at

**What this is.** One AI tool, `view_screen`, that takes a screenshot and
hands the *image* to a vision-capable chat model. It answers "look at this
page", "what's wrong with this layout", "what does this diagram show". Where
the chat runs decides what is captured:

| Chat surface | What `view_screen` captures | How |
|---|---|---|
| Browser extension side panel (`/embed/panel`) | The web page in the active tab | `chrome.tabs.captureVisibleTab` in the panel host |
| Digital Garden itself (right-sidebar chat, any app tab) | The app: the active pane's content, or the whole window | DOM rasterization in the page (no extension needed) |
| Co-browse bound tab (held, phase 3) | The tab the agent is driving, even backgrounded | CDP `Page.captureScreenshot` on the debugger session |

It complements `read_image_text` (OCR-PASTE-PLAN D8): OCR gives *words* on
any model; `view_screen` gives the *picture* to a model that can see.

---

## 0. What already exists (verified 2026-10-09 on `a1f608ee`)

**Model side**

- `ai@6.0.191`. A tool's `toModelOutput` can return
  `{ type: "content", value: [{ type: "text" }, { type: "image-url", url }] }`.
  It runs inside `convertToModelMessages` only when that call receives
  `{ tools }`. The chat route calls it **without** tools
  (`app/api/ai/chat/route.ts` ~1923), and no tool in the app defines
  `toModelOutput` today.
- Provider adapters, read in `node_modules`:
  - `@ai-sdk/anthropic` 3.0.49 accepts `image-url` and `image-data` inside a tool result.
  - `@ai-sdk/openai` 3.0.36 accepts both in a tool result on the **Responses** path (`input_image`). The chat-completions path `JSON.stringify`s them. The app's `openai` adapter is Responses; `openai-compat` is forced onto `.chat()` (`providers/registry.ts`).
  - `@ai-sdk/google` 3.0.43 accepts only `image-data` (inline base64). `image-url` becomes JSON text.
  - `@ai-sdk/xai`, `mistral`, `deepseek` and `groq` stringify a content output, so the model would get a URL as text and never see the image.
  - `@ai-sdk/gateway` forwards the prompt to the vendor. Whether the vendor accepts it there is **unverified**.
- User-message image parts work on every vision provider. The SDK downloads a URL itself for any provider that cannot take one (`supportedUrls`). The chat route already keeps image file parts for every vendor (`resolveAttachmentsForModel`).
- Vision is known from `effectiveCapabilities()` (`lib/domain/ai/features/capabilities.ts`). The route calls it with the bare id only (`{ id: activeModelId }`, for audio). That misses the `capabilities` saved on the connection's model row, so the vision gate must pass the row.

**Storage**

- `POST /api/ai/attachments/upload` stores chat images and returns a URL a vision API can fetch. On R2 that URL is presigned for **7 days**. It also creates a `referenced` ContentNode per upload.

**Context diet** (`lib/domain/ai/context-diet.ts`)

- The perception fold's **turn** rule replaces an earlier turn's read with a stub on the model path only; the transcript keeps every byte.
- Both rules skip outputs under `SUPERSEDE_MIN_CHARS = 600` characters. A screenshot result is a short URL standing for ~1,400 image tokens, so the size test does not apply to it.

**Extension** (`extensions/browser-bookmarks/browser-extension`, manifest 5.4.0)

- Permissions already include `tabs`, `activeTab`, `debugger` and `<all_urls>`.
- The side-panel camera button posts `capture-screenshot` (`panel/index.js:276`) and runs `captureVisibleTab` (JPEG q70). The reply `screenshot` carries **no request id**, and `PanelShellClient.tsx:594` attaches *any* `screenshot` reply to the composer. The tool therefore cannot reuse that message.
- `requestCoBrowse` (`panel-bridge.ts:304`) is the id-correlated request/reply pattern to copy.
- There is **no capability handshake.** An older extension silently ignores an unknown non-cobrowse message, so the app sees only its own timeout.
- The main app tab reaches the extension only through the `page-bridge` content script, which runs on **every** web page. Co-browse is kept off it for that reason, and so is capture (D3).

**Private content**

- The editor renders commented-out text as `[data-private="text"]` and `[data-private="block"]`. One predicate strips it at every AI seam (`pnpm private:content:check`). A pixel capture is a new seam.

---

## 1. Decisions

### D1 — One tool, surface-determined executor

There is no `target` argument. The model calls `view_screen({ area?, purpose? })`. The surface that runs the chat decides what is captured, and the result says what was seen (`via`, `url`/`title` or the pane's title).

A `target: "page" | "app"` argument would invite calls the surface cannot serve: no surface can serve both. The tool is registered only where an executor exists:

- In the side panel, `coBrowseAvailable` (the trust-gated `/embed/panel` surface) registers it.
- In the app, a new body flag `appCaptureAvailable` (the client says it can rasterize) registers it.

`area` applies to the app only: `"content"` (default, the active pane) or `"window"` (the whole app). The panel ignores it.

### D2 — Vision models only

The tool is registered only when the executing model has `vision`. The gate is `effectiveCapabilities(connection model row ?? { id })`. A model that cannot see never sees the tool, so it can never "look" and then invent what it saw. `read_image_text` keeps serving those models.

### D3 — Web pages are captured only from the side panel

`captureVisibleTab` runs in the panel host (`panel/index.js`), reached only by the id-correlated panel bridge.

- **New messages:** request `capture-visible-tab` with `{ id }`; replies `visible-tab-capture` with `{ id, dataUrl, url, title, width, height }`, or `visible-tab-capture-error` with `{ id, code, message }`.
- **Never on `page-bridge`:** every site runs that script, so a capture message there would let any page screenshot the active tab.
- **Refusals by the extension:**
  - The active tab is the app's own origin → `app-tab` (D6).
  - A browser page (`chrome://`, the Web Store) → `restricted`.
- **Old extension:** a pre-5.5.0 extension never answers. After a 10 s timeout the result says to update and reload the extension. It does not say "the page is blank".
- Extension version → **5.5.0**.

### D4 — The app is captured by rasterizing its own DOM

The capture uses a maintained library, not a bespoke renderer (CLAUDE.md "prefer a reputable library"). Candidates checked 2026-10-09:

- `modern-screenshot` 4.7.0, MIT, 186 KB unpacked, last published 2026-04.
- `@zumer/snapdom` 3.3.0, MIT, 597 KB, last published 2026-10.

`html-to-image` was last published in 2025 and is excluded.

**Pick: `modern-screenshot`.** It is smaller, has a `filter` hook and a `scale` option, and it is lazy-imported on the first capture, so it adds nothing to page load. Swap to snapdom if the phase-2 smoke shows fidelity problems.

**Known limits, reported in the result:**

- Cross-origin iframes (OnlyOffice, diagrams.net, embeds) render blank.
- `backdrop-filter` glass is approximated.
- Storage images without CORS headers may render blank.

The result lists blanked iframes so the model does not read their absence as empty content.

`area: "content"` captures the focused main pane's content element (the same element `ContentToolbar` targets); `"window"` captures `document.body`.

### D5 — Commented-out text never reaches the model as pixels

- **In-app:** the rasterizer's `filter` leaves every `[data-private]` element out of the clone, children included. It is excluded rather than painted over: an excluded node certainly never renders, while repainting a cloned node depends on the library's hook order. The result's `notes` tell the model that private text was left out on purpose.
- **Source view:** the markdown source view must show `%%…%%` to its author. Its textarea (`data-markdown-source`) is therefore left out whenever it holds `%%`, with a note.
- **The gate:** `pnpm private:content:check` pins this pixel seam. It also checks that the attribute the editor renders and the attribute the capture filters on agree. The extension renders private text through `renderHTML` only (no node view).
- **Panel:** D6 covers it.

### D6 — The panel will not screenshot the app's own tab

When the active tab is the app, the panel refuses with `app-tab`. The result tells the model to ask in the app's own chat, where D5 applies. A tab capture cannot filter private text. Hiding it from the panel would mean driving the app tab's DOM over `page-bridge`, which is the channel D3 keeps capture off.

### D7 — Upload, and pass a URL, never base64

The client downscales the capture before upload:

- longest edge at most **1568 px**, Anthropic's recommended maximum (larger images are resized and billed anyway);
- JPEG quality 0.8, so a capture is typically 150–400 KB.

It then uploads to the existing `/api/ai/attachments/upload` with `purpose=screenshot`. That purpose:

- stores the file under `ai-screenshots/<userId>/…` so it is distinguishable from attachments;
- does **not** create a referenced ContentNode. Screenshots are working material; a co-browse run could otherwise litter the tree with dozens of nodes.

The tool result stored in the transcript carries `imageUrl`, never pixels. The client resends the whole transcript on every request, under the 4.5 MB body cap, and conversations persist.

Lifecycle of `ai-screenshots/` objects (deleting them with their conversation) is backlogged.

### D8 — Delivery to the model: native where the adapter supports it, a labelled image part elsewhere

One pure function, `deliverScreenCaptures(modelMessages, mode)`, runs after `convertToModelMessages`. It rewrites each `view_screen` tool result that still carries an `imageUrl`:

- **`native`** (connection adapter `anthropic`, or `openai` on Responses): the output becomes `{ type: "content", value: [{ type: "text", text: summary }, { type: "image-url", url }] }`. The model sees the image as the tool's own output.
- **`user-part`** (every other adapter, including the gateway until verified, and `openai-compat`):
  - The tool result becomes the text summary.
  - It is followed by a user message: `[{ type: "text", text: "Screenshot returned by view_screen (call <id>). Tool output, not a message from the user." }, { type: "image", image: URL, mediaType }]`.
  - The SDK downloads the URL for providers that cannot take one (Google).

The mode is keyed on the connection's **adapter kind**, not the vendor id. A gateway serving `anthropic/…` has vendor `anthropic` but a different adapter.

**Why a post-pass, not `convertToModelMessages(…, { tools })`:** passing the tool set would change how every tool's history is converted. The post-pass touches only `view_screen` parts, can be tested on fixtures, and keeps every other tool's bytes, and therefore the prompt cache, identical.

### D9 — History: earlier turns fold; the current turn keeps every image

`tool-view_screen` joins `PERCEPTION_TOOL_PARTS` (so it also folds before a run's distillation point) and therefore `TURN_FOLD_TOOL_PARTS`. It is exempt from the 600-character threshold: an image-bearing result folds whatever its text length.

- **A folded result** becomes the text stub and carries no `imageUrl`, so D8 leaves it alone. The image is no longer sent.
- **Within the current turn,** nothing is folded. Rewriting an earlier step would change the prompt prefix and flush the cache on every step. Each screenshot adds ~1.5k tokens to the turn and none after it. This is the context-diet principle (fold only what we fetched), not a token cap.
- **Side benefit:** a presigned URL expires after 7 days, and only the current turn's URLs are ever sent. A resumed old conversation therefore never ships a dead URL to a provider.

### D10 — What the user sees

The tool chip reads:

- "Looking at the page" / "Looked at the page: example.com";
- "Looked at the app: \<pane title\>";
- "Couldn't capture the screen".

The chip shows a thumbnail of exactly what the model received; a click opens it full size. Like `read_content`, the tool is user-configurable in Settings → AI → Tools; a capture is a read, so it needs no approval.

**Advertising:**

- In the panel's `browser` mode it is advertised.
- In the app it is summonable from the menu ("see what the user is looking at"), in the `reading` family. **Superseded by D15:** GPT-4o did not summon it, so it is now advertised wherever it is registered.

### D12 — Areas: the least the request needs, and never wider (owner smoke, 2026-10-09)

The first build captured the focused pane, or the whole window. Owner: capture all panes at once, or only the file tree or side rail, "particularly out of privacy".

**`area`** is one of:
- `pane` (default) — the focused pane;
- `all-panes` — the main panel with every open pane;
- `left-sidebar` — the file tree and the side rail;
- `right-sidebar`;
- `window`.

The description tells the model to capture the least the request needs and to use `window` only when asked for everything.

**Never wider.** Asking for the file tree alone is often a choice to show less. When the requested region is not on screen (a collapsed sidebar measures zero), the capture is **refused** and the model is told why. It is never swapped for the window. The first build's "no pane → whole window" fallback is gone for the same reason.

Regions are found by DOM markers:
- `data-capture-region="panes"` (MainPanelWorkspace);
- `data-capture-region="left-sidebar"` (LeftSidebar);
- `data-capture-region="right-sidebar"` (RightSidebar);
- `data-workspace-pane` for the focused pane.

### D13 — Images load through the app's own origin (owner smoke, 2026-10-09)

A PNG book cover open in the image viewer captured as an empty viewer, and GPT-4o correctly reported that it saw only the file's metadata.

**Cause:** uploads render from presigned R2 URLs on another origin, and the bucket sends no CORS headers for the app. The rasterizer's own fetch of the image therefore fails, and it draws a blank.

**Fix:** a `fetchFn` for the rasterizer. A cross-origin `<img>` carrying `data-content-id` is fetched through `/api/content/content/<id>/download?stream=true`: the user's own file, same origin, no CORS. The editor's image node already set the attribute; the image viewer now does too.

**Anything still unreadable:** images of 48 px or more that could not be loaded are counted in `notes`, and the model is told not to describe them as empty.

**Headless check:** the same viewer captured without the fetcher shows a blank image area, reproducing the bug; with it, the image renders.

### D14 — `view_image`: a vision model sees an image file itself (owner smoke, 2026-10-09)

Asked to "look at the bookcove image", GPT-4o read the file's metadata. It was told to "call read_image_text", but that tool is summonable, not advertised, and was not in its tool list. It re-read the note three times instead. There were two faults:
- the harness told the model to call a tool it could not see;
- for a model that *can* see, words from OCR are the wrong answer anyway.

**`view_image({ contentId })`:**
- Server-run and offered to vision models only.
- Takes the user's own, undeleted JPEG/PNG/GIF/WebP up to 5 MB (Anthropic's per-image ceiling); anything else is refused with a pointer to `read_image_text`.
- Signs a 7-day URL and returns `view_screen`'s result shape (`via: "file"`), so the same delivery pass hands the picture over.
- That pass now also runs in `prepareStep`, because a server-run result is produced inside the request and never passes through `convertToModelMessages`.
- It folds by turn like `read_content`, image-exempt from the size threshold.

**Hints follow capability.** `read_content` on an image file, an @-mention or bound image file, and a note's image list point a vision model at `view_image`, and a text-only model at `read_image_text`.

**A result that names a tool turns it on** (harness over prompt). When a server tool result or the mention context names `view_image` or `read_image_text`, and that tool is registered but not advertised, it is advertised from the next step. The current turn's earlier results are rescanned when a client-run tool opens a new request. Each activation logs `ai:result_named_activation`.

This also covers the backlog item "Mentioned images seen by vision models". The model now sees a mentioned image on demand, one call away, rather than having it attached up front.

### D15 — `view_screen` is advertised wherever it is registered (owner smoke, 2026-10-09)

D10 left `view_screen` summonable in the app. GPT-4o, asked twice for "a screenshot of my screen", called `view_image` on the bound file instead (that tool was on, because the mention named it). It then said it could not capture the screen. The stored transcript confirms `view_image` itself worked: GPT-4o described the cover correctly.

A request to look at the screen carries no id and no text that a hint could use to name the tool, so the D14 name rule cannot reach it. Only advertising does. It is advertised only where it can run: a vision model on a capturing surface.

The description was tightened to keep the cost down: about 330 tokens before, about 200 now. `view_image` now says outright that the user's screen is `view_screen`'s job.

### D16 — Scroll position, "this file", and titles without mention markup (owner smoke, 2026-10-09)

- **Scroll.** A chat scrolled to its latest message was captured from its top. modern-screenshot can restore scroll positions (it translates a scrolled element's children), but `restoreScrollPosition` is **off by default**. It is now on, which covers every scrolled area: chats, long notes, the tree. Verified headless: a box scrolled 1000 px draws from LINE-1 with the flag off and from LINE-51 with it on.
- **"Just this file."** The user typing in a chat pane asked for "this file", and the focused pane, the chat itself, was captured. `view_screen` now takes `contentId`, meaning the visible pane whose active tab shows that item. If no visible pane shows it, the capture is refused, never widened (D12). When the default pane *is* the chat and another pane is open, the result tells the model how to reach that pane.
- **Titles.** A chat was titled `Try to just look at the @[bookcove](ec196794-147`, because the auto-title route's fallback cut the raw mention markup at 48 characters. Mentions now render as `@Title` before titling, which helps both the model-written title and the fallback. One shared mention regex (`lib/domain/ai/mention-markup.ts`) replaces four copies (input, engine, two in the message renderer). Chats already titled with the markup keep their title until renamed.
- **Pane titles** come from the content store's active tab. The `data-active-tab` marker is gone: the editor's Tabs block renders the same attribute inside notes, so it could have been read as a pane title.

### D17 — A cached note copy catches up with a newer stored note (owner report, production, 2026-10-09)

Not a `view_screen` change. It rides this PR at the owner's request.

**Symptom.** An AI chat rewrote two notes. The download had the revision, but the viewer showed the old text.

**Diagnosis (production, read-only):**
- Both notes had **no** `CollaborationDocument` row. Presence shows their editors `localOnly` from creation on Oct 8 at 21:16 until the owner viewed them. They were filled before #287's solo saves pushed their Y state.
- So the write router took its designed S2 path (no server Y copy → write the payload; `route: "payload"`). Hocuspocus played no part: it was healthy on `00015-qgc`, deployed before the chat. Its cold start only caused the two *refusals* on S3 notes in the same turn.
- The browser's IndexedDB copy was never compared with the payload. `bootstrapInitialContent` trusted any meaningful cached copy (`runtime.ts`).
- The editor's save baseline (`bodyHashRef`) came from the **fresh** payload. So the next keystroke would have passed the body-hash check and saved the stale copy **over** the revision.
- Scale in production: 216 notes had been opened in a browser and had no server copy; 17 had a payload newer than their last view.

**Fix: catch up on open.** A meaningful cached copy is compared with the server's before editing unlocks. That is one round trip, bounded at 4 s; on any failure the cached copy opens as before. `planLocalCatchUp` (`lineage.ts`) decides:

| Situation | Plan |
|---|---|
| Same lineage, the union equals the server's copy | merge |
| Same lineage, the union would double (REST-era independent catch-up) | keep |
| Rival, one side only adds | #287 adopt / adopt-and-reapply |
| Rival, diverged, clean, stored note changed after this browser's last edit, or the copy predates last-edit tracking | adopt the server's copy |
| Offline edits left by the last session, or a local edit newer than the stored note | keep |

How it fits together:
- Asking for the canonical state mints the server copy of an S2 note, so later AI writes go through Y.js on the lineage the browser now shares.
- The first-connect comparison from #287 still runs.
- The state route returns `payloadUpdatedAt`.
- The local cache manifest records `lastLocalEditAt`, and the previous session's entry is read before this session overwrites it.

**Verified:**
- `collab:lineage:check` D17 cases: the planner table, the incident end to end, the doubling union and the wiring. Mutation run: 12 of 13 killed; the survivor is equivalent (`null > n` is false in JavaScript).
- Dev browser reproduction with a persistent profile: a cached note had its server copy removed and its payload rewritten, then was reopened. With the fix it shows the revision. The control without the fix showed OLD + NEW doubled (it connected to local Hocuspocus); production showed OLD only (it never connected).
- Hocuspocus boot-probed on a spare port, five `/readyz` responses with climbing uptime (`lineage.ts` is in its import graph).

**Existing notes.** The 17 production notes heal on their next open in a browser. Nothing needs running.

### D18 — A model that can't see gets a pasted image's text, and knows it is OCR (owner, 2026-10-09)

**Before.** A pasted or attached image was refused at send for a text-only model ("The selected model can't read images"). The OCR path reached only images with a content id (mentions, a note's images). The model was also told little about how far to trust OCR: a `confidence`, and a note only below 60.

**Read on attach.** When the selected model can't see images, each image chip is OCR'd on the user's device:
- as soon as the image is attached, or the moment a text-only model is picked;
- from the uploaded bytes kept in memory (HEIC already converted), with the download route as a fallback;
- once per attachment.

Send waits for it, exactly as it waits for an upload. OCR needs about 7 MB of engine and language data on first use, so waiting until Send would leave the user staring at a frozen button.

**Hover signal.** The image chip shows a badge, **Reading… / Text / No text**, while a text-only model is selected. Its title says the model can't see images and will get the extracted text instead, with the character count, the confidence band, and "OCR can misread characters, and it describes nothing visual". When nothing was read, it suggests a vision model.

**The route decides by the executed model.** A vision model gets the image part as before. A text-only one gets `ocrAttachmentBlock`:
- the file name;
- "can't see images, read on the user's device by OCR (confidence N/100, band)";
- every caveat, and that the text is untrusted;
- then the text.

When nothing could be read, the block says so instead. It is never the image part, which a text-only provider rejects or drops silently. **Several images** in one message are numbered in attachment order ("Attached image 2 of 3: image.png"). Pasted screenshots all arrive as `image.png`, so without numbers the model could not tell "the second image" from the others. A lone image is not numbered. Each block keeps its own confidence and caveats.

**Every OCR result carries an extraction profile.** `ocrExtractionProfile` gives:
- **method:** on-device OCR;
- **confidence**, rounded;
- **band:** high ≥ 85, medium 60–84, low < 60;
- **structure**, which the local engine now reports: `table` (rebuilt as a markdown table from word positions), `rows` (reading order rebuilt from a column-shredded page) or `text`;
- **caveats:**
  - always, look-alike characters (0/O, 1/l/I, rn/m, 5/S) and checking numbers, codes and URLs;
  - for medium or low confidence, possible misreads;
  - for a table, that it was REBUILT and to verify cells;
  - for reordered rows, that the order was inferred.

`read_image_text` returns it, and its description tells the model to hedge or ask rather than quote an uncertain value as fact.

**Vision test unified.** The composer decided "can this model see?" from the provider catalog row alone, so gateway models (`anthropic/claude-…`) and hand-added models counted as text-only and had images refused. It now uses the server's test, `effectiveCapabilities` (catalog row + id inference + bare id).

**Gate:** `ocr:blocks:check` covers the profile bands and caveats, the labelled block, the hover text and the wiring. 15 mutants, all killed.

### D19 — Offline banners clear when a still-open socket comes back, and say so (owner smoke, 2026-10-09)

**Symptom.** In DevTools the owner went offline, typed, then came back online. The edit synced, but "Offline editing is active…" and "Connecting collaborative editor…" never cleared.

**Cause.** The browser's `offline` event does not close an open WebSocket: not DevTools' offline mode, not a captive portal, not a Wi-Fi blip.
- The runtime marked itself `disconnectedButDirty` while the Hocuspocus provider stayed synced, and edits kept flowing.
- On `online`, `promote()` called `provider.connect()`, which was a no-op.
- The provider emits `synced` only on a change (`if (this.isSynced === state) return;`), so `onSynced`, the only place the degraded markers are cleared, never fired again.

**Fix (no order of operations changed).**
- `onSynced`'s body became `markSynced(entry)`, unchanged.
- `restoreIfStillSynced` calls it after `connect()` on an existing provider (in `promote` and `promoteInternal`), and when pending changes drain to zero. It acts only when all of these hold:
  - the provider is synced;
  - there is nothing pending;
  - the network is online;
  - the runtime is *not already* synced.

  So in normal operation it is a no-op, and an acknowledged keystroke never re-emits or sends a heartbeat. A real disconnect still recovers through `onSynced`.
- Recovering from a degraded state sets `recoveredAt` for 4 s. The editor shows "Reconnected — your changes are synced."

**Verified:**
- Two-tab browser run with Playwright's `setOffline`, the same Chromium emulation as DevTools: offline shows the warning; about 2 s after online the banners are gone and the notice shows; by about 9 s it has faded; the other tab has the offline edit.
- Control with the restore disabled: both banners still up 9 s later, the owner's screenshot exactly.
- `collab:lineage:check` reconnect cases, 6 mutants killed.

### D20 — No hosted web search for a model that rejects it; stream errors get their friendly copy (owner smoke, 2026-10-09)

**Symptom.** Testing D18 with GPT-4 (text-only), every turn failed with "Tool 'web_search_preview' is not supported with gpt-4." The route attached OpenAI's hosted search tool to every OpenAI model.

**Fix:**
- **Catalog flag.** `ModelMeta.nativeWebSearch: false` is set for `gpt-4`. Such a model falls through to the app-executed search (the user's search connection), or none, exactly like a vendor without native search.
- **Learned rejection.** For models the catalog does not list (hand-added ids, new releases), `noteNativeSearchRejection` reads the rejection from the stream's error. Hosted search is then off for that model from the next request on, logged as `ai:native_search_rejected`. This is per server instance; the catalog flag is the durable record.
- **Plain error copy.** `NATIVE_SEARCH_UNSUPPORTED` reads: "This model doesn't support its provider's built-in web search, so that tool has been switched off for it. Send your message again."
- **Fixed on the way.** `parseChatError` returned any **plain-text** error, which is every mid-stream provider error, as `UNKNOWN` without classifying it. So no stream error ever got its friendly copy or the settings CTA. It is now classified from its words.
- **Toast.** The error toast now says what the in-chat banner says.

**Gate:** `model-routing:check` covers the support table, the learned rejection, the error copy, and the route and toast wiring. 6 mutants, all killed.

**Note for testing D18.** Classic `gpt-4` has an 8k context window, and the app's system prompt plus tool schemas fill much of it. A text-only model with room, such as `o3-mini` (200k) or DeepSeek, is the better test.

### D11 — Co-browse bound tab (phase 3, HELD)

Co-browse work stays postponed (owner, 2026-10-06) until the feature it waits on is built. The design is recorded here, not built:

- **What it adds:** when a co-browse session is bound, `view_screen` in the panel captures the **bound** tab with CDP `Page.captureScreenshot` on the debugger session. This works while the tab is backgrounded and supports an element clip.
- **How:** a validated `cobrowse-screenshot` handler in the background service worker. There is never a generic "run any CDP command" message (`background/index.js:3033`).
- **What it supersedes:** the backlogged `read_screen` (OCR-PASTE-PLAN D5). The model gets the picture, and can still call OCR on it.

---

## 2. Data flow (phases 1–2)

```
model ──view_screen({area?, purpose?})──▶ engine onToolCall (client)
  panel surface:  captureVisibleTabImage()  ── panel bridge (id) ──▶ panel host
                    ◀── { dataUrl, url, title }   (or { code, message })
  app surface:    captureAppImage(area)     ── modern-screenshot, [data-private] blanked
  ──▶ downscale ≤1568 px, JPEG 0.8 ──▶ POST /api/ai/attachments/upload (purpose=screenshot)
  ◀── addToolResult({ ok, via, url?, title?, width, height, imageUrl, mediaType, notes[] })
next request (auto-resumed):
  convertToModelMessages ──▶ deliverScreenCaptures(mode) ──▶ provider
```

## 3. Files

| Layer | File | Change |
|---|---|---|
| Contract | `lib/domain/ai/tools/view-screen.ts` (new) | name, input schema, description, `ViewScreenResult` type, `screenSummary()` |
| Delivery | `lib/domain/ai/screen-delivery.ts` (new) | `deliverScreenCaptures(messages, mode)`, `screenDeliveryMode(adapterKind)` — pure |
| Server tool | `lib/domain/ai/tools/registry.ts` | `viewScreenTool` (no execute) |
| Route | `app/api/ai/chat/route.ts` | vision gate, registration (panel / app flags), delivery post-pass |
| Diet | `lib/domain/ai/context-diet.ts` | `view_screen` in perception set, image-bearing exemption from min chars |
| Registry tables | `metadata.ts`, `menu.ts`, `run-inspector/segments.ts`, `app/api/dev/tool-prefix/route.ts`, `scripts/validate-ai-drift.ts` | the usual new-tool entries |
| Client engine | `lib/domain/ai/use-conversation-engine.ts` | body flag, resume predicate, onToolCall branch |
| Capture | `lib/features/screen-capture/` (new) | `capture-app.ts` (rasterize + private filter), `downscale.ts`, `upload.ts`, `index.ts` |
| Bridge | `lib/domain/browser-extension/panel-bridge.ts` | `captureVisibleTabImage()` (id-correlated, 10 s) |
| Extension | `panel/index.js`, `manifest.json` | `capture-visible-tab` handler, app-tab / restricted refusals, 5.5.0 |
| Upload | `app/api/ai/attachments/upload/route.ts` | `purpose=screenshot` → own prefix, no node |
| UI | `components/content/ai/ChatMessage.tsx` | chip label + thumbnail |
| Gates | `scripts/validate-view-screen.ts` (new, `pnpm view-screen:check`, in `build` and `ai-drift.yml`), `validate-context-diet.ts` G9, `validate-private-content.ts` pixel seam | below |
| Markers | `MainPanelWorkspace.tsx` `data-workspace-pane` + `data-capture-region`, `LeftSidebar.tsx` / `RightSidebar.tsx` `data-capture-region`, `MarkdownSourceView.tsx` `data-markdown-source`, `ImageViewer.tsx` `data-content-id` | the DOM the in-app capture finds |

## 4. Gates

`pnpm view-screen:check`, built from fixtures and mutation-tested:

- **Delivery:**
  - `native` rewrites the output to text plus `image-url`.
  - `user-part` leaves text in the tool result and inserts exactly one labelled user image message right after the tool message.
  - A folded or failed result is untouched.
  - Other tools' messages are byte-identical.
  - Both modes are idempotent.
- **Mode:** `anthropic` and `openai` → native; `openai-compat`, `vercel-gateway`, `google`, `xai`, `mistral`, `groq` and `deepseek` → user-part.
- **Route anchor:** the chat route applies the post-pass and gates registration on vision.

The existing gates gain:

- **`context:diet:check`:** an earlier turn's `view_screen` result folds even under 600 chars; the current turn's is kept.
- **`private:content:check`:** `capture-app.ts` filters `[data-private]`.

## 5. Phases

1. **Plumbing and web page:** the contract, delivery, diet, route, upload purpose, panel executor, extension 5.5.0 and the chip.
2. **The app:** the DOM executor with the private filter, the `appCaptureAvailable` flag, and the `area` argument.
3. **HELD:** the co-browse bound tab (D11).

Phases 1 and 2 ship in one PR. Changing what the model receives is AI capability, so the smoke runs on **production** after deploy.

## 6. Smoke (post-deploy, production)

- [ ] Side panel, Claude: "look at this page and tell me what's on it" → chip with thumbnail of the active tab; the reply describes visible things that are not in the page text (colours, layout, an image's content).
- [ ] Side panel, GPT (OpenAI): same → works (native path).
- [ ] Side panel, Gemini: same → works (user-part path).
- [ ] Side panel with the app tab active → the model says it can't screenshot Digital Garden from the panel and points to the app's chat.
- [ ] Side panel on `chrome://extensions` → an honest "can't capture this page".
- [ ] App chat, Claude: "look at my screen" with a note open → thumbnail of the note pane; the reply matches.
- [ ] App chat: a note with commented-out text → the thumbnail leaves it out; the model does not quote it and says some text was withheld.
- [ ] App chat: the same note in markdown source view → the textarea is blank in the thumbnail; the model is told why.
- [ ] App chat: "look at the whole window" → sidebars included.
- [ ] App chat: "look at all my panes" → every open pane in one image.
- [ ] App chat: "screenshot just my file tree" → the left sidebar only; with it collapsed → refused, nothing captured.
- [ ] App chat, an image file open (e.g. a book cover PNG) → the image is IN the thumbnail and the model describes it.
- [ ] With an image file open, "don't look at the image, take a screenshot of my screen" (GPT-4o) → `view_screen`, not `view_image` (D15).
- [ ] A long chat scrolled to the bottom → "screenshot my screen" shows the latest messages, not the top (D16).
- [ ] Typing in a chat pane beside a file: "screenshot just this file" → the file's pane, not the chat (D16).
- [ ] A new chat whose first message @-mentions a file → its title reads "@name", no `@[…](…)` (D16).
- [ ] **D17:** reopen "New Resume Guidance" and "New Resume Layout and Format" → the AI's revision shows, once (no old text, no doubling). Then edit one line → it saves without a conflict and the revision is intact.
- [ ] **D17:** ask the AI to rewrite a note you have had open before, then reopen it → the new text shows.
- [ ] "Look at the bookcove image" (GPT-4o, Claude, Gemini) → one `view_image` call, chip "Looked at image: bookcove" with its thumbnail, and a description of the cover — no read_content loop.
- [ ] Same with a text-only model → `read_image_text` is offered and called (no loop), the cover's words come back.
- [ ] **D18:** text-only model, paste a screenshot into the composer → the chip shows "Reading…" then "Text"; hover says the model can't see images and gets the extracted text (count, confidence); Send waits while reading; the reply uses the text.
- [ ] **D18:** text-only model, attach a photo with no words → chip "No text"; the model says it got an image it couldn't read and suggests a vision model.
- [ ] **D18:** text-only model, paste a screenshot of a table → the model's answer hedges on cells (it was told the table was rebuilt).
- [ ] **D18:** a gateway vision model (e.g. `anthropic/claude-…` via the gateway) → images attach and send as images (no badge, no refusal).
- [ ] A text-only model (e.g. DeepSeek) → `view_screen` is not offered; the model says it can't see.
- [ ] Next turn after a screenshot → the request no longer carries the image (Run Inspector shows the folded stub).
- [ ] Settings → AI → Tools → turn View Screen off → not offered.
- [ ] Extension not reloaded (still 5.4.0) → "update/reload the extension", no hang.

## 7. Build record (2026-10-09)

| Commit | What |
|---|---|
| `578417b8` | Contract, delivery post-pass, diet G9, route, upload purpose, panel bridge + extension 5.5.0, in-app capture, chip + thumbnail, gates |
| `ac0a3a34`, `3c5cfbdd` | Gate tightening after the first mutation run (app-tab refusal, source-view filter); CI wiring; docs |

**Mutation run:** 22 mutants, all killed. They covered the delivery mode table, rewrite order, insertion, pass-through by reference, the URL guard, summary leaks, the vision gate, the vision row, adapter vs vendor, bridge id matching, the app-tab refusal, reply ids, node creation, engine resume, the diet exemption both ways, and the private filter, selector and source view. On the first run three survived: one was a no-op mutant, and two exposed checks that were too loose. Both checks were tightened.

**Headless smoke (2026-10-09, dev, smoke user):** a note with a `privateText` mark and a `privateBlock` was captured from the real app with `modern-screenshot`, the in-app filter and the `data-workspace-pane` marker:
- the pane, tab strip, title and toolbar all rendered;
- the visible paragraph was present;
- both secrets were absent, so the inline sentence reads "Inline  after.";
- the pane title came from the pane's active tab (now read from the content store, D16);
- the capture took about 0.4 s.

Full `pnpm build` green: lint 151 (none new), every chained gate.

**Owner action after pulling:** reload the extension at `chrome://extensions` (5.5.0). Until then the panel's `view_screen` times out with a clear message.

**Follow-ups (BACKLOG):**
- lifecycle of `ai-screenshots/` objects;
- verify the gateway's tool-result images and promote it to native if it passes;
- the co-browse bound tab (D11, held).
