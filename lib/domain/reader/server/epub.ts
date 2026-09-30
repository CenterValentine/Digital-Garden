/**
 * EPUB inspection (server-only): DRM detection, OPF metadata, plain text for
 * search. Uses jszip (already a dependency) + fast-xml-parser.
 */

// Pure parsing (no secrets, no I/O) — kept importable from tsx so
// `pnpm reader:check` can exercise it without the server-only guard.
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  isArray: (name) =>
    ["creator", "identifier", "item", "itemref", "meta", "rootfile", "language", "title"].includes(name),
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

export type DrmScheme = "adobe-adept" | "readium-lcp" | "apple-fairplay" | "unknown";

export interface EpubInspection {
  drm: DrmScheme | null;
  title?: string;
  authors: string[];
  language?: string;
  publisher?: string;
  description?: string;
  publishedYear?: number;
  isbn?: string;
  /** Up to MAX_SEARCH_CHARS of body text, for FilePayload.searchText. */
  searchText: string;
}

const MAX_SEARCH_CHARS = 400_000;

/**
 * Identify DRM. Font obfuscation (IDPF / Adobe font mangling) also lives in
 * encryption.xml but is NOT DRM — only content encryption counts.
 */
function detectDrm(zip: JSZip, encryptionXml: string | null, rightsXml: string | null): DrmScheme | null {
  if (zip.file("META-INF/license.lcpl")) return "readium-lcp";
  if (rightsXml && /adept/i.test(rightsXml)) return "adobe-adept";
  if (zip.file("META-INF/sinf.xml")) return "apple-fairplay";
  if (!encryptionXml) return null;
  const doc = xml.parse(encryptionXml) as XmlNode;
  const encryption = doc.encryption as XmlNode | undefined;
  const entries = asArray(encryption?.EncryptedData as XmlNode | XmlNode[] | undefined);
  const fontObfuscation = new Set([
    "http://www.idpf.org/2008/embedding",
    "http://ns.adobe.com/pdf/enc#RC",
  ]);
  const encryptsContent = entries.some((entry) => {
    const method = (entry.EncryptionMethod as XmlNode | undefined)?.["@_Algorithm"];
    return typeof method === "string" && !fontObfuscation.has(method);
  });
  if (!encryptsContent) return null;
  if (/lcp|readium/i.test(encryptionXml)) return "readium-lcp";
  if (/adobe|adept/i.test(encryptionXml)) return "adobe-adept";
  return "unknown";
}

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function inspectEpub(buffer: Buffer): Promise<EpubInspection> {
  const zip = await JSZip.loadAsync(buffer);
  const encryptionXml = (await zip.file("META-INF/encryption.xml")?.async("string")) ?? null;
  const rightsXml = (await zip.file("META-INF/rights.xml")?.async("string")) ?? null;
  const drm = detectDrm(zip, encryptionXml, rightsXml);

  const containerXml = await zip.file("META-INF/container.xml")?.async("string");
  const container = containerXml ? (xml.parse(containerXml) as XmlNode) : {};
  const rootfile = asArray(
    ((container.container as XmlNode | undefined)?.rootfiles as XmlNode | undefined)
      ?.rootfile as XmlNode[] | undefined
  )[0];
  const opfPath = typeof rootfile?.["@_full-path"] === "string" ? rootfile["@_full-path"] : null;
  const opfXml = opfPath ? await zip.file(opfPath)?.async("string") : undefined;

  const result: EpubInspection = { drm, authors: [], searchText: "" };
  if (!opfXml || !opfPath) return result;

  const opf = xml.parse(opfXml) as XmlNode;
  const pkg = opf.package as XmlNode | undefined;
  const metadata = (pkg?.metadata ?? {}) as XmlNode;
  result.title = text(asArray(metadata.title as unknown[])[0]);
  result.authors = asArray(metadata.creator as unknown[])
    .map(text)
    .filter((name): name is string => Boolean(name));
  result.language = text(asArray(metadata.language as unknown[])[0]);
  result.publisher = text(metadata.publisher);
  result.description = text(metadata.description)?.replace(/<[^>]+>/g, "").slice(0, 4000);
  const date = text(metadata.date);
  result.publishedYear = date?.match(/\d{4}/) ? Number(date.match(/\d{4}/)![0]) : undefined;
  result.isbn = asArray(metadata.identifier as unknown[])
    .map(text)
    .map((id) => id?.replace(/^urn:isbn:/i, "").replace(/-/g, ""))
    .find((id): id is string => Boolean(id && /^(97[89])?\d{9}[\dX]$/i.test(id)));

  if (drm) return result; // encrypted bodies are unreadable anyway

  // Body text in spine order, for search.
  const manifest = new Map<string, string>();
  for (const item of asArray(((pkg?.manifest ?? {}) as XmlNode).item as XmlNode[] | undefined)) {
    if (typeof item["@_id"] === "string" && typeof item["@_href"] === "string") {
      manifest.set(item["@_id"], item["@_href"]);
    }
  }
  const base = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const parts: string[] = [];
  let length = 0;
  for (const itemref of asArray(((pkg?.spine ?? {}) as XmlNode).itemref as XmlNode[] | undefined)) {
    if (length >= MAX_SEARCH_CHARS) break;
    const href = manifest.get(String(itemref["@_idref"] ?? ""));
    if (!href) continue;
    const html = await zip.file(decodeURIComponent(base + href))?.async("string");
    if (!html) continue;
    const plain = stripHtml(html);
    parts.push(plain);
    length += plain.length;
  }
  result.searchText = parts.join("\n").slice(0, MAX_SEARCH_CHARS);
  return result;
}

export function describeDrm(scheme: DrmScheme): string {
  switch (scheme) {
    case "adobe-adept":
      return "This book is protected with Adobe DRM. Read it in the app you bought or borrowed it from.";
    case "readium-lcp":
      return "This book is protected with Readium LCP (library lending DRM). Read it in your library's app.";
    case "apple-fairplay":
      return "This book is protected with Apple FairPlay DRM. Read it in Apple Books.";
    default:
      return "This book is copy-protected. Read it in the app you got it from.";
  }
}
