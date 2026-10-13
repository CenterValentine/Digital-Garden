---
last_updated: 2026-10-12
status: built (steps 1–3); renderer NOT deployed; judge policy open
branch: feat/docx-template-renderer
worktree: .claude/worktrees/docx-template
---

# DOCX Template Renderer — design of record

Let the AI produce **keyed values** and let a small Python service fill the
user's **own `.docx` template**, preserving its layout. The model never sees
the file — it reads a derived **contract** a few hundred tokens long. That is
the token economy the feature exists for, and it is what makes a resume from
a template cheaper per turn than one authored as markdown.

Origin: a design-only handoff (2026-10-12) that created the remote branch and
no code. Everything below was built and gated in this worktree.

## 1. Principles applied

- **The template is the file the user already keeps, where they keep it**
  (PRODUCT-PRINCIPLES §1). Marking stores a record on the file's own payload
  (`FilePayload.storageMetadata.custom.docxTemplate`). No template table, no
  copy, no migration. Overwriting the file keeps the mark; a checksum mismatch
  re-inspects, so the contract follows the file.
- **Gaps are data** (§2). A required field the notes cannot support stays an
  empty, visible field — never invented text. `requiredGaps` names them down to
  the list item (`experience[1].title`); the review card and the tool result
  carry them.
- **Schemas describe shape; execute judges.** The renderer *reports*
  (`unresolved`, `missing`, `unused`); `judge.ts` *decides*, once, for every
  caller. The policy is the owner's — see §6.
- **Explicit, never silent.** `fill_docx_template` is its own tool. A markdown
  `create_docx` call is never reinterpreted as a template fill.

## 2. Pieces

| Piece | Where | Notes |
|---|---|---|
| Renderer service | `server/docx-renderer/` | FastAPI + docxtpl 0.20.2 under Jinja `SandboxedEnvironment`. `POST /inspect`, `POST /render`, `GET /healthz`. No credentials, no DB. |
| Contract derivation | `server/docx-renderer/contract.py` | Jinja AST → scalars, sections (`item`, `itemIsValue`, nested), `{{r }}` → `rich`, `{% if %}` guard → `required:false`; body + headers + footers; malformed tag → `template_syntax` with `part`/`paragraph`/`near`. |
| Render + diagnostics | `server/docx-renderer/render.py` | Fills, saves, reads the text back (body, tables, headers, footers), reports `unresolved` / `missing` / `unused` / `durationMs` / `bytes`; refuses a stale `expectedChecksum`. |
| Python smoke | `server/docx-renderer/scripts/smoke.py` | 40 checks through the HTTP contract, incl. split-run and malformed fixtures. |
| Cloud Build | `cloudbuild.docx-renderer.yaml` | Separate service `digital-garden-docx-renderer`, us-west1, min 0 / max 1, concurrency 1, 60 s, `--no-allow-unauthenticated`, secret `digital-garden-docx-renderer-token`. |
| Node client | `lib/domain/ai/docx-templates/renderer-client.ts` | Multipart calls; Google ID token via Vercel OIDC → WIF → impersonated SA (`Impersonated.fetchIdToken`); `X-Renderer-Token`; localhost needs neither. Flat outcomes (tsconfig is not strict). |
| Template record | `lib/domain/ai/docx-templates/record.ts` (pure) · `templates.ts` (server) | Read/mark/unmark/list/load, notes, `describeTemplateForModel`. |
| Judge | `lib/domain/ai/docx-templates/judge.ts` | `requiredGaps` + `judgeRender` (**TODO(owner)** policy; placeholder refuses only unresolved tags). |
| Tools | `lib/domain/ai/tools/registry.ts` | `read_docx_template` (list / contract + `valuesShape`), `fill_docx_template` (load → render → judge → `storeDocxDocument`). Shares `create_docx`'s auto-approve setting and overwrite rule; charter output directives + output-target placement as `create_docx`. |
| Storage path | `lib/domain/ai/documents.ts` | `storeDocxDocument` — one path for finished bytes (create / overwrite in place / `role: referenced`); `createDocxDocument` delegates to it. |
| Marking UI | `components/content/context-menu/file-tree-actions.tsx` | "Mark as Document Template" / "Unmark" on `.docx` rows; preflight errors toast the paragraph. `isDocxTemplate` rides the tree payload. |
| Settings | `app/(authenticated)/settings/templates/DocxTemplateManager.tsx` | Listing + per-field notes (description, max chars) + unmark. |
| API | `app/api/content/docx-templates/route.ts` | GET (list / `?contentId=` record), POST mark, PATCH notes, DELETE unmark. 503 when the renderer is not configured. |
| Approval card | `components/content/ai/ChatMessage.tsx` | `fill_docx_template` → `DocumentApprovalPreview` with `TemplateValuesPreview` (empties render as "—"). |
| Node smoke | `scripts/docx-renderer-smoke.ts` (`pnpm docx:renderer:smoke`) | Client ↔ service over HTTP + judge. Not in `build` (needs Python). |

## 3. The contract (what the model reads)

```
header.name
header.website (link: {text,url})
summary — Two sentences, first person; ≤320 chars
skills[] — list of strings
experience[] — list of objects
  title
  location (optional)
  bullets[] — list of strings
```

`valuesShape` accompanies it: top-level keys are the roots; dotted fields
nest; sections are arrays; a rich field takes `{ text, url }`; leave a field
empty rather than invent. Per-field notes are the user's layer (Settings →
Templates), keyed by path so they survive a re-inspect.

## 4. Flow

1. User right-clicks a `.docx` → Mark as Document Template → `/inspect` →
   record stored (or a `template_syntax` toast naming the paragraph).
2. In chat (or a charter materials phase): `read_docx_template` → contract +
   checksum → model writes `values` → `fill_docx_template`.
3. Tool: `loadDocxTemplate` (bytes + record; re-inspect if the file changed)
   → `renderDocxTemplate` → `judgeRender` → `storeDocxDocument` (new node, or
   `overwriteContentId` keeps the id a Materials cell / shortcut points at)
   → compact result (`gaps`, `renderMs`, receipt) → the file opens like any
   `create_docx` output.

## 5. Measurements (2026-10-12, local)

- Fixture template 37 KB; render 20–40 ms in-process; output 38 KB.
- LibreOffice (alpine `libreoffice-writer`, Docker): install ~115 s (image
  build time, not request time), **DOCX→PDF < 1 s** cold and warm; PDF 61 KB;
  layout verified by eye (title style, bold run boundaries, bullets, footer).
  A PDF preview is therefore feasible in a second image; it was **not**
  added (step 4 — only after the DOCX path is live).

## 6. Open decisions (owner)

1. ~~Judge policy~~ **Decided 2026-10-13: a bad write is refused.** Unresolved
   tag → refuse; unused key → refuse naming the nearest declared field;
   empty required slot (or a root not supplied) → refuse, the model fills
   from the notes or asks the user, never invents. Accepted renders carry a
   positive report (filled count, per-section counts, over-length against
   the user's `maxLength` notes, links, text size). Over-length is advisory.
   Also decided: keep the JSON record, no `isTemplate` column.
2. **Rerender without an AI call.** The review surface today is the approval
   card + the opened file. A "edit values → rerender" form (no model turn)
   needs the values persisted beside the output; proposed home:
   `storageMetadata.custom.docxFill = { templateId, checksum, values }` on
   the OUTPUT file, written by `storeDocxDocument`. Not built.
3. **Scope of auto-approve.** The fill shares "Auto-approve documents". Keep,
   or give templates their own toggle?

## 7. Deploy runbook (owner-run; not yet executed)

Prerequisites once per project (verify every flag against current gcloud/Vercel docs — written from memory, not run):

```bash
PROJECT=digital-garden-482805
PROJECT_NUMBER=$(gcloud projects describe $PROJECT --format='value(projectNumber)')
TEAM=<vercel-team-slug>          # issuer https://oidc.vercel.com/<team-slug> (Vercel → Settings → Security → OIDC, issuer mode "Team")

gcloud iam workload-identity-pools create vercel --project=$PROJECT --location=global --display-name="Vercel"
gcloud iam workload-identity-pools providers create-oidc vercel --project=$PROJECT --location=global \
  --workload-identity-pool=vercel --issuer-uri="https://oidc.vercel.com/$TEAM" \
  --allowed-audiences="https://vercel.com/$TEAM" \
  --attribute-mapping="google.subject=assertion.sub,attribute.project=assertion.project,attribute.environment=assertion.environment"

gcloud iam service-accounts create docx-renderer-invoker --project=$PROJECT
SA=docx-renderer-invoker@$PROJECT.iam.gserviceaccount.com
# Let the Vercel project's identity mint tokens AS the invoker SA (token creator ⊇ OpenID token creator).
gcloud iam service-accounts add-iam-policy-binding $SA --role=roles/iam.serviceAccountTokenCreator \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/vercel/attribute.project/<vercel-project-id>"

printf '%s' "$(openssl rand -hex 32)" | gcloud secrets create digital-garden-docx-renderer-token --data-file=- --project=$PROJECT
```

Deploy (from a tree matching `origin/main` after merge, like Hocuspocus):

```bash
gcloud builds submit --config cloudbuild.docx-renderer.yaml .
gcloud run services add-iam-policy-binding digital-garden-docx-renderer --region=us-west1 --member="serviceAccount:$SA" --role=roles/run.invoker
gcloud run services describe digital-garden-docx-renderer --region=us-west1 --format='value(status.url)'
```

Vercel env (production): `DOCX_RENDERER_URL=<service url>`,
`DOCX_RENDERER_SHARED_TOKEN=<the secret>`,
`GCP_WIF_AUDIENCE=//iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/vercel/providers/vercel`,
`GCP_RENDERER_INVOKER_SA=$SA`.

Verify: `curl -H "Authorization: Bearer $(gcloud auth print-identity-token --audiences=<service url>)" <service url>/healthz`
(an unauthenticated curl must get 403), then mark a template in prod and run
one fill from chat (the production smoke below).

Local dev: `cd server/docx-renderer && .venv/bin/uvicorn app:app --port 8081`,
`DOCX_RENDERER_URL=http://localhost:8081` in `.env.local`.

## 8. Remaining steps

- [ ] Owner: judge policy (§6.1).
- [ ] Browser smoke on the dev stack: mark the fixture template (upload it
      first), Settings → Templates shows it with fields, add a note, chat
      "fill my resume template for …" → approval card lists the values →
      file opens → overwrite in place keeps the id.
- [ ] Draft PR (summary / gates / pre-merge smoke lines) — deploy is a
      separate owner step after merge; the tool stays unavailable until
      `DOCX_RENDERER_URL` is set, so merging first is safe.
- [ ] Post-deploy production smoke (AI capability → production): one
      `read_docx_template` list, one fill, one overwrite; check Cloud Run
      logs show `render` events with `durationMs`.
- [ ] Step 4: PDF preview image (LibreOffice) only after the DOCX path is
      live; measurements in §5 say it is cheap.
- [ ] Rerender-without-AI form (§6.2).
- [ ] Charter recipe: STAGE2-CHARTER-RECIPE.md materials phase names the
      template and `fill_docx_template` (today it names `create_docx`).
