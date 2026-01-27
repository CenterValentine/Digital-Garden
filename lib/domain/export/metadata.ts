/**
 * Metadata Utilities
 *
 * Generate metadata sidecars and extract semantic information from TipTap JSON
 */

import type { JSONContent } from "@tiptap/core";
import { getCurrentSchemaVersion } from "@/lib/domain/editor/schema-version";

export interface MetadataSidecar {
  version: string;
  schemaVersion: string; // NEW: Track TipTap schema version
  contentId: string;
  title: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  tags: Array<{
    id: string;
    name: string;
    slug: string;
    color: string | null;
  }>;
  wikiLinks: Array<{
    targetTitle: string;
    displayText?: string;
    contentId?: string;
  }>;
  callouts: Array<{
    type: string;
    title?: string;
    position: number;
  }>;
  // NEW: Schema snapshot
  schema?: {
    nodes: string[];
    marks: string[];
    extensions: string[];
  };
  custom: Record<string, unknown>;
}

/**
 * Generate metadata sidecar for a content node
 */
export function generateMetadataSidecar(content: {
  id: string;
  title: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
  notePayload: { tiptapJson: any; metadata: any };
  contentTags: Array<{
    tag: { id: string; name: string; slug: string; color: string | null };
  }>;
}): MetadataSidecar {
  const tiptapJson = content.notePayload.tiptapJson as JSONContent;

  return {
    version: "1.0",
    schemaVersion: getCurrentSchemaVersion(), // Track schema version
    contentId: content.id,
    title: content.title,
    slug: content.slug,
    createdAt: content.createdAt.toISOString(),
    updatedAt: content.updatedAt.toISOString(),
    tags: content.contentTags.map((ct) => ({
      id: ct.tag.id,
      name: ct.tag.name,
      slug: ct.tag.slug,
      color: ct.tag.color,
    })),
    wikiLinks: extractWikiLinksFromTipTap(tiptapJson),
    callouts: extractCalloutsFromTipTap(tiptapJson),
    schema: extractSchemaSnapshot(tiptapJson), // NEW: Schema snapshot
    custom: content.notePayload.metadata || {},
  };
}

/**
 * Extract wiki-links from TipTap JSON
 */
export function extractWikiLinksFromTipTap(
  json: JSONContent
): Array<{ targetTitle: string; displayText?: string; contentId?: string }> {
  const wikiLinks: Array<{
    targetTitle: string;
    displayText?: string;
    contentId?: string;
  }> = [];

  function traverse(node: JSONContent) {
    if (node.type === "wikiLink") {
      wikiLinks.push({
        targetTitle: node.attrs?.targetTitle,
        displayText: node.attrs?.displayText,
        contentId: node.attrs?.contentId,
      });
    }

    if (node.content) {
      node.content.forEach(traverse);
    }
  }

  traverse(json);
  return wikiLinks;
}

/**
 * Extract callouts from TipTap JSON
 */
export function extractCalloutsFromTipTap(
  json: JSONContent
): Array<{ type: string; title?: string; position: number }> {
  const callouts: Array<{ type: string; title?: string; position: number }> =
    [];
  let position = 0;

  function traverse(node: JSONContent) {
    if (node.type === "callout") {
      callouts.push({
        type: node.attrs?.type || "note",
        title: node.attrs?.title,
        position,
      });
    }

    position++;

    if (node.content) {
      node.content.forEach(traverse);
    }
  }

  traverse(json);
  return callouts;
}

/**
 * Extract tags from TipTap JSON
 */
export function extractTagsFromTipTap(
  json: JSONContent
): Array<{ tagId: string; tagName: string; color: string | null }> {
  const tags: Array<{ tagId: string; tagName: string; color: string | null }> =
    [];

  function traverse(node: JSONContent) {
    if (node.type === "tag") {
      tags.push({
        tagId: node.attrs?.tagId,
        tagName: node.attrs?.tagName,
        color: node.attrs?.color,
      });
    }

    if (node.content) {
      node.content.forEach(traverse);
    }
  }

  traverse(json);
  return tags;
}

/**
 * Extract schema snapshot from TipTap JSON
 *
 * Lists all node/mark types actually used in this document
 */
export function extractSchemaSnapshot(json: JSONContent): {
  nodes: string[];
  marks: string[];
  extensions: string[];
} {
  const nodes = new Set<string>();
  const marks = new Set<string>();

  function traverse(node: JSONContent) {
    if (node.type) nodes.add(node.type);

    if (node.marks) {
      node.marks.forEach((mark) => marks.add(mark.type));
    }

    if (node.content) {
      node.content.forEach(traverse);
    }
  }

  traverse(json);

  // Infer extensions from node types
  const extensions: string[] = [];
  if (nodes.has("wikiLink")) extensions.push("WikiLink");
  if (nodes.has("tag")) extensions.push("Tag");
  if (nodes.has("callout")) extensions.push("Callout");
  if (nodes.has("taskList")) extensions.push("TaskList");
  if (nodes.has("table")) extensions.push("Table");

  return {
    nodes: Array.from(nodes),
    marks: Array.from(marks),
    extensions,
  };
}
