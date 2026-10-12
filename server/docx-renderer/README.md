# docx-renderer

Fills a user's own `.docx` template with keyed values. A stateless Python
service deployed to Cloud Run as its own image (`cloudbuild.docx-renderer.yaml`
at the repo root); the Next.js app calls it, owns storage, authentication and
ownership checks, and never sends it a credential.

Engine: [docxtpl](https://docxtpl.readthedocs.io/) (Jinja tags inside Word),
run under Jinja's `SandboxedEnvironment` — a template is user-authored input.

## Endpoints

| Route | Body | Returns |
|---|---|---|
| `GET /healthz` | — | `{ ok }` |
| `POST /inspect` | multipart `template` (.docx) | the **contract** (below); `422` with `errors[]` when a tag does not parse |
| `POST /render` | multipart `template` + form `values` (JSON object) + optional `expectedChecksum` | `{ ok, docxBase64, mimeType, text, checksum, diagnostics }`; `422` with `error.code` on refusal |

Auth: `X-Renderer-Token` must equal `RENDERER_SHARED_TOKEN` when that env var is
set (local dev: unset → open). In production Cloud Run IAM gates the invoker as
well (`--no-allow-unauthenticated`).

Limits: template ≤ 5 MB (`RENDERER_MAX_TEMPLATE_BYTES`), values ≤ 1 MB
(`RENDERER_MAX_VALUES_BYTES`).

## The contract

What the model sees instead of the file — derived from the template's Jinja AST
(`contract.py`), so it names the structure the values must match:

```json
{
  "ok": true,
  "checksum": "sha256…",
  "fields":   [{ "path": "header.name", "required": true, "rich": false },
               { "path": "header.website", "required": true, "rich": true }],
  "sections": [{ "path": "experience", "item": "job", "itemIsValue": false,
                 "fields": [{ "path": "title", "required": true, "rich": false },
                            { "path": "location", "required": false, "rich": false }],
                 "sections": [{ "path": "bullets", "item": "bullet", "itemIsValue": true,
                                "fields": [], "sections": [] }] },
               { "path": "skills", "item": "skill", "itemIsValue": true, … }],
  "errors": [], "warnings": []
}
```

- `required: false` means the template already guards the field with `{% if %}`.
  Descriptions, suggested lengths and overrides are the app's layer on top,
  keyed by `path`, versioned by `checksum`.
- `rich: true` marks a `{{r name }}` tag: the value may be `{ "text", "url" }`
  and renders as a hyperlink. In a plain `{{ }}` tag such an object is not
  meaningful — send a string.
- A render against a different `checksum` than the one inspected is refused
  (`template_checksum_mismatch`): the values were written against a contract
  that no longer describes the file.

## Diagnostics — the render is judged, not trusted

`render.py` reads the text back out of the produced file (body, tables,
headers, footers) and reports:

- `unresolved` — anything still shaped like a tag (`{{`, `{%`): a tag Word
  split across runs that docxtpl could not reassemble, or braces in a value.
- `missing` — top-level names the template reads that `values` did not supply.
- `unused` — keys in `values` the template never reads (catches `sumary`).
- `durationMs`, `bytes`, `textChars`; `text` itself is returned so the app can
  store search text without a second extraction.

Whether `missing` or `unresolved` should block acceptance is the app's
decision, not the renderer's — it reports; the caller judges.

## Local

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/make_fixtures.py     # regenerate fixtures/*.docx
.venv/bin/python scripts/smoke.py             # contract + render + failure paths
.venv/bin/uvicorn app:app --port 8081         # serve for the Next.js dev server
```

Docker: `docker build -t docx-renderer . && docker run --rm -p 8081:8080 docx-renderer`.

## Template authoring rules (surface these to users)

docxtpl's rules, which preflight checks where it can:

- Paragraph-level loops use `{%p for … %}` / `{%p endfor %}` **alone in their own
  paragraph**; table-row loops use `{%tr … %}` in their own row.
- A tag must not be broken by formatting changes mid-tag. Preflight reassembles
  the common run-split case; when it cannot, `/inspect` returns
  `template_syntax` with the paragraph text so the author can retype the tag.
- Hyperlinks need `{{r name }}`; plain `{{ name }}` renders text only.
