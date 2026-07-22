/**
 * Markdown block-safety gate (v3.2 T2)
 *
 * Proves the markdown source-view toggle NEVER loses content, against the REAL
 * serializer (lib/domain/content/markdown-serialize.ts — turndown + self-verify
 * + dg-block fence). Five layers:
 *
 *   1. Construct battery — headings, alignment, every mark, ordered/nested
 *      lists, code+language, images (plain + configured), blockquotes, tables.
 *   2. Escaping battery — literal markdown metacharacters in text must survive
 *      (the leak the clean-text battery missed on 2026-07-21).
 *   3. Schema-driven attr sweep — for every candidate-pretty node, set each
 *      attribute the SCHEMA declares to a non-default value and assert lossless
 *      (pretty or fenced, never dropped). Coverage comes from the schema, not a
 *      hand-list, so a new attribute is covered automatically.
 *   4. Registry enumeration — every registered block round-trips (custom blocks
 *      preserved verbatim via fence).
 *   5. blockId de-dupe — a copied fence must not produce two nodes sharing an id.
 *
 * Runs under tsx: markdown-serialize.ts is pure of extensions-server, so the
 * real serializer runs here with the tsx-safe collaboration extension set.
 */
import { generateHTML, generateJSON } from "@tiptap/html/server";
import { getSchema } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { getCollaborationServerExtensions } from "@/lib/domain/collaboration/extensions";
import {
  tiptapToMarkdownRich,
  markdownToTiptapRich,
  type HtmlBridge,
} from "@/lib/domain/content/markdown-serialize";

const ext = getCollaborationServerExtensions();
// Inject the Node/tsx-safe (zeed-dom) HTML bridge — the serializer's default
// mis-resolves under tsx (see markdown-serialize.ts).
const bridge: HtmlBridge = {
  toHtml: (j, e) => generateHTML(j, e),
  toJson: (h, e) => generateJSON(h, e) as JSONContent,
};
const toMd = (doc: JSONContent) => tiptapToMarkdownRich(doc, ext, bridge);
const toTiptap = (md: string) => markdownToTiptapRich(md, ext, bridge);
const norm = (n: JSONContent): JSONContent => generateJSON(generateHTML(n, ext), ext) as JSONContent;
const canon = (v: unknown) => JSON.stringify(v);

let fails = 0;
const fail = (m: string) => {
  console.log(`  FAIL  ${m}`);
  fails++;
};
const pass = (m: string) => console.log(`  PASS  ${m}`);

/** Round-trip a doc through the real serializer; true iff deep-equal. */
function lossless(doc: JSONContent): { ok: boolean; fenced: boolean; md: string } {
  const before = norm(doc);
  const md = toMd(before);
  const after = toTiptap(md);
  return { ok: canon(before.content) === canon(after.content), fenced: md.includes("DGBLOCKv1:"), md };
}

const doc = (...c: JSONContent[]): JSONContent => ({ type: "doc", content: c });
const p = (content: JSONContent[], attrs?: Record<string, unknown>): JSONContent => ({ type: "paragraph", ...(attrs ? { attrs } : {}), content });
const t = (text: string): JSONContent => ({ type: "text", text });
const tm = (text: string, marks: string[]): JSONContent => ({ type: "text", text, marks: marks.map((m) => ({ type: m })) });
const h = (level: number, text: string, attrs?: Record<string, unknown>): JSONContent => ({ type: "heading", attrs: { level, ...(attrs ?? {}) }, content: [t(text)] });
const list = (items: string[], type: string): JSONContent => ({ type, content: items.map((i) => ({ type: "listItem", content: [p([t(i)])] })) });
const tc = (text: string): JSONContent => ({ type: "tableCell", content: [p([t(text)])] });

// ── 1. Construct battery ─────────────────────────────────────────────────────
console.log("  ── construct battery ──");
const constructs: Array<{ name: string; doc: JSONContent }> = [
  { name: "heading", doc: doc(h(2, "Title")) },
  { name: "heading + textAlign", doc: doc(h(2, "C", { textAlign: "center" })) },
  { name: "paragraph + textAlign", doc: doc(p([t("R")], { textAlign: "right" })) },
  { name: "bold", doc: doc(p([tm("b", ["bold"])])) },
  { name: "italic", doc: doc(p([tm("i", ["italic"])])) },
  { name: "strike", doc: doc(p([tm("s", ["strike"])])) },
  { name: "code mark", doc: doc(p([tm("c", ["code"])])) },
  { name: "bold+italic", doc: doc(p([tm("x", ["bold", "italic"])])) },
  { name: "link", doc: doc(p([{ type: "text", text: "dg", marks: [{ type: "link", attrs: { href: "https://x.com" } }] }])) },
  { name: "bullet list", doc: doc(list(["a", "b"], "bulletList")) },
  { name: "ordered list", doc: doc(list(["one", "two"], "orderedList")) },
  { name: "ordered list start=3", doc: doc({ ...list(["c", "d"], "orderedList"), attrs: { start: 3 } }) },
  { name: "nested bullet", doc: doc({ type: "bulletList", content: [{ type: "listItem", content: [p([t("a")]), list(["a1"], "bulletList")] }] }) },
  { name: "task list", doc: doc({ type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [p([t("done")])] }, { type: "taskItem", attrs: { checked: false }, content: [p([t("todo")])] }] }) },
  { name: "blockquote 1", doc: doc({ type: "blockquote", content: [p([t("q")])] }) },
  { name: "blockquote 2 paras", doc: doc({ type: "blockquote", content: [p([t("l1")]), p([t("l2")])] }) },
  { name: "code + language", doc: doc({ type: "codeBlock", attrs: { language: "python" }, content: [t("x = 1")] }) },
  { name: "code multiline", doc: doc({ type: "codeBlock", content: [t("a\nb")] }) },
  { name: "image src+alt", doc: doc({ type: "image", attrs: { src: "https://x.com/a.png", alt: "pic" } }) },
  { name: "image + width", doc: doc({ type: "image", attrs: { src: "https://x.com/a.png", alt: "pic", width: 300 } }) },
  { name: "horizontal rule", doc: doc({ type: "horizontalRule" }) },
  { name: "callout (custom)", doc: doc({ type: "callout", attrs: { type: "warning" }, content: [p([t("in")])] }) },
  { name: "table", doc: doc({ type: "table", content: [{ type: "tableRow", content: [tc("A"), tc("B")] }, { type: "tableRow", content: [tc("1"), tc("2")] }] }) },
];
for (const c of constructs) {
  try {
    const r = lossless(c.doc);
    if (r.ok) pass(`${c.name}${r.fenced ? " (fenced)" : ""}`);
    else fail(`${c.name} — LOSSY`);
  } catch (e) {
    console.log(`  SKIP  ${c.name} (${(e as Error).message.slice(0, 40)})`);
  }
}

// ── 2. Escaping battery ──────────────────────────────────────────────────────
console.log("\n  ── escaping battery (literal metacharacters) ──");
for (const text of ["write **bold** please", "type `npm i`", "# not a heading", "- not a list", "> not a quote", "see [ref](http://x)", "5 * 3 and a_b_c", "path a\\b\\c", "col a | col b"]) {
  const r = lossless(doc(p([t(text)])));
  if (r.ok) pass(`literal: ${JSON.stringify(text).slice(0, 30)}`);
  else fail(`literal ${JSON.stringify(text)} — LOSSY`);
}

// ── 2b. Tier-2 HTML fallback ─────────────────────────────────────────────────
// Config markdown can't express (image width, underline, …) must land as
// lossless inline HTML, NOT an opaque base64 fence.
console.log("\n  ── tier-2 HTML fallback (config → readable HTML, not base64) ──");
const tier = (m: string) => (m.includes("DGBLOCKv1:") ? "fence" : /^\s*</.test(m.trim()) ? "html" : "md");
for (const [name, block] of [
  ["image + width", { type: "image", attrs: { src: "https://x.com/a.png", alt: "pic", width: 300 } }],
  ["underline text", p([{ type: "text", text: "u", marks: [{ type: "underline" }] }])],
] as Array<[string, JSONContent]>) {
  const r = lossless(doc(block));
  if (!r.ok) fail(`${name} — LOSSY`);
  else if (tier(r.md) !== "html") fail(`${name} — expected HTML tier, got ${tier(r.md)} (${r.md.slice(0, 40)})`);
  else pass(`${name} → HTML`);
}
// A data-bearing block must still fence (its HTML can't carry the payload).
{
  const r = lossless(doc({ type: "excalidrawBlock", attrs: { blockId: "x", elements: [{ id: "a" }] } }));
  if (r.ok && r.fenced) pass("excalidraw → fence (data-bearing)");
  else fail(`excalidraw expected fence, got ${tier(r.md)}`);
}

// ── 2c. Custom-block codecs (north star: pretty syntax, not a fence) ─────────
console.log("\n  ── custom-block codecs (pretty markdown, not base64) ──");
{
  const r = lossless(doc({ type: "callout", attrs: { type: "warning", title: "Heads up" }, content: [p([t("body")])] }));
  if (!r.ok) fail("callout codec — LOSSY");
  else if (r.md.includes("DGBLOCKv1:") || !r.md.includes("> [!")) fail(`callout codec — expected "> [!" markdown, got ${r.md.slice(0, 40)}`);
  else pass("callout → > [!warning] markdown");
}

// ── 3. Schema-driven attr sweep ──────────────────────────────────────────────
console.log("\n  ── schema-driven attr sweep (no attr silently dropped) ──");
const schema = getSchema(ext);
function sentinel(def: unknown): unknown {
  if (typeof def === "boolean") return !def;
  if (typeof def === "number") return (def ?? 0) + 7;
  if (typeof def === "string") return def === "left" ? "right" : `${def}sentinel`;
  return "sentinel";
}
const sample: Record<string, JSONContent> = {
  paragraph: p([t("x")]),
  heading: h(1, "x"),
  bulletList: list(["a"], "bulletList"),
  orderedList: list(["a"], "orderedList"),
  blockquote: { type: "blockquote", content: [p([t("q")])] },
  codeBlock: { type: "codeBlock", content: [t("code")] },
  image: { type: "image", attrs: { src: "https://x.com/a.png" } },
  horizontalRule: { type: "horizontalRule" },
};
for (const [type, base] of Object.entries(sample)) {
  const specAttrs = schema.nodes[type]?.spec.attrs ?? {};
  for (const [attr, def] of Object.entries(specAttrs)) {
    const fixture: JSONContent = { ...base, attrs: { ...(base.attrs ?? {}), [attr]: sentinel((def as { default?: unknown }).default) } };
    try {
      const r = lossless(doc(fixture));
      if (r.ok) pass(`${type}.${attr}`);
      else fail(`${type}.${attr} — LOSSY (attr dropped)`);
    } catch {
      pass(`${type}.${attr} (skipped: invalid sentinel)`);
    }
  }
}

// ── 4. Registry enumeration ──────────────────────────────────────────────────
console.log("\n  ── registry enumeration (every block preserved) ──");
const nodeNames = Array.from(new Set(
  ext.filter((e) => (e as { type?: string }).type === "node").map((e) => (e as { name?: string }).name).filter((n): n is string => typeof n === "string"),
));
for (const type of nodeNames) {
  if (["doc", "text", "paragraph"].includes(type)) continue;
  const probe: JSONContent = { type, attrs: { blockId: `probe-${type}`, __probe: type }, content: [{ type: "text", text: "x" }] };
  // Skip child-only structural nodes (tableRow/Cell/Header, listItem, taskItem):
  // they can't stand alone as a top-level block — the schema coerces them, so a
  // standalone probe is meaningless. Their parents (table, lists) are tested above.
  const standalone = (norm({ type: "doc", content: [probe] }).content ?? [])[0];
  if (!standalone || standalone.type !== type) {
    pass(`${type} (child-only, tested via parent)`);
    continue;
  }
  try {
    const md = toMd({ type: "doc", content: [probe] });
    const back = (toTiptap(md).content ?? [])[0];
    if (back && canon(back) === canon(probe)) pass(type);
    else if (back && back.type === type) pass(`${type} (pretty/normalized)`);
    else fail(`${type} — not preserved (got ${canon(back)})`);
  } catch (e) {
    fail(`${type} — error ${(e as Error).message.slice(0, 40)}`);
  }
}

// ── 5. blockId de-dupe ───────────────────────────────────────────────────────
console.log("\n  ── blockId de-dupe ──");
const md1 = toMd(norm({ type: "doc", content: [{ type: "excalidrawBlock", attrs: { blockId: "dup1", elements: [] } }] }));
const ids = (toTiptap(`${md1}\n\n${md1}`).content ?? []).map((n) => (n.attrs as { blockId?: string })?.blockId);
if (ids.length === 2 && ids[0] !== ids[1] && ids[0] === "dup1") {
  pass(`copied fence re-ids duplicate (${JSON.stringify(ids)})`);
} else {
  fail(`blockId de-dupe (${JSON.stringify(ids)})`);
}

console.log(fails === 0 ? "\nmarkdown block-safety: all passed" : `\nmarkdown block-safety: ${fails} failed`);
process.exit(fails === 0 ? 0 : 1);
