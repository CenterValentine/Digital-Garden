"""DOCX template renderer — a stateless HTTP service for Cloud Run.

Two operations, both pure functions of the request body:

  POST /inspect   multipart `template` (.docx)
                  → the field contract (contract.py)
  POST /render    multipart `template` (.docx) + `values` (JSON string)
                  + optional `expectedChecksum`
                  → JSON { ok, docxBase64, text, checksum, diagnostics }

The service holds no credentials and reaches no database: the Next.js side
authenticates the user, fetches the template from storage, verifies
ownership of the overwrite target, and stores the result. In production
Cloud Run IAM gates the invoker (the app presents a Google ID token in
`Authorization`); `X-Renderer-Token` is a shared secret for local dev and
a second factor in prod, checked only when RENDERER_SHARED_TOKEN is set.
"""

from __future__ import annotations

import base64
import hmac
import json
import logging
import os
import sys
import time
from typing import Any

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from contract import inspect_template
from render import render_template

MAX_TEMPLATE_BYTES = int(os.environ.get("RENDERER_MAX_TEMPLATE_BYTES", str(5 * 1024 * 1024)))
MAX_VALUES_BYTES = int(os.environ.get("RENDERER_MAX_VALUES_BYTES", str(1 * 1024 * 1024)))
SHARED_TOKEN = os.environ.get("RENDERER_SHARED_TOKEN", "")
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

logging.basicConfig(stream=sys.stdout, level=logging.INFO, format="%(message)s")
log = logging.getLogger("docx-renderer")

app = FastAPI(title="docx-renderer", docs_url=None, redoc_url=None, openapi_url=None)


def _event(event: str, **attrs: Any) -> None:
    # One JSON object per line — Cloud Run's log viewer indexes the fields.
    log.info(json.dumps({"event": event, **attrs}, default=str))


def require_token(x_renderer_token: str | None = Header(default=None)) -> None:
    """Second factor behind Cloud Run IAM. A route DEPENDENCY, not a call
    inside the handler: FastAPI resolves dependencies before it validates
    the body, so a caller without the token gets 401 — never a 422 that
    describes the request schema."""
    if not SHARED_TOKEN:
        return
    if not x_renderer_token or not hmac.compare_digest(x_renderer_token, SHARED_TOKEN):
        raise HTTPException(status_code=401, detail={"code": "unauthorized"})


async def _read_template(upload: UploadFile) -> bytes:
    data = await upload.read()
    if not data:
        raise HTTPException(status_code=400, detail={"code": "template_empty"})
    if len(data) > MAX_TEMPLATE_BYTES:
        raise HTTPException(
            status_code=413,
            detail={"code": "template_too_large", "limitBytes": MAX_TEMPLATE_BYTES},
        )
    return data


# Not /healthz: Cloud Run's front end reserves paths ending in "z" and
# answers them itself (a Google 404) before IAM or the container sees them.
@app.get("/health")
async def health() -> dict:
    return {"ok": True, "service": "docx-renderer"}


@app.post("/inspect", dependencies=[Depends(require_token)])
async def inspect(template: UploadFile = File(...)) -> JSONResponse:
    data = await _read_template(template)
    started = time.perf_counter()
    contract = inspect_template(data)
    _event(
        "inspect",
        ok=contract.ok,
        bytes=len(data),
        durationMs=round((time.perf_counter() - started) * 1000),
        fields=len(contract.root.fields),
        sections=len(contract.root.sections),
    )
    return JSONResponse(contract.to_dict(), status_code=200 if contract.ok else 422)


@app.post("/render", dependencies=[Depends(require_token)])
async def render(
    template: UploadFile = File(...),
    values: str = Form(...),
    expectedChecksum: str | None = Form(default=None),
    properties: str | None = Form(default=None),
) -> JSONResponse:
    data = await _read_template(template)
    wanted_properties: dict[str, Any] = {}
    if properties:
        try:
            parsed_properties = json.loads(properties)
        except json.JSONDecodeError as error:
            raise HTTPException(status_code=400, detail={"code": "properties_not_json", "message": str(error)}) from error
        if not isinstance(parsed_properties, dict):
            raise HTTPException(status_code=400, detail={"code": "properties_not_object"})
        wanted_properties = parsed_properties
    if len(values.encode("utf-8")) > MAX_VALUES_BYTES:
        raise HTTPException(status_code=413, detail={"code": "values_too_large", "limitBytes": MAX_VALUES_BYTES})
    try:
        parsed = json.loads(values)
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=400, detail={"code": "values_not_json", "message": str(error)}) from error
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail={"code": "values_not_object"})

    result = render_template(data, parsed, expected_checksum=expectedChecksum, properties=wanted_properties)
    body = result.to_dict()
    if result.ok and result.docx is not None:
        body["docxBase64"] = base64.b64encode(result.docx).decode("ascii")
        body["mimeType"] = DOCX_MIME
        body["text"] = result.text
    _event(
        "render",
        ok=result.ok,
        templateBytes=len(data),
        error=(result.error or {}).get("code"),
        **{k: v for k, v in result.diagnostics.items() if k not in ("unresolved", "properties")},
        propertiesSet=sorted(result.diagnostics.get("properties", {}).keys()),
        unresolvedCount=len(result.diagnostics.get("unresolved", [])),
    )
    return JSONResponse(body, status_code=200 if result.ok else 422)
