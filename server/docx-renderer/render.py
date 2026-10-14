"""Fill a template with validated values and judge the output.

The schema on the Next.js side describes the values' shape; this module
judges the result ("schemas describe shape; execute judges"): it reads the
text back out of the DOCX it just produced and reports unresolved tags,
declared fields the values never supplied, and supplied keys the template
never reads — the three ways a render can look successful and be wrong.
"""

from __future__ import annotations

import io
import re
import time
from dataclasses import dataclass, field
from typing import Any

from docx import Document
from docxtpl import DocxTemplate, RichText

from contract import Contract, checksum_of, inspect_template, make_env

# Anything that still looks like a tag after rendering. `{{`/`{%` survive
# a render only when docxtpl could not reassemble a tag Word split across
# runs, or when a value itself contained braces.
_UNRESOLVED = re.compile(r"\{\{.*?\}\}|\{%.*?%\}|\{\{|\}\}|\{%|%\}")
MAX_TEXT_CHARS = 200_000


@dataclass
class RenderResult:
    ok: bool
    docx: bytes | None = None
    text: str = ""
    checksum: str | None = None
    error: dict | None = None
    diagnostics: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        out: dict[str, Any] = {"ok": self.ok, "diagnostics": self.diagnostics}
        if self.error:
            out["error"] = self.error
        if self.checksum:
            out["checksum"] = self.checksum
        return out


def extract_text(data: bytes) -> str:
    """Body, tables, headers and footers — what a parser (an ATS, a search
    index) will read, which is the view the model should check against."""
    doc = Document(io.BytesIO(data))
    parts: list[str] = []

    def collect(container) -> None:  # noqa: ANN001 — python-docx has no shared base type
        for paragraph in container.paragraphs:
            parts.append(paragraph.text)
        for table in container.tables:
            for row in table.rows:
                for cell in row.cells:
                    collect(cell)

    collect(doc)
    for section in doc.sections:
        collect(section.header)
        collect(section.footer)
    return "\n".join(parts)


def _coerce(value: Any, tpl: DocxTemplate) -> Any:
    """Turn `{"text": …, "url": …}` into a hyperlink RichText (only
    meaningful inside a `{{r }}` tag); recurse through lists and dicts; map
    None to "" so a missing optional renders as nothing, not "None"."""
    if value is None:
        return ""
    if isinstance(value, dict):
        if "url" in value and set(value) <= {"text", "url"}:
            rt = RichText()
            rt.add(str(value.get("text") or value["url"]), url_id=tpl.build_url_id(value["url"]))
            return rt
        return {k: _coerce(v, tpl) for k, v in value.items()}
    if isinstance(value, list):
        return [_coerce(v, tpl) for v in value]
    return value


def _unresolved_in(text: str) -> list[str]:
    seen: list[str] = []
    for match in _UNRESOLVED.finditer(text):
        start = max(0, match.start() - 30)
        snippet = text[start : match.end() + 30].replace("\n", " ")
        if snippet not in seen:
            seen.append(snippet)
        if len(seen) >= 10:
            break
    return seen


def render_template(
    data: bytes,
    values: dict[str, Any],
    *,
    expected_checksum: str | None = None,
) -> RenderResult:
    started = time.perf_counter()
    actual = checksum_of(data)
    if expected_checksum and expected_checksum != actual:
        # The contract the model wrote against belongs to a different file
        # version. Refuse rather than fill a template it never saw.
        return RenderResult(
            ok=False,
            checksum=actual,
            error={
                "code": "template_checksum_mismatch",
                "message": "The template changed since it was inspected — re-inspect it and regenerate the values.",
            },
        )

    contract: Contract = inspect_template(data)
    if not contract.ok:
        return RenderResult(
            ok=False,
            checksum=actual,
            error={"code": "template_invalid", "message": "The template does not pass preflight.", "details": contract.to_dict()["errors"]},
        )

    tpl = DocxTemplate(io.BytesIO(data))
    context = {k: _coerce(v, tpl) for k, v in values.items()}
    try:
        tpl.render(context, jinja_env=make_env(), autoescape=True)
    except Exception as error:  # noqa: BLE001 — surface Jinja/lxml failures as a result, not a 500
        return RenderResult(
            ok=False,
            checksum=actual,
            error={"code": "render_failed", "message": str(error)},
            diagnostics={"durationMs": round((time.perf_counter() - started) * 1000)},
        )

    out = io.BytesIO()
    tpl.save(out)
    docx = out.getvalue()

    try:
        text = extract_text(docx)
    except Exception as error:  # noqa: BLE001
        return RenderResult(
            ok=False,
            checksum=actual,
            error={"code": "output_unreadable", "message": f"The rendered file could not be read back: {error}"},
        )

    declared = contract.declared_names()
    provided = set(values)
    diagnostics = {
        "durationMs": round((time.perf_counter() - started) * 1000),
        "bytes": len(docx),
        "unresolved": _unresolved_in(text),
        "missing": sorted(declared - provided),
        "unused": sorted(provided - declared),
        "textChars": len(text),
    }
    return RenderResult(
        ok=True,
        docx=docx,
        text=text[:MAX_TEXT_CHARS],
        checksum=actual,
        diagnostics=diagnostics,
    )
