/**
 * Heading Fold — accordion-like collapse as HEADER DECORATION, not structure.
 *
 * The document stays flat: a heading's "section" (every following sibling up
 * to the next heading of equal-or-higher rank) is a DERIVED view concept.
 * Collapsing hides that range with node decorations (`display:none` via the
 * dg-fold-hidden class); nothing is ever restructured or removed. Blank
 * headings ("## " with no text) participate identically — they terminate
 * folds and can fold. The one stored fact is the heading's `collapsed` attr
 * (see heading.ts), which persists with the doc and syncs in collaboration.
 *
 * Because ProseMirror commands are blind to CSS, every edit that could touch
 * a hidden range is guarded: a deterministic appendTransaction auto-expands
 * the owning fold whenever a doc change or the selection lands inside hidden
 * content (unfold-on-edit — nothing invisible is ever edited), and an Enter
 * keymap keeps typing after a collapsed heading OUTSIDE its hidden section.
 * Determinism makes the guards collab-safe: every client computes the same
 * result, so concurrent runs converge (heading-hardbreak-split precedent).
 *
 * The fold affordance is a gutter chevron rendered as a widget decoration
 * absolutely positioned into the editor's left padding — zero document-flow
 * presence, zero text alignment impact, with a generous full-gutter hit
 * target (not just the glyph). Read-only surfaces render fully expanded with
 * no widgets; heading DOM still gets its derived anchor id.
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, Selection, TextSelection } from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import { createSlugAssigner } from "@/lib/domain/content/heading-ids";

// ─── Fold geometry ───────────────────────────────────────────────────────────

export interface FoldRange {
  /** Position before the heading node. */
  headingPos: number;
  /** Position after the heading node (= start of the subject range). */
  headingEnd: number;
  level: number;
  collapsed: boolean;
  /** Derived anchor slug (null for blank headings — foldable, not linkable). */
  slug: string | null;
  /** Subject range: [rangeFrom, rangeTo). Empty when rangeTo === rangeFrom. */
  rangeFrom: number;
  rangeTo: number;
}

interface FoldData {
  ranges: FoldRange[];
  /** [pos, end] of every sibling node hidden by some collapsed fold. */
  hidden: Array<[number, number]>;
}

/**
 * One walk deriving every heading's fold range, slug, and the exact node
 * ranges hidden by collapsed folds. Sibling-scoped per parent, so folding
 * works identically inside containers (columns, callouts, …).
 */
function buildFoldData(doc: ProseMirrorNode): FoldData {
  const ranges: FoldRange[] = [];
  const hidden: Array<[number, number]> = [];
  const assignSlug = createSlugAssigner();

  const visit = (parent: ProseMirrorNode, parentStart: number) => {
    let open: FoldRange[] = [];

    parent.forEach((node, offset) => {
      const childPos = parentStart + offset;
      const childEnd = childPos + node.nodeSize;

      if (node.type.name === "heading") {
        // A heading of level ≤ L terminates every open fold of level ≥ its own.
        open = open.filter((fold) => node.attrs.level > fold.level);
        // The heading itself is subject to any remaining (superior) folds.
        open.forEach((fold) => {
          fold.rangeTo = childEnd;
        });
        if (open.some((fold) => fold.collapsed)) hidden.push([childPos, childEnd]);

        const fold: FoldRange = {
          headingPos: childPos,
          headingEnd: childEnd,
          level: node.attrs.level as number,
          collapsed: node.attrs.collapsed === true,
          slug: assignSlug(node.textContent),
          rangeFrom: childEnd,
          rangeTo: childEnd,
        };
        ranges.push(fold);
        open.push(fold);
      } else {
        open.forEach((fold) => {
          fold.rangeTo = childEnd;
        });
        if (open.some((fold) => fold.collapsed)) hidden.push([childPos, childEnd]);

        // Recurse into block containers so nested headings fold their own
        // sibling scope. Textblocks (paragraphs etc.) hold only inline content.
        if (!node.isTextblock && node.childCount > 0) {
          visit(node, childPos + 1);
        }
      }
    });
  };

  visit(doc, 0);
  return { ranges, hidden };
}

/** Fold ranges for a document — shared with the scroll-to-heading path. */
export function computeFoldRanges(doc: ProseMirrorNode): FoldRange[] {
  return buildFoldData(doc).ranges;
}

/**
 * Expand (in `tr`) every collapsed fold whose subject range contains `pos`,
 * so the position is visible. Returns true if anything was expanded.
 */
export function expandFoldsContaining(tr: Transaction, pos: number): boolean {
  let expanded = false;
  for (const fold of computeFoldRanges(tr.doc)) {
    if (fold.collapsed && pos >= fold.rangeFrom && pos < fold.rangeTo) {
      const heading = tr.doc.nodeAt(fold.headingPos);
      if (heading?.type.name === "heading") {
        tr.setNodeMarkup(fold.headingPos, undefined, {
          ...heading.attrs,
          collapsed: false,
        });
        expanded = true;
      }
    }
  }
  return expanded;
}

// ─── Guard helpers ───────────────────────────────────────────────────────────

/**
 * Ranges each step replaced, mapped into the coordinate space of the final
 * doc (through the remaining steps of its own transaction, then through every
 * subsequent transaction).
 */
function collectEditedRanges(
  transactions: readonly Transaction[],
): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];

  transactions.forEach((tr, trIndex) => {
    tr.steps.forEach((step, stepIndex) => {
      step.getMap().forEach((_fromA, _toA, fromB, toB) => {
        let from = fromB;
        let to = toB;
        for (let i = stepIndex + 1; i < tr.steps.length; i++) {
          const map = tr.steps[i].getMap();
          from = map.map(from, -1);
          to = map.map(to, 1);
        }
        for (let j = trIndex + 1; j < transactions.length; j++) {
          for (const later of transactions[j].steps) {
            const map = later.getMap();
            from = map.map(from, -1);
            to = map.map(to, 1);
          }
        }
        ranges.push([from, to]);
      });
    });
  });

  return ranges;
}

// ─── Gutter widget ───────────────────────────────────────────────────────────

function buildChevron(
  view: EditorView,
  headingPos: number,
  collapsed: boolean,
): HTMLElement {
  const gutter = document.createElement("span");
  gutter.className = "dg-fold-gutter";
  gutter.setAttribute("contenteditable", "false");
  gutter.setAttribute("role", "button");
  gutter.setAttribute("aria-expanded", String(!collapsed));
  gutter.setAttribute("aria-label", collapsed ? "Expand section" : "Collapse section");

  const glyph = document.createElement("span");
  glyph.className = "dg-fold-chevron";
  glyph.textContent = "▾";
  gutter.appendChild(glyph);

  gutter.addEventListener("mousedown", (event) => {
    // Keep focus in the editor (BubbleMenu focus-theft rule) and keep
    // ProseMirror from treating this as a document click.
    event.preventDefault();
    event.stopPropagation();

    // Positions captured at decoration build time are fresh: any doc change
    // rebuilds the decoration set, so re-resolve defensively and bail if the
    // node moved out from under us.
    const { state } = view;
    const heading = state.doc.nodeAt(headingPos);
    if (heading?.type.name !== "heading") return;

    const nextCollapsed = heading.attrs.collapsed !== true;
    const tr = state.tr.setNodeMarkup(headingPos, undefined, {
      ...heading.attrs,
      collapsed: nextCollapsed,
    });

    if (nextCollapsed) {
      // Eject a selection sitting inside the range being hidden — otherwise
      // the guard plugin would immediately re-expand the fold.
      const fold = computeFoldRanges(state.doc).find(
        (f) => f.headingPos === headingPos,
      );
      const { from, to } = state.selection;
      if (fold && from < fold.rangeTo && to > fold.rangeFrom) {
        const headingTextEnd = fold.headingEnd - 1;
        tr.setSelection(TextSelection.create(tr.doc, headingTextEnd));
      }
    }

    view.dispatch(tr);
  });

  return gutter;
}

// ─── The extension ───────────────────────────────────────────────────────────

/** Plugin state: pre-built decoration sets for both editability modes. */
interface FoldDecorations {
  editable: DecorationSet;
  readonly: DecorationSet;
}

const headingFoldKey = new PluginKey<FoldDecorations>("headingFold");

export const HeadingFold = Extension.create({
  name: "headingFold",

  addKeyboardShortcuts() {
    return {
      /**
       * Enter on a collapsed heading must not drop the cursor into the hidden
       * section. At the end of the heading: continue writing BELOW the fold
       * (section stays collapsed). Mid-text: split as usual, but only the
       * lower half — the one adjacent to the section — keeps `collapsed`.
       */
      Enter: () => {
        const { state } = this.editor;
        const { $from, empty } = state.selection;
        if (!empty) return false;
        if ($from.parent.type.name !== "heading") return false;
        if ($from.parent.attrs.collapsed !== true) return false;
        if ($from.parentOffset === 0) return false; // default: insert block above

        const headingPos = $from.before();
        const fold = computeFoldRanges(state.doc).find(
          (f) => f.headingPos === headingPos,
        );
        if (!fold) return false;

        if ($from.parentOffset === $from.parent.content.size) {
          if (fold.rangeTo <= fold.rangeFrom) return false; // empty section
          const paragraph = state.schema.nodes.paragraph.create();
          const tr = state.tr.insert(fold.rangeTo, paragraph);
          tr.setSelection(TextSelection.create(tr.doc, fold.rangeTo + 1));
          this.editor.view.dispatch(tr.scrollIntoView());
          return true;
        }

        const tr = state.tr;
        tr.split($from.pos);
        const upper = tr.doc.nodeAt(headingPos);
        if (upper?.type.name === "heading" && upper.attrs.collapsed === true) {
          tr.setNodeMarkup(headingPos, undefined, { ...upper.attrs, collapsed: false });
        }
        this.editor.view.dispatch(tr.scrollIntoView());
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;

    // Both variants are kept so an editability flip (which happens without a
    // transaction) always renders the right set: editors get folds + widgets,
    // read-only surfaces render fully expanded with anchor ids only.
    const buildDecorations = (doc: ProseMirrorNode): FoldDecorations => {
      const data = buildFoldData(doc);
      const editableDecos: Decoration[] = [];
      const readonlyDecos: Decoration[] = [];

      for (const fold of data.ranges) {
        if (fold.slug) {
          readonlyDecos.push(
            Decoration.node(fold.headingPos, fold.headingEnd, { id: fold.slug }),
          );
        }
        const attrs: Record<string, string> = {};
        if (fold.slug) attrs.id = fold.slug;
        if (fold.collapsed) attrs.class = "dg-heading-collapsed";
        if (Object.keys(attrs).length > 0) {
          editableDecos.push(Decoration.node(fold.headingPos, fold.headingEnd, attrs));
        }
        editableDecos.push(
          Decoration.widget(
            fold.headingPos + 1,
            (view) => buildChevron(view, fold.headingPos, fold.collapsed),
            {
              side: -1,
              key: `dg-fold:${fold.headingPos}:${fold.collapsed ? "c" : "o"}`,
              ignoreSelection: true,
              stopEvent: () => true,
            },
          ),
        );
      }

      for (const [from, to] of data.hidden) {
        editableDecos.push(Decoration.node(from, to, { class: "dg-fold-hidden" }));
      }

      return {
        editable: DecorationSet.create(doc, editableDecos),
        readonly: DecorationSet.create(doc, readonlyDecos),
      };
    };

    return [
      new Plugin<FoldDecorations>({
        key: headingFoldKey,

        state: {
          init: (_config, state) => buildDecorations(state.doc),
          apply: (tr, value, _oldState, newState) => {
            if (tr.docChanged) {
              return buildDecorations(newState.doc);
            }
            return {
              editable: value.editable.map(tr.mapping, tr.doc),
              readonly: value.readonly.map(tr.mapping, tr.doc),
            };
          },
        },

        props: {
          decorations(state) {
            const value = headingFoldKey.getState(state);
            if (!value) return undefined;
            return editor.isEditable ? value.editable : value.readonly;
          },
        },

        /**
         * The safety net. ProseMirror commands address the flat document and
         * ignore CSS visibility, so after every batch:
         * - any doc change that touched a hidden range expands its fold
         *   (join/delete across a boundary, paste, input rules, …);
         * - a selection that ended up inside a hidden range either expands
         *   the fold (doc changed) or is relocated past it (pure cursor
         *   motion, direction-aware).
         * Deterministic on state ⇒ identical on every client ⇒ convergent.
         */
        appendTransaction: (transactions, oldState, newState) => {
          if (!editor.isEditable) return null;

          const data = buildFoldData(newState.doc);
          const collapsedFolds = data.ranges.filter(
            (fold) => fold.collapsed && fold.rangeTo > fold.rangeFrom,
          );
          if (collapsedFolds.length === 0) return null;

          const docChanged = transactions.some((tr) => tr.docChanged);
          const selection = newState.selection;
          const tr = newState.tr;

          if (docChanged) {
            const edited = collectEditedRanges(transactions);
            const toExpand = new Set<number>();

            for (const fold of collapsedFolds) {
              const editedInside = edited.some(
                ([from, to]) => from < fold.rangeTo && to > fold.rangeFrom,
              );
              const selectionInside =
                selection.from < fold.rangeTo && selection.to > fold.rangeFrom;
              if (editedInside || selectionInside) toExpand.add(fold.headingPos);
            }
            if (toExpand.size === 0) return null;

            let modified = false;
            for (const pos of toExpand) {
              const heading = newState.doc.nodeAt(pos);
              if (heading?.type.name === "heading") {
                tr.setNodeMarkup(pos, undefined, { ...heading.attrs, collapsed: false });
                modified = true;
              }
            }
            return modified ? tr : null;
          }

          // Pure selection motion: hop over the hidden range instead of
          // expanding it.
          const blocking = collapsedFolds.find(
            (fold) => selection.from < fold.rangeTo && selection.to > fold.rangeFrom,
          );
          if (!blocking) return null;

          const forward = selection.head >= oldState.selection.head;
          const target = forward
            ? Math.min(blocking.rangeTo, newState.doc.content.size)
            : blocking.rangeFrom;
          const next = Selection.near(newState.doc.resolve(target), forward ? 1 : -1);
          tr.setSelection(next);
          return tr;
        },
      }),
    ];
  },
});
