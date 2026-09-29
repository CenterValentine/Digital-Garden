/**
 * OPDS catalog parsing — OPDS 1.x (Atom XML) and OPDS 2.0 (JSON).
 *
 * Why not a library: the maintained OPDS clients are either whole reading
 * systems (Readium's r2-opds-js pulls in ta-json + its object model) or
 * unmaintained Atom-only parsers. Mapping the two feed shapes onto our small
 * `CatalogPage` is ~200 lines on top of fast-xml-parser, so we keep that
 * mapping here (library-first rule: the XML parsing itself is a library).
 *
 * Specs: https://specs.opds.io/opds-1.2 · https://drafts.opds.io/opds-2.0
 */

// Pure parsing (no secrets, no I/O) — kept importable from tsx so
// `pnpm reader:check` can exercise it without the server-only guard.
import { XMLParser } from "fast-xml-parser";
import type {
  BookLicense,
  CatalogAcquisition,
  CatalogEntry,
  CatalogNavLink,
  CatalogPage,
} from "../types";

const ACQUISITION_REL_PREFIX = "http://opds-spec.org/acquisition";
const IMAGE_RELS = new Set([
  "http://opds-spec.org/image",
  "http://opds-spec.org/cover",
  "http://opds-spec.org/image/thumbnail",
  "http://opds-spec.org/thumbnail",
]);

/** Formats the reader can open, best first. */
const READABLE_TYPES = [
  "application/epub+zip",
  "application/x-mobipocket-ebook",
  "application/vnd.amazon.ebook",
  "application/x-fictionbook+xml",
  "application/vnd.comicbook+zip",
  "application/pdf",
];

function rankType(type: string): number {
  const base = type.split(";")[0].trim().toLowerCase();
  const index = READABLE_TYPES.indexOf(base);
  return index === -1 ? READABLE_TYPES.length : index;
}

export function isReadableType(type: string): boolean {
  return rankType(type) < READABLE_TYPES.length;
}

function relKind(rel: string): string {
  if (rel === ACQUISITION_REL_PREFIX) return "acquisition";
  if (rel.startsWith(`${ACQUISITION_REL_PREFIX}/`)) {
    return rel.slice(ACQUISITION_REL_PREFIX.length + 1);
  }
  return rel;
}

function sortAcquisitions(list: CatalogAcquisition[]): CatalogAcquisition[] {
  // Free first (open-access / plain acquisition), then by format preference.
  const relRank = (rel: string) =>
    rel === "open-access" ? 0 : rel === "acquisition" ? 1 : 2;
  return [...list].sort(
    (a, b) => relRank(a.rel) - relRank(b.rel) || rankType(a.type) - rankType(b.type)
  );
}

function resolve(href: string, base: string): string {
  try {
    // WHATWG URL percent-encodes "{" / "}" in paths, which would break
    // OpenSearch / RFC 6570 templates — restore them.
    return new URL(href, base).toString().replace(/%7B/gi, "{").replace(/%7D/gi, "}");
  } catch {
    return href;
  }
}

function yearOf(value: unknown): number | undefined {
  const match = typeof value === "string" ? value.match(/\d{4}/) : null;
  return match ? Number(match[0]) : undefined;
}

// ── OPDS 1 (Atom) ───────────────────────────────────────────────────────────

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  isArray: (name) =>
    ["entry", "link", "author", "identifier", "category", "language"].includes(name),
});

type XmlNode = Record<string, unknown>;

function text(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in value) {
    return text((value as XmlNode)["#text"]);
  }
  return undefined;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function atomLinks(node: XmlNode): Array<{ rel: string; href: string; type: string; title?: string }> {
  return asArray(node.link as XmlNode[] | undefined).map((link) => ({
    rel: String(link["@_rel"] ?? "alternate"),
    href: String(link["@_href"] ?? ""),
    type: String(link["@_type"] ?? ""),
    title: text(link["@_title"]),
  }));
}

function isNavigationEntry(links: ReturnType<typeof atomLinks>): boolean {
  return links.some(
    (link) =>
      link.type.includes("application/atom+xml") &&
      !link.rel.startsWith(ACQUISITION_REL_PREFIX)
  );
}

function atomLicense(entry: XmlNode): BookLicense | undefined {
  const rights = text(entry.rights)?.toLowerCase() ?? "";
  if (rights.includes("public domain")) return "public-domain";
  if (rights.includes("creative commons") || rights.includes("cc-by") || rights.includes("cc by")) {
    return "creative-commons";
  }
  return undefined;
}

function parseAtom(body: string, base: string, sourceId: string): CatalogPage {
  const doc = xml.parse(body) as { feed?: XmlNode };
  const feed = doc.feed;
  if (!feed) throw new Error("Not an OPDS/Atom feed");

  const entries: CatalogEntry[] = [];
  const navigation: CatalogNavLink[] = [];

  for (const entry of asArray(feed.entry as XmlNode[] | undefined)) {
    const links = atomLinks(entry);
    const title = text(entry.title) ?? "Untitled";
    const acquisitions = links
      .filter((link) => link.rel.startsWith(ACQUISITION_REL_PREFIX) && link.href)
      .map((link) => ({
        href: resolve(link.href, base),
        type: link.type,
        rel: relKind(link.rel),
      }));

    if (acquisitions.length === 0 && isNavigationEntry(links)) {
      const target = links.find((link) => link.type.includes("application/atom+xml"));
      if (target?.href) {
        navigation.push({
          title,
          href: resolve(target.href, base),
          summary: text(entry.content) ?? text(entry.summary),
        });
      }
      continue;
    }

    const cover =
      links.find((link) => link.rel === "http://opds-spec.org/image") ??
      links.find((link) => IMAGE_RELS.has(link.rel));
    const identifiers = asArray(entry.identifier as unknown[]).map(text).filter(Boolean) as string[];
    const isbn = identifiers
      .map((id) => id.replace(/^urn:isbn:/i, ""))
      .find((id) => /^(97[89])?\d{9}[\dX]$/i.test(id.replace(/-/g, "")));
    const alternate = links.find(
      (link) => link.rel === "alternate" && link.type.includes("text/html")
    );

    entries.push({
      id: text(entry.id) ?? acquisitions[0]?.href ?? title,
      title,
      authors: asArray(entry.author as XmlNode[] | undefined)
        .map((author) => text(author.name))
        .filter((name): name is string => Boolean(name)),
      summary: text(entry.summary) ?? text(entry.content),
      language: text(asArray(entry.language as unknown[])[0]),
      coverUrl: cover ? resolve(cover.href, base) : undefined,
      publishedYear: yearOf(text(entry.issued) ?? text(entry.published)),
      isbn,
      license: atomLicense(entry),
      acquisitions: sortAcquisitions(acquisitions),
      externalUrl: alternate ? resolve(alternate.href, base) : undefined,
    });
  }

  const feedLinks = atomLinks(feed);
  const next = feedLinks.find((link) => link.rel === "next");
  const search = feedLinks.find(
    (link) => link.rel === "search" && link.href.includes("{searchTerms}")
  );
  const openSearch = feedLinks.find(
    (link) =>
      link.rel === "search" &&
      link.type.includes("opensearchdescription")
  );

  return {
    sourceId,
    title: text(feed.title),
    entries,
    navigation,
    nextHref: next ? resolve(next.href, base) : undefined,
    total: Number(text(feed.totalResults)) || undefined,
    searchTemplate: search
      ? resolve(search.href, base)
      : openSearch
        ? `opensearch:${resolve(openSearch.href, base)}`
        : undefined,
  };
}

/** Resolve an OpenSearch description document to its Atom URL template. */
export function parseOpenSearchTemplate(body: string, base: string): string | undefined {
  const doc = xml.parse(body) as { OpenSearchDescription?: XmlNode };
  const urls = asArray(
    doc.OpenSearchDescription?.Url as XmlNode | XmlNode[] | undefined
  );
  const atom =
    urls.find((url) => String(url["@_type"] ?? "").includes("atom")) ?? urls[0];
  const template = atom ? String(atom["@_template"] ?? "") : "";
  return template ? resolve(template, base) : undefined;
}

// ── OPDS 2 (JSON) ───────────────────────────────────────────────────────────

interface Opds2Link {
  rel?: string | string[];
  href?: string;
  type?: string;
  title?: string;
  templated?: boolean;
}

interface Opds2Contributor {
  name?: string | Record<string, string>;
}

interface Opds2Publication {
  metadata?: {
    identifier?: string;
    title?: string | Record<string, string>;
    author?: string | Opds2Contributor | Array<string | Opds2Contributor>;
    language?: string | string[];
    published?: string;
    description?: string;
  };
  links?: Opds2Link[];
  images?: Opds2Link[];
}

interface Opds2Feed {
  metadata?: { title?: string; numberOfItems?: number };
  links?: Opds2Link[];
  navigation?: Opds2Link[];
  publications?: Opds2Publication[];
  groups?: Array<{ navigation?: Opds2Link[]; publications?: Opds2Publication[] }>;
}

function localized(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, string>;
    return record.en ?? Object.values(record)[0];
  }
  return undefined;
}

function rels(link: Opds2Link): string[] {
  return Array.isArray(link.rel) ? link.rel : link.rel ? [link.rel] : [];
}

function parseOpds2(body: string, base: string, sourceId: string): CatalogPage {
  const feed = JSON.parse(body) as Opds2Feed;
  const publications = [
    ...(feed.publications ?? []),
    ...(feed.groups ?? []).flatMap((group) => group.publications ?? []),
  ];
  const navLinks = [
    ...(feed.navigation ?? []),
    ...(feed.groups ?? []).flatMap((group) => group.navigation ?? []),
  ];

  const entries: CatalogEntry[] = publications.map((publication) => {
    const meta = publication.metadata ?? {};
    const links = publication.links ?? [];
    const acquisitions = links
      .filter((link) => rels(link).some((rel) => rel.startsWith(ACQUISITION_REL_PREFIX)) && link.href)
      .map((link) => ({
        href: resolve(link.href!, base),
        type: link.type ?? "",
        rel: relKind(rels(link).find((rel) => rel.startsWith(ACQUISITION_REL_PREFIX))!),
      }));
    const authors = asArray(meta.author as unknown[] | undefined)
      .map((author) =>
        typeof author === "string" ? author : localized((author as Opds2Contributor).name)
      )
      .filter((name): name is string => Boolean(name));
    const cover = (publication.images ?? [])[0];
    const title = localized(meta.title) ?? "Untitled";
    return {
      id: meta.identifier ?? acquisitions[0]?.href ?? title,
      title,
      authors,
      summary: meta.description,
      language: asArray(meta.language)[0],
      coverUrl: cover?.href ? resolve(cover.href, base) : undefined,
      publishedYear: yearOf(meta.published),
      isbn: meta.identifier?.startsWith("urn:isbn:")
        ? meta.identifier.slice(9)
        : undefined,
      acquisitions: sortAcquisitions(acquisitions),
    };
  });

  const feedLinks = feed.links ?? [];
  const next = feedLinks.find((link) => rels(link).includes("next"));
  const search = feedLinks.find((link) => rels(link).includes("search") && link.templated);

  return {
    sourceId,
    title: feed.metadata?.title,
    entries,
    navigation: navLinks
      .filter((link) => link.href)
      .map((link) => ({ title: link.title ?? link.href!, href: resolve(link.href!, base) })),
    nextHref: next?.href ? resolve(next.href, base) : undefined,
    total: feed.metadata?.numberOfItems,
    searchTemplate: search?.href ? resolve(search.href, base) : undefined,
  };
}

export function parseOpdsFeed(
  body: string,
  contentType: string,
  base: string,
  sourceId: string
): CatalogPage {
  const trimmed = body.trimStart();
  if (contentType.includes("json") || trimmed.startsWith("{")) {
    return parseOpds2(body, base, sourceId);
  }
  return parseAtom(body, base, sourceId);
}

/**
 * Fill an OpenSearch template (`{searchTerms}`) or an OPDS 2 RFC 6570 URI
 * template (`{?query}`, `{?query,page}`) with a query. Unknown variables are
 * dropped; optional OpenSearch parameters (`{foo?}`) are emptied.
 */
export function fillSearchTemplate(template: string, query: string): string {
  const encoded = encodeURIComponent(query);
  const valueFor = (name: string): string | undefined =>
    name === "query" || name === "searchTerms" || name === "q" ? encoded : undefined;
  return template
    .replace(/\{\?([^}]+)\}/g, (_match, names: string) => {
      const pairs = names
        .split(",")
        .map((name) => name.trim())
        .flatMap((name) => {
          const value = valueFor(name);
          return value === undefined ? [] : [`${name}=${value}`];
        });
      return pairs.length ? `?${pairs.join("&")}` : "";
    })
    .replace(/\{searchTerms\??\}/g, encoded)
    .replace(/\{query\??\}/g, encoded)
    .replace(/\{startPage\??\}/g, "1")
    .replace(/\{startIndex\??\}/g, "0")
    .replace(/\{count\??\}/g, "20")
    .replace(/\{[^}]+\?\}/g, "")
    .replace(/\{[^}]+\}/g, "");
}
