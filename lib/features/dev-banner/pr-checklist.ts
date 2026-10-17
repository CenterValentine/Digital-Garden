/**
 * PR-description checklist parsing and toggling — pure, no I/O, so
 * `scripts/validate-pr-checklist.ts` pins it with plain `tsx`.
 *
 * GitHub has no checkbox API: ticking a box on github.com rewrites the whole
 * description. The dev checklist widget does the same, so the only contract
 * that matters is "flip exactly the line you meant and leave every other byte
 * alone". Items are therefore addressed by their TEXT (plus which occurrence of
 * that text), never by position — a description edited on GitHub since the
 * widget last loaded can reorder lines without flipping the wrong one.
 */

export interface ChecklistItem {
  /** The text after the box, verbatim (markdown included). */
  text: string;
  /** 0 for the first item with this exact text, 1 for the second, … */
  occurrence: number;
  checked: boolean;
  /** Nearest markdown heading above the item, or "" before any heading. */
  heading: string;
  /** Matches the repo's `**Smoke …:**` marker — a per-bug verdict for /pr-closeout. */
  isSmoke: boolean;
}

// `- [ ] text`, `* [x] text`, `1. [X] text`, any indentation.
const BOX = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\]\s+)(.*)$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const SMOKE = /^\*\*Smoke\b/i;

export function parseChecklist(body: string): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const seen = new Map<string, number>();
  let heading = "";
  let fence = false;
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (fence) continue;
    const h = HEADING.exec(line);
    if (h) {
      heading = h[1];
      continue;
    }
    const m = BOX.exec(line);
    if (!m) continue;
    const text = m[4].trimEnd();
    const occurrence = seen.get(text) ?? 0;
    seen.set(text, occurrence + 1);
    items.push({ text, occurrence, checked: m[2] !== " ", heading, isSmoke: SMOKE.test(text) });
  }
  return items;
}

/**
 * Set one item's box to `checked`, preserving every other byte (including the
 * body's own line endings). Returns null when the item is no longer in the
 * body — the caller should refresh rather than guess.
 */
export function setChecked(
  body: string,
  target: { text: string; occurrence: number },
  checked: boolean,
): string | null {
  const lines = body.split(/(\r?\n)/); // keep separators at odd indices
  let fence = false;
  let n = 0;
  for (let i = 0; i < lines.length; i += 2) {
    if (/^\s*(```|~~~)/.test(lines[i])) fence = !fence;
    if (fence) continue;
    const m = BOX.exec(lines[i]);
    if (!m || m[4].trimEnd() !== target.text) continue;
    if (n++ !== target.occurrence) continue;
    lines[i] = `${m[1]}${checked ? "x" : " "}${m[3]}${m[4]}`;
    return lines.join("");
  }
  return null;
}
