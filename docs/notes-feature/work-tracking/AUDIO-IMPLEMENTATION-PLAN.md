# Full Audio Implementation — Playback, TTS, Flashcard Pronunciation, Published Audio, Speech-to-Text

> Status: **Approved 2026-06-09**, not yet started. Execute in a dedicated session/branch.
> Companion to `FLASHCARDS-FSRS-PLAN.md`. Builds on the capability-based AI image providers
> shipped in PR #54 (the image subsystem is the template for the speech subsystem).

## Context

The app has solid audio **playback** in TipTap already (the merged `audioEmbed` block + a
standalone audio file viewer + autoplay-on-flip in flashcard review). What's missing is the
*generative* and *public* half: there's no text-to-speech, no flashcard term pronunciation, audio
doesn't render on **published** pages, and there's no speech-to-text. This plan builds all of it.

The image-generation subsystem (`lib/domain/ai/image/`) is an unusually exact template — TTS is
"the same architecture, different modality." The capability/connection/feature-routing/AI-tool
machinery hardened for image providers is generic and mostly reused as-is.

**Locked decisions (user):**
- Scope = **everything**: TTS subsystem + flashcard pronunciation + published-page audio + speech-to-text.
- TTS providers seeded in v1: **OpenAI + ElevenLabs + Google**.
- Flashcard audio serves **two purposes**: (a) **pronunciation** — TTS for a term (back/with-term, autoplay on flip); (b) **sound identification** — the audio is the front-side *prompt* (bird call, engine, instrument → "what is this?"), the answer on the back. Identification audio is **user-provided, never TTS** — the AI's role is to *listen and label*, not synthesize.
- Identification cards have **three creation paths**: manual upload, AI builds the card around user media, and AI *understands* the uploaded media (when the configured model accepts that input) and forms cards per the user's prompt.
- **AI-cards-from-uploaded-media is symmetric across modalities**: the user can upload **images** (AI uses `vision`) *or* **sounds** (AI uses `audio-input`) and have the AI form a card per item from a prompt (e.g. upload plant photos / bird calls → "make ID cards"). This is the **inverse** of the existing identification-IMAGE cards, which *generate* an image front (`image` output). Same flow, opposite direction — keep them distinct.
- Pronunciation creation = **both** a per-card 🔊 button *and* an AI propose-cards flow.
- Generation is **opt-in / never automatic** (the image-card lesson — don't auto-spend on history replay).
- Capability model mirrors the image side: `image`(out)↔`speech`(TTS out), `vision`(image in)↔`audio-input`(audio understanding in). `audio-input` ≠ `transcription` (the former classifies non-speech sound; the latter returns words of speech).

All work happens in the worktree `/Users/davidvalentine/Code/Digital-Garden/.claude/worktrees/ai-chat-polish`
(or a fresh branch off `main` once PR #54 merges).

---

## What already exists (do NOT rebuild)

- **`audioEmbed` TipTap node** — client `AudioEmbed`/`AudioPlayer`
  (`components/content/editor/AudioPlayer.tsx`) + `ServerAudioEmbed`
  (`lib/domain/editor/extensions/blocks/audio-embed.tsx`, `renderHTML` emits real `<audio controls>`).
  Registered in all four extension sets. Attrs: `src, filename, durationSeconds, mimeType, fileSize,
  autoplayOnFlip, showBackground`. Slash `/audio`.
- **Upload** via `POST /api/content/content/upload/simple` → `{ contentId, fileName, fileSize }`,
  R2 key `uploads/{userId}/...`. (AudioPlayer.tsx ~L83.)
- **Autoplay-on-flip** — `data-autoplay-on-flip="true"` queried by
  `extensions/flashcards/components/FlashcardReviewOverlay.tsx` (~L245) at a 600ms post-flip delay,
  scoped to the shown side.
- **Standalone audio viewer** — `components/content/viewer/AudioPlayer.tsx` (waveform, speed, loop)
  via `components/content/viewer/FileViewer.tsx`.
- **Image subsystem template** — `lib/domain/ai/image/{types,catalog,generate,generate-via-gateway,generate-and-store}.ts`,
  capabilities/registry/router, `generate_image` tool, `generate-card-images` endpoint, `ImageCardGenGate`.
- **AI SDK v6 speech APIs confirmed present** — `experimental_generateSpeech` (`ai/generate-speech`),
  `experimental_transcribe` (`ai/transcribe`); `@ai-sdk/openai` `.speech("tts-1"|"tts-1-hd")` and `.transcription(...)`.

---

## Phase 1 — Speech generation subsystem (`lib/domain/ai/speech/`)

Mirror `lib/domain/ai/image/` exactly.

- **`types.ts`** — `SpeechProviderId` (`"openai" | "elevenlabs" | "google"`), `SpeechModelId`,
  `SpeechVoice`, `SpeechGenRequest` (`{ text, providerId, modelId, voice?, format?, speed?, language?, apiKey?, ... }`),
  `SpeechGenResult` (`{ base64?/bytes, mimeType, durationSeconds?, providerId, modelId }`),
  `SpeechProviderMeta`/`SpeechModelMeta` (`{ voices[], languages[], supportsSpeed }`). Model the
  shapes on `lib/domain/ai/image/types.ts`.
- **`catalog.ts`** — `SPEECH_PROVIDER_CATALOG`: OpenAI (`tts-1`, `tts-1-hd`; voices alloy/echo/fable/nova/onyx/shimmer;
  formats mp3/opus/aac/flac/wav), ElevenLabs (`eleven_multilingual_v2` etc. + voiceId list), Google
  Cloud TTS (voices/languages). Mirror `lib/domain/ai/image/catalog.ts`.
- **`generate.ts`** (server-only) — `generateSpeech(req, userId)` + `dispatchToProvider` switch:
  - OpenAI → AI-SDK-native: `experimental_generateSpeech` from `ai` + `createOpenAI({apiKey}).speech(modelId)`. **Lowest effort.**
  - ElevenLabs → direct REST `POST /v1/text-to-speech/{voiceId}` (mirror image `generateFal`/`generateDeepAI` REST pattern).
  - Google → direct REST `texts:synthesize`.
  Normalize all to `SpeechGenResult` (audio bytes + mimeType).
- **`generate-via-gateway.ts`** — `generateSpeechViaGateway` (Vercel AI Gateway speech path where
  supported; mirror `lib/domain/ai/image/generate-via-gateway.ts`; fall back gracefully if a gateway model lacks speech).
- **`generate-and-store.ts`** — `generateAndStoreSpeech(input)` + `resolveSpeechGenRoute(userId, args)`.
  Reuse the **exact** storage→Prisma block from `lib/domain/ai/image/generate-and-store.ts` (R2 `uploadFile` →
  `prisma.contentNode.create` + `filePayload` with `mimeType: audio/mpeg`, `uploadStatus: "ready"`),
  returning `{ contentId, url, mimeType, durationSeconds, ... }`. `resolveSpeechGenRoute` reads
  `settings.ai.toolConfig.generate_speech.routeOverride` (same `{presetId, modelId}` shape, +`voice`/`language`).

**Capabilities + feature routing** (these unlock the settings UI for free):
- `lib/domain/ai/features/capabilities.ts`: add inference patterns to `inferCapabilities`
  (`/tts/i`, `/eleven/i`, `/-tts$/i`, `/wavenet|neural2|chirp/i`) → emit `"speech"`; add
  `transcribe`/`whisper`/`scribe` → `"transcription"` (Phase 5). Extend `CAPABILITY_ALIASES` if needed
  (`"text-to-speech"`→`"speech"`, `"tts"`→`"speech"`).
- `lib/domain/ai/features/registry.ts`: add `"speech"`, `"audio-input"`, and `"transcription"` to the
  `CapabilityFlag` union + `CAPABILITY_DISPLAY`; add a `FEATURE_REGISTRY` entry
  `{ id: "text-to-speech", requiredCapabilities: ["speech"], defaultSuggestion: { presetId: "openai", modelId: "tts-1" } }`.
  (`audio-input` is consumed by the chat/identification feature — see Phase 3 mode C — not a separate route in v1.)
  Add `audio-input` inference patterns for audio-understanding models (`/gpt-4o.*audio/i`, `/gemini.*(audio|flash|pro)/i`
  where the catalog marks audio) — prefer explicit `capabilities` from the connection over inference here, since
  "can this model hear?" is harder to infer from an id than "does this id generate images."
- `router.ts` (`resolveFeatureRoute`/`modelSatisfiesCapabilities`/`listCompatibleModels`) needs **no change** — generic.
- `components/settings/AIConnectionsPage.tsx` + `AIFeatureRoutingPage.tsx` auto-render the new capability badge +
  TTS feature row. (Verify the capability-filter chip list picks up "speech".)

---

## Phase 2 — `generate_speech` AI tool + settings

- `lib/domain/ai/tools/metadata.ts`: add `generate_speech` to `BASE_TOOL_IDS` + `BASE_TOOL_METADATA`
  (`callsAi: true, requiredCapabilities: ["speech"]`).
- `lib/domain/ai/tools/registry.ts`: add the `generate_speech` `tool({ inputSchema: z.object({ text, voice?, language?, ... }), execute })`
  wrapping `generateAndStoreSpeech`; return `JSON.stringify({ __audioPayload: true, contentId, url, ... })`.
- `components/content/ai/ChatMessage.tsx`: render `__audioPayload` as an inline player (reuse the viewer `AudioPlayer`).
  Mirror the existing `__imagePayload` branch.
- `toolConfig.generate_speech.routeOverride` persists the default provider/voice (same mechanism as image).

---

## Phase 3 — Flashcard audio: pronunciation + sound identification (no schema migration for audio)

Audio always attaches as an `audioEmbed` node **inside** the card's `frontContent`/`backContent` TipTap
JSON (exactly like `createImageFrontDoc`); the existing autoplay-on-flip plumbing plays it on reveal.
No `Flashcard` column added. Three modes share this storage shape:

**Shared helpers** — `lib/domain/flashcards/content.ts`: `createAudioFrontDoc(audioUrl, contentId, label, { autoplayOnFlip })`
(front = audio + optional caption — for identification the caption is empty so the answer isn't given away) and
`appendAudioToDoc(doc, ...)` (attach pronunciation to an existing term doc). Mirror `createImageFrontDoc`.

### Mode A — Pronunciation (TTS)
Term on front; spoken pronunciation attached (back/with-term), autoplay on flip.
- **Per-card 🔊 button** — `extensions/flashcards/components/AdaptiveFlashcardEditor.tsx` rich-mode toolbar
  (next to image button ~L176): "Generate pronunciation" → opt-in voice/language window →
  `POST /api/flashcards/generate-card-audio` → insert `audioEmbed`. Also offered in the review overlay for existing cards.
- **AI propose flow** — `lib/domain/ai/tools/flashcard-tools.ts` `propose_pronunciation_cards` (DRAFTS:
  `pendingAudioGen, term, language`; `PRONUNCIATION_CARD_LIMIT` cap) → **new** `POST /api/flashcards/generate-card-audio/route.ts`
  (clone `generate-card-images/route.ts`: resolve connection by `connectionId`, call `generateAndStoreSpeech`, fail-soft, capped)
  → **new** `components/content/ai/AudioCardGenGate.tsx` (clone `ImageCardGenGate.tsx`: opt-in click → voice/provider window →
  capability-discovered `speech` connections → generate), wired into `FlashcardCardProposalList.tsx` like the image gate.
- **Voice/language default** — `settings.ai.toolConfig.generate_speech` (voice, language) + per-request override.
  *Optional* small migration `FlashcardDeck.ttsLanguage`/`ttsVoice` for per-deck defaults (the **only** migration
  in the plan; deferrable).

### Mode B — Manual identification upload (no AI, no TTS)
The audio *is* the front prompt (bird call, engine); the user provides it.
- Reuse the existing `audioEmbed` inline upload **inside the card front** via the editor's audio insert
  (`AdaptiveFlashcardEditor` rich mode → `/audio` / insert-audio → `upload/simple`). User types the answer on the back.
- Set `autoplayOnFlip: true` on the **front** clip so the sound plays when the card is shown. **Verify** the
  `FlashcardReviewOverlay` autoplay effect fires on initial *front* reveal, not only on flip-to-back — if it
  only fires on `shownSide` change, add a front-show trigger. This is the one new wrinkle in the review overlay.

### Mode C — AI cards from uploaded media (image via `vision`, audio via `audio-input`)
User uploads a batch of **images and/or sounds**; an input-capable model **examines them** and forms a card
per item from the user's prompt (front = the uploaded media, back = AI's answer/label + optional detail).
This is the **inverse** of the identification-IMAGE cards — the AI *consumes* media input here, it does NOT
generate it. One unified flow, capability chosen by media type: `vision` (image/*) | `audio-input` (audio/*).
- **New** `propose_cards_from_media` (chat) and/or a multi-select **"Make flashcards from these"** action on
  uploaded `image/*`/`audio/*` files in `components/content/context-menu/file-tree-actions.tsx`, prompting for the
  user's instruction. DRAFTS reference the uploaded `contentId`s (media already stored — no generation step for the media itself).
- **New** `POST /api/flashcards/cards-from-media/route.ts`: for each `contentId`, download the file (existing
  `/download` URL), send as a **multimodal input part** to `generateObject` (AI SDK v6: `{ type: "file", mediaType, data }`)
  with the user's prompt and the resolved input-capable model → returns `{ label/answer, detail }[]` → build front
  via `createImageFrontDoc` (images) / `createAudioFrontDoc` (audio, autoplayOnFlip, empty caption), back = answer.
  Branch the required capability on `mediaType` (`image/*`→`vision`, `audio/*`→`audio-input`); a mixed batch needs a
  model with both. Opt-in gate, fail-soft, capped — reuse `AudioCardGenGate` generalized to a capability-filtered
  media-card gate (or a thin `MediaCardGenGate`).
- Commit via existing `POST /api/flashcards` (media rides inside `frontContent`).

All modes commit through the existing `POST /api/flashcards`; media always rides inside the TipTap doc — no new column.

---

## Phase 4 — Audio on published pages

The editor `audioEmbed` already serializes `<audio controls>` via `ServerAudioEmbed.renderHTML`; the
gap is the **public render path** doesn't include it.

- **Primary (low-risk):** register `ServerAudioEmbed` in the public/publishing render extension set
  (the one `components/public/TipTapContent.tsx` uses — mirror how `callout`/other editor blocks render publicly).
  Add light `.public-prose .block-audio-embed` CSS (+ `.dark` companion per the dark-mode-first rule). Native
  `<audio controls>` gives playback; no client JS needed.
- **Optional publishing-native block:** only if authoring audio *in the publishing surface* is wanted, add
  `extensions/publishing/blocks/audio.ts` following the `hero-image.ts` contract (`createBlockSchema` +
  `registerBlock({ type: "audio", ... })`, both `<Audio>`/`ServerAudio` exports, listed in
  `extensions/publishing/server-runtime.ts`) — must pass `pnpm publishing:schema:check` + the visual gate.
- Run `pnpm collab:schema:check` if any new Node/Mark is added.

---

## Phase 5 — Speech-to-text (transcription)

- **`lib/domain/ai/transcribe/`** — `transcribeAudio(input)` using `experimental_transcribe` from `ai`
  + `createOpenAI({apiKey}).transcription("whisper-1" | "gpt-4o-transcribe")`. (Seed OpenAI in v1;
  Google/ElevenLabs Scribe as follow-ups.) Add `"transcription"` capability (Phase 1) + a
  `{ id: "speech-to-text", requiredCapabilities: ["transcription"] }` feature.
- **Entry points:**
  1. **Transcribe an uploaded audio file** — context-menu action on an `audio/*` FilePayload node in
     `file-tree-actions.tsx` → `POST /api/ai/transcribe` → create a sibling note with the transcript
     (and/or write `FilePayload.searchText`). Reuses all file infra.
  2. **Dictation (secondary/optional)** — a mic button in the editor using `MediaRecorder` → upload →
     `POST /api/ai/transcribe` → insert text at cursor.
- **New** `POST /api/ai/transcribe/route.ts` — resolve the `speech-to-text` route, download the audio
  (existing `/download` URL), call `transcribeAudio`, return `{ text, segments?, language? }`.

---

## Critical files (reuse map)

| New (clone of) | Template |
| --- | --- |
| `lib/domain/ai/speech/*` | `lib/domain/ai/image/*` |
| `app/api/flashcards/generate-card-audio/route.ts` (Mode A, TTS) | `app/api/flashcards/generate-card-images/route.ts` |
| `app/api/flashcards/cards-from-media/route.ts` (Mode C — image via `vision` / audio via `audio-input`) | `generate-card-images/route.ts` + AI SDK `generateObject` multimodal input |
| `components/content/ai/AudioCardGenGate.tsx` (+ generalized `MediaCardGenGate`) | `components/content/ai/ImageCardGenGate.tsx` |
| `lib/domain/ai/transcribe/*` | (new; uses AI SDK `experimental_transcribe`) |
| `extensions/publishing/blocks/audio.ts` (optional) | `extensions/publishing/blocks/hero-image.ts` |

Edited in place: `features/capabilities.ts`, `features/registry.ts`, `tools/metadata.ts`, `tools/registry.ts`,
`flashcards/content.ts`, `flashcard-tools.ts`, `FlashcardCardProposalList.tsx`, `AdaptiveFlashcardEditor.tsx`,
`ChatMessage.tsx`, `components/public/TipTapContent.tsx` (+ its server-extension set), `globals.css`.

## Conventions / constraints
- No `any`; client components never import Prisma (speech catalog/types stay client-safe; generate/store stay server-only).
- lucide-react only in client components; `cn()` + Liquid Glass tokens for styling; dark-mode-first CSS for any public audio styles.
- **Opt-in generation everywhere** (per the image-card lesson): no auto-spend on history replay; explicit click → provider/voice window → generate.
- Reuse the capability-keyed discovery (a model is usable if its `effectiveCapabilities` includes `"speech"`/`"transcription"`),
  not a hardcoded provider list — so any speech model a user adds via Connections works.

## Verification (per phase, from the worktree)
- Gates: `pnpm typecheck` → `pnpm lint` (≤175 ratchet) → `NODE_OPTIONS='--max-old-space-size=8192' pnpm build`
  (+ `pnpm collab:schema:check` / `pnpm publishing:schema:check` if blocks change). Build uses Turbopack.
- Dev server on a free port (e.g. `pnpm exec next dev --port 3017`); verify `ps` for the right cwd/port before testing.
- **P1/P2:** add an OpenAI/ElevenLabs/Google speech connection in Settings → AI Connections; confirm the model
  shows a **Speech** badge + appears under the new Text-to-Speech feature route; run `generate_speech` from chat → inline player plays.
- **P3 (Mode A):** per-card 🔊 → opt-in window → pronunciation embeds + autoplays on flip; AI `propose_pronunciation_cards`
  → opt-in gate → generate → commit; reload an old chat → **nothing** auto-generates.
- **P3 (Mode B):** insert audio on a card **front**, upload a bird-call clip, type the answer → in review the front clip
  autoplays on show, flip reveals the answer.
- **P3 (Mode C):** upload several **sound files** → "Make flashcards from these" + prompt → opt-in gate → AI labels each
  clip → cards (front = clip, back = AI label) → commit. Repeat with **images** (e.g. plant photos) → AI forms cards per
  the prompt (front = uploaded image, back = AI answer). Confirm a `vision` model is used for images and an `audio-input`
  model for audio.
- **P4:** publish a note containing an audio block → audio plays on the public page (light + dark).
- **P5:** right-click an uploaded audio file → Transcribe → transcript note created.

## Suggested commits
1. P1 speech subsystem + capability/feature wiring  2. P2 generate_speech tool + chat render
3. P3 flashcard pronunciation (button + AI flow + endpoint + gate)  4. P4 published audio
5. P5 transcription + entry points. Each independently shippable.
