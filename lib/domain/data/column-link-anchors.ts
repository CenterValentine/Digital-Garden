/**
 * The link menu's `[[Database#` step: a database's columns as link anchors
 * (lib/domain/content/link-anchor.ts; the anchor itself is
 * lib/domain/data/column-anchor.ts). Client-side — fetches the columns route.
 *
 * Databases are core content, not an extension, so this lister is composed
 * IN FRONT of the extensions' (MainPanelContent). It answers null for any
 * other content type, which hands the target on to the next provider.
 */

import type { LinkAnchorItem, LinkAnchorLister } from "@/lib/domain/content/link-anchor";
import { formatColumnAnchor } from "./column-anchor";

interface ColumnSummary {
  id: string;
  name: string;
  type: string;
  description: string | null;
  isPrimary: boolean;
}

// Every keystroke after `#` re-queries; one fetch per table per drill is
// plenty. Short-lived so a column added in another tab shows up soon.
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { at: number; columns: Promise<ColumnSummary[]> }>();

function loadColumns(tableId: string): Promise<ColumnSummary[]> {
  const hit = cache.get(tableId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.columns;
  const columns = fetch(`/api/content/data/${encodeURIComponent(tableId)}/columns`, {
    credentials: "include",
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`columns ${response.status}`);
      const body = (await response.json()) as { data?: { columns?: ColumnSummary[] } };
      return body.data?.columns ?? [];
    })
    .catch((error: unknown) => {
      cache.delete(tableId);
      throw error;
    });
  cache.set(tableId, { at: Date.now(), columns });
  return columns;
}

export const listDatabaseColumnAnchors: LinkAnchorLister = async (target, query) => {
  if (target.contentType !== "data") return null;
  const columns = await loadColumns(target.id);
  const needle = query.trim().toLowerCase();
  return columns
    .filter((column) => !needle || column.name.toLowerCase().includes(needle))
    .map(
      (column): LinkAnchorItem => ({
        anchor: formatColumnAnchor(column.id),
        label: column.name,
        detail:
          `${column.isPrimary ? "title · " : ""}${column.type}` +
          (column.description ? ` — ${column.description}` : " — no description yet"),
      })
    );
};
