import { generateJSON, generateHTML } from "@tiptap/html/server";
import { marked } from "marked";
import { getCollaborationServerExtensions } from "@/lib/domain/collaboration/extensions";

type Node = { type?: string; content?: Node[] };

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

const backToHtml = generateHTML(toTiptap("# H\n\n- a\n- b") as never, extensions);
if (backToHtml.includes("<h1") && backToHtml.includes("<ul")) {
  console.log("  PASS  tiptap → html preserves structure");
} else {
  console.log(`  FAIL  tiptap → html lost structure: ${backToHtml.slice(0, 120)}`);
  fails++;
}

console.log(fails === 0 ? "\nmarkdown round-trip smoke: all passed" : `\nmarkdown round-trip smoke: ${fails} failed`);
process.exit(fails === 0 ? 0 : 1);
