# Frontend Log Charter

**Phase:** 0 of [OBSERVABILITY-CLEANUP-PLAN.md](./OBSERVABILITY-CLEANUP-PLAN.md)
**Created:** 2026-05-15
**Status:** Ratified (locks the rules for Phase 5)

## Mission

Frontend logs serve **two audiences** with two distinct uses:

1. **Developers, in dev.** Reconstruct what a user did, what state the app was in, and what fired in response — fast enough that the next compile cycle can act on it.
2. **Ops, in production, for errors only.** Surface uncaught exceptions and error-boundary catches to the team without standing up a Sentry-grade pipeline. Everything below the error threshold stays in the user's browser console and is never transmitted.

The charter explicitly *excludes* product analytics. Tracking which features get used, which flows convert, or which users do what is a different system with different consent and retention rules. Logs are for debugging, not insight.

## Locked-in Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Mission | **Debug + production error reporting** | Pragmatic middle ground — actionable error visibility without a full client-side observability stack. |
| Prod transport | **Errors-only beacon to internal endpoint** | `logger.error` / `logger.fatal` POST to `/api/logs/client`; everything else stays in `console.*` (visible via DevTools, not transmitted). |
| Trace continuity | **Frontend originates trace_id, propagates via `x-trace-id`** | Page-load generates the trace; outgoing fetches carry it; server's `instrumentation.ts` reads the header instead of generating its own. One trace covers click → API → DB. |
| Event scope | **Errors + lifecycle + state transitions** | Diagnostic depth over noise reduction — we want to be able to reconstruct what the user saw and what state the store was in when something broke. |

## Server↔Frontend Integration Points

These commitments cross the boundary and shape Phase 2 (server) as well as Phase 5 (frontend):

1. **Frontend generates a `trace_id` on every full page load** (or hard navigation). Stored in a module-level value or a small Zustand slice. Stable for the lifetime of the page.
2. **Outgoing fetches automatically attach `x-trace-id: <trace_id>` header.** This is enforced by a thin `fetch` wrapper at [lib/core/logger/client-fetch.ts](lib/core/logger/client-fetch.ts) (Phase 5 deliverable) that every client-side API caller must use. ESLint rule warns on raw `fetch()` in client modules once the wrapper exists.
3. **Server's `instrumentation.ts` (Phase 2)** reads `x-trace-id` from the request header. If present, the request inherits it; otherwise a new ID is generated. This is *already* in the Phase 2 deliverable list — the charter just confirms it's required, not optional.
4. **Soft navigations (client-side Next.js router transitions) generate a new `trace_id`.** Each route is its own logical request from the user's POV. We don't try to carry one trace across `router.push` calls.
5. **The `/api/logs/client` beacon endpoint** (Phase 5 deliverable) ingests batched `LogEvent` records POST'd from the frontend. Server-side, it re-enters the same logger pipeline with `attrs: { source: "client" }` and a `client_trace_id` reference.

## Event Shape

**Identical to server** — `LogEvent` from [lib/core/logger/types.ts](lib/core/logger/types.ts) is the shared shape. The only differences:

- `layer` enum is the frontend-specific subset (see below).
- `attrs.source = "client"` is added by the beacon endpoint server-side.
- `payload_ref` works against `.local/debug-payloads/` only in dev — in prod, payloads are dropped (the beacon never accepts inline payload data).

## Frontend Layers

A separate closed enum from server's 13 layers — the runtimes are different, so the conceptual layers diverge:

| Layer | What lives here | Example events |
|---|---|---|
| `page` | Full-page load lifecycle (hard navigation, hydration, interactive) | `page:hydrated`, `page:interactive`, `page:visibility_changed` |
| `route` | Client-side route changes (App Router transitions) | `route:transition_started`, `route:transition_completed` |
| `ui` | Component lifecycle, user interactions, error boundaries | `ui:boundary_caught`, `ui:modal_opened`, `ui:command_invoked` |
| `editor` | TipTap client runtime, slash commands, save triggers | `editor:initialized`, `editor:autosave_triggered`, `editor:plugin_error` |
| `store` | Zustand store mutations (curated, see rules below) | `store:content_selected`, `store:panel_resized` |
| `fetch` | Outgoing API calls via the `client-fetch.ts` wrapper | `fetch:requested`, `fetch:resolved`, `fetch:failed` |
| `error` | Uncaught exceptions and unhandled rejections at the window level | `error:uncaught`, `error:unhandled_rejection` |

The 8 lifecycle markers from server (`_requested`, `_resolved`, `_started`, `_completed`, `_failed`, `_skipped`, `_retried`, `_promoted`/`_demoted`) apply unchanged.

### Store-layer curation rules

Zustand mutations fire constantly (panel resize drags can emit dozens per second). The `store` layer's discipline:

1. **No emit on continuous value changes** — drag/scroll/typing. These get a single `*_completed` event on settle.
2. **Emit on logical state transitions** — content selection changes, sidebar collapse/expand, edit mode toggles, theme switches.
3. **Never emit raw store snapshots.** `attrs` are scalar-only by type, same as server — `attrs: { panel: "left", width: 320 }`, never `attrs: { state: store }`.

### What never logs (anywhere on the frontend)

Mirrors the server forbidden list, with frontend additions:

- Full user records or session objects (browser holds these in memory; logging is gratuitous)
- Auth tokens, refresh tokens, API keys
- Cookies (`document.cookie` access in a log statement is a banned pattern)
- Full request/response bodies (the `fetch` layer logs metadata only: URL, status, duration)
- Raw editor state on every change (the editor's autosave is event-shaped; we log the event, never the document JSON)
- Raw Y.js doc state (it's binary anyway — there's no human-readable reason to log it)
- Large arrays or objects without summaries (`attrs: { count: 38 }`, never `attrs: { items: [...] }`)
- Personally-identifying form input values (typing into a "name" or "email" field is invisible to the logger)

## Production Beacon: `POST /api/logs/client`

### Request

```http
POST /api/logs/client
Content-Type: application/json
x-trace-id: <frontend's current trace_id>
Cookie: <session cookie, same as any authenticated API call>

{
  "events": [
    {
      "trace_id": "...",
      "span_id": "...",
      "ts": "2026-05-15T...",
      "level": "error",
      "layer": "ui",
      "event": "boundary:caught",
      "summary": "ContentEditor threw",
      "attrs": { "component": "MainPanelContent", "route": "/content/abc" },
      "error": { "name": "TypeError", "message": "..." }
    }
  ]
}
```

### Behavior

- **Batching:** the client buffers errors for up to 5 seconds or 25 events, whichever comes first. Flushes on `visibilitychange` → `hidden` and `beforeunload` via `navigator.sendBeacon`.
- **Level gate:** server-side, only `level: "error"` and `level: "fatal"` are accepted. Other levels are silently dropped (defense in depth — the client wrapper should never send them, but the endpoint refuses anyway).
- **Rate limit:** 100 events / session / minute. Excess is dropped with a `429` and a single server-side `logger.warn({ layer: "route", event: "client_beacon:rate_limited" })`.
- **Auth:** requires a valid session cookie. Unauthenticated logs are dropped (we don't ingest from non-users in this iteration; future revision could open a small anonymous bucket if needed).
- **Server-side ingestion:** events are re-emitted through the same `lib/core/logger/` pipeline with `attrs: { source: "client", client_trace_id: <event.trace_id> }`. The server's own `trace_id` for the beacon request itself is independent — it's the *transport* trace, not the *origin* trace.

## What's NOT in Scope (this charter)

- **Web vitals / Core Web Vitals.** Vercel Speed Insights handles this. We don't reimplement.
- **Performance marks / User Timing API.** Out of scope; the lifecycle markers in `page` are coarse enough.
- **Session replay.** Not now. Privacy-heavy; would require its own charter.
- **Product analytics.** Different system entirely. PostHog / Mixpanel / GA live elsewhere if needed.
- **Anonymous user logs.** The beacon requires auth. If we ever want signed-out error reporting, that's a charter revision.
- **Console interception.** The migration removes `console.*` from app code; we do *not* monkey-patch `window.console` to redirect to the logger. Third-party libraries that call `console.*` continue to do so — that's their stdout, not ours.

## Implications for the Main Plan

The charter creates two new commitments that ripple into other phases:

1. **Phase 2 (Vertical Slice)** — `instrumentation.ts` must read `x-trace-id` from the incoming request header. Previously listed as "optional, for later client continuity"; now **required** for the vertical slice to be charter-compliant when frontend lands.
2. **Phase 5 (Frontend Coverage)** — gains an explicit deliverable: `POST /api/logs/client` endpoint with the spec above. Estimate stays at 10-15h; the beacon is ~2h of that.

No other phases shift.

## References

- [OBSERVABILITY-CLEANUP-PLAN.md](./OBSERVABILITY-CLEANUP-PLAN.md) — parent plan
- [PII-AUDIT-2026-05.md](./PII-AUDIT-2026-05.md) — what server-side already does (the negative findings shaped this charter's forbidden list)
- Charter conversation: this session, 2026-05-15
