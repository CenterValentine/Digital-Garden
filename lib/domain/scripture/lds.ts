/**
 * The LDS standard works — volumes, books and reference spellings
 * (client-safe; the reference parser needs it without a database).
 *
 * Book slugs are the Church's own URL slugs (they are also bcbooks'
 * `lds_slug`), so a reference maps 1:1 onto churchofjesuschrist.org/study
 * paths. Abbreviations follow the Church's style guide ("1 Ne.", "D&C",
 * "JS—H") plus the full names and the common variants people type.
 */

import type { ScriptureVolumeInfo } from "./types";

export interface LdsBookDef {
  slug: string;
  name: string;
  volume: string;
  chapters: number;
  abbreviations: string[];
}

export const LDS_VOLUMES: Array<ScriptureVolumeInfo & { file: string; chapterLabel: string }> = [
  { slug: "ot", title: "Old Testament", file: "old-testament", chapterLabel: "Chapter" },
  { slug: "nt", title: "New Testament", file: "new-testament", chapterLabel: "Chapter" },
  { slug: "bofm", title: "Book of Mormon", file: "book-of-mormon", chapterLabel: "Chapter" },
  { slug: "dc-testament", title: "Doctrine and Covenants", file: "doctrine-and-covenants", chapterLabel: "Section" },
  { slug: "pgp", title: "Pearl of Great Price", file: "pearl-of-great-price", chapterLabel: "Chapter" },
];

const b = (slug: string, name: string, volume: string, chapters: number, ...abbreviations: string[]): LdsBookDef => ({
  slug,
  name,
  volume,
  chapters,
  abbreviations,
});

export const LDS_BOOKS: LdsBookDef[] = [
  // Old Testament
  b("gen", "Genesis", "ot", 50, "Gen."),
  b("ex", "Exodus", "ot", 40, "Ex.", "Exod."),
  b("lev", "Leviticus", "ot", 27, "Lev."),
  b("num", "Numbers", "ot", 36, "Num."),
  b("deut", "Deuteronomy", "ot", 34, "Deut."),
  b("josh", "Joshua", "ot", 24, "Josh."),
  b("judg", "Judges", "ot", 21, "Judg."),
  b("ruth", "Ruth", "ot", 4),
  b("1-sam", "1 Samuel", "ot", 31, "1 Sam."),
  b("2-sam", "2 Samuel", "ot", 24, "2 Sam."),
  b("1-kgs", "1 Kings", "ot", 22, "1 Kgs.", "1 Kings"),
  b("2-kgs", "2 Kings", "ot", 25, "2 Kgs.", "2 Kings"),
  b("1-chr", "1 Chronicles", "ot", 29, "1 Chr."),
  b("2-chr", "2 Chronicles", "ot", 36, "2 Chr."),
  b("ezra", "Ezra", "ot", 10),
  b("neh", "Nehemiah", "ot", 13, "Neh."),
  b("esth", "Esther", "ot", 10, "Esth."),
  b("job", "Job", "ot", 42),
  b("ps", "Psalms", "ot", 150, "Ps.", "Psalm", "Psa."),
  b("prov", "Proverbs", "ot", 31, "Prov."),
  b("eccl", "Ecclesiastes", "ot", 12, "Eccl."),
  b("song", "Solomon's Song", "ot", 8, "Song", "Song of Solomon", "Song of Songs"),
  b("isa", "Isaiah", "ot", 66, "Isa."),
  b("jer", "Jeremiah", "ot", 52, "Jer."),
  b("lam", "Lamentations", "ot", 5, "Lam."),
  b("ezek", "Ezekiel", "ot", 48, "Ezek."),
  b("dan", "Daniel", "ot", 12, "Dan."),
  b("hosea", "Hosea", "ot", 14, "Hos."),
  b("joel", "Joel", "ot", 3),
  b("amos", "Amos", "ot", 9),
  b("obad", "Obadiah", "ot", 1, "Obad."),
  b("jonah", "Jonah", "ot", 4),
  b("micah", "Micah", "ot", 7, "Mic."),
  b("nahum", "Nahum", "ot", 3, "Nah."),
  b("hab", "Habakkuk", "ot", 3, "Hab."),
  b("zeph", "Zephaniah", "ot", 3, "Zeph."),
  b("hag", "Haggai", "ot", 2, "Hag."),
  b("zech", "Zechariah", "ot", 14, "Zech."),
  b("mal", "Malachi", "ot", 4, "Mal."),
  // New Testament
  b("matt", "Matthew", "nt", 28, "Matt."),
  b("mark", "Mark", "nt", 16),
  b("luke", "Luke", "nt", 24),
  b("john", "John", "nt", 21),
  b("acts", "Acts", "nt", 28),
  b("rom", "Romans", "nt", 16, "Rom."),
  b("1-cor", "1 Corinthians", "nt", 16, "1 Cor."),
  b("2-cor", "2 Corinthians", "nt", 13, "2 Cor."),
  b("gal", "Galatians", "nt", 6, "Gal."),
  b("eph", "Ephesians", "nt", 6, "Eph."),
  b("philip", "Philippians", "nt", 4, "Philip.", "Phil."),
  b("col", "Colossians", "nt", 4, "Col."),
  b("1-thes", "1 Thessalonians", "nt", 5, "1 Thes.", "1 Thess."),
  b("2-thes", "2 Thessalonians", "nt", 3, "2 Thes.", "2 Thess."),
  b("1-tim", "1 Timothy", "nt", 6, "1 Tim."),
  b("2-tim", "2 Timothy", "nt", 4, "2 Tim."),
  b("titus", "Titus", "nt", 3),
  b("philem", "Philemon", "nt", 1, "Philem."),
  b("heb", "Hebrews", "nt", 13, "Heb."),
  b("james", "James", "nt", 5, "Jas."),
  b("1-pet", "1 Peter", "nt", 5, "1 Pet."),
  b("2-pet", "2 Peter", "nt", 3, "2 Pet."),
  b("1-jn", "1 John", "nt", 5, "1 Jn."),
  b("2-jn", "2 John", "nt", 1, "2 Jn."),
  b("3-jn", "3 John", "nt", 1, "3 Jn."),
  b("jude", "Jude", "nt", 1),
  b("rev", "Revelation", "nt", 22, "Rev.", "Revelations"),
  // Book of Mormon
  b("1-ne", "1 Nephi", "bofm", 22, "1 Ne."),
  b("2-ne", "2 Nephi", "bofm", 33, "2 Ne."),
  b("jacob", "Jacob", "bofm", 7),
  b("enos", "Enos", "bofm", 1),
  b("jarom", "Jarom", "bofm", 1),
  b("omni", "Omni", "bofm", 1),
  b("w-of-m", "Words of Mormon", "bofm", 1, "W of M", "WofM"),
  b("mosiah", "Mosiah", "bofm", 29),
  b("alma", "Alma", "bofm", 63),
  b("hel", "Helaman", "bofm", 16, "Hel."),
  b("3-ne", "3 Nephi", "bofm", 30, "3 Ne."),
  b("4-ne", "4 Nephi", "bofm", 1, "4 Ne."),
  b("morm", "Mormon", "bofm", 9, "Morm."),
  b("ether", "Ether", "bofm", 15),
  b("moro", "Moroni", "bofm", 10, "Moro."),
  // Doctrine and Covenants (one book; "chapters" are sections)
  b("dc", "Doctrine and Covenants", "dc-testament", 138, "D&C", "D & C", "DC", "D and C"),
  // Pearl of Great Price
  b("moses", "Moses", "pgp", 8),
  b("abr", "Abraham", "pgp", 5, "Abr."),
  b("js-m", "Joseph Smith—Matthew", "pgp", 1, "JS—M", "JS-M", "Joseph Smith-Matthew"),
  b("js-h", "Joseph Smith—History", "pgp", 1, "JS—H", "JS-H", "Joseph Smith-History"),
  b("a-of-f", "Articles of Faith", "pgp", 1, "A of F", "AofF"),
];

/**
 * The Church's own abbreviation for display ("1 Ne. 3:7", "D&C 88:118") —
 * the first listed abbreviation, else the name.
 */
export function ldsShortName(slug: string): string {
  const book = LDS_BOOKS.find((entry) => entry.slug === slug);
  return book ? book.abbreviations[0] ?? book.name : slug;
}

export function ldsBook(slug: string): LdsBookDef | null {
  return LDS_BOOKS.find((entry) => entry.slug === slug) ?? null;
}

export function ldsVolume(slug: string) {
  return LDS_VOLUMES.find((volume) => volume.slug === slug) ?? null;
}

/** churchofjesuschrist.org study URL for a reference (for "open in Gospel Library"). */
export function gospelLibraryUrl(bookSlug: string, chapter: number, verse?: number | null): string {
  const book = ldsBook(bookSlug);
  const volumePath = book?.volume === "dc-testament" ? "dc-testament" : book?.volume ?? "bofm";
  const base = `https://www.churchofjesuschrist.org/study/scriptures/${volumePath}/${bookSlug}/${chapter}?lang=eng`;
  return verse ? `${base}&id=p${verse}#p${verse}` : base;
}
