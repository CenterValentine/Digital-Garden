/**
 * Cloze Card Extractor — Session 3A
 *
 * Walks a TipTap source document and produces one ClozeCard per
 * unique ordinal found in clozeDeletion marks. Implements Anki's
 * "one-at-a-time" reveal:
 *
 *   For card N (the card asking about ordinal N):
 *     Front: cloze[N] text is replaced with the placeholder ("[...]"
 *            or the hint string). cloze[other] marks are stripped to
 *            plain text (other clozes are SHOWN, not hidden).
 *     Back:  cloze[N] text keeps its mark (renderer highlights it as
 *            the revealed answer). cloze[other] marks are stripped
 *            to plain text.
 *
 * Discontinuous spans with the same ordinal are treated as one card —
 * all spans replaced/revealed together. Hints follow first-occurrence:
 * if `{{c1::word::a hint}}` appears multiple times, the first hint wins.
 */

export interface TipTapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  marks?: TipTapMark[];
  content?: TipTapNode[];
  text?: string;
}

export interface ClozeCard {
  ordinal: number;
  hint: string | null;
  frontJson: TipTapNode;
  backJson: TipTapNode;
}

const CLOZE_MARK_NAME = "clozeDeletion";
const DEFAULT_PLACEHOLDER = "[...]";

function getClozeMark(node: TipTapNode): TipTapMark | undefined {
  return node.marks?.find((m) => m.type === CLOZE_MARK_NAME);
}

function getOrdinal(mark: TipTapMark): number {
  const raw = mark.attrs?.ordinal;
  const n = typeof raw === "number" ? raw : Number(raw ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function getHint(mark: TipTapMark): string | null {
  const raw = mark.attrs?.hint;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/**
 * Walk the doc and collect:
 *   - the set of unique ordinals present
 *   - the first-seen hint per ordinal (or null)
 */
function collectClozeInfo(node: TipTapNode): {
  ordinals: Set<number>;
  hintByOrdinal: Map<number, string | null>;
} {
  const ordinals = new Set<number>();
  const hintByOrdinal = new Map<number, string | null>();

  function visit(n: TipTapNode): void {
    const mark = getClozeMark(n);
    if (mark) {
      const ord = getOrdinal(mark);
      if (ord > 0) {
        ordinals.add(ord);
        if (!hintByOrdinal.has(ord)) {
          hintByOrdinal.set(ord, getHint(mark));
        }
      }
    }
    if (n.content) {
      for (const child of n.content) visit(child);
    }
  }

  visit(node);
  return { ordinals, hintByOrdinal };
}

/**
 * Produce the side-transformed node tree for `targetOrdinal`.
 *
 * Pure: returns new nodes; never mutates the input.
 */
function transformForOrdinal(
  node: TipTapNode,
  targetOrdinal: number,
  side: "front" | "back",
  hint: string | null,
): TipTapNode {
  // Container — recurse into children, return a new node.
  if (node.content && node.content.length > 0) {
    return {
      ...node,
      content: node.content.map((child) =>
        transformForOrdinal(child, targetOrdinal, side, hint),
      ),
    };
  }

  const clozeMark = getClozeMark(node);
  if (!clozeMark) {
    return node;
  }

  const thisOrdinal = getOrdinal(clozeMark);
  const isTarget = thisOrdinal === targetOrdinal;

  // Marks excluding the cloze mark — preserves bold/italic/etc.
  const otherMarks = (node.marks ?? []).filter(
    (m) => m.type !== CLOZE_MARK_NAME,
  );

  if (isTarget) {
    if (side === "front") {
      // Replace text with placeholder; strip cloze mark so the
      // placeholder renders cleanly (no highlight on the [...]).
      return {
        ...node,
        text: hint ?? DEFAULT_PLACEHOLDER,
        marks: otherMarks.length > 0 ? otherMarks : undefined,
      };
    }
    // Back: keep the cloze mark so renderer can highlight as the
    // revealed answer. Other marks pass through too.
    return node;
  }

  // Other ordinal — reveal as plain text, strip just the cloze mark.
  return {
    ...node,
    marks: otherMarks.length > 0 ? otherMarks : undefined,
  };
}

/**
 * Public entry point.
 *
 * Returns ClozeCards sorted by ordinal. Empty array if the source
 * contains no cloze marks (or only invalid/zero ordinals).
 */
export function extractClozeCards(sourceJson: TipTapNode): ClozeCard[] {
  const { ordinals, hintByOrdinal } = collectClozeInfo(sourceJson);
  if (ordinals.size === 0) return [];

  return Array.from(ordinals)
    .sort((a, b) => a - b)
    .map((ordinal) => {
      const hint = hintByOrdinal.get(ordinal) ?? null;
      return {
        ordinal,
        hint,
        frontJson: transformForOrdinal(sourceJson, ordinal, "front", hint),
        backJson: transformForOrdinal(sourceJson, ordinal, "back", hint),
      };
    });
}

/**
 * Convenience: number of cards that would be generated, without
 * running the full transform. Cheaper for UIs that just want to show
 * "this note will produce N cards".
 */
export function countClozeCards(sourceJson: TipTapNode): number {
  return collectClozeInfo(sourceJson).ordinals.size;
}
