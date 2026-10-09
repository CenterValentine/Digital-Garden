/**
 * Private-content gate.
 *
 * Private (commented-out) prose is hidden from every non-author reader by ONE
 * predicate — `stripPrivateContent` — applied explicitly at each egress seam.
 * Nothing in tsc or eslint knows which call sites are seams, so a new read
 * path (or a refactor that drops the call) leaks silently. Two layers:
 *
 *   1. The predicate itself: blocks and marked text go, emptied paragraphs
 *      collapse, structural cells stay, the input is never mutated.
 *   2. The seams: every file that turns note JSON into reader-facing text
 *      must call the predicate (or the ProseMirror-side twin, visibleText*).
 *      The list below IS the contract — add a seam here when you add one.
 *
 * Run: pnpm private:content:check
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { JSONContent } from "@tiptap/core";
import {
  hasPrivateContent,
  stripPrivateContent,
} from "@/lib/domain/content/private-content";
import { extractSearchTextFromTipTap } from "@/lib/domain/content/search-text";
import { listNoteImages } from "@/lib/domain/content/note-images";

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (!condition) {
    failures += 1;
    console.error(`  FAIL  ${label}${detail ? ` — got: ${detail}` : ""}`);
  }
}

const p = (content: JSONContent[]): JSONContent => ({ type: "paragraph", content });
const t = (text: string): JSONContent => ({ type: "text", text });
const priv = (text: string): JSONContent => ({ type: "text", text, marks: [{ type: "privateText" }] });
const block = (...content: JSONContent[]): JSONContent => ({ type: "privateBlock", content });
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });
const canon = (v: unknown) => JSON.stringify(v);

// --- 1. The predicate ------------------------------------------------------
{
  const input = doc(
    p([t("keep "), priv("secret"), t(" end")]),
    block(p([t("hidden")])),
    p([priv("only private")]),
    { type: "bulletList", content: [{ type: "listItem", content: [p([priv("gone")])] }] },
    {
      type: "table",
      content: [{ type: "tableRow", content: [{ type: "tableCell", content: [p([priv("cell")])] }, { type: "tableCell", content: [p([t("stay")])] }] }],
    },
  );
  const before = canon(input);
  const out = stripPrivateContent(input);

  check("input is not mutated", canon(input) === before);
  check("marked text is removed, siblings kept", canon(out.content?.[0]) === canon(p([t("keep "), t(" end")])), canon(out.content?.[0]));
  check("private block is removed", !out.content?.some((n) => n.type === "privateBlock"));
  check("a paragraph emptied by stripping collapses", !out.content?.some((n) => n.type === "paragraph" && (n.content ?? []).length === 0));
  check("an emptied list cascades away", !out.content?.some((n) => n.type === "bulletList"));
  const table = out.content?.find((n) => n.type === "table");
  const cells = table?.content?.[0]?.content ?? [];
  check("table structure survives (emptied cell kept)", cells.length === 2, `${cells.length} cells`);
  check("nothing private remains", !hasPrivateContent(out));
  check("hasPrivateContent sees the input", hasPrivateContent(input));
  check("a doc of only private content becomes an empty doc", canon(stripPrivateContent(doc(block(p([t("x")])))).content) === "[]");

  const searchText = extractSearchTextFromTipTap(input);
  check("searchText never contains private text", !/secret|hidden|only private|gone|cell/.test(searchText), searchText);
  check("searchText keeps visible text", /keep/.test(searchText) && /stay/.test(searchText), searchText);

  // The AI's read_content lists a note's images (OCR plan D8): an image inside
  // a private block must never be offered to the model.
  const img = (contentId: string): JSONContent => ({
    type: "image",
    attrs: { src: `/api/content/content/${contentId}/download?stream=true`, alt: contentId, contentId },
  });
  const shown = "11111111-1111-4111-8111-111111111111";
  const hidden = "22222222-2222-4222-8222-222222222222";
  const listed = listNoteImages(doc(img(shown), block(img(hidden)))).map((i) => i.contentId);
  check("note images: a private block's image is not listed", !listed.includes(hidden), listed.join(","));
  check("note images: a visible image is listed", listed.includes(shown), listed.join(","));
}

// --- 2. The seams ----------------------------------------------------------
//
// Path → the call that must be present. Server seams strip JSON; the client
// editing tools work on live ProseMirror nodes and use the visibleText twins.
const SEAMS: Array<[string, RegExp]> = [
  ["lib/domain/content/search-text.ts", /stripPrivateContent\(/],
  ["lib/domain/ai/tools/chunking.ts", /stripPrivateContent\(/],
  ["lib/domain/ai-context/source-resolver.ts", /stripPrivateContent\(/],
  ["lib/domain/ai/charters/render.ts", /stripPrivateContent\(/],
  ["components/public/TipTapContent.tsx", /stripPrivateContent\(/],
  ["lib/domain/editor/ai/block-handles.ts", /visibleTextOf\(/],
  ["components/content/ai/ChatPanel.tsx", /visibleTextBetween\(/],
  // Found by the first owner smoke (2026-09-26): a side chat attaches its
  // bound note as an implicit mention rendered from the materialized column.
  ["app/api/ai/chat/route.ts", /extractSearchTextFromTipTap\(/],
  ["lib/domain/editor/ai/text-search.ts", /PRIVATE_TEXT_MARK/],
  ["lib/domain/ai/charters/parse.ts", /PRIVATE_TEXT_MARK/],
  ["app/api/ai/inject-media/route.ts", /stripPrivateContent\(/],
  ["lib/domain/ai/tools/editor-tools.ts", /stripPrivateContent\(/],
  ["lib/domain/browser-extension/service.ts", /stripPrivateContent\(/],
  // The images a note holds, as the AI's read_content lists them (OCR plan D8).
  ["lib/domain/content/note-images.ts", /stripPrivateContent\(/],
  // The PIXEL seam (AI-VIEW-SCREEN-PLAN D5): view_screen's in-app capture
  // leaves every [data-private] element out of the screenshot.
  ["lib/features/screen-capture/capture-app.ts", /filter: isCapturable/],
];
for (const [file, pattern] of SEAMS) {
  const source = readFileSync(resolve(process.cwd(), file), "utf8");
  check(`seam ${file} strips private content`, pattern.test(source));
}
{
  // The one place that must NOT strip: the source-view toggle reads the
  // note's own markdown, and the author must still see their private text.
  const serializer = readFileSync(resolve(process.cwd(), "lib/domain/content/markdown.ts"), "utf8");
  check("tiptapToMarkdown itself does not strip (source view must show private text)", !/stripPrivateContent/.test(serializer));
}
{
  // The pixel seam filters by DOM attribute, so the attribute is the contract:
  // what the editor renders and what the capture leaves out must agree.
  const extension = readFileSync(resolve(process.cwd(), "lib/domain/editor/extensions/private-content.ts"), "utf8");
  const capture = readFileSync(resolve(process.cwd(), "lib/features/screen-capture/capture-app.ts"), "utf8");
  const sourceView = readFileSync(resolve(process.cwd(), "components/content/editor/MarkdownSourceView.tsx"), "utf8");
  check(
    "private text and blocks render with data-private (the attribute view_screen filters on)",
    extension.includes('"data-private": "text"') && extension.includes('"data-private": "block"') && !/addNodeView/.test(extension),
  );
  check("view_screen's capture leaves out [data-private]", capture.includes('PRIVATE_SELECTOR = "[data-private]"') && /!node\.matches\(PRIVATE_SELECTOR\)/.test(capture));
  check(
    "view_screen's capture leaves out a source view holding %% text, and the source view is marked",
    capture.includes('SOURCE_VIEW_SELECTOR = "textarea[data-markdown-source]"') && /\.value\.includes\("%%"\)/.test(capture) && sourceView.includes("data-markdown-source"),
  );
}

if (failures > 0) {
  console.error(`\nprivate:content:check — ${failures} check(s) failed.\n`);
  process.exit(1);
}
console.log(`private:content:check — OK (predicate, searchText, ${SEAMS.length} seams, source view untouched)`);
