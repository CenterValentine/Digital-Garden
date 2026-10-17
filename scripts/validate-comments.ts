/**
 * Comments gate — COMMENTS-ANNOTATIONS-PLAN.md §4.
 *
 * A comment thread's anchor is the `comment` mark; the discussion lives beside
 * the note. Four things nothing in tsc or eslint can see:
 *
 *   1. The predicate: `stripCommentMarks` removes the mark and KEEPS the text,
 *      merges the text it leaves behind, never mutates, and leaves other
 *      marks alone. `collectCommentThreadIds` finds every anchored thread.
 *   2. The grammar: CriticMarkup `{==passage==}{>>#id<<}` writes and re-tags,
 *      nests, survives marked's entity escaping, declines what it can't carry,
 *      and never rewrites inside a tag or across a block boundary.
 *   3. The seams: every file that turns note JSON into markdown or HTML for a
 *      reader that is not the author's editor calls the predicate. The list
 *      below IS the contract. The markdown serializer itself must NOT strip —
 *      the source view shows comments as CriticMarkup.
 *   4. The editor: the mark's commands against a REAL TipTap editor under
 *      jsdom — set on a selection, overlapping threads keep their own
 *      instance, unset removes only the named thread everywhere.
 *
 * Run: pnpm comments:check
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import type { JSONContent } from "@tiptap/core";

const dom = new JSDOM("<!doctype html><html><body><div id=\"e\"></div></body></html>", { pretendToBeVisual: true });
const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.navigator = dom.window.navigator;
g.MutationObserver = dom.window.MutationObserver;
g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
g.Node = dom.window.Node;
g.Element = dom.window.Element;
g.HTMLElement = dom.window.HTMLElement;
g.Text = dom.window.Text;
g.DocumentFragment = dom.window.DocumentFragment;
g.Range = dom.window.Range;
g.Selection = dom.window.Selection;
g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number;

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  if (!condition) {
    failures += 1;
    console.error(`  FAIL  ${label}${detail ? ` — got: ${detail}` : ""}`);
  }
}

const A = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const B = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b";
const p = (content: JSONContent[]): JSONContent => ({ type: "paragraph", content });
const t = (text: string): JSONContent => ({ type: "text", text });
const c = (text: string, ...ids: string[]): JSONContent => ({ type: "text", text, marks: ids.map((threadId) => ({ type: "comment", attrs: { threadId } })) });
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });
const canon = (v: unknown) => JSON.stringify(v);

async function main() {
  const { stripCommentMarks, hasCommentMarks, collectCommentThreadIds, isCommentThreadId } = await import("@/lib/domain/content/comments");
  const { commentToMarkdown, reTagCommentMarkdown } = await import("@/lib/domain/content/comment-markdown");

  // --- 1. The predicate ----------------------------------------------------
  {
    const input = doc(
      p([t("keep "), c("noted", A), t(" end")]),
      p([{ type: "text", text: "bold", marks: [{ type: "bold" }, { type: "comment", attrs: { threadId: A } }] }]),
      p([c("one ", A), c("both", A, B), c(" two", B)]),
    );
    const before = canon(input);
    const out = stripCommentMarks(input);
    check("input is not mutated", canon(input) === before);
    check("the mark goes, the text stays, runs merge", canon(out.content?.[0]) === canon(p([t("keep noted end")])), canon(out.content?.[0]));
    check("other marks on the same text survive", canon(out.content?.[1]) === canon(p([{ type: "text", text: "bold", marks: [{ type: "bold" }] }])), canon(out.content?.[1]));
    check("overlapping threads strip to one plain run", canon(out.content?.[2]) === canon(p([t("one both two")])), canon(out.content?.[2]));
    check("nothing commented remains", !hasCommentMarks(out));
    check("hasCommentMarks sees the input", hasCommentMarks(input));
    check("collectCommentThreadIds finds both threads once each, in order", canon(collectCommentThreadIds(input)) === canon([A, B]), canon(collectCommentThreadIds(input)));
    check("a bad thread id is not a thread", !isCommentThreadId("not-a-uuid") && !isCommentThreadId(null) && isCommentThreadId(A.toUpperCase()));
    check("a doc with no marks is returned structurally equal", canon(stripCommentMarks(doc(p([t("plain")])))) === canon(doc(p([t("plain")]))));
  }

  // --- 2. The grammar ------------------------------------------------------
  {
    check("writes the CriticMarkup form", commentToMarkdown("noted", A) === `{==noted==}{>>#${A}<<}`);
    check("lower-cases the id", commentToMarkdown("x", A.toUpperCase()) === `{==x==}{>>#${A}<<}`);
    check("declines an empty passage", commentToMarkdown("", A) === null);
    check("declines a passage holding a stray delimiter", commentToMarkdown("a ==} b", A) === null && commentToMarkdown("a {== b", A) === null);
    check("accepts a passage holding a complete nested form", commentToMarkdown(`one {==both==}{>>#${B}<<}`, A) === `{==one {==both==}{>>#${B}<<}==}{>>#${A}<<}`);
    check("declines a bad id", commentToMarkdown("x", "nope") === null && commentToMarkdown("x", null) === null);

    const esc = `<p>keep {==noted==}{&gt;&gt;#${A}&lt;&lt;} end</p>`;
    check("re-tags marked's entity-escaped tail", reTagCommentMarkdown(esc) === `<p>keep <span data-comment="${A}">noted</span> end</p>`, reTagCommentMarkdown(esc));
    const raw = `<p>{==noted==}{>>#${A}<<}</p>`;
    check("re-tags the raw tail too", reTagCommentMarkdown(raw) === `<p><span data-comment="${A}">noted</span></p>`, reTagCommentMarkdown(raw));
    const inline = `<p>{==<strong>b</strong> <a href="https://x.com">l</a>==}{>>#${A}<<}</p>`;
    check("spans inline tags", reTagCommentMarkdown(inline) === `<p><span data-comment="${A}"><strong>b</strong> <a href="https://x.com">l</a></span></p>`, reTagCommentMarkdown(inline));
    const nested = `<p>{==one {==both==}{>>#${B}<<}==}{>>#${A}<<}</p>`;
    check("rebuilds nested forms innermost-first", reTagCommentMarkdown(nested) === `<p><span data-comment="${A}">one <span data-comment="${B}">both</span></span></p>`, reTagCommentMarkdown(nested));
    const acrossBlocks = `<p>{==a</p><p>b==}{>>#${A}<<}</p>`;
    check("never rewrites across a block boundary", reTagCommentMarkdown(acrossBlocks) === acrossBlocks, reTagCommentMarkdown(acrossBlocks));
    const inAttr = `<div data-header="{==x==}{>>#${A}<<}">t</div>`;
    check("never rewrites inside a tag's attributes", reTagCommentMarkdown(inAttr) === inAttr, reTagCommentMarkdown(inAttr));
    const badId = `<p>{==x==}{>>#nope<<}</p>`;
    check("ignores a non-uuid id", reTagCommentMarkdown(badId) === badId);
  }

  // --- 3. The seams --------------------------------------------------------
  //
  // Output is markdown or HTML → the mark would reach the reader as a span or
  // as CriticMarkup. Plain-text seams (searchText, outline, chunk matching)
  // are unaffected by marks and are deliberately absent.
  const SEAMS: Array<[string, RegExp]> = [
    ["lib/domain/ai/tools/chunking.ts", /stripCommentMarks\(/],
    ["lib/domain/ai-context/source-resolver.ts", /stripCommentMarks\(/],
    ["lib/domain/ai/charters/render.ts", /stripCommentMarks\(/],
    ["lib/domain/browser-extension/service.ts", /stripCommentMarks\(/],
    ["lib/domain/mcp/read.ts", /stripCommentMarks\(/],
    ["components/public/TipTapContent.tsx", /stripCommentMarks\(/],
    ["lib/domain/export/converters/html.ts", /stripCommentMarks\(/],
  ];
  for (const [file, pattern] of SEAMS) {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");
    check(`seam ${file} strips comment marks`, pattern.test(source));
  }
  {
    const serializer = readFileSync(resolve(process.cwd(), "lib/domain/content/markdown.ts"), "utf8");
    check("tiptapToMarkdown itself does not strip (source view must show CriticMarkup)", !/stripCommentMarks/.test(serializer));
    const extension = readFileSync(resolve(process.cwd(), "lib/domain/editor/extensions/comment-mark.ts"), "utf8");
    check("the mark is named by a string literal (the collab-schema gate discovers it by regex)", (extension.match(/^\s*name: "comment",$/gm) ?? []).length === 2);
    check("the mark excludes nothing (threads may overlap)", (extension.match(/^\s*excludes: "",$/gm) ?? []).length === 2);
    const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
    check("the public net neutralises any slipped anchor", /\.public-prose \[data-comment\]/.test(css));
    const registry = readFileSync(resolve(process.cwd(), "lib/domain/collaboration/extensions.ts"), "utf8");
    check("the collaboration server knows the mark", /ServerCommentMark/.test(registry));
  }

  // --- 4. The editor -------------------------------------------------------
  {
    const { Editor } = await import("@tiptap/core");
    const StarterKit = (await import("@tiptap/starter-kit")).default;
    const { CommentMark, findCommentRanges, collectCommentRanges } = await import("@/lib/domain/editor/extensions/comment-mark");

    const editor = new Editor({
      element: dom.window.document.getElementById("e") as HTMLElement,
      extensions: [StarterKit, CommentMark],
      content: "<p>keep noted end</p>",
    });
    const html = () => editor.getHTML();

    editor.commands.setTextSelection({ from: 6, to: 11 }); // "noted"
    check("setComment refuses a bad id", editor.commands.setComment("nope") === false);
    check("setComment on a selection → the mark", editor.commands.setComment(A) && html() === `<p>keep <span data-comment="${A}" class="comment-mark">noted</span> end</p>`, html());

    editor.commands.setTextSelection(11);
    check("setComment on a collapsed caret is a no-op", editor.commands.setComment(B) === false);

    // Overlap: a second thread over "ted end" — two instances on "ted".
    editor.commands.setTextSelection({ from: 8, to: 15 });
    editor.commands.setComment(B);
    const ranges = collectCommentRanges(editor.state.doc);
    check("overlapping threads keep separate instances", canon(ranges.get(A)) === canon([{ from: 6, to: 11 }]) && canon(ranges.get(B)) === canon([{ from: 8, to: 15 }]), canon(Array.from(ranges.entries())));
    check("the DOM nests the two spans where they overlap", html().includes(`<span data-comment="${A}" class="comment-mark">no<span data-comment="${B}" class="comment-mark">ted</span></span>`), html());

    // Typing at the trailing edge of a thread is OUTSIDE it (inclusive: false).
    editor.commands.setTextSelection(15);
    editor.commands.insertContent("!");
    check("typing at the edge does not extend the thread", canon(findCommentRanges(editor.state.doc, B)) === canon([{ from: 8, to: 15 }]), canon(findCommentRanges(editor.state.doc, B)));

    // Unset removes only the named thread, everywhere, leaving the other.
    check("unsetComment removes thread A everywhere", editor.commands.unsetComment(A) && findCommentRanges(editor.state.doc, A).length === 0);
    check("…and leaves thread B intact", canon(findCommentRanges(editor.state.doc, B)) === canon([{ from: 8, to: 15 }]), html());
    check("unsetComment on an unknown thread is false", editor.commands.unsetComment(A) === false);
    check("the text never changed", editor.state.doc.textContent === "keep noted end!", editor.state.doc.textContent);

    // The strip predicate on the editor's JSON agrees with the visible text.
    const stripped = stripCommentMarks(editor.getJSON());
    check("stripCommentMarks on the live doc keeps every character", canon(stripped) === canon(doc(p([t("keep noted end!")]))), canon(stripped));

    editor.destroy();
  }

  if (failures > 0) {
    console.error(`\ncomments:check — ${failures} check(s) failed.\n`);
    process.exit(1);
  }
  console.log("comments:check — OK (predicate, CriticMarkup grammar, 7 seams, source view untouched, editor commands)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
