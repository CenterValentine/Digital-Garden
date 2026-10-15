/**
 * A collection's volumes and books, known without a fetch (client-safe).
 *
 * The "+" menu is built synchronously when it opens, so it can only offer
 * "Gospel Library › Book of Mormon › Alma › 32" for a collection whose book
 * table ships with the code. LDS does (lib/domain/scripture/lds.ts); a
 * collection without one is still offered, just without the drill-down.
 */

import { LDS_CORPUS_ID } from "./catalog";
import { LDS_BOOKS, LDS_VOLUMES } from "./lds";

export interface StaticScriptureVolume {
  slug: string;
  title: string;
  /** "Chapter" / "Section" — how this volume names its units. */
  chapterLabel: string;
  books: Array<{ slug: string; name: string; chapters: number }>;
}

export function staticScriptureTable(corpusId: string): StaticScriptureVolume[] | null {
  if (corpusId !== LDS_CORPUS_ID) return null;
  return LDS_VOLUMES.map((volume) => ({
    slug: volume.slug,
    title: volume.title,
    chapterLabel: volume.chapterLabel,
    books: LDS_BOOKS.filter((book) => book.volume === volume.slug).map((book) => ({
      slug: book.slug,
      name: book.name,
      chapters: book.chapters,
    })),
  }));
}
