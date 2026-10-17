/**
 * Comment mark — the document-side anchor of a comment thread.
 *
 * `<span data-comment="<threadId>">passage</span>`. The mark carries ONLY the
 * thread id: the discussion (authors, bodies, resolved state) lives beside the
 * note in Postgres and is drawn over the mark as decorations by the comments
 * plugin (Phase 1), so resolving or selecting a thread never touches the
 * CRDT. See lib/domain/content/comments.ts for the egress contract and
 * docs/notes-feature/work-tracking/COMMENTS-ANNOTATIONS-PLAN.md §4.
 *
 * Choices that differ from the look-alike marks:
 *   - `excludes: ""` — two threads may share text (Google Docs allows it);
 *     their fills stack, which reads naturally as "more than one".
 *   - `inclusive: false` — a comment is about what was selected; typing at
 *     its edge is outside it (the opposite of privateText, which continues).
 *   - Rendering is faithful on the server (the private-content choice, not the
 *     cloze one): the public page and every AI read strip the mark at their
 *     seam, so `generateJSON(generateHTML(node))` stays symmetric and the
 *     CriticMarkup codec can round-trip.
 *
 * `ServerCommentMark` is the same name, attrs, parseHTML and renderHTML with
 * nothing else — the collaboration server and server-side parsing need the
 * schema, not the commands. The literal `name: "comment"` is deliberate: the
 * collab-schema gate discovers marks by regex and a constant hides it.
 */

import { Mark, mergeAttributes } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { COMMENT_MARK, isCommentThreadId } from "@/lib/domain/content/comments";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    comment: {
      /** Anchor `threadId` to the current selection (no-op when collapsed). */
      setComment: (threadId: string) => ReturnType;
      /** Remove every anchor of `threadId` from the whole document. */
      unsetComment: (threadId: string) => ReturnType;
    };
  }
}

const COMMENT_ATTR = "data-comment";

/** One attribute spec, shared by both twins so they cannot drift. */
function commentAttrSpec() {
  return {
    threadId: {
      default: null as string | null,
      parseHTML: (element: HTMLElement) => {
        const raw = element.getAttribute(COMMENT_ATTR);
        return isCommentThreadId(raw) ? raw.toLowerCase() : null;
      },
      renderHTML: (attributes: Record<string, unknown>) =>
        isCommentThreadId(attributes.threadId) ? { [COMMENT_ATTR]: attributes.threadId.toLowerCase() } : {},
    },
  };
}

const commentParse = () => [{ tag: `span[${COMMENT_ATTR}]` }];

const commentRender = (HTMLAttributes: Record<string, unknown>) =>
  ["span", mergeAttributes(HTMLAttributes, { class: "comment-mark" }), 0] as const;

export interface CommentRange {
  from: number;
  to: number;
}

/**
 * Every range in `doc` carrying the mark for `threadId`, adjacent runs merged.
 * Used by `unsetComment`, and by the Comments tab to order threads by position.
 */
export function findCommentRanges(doc: PMNode, threadId: string): CommentRange[] {
  const id = threadId.toLowerCase();
  const ranges: CommentRange[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const marked = node.marks.some(
      (m) => m.type.name === COMMENT_MARK && String(m.attrs.threadId ?? "").toLowerCase() === id,
    );
    if (!marked) return;
    const last = ranges[ranges.length - 1];
    if (last && last.to === pos) last.to = pos + node.nodeSize;
    else ranges.push({ from: pos, to: pos + node.nodeSize });
  });
  return ranges;
}

/** threadId → merged ranges, for every thread the document anchors. */
export function collectCommentRanges(doc: PMNode): Map<string, CommentRange[]> {
  const byThread = new Map<string, CommentRange[]>();
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    for (const mark of node.marks) {
      if (mark.type.name !== COMMENT_MARK) continue;
      const id = String(mark.attrs.threadId ?? "").toLowerCase();
      if (!isCommentThreadId(id)) continue;
      const ranges = byThread.get(id) ?? [];
      const last = ranges[ranges.length - 1];
      if (last && last.to === pos) last.to = pos + node.nodeSize;
      else ranges.push({ from: pos, to: pos + node.nodeSize });
      byThread.set(id, ranges);
    }
  });
  return byThread;
}

export const CommentMark = Mark.create({
  name: "comment",
  inclusive: false,
  excludes: "",

  addAttributes() {
    return commentAttrSpec();
  },

  parseHTML() {
    return commentParse();
  },

  renderHTML({ HTMLAttributes }) {
    return [...commentRender(HTMLAttributes)];
  },

  addCommands() {
    return {
      setComment:
        (threadId) =>
        ({ state, tr, dispatch }) => {
          if (!isCommentThreadId(threadId)) return false;
          const { from, to, empty } = state.selection;
          if (empty) return false;
          if (dispatch) {
            tr.addMark(from, to, this.type.create({ threadId: threadId.toLowerCase() }));
          }
          return true;
        },

      unsetComment:
        (threadId) =>
        ({ tr, dispatch }) => {
          if (!isCommentThreadId(threadId)) return false;
          const ranges = findCommentRanges(tr.doc, threadId);
          if (ranges.length === 0) return false;
          if (dispatch) {
            const id = threadId.toLowerCase();
            // Remove only THIS thread's mark instance; an overlapping thread
            // on the same text keeps its own.
            for (const { from, to } of ranges) {
              tr.doc.nodesBetween(from, to, (node, pos) => {
                if (!node.isText) return;
                for (const mark of node.marks) {
                  if (mark.type === this.type && String(mark.attrs.threadId ?? "").toLowerCase() === id) {
                    tr.removeMark(Math.max(pos, from), Math.min(pos + node.nodeSize, to), mark);
                  }
                }
              });
            }
          }
          return true;
        },
    };
  },
});

export const ServerCommentMark = Mark.create({
  name: "comment",
  inclusive: false,
  excludes: "",

  addAttributes() {
    return commentAttrSpec();
  },

  parseHTML() {
    return commentParse();
  },

  renderHTML({ HTMLAttributes }) {
    return [...commentRender(HTMLAttributes)];
  },
});
