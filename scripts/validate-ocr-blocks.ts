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
import { normalizeOcrLanguages } from "@/lib/features/ocr/languages";
import { tableMarkdown } from "@/lib/features/ocr/table";
import { isAiPasteChord, isPasteAsTextChord } from "@/lib/features/ocr/paste-modifier";
import { buildAiContent } from "@/lib/features/ocr/to-content";
import { isFragmented, readingOrderText, rowsFromWords, type OcrLine } from "@/lib/features/ocr/layout";
import {
  grayscaleForOcr,
  needsSparsePass,
  pickBetterRead,
  shouldInvert,
  upscaleFactor,
} from "@/lib/features/ocr/preprocess";
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

console.log("preprocess — mode decisions (D9)");

check("a dark median inverts", shouldInvert(40), true);
check("a light median does not invert", shouldInvert(230), false);
check("the dark threshold is 128", [shouldInvert(127), shouldInvert(128)], [true, false]);
check("a 680 px screenshot is doubled", upscaleFactor(680), 2);
check("a tiny image stops at 3x", upscaleFactor(200), 3);
check("a wide screenshot is not scaled", upscaleFactor(2400), 1);
check("a zero width is left alone", upscaleFactor(0), 1);
check("a list read at 72 gets a sparse pass", needsSparsePass(72), true);
check("prose read at 93 stays on one pass", needsSparsePass(93), false);
check("the sparse threshold is 85", [needsSparsePass(84.9), needsSparsePass(85)], [true, false]);
check(
  "the more confident read wins",
  pickBetterRead({ confidence: 72, layout: "auto" }, { confidence: 80, layout: "sparse" }).layout,
  "sparse",
);
check(
  "a tie keeps the normal-layout read",
  pickBetterRead({ confidence: 80, layout: "auto" }, { confidence: 80, layout: "sparse" }).layout,
  "auto",
);

// Pixels: white text (255) on a mostly dark-blue background → grayscale, inverted.
{
  const px = (r: number, g: number, b: number) => [r, g, b, 255];
  const rgba = new Uint8ClampedArray([...px(10, 30, 90), ...px(10, 30, 90), ...px(10, 30, 90), ...px(255, 255, 255)]);
  const inverted = grayscaleForOcr(rgba);
  check("a dark-background image is inverted", inverted, true);
  check("its white text becomes black", [rgba[12], rgba[13], rgba[14]], [0, 0, 0]);
  check("its dark background becomes light", rgba[0] > 200, true);
  const light = new Uint8ClampedArray([...px(250, 250, 250), ...px(250, 250, 250), ...px(20, 20, 20)]);
  check("a light-background image is only grayscaled", [grayscaleForOcr(light), light[8]], [false, 20]);
}

console.log("layout — reading order (D11)");

{
  // Six terminal rows "Compiled in Nms", as Tesseract returns them: three
  // one-word-per-line COLUMNS (x 70 / 190 / 230), top to bottom.
  const ys = [10, 44, 78, 112, 146, 180];
  const ms = ["135ms", "128ms", "133ms", "144ms", "153ms", "135ms"];
  const box = (x: number, y: number, w: number, h = 24) => ({ x0: x, y0: y, x1: x + w, y1: y + h });
  const col = (x: number, w: number, texts: string[]): OcrLine[] =>
    texts.map((text, i) => ({ words: [{ text, bbox: box(x, ys[i], w) }] }));
  const shredded = [...col(70, 110, ys.map(() => "Compiled")), ...col(190, 24, ys.map(() => "in")), ...col(230, 70, ms)];
  const wanted = ms.map((m) => `Compiled in ${m}`).join("\n");
  check("terminal columns read back as rows", readingOrderText("Compiled\nCompiled\n…", shredded), wanted);
  // Columns supplied right to left: only the left-to-right sort restores the rows.
  const reversed = [...col(230, 70, ms), ...col(190, 24, ys.map(() => "in")), ...col(70, 110, ys.map(() => "Compiled"))];
  check("words in a row are read left to right", readingOrderText("", reversed), wanted);

  // A tall junk "word" (three ✓ glued, starting above row 1) must neither
  // merge rows nor drag its row above row 1.
  const withJunk: OcrLine[] = [...shredded, { words: [{ text: "NNN", bbox: { x0: 30, y0: 0, x1: 60, y1: 102 } }] }];
  check(
    "a tall glued glyph joins one row and moves nothing",
    readingOrderText("", withJunk),
    ["Compiled in 135ms", "NNN Compiled in 128ms", "Compiled in 133ms", "Compiled in 144ms", "Compiled in 153ms", "Compiled in 135ms"].join("\n"),
  );

  const prose: OcrLine[] = [0, 1, 2, 3, 4].map((i) => ({
    words: "the quick brown fox jumps over".split(" ").map((t, j) => ({ text: t, bbox: box(j * 60, i * 30, 50) })),
  }));
  check("prose lines are not fragmented", isFragmented(prose), false);
  check("prose keeps Tesseract's own text", readingOrderText("TESSERACT ORDER", prose), "TESSERACT ORDER");
  check("three short lines are too few to count as fragmented", isFragmented(shredded.slice(0, 3)), false);

  const gapped = rowsFromWords([
    { text: "Title", bbox: box(0, 0, 50) },
    { text: "Body", bbox: box(0, 120, 50) },
    { text: "More", bbox: box(0, 150, 50) },
  ]);
  check("a tall gap between rows is a paragraph break", gapped, "Title\n\nBody\nMore");
}

console.log("table — detection (D12)");

{
  // Words laid out as a table: cell texts at column x positions, one row per y.
  const H = 20;
  const grid = (rows: string[][], xs: number[], conf: (row: number, col: number) => number = () => 95): OcrLine[] =>
    rows.map((cells, i) => ({
      words: cells.flatMap((cell, j) => {
        let x = xs[j];
        return cell
          .split(" ")
          .filter(Boolean)
          .map((t) => {
            const w = { text: t, bbox: { x0: x, y0: i * 40, x1: x + t.length * 9, y1: i * 40 + H }, confidence: conf(i, j) };
            x += t.length * 9 + 6; // ordinary word spacing: well under a word height
            return w;
          });
      }),
    }));
  const people = [
    ["Name", "Role", "Status"],
    ["Ada Lovelace", "Lead Engineer", "Active since 2021"],
    ["Grace Hopper", "Compiler Team", "On leave"],
    ["Alan Turing", "Research", "Active since 2019"],
  ];
  check(
    "a three-column table becomes a markdown table",
    tableMarkdown(grid(people, [20, 240, 460])),
    [
      "| Name | Role | Status |",
      "| --- | --- | --- |",
      "| Ada Lovelace | Lead Engineer | Active since 2021 |",
      "| Grace Hopper | Compiler Team | On leave |",
      "| Alan Turing | Research | Active since 2019 |",
    ].join("\n"),
  );
  check(
    "a missing cell is an empty cell, not a broken table",
    tableMarkdown(grid([["Item", "Owner", "Due"], ["Budget", "Finance", "Friday"], ["Hiring", "", "Monday"]], [20, 240, 460]))?.split("\n")[3],
    "| Hiring |  | Monday |",
  );
  check(
    "text above the table stays above it",
    tableMarkdown([{ words: [{ text: "Team", bbox: { x0: 20, y0: -80, x1: 60, y1: -60 }, confidence: 95 }] }, ...grid(people, [20, 240, 460])])?.split("\n\n")[0],
    "Team",
  );
  const article = [0, 1, 2, 3].map(() => [
    "the committee met on tuesday to review the budget",
    "several members asked for more detail on travel costs",
  ]);
  check("two columns of prose are not a table", tableMarkdown(grid(article, [20, 520])), null);
  check(
    "an icon column is dropped; one data column left is not a table",
    tableMarkdown(grid([["@", "DB AI P4 VI"], ["@", "DB AI P5 II"], ["@", "DB AI P5 III"]], [10, 60], (_r, c) => (c === 0 ? 20 : 95))),
    null,
  );
  check(
    "an icon column is dropped from a real table",
    tableMarkdown(grid(people.map((r) => ["@", ...r]), [0, 40, 260, 480], (_r, c) => (c === 0 ? 20 : 95)))?.split("\n")[0],
    "| Name | Role | Status |",
  );
  check("two rows are too few for a table", tableMarkdown(grid(people.slice(0, 2), [20, 240, 460])), null);
  // A wide gap inside a name ("Bob     Smith") makes two cells in ONE column.
  // That row cannot be placed, so it stays out of the table as text — no word lost.
  const split: OcrLine = {
    words: [
      { text: "Bob", bbox: { x0: 20, y0: 160, x1: 47, y1: 180 }, confidence: 95 },
      { text: "Smith", bbox: { x0: 100, y0: 160, x1: 145, y1: 180 }, confidence: 95 },
      { text: "Intern", bbox: { x0: 240, y0: 160, x1: 294, y1: 180 }, confidence: 95 },
      { text: "New", bbox: { x0: 460, y0: 160, x1: 487, y1: 180 }, confidence: 95 },
    ],
  };
  const withSplit = tableMarkdown([...grid(people, [20, 240, 460]), split]) ?? "";
  check("two cells in one column keep the row out of the table", withSplit.split("\n\n").pop(), "Bob Smith Intern New");
  check("…and the table above it is intact", withSplit.split("\n").filter((l) => l.startsWith("|")).length, 5);
  check(
    "a pipe read inside a cell is escaped",
    tableMarkdown(grid([["A", "B"], ["x|y", "z"], ["p", "q"]], [20, 240]))?.split("\n")[2],
    "| x\\|y | z |",
  );
  check("prose lines have no table", tableMarkdown(grid([["just one cell of text"], ["and another"], ["and a third"]], [20])), null);
  check(
    "a table survives reflow and pastes as a table node",
    types(ocrTextToContent(tableMarkdown(grid(people, [20, 240, 460])) ?? "")),
    ["table"],
  );
}

console.log("table — wrapped cells (D12, owner's SEO table)");

{
  // The owner's table, as geometry: lines inside a cell 28 apart, rows 68
  // apart, header → first row 40. Columns start at x 10 / 250 / 740.
  const line = (y: number, cells: [number, string][]): OcrLine => ({
    words: cells.flatMap(([x0, text]) => {
      let x = x0;
      return text.split(" ").map((t) => {
        const w = { text: t, bbox: { x0: x, y0: y, x1: x + t.length * 9, y1: y + 18 }, confidence: 95 };
        x += t.length * 9 + 6;
        return w;
      });
    }),
  });
  const seo: OcrLine[] = [
    line(0, [[10, "Best Practice"], [250, "Description"], [740, "Example"]]),
    line(40, [[10, "Use Keywords"], [250, "Identify primary and secondary keywords."], [740, "Use best SEO tips in"]]),
    line(68, [[10, "Strategically"], [250, "headings, titles, and content."], [740, "subheadings."]]),
    line(136, [[10, "Optimize Meta Tags"], [250, "Include relevant keywords in meta titles."], [740, "Meta title"]]),
    line(164, [[250, "Keep them concise and clear."]]),
    line(232, [[10, "Ensure Mobile-"], [250, "Optimize your website for mobile."], [740, "Test with the tool."]]),
    line(260, [[10, "Friendliness"], [250, "Use responsive design."]]),
  ];
  const md = tableMarkdown(seo) ?? "";
  const rowsOf = (m: string) => m.split("\n").filter((l) => l.startsWith("|") && !l.includes("---"));
  check("wrapped cells join: four rows, not seven", rowsOf(md).length, 4);
  check("the header stays its own row", rowsOf(md)[0], "| Best Practice | Description | Example |");
  check(
    "a wrapped row joins its lines per column",
    rowsOf(md)[1],
    "| Use Keywords Strategically | Identify primary and secondary keywords. headings, titles, and content. | Use best SEO tips in subheadings. |",
  );
  check(
    "a line with text in one column continues that cell, not ending the table",
    rowsOf(md)[2],
    "| Optimize Meta Tags | Include relevant keywords in meta titles. Keep them concise and clear. | Meta title |",
  );
  check("a wrapped hyphenated word keeps its hyphen: Mobile-Friendliness", rowsOf(md)[3].startsWith("| Ensure Mobile-Friendliness |"), true);
  check(
    "a full-width line under the table stays text",
    (tableMarkdown([...seo, line(330, [[10, "This note runs under all three columns of the table and keeps going on"]])]) ?? "").split("\n\n").pop(),
    "This note runs under all three columns of the table and keeps going on",
  );
  check(
    "a title above evenly spaced rows does not merge them",
    rowsOf(
      tableMarkdown([
        line(-80, [[10, "Team"]]),
        line(0, [[10, "Name"], [250, "Role"]]),
        line(40, [[10, "Ada"], [250, "Engineer"]]),
        line(80, [[10, "Grace"], [250, "Compilers"]]),
      ]) ?? "",
    ).length,
    3,
  );
  check(
    "long cells with no short header row are prose columns, not a table",
    tableMarkdown([
      // Four evenly spaced lines → four rows, so only the header guard decides.
      line(0, [[10, "the committee met on tuesday to review"], [500, "several members asked for more detail on"]]),
      line(40, [[10, "the proposed budget for the coming year"], [500, "travel costs before the final vote next"]]),
      line(80, [[10, "and agreed on most of the items listed"], [500, "month when the full board meets again"]]),
      line(120, [[10, "in the draft that was circulated earlier"], [500, "to settle the remaining open questions"]]),
    ]),
    null,
  );
}

console.log("AI paste — chord and content (D13)");

{
  const key = (mods: { meta?: boolean; ctrl?: boolean; alt?: boolean; shift?: boolean; altGraph?: boolean }, code = "KeyV", k = "v") =>
    ({
      metaKey: !!mods.meta,
      ctrlKey: !!mods.ctrl,
      altKey: !!mods.alt,
      shiftKey: !!mods.shift,
      code,
      key: k,
      getModifierState: (m: string) => m === "AltGraph" && !!mods.altGraph,
    }) as unknown as KeyboardEvent;
  check("⌥⌘V is the AI chord (Option makes key \"√\")", isAiPasteChord(key({ meta: true, alt: true }, "KeyV", "√")), true);
  check("Ctrl+Alt+V is the AI chord on Windows", isAiPasteChord(key({ ctrl: true, alt: true })), true);
  check("AltGr+V (typing a character) is not the chord", isAiPasteChord(key({ ctrl: true, alt: true, altGraph: true })), false);
  check("⌥⇧⌘V (Paste and Match Style) is not the chord", isAiPasteChord(key({ meta: true, alt: true, shift: true })), false);
  check("plain ⌘V is not the chord", isAiPasteChord(key({ meta: true })), false);
  check("⇧⌘V is the local chord, not the AI one", [isPasteAsTextChord(key({ meta: true, shift: true })), isAiPasteChord(key({ meta: true, shift: true }))], [true, false]);
  check("⌥⌘V is not the local chord", isPasteAsTextChord(key({ meta: true, alt: true }, "KeyV", "√")), false);

  const parseAi = (md: string) => markdownToTiptapRich(decompressMarkdown(md), ext, bridge);
  check(
    "AI markdown keeps its table, list and code block",
    types(buildAiContent("| A | B |\n| --- | --- |\n| 1 | 2 |\n\n- one\n- two\n\n```\nnpm run build\n✓ done\n```", parseAi)),
    ["table", "bulletList", "codeBlock"],
  );
  check("an empty AI read is no blocks", buildAiContent("   ", parseAi), []);
}

console.log("languages — setting (D10)");

check("unset reads as English only", normalizeOcrLanguages(undefined), ["eng"]);
check("English is always first and present", normalizeOcrLanguages(["spa"]), ["eng", "spa"]);
check("unknown codes are dropped", normalizeOcrLanguages(["spa", "klingon", 7]), ["eng", "spa"]);
check("duplicates collapse, catalogue order", normalizeOcrLanguages(["ita", "spa", "spa", "eng"]), ["eng", "spa", "ita"]);
check("a malformed value reads as English only", normalizeOcrLanguages("spa"), ["eng"]);

if (fails > 0) {
  console.log(`\nocr:blocks:check — ${fails} failure(s)`);
  process.exit(1);
}
console.log("\nocr:blocks:check — all passed");
