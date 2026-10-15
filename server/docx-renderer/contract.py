"""Template preflight: derive the field contract the model will see.

The model never sees DOCX bytes. It sees what this module returns — the
scalar fields, the repeating sections with their item fields, which tags
can carry a hyperlink (`{{r name }}`), which fields the template already
guards with `{% if %}` (so they are optional), and any tag the Jinja parser
rejects, mapped back to the paragraph it sits in so the feedback is
actionable in Word rather than in XML.

Why derive it from the Jinja AST rather than a regex over `{{ … }}`: a
template's loops are the structure the AI output has to match
(`experience[]` with `title`/`company`/`bullets[]` inside), and only the
parser knows which name a loop binds and where its body ends.
"""

from __future__ import annotations

import hashlib
import io
import re
from dataclasses import dataclass, field

from docxtpl import DocxTemplate
from jinja2 import ChainableUndefined, TemplateSyntaxError, nodes
from jinja2.sandbox import SandboxedEnvironment

# docxtpl's render splits the XML into one line per paragraph before Jinja
# parses it, so a TemplateSyntaxError's lineno is a paragraph index. We do
# the same split so the numbers agree and we can quote the paragraph.
_PARAGRAPH_SPLIT = re.compile(r"<w:p([ >])", re.DOTALL)
_TAG_STRIP = re.compile(r"<[^>]+>")
# Rich tags (`{{r expr }}` / `{%r … %}`) are rewritten by docxtpl before
# the AST exists, so they are detected on the raw XML.
_RICH_TAG = re.compile(r"\{\{r\s+([A-Za-z_][\w.]*)")

LOOP_VARIABLE = "loop"


def make_env() -> SandboxedEnvironment:
    """One Jinja environment for inspect AND render — a template that parses
    here renders there under the same rules (sandboxed; missing nested
    values render empty instead of raising)."""
    return SandboxedEnvironment(undefined=ChainableUndefined, autoescape=False)


def checksum_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


@dataclass
class FieldInfo:
    path: str
    required: bool = True
    rich: bool = False

    def to_dict(self) -> dict:
        return {"path": self.path, "required": self.required, "rich": self.rich}


@dataclass
class Section:
    """A `{% for item in path %}` loop. `path` is relative to the parent
    section; `item` is the bound loop variable (needed to resolve rich
    tags, which name it). `item_is_value` is set when the body uses the
    item itself (`{{ skill }}`), i.e. the list holds scalars, not objects."""

    path: str
    item: str | None = None
    fields: dict[str, FieldInfo] = field(default_factory=dict)
    sections: dict[str, "Section"] = field(default_factory=dict)
    item_is_value: bool = False

    def field_at(self, path: str) -> FieldInfo:
        if path not in self.fields:
            self.fields[path] = FieldInfo(path=path)
        return self.fields[path]

    def to_dict(self) -> dict:
        return {
            "path": self.path,
            "item": self.item,
            "itemIsValue": self.item_is_value,
            "fields": [f.to_dict() for f in self.fields.values()],
            "sections": [s.to_dict() for s in self.sections.values()],
        }


@dataclass
class TemplateError:
    code: str
    message: str
    part: str | None = None
    paragraph: int | None = None
    near: str | None = None

    def to_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items() if v is not None}


@dataclass
class Contract:
    ok: bool
    checksum: str
    root: Section
    errors: list[TemplateError] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "checksum": self.checksum,
            "fields": [f.to_dict() for f in self.root.fields.values()],
            "sections": [s.to_dict() for s in self.root.sections.values()],
            "errors": [e.to_dict() for e in self.errors],
            "warnings": self.warnings,
        }

    def declared_names(self) -> set[str]:
        """Top-level keys the template reads — what `values` must supply."""
        names = {f.path.split(".")[0] for f in self.root.fields.values()}
        names |= {s.path.split(".")[0] for s in self.root.sections.values()}
        return names


# ---------------------------------------------------------------------------
# AST analysis


def _dotted(expr: nodes.Node) -> str | None:
    """`job.company`, `header['name']` → "job.company" / "header.name"."""
    if isinstance(expr, nodes.Name):
        return expr.name
    if isinstance(expr, nodes.Getattr):
        base = _dotted(expr.node)
        return f"{base}.{expr.attr}" if base else None
    if (
        isinstance(expr, nodes.Getitem)
        and isinstance(expr.arg, nodes.Const)
        and isinstance(expr.arg.value, str)
    ):
        base = _dotted(expr.node)
        return f"{base}.{expr.arg.value}" if base else None
    return None


class _Analyzer:
    def __init__(self) -> None:
        self.root = Section(path="")

    def _resolve(
        self, path: str, bound: dict[str, Section | None]
    ) -> tuple[Section | None, str]:
        """Which section owns `path`, and the path relative to it. An unbound
        root name belongs to the top level; a loop variable to its section;
        `loop` and `{% set %}` names to nobody."""
        head, _, rest = path.partition(".")
        if head == LOOP_VARIABLE:
            return None, ""
        if head in bound:
            return bound[head], rest
        return self.root, path

    def _touch(self, path: str, bound: dict[str, Section | None]) -> FieldInfo | None:
        owner, rel = self._resolve(path, bound)
        if owner is None:
            return None
        if rel == "":
            # `{{ skill }}` — the loop item itself is the value.
            owner.item_is_value = True
            return None
        return owner.field_at(rel)

    def walk(self, node: nodes.Node, bound: dict[str, Section | None]) -> None:
        if isinstance(node, nodes.For):
            self._walk_for(node, bound)
            return
        if isinstance(node, nodes.If):
            # `{% if job.location %}` — the template copes without it.
            guard = _dotted(node.test)
            if guard:
                info = self._touch(guard, bound)
                if info:
                    info.required = False
            for child in node.iter_child_nodes():
                self.walk(child, bound)
            return
        if isinstance(node, (nodes.Assign, nodes.With)):
            # Names the template defines itself are not inputs.
            targets = (
                [node.target] if isinstance(node, nodes.Assign) else list(node.targets)
            )
            inner = dict(bound)
            for t in targets:
                if isinstance(t, nodes.Name):
                    inner[t.name] = None
            for child in node.iter_child_nodes(exclude=("target", "targets")):
                self.walk(child, inner)
            return
        if isinstance(node, nodes.Call) and isinstance(node.node, nodes.Getattr):
            # `{{ name.upper() }}` reads `name`, not `name.upper`.
            self.walk(node.node.node, bound)
            for child in node.iter_child_nodes(exclude=("node",)):
                self.walk(child, bound)
            return
        if isinstance(node, (nodes.Name, nodes.Getattr, nodes.Getitem)):
            path = _dotted(node)
            if path:
                self._touch(path, bound)
                return
        for child in node.iter_child_nodes():
            self.walk(child, bound)

    def _walk_for(self, node: nodes.For, bound: dict[str, Section | None]) -> None:
        target = node.target.name if isinstance(node.target, nodes.Name) else None
        iter_path = _dotted(node.iter)
        if not target or not iter_path:
            # `{% for a, b in … %}` / computed iterables: analyse the body in
            # the outer scope so nothing is lost, but no section is derived.
            for child in node.iter_child_nodes():
                self.walk(child, bound)
            return
        owner, rel = self._resolve(iter_path, bound)
        if owner is None or rel == "":
            for child in node.iter_child_nodes():
                self.walk(child, bound)
            return
        section = owner.sections.setdefault(rel, Section(path=rel, item=target))
        if section.item is None:
            section.item = target
        inner = dict(bound)
        inner[target] = section
        for child in node.iter_child_nodes(exclude=("iter", "target")):
            self.walk(child, inner)
        if node.test is not None:
            self.walk(node.test, inner)


def _mark_rich(section: Section, rich_exprs: set[str], prefix: str) -> None:
    """A field is rich when the raw XML had `{{r <expr> }}` for it. Top-level
    fields are named by their path; section fields by `<item>.<path>`."""
    for info in section.fields.values():
        expr = f"{prefix}{info.path}" if prefix else info.path
        if expr in rich_exprs:
            info.rich = True
    for sub in section.sections.values():
        _mark_rich(sub, rich_exprs, f"{sub.item}." if sub.item else "")


def _paragraph_text(lines: list[str], lineno: int) -> str | None:
    if 1 <= lineno <= len(lines):
        text = _TAG_STRIP.sub("", lines[lineno - 1]).strip()
        return text[:160] or None
    return None


# ---------------------------------------------------------------------------
# Entry point


def _template_parts(tpl: DocxTemplate) -> list[tuple[str, str]]:
    """(label, xml) for every part docxtpl renders: the body, then each
    header and footer. A loop cannot span parts, so each is parsed on its
    own; the analysis is merged because the values are one object."""
    parts = [("body", tpl.get_xml())]
    for label, uri in (("header", tpl.HEADER_URI), ("footer", tpl.FOOTER_URI)):
        for _rel_key, part in tpl.get_headers_footers(uri):
            parts.append((label, tpl.get_part_xml(part)))
    return parts


def inspect_template(data: bytes) -> Contract:
    checksum = checksum_of(data)
    try:
        tpl = DocxTemplate(io.BytesIO(data))
        tpl.init_docx()
        parts = _template_parts(tpl)
    except Exception as error:  # noqa: BLE001 — anything zip/xml can throw
        return Contract(
            ok=False,
            checksum=checksum,
            root=Section(path=""),
            errors=[TemplateError("not_a_docx", f"Could not open the file as a Word document: {error}")],
        )

    env = make_env()
    analyzer = _Analyzer()
    rich_exprs: set[str] = set()
    for label, xml in parts:
        rich_exprs |= set(_RICH_TAG.findall(xml))
        patched = _PARAGRAPH_SPLIT.sub(r"\n<w:p\1", tpl.patch_xml(xml))
        try:
            ast = env.parse(patched)
        except TemplateSyntaxError as error:
            lines = patched.split("\n")
            return Contract(
                ok=False,
                checksum=checksum,
                root=Section(path=""),
                errors=[
                    TemplateError(
                        code="template_syntax",
                        message=error.message or "Jinja could not parse a tag.",
                        part=label,
                        paragraph=error.lineno,
                        near=_paragraph_text(lines, error.lineno),
                    )
                ],
            )
        analyzer.walk(ast, {})
    _mark_rich(analyzer.root, rich_exprs, "")

    warnings: list[str] = []
    if not analyzer.root.fields and not analyzer.root.sections:
        warnings.append("The template contains no {{ fields }} — rendering it would reproduce it unchanged.")
    return Contract(ok=True, checksum=checksum, root=analyzer.root, warnings=warnings)
