---
sprint: 42
epoch: 10 (AI TipTap)
duration: 1 session
branch: epoch-10/sprint-38
status: complete
---

# Sprint 42: AI Image Generation

## Sprint Goal
Multi-provider AI image generation with chat integration, document insertion, and drag-and-drop.

**Status**: ✅ Complete

## Success Criteria
- [x] `pnpm build` passes
- [x] 8 image generation providers configured with unified interface
- [x] `generate_image` tool available in chat (both ChatPanel and ChatViewer)
- [x] Generated images rendered in chat with AI badge and prompt info
- [x] "Insert into document" button inserts at cursor position
- [x] Drag-and-drop from chat image to TipTap editor
- [x] Generated images stored as referenced FilePayload content nodes
- [x] Image provider catalog with model metadata

## Work Items

### Image Generation Infrastructure (~6pts)
- [x] **IG-042-001**: Image generation types (2 pts) ✅
  - `ImageProviderId` union type (8 providers)
  - `ImageModelId` union type (12 models)
  - `ImageGenRequest` / `ImageGenResult` interfaces
  - `ImageSize`, `ImageModelMeta`, `ImageProviderMeta` types
  - **File**: `lib/domain/ai/image/types.ts` (new)

- [x] **IG-042-002**: Image provider catalog (1 pt) ✅
  - Static metadata for all 8 providers with model info
  - Supported sizes, quality/style flags per model
  - `getImageProviderMeta()`, `getImageModelMeta()` lookup helpers
  - **File**: `lib/domain/ai/image/catalog.ts` (new)

- [x] **IG-042-003**: Multi-provider generation engine (3 pts) ✅
  - `generateImage()` main entry point with BYOK key resolution
  - Provider dispatch: OpenAI, Google, DeepAI, fal.ai, Together, Fireworks, RunwayML, Artbreeder
  - Each provider's unique REST API normalized into `ImageGenResult`
  - Environment variable fallbacks for all 8 providers
  - RunwayML async task polling (30 attempts × 2s)
  - **File**: `lib/domain/ai/image/generate.ts` (new)

### API + Tool Integration (~4pts)
- [x] **IG-042-004**: Image generation API route (2 pts) ✅
  - `POST /api/ai/image` — standalone endpoint
  - Full pipeline: generate → download/decode → upload to storage → create ContentNode
  - Returns contentId, URL, prompt, dimensions, provider info
  - **File**: `app/api/ai/image/route.ts` (new)

- [x] **IG-042-005**: `generate_image` chat tool (2 pts) ✅
  - Added to base tools (works in both chat surfaces)
  - LLM can specify provider, model, size, quality, style
  - Defaults to DALL·E 3 when provider not specified
  - Returns `__imagePayload` JSON for client-side rendering
  - Auto-uploads to storage, creates referenced FilePayload
  - Tool metadata registered in `metadata.ts`
  - System prompt updated with image generation instructions
  - Step count bumped from 3 to 5 for base chat
  - **Files**: `lib/domain/ai/tools/registry.ts`, `lib/domain/ai/tools/metadata.ts`, `app/api/ai/chat/route.ts`

### Chat UI Integration (~3pts)
- [x] **IG-042-006**: GeneratedImageCard component (2 pts) ✅
  - Detects `__imagePayload` in tool results
  - Renders image with AI badge, prompt summary, provider/model badge
  - "Insert into document" button (blue → green transition)
  - Drag handle overlay on hover
  - Dimensions display when available
  - **File**: `components/content/ai/ChatMessage.tsx`

- [x] **IG-042-007**: Insert + drag-and-drop (1 pt) ✅
  - `insert-ai-image` CustomEvent → MarkdownEditor listener at cursor
  - `application/x-dg-ai-image` data transfer type for structured drag data
  - Drop handler in MarkdownEditor accepts AI image drags
  - `text/uri-list` fallback for basic drag compatibility
  - **File**: `components/content/editor/MarkdownEditor.tsx`

### Infrastructure Updates (~1pt)
- [x] **IG-042-008**: Barrel exports + capability type (1 pt) ✅
  - AI barrel export extended with image types and catalog
  - `ModelCapability` type extended with `"image-generation"`
  - **Files**: `lib/domain/ai/index.ts`, `lib/domain/ai/providers/types.ts`

## Estimated Points: ~14 pts

## Technical Notes

### Provider API Diversity
Each image provider has a completely different REST API. OpenAI returns `{ data: [{ url }] }`, DeepAI returns `{ output_url }`, fal.ai returns `{ images: [{ url }] }`, Fireworks returns raw bytes. The `dispatchToProvider()` function normalizes all of these into a consistent `ImageGenResult` shape.

### Tool-as-Internal-Client Pattern
The `generate_image` tool doesn't call the `/api/ai/image` endpoint — it calls `generateImage()` directly since it's already server-side. This avoids unnecessary HTTP round-trips while keeping the standalone API route available for future use cases (batch generation, direct UI calls).

### CustomEvent Bridge (Same Pattern as Sprint 41)
Image insertion uses the same cross-component communication pattern as chat outline click-to-scroll. The ChatMessage dispatches `insert-ai-image`, the MarkdownEditor listens for it. No prop drilling, no shared state — just a DOM event bus.

### Drag-and-Drop Compatibility
The drag sets three data transfer types: `application/x-dg-ai-image` (structured JSON with contentId), `text/uri-list` (for standard drop targets), and `text/plain` (fallback). The MarkdownEditor's drop handler checks for the structured type first, falling back to file drops.

## Files Changed

| File | Action |
|------|--------|
| `lib/domain/ai/image/types.ts` | **New** — Image generation type definitions |
| `lib/domain/ai/image/catalog.ts` | **New** — Provider catalog with model metadata |
| `lib/domain/ai/image/generate.ts` | **New** — Multi-provider generation engine |
| `lib/domain/ai/image/index.ts` | **New** — Barrel export |
| `app/api/ai/image/route.ts` | **New** — Image generation API route |
| `lib/domain/ai/tools/registry.ts` | Added `generate_image` tool |
| `lib/domain/ai/tools/metadata.ts` | Added tool metadata entry |
| `components/content/ai/ChatMessage.tsx` | GeneratedImageCard + image payload detection |
| `components/content/editor/MarkdownEditor.tsx` | AI image insert listener + D&D handler |
| `lib/domain/ai/index.ts` | Extended barrel with image exports |
| `lib/domain/ai/providers/types.ts` | Added `image-generation` capability |
| `app/api/ai/chat/route.ts` | Updated system prompt + step count |

---

## Previous Sprint: Sprint 41 (✅ Complete)

Key deliverables:
- Chat outline extractor with compact/expanded modes
- ChatOutlinePanel with role-based icons
- Real-time outline sync in ChatViewer
- Click-to-scroll with gold flash animation

## Previous Sprint: Sprint 40 (✅ Complete)

Key deliverables:
- `aiHighlight` ProseMirror Mark with indigo CSS tint
- Orchestrator auto-marking of AI-inserted content
- `insert_image` tool (9th editor tool)
- AI badge on image bubble menu
- "Show AI Content Highlights" settings toggle

---

**Last Updated**: Mar 13, 2026
