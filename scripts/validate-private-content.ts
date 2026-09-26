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

if (failures > 0) {
  console.error(`\nprivate:content:check — ${failures} check(s) failed.\n`);
  process.exit(1);
}
console.log(`private:content:check — OK (predicate, searchText, ${SEAMS.length} seams, source view untouched)`);
