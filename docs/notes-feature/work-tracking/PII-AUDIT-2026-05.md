# Server-Side Console PII Audit — 2026-05-15

**Phase:** 0 of [OBSERVABILITY-CLEANUP-PLAN.md](./OBSERVABILITY-CLEANUP-PLAN.md)
**Scope:** server-side `console.*` calls under `app/api/` and `lib/` (excluding `lib/database/generated/`)
**Methodology:** 5 regex patterns against `*.ts`/`*.tsx`, plus broad cross-checks for positional-argument leaks
**Outcome:** **1 severity-2 finding, 4 severity-3 findings, 0 severity-1.** Phase 3.1 is small.

## Summary

| Metric | Count |
|---|---|
| Total files with `console.*` (server-side) | 121 |
| Total `console.*` call sites (app + lib) | 307 |
| Severity-1 (must-fix-now, before any other work) | **0** |
| Severity-2 (fix in Phase 3.1) | **1** |
| Severity-3 (fix in normal layer sweep) | **4** |

## Severity Definitions

| Severity | Meaning | Disposition |
|---|---|---|
| **1** | Active PII leak shipping today — full user records, raw tokens, full payload bodies | Strip the dangerous field *immediately*, before Phase 1 ships. Logger migration finishes the site later. |
| **2** | PII-adjacent — identifiers (UUIDs, file names with possible user content), document metadata that *could* leak with the wrong code change | Fix in Phase 3.1 as part of the priority pass. Hash or summarize the identifier. |
| **3** | Internals leakage (stack traces, external API error envelopes) — not PII but should not ship to prod stdout. | Fix during the layer's normal sweep in Phase 3.2–3.7. No special priority needed. |

## Findings

### Severity 2 (1 site)

| File:Line | Pattern | Why this severity |
|---|---|---|
| [app/api/content/export/vault/route.ts:39](../../app/api/content/export/vault/route.ts#L39) | `console.log(\`[Export] Starting vault export for user ${session.user.id}, format: ${format}\`)` | UUID is PII-adjacent — joinable to user records in the DB. Severity-2 because (a) it's a *deliberate* log of identity, not an accidental field, and (b) it would be easy for someone editing this code to extend the template to `session.user.email`. |

**Phase 3.1 remediation:** replace with `logger.info({ event: "export:vault:started", attrs: { format }, summary: "vault export" })`. The active span's `auth:session:resolved` parent already carries `user_id_hash` — no need to repeat it here.

### Severity 3 (4 sites)

| File:Line | Pattern | Disposition |
|---|---|---|
| [app/api/onlyoffice/callback/route.ts:122](../../app/api/onlyoffice/callback/route.ts#L122) | Logs `{ size, originalSize }` of downloaded document | Size metadata is not PII, but should go through `logger.info({ event: "external:onlyoffice:downloaded", attrs: { size, original_size } })`. Phase 3.4 (external layer). |
| [app/api/content/content/create-document/route.ts:348](../../app/api/content/content/create-document/route.ts#L348) | `console.error("[CreateDocument] Stack:", error.stack)` | Stack traces are debug-only. Logger's `error` field intentionally omits `stack` in prod. Phase 3.5 (content layer). |
| [app/api/content/content/upload/simple/route.ts:367](../../app/api/content/content/upload/simple/route.ts#L367) | `console.error("[SimpleUpload] Stack:", error.stack)` | Same as above. Phase 3.5 (content layer). |
| [app/api/content/content/[id]/route.ts:707](../../app/api/content/content/[id]/route.ts#L707) | `console.error("[PATCH Content] Google Drive rename failed:", errorData.error)` | Google Drive error envelopes can include path strings (potentially user filenames). Already in Phase 2 vertical slice scope — gets fixed first. |

## Negative Findings (deliberately checked, found nothing)

These are the patterns we expected to find and didn't — recording the negative result so we don't re-audit:

| Pattern checked | Hits |
|---|---|
| `console.* ` containing `JSON.stringify(...)` | **0** |
| `console.*` containing `req.body` / `request.body` / `headers` / `cookies` | **0** |
| `console.*` with `user`/`session`/`token` passed as a positional argument (e.g., `console.log("u:", user)`) | **0** |
| `console.*` logging raw OAuth `accessToken` / `refreshToken` | **0** |
| `console.*` logging a full TipTap JSON document or Y.js binary state | **0** |
| `console.*` logging password or secret variables | **0** |

This means the codebase already has reasonable hygiene — no one is currently shipping full user records or document bodies to stdout. The cleanup is closer to *style migration* than *security remediation*.

## Top 10 noisiest files (for migration scheduling)

| File | `console.*` count | Phase |
|---|---|---|
| `app/(authenticated)/settings/preferences/page.tsx` | 15 | Phase 5 (client) |
| `app/api/onlyoffice/callback/route.ts` | 14 | 3.4 (external) |
| `lib/domain/content/open-graph-fetcher.ts` | 11 | 3.4 (external) |
| `app/api/content/external/preview/route.ts` | 9 | 3.4 (external) |
| `app/api/google-drive/upload/route.ts` | 8 | 3.4 (external) |
| `lib/domain/visualization/mermaid/use-collaboration.ts` | 7 | Phase 5 (client) |
| `app/api/content/content/[id]/route.ts` | 7 | **Phase 2 (vertical slice)** |
| `lib/features/settings/operations.ts` | 6 | 3.6 (depends on caller) |
| `lib/domain/visualization/excalidraw/use-collaboration.ts` | 6 | Phase 5 (client) |
| `lib/infrastructure/media/document-extractor.ts` | 5 | 3.5 (content) |

**Observation:** the external-integration files (OnlyOffice, OpenGraph, Google Drive) cluster at the top of the server list. Phase 3.4 (storage + external) gets ~42 of the 307 sites — non-trivial. Worth budgeting toward the upper end of the 4-6 hour estimate.

## Recommendations

1. **Phase 3.1 scope is small** — one severity-2 site plus the four severity-3 stack/error sites if we want a clean pass. Estimate revises down from 2-4h to **~1-2 hours**.
2. **No emergency action between now and Phase 1** — no severity-1 findings means we don't need to interrupt the logger build to strip anything.
3. **The negative findings inform the lint rule design.** Since no one is currently logging `user` objects positionally, the type-firewall on `attrs` is sufficient — we don't need a separate runtime `redact()` pass over freeform arguments. The runtime redaction in `redaction.ts` (Phase 1) can be a thin belt-and-suspenders check, not a load-bearing scrubber.
4. **The frontend top-3 (preferences, mermaid collab, excalidraw collab)** is where Phase 5 finds its heaviest lifts — flag for the frontend charter to address.

## Methodology Notes

Patterns used:

```bash
# Identity/auth variables
grep -rnE "console\.(log|error|warn|info).*\b(user|session|token|cookie|password|secret|apiKey|api_key|email)\b" --include="*.ts" --include="*.tsx" app/api lib

# JSON.stringify near console
grep -rnE "console\.(log|error|warn|info).*JSON\.stringify" --include="*.ts" --include="*.tsx" app lib

# Request envelopes
grep -rnE "console\.(log|error|warn|info).*\b(headers|req\.body|request\.body|setCookie|cookies)\b" --include="*.ts" --include="*.tsx" app lib

# Document payloads
grep -rnE "console\.(log|error|warn|info).*\b(ydoc|yDoc|Y\.encode|tiptap|tipTap|payload|document)\b" --include="*.ts" --include="*.tsx" app/api lib

# Stack traces
grep -rnE "console\.(log|error|warn|info).*\.stack" --include="*.ts" --include="*.tsx" app lib
```

All greps excluded `lib/database/generated/` (Prisma client output, not human-authored).

**Known gaps in methodology:**
- Did not check non-`.ts(x)` files (no `.js` server code in this repo to worry about).
- Did not analyze data flow — a `console.log(x)` where `x` is *constructed* from PII several lines earlier would not match these patterns. Mitigation: the lint rule in Phase 4 catches *all* `console.*` regardless of argument shape, so anything we miss here gets caught at the gate.
- Did not check the Hocuspocus server repo (explicitly out of scope per the plan).
