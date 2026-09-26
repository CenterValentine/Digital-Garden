/**
 * Private-content EDITOR gate — the behaviour half of `pnpm private:content:check`.
 *
 * `validate-private-content.ts` proves the strip predicate and the seam list.
 * This script proves the editor affordances actually produce the shapes that
 * predicate strips, against a REAL TipTap editor under jsdom (no browser):
 *
 *   - Cmd+/ (`togglePrivate`): in-paragraph selection → mark; caret in the run
 *     → mark removed; bare cursor → block; caret in block → unwrapped; a
 *     selection across two paragraphs → one block, and back.
 *   - The `%%text%%` input rule fires on the closing delimiter and removes both.
 *   - `%%` + Enter opens a block; `%%` + Enter inside closes it, reusing the
 *     empty paragraph StarterKit's trailing node keeps at the document end (so
 *     closing never leaves two blank lines) and inserting one mid-document.
 *   - `stripPrivateContent` and `visibleTextBetween` agree on the result.
 *
 * Typing is simulated through the view's `handleTextInput` prop so input rules
 * run exactly as they do for a keypress. Run: pnpm private:content:check
 */
import { JSDOM } from "jsdom";

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

async function main() {
  const { Editor } = await import("@tiptap/core");
  const StarterKit = (await import("@tiptap/starter-kit")).default;
  const { PrivateBlock, PrivateText } = await import("@/lib/domain/editor/extensions/private-content");
  const { stripPrivateContent } = await import("@/lib/domain/content/private-content");
  const { visibleTextBetween } = await import("@/lib/domain/editor/ai/visible-text");

  let fails = 0;
  const check = (label: string, ok: boolean, detail?: string) => {
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? ` — ${detail}` : ""}`);
    if (!ok) fails++;
  };

  const editor = new Editor({
    element: dom.window.document.getElementById("e") as HTMLElement,
    extensions: [StarterKit, PrivateText, PrivateBlock],
    content: "<p>keep secret end</p><p>second paragraph</p>",
  });
  const text = () => editor.getHTML();

  // 1. Inline toggle on an in-paragraph selection.
  editor.commands.setTextSelection({ from: 6, to: 12 }); // "secret"
  editor.commands.togglePrivate();
  check("Cmd+/ on in-paragraph selection → privateText mark", /<span data-private="text" class="private-text">secret<\/span>/.test(text()), text());

  // 2. Reverse with a collapsed caret inside the run.
  editor.commands.setTextSelection(8);
  editor.commands.togglePrivate();
  check("Cmd+/ with caret inside the run → mark removed", !/data-private="text"/.test(text()), text());

  // 3. Block toggle on a bare cursor.
  editor.commands.setTextSelection(3);
  editor.commands.togglePrivate();
  check("Cmd+/ on bare cursor → privateBlock around the paragraph", /^<div data-private="block" class="private-block"><p>keep secret end<\/p><\/div><p>second paragraph<\/p>$/.test(text()), text());

  // 4. Reverse from inside the block.
  editor.commands.setTextSelection(4);
  editor.commands.togglePrivate();
  check("Cmd+/ inside the block → unwrapped", text() === "<p>keep secret end</p><p>second paragraph</p>", text());

  // 5. Cross-block selection → block wrapping both paragraphs.
  editor.commands.setTextSelection({ from: 3, to: 22 });
  editor.commands.togglePrivate();
  // StarterKit's trailing node keeps an empty paragraph after a document that
  // ends in a non-paragraph block, so allow one at the end throughout.
  const TRAIL = "(?:<p></p>)?$";
  check("Cmd+/ across two paragraphs → one block wrapping both", new RegExp(`^<div data-private="block" class="private-block"><p>keep secret end</p><p>second paragraph</p></div>${TRAIL}`).test(text()), text());
  editor.commands.setTextSelection(4);
  editor.commands.togglePrivate();
  check("…and Cmd+/ inside unwraps both", new RegExp(`^<p>keep secret end</p><p>second paragraph</p>${TRAIL}`).test(text()), text());

  // 6. Input rule: type `%%hush%%` at the end of the last paragraph.
  const typeText = (s: string) => {
    for (const ch of s) {
      const { from, to } = editor.state.selection;
      // Fifth argument is ProseMirror's default-insertion transaction factory;
      // the fallback dispatch below plays that role when no rule claims the key.
      const handled = editor.view.someProp("handleTextInput", (f) =>
        f(editor.view, from, to, ch, () => editor.state.tr.insertText(ch, from, to)),
      );
      if (!handled) editor.view.dispatch(editor.state.tr.insertText(ch, from, to));
    }
  };
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  typeText("tail %%hush%%");
  check("typing %%hush%% → privateText mark, delimiters removed", /<p>tail <span data-private="text" class="private-text">hush<\/span><\/p>$/.test(text()), text());

  // 7. Enter form: `%%` alone on a new paragraph opens a block.
  editor.commands.setTextSelection(editor.state.doc.content.size - 1);
  editor.commands.splitBlock();
  typeText("%%");
  const enter = () => editor.view.someProp("handleKeyDown", (f) => f(editor.view, new dom.window.KeyboardEvent("keydown", { key: "Enter", code: "Enter" })));
  enter();
  check("`%%` + Enter → opens an empty private block", new RegExp(`<div data-private="block" class="private-block"><p></p></div>${TRAIL}`).test(text()), text());
  check("…caret is inside the block", editor.state.selection.$from.node(1).type.name === "privateBlock");
  typeText("inside");
  editor.commands.splitBlock();
  typeText("%%");
  enter();
  check("`%%` + Enter inside → closes the block with exactly one empty paragraph after it", /<div data-private="block" class="private-block"><p>inside<\/p><\/div><p><\/p>$/.test(text()), text());
  check("…caret is after the block", editor.state.selection.$from.parent.textContent === "" && editor.state.selection.$from.depth === 1);

  // 7b. Closing a block in the MIDDLE of a document (a non-empty paragraph follows).
  editor.commands.setContent("<p>a</p><div data-private=\"block\"><p>b</p><p>%%</p></div><p>c</p>");
  editor.commands.setTextSelection(9); // inside the `%%` paragraph
  enter();
  check("mid-document close → fresh paragraph between the block and the next one", text() === "<p>a</p><div data-private=\"block\" class=\"private-block\"><p>b</p></div><p></p><p>c</p>", text());

  // 7c. Boundaries — inner and outer edges (owner report, 2026-09-26).
  const key = (k: string) => editor.view.someProp("handleKeyDown", (f) => f(editor.view, new dom.window.KeyboardEvent("keydown", { key: k, code: k })));
  editor.commands.setContent("<p>keep <span data-private=\"text\">hush</span></p>");
  editor.commands.setTextSelection(10); // trailing edge of "hush"
  typeText("!");
  check("typing at the trailing edge stays INSIDE the run", /<span data-private="text" class="private-text">hush!<\/span><\/p>$/.test(text()), text());
  key("ArrowRight");
  typeText("x");
  check("ArrowRight at the edge steps out; the next character is outside", /<span data-private="text" class="private-text">hush!<\/span>x<\/p>$/.test(text()), text());

  // Step out, then Backspace immediately: that is the outer trailing edge.
  // (A plain single-character Backspace is native browser behaviour that
  // jsdom cannot perform, so the scenario starts from a fresh document.)
  editor.commands.setContent("<p>keep <span data-private=\"text\">hush</span></p>");
  editor.commands.setTextSelection(10);
  key("ArrowRight");
  key("Backspace");
  check("Backspace on the outer trailing edge uncomments the run, text kept", /^<p>keep hush<\/p>/.test(text()), text());

  editor.commands.setContent("<p>keep <span data-private=\"text\">hush</span> end</p>");
  editor.commands.setTextSelection(6); // leading edge, outside by ProseMirror's rule
  key("Delete");
  check("Delete on the outer leading edge uncomments the run, text kept", text() === "<p>keep hush end</p>", text());

  editor.commands.setContent("<p>a</p><div data-private=\"block\"><p>b</p><p>c</p></div><h2>What</h2>");
  editor.commands.setTextSelection(12); // start of "What" (p=3, block=8 → h2 opens at 11)
  key("Backspace");
  check("Backspace at the start of the paragraph after a block uncomments the block (nothing adopted)", /^<p>a<\/p><p>b<\/p><p>c<\/p><h2>What<\/h2>/.test(text()), text());
  check("…caret stays at the start of that paragraph", editor.state.selection.$from.parent.textContent === "What" && editor.state.selection.$from.parentOffset === 0);

  editor.commands.setContent("<p>a</p><div data-private=\"block\"><p>b</p><p>c</p></div><p>d</p>");
  editor.commands.setTextSelection(5); // start of "b", the block's first child
  key("Backspace");
  check("Backspace at the start of the block's first paragraph uncomments the whole block", text() === "<p>a</p><p>b</p><p>c</p><p>d</p>", text());

  // 8. Stripping and visible text agree on a document with both shapes.
  editor.commands.setContent("<p>keep <span data-private=\"text\">hush</span> end</p><div data-private=\"block\"><p>inside</p></div><p>tail</p>");
  const stripped = stripPrivateContent(editor.getJSON());
  const strippedText = JSON.stringify(stripped);
  check("stripPrivateContent removes 'hush' and 'inside', keeps the rest", !/hush|inside/.test(strippedText) && /keep /.test(strippedText) && /tail/.test(strippedText), strippedText);
  const visible = visibleTextBetween(editor.state.doc, 0, editor.state.doc.content.size, "\n");
  check("visibleTextBetween matches", visible === "keep  end\ntail", JSON.stringify(visible));

  editor.destroy();
  console.log(
    fails
      ? `\nprivate:content:check (editor) — ${fails} check(s) failed.`
      : "\nprivate:content:check (editor) — OK (Cmd+/ both shapes + reversal, %% input rule, %% + Enter open/close, strip ≡ visible text)",
  );
  process.exit(fails ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
