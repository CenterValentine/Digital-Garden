import "server-only";

/**
 * MCP resources (MCP-DATABASE-REACH-PLAN §3): how a USER attaches garden
 * content to a conversation without the model calling anything. Resource
 * reads get the ingest budget (60k), not the tool cap: a human chose to
 * put the thing in context, which is the same act as chat's "Ingest in
 * full" (§2.5). Every resource is also reachable through a tool, because
 * the API-level connectors list tools only (§8.2).
 */

import type { JSONContent } from "@tiptap/core";
import { prisma } from "@/lib/database/client";
import { INGEST_MAX_TOKENS } from "@/lib/domain/ai/charters/ingest";
import { buildDataSchemaDigest } from "@/lib/domain/data/server/digest";
import { loadRowPage, loadRowsByIds, loadTable } from "@/lib/domain/data/server/queries";
import { allBulkColumns, formatRows, indexTierColumns, type DataView } from "@/lib/domain/data";
import { renderNoteForMcp } from "./read";
import type { McpScope } from "./jurisdiction";
import { fileBlob, rewriteDownloadLinks } from "./media";
import { capText } from "./results";

export const RESOURCE_BUDGET = INGEST_MAX_TOKENS;

export async function noteResource(scope: McpScope, id: string): Promise<string | null> {
  if (!(await scope.nodeInScope(id))) return null;
  const node = await prisma.contentNode.findFirst({
    where: { id, ownerId: scope.userId, deletedAt: null, contentType: "note" },
    select: { title: true, notePayload: { select: { tiptapJson: true } } },
  });
  if (!node) return null;
  const json = (node.notePayload?.tiptapJson as JSONContent | undefined) ?? { type: "doc", content: [] };
  const body = (await rewriteDownloadLinks(scope.userId, renderNoteForMcp(json))).text;
  return capText(`# ${node.title}\n\n${body}`, RESOURCE_BUDGET, "Read the rest with garden_read.").text;
}

export type FileResourceContents =
  | { kind: "text"; text: string; mimeType: string }
  | { kind: "blob"; data: string; mimeType: string };

/**
 * Code and HTML as text; an uploaded binary (image, PDF, …) as its bytes
 * when under the cap, so a client can show an image without a cookie.
 */
export async function fileResource(scope: McpScope, id: string): Promise<FileResourceContents | null> {
  if (!(await scope.nodeInScope(id))) return null;
  const node = await prisma.contentNode.findFirst({
    where: { id, ownerId: scope.userId, deletedAt: null, contentType: { in: ["code", "html", "file"] } },
    select: {
      title: true,
      contentType: true,
      codePayload: { select: { code: true, language: true } },
      htmlPayload: { select: { searchText: true } },
      filePayload: { select: { fileName: true, mimeType: true, searchText: true } },
    },
  });
  if (!node) return null;
  if (node.contentType === "file") {
    const blob = await fileBlob(scope.userId, id).catch(() => null);
    if (blob) return { kind: "blob", data: blob.data, mimeType: blob.mimeType };
    const text = `${node.filePayload?.fileName ?? node.title} (${node.filePayload?.mimeType ?? "?"})\n\n${node.filePayload?.searchText ?? "(no extracted text; file too large to embed)"}`;
    return { kind: "text", text: capText(`# ${node.title}\n\n${text}`, RESOURCE_BUDGET, "Read the rest with garden_read.").text, mimeType: "text/markdown" };
  }
  const body =
    node.contentType === "code"
      ? `\`\`\`${node.codePayload?.language ?? ""}\n${node.codePayload?.code ?? ""}\n\`\`\``
      : node.htmlPayload?.searchText ?? "";
  return { kind: "text", text: capText(`# ${node.title}\n\n${body}`, RESOURCE_BUDGET, "Read the rest with garden_read.").text, mimeType: "text/markdown" };
}

export async function databaseSchemaResource(scope: McpScope, id: string): Promise<string | null> {
  if (!(await scope.tableInScope(id))) return null;
  return buildDataSchemaDigest(id, { viewerId: scope.userId });
}

/** Databases in scope with their views, for `resources/list`. */
export async function listDatabaseResources(scope: McpScope): Promise<Array<{ id: string; title: string; views: Array<{ id: string; name: string }> }>> {
  const ids = await scope.tableIds();
  const rows = await prisma.contentNode.findMany({
    where: { ownerId: scope.userId, deletedAt: null, contentType: "data", ...(ids ? { id: { in: [...ids] } } : {}) },
    select: { id: true, title: true, dataPayload: { select: { views: { select: { id: true, name: true } } } } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return rows.map((r) => ({ id: r.id, title: r.title, views: r.dataPayload?.views ?? [] }));
}

export async function viewResource(scope: McpScope, tableId: string, viewId: string): Promise<string | null> {
  if (!(await scope.tableInScope(tableId))) return null;
  const table = await loadTable(tableId, scope.userId);
  if (!table) return null;
  const view = table.views.find((v) => v.id === viewId || v.name.toLowerCase() === viewId.toLowerCase());
  if (!view) return null;
  const live = table.columns.filter((c) => !c.deletedAt);
  const page = await loadRowPage({ tableId, view: view as DataView, columns: live, cursor: null, limit: 1000, viewerId: scope.userId });
  let rows = page.rows;
  let body = formatRows({ rows, columns: indexTierColumns(live), live, render: { relations: "titles", clipChars: 120, fullColumns: new Set(), maxLinkedTitles: 1, linkedTitleClip: 40 } });
  while (body.tokens > RESOURCE_BUDGET && rows.length > 1) {
    rows = rows.slice(0, Math.floor(rows.length / 2));
    body = formatRows({ rows, columns: indexTierColumns(live), live, render: { relations: "titles", clipChars: 120, fullColumns: new Set(), maxLinkedTitles: 1, linkedTitleClip: 40 } });
  }
  const cut = rows.length < page.total ? `\n\n[${rows.length} of ${page.total} rows shown. Page the rest with garden_query_rows and view: "${view.name}".]` : "";
  return `# ${table.title} › ${view.name}\n${rows.length} of ${page.total} rows\n\n${body.text}${cut}`;
}

export async function rowResource(scope: McpScope, tableId: string, rowId: string): Promise<string | null> {
  if (!(await scope.tableInScope(tableId))) return null;
  const table = await loadTable(tableId, scope.userId);
  if (!table) return null;
  const live = table.columns.filter((c) => !c.deletedAt);
  const rows = await loadRowsByIds(tableId, [rowId], live, scope.userId);
  if (rows.length === 0) return null;
  const all = allBulkColumns(live);
  const body = formatRows({ rows, columns: all, live, render: { relations: "titles", clipChars: 10_000, fullColumns: new Set(all.map((c) => c.id)) } });
  return `# ${table.title} row ${rowId.slice(0, 8)}\n\n${body.text}`;
}
