/**
 * Saving a Work into the user's tree (RESEARCH-READER-PLAN.md §7.2).
 *
 * A Work becomes an ordinary content node in the folder the "+" pointed at
 * (the tree's create-target rule — no forced folder, the user's structure
 * decides), with a WorkMeta side row:
 *
 *   stored     — a copy whose licence allows keeping it (CC-BY, CC0, public
 *                domain) is downloaded into the user's storage: a PDF file node.
 *   on-demand  — open but not redistributable: an external link node whose
 *                `copyUrl` the reader fetches each time it opens; never kept.
 *   link       — nothing readable here: an external link node to the landing
 *                page (the access ladder's lower rungs).
 *
 * The Work saved is the SERVER's resolution of the identifiers (cache, then
 * sources) — never the client's copy list or licence claims; a client-sent
 * Work is used only when every source is down, and then only as a link.
 */

import "server-only";
import type { Prisma } from "@/lib/database/generated/prisma";
import { prisma } from "@/lib/database/client";
import { normalizeUrl, validateExternalUrl } from "@/lib/domain/content/external-validation";
import { generateUniqueSlug } from "@/lib/domain/content/slug";
import { MAX_BOOK_BYTES, readerFetch } from "@/lib/domain/reader/server/http";
import { resolveFolderTarget, storeBookFile } from "@/lib/domain/reader/server/library";
import { placeBookShortcut } from "@/lib/domain/reader/server/shelf";
import { placeExistingRow } from "@/lib/domain/content/sibling-slot";
import type { ArrivalPlacement } from "@/lib/domain/content/sibling-order";
import { READER_MIME_TYPES } from "@/lib/domain/reader/types";
import { isStorableLicense } from "../adapter";
import { identifierKeys, parseIdentifierKey } from "../identifiers";
import { isLegalScheme, legalLink } from "../legal";
import { RESEARCH_RESOURCE_TYPE, type SavedWorkRef, type Work, type WorkCopy, type WorkCopyPolicy, type WorkIdentifier } from "../types";
import { ResearchError, resolveIdentifiers } from "./service";

export type CopyPolicy = "stored" | "on-demand" | "link";

export { RESEARCH_RESOURCE_TYPE } from "../types";

export interface SaveWorkResult {
  contentId: string;
  /** What to open: the node, or — for a shortcut — its target. */
  openId: string;
  title: string;
  parentId: string | null;
  duplicate: boolean;
  copyPolicy: CopyPolicy;
  /** "shortcut" when "add again" placed a shortcut to the existing stored file. */
  kind: "node" | "shortcut";
  folderTitle: string | null;
}

const PDF_MAGIC = Buffer.from("%PDF-");

/** Download the first storable PDF that really is a PDF (publishers serve HTML login pages too). */
async function downloadStorableCopy(copies: WorkCopy[]): Promise<{ copy: WorkCopy; buffer: Buffer } | null> {
  for (const copy of copies) {
    if (copy.format !== "pdf" || !copy.storable || !isStorableLicense(copy.license)) continue;
    try {
      const result = await readerFetch(copy.url, { accept: "application/pdf", maxBytes: MAX_BOOK_BYTES, timeoutMs: 30_000 });
      if (result.body.subarray(0, 5).equals(PDF_MAGIC)) return { copy, buffer: result.body };
    } catch {
      // Try the next copy: repositories go down, publishers rate-limit.
    }
  }
  return null;
}

function searchTextOf(work: Work): string {
  return [work.title, work.authors.map((author) => author.name).join(", "), work.venue, work.year, work.abstract]
    .filter(Boolean)
    .join("\n")
    .slice(0, 20_000);
}

function linkUrlOf(work: Work, onDemand: WorkCopy | null): string | null {
  const doi = work.identifiers.doi?.[0];
  const candidates = [work.landingUrl, doi ? `https://doi.org/${doi}` : null, onDemand?.url, work.identifiers.url?.[0]];
  for (const candidate of candidates) {
    if (candidate && validateExternalUrl(candidate).valid) return candidate;
  }
  return null;
}

async function createLinkNode(ownerId: string, parentId: string | null, work: Work, url: string): Promise<string> {
  const normalizedUrl = normalizeUrl(url);
  const parsed = new URL(url);
  const title = work.title.slice(0, 255);
  const created = await prisma.contentNode.create({
    data: {
      ownerId,
      title,
      slug: await generateUniqueSlug(title, ownerId),
      contentType: "external",
      parentId,
      displayOrder: 0,
      externalPayload: {
        create: {
          url,
          normalizedUrl,
          canonicalUrl: normalizedUrl,
          subtype: "website",
          description: (work.tldr ?? work.abstract)?.slice(0, 2000) ?? null,
          resourceType: RESEARCH_RESOURCE_TYPE,
          sourceDomain: parsed.hostname.replace(/^www\./, ""),
          sourceHostname: parsed.hostname,
          preview: {},
        },
      },
    },
    select: { id: true },
  });
  return created.id;
}

const savedRefSelect = {
  contentId: true,
  copyPolicy: true,
  identifierKeys: true,
  content: { select: { contentType: true, parent: { select: { title: true } } } },
} as const;

type SavedRow = {
  contentId: string;
  copyPolicy: string;
  identifierKeys: string[];
  content: { contentType: string; parent: { title: string } | null };
};

function toRef(row: SavedRow): SavedWorkRef {
  return {
    contentId: row.contentId,
    openId: row.contentId,
    contentType: row.content.contentType,
    copyPolicy: row.copyPolicy as WorkCopyPolicy,
    folderTitle: row.content.parent?.title ?? null,
  };
}

/** Every node of the user's that already holds this Work (any shared identifier), oldest first. */
export async function findSavedWorks(ownerId: string, work: Pick<Work, "identifiers">): Promise<SavedWorkRef[]> {
  const keys = identifierKeys(work.identifiers).filter((key) => !key.startsWith("url:"));
  if (!keys.length) return [];
  const rows = await prisma.workMeta.findMany({
    where: { ownerId, identifierKeys: { hasSome: keys }, content: { deletedAt: null } },
    select: savedRefSelect,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toRef);
}

/**
 * For a page of results: which Works the user already has, by Work key —
 * one query over every result's identifier keys, so a card can say "in
 * “Spices” — open it" beside its Add.
 */
export async function savedRefsFor(ownerId: string, works: Work[]): Promise<Record<string, SavedWorkRef[]>> {
  const keysByWork = works.map((work) => [work.key, identifierKeys(work.identifiers).filter((key) => !key.startsWith("url:"))] as const);
  const allKeys = [...new Set(keysByWork.flatMap(([, keys]) => keys))];
  const out: Record<string, SavedWorkRef[]> = {};
  for (const [key] of keysByWork) out[key] = [];
  if (!allKeys.length) return out;
  const rows = await prisma.workMeta.findMany({
    where: { ownerId, identifierKeys: { hasSome: allKeys }, content: { deletedAt: null } },
    select: savedRefSelect,
    orderBy: { createdAt: "asc" },
  });
  for (const row of rows) {
    const held = new Set(row.identifierKeys);
    for (const [key, keys] of keysByWork) {
      if (keys.some((candidate) => held.has(candidate))) out[key].push(toRef(row));
    }
  }
  return out;
}

export interface SaveWorkInput {
  ownerId: string;
  /** "doi:10.…" or any identifier key of the Work. */
  key: string;
  /** Further identifiers the client knows (from a merged search result). */
  identifiers?: WorkIdentifier[];
  parentId?: string | null;
  /**
   * Where in the folder it lands: the top (what you put somewhere lands
   * where you look), or right after a sibling the picker chose.
   */
  placement?: ArrivalPlacement;
  /**
   * The Work is already in the library and the user wants it here too. A
   * stored PDF gets a SHORTCUT to the existing file (one file, two places —
   * the tree's own rule); a link gets a fresh link node.
   */
  again?: boolean;
  /** The client's Work — used only if every source is unreachable, and then as a link. */
  fallback?: Work;
  sourceAdapter?: string;
}

export async function saveWork(input: SaveWorkInput): Promise<SaveWorkResult> {
  const { ownerId } = input;
  const primary = parseIdentifierKey(input.key);
  if (!primary) throw new ResearchError("Invalid work key");
  const asked = [primary, ...(input.identifiers ?? [])];

  const resolved = await resolveIdentifiers(ownerId, asked).catch(() => null);
  const trusted = Boolean(resolved?.work);
  const work: Work | null = resolved?.work ?? (input.fallback ? { ...input.fallback, copies: [] } : null);
  if (!work) throw new ResearchError("No source could describe that work", 404);

  const parentId = await resolveFolderTarget(ownerId, input.parentId);
  const existing = await findSavedWorks(ownerId, work);
  if (existing.length && !input.again) {
    const first = existing[0];
    return {
      contentId: first.contentId,
      openId: first.openId,
      title: work.title,
      parentId,
      duplicate: true,
      copyPolicy: first.copyPolicy,
      kind: "node",
      folderTitle: first.folderTitle,
    };
  }
  // Another copy of a stored PDF is a shortcut to the one file.
  const storedCopy = input.again ? existing.find((ref) => ref.copyPolicy === "stored") : undefined;
  if (storedCopy) {
    const placed = await placeBookShortcut(ownerId, { contentId: storedCopy.contentId, parentId: input.parentId ?? null });
    const folderTitle = await folderTitleOf(ownerId, placed.folderId);
    if (placed.outcome === "created" && placed.shortcutId) {
      await placeExistingRow({ ownerId, rowId: placed.shortcutId, parentId: placed.folderId, placement: input.placement ?? "top" });
      return { contentId: placed.shortcutId, openId: storedCopy.contentId, title: work.title, parentId: placed.folderId, duplicate: false, copyPolicy: "stored", kind: "shortcut", folderTitle };
    }
    // Already there (the file itself, or a shortcut to it): nothing new.
    return { contentId: placed.shortcutId ?? storedCopy.contentId, openId: storedCopy.contentId, title: work.title, parentId: placed.folderId, duplicate: true, copyPolicy: "stored", kind: placed.shortcutId ? "shortcut" : "node", folderTitle };
  }

  let contentId: string | null = null;
  let copyPolicy: CopyPolicy = "link";
  let copyUrl: string | null = null;

  const download = trusted ? await downloadStorableCopy(work.copies) : null;
  if (download) {
    const stored = await storeBookFile({
      ownerId,
      parentId,
      buffer: download.buffer,
      mimeType: READER_MIME_TYPES.pdf,
      title: work.title,
      searchText: searchTextOf(work),
    });
    contentId = stored.contentId;
    copyPolicy = "stored";
    copyUrl = download.copy.url;
  } else {
    // An open copy we may read but not keep → fetched on demand.
    const onDemand = trusted ? (work.copies.find((copy) => copy.format === "pdf") ?? null) : null;
    const url = linkUrlOf(work, onDemand);
    if (!url) throw new ResearchError("This work has no page to link to", 422);
    contentId = await createLinkNode(ownerId, parentId, work, url);
    if (onDemand) {
      copyPolicy = "on-demand";
      copyUrl = onDemand.url;
    }
  }

  // Upsert: a checksum-deduped file node (the same PDF uploaded by hand) may
  // already carry metadata.
  const meta = {
      workKey: work.key,
      identifierKeys: identifierKeys(work.identifiers).filter((key) => !key.startsWith("url:")),
      type: work.type,
      title: work.title.slice(0, 1000),
      authors: work.authors.map((author) => author.name).slice(0, 200),
      year: work.year,
      venue: work.venue?.slice(0, 500) ?? null,
      abstract: work.abstract,
      identifiers: work.identifiers as unknown as Prisma.InputJsonValue,
      face: work.face as unknown as Prisma.InputJsonValue,
      license: work.license?.slice(0, 60) ?? null,
      copyPolicy,
      copyUrl,
      retraction: (work.retraction ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
      sourceAdapter: (input.sourceAdapter ?? "search").slice(0, 80),
      provenance: work.provenance,
  };
  await prisma.workMeta.upsert({
    where: { contentId },
    create: { contentId, ownerId, ...meta },
    update: meta,
  });
  await placeExistingRow({ ownerId, rowId: contentId, parentId, placement: input.placement ?? "top" });

  return { contentId, openId: contentId, title: work.title, parentId, duplicate: false, copyPolicy, kind: "node", folderTitle: await folderTitleOf(ownerId, parentId) };
}

/**
 * The Law stub's save (§7.1): a pasted case citation / CFR / USC section
 * becomes a typed link node, which the Law pack (V1.1) upgrades in place.
 */
export async function saveLegalLink(input: {
  ownerId: string;
  identifier: WorkIdentifier;
  parentId?: string | null;
  placement?: ArrivalPlacement;
  again?: boolean;
}): Promise<SaveWorkResult> {
  const { ownerId, identifier } = input;
  const link = isLegalScheme(identifier.scheme) ? legalLink(identifier.scheme, identifier.value) : null;
  if (!link) throw new ResearchError("Not a legal citation");
  const work: Work = {
    key: `${identifier.scheme}:${identifier.value}`,
    type: link.type,
    title: link.title,
    authors: [],
    year: null,
    venue: null,
    abstract: null,
    tldr: null,
    identifiers: { [identifier.scheme]: [identifier.value] },
    copies: [],
    license: null,
    citedByCount: null,
    referenceCount: null,
    retraction: null,
    face: {},
    provenance: [],
    landingUrl: link.url,
  };
  const parentId = await resolveFolderTarget(ownerId, input.parentId);
  const existing = await findSavedWorks(ownerId, work);
  if (existing.length && !input.again) {
    const first = existing[0];
    return { contentId: first.contentId, openId: first.openId, title: work.title, parentId, duplicate: true, copyPolicy: "link", kind: "node", folderTitle: first.folderTitle };
  }
  const contentId = await createLinkNode(ownerId, parentId, work, link.url);
  await prisma.workMeta.create({
    data: {
      contentId,
      ownerId,
      workKey: work.key,
      identifierKeys: [work.key],
      type: work.type,
      title: work.title,
      authors: [],
      identifiers: work.identifiers as unknown as Prisma.InputJsonValue,
      copyPolicy: "link",
      sourceAdapter: "identifier",
      provenance: [],
    },
  });
  await placeExistingRow({ ownerId, rowId: contentId, parentId, placement: input.placement ?? "top" });
  return { contentId, openId: contentId, title: work.title, parentId, duplicate: false, copyPolicy: "link", kind: "node", folderTitle: await folderTitleOf(ownerId, parentId) };
}

async function folderTitleOf(ownerId: string, folderId: string | null): Promise<string | null> {
  if (!folderId) return null;
  const folder = await prisma.contentNode.findFirst({ where: { id: folderId, ownerId }, select: { title: true } });
  return folder?.title ?? null;
}
