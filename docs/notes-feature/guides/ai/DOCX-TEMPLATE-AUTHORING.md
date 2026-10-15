---
last_updated: 2026-10-13
audience: users tagging their own Word files, and the AI coaching them
---

# Authoring a document template

A document template is **your own `.docx`**, kept where you keep it, with
tags where the content varies. Mark it (right-click → *Mark as Document
Template*) and the AI fills it with `fill_docx_template`, preserving your
layout. The AI never edits the file; it supplies values for the tags you
wrote. This page is the grammar. The engine is
[docxtpl](https://docxtpl.readthedocs.io/) (Jinja inside Word); the rules
below are the subset that matters.

## The three tag kinds

| Tag | Meaning | Value the AI sends |
|---|---|---|
| `{{ name }}` | one value | a string |
| `{% for item in list %} … {% endfor %}` | repeat the enclosed text once per item, **inside one paragraph** | a list |
| `{%p for item in list %}` … `{%p endfor %}` | repeat whole **paragraphs** once per item — each tag alone in its own paragraph | a list |

Also: `{%r name %}` for a hyperlink (value `{ "text", "url" }`), and
`{% if name %} … {% endif %}` to make text appear only when a value exists
(the field becomes *optional* in the contract).

Names: letters, digits, underscores; dots make groups (`header.name`). The
AI reads a contract derived from your tags, so pick names that say what
goes there — `experience_bullets`, not `list2`.

## Four patterns that cover a resume

**1. Inline list with separators** — skills, capabilities, tools. One
paragraph; the separator appears only *between* items.

```
{% for c in capabilities %}{{ c }}{% if not loop.last %}  •  {% endif %}{% endfor %}
```

**2. Bullet list of any length** — three paragraphs in Word: the opening
tag, ONE bullet with the item, the closing tag. The two tag paragraphs are
removed from the output; the bullet repeats.

```
{%p for b in experience_bullets %}
• {{ b }}
{%p endfor %}
```

**3. Repeating section with a heading** — one or several positions, each
with its own heading line and its own bullets. Loops nest.

```
Experience
{%p for job in positions %}
{{ job.employer }}	{{ job.dates }}
{{ job.title }}
{%p for b in job.bullets %}
• {{ b }}
{%p endfor %}
{%p endfor %}
```

Contract the AI reads: `positions[] — list of objects: employer, dates, title, bullets[]`.
One continuous position is a one-item list; two roles are two items. For
"one employer, several roles under it", add a level:
`employers[] → roles[] → bullets[]`.

**4. Optional detail** — present only when known; never a gap.

```
{{ job.title }}{% if job.location %}, {{ job.location }}{% endif %}
```

## Word rules (preflight checks these)

- A `{%p … %}` tag must be the **entire paragraph** — nothing else on that
  line. Its style does not matter; it is removed.
- Do not change formatting **in the middle of a tag** (bold half of
  `{{ name }}`). Word then splits the tag across runs; the common case is
  repaired automatically, the rest is reported as *"a tag does not parse"*
  with the paragraph quoted — retype the tag in one go.
- Tags are plain text: type `{{`, `}}`, `{%`, `%}` directly. Smart quotes
  or auto-corrected dashes inside a tag break it.
- Static text stays static. Only what changes per document gets a tag —
  your name, contact line, education and profile usually do not.
- Dynamic counts belong in loops, not numbered slots. `{{BULLET_1}} …
  {{BULLET_5}}` leaves empty bullets when there are three; a loop does not.

## What happens after marking

- Marking inspects the file once and stores the **contract**: fields,
  repeating sections, which are optional, which take links. Settings →
  Templates shows it; add a **note** per field there (what it should hold,
  max length) — the AI reads those beside the contract.
- Edit the file later and save over it: the mark survives and the contract
  refreshes on the next use. A document already filled from the old
  version re-renders against the new one; values for slots you removed are
  dropped and reported.
- The AI's values are **judged** before anything is written: a tag left in
  the output, an unknown field name, or an empty required field is refused
  and the AI asks you — it never invents a fact. Required means "not inside
  an `{% if %}`".

## If the AI is asked to make a template

The AI cannot author your Word layout — `create_docx` writes generic
styling. The path is: you provide a finished `.docx` (a real resume works
best), the AI tells you which spans to replace with which tags using the
patterns above, you make the edits in Word, mark the file, and the AI fills
it from then on. A tool that performs the span → tag replacement on an
existing file is planned (`templatize_docx`, plan §6).
