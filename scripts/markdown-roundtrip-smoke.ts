import { generateJSON, generateHTML } from "@tiptap/html/server";
import { marked } from "marked";
import { getCollaborationServerExtensions } from "@/lib/domain/collaboration/extensions";
import { decompressMarkdown } from "@/lib/domain/content/markdown-decompress";
import { isLikelyMarkdown } from "@/lib/domain/content/markdown-detect";

type Node = {
  type?: string;
  text?: string;
  marks?: Array<{ type?: string }>;
  content?: Node[];
};

const extensions = getCollaborationServerExtensions();

function toTiptap(md: string): Node {
  const html = marked.parse(md, { async: false, gfm: true }) as string;
  return generateJSON(html, extensions) as Node;
}

function nodeTypes(doc: Node): Set<string> {
  const seen = new Set<string>();
  const walk = (n: Node) => {
    if (n.type) seen.add(n.type);
    for (const c of n.content ?? []) walk(c);
  };
  walk(doc);
  return seen;
}

const cases: Array<{ name: string; md: string; expect: string[] }> = [
  { name: "heading", md: "# Title\n\n## Sub", expect: ["heading"] },
  { name: "bullet list", md: "- one\n- two", expect: ["bulletList", "listItem"] },
  { name: "ordered list", md: "1. one\n2. two", expect: ["orderedList", "listItem"] },
  { name: "blockquote", md: "> quoted", expect: ["blockquote"] },
  { name: "code block", md: "```\ncode\n```", expect: ["codeBlock"] },
  { name: "table", md: "| a | b |\n|---|---|\n| 1 | 2 |", expect: ["table", "tableRow"] },
  { name: "bold+italic", md: "**bold** and *italic*", expect: ["paragraph", "text"] },
  { name: "link", md: "[dg](https://example.com)", expect: ["paragraph", "text"] },
  { name: "mixed", md: "# H\n\n- a\n- b\n\n> q\n\n**x**", expect: ["heading", "bulletList", "blockquote"] },
];

let fails = 0;

for (const c of cases) {
  const types = nodeTypes(toTiptap(c.md));
  const missing = c.expect.filter((t) => !types.has(t));
  if (missing.length === 0) {
    console.log(`  PASS  ${c.name}`);
  } else {
    console.log(`  FAIL  ${c.name} — missing: ${missing.join(", ")} (got: ${[...types].join(", ")})`);
    fails++;
  }
}

const plain = "just a sentence with no structure";
const plainTypes = nodeTypes(toTiptap(plain));
if (plainTypes.has("heading") || plainTypes.has("bulletList")) {
  console.log("  FAIL  plain text should stay a paragraph");
  fails++;
} else {
  console.log("  PASS  plain text stays a paragraph");
}

const pastedFrontmatter = `---
name: Company Research Directive
description: How to research a company thoroughly before writing anything about it.
---
Phase A: Surface facts
Find the product and funding.
Phase B: Read between the lines
Infer the current priorities.`;
const frontmatterDoc = toTiptap(decompressMarkdown(pastedFrontmatter));
const topLevel = frontmatterDoc.content ?? [];
const dividerCount = topLevel.filter(
  (node) => node.type === "horizontalRule",
).length;
const headingTexts = topLevel
  .filter((node) => node.type === "heading")
  .map((node) =>
    (node.content ?? [])
      .map((child) => child.text ?? "")
      .join(""),
  );
const boldLabels: string[] = [];
const collectBoldLabels = (node: Node) => {
  if (
    node.text?.endsWith(":") &&
    node.marks?.some((mark) => mark.type === "bold")
  ) {
    boldLabels.push(node.text);
  }
  for (const child of node.content ?? []) collectBoldLabels(child);
};
collectBoldLabels(frontmatterDoc);
const textContent = (node: Node): string =>
  [node.text ?? "", ...(node.content ?? []).map(textContent)].join("");
const frontmatterText = textContent(frontmatterDoc);
if (
  dividerCount === 2 &&
  headingTexts.length === 0 &&
  ["name:", "description:", "Phase A:", "Phase B:"].every((label) =>
    boldLabels.includes(label),
  ) &&
  frontmatterText.includes("name: Company Research Directive") &&
  frontmatterText.includes("Phase A: Surface facts") &&
  frontmatterText.includes("Phase B: Read between the lines")
) {
  console.log(
    "  PASS  pasted labels are bold paragraph text between two dividers",
  );
} else {
  console.log(
    `  FAIL  pasted frontmatter parsed incorrectly — dividers=${dividerCount}, headings=${JSON.stringify(headingTexts)}, bold labels=${JSON.stringify(boldLabels)}`,
  );
  fails++;
}

const backToHtml = generateHTML(toTiptap("# H\n\n- a\n- b") as never, extensions);
if (backToHtml.includes("<h1") && backToHtml.includes("<ul")) {
  console.log("  PASS  tiptap → html preserves structure");
} else {
  console.log(`  FAIL  tiptap → html lost structure: ${backToHtml.slice(0, 120)}`);
  fails++;
}

// ── Table paste ──────────────────────────────────────────────────────────────
// Detection gate + decompression safety for the "paste markdown" path. A table
// is the one construct whose lines can only be read in context, so both halves
// used to get it wrong: detection counted `|…|` line shapes (missing GFM's
// optional outer pipes), and the decompressor rewrote rows line-by-line.
console.log();
const pasteToTiptap = (md: string) => toTiptap(decompressMarkdown(md));
const tableShape = (md: string): string => {
  const table = (pasteToTiptap(md).content ?? []).find((n) => n.type === "table");
  if (!table) return "no table";
  const rows = table.content ?? [];
  return `${rows.length}x${rows[0]?.content?.length ?? 0}`;
};

for (const [name, md] of [
  ["outer pipes", "| Claim | Evidence |\n| --- | --- |\n| 1.1M | Dashboard |"],
  ["no outer pipes", "Claim | Evidence\n--- | ---\n1.1M | Dashboard"],
  ["aligned delimiters", "| Claim | Evidence |\n|:---|---:|\n| 1.1M | Dashboard |"],
  ["cells with numbered items", "| Step | Detail |\n| --- | --- |\n| 1. first 2. second | notes |"],
] as Array<[string, string]>) {
  const detected = isLikelyMarkdown(md);
  const shape = tableShape(md);
  if (detected && shape === "2x2") {
    console.log(`  PASS  paste table (${name}) — detected, ${shape}`);
  } else {
    console.log(`  FAIL  paste table (${name}) — detected=${detected}, shape=${shape}`);
    fails++;
  }
}

// Prose that merely contains a pipe must NOT be mistaken for a table.
if (isLikelyMarkdown("run a | b to pipe the output")) {
  console.log("  FAIL  a bare pipe in prose was detected as markdown");
  fails++;
} else {
  console.log("  PASS  a bare pipe in prose is not a table");
}

// The decompressor's line rewrites are destructive inside a fence (code is
// literal) and inside a table (splitting a row breaks the grid).
for (const [name, md] of [
  ["fenced code, numbered run", "```js\nconst steps = 1. first 2. second\n```"],
  ["fenced code, heading-ish line", "```\n# not a heading ## nope\n```"],
  ["table row, numbered run", "| Step | Detail |\n| --- | --- |\n| 1. first 2. second | notes |"],
  ["table row, label-ish cell", "Claim: | Evidence\n--- | ---\n1.1M | Dashboard"],
] as Array<[string, string]>) {
  if (decompressMarkdown(md) === md) {
    console.log(`  PASS  decompress leaves ${name} untouched`);
  } else {
    console.log(`  FAIL  decompress rewrote ${name}: ${JSON.stringify(decompressMarkdown(md)).slice(0, 90)}`);
    fails++;
  }
}

// ── Browser-build parity (turndown ships two builds) ─────────────────────────
// The block-safety gate runs turndown's NODE build, which parses the HTML with
// domino. The source-view toggle runs in the browser, where Turbopack picks
// turndown's browser build and the tree comes from `DOMParser` instead. Our
// table rules walk that tree (childNodes/parentNode/nodeName), so a difference
// between the two DOM implementations would ship a table bug the gate can't
// see. Assert both builds produce byte-identical markdown for the table shapes
// that matter — and that the shape is GFM, not the raw-HTML fallback.
async function checkTurndownBuildParity(): Promise<void> {
  const { JSDOM } = await import("jsdom");
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const globals = globalThis as unknown as Record<string, unknown>;
  // turndown's browser build reaches for these at parse time, not import time.
  globals.document = dom.window.document;
  globals.DOMParser = dom.window.DOMParser;

  const { createTurndown } = await import("@/lib/domain/content/markdown-serialize");
  const BrowserTurndown = (await import("turndown/lib/turndown.browser.es.js")).default;
  const nodeBuild = createTurndown();
  const browserBuild = createTurndown(BrowserTurndown);

  // TipTap's own table HTML: <colgroup> ahead of <tbody> is the shape that used
  // to defeat turndown-plugin-gfm's heading-row test and leak raw HTML.
  const cell = (tag: string, text: string) =>
    `<${tag} colspan="1" rowspan="1"><p>${text}</p></${tag}>`;
  const tiptapTable = (rows: string[]) =>
    `<table style="min-width: 50px;"><colgroup><col style="min-width: 25px;"><col style="min-width: 25px;"></colgroup><tbody>${rows.join("")}</tbody></table>`;

  const samples: Array<{ name: string; html: string; want: "gfm" | "html" }> = [
    {
      name: "header row",
      html: tiptapTable([
        `<tr>${cell("th", "Claim")}${cell("th", "Evidence")}</tr>`,
        `<tr>${cell("td", "1.1M")}${cell("td", "Dashboard")}</tr>`,
      ]),
      want: "gfm",
    },
    {
      name: "pipes in cells",
      html: tiptapTable([
        `<tr>${cell("th", "a|b")}${cell("th", "c")}</tr>`,
        `<tr>${cell("td", "x | y")}${cell("td", "z")}</tr>`,
      ]),
      want: "gfm",
    },
    {
      name: "explicit thead",
      html: `<table><thead><tr>${cell("th", "A")}${cell("th", "B")}</tr></thead><tbody><tr>${cell("td", "1")}${cell("td", "2")}</tr></tbody></table>`,
      want: "gfm",
    },
    {
      name: "headerless (no GFM form)",
      html: tiptapTable([
        `<tr>${cell("td", "A")}${cell("td", "B")}</tr>`,
        `<tr>${cell("td", "1")}${cell("td", "2")}</tr>`,
      ]),
      want: "html",
    },
  ];

  for (const sample of samples) {
    const fromNode = nodeBuild.turndown(sample.html).trim();
    const fromBrowser = browserBuild.turndown(sample.html).trim();
    const shape = fromNode.startsWith("<table") ? "html" : "gfm";
    if (fromNode !== fromBrowser) {
      console.log(`  FAIL  table (${sample.name}) — builds disagree`);
      console.log(`          node   : ${fromNode.replace(/\n/g, "\\n").slice(0, 90)}`);
      console.log(`          browser: ${fromBrowser.replace(/\n/g, "\\n").slice(0, 90)}`);
      fails++;
    } else if (shape !== sample.want) {
      console.log(`  FAIL  table (${sample.name}) — expected ${sample.want}, got ${shape}: ${fromNode.slice(0, 70)}`);
      fails++;
    } else if (sample.want === "gfm" && !fromNode.includes("| --- |")) {
      console.log(`  FAIL  table (${sample.name}) — GFM output has no header separator: ${fromNode.slice(0, 70)}`);
      fails++;
    } else {
      console.log(`  PASS  table (${sample.name}) — node/browser builds agree [${shape}]`);
    }
  }

  // The escape has to survive the DOM round-trip in BOTH builds, or a pipe in a
  // cell silently invents a column on re-parse.
  const escaped = browserBuild
    .turndown(tiptapTable([`<tr>${cell("th", "a|b")}${cell("th", "c")}</tr>`]))
    .trim();
  if (escaped.includes("a\\|b")) {
    console.log("  PASS  table pipes escaped in the browser build");
  } else {
    console.log(`  FAIL  table pipes not escaped in the browser build: ${escaped.slice(0, 70)}`);
    fails++;
  }
}

void checkTurndownBuildParity().then(() => {
  console.log(fails === 0 ? "\nmarkdown round-trip smoke: all passed" : `\nmarkdown round-trip smoke: ${fails} failed`);
  process.exit(fails === 0 ? 0 : 1);
});
