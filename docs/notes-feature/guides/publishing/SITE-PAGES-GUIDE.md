# Site Pages — user guide

**Where:** Settings → **Site Pages** (`/settings/site-pages`)

Site Pages is the low-code way to compose your site's *code-driven* pages — the
hand-designed surfaces like **Results** (`/results`) and **Field Notes**
(`/blog`) — and decide, without touching code, **what published content appears
on them and how each row is labeled.**

You edit a small **JSON config** per page. It's validated live against the same
schema the site renders with, so if it's green here, it's correct on the page.

> A visual drag-and-drop builder is planned. Today the surface is a JSON editor;
> everything below (and the future builder) reads and writes the same config.

---

## When to use it

Use Site Pages when you want to:

- Choose **which projects / posts / directories** show on a curated page.
- Group them into **sections** (e.g. "Projects", "Writing").
- **Override** how a row displays — its title, type, year, status — without
  editing the underlying published note.
- Pull a whole **published directory** into a section so new posts appear
  automatically.

You do **not** use it to write article content — that's still your notes and the
publishing flow. Site Pages only *arranges and labels* what's already published.

---

## Prerequisites

- You must be the **site owner** (you're editing your own tenant's pages).
- To *bind* content, you need something **published** — a public directory
  (path) or published items. Manual entries need nothing.

---

## Quick start

1. Open **Settings → Site Pages**.
2. Pick your **Site** (top-left). Your personal site is marked `· personal`.
3. Pick a **Page**, or choose **`+ New page…`**.
4. Set the **Slug** to match the URL you're building:
   - `results` → the `/results` page
   - `blog` → the `/blog` (Field Notes) page
   - empty slug → your home page
5. Choose a **Kind** (this sets the page's chrome — see below) and fill in the
   **Config** JSON. A starter template loads automatically per kind.
6. Watch the validator under the editor: **✓ Valid · N sections** means you're
   good. A red message tells you exactly which field is wrong.
7. Set **Visibility** to `published` when you're ready, and click **Save page**.
8. Visit the page (e.g. `/results`) to see it.

---

## Page settings (the fields above the JSON)

| Field | What it does |
|---|---|
| **Slug** | Identifies the page and maps to its URL. `results` drives `/results`, `blog` drives `/blog`, empty = home. |
| **Title** | Human name for the page (shown in the page list; used as a label). |
| **Kind** | The page's *chrome / renderer*: `record` (the Results ledger + timeline tabs), `garden` (the Field Notes leaf visualization), `index` (a simple directory listing), `prose` (plain). |
| **Visibility** | `draft` hides it (page falls back to its built-in default); `published` makes your config live. |
| **Nav label** | If set, the page appears in site navigation with this label. Empty = not in nav. |
| **Nav order** | Sort order in the nav (lower = earlier). |

---

## The config: sections

Every page config is a list of **sections**:

```json
{
  "sections": [
    { "type": "recordList", "...": "..." }
  ]
}
```

Each section has a **`type`** that decides how it renders. There are three:

| `type` | Used by | Shape |
|---|---|---|
| `recordList` | Results / work pages | A labeled table of rows (projects, essays, roles) |
| `directoryIndex` | Simple listings | A flat list of published directories with titles/subtitles |
| `gardenCategories` | Field Notes garden | Categories → items → "DNA" detail pairs |

You can mix section types on one page.

---

## Binding to published content

Two fields pull in your published content. Both take a **reference string**:

- `"publicItem:<slug>"` — one published item (e.g. `"publicItem:terrarium"`)
- `"publicPath:/<path>"` — a whole published directory (e.g. `"publicPath:/writing"`)

There are two ways to place content in a section:

- **Manual item** — you type every field yourself. No reference needed.
- **Bound item / section** — you point at published content with `ref` or
  `bind`; the row inherits the published title/date, and anything you also set
  in the config **overrides** it. New posts in a bound directory show up
  automatically.

**Overrides are presentation only** — they never change your published note.
The same project can appear on two pages framed differently.

---

## Emphasis & the dual-font effect

Wherever you write a **title** or **label**, you can use markdown-style emphasis
to trigger the site's font tiers:

| You write | Renders as |
|---|---|
| `Digital Garden` | primary (serif) |
| `Digital *Garden*` | "Garden" in the **accent** font (italic/gold) |
| `Local-first, **human**` | "human" in the **third** font tier (bold) |

So `"Digital *Garden*"` gives you the two-tone title from the design — one field
drives both the text and the styling.

---

## Section type 1 — `recordList` (Results page)

A labeled table. Rows can be hand-listed, pulled from a bound directory, or both.

```json
{
  "sections": [
    {
      "type": "recordList",
      "label": "— Projects",
      "sort": "date-desc",
      "items": [
        {
          "title": "Digital *Garden*",
          "type": "Tool / IDE",
          "year": "2021–",
          "date": "2021-01-01",
          "status": "active",
          "statusLabel": "Active",
          "blurb": "An Obsidian-inspired IDE for thinking.",
          "facts": [
            ["Editor core", "plain-text, keyboard-first"],
            ["Link graph", "backlinks & maps"]
          ]
        },
        {
          "ref": "publicItem:terrarium",
          "type": "Sync / CRDT",
          "status": "active",
          "statusLabel": "Active"
        }
      ]
    },
    {
      "type": "recordList",
      "label": "— Writing",
      "bind": "publicPath:/writing",
      "sort": "date-desc"
    }
  ]
}
```

**Row fields:**

| Field | Meaning |
|---|---|
| `title` | Row name (emphasis supported). Required for manual rows. |
| `ref` | `publicItem:<slug>` to bind & inherit a published item. |
| `type` | Free text — "Tool / IDE", "Essay", "Engineering". |
| `year` | Display string — supports ranges like `"2021–"`, `"2018–21"`. |
| `date` | Sortable date (`YYYY` or `YYYY-MM-DD`) — used for sorting **and** the Timeline tab. |
| `status` | `active` or `done` — drives the status pill **color**. |
| `statusLabel` | The status **text** — "Active", "Stable", "18 min", "Now". |
| `blurb` | The expand-on-click description. |
| `facts` | Optional `[label, value]` pairs shown in the drawer. |
| `timelineNote` | Optional annotation on the Timeline (e.g. "the growing tip"). |
| `hidden` | `true` to keep a row in the config but off the page. |

- **`sort`**: `"date-desc"` (newest first), `"date-asc"`, or `"manual"` (keep
  the order you wrote).
- **The Timeline tab is automatic.** Any row with a `date` is placed on the
  timeline, newest first — you don't author it separately.

---

## Section type 2 — `directoryIndex` (simple listing)

A flat, numbered list of published directories, each with an overridable title
and subtitle. Article counts are filled in from the directory.

```json
{
  "sections": [
    {
      "type": "directoryIndex",
      "entries": [
        {
          "bind": "publicPath:/engineering",
          "title": "Engineering",
          "subtitle": "Distributed systems, the web platform, small code."
        },
        {
          "bind": "publicPath:/gardening",
          "title": "Gardening",
          "subtitle": "Grafting, soil, and tending things slowly."
        }
      ]
    }
  ]
}
```

---

## Section type 3 — `gardenCategories` (Field Notes)

Feeds the Field Notes leaf/DNA visualization. Three levels:
**category → item → `sub` (the DNA detail pairs).**

Each category can **bind a directory** (its published posts become items) and/or
list items by hand. Because published content is only two levels deep, the DNA
`sub` pairs are authored per item.

```json
{
  "sections": [
    {
      "type": "gardenCategories",
      "categories": [
        {
          "key": "engineering",
          "label": "Engineering",
          "title": "Engineering",
          "intro": "Distributed systems, the web platform, small code.",
          "bind": "publicPath:/engineering",
          "items": [
            {
              "title": "CRDTs in 200 lines",
              "meta": "note · 6 min",
              "blurb": "The smallest mergeable state that works.",
              "sub": [
                { "title": "Merge logic", "note": "commutative" },
                { "title": "Tombstones", "note": "gc later" }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

- **`key`** — the internal id for the category (lowercase, no spaces).
- **`bind`** — posts from this directory are added as items automatically
  (they won't have DNA `sub` pairs unless you also list them by hand).
- **`items[].sub`** — the DNA rungs: `{ "title", "note" }` pairs.

---

## Saving, validating, deleting

- The **validator** runs as you type. `✓ Valid · N sections` = safe to save.
  A red message names the exact failing field path (e.g.
  `sections.0.items.1.status: Invalid`).
- **Reset to <kind> starter** repopulates the editor with a clean template.
- **Save page** upserts the page. **Delete** removes it (the page then falls
  back to its built-in default).
- A **draft** page also falls back to the default — set **published** to go live.

---

## Slug → URL reference

| Slug | Page |
|---|---|
| `results` | `/results` (Results — `record` kind) |
| `blog` | `/blog` (Field Notes — `garden` kind) |
| *(empty)* | your home page |
| anything else | a page you're composing at that path |

Set the slug to match the route you want to control.

---

## Troubleshooting

- **My page still shows the old/default content.** The page is `draft`, or its
  slug doesn't match the route (must be `results` for `/results`, `blog` for
  `/blog`). Set visibility to `published` and confirm the slug.
- **A bound directory shows nothing.** Check the path exists and has
  **published** items, and that the `bind` string is exactly
  `publicPath:/your-path`.
- **Red validation error.** The message ends with the failing field path — jump
  to that spot in the JSON. Common ones: `status` must be `active` or `done`;
  a manual row needs a `title`; `bind`/`ref` must start with
  `publicPath:` / `publicItem:`.
- **Counts look capped.** Directory-derived counts read up to 50 items.

---

## What's next

The JSON editor is the first governance surface. A **visual builder**
(drag sections, pick directories, fill fields in forms) is planned — it will
read and write this exact same config, so anything you author now carries
forward.
