/**
 * Sidecar Reader
 *
 * Parses .meta.json sidecar files and enriches parsed TipTap JSON
 * with metadata from the original export (tag IDs, colors).
 *
 * The sidecar is optional — import works without it, but tags will
 * have empty tagIds (resolved by syncContentTags on first save).
 */

import type { JSONContent } from "@tiptap/core";
import type { MetadataSidecar } from "@/lib/domain/export/metadata";
import type { ImportWarning } from "./types";

interface SidecarParseResult {
  sidecar: MetadataSidecar;
  warnings: ImportWarning[];
}

interface SidecarEnrichmentResult {
  enrichedJson: JSONContent;
  warnings: ImportWarning[];
}

/**
 * Parse and validate a .meta.json sidecar file.
 * Returns null if the content is not valid JSON or doesn't match expected shape.
 */
export function parseSidecar(content: string): SidecarParseResult | null {
  const warnings: ImportWarning[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;

  const sidecar = parsed as Record<string, unknown>;

  // Check required fields
  if (!sidecar.version || typeof sidecar.version !== "string") {
    warnings.push({
      code: "SIDECAR_MISSING_VERSION",
      message: "Sidecar is missing 'version' field",
    });
  }

  if (!sidecar.schemaVersion || typeof sidecar.schemaVersion !== "string") {
    warnings.push({
      code: "SIDECAR_MISSING_SCHEMA_VERSION",
      message: "Sidecar is missing 'schemaVersion' field",
      suggestion: "Tag enrichment will still work but schema compatibility cannot be verified",
    });
  }

  // Validate tags array
  if (sidecar.tags && !Array.isArray(sidecar.tags)) {
    warnings.push({
      code: "SIDECAR_INVALID_TAGS",
      message: "Sidecar 'tags' field is not an array",
    });
    sidecar.tags = [];
  }

  // Validate wikiLinks array
  if (sidecar.wikiLinks && !Array.isArray(sidecar.wikiLinks)) {
    warnings.push({
      code: "SIDECAR_INVALID_WIKILINKS",
      message: "Sidecar 'wikiLinks' field is not an array",
    });
    sidecar.wikiLinks = [];
  }

  return {
    sidecar: {
      version: (sidecar.version as string) || "1.0",
      schemaVersion: (sidecar.schemaVersion as string) || "1.0.0",
      contentId: (sidecar.contentId as string) || "",
      title: (sidecar.title as string) || "",
      slug: (sidecar.slug as string) || "",
      createdAt: (sidecar.createdAt as string) || "",
      updatedAt: (sidecar.updatedAt as string) || "",
      tags: (sidecar.tags as MetadataSidecar["tags"]) || [],
      wikiLinks: (sidecar.wikiLinks as MetadataSidecar["wikiLinks"]) || [],
      callouts: (sidecar.callouts as MetadataSidecar["callouts"]) || [],
      schema: sidecar.schema as MetadataSidecar["schema"],
      custom: (sidecar.custom as Record<string, unknown>) || {},
    },
    warnings,
  };
}

/**
 * Enrich parsed TipTap JSON using sidecar metadata.
 *
 * - Tags: Match by slug, inject tagId and color from sidecar
 * - WikiLinks: Not enriched (contentId is not stored in TipTap attrs)
 *
 * Returns a new JSONContent tree (does not mutate input).
 */
export function enrichWithSidecar(
  tiptapJson: JSONContent,
  sidecar: MetadataSidecar
): SidecarEnrichmentResult {
  const warnings: ImportWarning[] = [];

  // Build tag lookup: slug → { id, color }
  const tagLookup = new Map<string, { id: string; color: string | null }>();
  for (const tag of sidecar.tags) {
    if (tag.slug && tag.id) {
      tagLookup.set(tag.slug, { id: tag.id, color: tag.color });
    }
  }

  if (tagLookup.size === 0 && sidecar.tags.length > 0) {
    warnings.push({
      code: "SIDECAR_NO_VALID_TAGS",
      message: `Sidecar has ${sidecar.tags.length} tags but none have valid slug + id`,
    });
  }

  // Deep clone and enrich
  const enrichedJson = enrichNode(tiptapJson, tagLookup, warnings);

  return { enrichedJson, warnings };
}

/** Recursively walk and enrich nodes (immutable — creates new objects) */
function enrichNode(
  node: JSONContent,
  tagLookup: Map<string, { id: string; color: string | null }>,
  warnings: ImportWarning[]
): JSONContent {
  // Clone the node
  const enriched: JSONContent = { ...node };

  // Enrich tag nodes
  if (enriched.type === "tag" && enriched.attrs) {
    const slug = enriched.attrs.slug as string;
    const tagData = tagLookup.get(slug);

    if (tagData) {
      enriched.attrs = {
        ...enriched.attrs,
        tagId: tagData.id,
        color: tagData.color,
      };
    } else if (slug) {
      warnings.push({
        code: "SIDECAR_TAG_NOT_FOUND",
        message: `Tag "${slug}" not found in sidecar — will be created as new on save`,
      });
    }
  }

  // Recurse into children
  if (enriched.content) {
    enriched.content = enriched.content.map((child) =>
      enrichNode(child, tagLookup, warnings)
    );
  }

  return enriched;
}
