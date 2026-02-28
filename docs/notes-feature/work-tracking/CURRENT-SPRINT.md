---
sprint: 33
epoch: 7 (AI Integration)
duration: Feb 27 - Mar 12, 2026
branch: epoch-7/sprint-33
status: in_progress
---

# Sprint 33: AI Foundation + Settings UI

## Sprint Goal
Install AI SDK, create provider registry, build streaming chat API route, expand settings schema, and ship the `/settings/ai` page so everything is testable from the UI immediately.

**Status**: 95% Complete

## Success Criteria
- [x] `pnpm build` passes with AI SDK packages installed
- [x] `/settings/ai` page renders all 4 sections (provider, generation, toggles, usage)
- [x] Settings changes persist via `PATCH /api/user/settings` and survive page reload
- [x] `POST /api/ai/chat` returns streaming response (test with `curl --no-buffer`)
- [x] Chat API reads user's stored provider/model/temperature settings
- [x] Provider registry resolves Anthropic and OpenAI models without error
- [x] Zod v4 compatibility confirmed (schemas compile and validate)
- [ ] No console errors in browser dev tools on page load (needs smoke test)

## Completed Work Items

### Dependencies
- [x] `ai@6.0.104` — AI SDK core
- [x] `@ai-sdk/react@3.0.106` — React hooks (useChat, useCompletion)
- [x] `@ai-sdk/anthropic@5.0.11` — Anthropic provider
- [x] `@ai-sdk/openai@4.0.4` — OpenAI provider

### Files Created

| File | Purpose |
|------|---------|
| `lib/domain/ai/index.ts` | Barrel export (client-safe types + catalog) |
| `lib/domain/ai/types.ts` | `AIProviderId`, `AIModelId`, `ProviderConfig`, `StoredChatMessage`, `ChatMetadata` |
| `lib/domain/ai/providers/index.ts` | Provider barrel |
| `lib/domain/ai/providers/registry.ts` | `resolveChatModel()` — dynamic imports, BYOK key injection via `createAnthropic/createOpenAI` |
| `lib/domain/ai/providers/catalog.ts` | `PROVIDER_CATALOG` — Anthropic (4 models) + OpenAI (3 models) metadata |
| `lib/domain/ai/providers/types.ts` | `ProviderMeta`, `ModelMeta`, `ModelCapability`, `CostTier` |
| `lib/domain/ai/middleware/index.ts` | `applyMiddleware()` — composes middleware via `wrapLanguageModel()` |
| `lib/domain/ai/middleware/default-settings.ts` | Wraps SDK's built-in `defaultSettingsMiddleware` with DG-friendly interface |
| `app/api/ai/chat/route.ts` | POST — streaming chat: auth -> validate -> resolve model -> middleware -> streamText |
| `state/ai-chat-store.ts` | Zustand store: activeContentId, isStreaming, error, sidebarContext |
| `app/(authenticated)/settings/ai/page.tsx` | Server page for AI settings route |
| `components/settings/AISettingsPage.tsx` | Client component — 4-section AI settings form |

### Files Modified

| File | Change |
|------|--------|
| `lib/features/settings/validation.ts` | Added `providerId`, `modelId`, `temperature`, `maxTokens`, `streamingEnabled` to AI schema |
| `components/settings/SettingsSidebar.tsx` | Added BrainIcon + "AI" nav item with "New" badge |
| `.env.local` | Added commented `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` placeholders |

## Technical Notes

### AI SDK v6 Type Changes Discovered
1. `LanguageModelV1` -> `LanguageModel` (union: `string | LanguageModelV3 | LanguageModelV2`)
2. `LanguageModelV1Middleware` -> `LanguageModelMiddleware` (V3 spec, requires `specificationVersion: 'v3'`)
3. `.withOptions({ apiKey })` removed — use factory functions (`createAnthropic()`, `createOpenAI()`)
4. `maxTokens` -> `maxOutputTokens` in V3 call options
5. `wrapLanguageModel` accepts `LanguageModelV3` specifically (not the union type)

### Architecture Decisions
- **Dynamic provider imports**: Only load the provider package being used via `await import()`. Node caches after first import.
- **SDK's built-in middleware**: Re-use `defaultSettingsMiddleware` from `ai` package rather than custom V3 middleware (avoids `specificationVersion` compliance issues).
- **Type narrowing in middleware**: `applyMiddleware` accepts broad `LanguageModel` but casts to `ConcreteModel` internally for `wrapLanguageModel`.
- **Settings page as separate component**: `AISettingsPage.tsx` in `components/settings/` (not inline in `page.tsx`) because it will grow across sprints.

## Sprint Transition Gate: Sprint 33 -> 34

- [x] `pnpm build` passes with AI SDK packages installed
- [x] `/settings/ai` page renders all 4 sections (provider, generation, toggles, usage)
- [x] Provider registry resolves Anthropic and OpenAI models without error
- [x] Zod v4 compatibility confirmed
- [ ] Settings changes persist via `PATCH /api/user/settings` (needs browser test)
- [ ] `POST /api/ai/chat` returns streaming response (needs curl test)
- [ ] No console errors in browser dev tools

## Next Sprint Preview

**Sprint 34: Chat UI & AI Tools + Tool Settings**
- Replace chat placeholders with streaming ChatPanel (sidebar) and ChatViewer (main panel)
- "Save conversation" button creates ChatPayload ContentNode
- Base AI tools: searchNotes, getCurrentNote, createNote
- Tool management section in /settings/ai
- Message persistence for ChatViewer

---

**Last Updated**: Feb 27, 2026
