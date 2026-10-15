/**
 * Highlights on scripture text (client-safe, pure).
 *
 * A scripture annotation's locator addresses verses, not a CFI:
 * `href` = "<book>/<chapter>/<verseStart>[-<verseEnd>]" and
 * `locations.start` / `locations.end` = character offsets into the first and
 * last verse's text. Verse text is stable (pinned corpus), so offsets are
 * exact; the quote in `text.highlight` is kept for display and export.
 */

import type { ReaderAnnotationDto } from "@/lib/domain/reader/types";
import { parseVerseHref } from "./types";

export interface VerseMark {
  annotationId: string;
  color: string | null;
  start: number;
  end: number;
}

export interface VerseSegment {
  text: string;
  start: number;
  marks: VerseMark[];
}

/** The marks that fall on one verse, clipped to it, in creation order. */
export function marksForVerse(
  annotations: ReaderAnnotationDto[],
  bookSlug: string,
  chapter: number,
  verse: number,
  verseLength: number
): VerseMark[] {
  const marks: VerseMark[] = [];
  for (const annotation of annotations) {
    if (annotation.kind === "bookmark" || !annotation.locator.href) continue;
    const ref = parseVerseHref(annotation.locator.href);
    if (!ref || ref.bookSlug !== bookSlug || ref.chapter !== chapter || ref.verseStart == null) continue;
    const last = ref.verseEnd ?? ref.verseStart;
    if (verse < ref.verseStart || verse > last) continue;
    const start = verse === ref.verseStart ? clamp(annotation.locator.locations.start ?? 0, verseLength) : 0;
    const end = verse === last ? clamp(annotation.locator.locations.end ?? verseLength, verseLength) : verseLength;
    if (end > start) marks.push({ annotationId: annotation.id, color: annotation.color, start, end });
  }
  return marks;
}

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(value)));
}

/** Split a verse at every mark boundary; each piece lists the marks covering it. */
export function segmentVerse(text: string, marks: VerseMark[]): VerseSegment[] {
  const cuts = new Set<number>([0, text.length]);
  for (const mark of marks) {
    cuts.add(mark.start);
    cuts.add(mark.end);
  }
  const points = [...cuts].filter((point) => point >= 0 && point <= text.length).sort((a, b) => a - b);
  const segments: VerseSegment[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    if (end <= start) continue;
    segments.push({
      text: text.slice(start, end),
      start,
      marks: marks.filter((mark) => mark.start <= start && mark.end >= end),
    });
  }
  return segments;
}
