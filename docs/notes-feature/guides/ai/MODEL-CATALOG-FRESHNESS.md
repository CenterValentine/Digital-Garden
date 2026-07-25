# Model Catalog Freshness (catalog-drift safety net)

**Problem it solves.** Providers rename and retire model ids (DeepSeek's
`deepseek-chat` → `deepseek-v4-*`, for example). A saved model id that the
provider no longer accepts produces a hard chat error mid-run — and, with AI
3.4 model routing, a playbook can land on such a model without the user having
hand-picked it. This system makes drift **visible and self-healing** instead of
a surprise.

## The model (as of 2026-07)

- **The provider's model registry is authoritative.** Each connection stores a
  `models: ConnectionModel[]` list. The connection templates
  (`lib/features/ai-connections/templates.ts`) ship a small **seed** list so a
  fresh connection works before its first fetch — but seeds are best-effort and
  go stale. "Fetch from API" is the source of truth.
- **`ConnectionModel.unsupported`** (`lib/features/ai-connections/types.ts`) —
  set when reconciliation finds a saved model the provider no longer lists. The
  model is **frozen, not deleted** (so existing feature routes don't silently
  vanish), and flagged with danger affordances everywhere.

## The loop

1. **Fetch reconciliation** (`AIConnectionsPage.tsx` `fetchModels`). After a
   successful "Fetch from API", every saved model is diffed against the live
   list: a saved id absent upstream gets `unsupported: true`; a previously
   flagged id that reappears is un-flagged. A count of newly-flagged models
   drives an amber warning banner.
2. **Danger affordances.**
   - Settings connection model list: flagged rows render red with "No longer
     recognized by this provider…".
   - Providers without a model-list API (`supportsModelFetch` false) show a
     **permanent** warning that the list must be kept current by hand.
   - Feature Routing dropdown (`AIFeatureRoutingPage.tsx`) and the model class
     matcher (`model-route-resolver.ts`) **exclude** flagged models, so routing
     can never select one.
   - The router's `modelSatisfiesCapabilities` (`features/router.ts`) treats a
     flagged model as not satisfying any feature — role/default/auto-bind all
     skip it.
3. **Chat error guidance.** If a retired id still reaches the provider (e.g. a
   pinned pick, or a connection that hasn't been re-fetched), the provider's
   "supported API model names are …" error is classified as **`MODEL_RETIRED`**
   (`chat-errors.ts`) with copy that sends the user to "Fetch from API" to flag
   the outdated models, plus a Settings CTA.

## Deferred — registry-authoritative population (BACKLOG.md, 2026-07-25)

The end state (owner direction): stop shipping model lists in templates at all.
On connection **install**, auto-fetch to populate models from the registry;
templates carry only provider metadata (endpoint, adapter, key hint). The only
locally-maintained data would be **model categories** (realtime/audio/image/…)
via a **monthly category cron**, since capability/category classification isn't
always in the provider's `/models` payload. Both are backlogged; this safety net
stands on its own in the meantime.
