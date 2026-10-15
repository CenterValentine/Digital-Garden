/**
 * Scripture verses in the link menu (lib/domain/content/link-anchor.ts):
 * typing `[[Alma 32:21` offers that passage in each enabled collection whose
 * books know the reference; picking it inserts a `verse:` anchored link to the
 * collection's tab, shown as "Alma 32:21".
 */

import type { LinkAnchorItem, LinkAnchorSuggester } from "@/lib/domain/content/link-anchor";
import { clipAnchorLabel } from "@/lib/domain/content/link-anchor";
import { buildBookIndex, formatReference, parseReference, type BookIndex } from "@/lib/domain/scripture/reference";
import {
  formatVerseHref,
  scriptureTabId,
  VERSE_ANCHOR_KIND,
  type ScriptureBookInfo,
  type ScriptureCorpusInfo,
} from "@/lib/domain/scripture/types";
import { READER_VIRTUAL_CONTENT_TYPE } from "../manifest";
import { useReaderBookshelf } from "../state/bookshelf-store";
import { scriptureApi } from "./api";

interface CorpusBooks {
  index: BookIndex;
  books: Map<string, ScriptureBookInfo>;
}

/** Book tables per collection — fixed text, so fetched once per session. */
const booksCache = new Map<string, Promise<CorpusBooks | null>>();

function corpusBooks(corpusId: string): Promise<CorpusBooks | null> {
  let cached = booksCache.get(corpusId);
  if (!cached) {
    cached = scriptureApi
      .contents(corpusId)
      .then((contents) => {
        const books = contents.volumes.flatMap((volume) => volume.books);
        return {
          index: buildBookIndex(books.map((book) => ({ ...book, chapters: book.chapterCount }))),
          books: new Map(books.map((book) => [book.slug, book])),
        };
      })
      .catch(() => {
        booksCache.delete(corpusId);
        return null;
      });
    booksCache.set(corpusId, cached);
  }
  return cached;
}

/** Looks like a reference: a book-ish word then a chapter number. */
const REFERENCE_SHAPE = /^\s*(?:[1-4]\s*)?[A-Za-z&][A-Za-z&.'’\s—–-]*\s+\d/;

async function suggestionFor(
  corpus: ScriptureCorpusInfo,
  query: string
): Promise<{ target: { id: string; title: string; contentType: string }; anchor: LinkAnchorItem } | null> {
  const loaded = await corpusBooks(corpus.id);
  if (!loaded) return null;
  const ref = parseReference(query, loaded.index);
  if (!ref || ref.chapter == null) return null;
  const book = loaded.books.get(ref.bookSlug);
  const display = formatReference(ref, () => (book ? book.abbreviations[0] ?? book.name : ref.bookSlug));
  let preview: string | undefined;
  try {
    const { references } = await scriptureApi.resolve(corpus.id, query);
    preview = references[0]?.verses.map((verse) => verse.text).join(" ");
  } catch {
    // The reference still links; it just has no preview.
  }
  return {
    target: { id: scriptureTabId(corpus.id), title: corpus.title, contentType: READER_VIRTUAL_CONTENT_TYPE },
    anchor: {
      anchor: `${VERSE_ANCHOR_KIND}:${formatVerseHref(ref)}`,
      label: preview ? `${display} — ${clipAnchorLabel(preview, 120)}` : display,
      detail: corpus.title,
      display,
    },
  };
}

export const scriptureLinkSuggestions: LinkAnchorSuggester = async (query) => {
  if (!REFERENCE_SHAPE.test(query)) return null;
  const { scriptures } = useReaderBookshelf.getState();
  if (!scriptures.length) return null;
  const found = await Promise.all(scriptures.map((corpus) => suggestionFor(corpus, query)));
  return found.filter((item): item is NonNullable<typeof item> => item !== null);
};
