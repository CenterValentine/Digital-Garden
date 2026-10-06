/**
 * OCR reflow gate — `pnpm ocr:blocks:check`. OCR-PASTE-PLAN.md D6.
 *
 * Pins the rule that turns Tesseract's one-line-per-visual-line output into
 * paste-ready text (lib/features/ocr/reflow.ts), and the hand-off to TipTap
 * blocks (lib/features/ocr/to-content.ts). Fixture-based, no engine, no network.
 * Each case names the rule it pins, so a failure says which judgement broke.
 */
import { generateHTML, generateJSON } from "@tiptap/html/server";
import type { JSONContent } from "@tiptap/core";

import { getCollaborationServerExtensions } from "@/lib/domain/collaboration/extensions";
import { decompressMarkdown } from "@/lib/domain/content/markdown-decompress";
import { markdownToTiptapRich, type HtmlBridge } from "@/lib/domain/content/markdown-serialize";
import { reflowOcrText } from "@/lib/features/ocr/reflow";
import { buildOcrContent } from "@/lib/features/ocr/to-content";

// tsx-safe twin of `markdownPasteToTiptap` (decompress → rich parse), with the
// collaboration extension set and the zeed-dom HTML bridge — the same setup
// validate-markdown-block-safety.ts uses.
const ext = getCollaborationServerExtensions();
const bridge: HtmlBridge = {
  toHtml: (j, e) => generateHTML(j, e),
  toJson: (h, e) => generateJSON(h, e) as JSONContent,
};
const ocrTextToContent = (raw: string) =>
  buildOcrContent(raw, (md) => markdownToTiptapRich(decompressMarkdown(md), ext, bridge));

let fails = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  PASS  ${name}`);
  } else {
    fails++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}

console.log("reflow — line ends");

check(
  "word-wrap joins with a space",
  reflowOcrText(
    "The quick brown fox jumps over the lazy dog and keeps\nrunning across the field until it reaches the far side\nof the river.",
  ),
  "The quick brown fox jumps over the lazy dog and keeps running across the field until it reaches the far side of the river.",
);

check(
  "blank line is a paragraph break",
  reflowOcrText("First paragraph is here.\n\nSecond paragraph is here."),
  "First paragraph is here.\n\nSecond paragraph is here.",
);

// Long lines and a lowercase start, so no other rule could produce the break —
// only the blank line itself. (A mutation run showed the short-sentence rule
// masking a broken paragraph split in the fixture above.)
check(
  "blank line breaks even when nothing else would",
  reflowOcrText(
    "This first paragraph has one long line that keeps going well past forty\n\nand this second one starts lowercase and is also a fairly long line",
  ),
  "This first paragraph has one long line that keeps going well past forty\n\nand this second one starts lowercase and is also a fairly long line",
);

check(
  "hyphenated wrap rejoins the word",
  reflowOcrText(
    "This sentence contains a word that the scanner has infor-\nmation split across two lines of the page we photographed.",
  ),
  "This sentence contains a word that the scanner has information split across two lines of the page we photographed.",
);

check(
  "a line that stops short of the column is a real break (heading)",
  reflowOcrText(
    "Quarterly Results\nRevenue grew by twelve percent over the prior quarter, driven by\nstrong demand in the enterprise segment.",
  ),
  "Quarterly Results\n\nRevenue grew by twelve percent over the prior quarter, driven by strong demand in the enterprise segment.",
);

check(
  "short sentence lines stay separate",
  reflowOcrText("Hello there.\nThanks for writing."),
  "Hello there.\n\nThanks for writing.",
);

check(
  "short lines without sentence ends join",
  reflowOcrText("Hello  world\r\nagain"),
  "Hello world again",
);

console.log("reflow — lists");

check(
  "bullet glyphs become one markdown list",
  reflowOcrText("• Apples\n• Bananas\n• Cherries"),
  "- Apples\n- Bananas\n- Cherries",
);

check(
  "1) markers normalise to 1.",
  reflowOcrText("1) First step\n2) Second step"),
  "1. First step\n2. Second step",
);

check(
  "a wrapped list item continues the item",
  reflowOcrText(
    "- A long item that wraps onto the next line because the column is\nnarrow and then it continues here\n- Second item",
  ),
  "- A long item that wraps onto the next line because the column is narrow and then it continues here\n- Second item",
);

check(
  "prose after a list's short last line is its own paragraph",
  reflowOcrText("- Apples\n- Bananas\nThat is everything we need to buy at the store this week."),
  "- Apples\n- Bananas\n\nThat is everything we need to buy at the store this week.",
);

check(
  "lettered items stay on their own lines",
  reflowOcrText("a) First option\nb) Second option"),
  "a) First option\n\nb) Second option",
);

check("whitespace-only input is empty", reflowOcrText("  \n\n \f "), "");

console.log("to-content — blocks");

const types = (content: JSONContent[]) => content.map((n) => n.type);

check("no text → no blocks", ocrTextToContent("   "), []);

check(
  "a screenshotted list becomes a real bullet list",
  types(ocrTextToContent("• Apples\n• Bananas\n• Cherries")),
  ["bulletList"],
);

check(
  "prose stays paragraphs (never parsed as markup)",
  ocrTextToContent("Price is *about* 5 dollars.\n\nSee you soon."),
  [
    { type: "paragraph", content: [{ type: "text", text: "Price is *about* 5 dollars." }] },
    { type: "paragraph", content: [{ type: "text", text: "See you soon." }] },
  ],
);

check(
  "a list the parser cannot read falls back to lines with hard breaks",
  buildOcrContent("• Apples\n• Bananas", () => ({ type: "doc", content: [] })),
  [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "- Apples" },
        { type: "hardBreak" },
        { type: "text", text: "- Bananas" },
      ],
    },
  ],
);

if (fails > 0) {
  console.log(`\nocr:blocks:check — ${fails} failure(s)`);
  process.exit(1);
}
console.log("\nocr:blocks:check — all passed");
