import type { LinkAnchorItem, LinkAnchorLister } from "@/lib/domain/content/link-anchor";
import { contentTargetKey, type ReaderAnnotationDto } from "@/lib/domain/reader/types";
import { corpusIdFromTabId, scriptureTargetKey, VERSE_ANCHOR_KIND } from "@/lib/domain/scripture/types";
import { readerApi } from "./api";
import { MARK_SWATCH, parseMark } from "./marks";

/** The anchor kind for reader highlights / notes / bookmarks. */
export const ANNOTATION_ANCHOR_KIND = "annotation";

function toItem(annotation: ReaderAnnotationDto): LinkAnchorItem {
  const chapter = annotation.locator.label ?? undefined;
  if (annotation.kind === "bookmark") {
    return { anchor: `${ANNOTATION_ANCHOR_KIND}:${annotation.id}`, label: chapter ?? "Bookmark", detail: "Bookmark" };
  }
  const quote = annotation.locator.text?.highlight?.trim() || chapter || "Highlight";
  const note = annotation.body?.trim();
  return {
    anchor: `${ANNOTATION_ANCHOR_KIND}:${annotation.id}`,
    label: quote,
    detail: [note ? `Note: ${note}` : null, chapter].filter(Boolean).join(" · ") || undefined,
    color: MARK_SWATCH[parseMark(annotation.color).color],
  };
}

/**
 * `[[Book#` in the link menu: the book's highlights, notes and bookmarks in
 * book order, filtered by the text typed after `#`. Only books (files and
 * link-books) and scripture collections answer; everything else is some
 * other provider's business.
 */
export const readerLinkAnchors: LinkAnchorLister = async (target, query) => {
  const corpusId = corpusIdFromTabId(target.id);
  if (!corpusId && target.contentType !== "file" && target.contentType !== "external") return null;
  let annotations: ReaderAnnotationDto[];
  try {
    ({ annotations } = await readerApi.annotations(corpusId ? scriptureTargetKey(corpusId) : contentTargetKey(target.id)));
  } catch {
    return null;
  }
  if (!annotations.length) return null;
  const q = query.trim().toLowerCase();
  return [...annotations]
    .sort(
      (a, b) =>
        (a.locator.locations.totalProgression ?? Number.POSITIVE_INFINITY) -
        (b.locator.locations.totalProgression ?? Number.POSITIVE_INFINITY)
    )
    .filter(
      (annotation) =>
        !q ||
        [annotation.locator.text?.highlight, annotation.body, annotation.locator.label]
          .filter(Boolean)
          .some((text) => text!.toLowerCase().includes(q))
    )
    .map((annotation) => (corpusId ? toVerseItem(annotation) : toItem(annotation)));
};

/**
 * Scripture highlights link by passage (`verse:alma/32/21-23`), not by the
 * highlight's id: the verses are fixed text, so the link outlives the mark.
 */
function toVerseItem(annotation: ReaderAnnotationDto): LinkAnchorItem {
  const item = toItem(annotation);
  const href = annotation.locator.href;
  const reference = annotation.locator.label;
  return href ? { ...item, anchor: `${VERSE_ANCHOR_KIND}:${href}`, display: reference } : item;
}
