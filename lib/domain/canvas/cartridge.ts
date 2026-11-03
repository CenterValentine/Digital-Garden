/**
 * Canvas archive — Common Cartridge (.imscc) source (CANVAS-ARCHIVE-PLAN.md §12 P3).
 *
 * A course export is a zip: `imsmanifest.xml` lists the module tree and the
 * resources, and Canvas adds `course_settings/` (module_meta.xml with the
 * exact item types — SubHeaders and external URLs included —, the course's
 * title/code, the syllabus). This module unpacks one into the same
 * `CourseSnapshot` the REST API produces, plus accessors for item content,
 * so the planner and the importer never learn which source they're reading.
 *
 * What an export can't hold: your submissions, grades and feedback (they
 * belong to an enrollment, not the course), and quiz questions are kept in
 * QTI we don't render. Notes say so instead of implying you did nothing.
 *
 * Pure (jszip + fast-xml-parser, node:crypto for versions; no Prisma). Pinned
 * by `pnpm canvas:check`, which builds a cartridge in memory.
 */

import { createHash } from "node:crypto";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type { CanvasItemType, CourseSnapshot, SnapshotItem, SnapshotModule } from "./types";

type XmlNode = Record<string, unknown>;

const ARRAY_TAGS = new Set(["item", "resource", "file", "module", "dependency"]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => ARRAY_TAGS.has(name),
});

export class CartridgeError extends Error {
  readonly status = 422;
}

interface CartridgeResource {
  identifier: string;
  type: string;
  href: string | null;
  files: string[];
}

export interface ParsedCartridge {
  snapshot: CourseSnapshot;
  syllabusHtml: string | null;
  resources: Map<string, CartridgeResource>;
  readText(path: string): Promise<string | null>;
  readBinary(path: string): Promise<Uint8Array | null>;
}

function text(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const record = value as XmlNode;
    if ("#text" in record) return text(record["#text"]);
    if ("string" in record) return text(Array.isArray(record.string) ? record.string[0] : record.string);
  }
  return "";
}

function list(value: unknown): XmlNode[] {
  if (Array.isArray(value)) return value as XmlNode[];
  return value && typeof value === "object" ? [value as XmlNode] : [];
}

function hash(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 32);
}

/** The `<body>` of an HTML document (exports store whole documents). */
export function htmlBody(document: string): string {
  const body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(document);
  return (body ? body[1] : document).trim();
}

const MODULE_META_TYPES: Record<string, CanvasItemType> = {
  WikiPage: "page",
  Attachment: "file",
  Assignment: "assignment",
  DiscussionTopic: "discussion",
  "Quizzes::Quiz": "quiz",
  ExternalUrl: "external_url",
  ContextExternalTool: "external_tool",
  ContextModuleSubHeader: "subheader",
};

function typeFromResource(resource: CartridgeResource | undefined): CanvasItemType | null {
  if (!resource) return "subheader";
  const type = resource.type.toLowerCase();
  if (type.startsWith("imswl")) return "external_url";
  if (type.startsWith("imsdt")) return "discussion";
  if (type.includes("assessment")) return "quiz";
  if (type.includes("basiclti")) return "external_tool";
  if (type.includes("learning-application-resource")) return "assignment";
  if (type === "webcontent") {
    return resource.href?.startsWith("wiki_content/") ? "page" : "file";
  }
  return null;
}

function stripPrefix(path: string, prefix: string): string {
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

export async function parseCartridge(data: Uint8Array): Promise<ParsedCartridge> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new CartridgeError("That file isn't a Common Cartridge (.imscc) export: it isn't a zip archive.");
  }
  const readText = async (path: string) => (await zip.file(path)?.async("string")) ?? null;
  const readBinary = async (path: string) => (await zip.file(path)?.async("uint8array")) ?? null;

  const manifestXml = await readText("imsmanifest.xml");
  if (!manifestXml) {
    throw new CartridgeError("That file isn't a Common Cartridge (.imscc) export: imsmanifest.xml is missing.");
  }
  const manifest = (parser.parse(manifestXml) as XmlNode).manifest as XmlNode | undefined;
  if (!manifest) throw new CartridgeError("The cartridge manifest couldn't be read.");

  const resources = new Map<string, CartridgeResource>();
  for (const resource of list((manifest.resources as XmlNode | undefined)?.resource)) {
    const identifier = text(resource["@_identifier"]);
    if (!identifier) continue;
    resources.set(identifier, {
      identifier,
      type: text(resource["@_type"]),
      href: text(resource["@_href"]) || null,
      files: list(resource.file).map((file) => text(file["@_href"])).filter(Boolean),
    });
  }

  // Course identity and title: course_settings.xml first, the LOM title as fallback.
  const settingsXml = await readText("course_settings/course_settings.xml");
  const settings = settingsXml ? ((parser.parse(settingsXml) as XmlNode).course as XmlNode | undefined) : undefined;
  const lomTitle = text(
    (((manifest.metadata as XmlNode | undefined)?.lom as XmlNode | undefined)?.general as XmlNode | undefined)?.title
  );
  const courseId = text(settings?.["@_identifier"]) || text(manifest["@_identifier"]) || "cartridge";
  const name = text(settings?.title) || lomTitle || "Imported course";
  const courseCode = text(settings?.course_code) || null;

  const syllabusDoc = await readText("course_settings/syllabus.html");
  const syllabusHtml = syllabusDoc ? htmlBody(syllabusDoc) : null;

  /** Version of an item = hash of its resource's files; a change to any shows. */
  async function versionOf(resource: CartridgeResource | undefined): Promise<string | null> {
    if (!resource) return null;
    const paths = resource.files.length ? resource.files : resource.href ? [resource.href] : [];
    const parts: string[] = [];
    for (const path of paths) {
      const bytes = await readBinary(path);
      if (bytes) parts.push(hash(bytes));
    }
    return parts.length ? hash(parts.join(":")) : null;
  }

  async function itemFor(
    key: string,
    type: CanvasItemType,
    title: string,
    identifierref: string | null,
    url: string | null
  ): Promise<SnapshotItem> {
    const resource = identifierref ? resources.get(identifierref) : undefined;
    const item: SnapshotItem = { key, type, title: title || "Untitled", version: null, refKey: null, ref: null };
    switch (type) {
      case "page": {
        const href = resource?.href ?? "";
        const slug = stripPrefix(href, "wiki_content/").replace(/\.html?$/i, "").toLowerCase();
        item.refKey = slug ? `page:${slug}` : null;
        item.ref = href || null;
        break;
      }
      case "file": {
        const href = resource?.href ?? "";
        item.refKey = href ? `filepath:${stripPrefix(href, "web_resources/")}` : null;
        item.ref = href || null;
        break;
      }
      case "assignment":
      case "discussion":
      case "quiz":
        item.refKey = identifierref ? `${type}:${identifierref}` : null;
        item.ref = identifierref;
        break;
      case "external_url":
      case "external_tool": {
        let target = url;
        if (!target && resource) {
          const xmlPath = resource.files[0] ?? resource.href;
          const xml = xmlPath ? await readText(xmlPath) : null;
          if (xml) {
            const doc = parser.parse(xml) as XmlNode;
            const link = (doc.webLink ?? doc.cartridge_basiclti_link) as XmlNode | undefined;
            target = text((link?.url as XmlNode | undefined)?.["@_href"]) || text(link?.launch_url) || null;
          }
        }
        item.externalUrl = target;
        item.ref = target;
        break;
      }
      case "subheader":
        break;
    }
    if (type !== "subheader") {
      item.version = type === "external_url" || type === "external_tool" ? (item.externalUrl ? hash(item.externalUrl) : null) : await versionOf(resource);
    }
    return item;
  }

  const modules: SnapshotModule[] = [];
  const moduleMetaXml = await readText("course_settings/module_meta.xml");
  if (moduleMetaXml) {
    const meta = (parser.parse(moduleMetaXml) as XmlNode).modules as XmlNode | undefined;
    const metaModules = list(meta?.module).sort(
      (a, b) => Number(text(a.position) || 0) - Number(text(b.position) || 0)
    );
    for (const metaModule of metaModules) {
      const items: SnapshotItem[] = [];
      const metaItems = list((metaModule.items as XmlNode | undefined)?.item).sort(
        (a, b) => Number(text(a.position) || 0) - Number(text(b.position) || 0)
      );
      for (const metaItem of metaItems) {
        const type = MODULE_META_TYPES[text(metaItem.content_type)];
        if (!type) continue;
        items.push(
          await itemFor(
            text(metaItem["@_identifier"]),
            type,
            text(metaItem.title),
            text(metaItem.identifierref) || null,
            text(metaItem.url) || null
          )
        );
      }
      modules.push({ id: text(metaModule["@_identifier"]), title: text(metaModule.title) || "Module", items });
    }
  } else {
    // Generic cartridge: the organization tree is modules → items.
    const organization = list((manifest.organizations as XmlNode | undefined)?.organization)[0];
    const root = list(organization?.item)[0];
    for (const moduleNode of list(root?.item)) {
      const items: SnapshotItem[] = [];
      for (const itemNode of list(moduleNode.item)) {
        const identifierref = text(itemNode["@_identifierref"]) || null;
        const type = typeFromResource(identifierref ? resources.get(identifierref) : undefined);
        if (!type) continue;
        items.push(await itemFor(text(itemNode["@_identifier"]), type, text(itemNode.title), identifierref, null));
      }
      modules.push({ id: text(moduleNode["@_identifier"]), title: text(moduleNode.title) || "Module", items });
    }
  }

  const snapshot: CourseSnapshot = {
    source: "cartridge",
    courseId,
    name,
    courseCode,
    term: null,
    teachers: [],
    htmlUrl: null,
    syllabus: syllabusHtml && syllabusHtml.replace(/<[^>]*>/g, "").trim() ? { version: hash(syllabusHtml) } : null,
    modules,
  };
  return { snapshot, syllabusHtml, resources, readText, readBinary };
}

/** The HTML (or XML holding HTML) behind a cartridge note item. */
export async function cartridgeItemHtml(
  cartridge: ParsedCartridge,
  item: SnapshotItem
): Promise<{ html: string; dueAt: string | null; pointsPossible: number | null }> {
  const empty = { html: "", dueAt: null, pointsPossible: null };
  if (item.type === "page") {
    const doc = item.ref ? await cartridge.readText(item.ref) : null;
    return { ...empty, html: doc ? htmlBody(doc) : "" };
  }
  const resource = item.ref ? cartridge.resources.get(item.ref) : undefined;
  if (!resource) return empty;
  if (item.type === "discussion") {
    const path = resource.files.find((file) => file.endsWith(".xml")) ?? resource.href;
    const xml = path ? await cartridge.readText(path) : null;
    const topic = xml ? ((parser.parse(xml) as XmlNode).topic as XmlNode | undefined) : undefined;
    return { ...empty, html: text(topic?.text) };
  }
  if (item.type === "assignment") {
    const htmlPath = resource.files.find((file) => /\.html?$/i.test(file)) ?? resource.href;
    const doc = htmlPath ? await cartridge.readText(htmlPath) : null;
    const settingsPath = resource.files.find((file) => file.endsWith("assignment_settings.xml"));
    const settingsXml = settingsPath ? await cartridge.readText(settingsPath) : null;
    const settings = settingsXml
      ? ((parser.parse(settingsXml) as XmlNode).assignment as XmlNode | undefined)
      : undefined;
    const points = Number(text(settings?.points_possible));
    return {
      html: doc ? htmlBody(doc) : "",
      dueAt: text(settings?.due_at) || null,
      pointsPossible: Number.isFinite(points) && text(settings?.points_possible) ? points : null,
    };
  }
  if (item.type === "quiz") {
    const metaPath = resource.files.find((file) => file.endsWith("assessment_meta.xml"));
    const metaXml = metaPath ? await cartridge.readText(metaPath) : null;
    const quiz = metaXml ? ((parser.parse(metaXml) as XmlNode).quiz as XmlNode | undefined) : undefined;
    const points = Number(text(quiz?.points_possible));
    return {
      html: text(quiz?.description),
      dueAt: text(quiz?.due_at) || null,
      pointsPossible: Number.isFinite(points) && text(quiz?.points_possible) ? points : null,
    };
  }
  return empty;
}

/** Zip path of the file a cartridge refKey ("filepath:…") names. */
export function cartridgeFilePath(refKey: string): string | null {
  return refKey.startsWith("filepath:") ? `web_resources/${refKey.slice("filepath:".length)}` : null;
}
