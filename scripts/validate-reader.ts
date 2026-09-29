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
  fillSearchTemplate,
  parseOpdsFeed,
  parseOpenSearchTemplate,
} from "../lib/domain/reader/server/opds";
import { inspectEpub } from "../lib/domain/reader/server/epub";
import {
  kindleClippingId,
  normalizeBookTitle,
  parseKindleClippings,
} from "../lib/domain/reader/kindle-clippings";

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

  console.log(`reader:check passed (${checks} checks)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
