# Publishing Block Development Guide

**Purpose:** Standardize publishing block development and prevent common errors
**Audience:** Developers and AI assistants building new publishing blocks
**Last Updated:** 2026-06-18

---

## Block Inventory

All 24 current publishing blocks. Each must satisfy every column.

| Block | File | Fixture JSON | Playwright baseline | CSS in globals.css | Notes |
|---|---|---|---|---|---|
| bookmark-card | ✅ | ✅ | ✅ | ✅ | |
| cta-banner | ✅ | ✅ | ✅ | ✅ | |
| faq-accordion | ✅ | ✅ | ✅ | ✅ | |
| feature-list | ✅ | ✅ | ✅ | ✅ | |
| gallery | ✅ | ✅ | ✅ | ✅ | |
| hero-image | ✅ | ✅ | ✅ | ✅ | Visual block; `ttsSkip: true` |
| logo-strip | ✅ | ✅ | ✅ | ✅ | |
| metrics-strip | ✅ | ✅ | ✅ | ✅ | |
| newsletter-signup | ✅ | ✅ | ✅ | ✅ | |
| person-card | ✅ | ✅ | ✅ | ✅ | |
| post-card | ✅ | ✅ | ✅ | ✅ | |
| pricing-card | ✅ | ✅ | ✅ | ✅ | |
| process-steps | ✅ | ✅ | ✅ | ✅ | |
| project-card | ✅ | ✅ | ✅ | ✅ | |
| recent-posts | ✅ | ✅ | ✅ | ✅ | Server render only; no post-processor yet |
| skill-badges | ✅ | ✅ | ✅ | ✅ | |
| social-links | ✅ | ✅ | ✅ | ✅ | |
| spacer | ✅ | ✅ | ✅ | ✅ | Minimal reference block |
| stat-block | ✅ | ✅ | ✅ | ✅ | |
| stats-table | ✅ | ✅ | ✅ | ✅ | |
| tag-cloud | ✅ | ✅ | ✅ | ✅ | |
| testimonial-card | ✅ | ✅ | ✅ | ✅ | |
| timeline | ✅ | ✅ | ✅ | ✅ | |
| video-embed | ✅ | ✅ | ✅ | ✅ | |

When adding a new block, append a row here with the block name and ❌ for each column. Check off columns as you complete each step.

---

## Development Checklist

Use this for every new block. Check items off as you go.

### Step 1 — Block file

- [ ] Created `extensions/publishing/blocks/<block-name>.ts`
- [ ] Schema defined via `createBlockSchema("blockType", { ... })`
- [ ] `registerBlock({ type, label, description, iconName, family, group, contentModel, atom, attrsSchema, defaultAttrs, slashCommand, searchTerms })` called
- [ ] `addAttributes()` helper defined using `dataAttr()` for every custom attr
- [ ] `export const MyBlock = Node.create({ ... addNodeView() ... })` — client extension with editor preview
- [ ] `export const ServerMyBlock = Node.create({ ... renderHTML() ... })` — server extension emitting semantic HTML
- [ ] `renderHTML` reads `HTMLAttributes["data-<kebab-key>"]` (not camelCase) for every attr
- [ ] Visual-only block? Add `ttsSkip: true` to `registerBlock()`

### Step 2 — Server-runtime registration

- [ ] Import `ServerMyBlock` added to `extensions/publishing/server-runtime.ts`
- [ ] `ServerMyBlock` added to `editorServerExtensions` array in same file
- [ ] `pnpm publishing:schema:check` passes

### Step 3 — CSS

- [ ] CSS added to `app/globals.css` under a named comment block (`/* ─── My Block ... */`)
- [ ] Selector prefix is `.public-prose .block-my-block` (not bare `.block-my-block`)
- [ ] No unconditional extreme colors: any `color:#fff` / `rgba(255,255,255,…)` or `color:#000`–`#333` has a `.dark .public-prose .block-*` companion rule
- [ ] `pnpm publishing:audit:themes` run; any flagged candidates reviewed and resolved

### Step 4 — Playwright fixture

- [ ] `tests/e2e/_fixtures/publishing/<block-name>.json` created with representative (non-empty) attr values
- [ ] Block name added to `PUBLISHING_FIXTURE_BLOCKS` in `tests/e2e/_fixtures/publishing/index.ts`
- [ ] `pnpm dev` running; baselines captured with `pnpm test:e2e:update -- --grep "<block-name>"`
- [ ] Light and dark PNG snapshots reviewed (not just generated)
- [ ] Fixture JSON + both PNGs committed

### Step 5 — Quality gates

- [ ] `pnpm publishing:audit:defaults` run (informational; review any drift)
- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` — zero new warnings
- [ ] `pnpm build` passes
- [ ] `pnpm test:e2e` passes (no regressions on existing blocks)
- [ ] Block inserted via slash command in browser and properties panel verified
- [ ] Published page inspected to confirm server render matches editor preview

### Step 6 — Post-merge

- [ ] **Hocuspocus redeployed** via Cloud Build (`cloudbuild.hocuspocus.yaml`) — Vercel does NOT do this. Without a redeploy, the running Cloud Run instance serializes unknown block types as `unsupportedBlock` placeholders, corrupting collaborative documents.
- [ ] Inventory table above updated (all ✅)

---

## Known Footguns

### `dataAttr()` is required — don't hand-roll attribute access

The server extension reads attrs from `HTMLAttributes["data-<kebab-key>"]`. The `dataAttr()` helper in `addAttributes()` ensures the camelCase attr is correctly mapped to the kebab data attribute. Hand-rolling this was the source of a bug in `hero-image.ts` where `ctaText`/`ctaUrl` silently dropped from every block because `attrs["cta-text"]` returned `undefined`.

**Rule:** Always use `dataAttr("camelKey")` in `addAttributes()`. Never write `{ default: "" }` directly for attrs that have a data attribute counterpart.

### Dark-mode-first CSS causes invisible blocks on light pages

Eight publishing blocks shipped with `color: #fff` or similar unconditional white text — invisible on light-mode published pages. This was found and fixed after the fact (commits `61cb06c`, `4410c2d`).

**Rule:** Every `.public-prose .block-*` rule that uses a hardcoded extreme color must have a `.dark .public-prose .block-*` companion. Use `pnpm publishing:audit:themes` to catch candidates before review.

### Hocuspocus must be redeployed — Vercel doesn't do it

The Next.js app and the Hocuspocus server are separate deployments. Vercel auto-deploys the Next.js app on push. The Hocuspocus Cloud Run service does not auto-redeploy. A block type unknown to the running Hocuspocus instance is serialized as `unsupportedBlock` via the `sanitizeTipTapJsonWithExtensions()` safety net — this corrupts documents in collaborative sessions.

**Rule:** After any block addition merges to main, trigger a Cloud Build run (`cloudbuild.hocuspocus.yaml`).

### `renderHTML` in the server extension reads kebab keys, not camel

In `addAttributes()`, you define `ctaText: dataAttr("ctaText")`. In `renderHTML`, TipTap passes this back as `HTMLAttributes["data-cta-text"]` (auto-kebab'd). Read it as `HTMLAttributes["data-cta-text"]`, not `HTMLAttributes["data-ctaText"]` or `HTMLAttributes["ctaText"]`.

### Fixture images should be inline data-URIs

Network images in fixture JSON are fragile in CI. Use an inline SVG data-URI as a placeholder (see `hero-image.json`). This keeps fixtures self-contained and snapshot-stable across environments.

---

## Block File Template

Minimal complete block (copy, replace `MyBlock` / `myBlock` / `my-block`):

```ts
/**
 * MyBlock — Publishing Block
 *
 * One sentence description.
 *
 * Attrs:
 * - title    heading text
 * - variant  "a" | "b"
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { blockIdAttr, dataAttr } from "@/lib/domain/blocks/data-attr";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";

const { schema, defaults } = createBlockSchema("myBlock", {
  title: z.string().default("").describe("Block heading"),
  variant: z.enum(["a", "b"]).default("a").describe("Visual variant"),
});

registerBlock({
  type: "myBlock",
  label: "My Block",
  description: "One sentence describing the block",
  iconName: "LayoutTemplate",   // lucide icon name
  family: "content",            // "content" | "layout" | "form"
  group: "publishing",
  contentModel: null,
  atom: true,
  attrsSchema: schema,
  defaultAttrs: defaults(),
  slashCommand: "/my-block",
  searchTerms: ["my-block", "block"],
});

function myBlockAttrs() {
  return {
    blockId: blockIdAttr,
    blockType: { default: "myBlock" },
    title: dataAttr("title"),
    variant: dataAttr("variant", { default: "a" }),
  };
}

// ─── Client extension ─────────────────────────────────────────────────────────

export const MyBlock = Node.create({
  name: "myBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes: myBlockAttrs,
  parseHTML() { return [{ tag: 'div[data-block-type="myBlock"]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-block-type": "myBlock" })];
  },
  addNodeView() {
    return createBlockNodeView({
      blockType: "myBlock",
      label: "My Block",
      iconName: "LayoutTemplate",
      atom: true,
      renderContent(node, contentDom) {
        contentDom.innerHTML = `<p style="margin:0">${node.attrs.title as string || "My Block"}</p>`;
      },
      updateContent(node, contentDom) {
        contentDom.innerHTML = `<p style="margin:0">${node.attrs.title as string || "My Block"}</p>`;
        return true;
      },
    });
  },
});

// ─── Server extension ─────────────────────────────────────────────────────────

export const ServerMyBlock = Node.create({
  name: "myBlock",
  group: "block",
  atom: true,
  addAttributes: myBlockAttrs,
  parseHTML() { return [{ tag: 'div[data-block-type="myBlock"]' }]; },
  renderHTML({ HTMLAttributes }) {
    // Read kebab-case data attributes — TipTap auto-kebabs camelCase attr names
    const title = (HTMLAttributes["data-title"] as string) || "";
    const variant = (HTMLAttributes["data-variant"] as string) || "a";
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: `block-my-block block-my-block--${variant}`,
        "data-block-type": "myBlock",
      }),
      ["h2", { class: "block-my-block-title" }, title],
    ];
  },
});
```

**Fixture JSON** (`tests/e2e/_fixtures/publishing/my-block.json`):

```json
{
  "type": "doc",
  "content": [
    {
      "type": "myBlock",
      "attrs": {
        "blockType": "myBlock",
        "title": "Example heading for snapshot",
        "variant": "a"
      }
    }
  ]
}
```

**CSS** (`app/globals.css`):

```css
/* ─── My Block ───────────────────────────────────────────────────────────── */
.public-prose .block-my-block {
  margin: 2em 0;
  padding: 2rem;
  border-radius: 8px;
  background: #f9fafb;
}
.public-prose .block-my-block-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
}
/* Dark mode companions — required for any hardcoded light color above */
.dark .public-prose .block-my-block { background: #1f2937; }
.dark .public-prose .block-my-block-title { color: #f9fafb; }
```

---

## Reference: Block registry fields

| Field | Type | Notes |
|---|---|---|
| `type` | `string` | Must match `Node.create({ name })` exactly |
| `label` | `string` | Display name in slash command menu |
| `description` | `string` | Shown in block picker tooltip |
| `iconName` | `string` | Lucide icon name |
| `family` | `"content" \| "layout" \| "form"` | Determines sort group in slash menu |
| `group` | `string` | Sub-group within family |
| `contentModel` | `null \| "inline"` | `null` = atom block; `"inline"` = wraps inline content |
| `atom` | `boolean` | Set `true` when `contentModel: null` |
| `attrsSchema` | Zod schema | From `createBlockSchema()` |
| `defaultAttrs` | object | From `defaults()` returned by `createBlockSchema()` |
| `slashCommand` | `string` | The `/` prefix for the slash command |
| `searchTerms` | `string[]` | Additional search keywords |
| `ttsSkip` | `boolean?` | `true` for visual blocks with no narratable content |

---

## CI Gates Reference

| Gate | Script | Hard? | When |
|---|---|---|---|
| Block + Server* export check | `pnpm publishing:schema:check` | ✅ Hard | PR touches `extensions/publishing/` |
| Zod defaults vs renderHTML fallback drift | `pnpm publishing:audit:defaults` | ℹ️ Info | Same |
| CSS extreme colors without dark companion | `pnpm publishing:audit:themes` | ℹ️ Info | Same |
| Per-block Playwright snapshots | `pnpm test:e2e` | ✅ Hard | PR touches publishing surface |
| TypeScript + lint | `pnpm typecheck && pnpm lint` | ✅ Hard | Every PR |

Bypass Playwright gate temporarily: set repo var `PUBLISHING_VISUAL_GATE=skip`.
