/**
 * Reader validation gate (EREADER-PLAN.md). Runs with `pnpm reader:check`
 * (tsx, no database, no network).
 *
 * Pins the pure parsing the library depends on against fixture feeds —
 * the catalog hosts are live services we can't reach from CI:
 *   - OPDS 1 (Atom) + OPDS 2 (JSON) → CatalogPage (acquisitions, navigation,
 *     covers, search templates, pagination)
 *   - OpenSearch description → template
 *   - EPUB DRM detection (font obfuscation is NOT DRM) + OPF metadata
 *   - Kindle "My Clippings.txt" parsing + idempotent clipping ids
 */

import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  expandGutenbergResults,
  fillSearchTemplate,
  parseOpdsFeed,
  parseOpenSearchTemplate,
} from "../lib/domain/reader/server/opds";
import { inspectEpub } from "../lib/domain/reader/server/epub";
import { cleanDescription, parseGutenbergSummary } from "../lib/domain/reader/details-parse";
import {
  kindleClippingId,
  normalizeBookTitle,
  parseKindleClippings,
} from "../lib/domain/reader/kindle-clippings";
import { buildBookIndex, formatReference, parseReference, parseReferenceList, resolveBook } from "../lib/domain/scripture/reference";
import { LDS_BOOKS, ldsShortName } from "../lib/domain/scripture/lds";
import { normalizeLdsVolume } from "../lib/domain/scripture/adapters/lds";
import { formatVerseHref, parseVerseHref } from "../lib/domain/scripture/types";
import { marksForVerse, segmentVerse } from "../lib/domain/scripture/verse-marks";
import type { ReaderAnnotationDto } from "../lib/domain/reader/types";

let checks = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  checks += 1;
  console.log(`  ✓ ${name}`);
}

const ATOM_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/terms/"
      xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
  <id>urn:test</id>
  <title>Test Catalog</title>
  <opensearch:totalResults>42</opensearch:totalResults>
  <link rel="next" href="/opds/page2" type="application/atom+xml;profile=opds-catalog"/>
  <link rel="search" href="/opds/search?q={searchTerms}" type="application/atom+xml"/>
  <entry>
    <title>Popular</title>
    <id>urn:nav:popular</id>
    <content type="text">Most downloaded</content>
    <link rel="subsection" href="/opds/popular" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  </entry>
  <entry>
    <title>Pride and Prejudice</title>
    <id>urn:gutenberg:1342</id>
    <author><name>Jane Austen</name></author>
    <dc:language>en</dc:language>
    <dc:issued>1813</dc:issued>
    <rights>Public domain in the USA.</rights>
    <dc:identifier>urn:isbn:9780141439518</dc:identifier>
    <summary type="text">A novel of manners.</summary>
    <link rel="http://opds-spec.org/image" href="/covers/1342.jpg" type="image/jpeg"/>
    <link rel="http://opds-spec.org/acquisition" href="/ebooks/1342.kindle" type="application/x-mobipocket-ebook"/>
    <link rel="http://opds-spec.org/acquisition/open-access" href="/ebooks/1342.epub" type="application/epub+zip"/>
    <link rel="http://opds-spec.org/acquisition/buy" href="https://store.example/1342" type="text/html"/>
    <link rel="alternate" href="/ebooks/1342" type="text/html"/>
  </entry>
</feed>`;

const OPDS2_FEED = JSON.stringify({
  metadata: { title: "OPDS 2 Catalog", numberOfItems: 2 },
  links: [
    { rel: "next", href: "page2.json", type: "application/opds+json" },
    { rel: "search", href: "/search{?query}", type: "application/opds+json", templated: true },
  ],
  navigation: [{ href: "/new.json", title: "New releases", type: "application/opds+json" }],
  publications: [
    {
      metadata: {
        identifier: "urn:isbn:9780000000002",
        title: { en: "Moby-Dick", fr: "Moby Dick" },
        author: [{ name: "Herman Melville" }],
        language: "en",
        published: "1851-10-18",
      },
      links: [
        { rel: "http://opds-spec.org/acquisition/open-access", href: "/moby.epub", type: "application/epub+zip" },
      ],
      images: [{ href: "/moby.jpg", type: "image/jpeg" }],
    },
  ],
});

// Shape of https://www.gutenberg.org/ebooks/search.opds/?query=… — one
// navigation entry per book, no acquisition links (the bug the owner hit).
const GUTENBERG_SEARCH = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>https://www.gutenberg.org/ebooks/search.opds/?query=pride</id>
  <title>Books: pride</title>
  <link rel="next" type="application/atom+xml;profile=opds-catalog" href="/ebooks/search.opds/?query=pride&amp;start_index=26"/>
  <entry>
    <title>Pride and Prejudice</title>
    <content type="text">Jane Austen</content>
    <id>https://www.gutenberg.org/ebooks/1342.opds</id>
    <link type="application/atom+xml;profile=opds-catalog" rel="subsection" href="/ebooks/1342.opds"/>
    <link type="image/jpeg" rel="http://opds-spec.org/image/thumbnail" href="/cache/epub/1342/pg1342.cover.small.jpg"/>
  </entry>
  <entry>
    <title>Sort Alphabetically by Title</title>
    <id>https://www.gutenberg.org/ebooks/search.opds/?query=pride&amp;sort_order=title</id>
    <link type="application/atom+xml;profile=opds-catalog" rel="http://opds-spec.org/sort/new" href="/ebooks/search.opds/?query=pride&amp;sort_order=title"/>
  </entry>
</feed>`;

const OPENSEARCH = `<?xml version="1.0"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <Url type="text/html" template="https://example.org/search?q={searchTerms}"/>
  <Url type="application/atom+xml;profile=opds-catalog" template="/opds/search/{searchTerms}"/>
</OpenSearchDescription>`;

const CLIPPINGS = `﻿The Hobbit (J. R. R. Tolkien)
- Your Highlight on page 12 | Location 180-182 | Added on Monday, January 1, 2024 10:00:00 AM

In a hole in the ground there lived a hobbit.
==========
The Hobbit (J. R. R. Tolkien)
- Your Note on page 12 | Location 182 | Added on Monday, January 1, 2024 10:01:00 AM

Great opening line
==========
Meditations (Penguin Classics) (Marcus Aurelius)
- Your Highlight on Location 500-501 | Added on Tuesday, January 2, 2024 9:00:00 AM

You have power over your mind - not outside events.
==========
Meditations (Penguin Classics) (Marcus Aurelius)
- Your Bookmark on Location 900 | Added on Tuesday, January 2, 2024 9:05:00 AM


==========
`;

async function makeEpub(options: { encryption?: string; lcpl?: boolean }): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`
  );
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:identifier id="id">urn:isbn:978-0-14-143951-8</dc:identifier>
        <dc:title>Pride and Prejudice</dc:title>
        <dc:creator>Jane Austen</dc:creator>
        <dc:language>en</dc:language>
        <dc:date>1813-01-28</dc:date>
      </metadata>
      <manifest><item id="c1" href="chapter%201.xhtml" media-type="application/xhtml+xml"/></manifest>
      <spine><itemref idref="c1"/></spine>
    </package>`
  );
  zip.file(
    "OEBPS/chapter 1.xhtml",
    `<html><body><h1>Chapter 1</h1><p>It is a truth universally acknowledged&nbsp;&amp; so on.</p><script>alert(1)</script></body></html>`
  );
  if (options.encryption) zip.file("META-INF/encryption.xml", options.encryption);
  if (options.lcpl) zip.file("META-INF/license.lcpl", "{}");
  return zip.generateAsync({ type: "nodebuffer" });
}

const encryptionXml = (algorithm: string) =>
  `<?xml version="1.0"?><encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
    <enc:EncryptedData><enc:EncryptionMethod Algorithm="${algorithm}"/><enc:CipherData><enc:CipherReference URI="OEBPS/chapter%201.xhtml"/></enc:CipherData></enc:EncryptedData>
  </encryption>`;

async function main() {
  console.log("reader:check");

  await check("OPDS 1: entries, acquisitions (free first, epub preferred), covers, license", () => {
    const page = parseOpdsFeed(ATOM_FEED, "application/atom+xml", "https://example.org/opds", "opds:x");
    assert.equal(page.title, "Test Catalog");
    assert.equal(page.entries.length, 1);
    const [book] = page.entries;
    assert.equal(book.title, "Pride and Prejudice");
    assert.deepEqual(book.authors, ["Jane Austen"]);
    assert.equal(book.language, "en");
    assert.equal(book.publishedYear, 1813);
    assert.equal(book.isbn, "9780141439518");
    assert.equal(book.license, "public-domain");
    assert.equal(book.coverUrl, "https://example.org/covers/1342.jpg");
    assert.equal(book.acquisitions[0].href, "https://example.org/ebooks/1342.epub");
    assert.equal(book.acquisitions[0].rel, "open-access");
    assert.equal(book.acquisitions.at(-1)?.rel, "buy");
    assert.equal(book.externalUrl, "https://example.org/ebooks/1342");
  });

  await check("OPDS 1: navigation, next page, search template, total", () => {
    const page = parseOpdsFeed(ATOM_FEED, "application/atom+xml", "https://example.org/opds", "opds:x");
    assert.deepEqual(page.navigation.map((nav) => nav.title), ["Popular"]);
    assert.equal(page.navigation[0].href, "https://example.org/opds/popular");
    assert.equal(page.nextHref, "https://example.org/opds/page2");
    assert.equal(page.searchTemplate, "https://example.org/opds/search?q={searchTerms}");
    assert.equal(page.total, 42);
  });

  await check("OPDS 2: publications, localized title, contributors, templated search", () => {
    const page = parseOpdsFeed(OPDS2_FEED, "application/opds+json", "https://ex.org/cat/root.json", "opds:y");
    assert.equal(page.entries[0].title, "Moby-Dick");
    assert.deepEqual(page.entries[0].authors, ["Herman Melville"]);
    assert.equal(page.entries[0].publishedYear, 1851);
    assert.equal(page.entries[0].isbn, "9780000000002");
    assert.equal(page.entries[0].acquisitions[0].href, "https://ex.org/moby.epub");
    assert.equal(page.entries[0].coverUrl, "https://ex.org/moby.jpg");
    assert.equal(page.navigation[0].href, "https://ex.org/new.json");
    assert.equal(page.nextHref, "https://ex.org/cat/page2.json");
    assert.equal(page.searchTemplate, "https://ex.org/search{?query}");
  });

  await check("Gutenberg search: per-book navigation entries become readable books", () => {
    const parsed = parseOpdsFeed(GUTENBERG_SEARCH, "application/atom+xml", "https://www.gutenberg.org/ebooks/search.opds/?query=pride", "opds:preset:gutenberg");
    assert.equal(parsed.entries.length, 0, "raw feed has no acquisition entries");
    const page = expandGutenbergResults(parsed);
    assert.equal(page.entries.length, 1);
    const [book] = page.entries;
    assert.equal(book.title, "Pride and Prejudice");
    assert.deepEqual(book.authors, ["Jane Austen"]);
    assert.equal(book.license, "public-domain");
    assert.equal(book.acquisitions[0].href, "https://www.gutenberg.org/ebooks/1342.epub3.images");
    assert.equal(book.coverUrl, "https://www.gutenberg.org/cache/epub/1342/pg1342.cover.medium.jpg");
    assert.deepEqual(page.navigation.map((nav) => nav.title), ["Sort Alphabetically by Title"]);
    assert.ok(page.nextHref?.includes("start_index=26"));
  });

  await check("OpenSearch description → Atom template; template filling", () => {
    const template = parseOpenSearchTemplate(OPENSEARCH, "https://example.org/opds/osd.xml");
    assert.equal(template, "https://example.org/opds/search/{searchTerms}");
    assert.equal(
      fillSearchTemplate(template!, "war & peace"),
      "https://example.org/opds/search/war%20%26%20peace"
    );
    assert.equal(fillSearchTemplate("https://ex.org/search{?query}", "x y"), "https://ex.org/search?query=x%20y");
    assert.equal(fillSearchTemplate("https://ex.org/s{?query,page}", "x"), "https://ex.org/s?query=x");
    assert.equal(fillSearchTemplate("https://ex.org/s?q={searchTerms}&p={startPage?}", "x"), "https://ex.org/s?q=x&p=1");
  });

  await check("EPUB: metadata, ISBN normalized, body text without script/markup", async () => {
    const result = await inspectEpub(await makeEpub({}));
    assert.equal(result.drm, null);
    assert.equal(result.title, "Pride and Prejudice");
    assert.deepEqual(result.authors, ["Jane Austen"]);
    assert.equal(result.language, "en");
    assert.equal(result.publishedYear, 1813);
    assert.equal(result.isbn, "9780141439518");
    assert.match(result.searchText, /It is a truth universally acknowledged & so on\./);
    assert.doesNotMatch(result.searchText, /alert/);
  });

  await check("EPUB: IDPF font obfuscation is not DRM", async () => {
    const result = await inspectEpub(
      await makeEpub({ encryption: encryptionXml("http://www.idpf.org/2008/embedding") })
    );
    assert.equal(result.drm, null);
  });

  await check("EPUB: Adobe ADEPT and Readium LCP are refused", async () => {
    const adept = await inspectEpub(
      await makeEpub({ encryption: encryptionXml("http://www.w3.org/2001/04/xmlenc#aes128-cbc") + "<!-- adobe adept -->" })
    );
    assert.equal(adept.drm, "adobe-adept");
    const lcp = await inspectEpub(await makeEpub({ lcpl: true }));
    assert.equal(lcp.drm, "readium-lcp");
  });

  await check("Kindle clippings: books, kinds, locations, series-in-title author", () => {
    const books = parseKindleClippings(CLIPPINGS);
    assert.equal(books.length, 2);
    const hobbit = books[0];
    assert.equal(hobbit.title, "The Hobbit");
    assert.equal(hobbit.author, "J. R. R. Tolkien");
    assert.deepEqual(hobbit.clippings.map((clip) => clip.kind), ["highlight", "note"]);
    assert.equal(hobbit.clippings[0].location, "180-182");
    assert.equal(hobbit.clippings[0].page, "12");
    const meditations = books[1];
    assert.equal(meditations.title, "Meditations (Penguin Classics)");
    assert.equal(meditations.author, "Marcus Aurelius");
    assert.deepEqual(meditations.clippings.map((clip) => clip.kind), ["highlight", "bookmark"]);
  });

  await check("Kindle clipping ids are stable and distinct", () => {
    const [hobbit] = parseKindleClippings(CLIPPINGS);
    const again = parseKindleClippings(CLIPPINGS)[0];
    assert.equal(kindleClippingId(hobbit.clippings[0]), kindleClippingId(again.clippings[0]));
    assert.notEqual(kindleClippingId(hobbit.clippings[0]), kindleClippingId(hobbit.clippings[1]));
  });

  await check("Title matching ignores subtitles, articles, extensions, case", () => {
    assert.equal(normalizeBookTitle("The Hobbit: or There and Back Again"), "hobbit");
    assert.equal(normalizeBookTitle("hobbit.epub"), "hobbit");
    assert.equal(
      normalizeBookTitle("Meditations (Penguin Classics)"),
      normalizeBookTitle("Meditations")
    );
  });

  await check("Gutenberg book page: Summary row + subjects", () => {
    const html = `<table class="bibrec">
      <tr><th>Author</th><td><a href="/ebooks/author/68">Austen, Jane, 1775-1817</a></td></tr>
      <tr><th>Summary</th><td>"Pride and Prejudice" by Jane Austen is a romantic novel written in the early 19th century. The story follows Elizabeth Bennet as she navigates manners, upbringing and marriage. (This is an automatically generated summary.)</td></tr>
      <tr><th>Subject</th><td><a href="/ebooks/subject/1">Courtship -- Fiction</a></td></tr>
      <tr><th>Subject</th><td><a href="/ebooks/subject/2">Sisters -- Fiction</a></td></tr>
    </table>`;
    const parsed = parseGutenbergSummary(html);
    assert.match(parsed.summary ?? "", /^"Pride and Prejudice" by Jane Austen is a romantic novel/);
    assert.doesNotMatch(parsed.summary ?? "", /automatically generated/);
    assert.deepEqual(parsed.subjects, ["Courtship", "Sisters"]);
    assert.deepEqual(parseGutenbergSummary("<table></table>"), { summary: null, subjects: [] });
  });

  await check("cleanDescription: HTML, Open Library link footers, too-short text", () => {
    assert.equal(
      cleanDescription("<p>A long enough description of the book that is worth showing.</p>----------\n[1]: https://x"),
      "A long enough description of the book that is worth showing."
    );
    assert.equal(cleanDescription({ value: "Another long enough description, from an OL object value." }), "Another long enough description, from an OL object value.");
    assert.equal(cleanDescription("too short"), null);
  });

  const lds = buildBookIndex(LDS_BOOKS);
  const ref = (text: string) => parseReference(text, lds);

  await check("Scripture refs: Church abbreviations, full names, ranges", () => {
    assert.deepEqual(ref("1 Ne. 3:7"), { bookSlug: "1-ne", chapter: 3, verseStart: 7, verseEnd: 7 });
    assert.deepEqual(ref("Alma 32:21–23"), { bookSlug: "alma", chapter: 32, verseStart: 21, verseEnd: 23 });
    assert.deepEqual(ref("D&C 88:118"), { bookSlug: "dc", chapter: 88, verseStart: 118, verseEnd: 118 });
    assert.deepEqual(ref("First Nephi 3"), { bookSlug: "1-ne", chapter: 3, verseStart: null, verseEnd: null });
    assert.deepEqual(ref("John 3:16"), { bookSlug: "john", chapter: 3, verseStart: 16, verseEnd: 16 });
    assert.deepEqual(ref("Moroni"), { bookSlug: "moro", chapter: null, verseStart: null, verseEnd: null });
    assert.equal(resolveBook("Hela", lds)?.slug, "hel");
  });

  await check("Scripture refs: one-chapter books, out-of-range, reversed, unknown", () => {
    assert.deepEqual(ref("Enos 3"), { bookSlug: "enos", chapter: 1, verseStart: 3, verseEnd: 3 });
    assert.deepEqual(ref("Enos 1:3"), { bookSlug: "enos", chapter: 1, verseStart: 3, verseEnd: 3 });
    assert.equal(ref("Alma 64"), null);
    assert.equal(ref("Alma 32:23-21"), null);
    assert.equal(ref("Hezekiah 3:1"), null);
  });

  await check("Scripture ref lists: commas continue verses, semicolons start chapters", () => {
    const list = parseReferenceList("John 3:16, 17; Matt. 5:14–16; 6", lds);
    assert.deepEqual(list, [
      { bookSlug: "john", chapter: 3, verseStart: 16, verseEnd: 16 },
      { bookSlug: "john", chapter: 3, verseStart: 17, verseEnd: 17 },
      { bookSlug: "matt", chapter: 5, verseStart: 14, verseEnd: 16 },
      { bookSlug: "matt", chapter: 6, verseStart: null, verseEnd: null },
    ]);
    assert.equal(formatReference(list[2], ldsShortName), "Matt. 5:14–16");
    assert.equal(formatReference({ bookSlug: "dc", chapter: 88, verseStart: null, verseEnd: null }, ldsShortName), "D&C 88");
  });

  await check("Scripture verse hrefs round-trip", () => {
    for (const r of [
      { bookSlug: "alma", chapter: 32, verseStart: 21, verseEnd: 23 },
      { bookSlug: "1-ne", chapter: 3, verseStart: 7, verseEnd: 7 },
      { bookSlug: "js-h", chapter: 1, verseStart: null, verseEnd: null },
    ]) {
      assert.deepEqual(parseVerseHref(formatVerseHref(r)), r);
    }
    assert.equal(parseVerseHref("../etc"), null);
  });

  await check("Scripture book table: every abbreviation resolves to its own book", () => {
    for (const book of LDS_BOOKS) {
      for (const spelling of [book.name, ...book.abbreviations]) {
        assert.equal(resolveBook(spelling, lds)?.slug, book.slug, `${spelling} → ${book.slug}`);
      }
    }
  });

  await check("LDS adapter: books volumes and the D&C sections shape", () => {
    const bofm = normalizeLdsVolume("bofm", {
      version: 2,
      books: [
        {
          book: "Enos",
          lds_slug: "enos",
          full_title: "The Book of Enos",
          heading: " Enos prays mightily. ",
          chapters: [{ chapter: 1, verses: [{ verse: 1, text: " Behold, it came to pass… " }, { verse: 2, text: "And I will tell you" }] }],
        },
      ],
    });
    assert.equal(bofm.version, "2");
    assert.deepEqual(bofm.books[0], {
      slug: "enos",
      name: "Enos",
      fullTitle: "The Book of Enos",
      heading: "Enos prays mightily.",
      volume: "bofm",
      volumeTitle: "Book of Mormon",
      chapterCount: 1,
      abbreviations: LDS_BOOKS.find((book) => book.slug === "enos")!.abbreviations,
    });
    assert.deepEqual(bofm.verses[0], { bookSlug: "enos", chapter: 1, verse: 1, text: "Behold, it came to pass…" });

    const dc = normalizeLdsVolume("dc-testament", {
      title: "The Doctrine and Covenants",
      sections: [{ section: 88, verses: [{ verse: 118, text: "seek learning, even by study and also by faith." }] }],
    });
    assert.equal(dc.books[0].slug, "dc");
    assert.deepEqual(dc.verses[0], { bookSlug: "dc", chapter: 88, verse: 118, text: "seek learning, even by study and also by faith." });
    assert.throws(() => normalizeLdsVolume("bofm", { books: [{ book: "X", lds_slug: "nope", chapters: [] }] }));
  });

  await check("Scripture marks: multi-verse ranges clip per verse; segments split at every edge", () => {
    const annotation = (id: string, href: string, start: number, end: number, color = "yellow") =>
      ({
        id,
        kind: "highlight",
        color,
        body: null,
        locator: { href, locations: { start, end } },
      }) as unknown as ReaderAnnotationDto;
    const list = [
      annotation("a", "alma/32/21-23", 10, 5),
      annotation("b", "alma/32/22", 3, 8, "underline:blue"),
      annotation("c", "alma/33/22", 0, 4),
      { ...annotation("d", "alma/32/22", 0, 0), kind: "bookmark" } as ReaderAnnotationDto,
    ];
    assert.deepEqual(marksForVerse(list, "alma", 32, 21, 40), [{ annotationId: "a", color: "yellow", start: 10, end: 40 }]);
    assert.deepEqual(
      marksForVerse(list, "alma", 32, 22, 20).map((mark) => [mark.annotationId, mark.start, mark.end]),
      [["a", 0, 20], ["b", 3, 8]]
    );
    assert.deepEqual(marksForVerse(list, "alma", 32, 23, 30), [{ annotationId: "a", color: "yellow", start: 0, end: 5 }]);
    assert.deepEqual(marksForVerse(list, "alma", 32, 24, 30), []);

    const segments = segmentVerse("0123456789", [
      { annotationId: "a", color: null, start: 0, end: 10 },
      { annotationId: "b", color: null, start: 3, end: 8 },
    ]);
    assert.deepEqual(
      segments.map((segment) => [segment.text, segment.marks.map((mark) => mark.annotationId).join("")]),
      [["012", "a"], ["34567", "ab"], ["89", "a"]]
    );
    assert.equal(segments.map((segment) => segment.text).join(""), "0123456789");
    assert.deepEqual(segmentVerse("plain", []), [{ text: "plain", start: 0, marks: [] }]);
  });

  console.log(`reader:check passed (${checks} checks)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
