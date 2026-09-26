/**
 * Private content — comment out prose the way you comment out code.
 *
 * Text marked private stays in the document, fully visible and editable by
 * the author, and is inert to every other reader: the AI never receives it,
 * the public site never renders it, the search index never stores it. The
 * stripping happens at each egress seam via `stripPrivateContent` in
 * lib/domain/content/private-content.ts — NOT here. These extensions render
 * faithfully everywhere so the lossless-markdown round trip holds.
 *
 * Two shapes, one toggle:
 *   - `privateText`  — inline mark, `%%like this%%` mid-sentence
 *   - `privateBlock` — block wrapper, `%%` on its own line, content, `%%`
 *
 * Cmd+/ is the primary affordance (the universal "toggle comment" chord) and
 * decides the shape the way code editors do: a selection inside one paragraph
 * gets the inline mark; a bare cursor or a selection crossing block
 * boundaries wraps whole blocks. Inside private content it reverses.
 *
 * Typed syntax mirrors Obsidian comments: `%%text%%` closes into the mark on
 * the second delimiter; `%%` alone on a line + Enter opens a block, and the
 * same line inside a block closes it. `/private` is the slash route.
 *
 * Server variants (`ServerPrivateText`, `ServerPrivateBlock`) carry the same
 * name, attrs, parseHTML and renderHTML — required so the collaboration
 * server and server-side parsing recognise the schema — but no input rules
 * or shortcuts. Rendering is deliberately faithful (unlike the cloze mark's
 * blank server span): the public page strips the JSON before serialising, so
 * the HTML never has to hide anything, and `generateJSON(generateHTML(node))`
 * stays symmetric for the markdown codec.
 */

import { Mark, Node, markInputRule, mergeAttributes } from "@tiptap/core";
import type { Mark as PMMark, ResolvedPos } from "@tiptap/pm/model";
import { TextSelection, type Transaction } from "@tiptap/pm/state";
import { liftTarget } from "@tiptap/pm/transform";
import {
  PRIVATE_BLOCK_NODE,
  PRIVATE_DELIMITER,
  PRIVATE_TEXT_MARK,
} from "@/lib/domain/content/private-content";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    privateText: {
      /** Mark the current selection private. */
      setPrivateText: () => ReturnType;
      /** Remove the private mark from the current selection (whole run when collapsed). */
      unsetPrivateText: () => ReturnType;
      /** Toggle the private mark on the current selection. */
      togglePrivateText: () => ReturnType;
    };
    privateBlock: {
      /** Wrap the selected blocks in a private block. */
      setPrivateBlock: () => ReturnType;
      /** Unwrap the private block the selection is inside (whole block). */
      unsetPrivateBlock: () => ReturnType;
      /**
       * The Cmd+/ behaviour: pick inline mark vs block from the selection
       * shape, and reverse either when already private.
       */
      togglePrivate: () => ReturnType;
    };
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Depth of the nearest enclosing private block, or null when outside one. */
function privateBlockDepth($pos: ResolvedPos): number | null {
  for (let depth = $pos.depth; depth >= 1; depth -= 1) {
    if ($pos.node(depth).type.name === PRIVATE_BLOCK_NODE) return depth;
  }
  return null;
}

const isPrivateMark = (m: { type: { name: string } }) => m.type.name === PRIVATE_TEXT_MARK;

/**
 * Is a collapsed cursor touching private text? `marks()` alone misses the
 * trailing boundary of a non-inclusive mark, so the adjacent text nodes are
 * consulted too — a cursor at the end of `%%run%%` still means "this run".
 */
function cursorInPrivateText($pos: ResolvedPos): boolean {
  if ($pos.marks().some(isPrivateMark)) return true;
  if ($pos.nodeBefore?.marks.some(isPrivateMark)) return true;
  return $pos.nodeAfter?.marks.some(isPrivateMark) ?? false;
}

/**
 * Lift every child of the private block at `depth` out of it, removing the
 * wrapper. Returns false when the grandparent cannot hold the content.
 */
function liftWholePrivateBlock(tr: Transaction, $pos: ResolvedPos, depth: number): boolean {
  const block = $pos.node(depth);
  const start = $pos.start(depth);
  const end = start + block.content.size;
  if (block.childCount === 0) return false;
  // Positions just inside the first and last children — both resolve with the
  // private block as their parent, so blockRange spans every child.
  const $a = tr.doc.resolve(start + 1);
  const $b = tr.doc.resolve(end - 1);
  const range = $a.blockRange($b, (node) => node.type.name === PRIVATE_BLOCK_NODE);
  if (!range) return false;
  const target = liftTarget(range);
  if (target === null) return false;
  tr.lift(range, target);
  return true;
}

// ── Inline mark ───────────────────────────────────────────────────────────────

const privateTextParse = () => [{ tag: `span[data-private="text"]` }];

const privateTextRender = (HTMLAttributes: Record<string, unknown>) =>
  [
    "span",
    mergeAttributes(HTMLAttributes, { "data-private": "text", class: "private-text" }),
    0,
  ] as const;

/**
 * The contiguous run of private text touching `$pos` on the given side, as a
 * document range — or null when that side is not private text.
 */
function privateRunRange($pos: ResolvedPos, side: "before" | "after"): { from: number; to: number } | null {
  const parent = $pos.parent;
  const index = $pos.index();
  const anchorIndex = side === "before" ? index - 1 : index;
  const anchor = parent.maybeChild(anchorIndex);
  if (!anchor || !anchor.isText || !anchor.marks.some(isPrivateMark)) return null;
  let startIndex = anchorIndex;
  while (startIndex > 0 && parent.child(startIndex - 1).isText && parent.child(startIndex - 1).marks.some(isPrivateMark)) {
    startIndex -= 1;
  }
  let endIndex = anchorIndex;
  while (endIndex + 1 < parent.childCount && parent.child(endIndex + 1).isText && parent.child(endIndex + 1).marks.some(isPrivateMark)) {
    endIndex += 1;
  }
  let from = $pos.start();
  for (let i = 0; i < startIndex; i += 1) from += parent.child(i).nodeSize;
  let to = from;
  for (let i = startIndex; i <= endIndex; i += 1) to += parent.child(i).nodeSize;
  return { from, to };
}

/** Would text typed at this cursor carry the private mark? */
function typingIsPrivate(state: { storedMarks: readonly PMMark[] | null; selection: { $from: ResolvedPos } }): boolean {
  const marks = state.storedMarks ?? state.selection.$from.marks();
  return marks.some(isPrivateMark);
}

export const PrivateText = Mark.create({
  name: PRIVATE_TEXT_MARK,
  // Typing at the trailing edge CONTINUES the comment (a caret that was
  // inside stays inside), the way a code comment keeps going until you leave
  // it. Leaving is explicit: ArrowRight at the edge steps out without moving.
  // The leading edge is the opposite by ProseMirror's own rule: text typed
  // just before a run is outside it.
  inclusive: true,

  parseHTML() {
    return privateTextParse();
  },

  renderHTML({ HTMLAttributes }) {
    return [...privateTextRender(HTMLAttributes)];
  },

  addKeyboardShortcuts() {
    return {
      // Trailing edge, caret inside → step OUT (no movement). The next
      // ArrowRight moves normally; the next typed character is plain text.
      ArrowRight: () => {
        const { state, view } = this.editor;
        const { $from, empty } = state.selection;
        if (!empty || !typingIsPrivate(state)) return false;
        if (!privateRunRange($from, "before") || privateRunRange($from, "after")) return false;
        const marks = (state.storedMarks ?? $from.marks()).filter((m) => !isPrivateMark(m));
        view.dispatch(state.tr.setStoredMarks(marks));
        return true;
      },
      // Backspace on the OUTER trailing edge deletes the closing `%%`: the
      // run is uncommented, its text stays. (Inside the edge, Backspace
      // deletes a character as usual.)
      Backspace: () => {
        const { state, view } = this.editor;
        const { $from, empty } = state.selection;
        if (!empty || typingIsPrivate(state)) return false;
        const run = privateRunRange($from, "before");
        if (!run || $from.pos !== run.to) return false;
        view.dispatch(state.tr.removeMark(run.from, run.to, this.type));
        return true;
      },
      // Delete on the OUTER leading edge deletes the opening `%%` likewise.
      Delete: () => {
        const { state, view } = this.editor;
        const { $from, empty } = state.selection;
        if (!empty || typingIsPrivate(state)) return false;
        const run = privateRunRange($from, "after");
        if (!run || $from.pos !== run.from) return false;
        view.dispatch(state.tr.removeMark(run.from, run.to, this.type));
        return true;
      },
    };
  },

  addInputRules() {
    return [
      // `%%text%%` — the closing delimiter converts the run into the mark and
      // removes both delimiters (the editor draws them back as CSS chrome).
      // Same shape as the bold rule: the last capture group is the content.
      markInputRule({
        find: /(?:^|\s)(%%(?!\s+%%)((?:[^%]+))%%(?!\s+%%))$/,
        type: this.type,
      }),
    ];
  },

  addCommands() {
    return {
      setPrivateText:
        () =>
        ({ commands }) =>
          commands.setMark(this.name),
      unsetPrivateText:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name, { extendEmptyMarkRange: true }),
      togglePrivateText:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
    };
  },
});

export const ServerPrivateText = Mark.create({
  name: PRIVATE_TEXT_MARK,
  inclusive: true,

  parseHTML() {
    return privateTextParse();
  },

  renderHTML({ HTMLAttributes }) {
    return [...privateTextRender(HTMLAttributes)];
  },
});

// ── Block node ────────────────────────────────────────────────────────────────

const privateBlockParse = () => [{ tag: `div[data-private="block"]` }];

const privateBlockRender = (HTMLAttributes: Record<string, unknown>) =>
  [
    "div",
    mergeAttributes(HTMLAttributes, { "data-private": "block", class: "private-block" }),
    0,
  ] as const;

export const PrivateBlock = Node.create({
  name: PRIVATE_BLOCK_NODE,
  group: "block",
  content: "block+",
  defining: true,

  parseHTML() {
    return privateBlockParse();
  },

  renderHTML({ HTMLAttributes }) {
    return [...privateBlockRender(HTMLAttributes)];
  },

  addCommands() {
    return {
      setPrivateBlock:
        () =>
        ({ commands }) =>
          commands.wrapIn(this.name),

      unsetPrivateBlock:
        () =>
        ({ tr, dispatch }) => {
          const $from = tr.selection.$from;
          const depth = privateBlockDepth($from);
          if (depth === null) return false;
          if (!dispatch) return true;
          return liftWholePrivateBlock(tr, $from, depth);
        },

      togglePrivate:
        () =>
        ({ state, commands, chain }) => {
          const { $from, $to, empty } = state.selection;

          // Inside a private block → uncomment the whole block, the way one
          // Cmd+/ created it.
          if (privateBlockDepth($from) !== null) {
            return commands.unsetPrivateBlock();
          }

          // Cursor resting in private text → uncomment that whole run.
          if (empty && cursorInPrivateText($from)) {
            return commands.unsetPrivateText();
          }

          // A selection inside one paragraph is an inline comment.
          const inlineShape = !empty && $from.sameParent($to) && $from.parent.isTextblock;
          if (inlineShape) {
            return commands.togglePrivateText();
          }

          // Bare cursor, or a selection crossing blocks → comment out the blocks.
          if (chain().wrapIn(this.name).run()) return true;
          // Somewhere wrapping is not allowed (e.g. a table cell whose schema
          // forbids it): fall back to the inline mark when there is a selection.
          return empty ? false : commands.togglePrivateText();
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-/": () => this.editor.commands.togglePrivate(),

      // The block's delimiters behave like deletable lines. Backspace at the
      // very start of the paragraph right AFTER a private block deletes its
      // closing `%%` — the block is uncommented, nothing gets adopted into it
      // (ProseMirror's default would merge that paragraph into the block).
      // Backspace at the start of the block's FIRST paragraph deletes the
      // opening `%%` with the same result.
      Backspace: () => {
        const { state } = this.editor;
        const { $from, empty } = state.selection;
        if (!empty || $from.parentOffset !== 0 || !$from.parent.isTextblock) return false;

        const depth = privateBlockDepth($from);
        if (depth !== null) {
          if ($from.index(depth) !== 0) return false;
          return this.editor
            .chain()
            .command(({ tr, dispatch }) => {
              if (!dispatch) return true;
              return liftWholePrivateBlock(tr, tr.selection.$from, depth);
            })
            .run();
        }

        const $before = state.doc.resolve($from.before());
        const previous = $before.nodeBefore;
        if (!previous || previous.type.name !== PRIVATE_BLOCK_NODE) return false;
        return this.editor
          .chain()
          .command(({ tr, dispatch }) => {
            if (!dispatch) return true;
            // A position just inside the previous block's last child.
            const $inside = tr.doc.resolve($before.pos - 2);
            const d = privateBlockDepth($inside);
            if (d === null) return false;
            const caret = tr.selection.from;
            const ok = liftWholePrivateBlock(tr, $inside, d);
            if (ok) tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(caret)));
            return ok;
          })
          .run();
      },

      // The typed block form. A paragraph containing exactly `%%` + Enter
      // opens a private block (outside one) or closes it (inside one),
      // mirroring Obsidian's multi-line comment.
      Enter: () => {
        const { state } = this.editor;
        const { $from, empty } = state.selection;
        if (!empty) return false;
        const paragraph = $from.parent;
        if (paragraph.type.name !== "paragraph") return false;
        if (paragraph.textContent !== PRIVATE_DELIMITER) return false;

        const textRange = { from: $from.start(), to: $from.end() };
        const depth = privateBlockDepth($from);

        if (depth === null) {
          return this.editor.chain().deleteRange(textRange).wrapIn(this.name).run();
        }

        const block = $from.node(depth);
        if (block.childCount === 1) {
          // The `%%` line is the block's only content: closing it is the same
          // as uncommenting — leave one empty paragraph behind.
          return this.editor
            .chain()
            .deleteRange(textRange)
            .command(({ tr, dispatch }) => {
              const d = privateBlockDepth(tr.selection.$from);
              if (d === null) return false;
              if (!dispatch) return true;
              return liftWholePrivateBlock(tr, tr.selection.$from, d);
            })
            .run();
        }

        // Remove the `%%` paragraph and continue after the block — in the
        // empty paragraph that already follows it (StarterKit's trailing node
        // keeps one at the end of the document), else in a fresh one.
        return this.editor
          .chain()
          .command(({ tr, dispatch }) => {
            if (!dispatch) return true;
            const blockEnd = $from.after(depth);
            tr.delete($from.before(), $from.after());
            const after = tr.mapping.map(blockEnd);
            const next = tr.doc.resolve(after).nodeAfter;
            if (next && next.isTextblock && next.content.size === 0) {
              tr.setSelection(TextSelection.create(tr.doc, after + 1));
              return true;
            }
            tr.insert(after, state.schema.nodes.paragraph.create());
            tr.setSelection(TextSelection.create(tr.doc, after + 1));
            return true;
          })
          .run();
      },
    };
  },
});

export const ServerPrivateBlock = Node.create({
  name: PRIVATE_BLOCK_NODE,
  group: "block",
  content: "block+",
  defining: true,

  parseHTML() {
    return privateBlockParse();
  },

  renderHTML({ HTMLAttributes }) {
    return [...privateBlockRender(HTMLAttributes)];
  },
});
