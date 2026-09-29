/**
 * Book sources for the reader's library (server-only).
 *
 * Every source maps onto `CatalogPage`, so the library UI has one shape to
 * render. Only DRM-free, legally free (or user-owned) files are ever
 * acquisitions; everything else is surfaced as an external link (borrow /
 * preview / find at your library). See EREADER-PLAN.md §4.
 */

import "server-only";
import { decrypt, encrypt } from "@/lib/infrastructure/crypto/encryption";
import { readerDb } from "../db";
import type {
  BookLicense,
  BookSourceInfo,
  CatalogEntry,
  CatalogNavLink,
  CatalogPage,
} from "../types";
import { ReaderFetchError, readerFetch, readerFetchJson } from "./http";
import {
  expandGutenbergResults,
  fillSearchTemplate,
  isReadableType,
  parseOpdsFeed,
  parseOpenSearchTemplate,
} from "./opds";

const OPDS_ACCEPT =
  "application/opds+json, application/atom+xml;profile=opds-catalog, application/atom+xml;q=0.9, application/xml;q=0.8, */*;q=0.1";

// ── Presets ────────────────────────────────────────────────────────────────

interface OpdsPreset {
  requiresLogin?: BookSourceInfo["requiresLogin"];
  id: string;
  label: string;
  description: string;
  url: string;
  searchTemplate?: string;
  homepage: string;
  license?: BookLicense;
}

const OPDS_PRESETS: OpdsPreset[] = [
  {
    id: "opds:preset:gutenberg",
    label: "Project Gutenberg",
    description: "75,000+ public-domain books, searched through Gutenberg's own catalog.",
    url: "https://www.gutenberg.org/ebooks.opds/",
    searchTemplate: "https://www.gutenberg.org/ebooks/search.opds/?query={searchTerms}",
    homepage: "https://www.gutenberg.org",
    license: "public-domain",
  },
  {
    id: "opds:preset:standard-ebooks",
    label: "Standard Ebooks",
    description:
      "Carefully produced public-domain classics. Their catalog feed is for Patrons Circle members (the books themselves are free).",
    url: "https://standardebooks.org/feeds/opds",
    homepage: "https://standardebooks.org",
    license: "public-domain",
    requiresLogin: {
      usernameLabel: "Patrons Circle email",
      passwordLabel: "Password (usually blank)",
      hint: "Standard Ebooks gates its catalog feeds to Patrons Circle members, who sign in with their email address. Open-source projects can also ask them for access.",
      signupUrl: "https://standardebooks.org/donate#patrons-circle",
    },
  },
];

const BUILT_IN_SOURCES: BookSourceInfo[] = [
  {
    id: "gutendex",
    kind: "gutendex",
    label: "Gutendex (Gutenberg, slower)",
    description:
      "Gutenberg through the community Gutendex API — richer summaries, but its public server is often slow.",
    searchable: true,
    browsable: false,
    readable: true,
    homepage: "https://gutendex.com",
  },
  {
    id: "openlibrary",
    kind: "openlibrary",
    label: "Open Library",
    description:
      "Millions of books. Public-domain scans download here; lendable books open on Open Library.",
    searchable: true,
    browsable: false,
    readable: true,
    homepage: "https://openlibrary.org",
  },
  {
    id: "wikisource",
    kind: "wikisource",
    label: "Wikisource",
    description: "Proofread public-domain texts, exported as EPUB.",
    searchable: true,
    browsable: false,
    readable: true,
    homepage: "https://en.wikisource.org",
  },
  {
    id: "oapen",
    kind: "oapen",
    label: "OAPEN (open-access academic)",
    description: "Peer-reviewed open-access books under Creative Commons licenses.",
    searchable: true,
    browsable: false,
    readable: true,
    homepage: "https://library.oapen.org",
  },
  {
    id: "google-books",
    kind: "google-books",
    label: "Google Books",
    description:
      "Search and book details. Public-domain titles download when Google offers a file; others link to a preview.",
    searchable: true,
    browsable: false,
    readable: true,
    homepage: "https://books.google.com",
  },
  ...OPDS_PRESETS.map<BookSourceInfo>((preset) => ({
    id: preset.id,
    kind: "opds",
    label: preset.label,
    description: preset.description,
    searchable: Boolean(preset.searchTemplate),
    browsable: true,
    readable: true,
    homepage: preset.homepage,
    feedUrl: preset.url,
    requiresLogin: preset.requiresLogin,
  })),
];

export async function listBookSources(ownerId: string): Promise<BookSourceInfo[]> {
  let custom: BookSourceInfo[] = [];
  try {
    const catalogs = await readerDb.readerCatalog.findMany({
      where: { ownerId },
      orderBy: { createdAt: "asc" },
    });
    custom = catalogs.map((catalog) => ({
      id: `opds:${catalog.id}`,
      kind: "opds",
      label: catalog.name,
      description: new URL(catalog.url).host,
      searchable: true,
      browsable: true,
      readable: true,
      custom: true,
      homepage: catalog.url,
    }));
  } catch {
    // Reader tables not migrated yet — built-in sources still work.
  }
  // Once a login-gated preset has been added with credentials, the logged-in
  // copy replaces the anonymous preset tile.
  const customUrls = new Set(custom.map((source) => source.homepage));
  const builtIns = BUILT_IN_SOURCES.filter(
    (source) => !(source.requiresLogin && source.feedUrl && customUrls.has(source.feedUrl))
  );
  return [...builtIns, ...custom];
}

// ── OPDS ───────────────────────────────────────────────────────────────────

interface ResolvedOpds {
  sourceId: string;
  rootUrl: string;
  searchTemplate?: string;
  headers: Record<string, string>;
  license?: BookLicense;
}

async function resolveOpds(sourceId: string, ownerId: string): Promise<ResolvedOpds> {
  const preset = OPDS_PRESETS.find((candidate) => candidate.id === sourceId);
  if (preset) {
    return {
      sourceId,
      rootUrl: preset.url,
      searchTemplate: preset.searchTemplate,
      headers: {},
      license: preset.license,
    };
  }
  const catalogId = sourceId.slice("opds:".length);
  const catalog = await readerDb.readerCatalog.findFirst({
    where: { id: catalogId, ownerId },
  });
  if (!catalog) throw new ReaderFetchError("Catalog not found", 404);
  const headers: Record<string, string> = {};
  if (catalog.credentialEncrypted) {
    const { credential } = decrypt(catalog.credentialEncrypted) as { credential?: string };
    if (credential) {
      headers.Authorization = `Basic ${Buffer.from(credential).toString("base64")}`;
    }
  }
  return { sourceId, rootUrl: catalog.url, headers };
}

/** An href handed back by the client must stay on the catalog's host. */
function assertSameOrigin(href: string, rootUrl: string): void {
  if (new URL(href).origin !== new URL(rootUrl).origin) {
    throw new ReaderFetchError("Link leaves the catalog", 400);
  }
}

async function fetchOpdsPage(
  source: ResolvedOpds,
  url: string
): Promise<CatalogPage> {
  let result;
  try {
    result = await readerFetch(url, { accept: OPDS_ACCEPT, headers: source.headers });
  } catch (error) {
    if (error instanceof ReaderFetchError && error.upstreamStatus === 401) {
      throw new ReaderFetchError(
        Object.keys(source.headers).length
          ? "The catalog rejected the saved login — remove it and add it again with the right username and password."
          : "This catalog needs a login — add it under “Add your library” with your username and password.",
        401,
        401
      );
    }
    throw error;
  }
  const page = parseOpdsFeed(
    result.body.toString("utf8"),
    result.contentType,
    result.url,
    source.sourceId
  );
  if (source.license) {
    for (const entry of page.entries) entry.license ??= source.license;
  }
  return page;
}

/**
 * Some catalogs answer a search with navigation entries that each lead to a
 * one-book feed. Open the first few so search shows books, not folders.
 */
async function expandNavigationResults(
  source: ResolvedOpds,
  page: CatalogPage
): Promise<CatalogPage> {
  if (page.entries.length > 0 || page.navigation.length === 0) return page;
  const targets = page.navigation.slice(0, 12);
  const settled = await Promise.allSettled(
    targets.map((nav) => fetchOpdsPage(source, nav.href))
  );
  const entries: CatalogEntry[] = [];
  const unresolved: CatalogNavLink[] = [];
  settled.forEach((result, index) => {
    const found =
      result.status === "fulfilled"
        ? result.value.entries.find((entry) => entry.acquisitions.length > 0)
        : undefined;
    if (found) entries.push({ ...found, coverUrl: found.coverUrl ?? targets[index].coverUrl });
    else unresolved.push(targets[index]);
  });
  return {
    ...page,
    entries,
    navigation: [...unresolved, ...page.navigation.slice(12)],
  };
}

async function opdsSearchTemplate(source: ResolvedOpds): Promise<string | undefined> {
  if (source.searchTemplate) return source.searchTemplate;
  const root = await fetchOpdsPage(source, source.rootUrl);
  const template = root.searchTemplate;
  if (template?.startsWith("opensearch:")) {
    const descriptionUrl = template.slice("opensearch:".length);
    const description = await readerFetch(descriptionUrl, { headers: source.headers });
    return parseOpenSearchTemplate(description.body.toString("utf8"), description.url);
  }
  return template;
}

// ── Gutendex ───────────────────────────────────────────────────────────────

interface GutendexBook {
  id: number;
  title: string;
  authors: Array<{ name: string }>;
  summaries?: string[];
  languages: string[];
  copyright: boolean | null;
  formats: Record<string, string>;
}

function gutendexEntry(book: GutendexBook): CatalogEntry {
  const acquisitions = Object.entries(book.formats)
    .filter(([type]) => isReadableType(type))
    .map(([type, href]) => ({ href, type: type.split(";")[0], rel: "open-access" }))
    .sort((a, b) => (a.type === "application/epub+zip" ? -1 : b.type === "application/epub+zip" ? 1 : 0));
  return {
    id: String(book.id),
    title: book.title,
    // Gutenberg stores "Last, First".
    authors: book.authors.map((author) =>
      author.name.includes(", ")
        ? author.name.split(", ").reverse().join(" ")
        : author.name
    ),
    summary: book.summaries?.[0],
    language: book.languages[0],
    coverUrl: book.formats["image/jpeg"],
    license: book.copyright === false ? "public-domain" : "unknown",
    acquisitions,
    externalUrl: `https://www.gutenberg.org/ebooks/${book.id}`,
    externalLabel: "Project Gutenberg",
  };
}

async function searchGutendex(query: string, page?: string): Promise<CatalogPage> {
  const url = page ?? `https://gutendex.com/books?search=${encodeURIComponent(query)}`;
  if (!url.startsWith("https://gutendex.com/")) throw new ReaderFetchError("Bad page", 400);
  const data = await readerFetchJson<{
    count: number;
    next: string | null;
    results: GutendexBook[];
  }>(url, { timeoutMs: 45_000 });
  return {
    sourceId: "gutendex",
    entries: data.results.map(gutendexEntry),
    navigation: [],
    nextHref: data.next ?? undefined,
    total: data.count,
  };
}

// ── Open Library ───────────────────────────────────────────────────────────

interface OpenLibraryDoc {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  isbn?: string[];
  cover_i?: number;
  ia?: string[];
  ebook_access?: "public" | "borrowable" | "printdisabled" | "no_ebook";
  language?: string[];
}

function openLibraryEntry(doc: OpenLibraryDoc): CatalogEntry {
  const workUrl = `https://openlibrary.org${doc.key}`;
  const ia = doc.ia?.[0];
  const isPublic = doc.ebook_access === "public" && ia;
  return {
    id: doc.key,
    title: doc.title,
    authors: doc.author_name ?? [],
    publishedYear: doc.first_publish_year,
    isbn: doc.isbn?.find((isbn) => isbn.length === 13) ?? doc.isbn?.[0],
    openLibraryId: doc.key.replace("/works/", ""),
    language: doc.language?.[0],
    coverUrl: doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
      : undefined,
    license: isPublic ? "public-domain" : undefined,
    acquisitions: isPublic
      ? [
          { href: `https://archive.org/download/${ia}/${ia}.epub`, type: "application/epub+zip", rel: "open-access" },
          { href: `https://archive.org/download/${ia}/${ia}.pdf`, type: "application/pdf", rel: "open-access" },
        ]
      : [],
    externalUrl: workUrl,
    externalLabel:
      doc.ebook_access === "borrowable" || doc.ebook_access === "printdisabled"
        ? "Borrow on Open Library"
        : "Open Library",
  };
}

async function searchOpenLibrary(query: string, page?: string): Promise<CatalogPage> {
  const pageNumber = page ? Number(page) || 1 : 1;
  const fields =
    "key,title,author_name,first_publish_year,isbn,cover_i,ia,ebook_access,language";
  const data = await readerFetchJson<{ numFound: number; docs: OpenLibraryDoc[] }>(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&fields=${fields}&limit=20&page=${pageNumber}`
  );
  return {
    sourceId: "openlibrary",
    entries: data.docs.map(openLibraryEntry),
    navigation: [],
    nextHref: data.numFound > pageNumber * 20 ? String(pageNumber + 1) : undefined,
    total: data.numFound,
  };
}

// ── Wikisource ─────────────────────────────────────────────────────────────

async function searchWikisource(query: string, page?: string): Promise<CatalogPage> {
  const offset = page ? Number(page) || 0 : 0;
  const data = await readerFetchJson<{
    query?: { searchinfo?: { totalhits: number }; search: Array<{ title: string; snippet: string }> };
    continue?: { sroffset: number };
  }>(
    `https://en.wikisource.org/w/api.php?action=query&list=search&srnamespace=0&srlimit=20&format=json&sroffset=${offset}&srsearch=${encodeURIComponent(query)}`
  );
  const results = data.query?.search ?? [];
  return {
    sourceId: "wikisource",
    entries: results.map((result) => ({
      id: result.title,
      title: result.title,
      authors: [],
      summary: result.snippet.replace(/<[^>]+>/g, ""),
      language: "en",
      acquisitions: [
        {
          href: `https://ws-export.wmcloud.org/?lang=en&format=epub-3&page=${encodeURIComponent(result.title)}`,
          type: "application/epub+zip",
          rel: "open-access",
        },
      ],
      externalUrl: `https://en.wikisource.org/wiki/${encodeURIComponent(result.title.replace(/ /g, "_"))}`,
      externalLabel: "Wikisource",
    })),
    navigation: [],
    nextHref: data.continue ? String(data.continue.sroffset) : undefined,
    total: data.query?.searchinfo?.totalhits,
  };
}

// ── OAPEN (DSpace REST) ────────────────────────────────────────────────────

interface OapenItem {
  type?: string;
  handle: string;
  name?: string;
  metadata?: Array<{ key: string; value: string }>;
  bitstreams?: Array<{
    name: string;
    mimeType: string;
    bundleName: string;
    retrieveLink: string;
  }>;
}

function oapenEntry(item: OapenItem): CatalogEntry {
  const meta = (key: string) =>
    item.metadata?.filter((field) => field.key === key).map((field) => field.value) ?? [];
  const files = (item.bitstreams ?? []).filter(
    (bitstream) => bitstream.bundleName === "ORIGINAL" && isReadableType(bitstream.mimeType)
  );
  const cover = (item.bitstreams ?? []).find(
    (bitstream) => bitstream.bundleName === "THUMBNAIL"
  );
  return {
    id: item.handle,
    title: meta("dc.title")[0] ?? item.name ?? "",
    authors: [...meta("dc.contributor.author"), ...meta("dc.contributor.editor")],
    summary: meta("dc.description.abstract")[0],
    language: meta("dc.language")[0],
    publishedYear: Number(meta("dc.date.issued")[0]?.slice(0, 4)) || undefined,
    isbn: meta("oapen.identifier.isbn")[0],
    coverUrl: cover ? `https://library.oapen.org${cover.retrieveLink}` : undefined,
    license: "creative-commons",
    acquisitions: files.map((file) => ({
      href: `https://library.oapen.org${file.retrieveLink}`,
      type: file.mimeType,
      rel: "open-access",
    })),
    externalUrl: `https://library.oapen.org/handle/${item.handle}`,
    externalLabel: "OAPEN",
  };
}

async function searchOapen(query: string, page?: string): Promise<CatalogPage> {
  const offset = page ? Number(page) || 0 : 0;
  const items = await readerFetchJson<OapenItem[]>(
    `https://library.oapen.org/rest/search?query=${encodeURIComponent(query)}&expand=metadata,bitstreams&limit=20&offset=${offset}`
  );
  return {
    sourceId: "oapen",
    // The search also returns collections/communities and title-less records;
    // only real items with a title are books.
    entries: items
      .filter((item) => !item.type || item.type === "item")
      .map(oapenEntry)
      .filter((entry) => entry.title.trim().length > 0),
    navigation: [],
    nextHref: items.length === 20 ? String(offset + 20) : undefined,
  };
}

// ── Google Books ───────────────────────────────────────────────────────────

interface GoogleVolume {
  id: string;
  volumeInfo: {
    title: string;
    authors?: string[];
    publishedDate?: string;
    description?: string;
    language?: string;
    industryIdentifiers?: Array<{ type: string; identifier: string }>;
    imageLinks?: { thumbnail?: string };
    infoLink?: string;
  };
  accessInfo?: {
    publicDomain?: boolean;
    epub?: { isAvailable?: boolean; downloadLink?: string };
    pdf?: { isAvailable?: boolean; downloadLink?: string };
  };
}

async function googleBooksKey(ownerId: string): Promise<string | undefined> {
  try {
    const connection = await readerDb.readerConnection.findFirst({
      where: { ownerId, provider: "google-books" },
    });
    if (!connection) return undefined;
    const { token } = decrypt(connection.tokenEncrypted) as { token?: string };
    return token;
  } catch {
    return undefined;
  }
}

async function searchGoogleBooks(
  query: string,
  ownerId: string,
  page?: string
): Promise<CatalogPage> {
  const start = page ? Number(page) || 0 : 0;
  const key = await googleBooksKey(ownerId);
  let data: { totalItems: number; items?: GoogleVolume[] };
  try {
    data = await readerFetchJson<{ totalItems: number; items?: GoogleVolume[] }>(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=20&startIndex=${start}${key ? `&key=${encodeURIComponent(key)}` : ""}`
    );
  } catch (error) {
    if (error instanceof ReaderFetchError && error.upstreamStatus === 429) {
      throw new ReaderFetchError(
        key
          ? "Google Books daily quota reached for your API key — try again later."
          : "Google Books is rate-limiting searches without an API key. Add a free key under Library → Connections → Google Books.",
        429,
        429
      );
    }
    throw error;
  }
  const entries = (data.items ?? []).map<CatalogEntry>((volume) => {
    const info = volume.volumeInfo;
    const access = volume.accessInfo ?? {};
    const acquisitions = access.publicDomain
      ? [
          access.epub?.downloadLink && { href: access.epub.downloadLink, type: "application/epub+zip", rel: "open-access" },
          access.pdf?.downloadLink && { href: access.pdf.downloadLink, type: "application/pdf", rel: "open-access" },
        ].filter((item): item is { href: string; type: string; rel: string } => Boolean(item))
      : [];
    return {
      id: volume.id,
      title: info.title,
      authors: info.authors ?? [],
      summary: info.description,
      language: info.language,
      publishedYear: Number(info.publishedDate?.slice(0, 4)) || undefined,
      isbn: info.industryIdentifiers?.find((id) => id.type === "ISBN_13")?.identifier,
      coverUrl: info.imageLinks?.thumbnail?.replace(/^http:/, "https:"),
      license: access.publicDomain ? "public-domain" : undefined,
      acquisitions,
      externalUrl: info.infoLink,
      externalLabel: "Google Books",
    };
  });
  return {
    sourceId: "google-books",
    entries,
    navigation: [],
    nextHref: data.totalItems > start + 20 ? String(start + 20) : undefined,
    total: data.totalItems,
  };
}

// ── Dispatch ───────────────────────────────────────────────────────────────

export async function searchSource(
  sourceId: string,
  query: string,
  ownerId: string,
  page?: string
): Promise<CatalogPage> {
  switch (sourceId) {
    case "gutendex":
      return searchGutendex(query, page);
    case "openlibrary":
      return searchOpenLibrary(query, page);
    case "wikisource":
      return searchWikisource(query, page);
    case "oapen":
      return searchOapen(query, page);
    case "google-books":
      return searchGoogleBooks(query, ownerId, page);
  }
  if (sourceId.startsWith("opds:")) {
    const source = await resolveOpds(sourceId, ownerId);
    let result: CatalogPage;
    if (page) {
      assertSameOrigin(page, source.rootUrl);
      result = await fetchOpdsPage(source, page);
    } else {
      const template = await opdsSearchTemplate(source);
      if (!template) {
        throw new ReaderFetchError("This catalog does not support search — browse it instead", 400);
      }
      result = await fetchOpdsPage(source, fillSearchTemplate(template, query));
    }
    return expandNavigationResults(source, expandGutenbergResults(result));
  }
  throw new ReaderFetchError("Unknown source", 404);
}

export async function browseSource(
  sourceId: string,
  ownerId: string,
  href?: string
): Promise<CatalogPage> {
  if (!sourceId.startsWith("opds:")) {
    throw new ReaderFetchError("Only OPDS catalogs can be browsed", 400);
  }
  const source = await resolveOpds(sourceId, ownerId);
  if (href) assertSameOrigin(href, source.rootUrl);
  return expandGutenbergResults(await fetchOpdsPage(source, href ?? source.rootUrl));
}

/** Download hosts each built-in source may hand us files from. */
const SOURCE_DOWNLOAD_HOSTS: Record<string, string[]> = {
  gutendex: ["www.gutenberg.org", "gutenberg.org"],
  openlibrary: ["archive.org"],
  wikisource: ["ws-export.wmcloud.org"],
  oapen: ["library.oapen.org"],
  "google-books": ["books.google.com", "play.google.com", "books.googleusercontent.com"],
};

/**
 * Validate an acquisition href the client chose and return the headers needed
 * to download it (catalog credentials for private OPDS feeds).
 */
export async function resolveAcquisition(
  sourceId: string,
  ownerId: string,
  href: string
): Promise<{ headers: Record<string, string>; license?: BookLicense }> {
  const host = new URL(href).hostname;
  const allowed = SOURCE_DOWNLOAD_HOSTS[sourceId];
  if (allowed) {
    if (!allowed.some((candidate) => host === candidate || host.endsWith(`.${candidate}`))) {
      throw new ReaderFetchError("Download host not allowed for this source", 400);
    }
    return { headers: {} };
  }
  if (sourceId.startsWith("opds:")) {
    const source = await resolveOpds(sourceId, ownerId);
    // Catalog files are often on a CDN; only send credentials to the catalog's
    // own origin.
    const sameOrigin = new URL(href).origin === new URL(source.rootUrl).origin;
    return { headers: sameOrigin ? source.headers : {}, license: source.license };
  }
  throw new ReaderFetchError("Unknown source", 404);
}

// ── Custom catalogs ────────────────────────────────────────────────────────

/**
 * Add a user's OPDS catalog (Calibre content server, Kavita, Komga, COPS,
 * calibre-web, any public OPDS feed). The feed is fetched once to prove it
 * parses before it is saved. Home-network servers must be reachable from the
 * internet (e.g. a Tailscale Funnel or Cloudflare Tunnel URL) — private
 * addresses are refused by the SSRF guard.
 */
export async function addCatalog(
  ownerId: string,
  input: { name?: string; url: string; username?: string; password?: string }
): Promise<BookSourceInfo> {
  const credential =
    input.username || input.password ? `${input.username ?? ""}:${input.password ?? ""}` : null;
  const headers: Record<string, string> = credential
    ? { Authorization: `Basic ${Buffer.from(credential).toString("base64")}` }
    : {};
  const result = await readerFetch(input.url, { accept: OPDS_ACCEPT, headers });
  const page = parseOpdsFeed(result.body.toString("utf8"), result.contentType, result.url, "opds:new");
  const name = (input.name?.trim() || page.title || new URL(input.url).host).slice(0, 120);
  const row = await readerDb.readerCatalog.create({
    data: {
      ownerId,
      name,
      url: input.url,
      credentialEncrypted: credential ? encrypt({ credential }) : null,
    },
  });
  return {
    id: `opds:${row.id}`,
    kind: "opds",
    label: row.name,
    description: new URL(row.url).host,
    searchable: true,
    browsable: true,
    readable: true,
    custom: true,
    homepage: row.url,
  };
}

export async function deleteCatalog(ownerId: string, sourceId: string): Promise<void> {
  if (!sourceId.startsWith("opds:") || sourceId.startsWith("opds:preset:")) {
    throw new ReaderFetchError("Only custom catalogs can be removed", 400);
  }
  await readerDb.readerCatalog.deleteMany({
    where: { id: sourceId.slice("opds:".length), ownerId },
  });
}
