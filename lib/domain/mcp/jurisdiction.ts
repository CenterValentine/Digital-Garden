import "server-only";

/**
 * What an MCP token may reach (MCP-DATABASE-REACH-PLAN §4, D1 approved).
 *
 * A token names ROOTS: folders and databases. A node is in scope when a
 * root is an ancestor-or-self. A database is also in scope when it is
 * reachable by relation from a database that is, through the same 4-hop
 * walk chat uses (`relationReachableTableIds`). An EMPTY root list means
 * the whole garden: a personal token on a personal garden should not be
 * useless until the user picks folders, and narrowing is the deliberate
 * act. After scope, the owner's own access levels apply unchanged
 * (`resolveDataTableAccess`, `canRead`, `canWrite`).
 *
 * Everything here is computed once per request and cached on the scope
 * object; a request is one tool call, so the cache is short-lived by
 * construction.
 */

import { prisma } from "@/lib/database/client";
import { canRead, canWrite, resolveDataTableAccess } from "@/lib/domain/data/server/access";
import { relationReachableTableIds, resolveDatabaseRef } from "@/lib/domain/data/server/resolve";
import { loadTable } from "@/lib/domain/data/server/queries";
import type { DataTable } from "@/lib/domain/data";
import type { McpPrincipal } from "./auth";

interface NodeLite {
  id: string;
  parentId: string | null;
  contentType: string;
}

export class McpScope {
  readonly userId: string;
  readonly rootIds: readonly string[];
  readonly wholeGarden: boolean;
  private nodes: Map<string, NodeLite> | null = null;
  private subtree: Set<string> | null = null;
  private tables: Set<string> | null = null;

  constructor(principal: McpPrincipal) {
    this.userId = principal.userId;
    this.rootIds = principal.token.rootIds;
    this.wholeGarden = principal.token.rootIds.length === 0;
  }

  /** One owner-wide read of (id, parentId, type); the garden is small. */
  private async nodeMap(): Promise<Map<string, NodeLite>> {
    if (this.nodes) return this.nodes;
    const rows = await prisma.contentNode.findMany({
      where: { ownerId: this.userId, deletedAt: null },
      select: { id: true, parentId: true, contentType: true },
    });
    this.nodes = new Map(rows.map((r) => [r.id, r]));
    return this.nodes;
  }

  /** Every node id under (or equal to) a root. Whole garden → null (no filter). */
  async subtreeIds(): Promise<Set<string> | null> {
    if (this.wholeGarden) return null;
    if (this.subtree) return this.subtree;
    const map = await this.nodeMap();
    const roots = new Set(this.rootIds);
    const memo = new Map<string, boolean>();
    const inScope = (id: string): boolean => {
      const hit = memo.get(id);
      if (hit !== undefined) return hit;
      let cur: NodeLite | undefined = map.get(id);
      const chain: string[] = [];
      let result = false;
      for (let hops = 0; cur && hops < 64; hops += 1) {
        chain.push(cur.id);
        if (roots.has(cur.id)) {
          result = true;
          break;
        }
        const known = memo.get(cur.id);
        if (known !== undefined) {
          result = known;
          break;
        }
        cur = cur.parentId ? map.get(cur.parentId) : undefined;
      }
      for (const c of chain) memo.set(c, result);
      return result;
    };
    const out = new Set<string>();
    for (const id of map.keys()) if (inScope(id)) out.add(id);
    this.subtree = out;
    return out;
  }

  async nodeInScope(nodeId: string): Promise<boolean> {
    const map = await this.nodeMap();
    if (!map.has(nodeId)) return false; // not the owner's, or deleted
    if (this.wholeGarden) return true;
    const ids = await this.subtreeIds();
    return ids !== null && ids.has(nodeId);
  }

  /** Databases in scope: under a root, or relation-reachable from one that is. */
  async tableIds(): Promise<Set<string> | null> {
    if (this.wholeGarden) return null;
    if (this.tables) return this.tables;
    const map = await this.nodeMap();
    const ids = (await this.subtreeIds()) ?? new Set<string>();
    const rootTables = [...ids].filter((id) => map.get(id)?.contentType === "data");
    const reach = rootTables.length > 0 ? await relationReachableTableIds(rootTables) : new Set<string>();
    this.tables = new Set([...rootTables, ...reach]);
    return this.tables;
  }

  async tableInScope(tableId: string): Promise<boolean> {
    const map = await this.nodeMap();
    const node = map.get(tableId);
    if (!node || node.contentType !== "data") return false;
    if (this.wholeGarden) return true;
    const ids = await this.tableIds();
    return ids !== null && ids.has(tableId);
  }

  /** The single root folder, when the token has exactly one — the default home for new notes. */
  async soleRootFolder(): Promise<string | null> {
    if (this.rootIds.length !== 1) return null;
    const map = await this.nodeMap();
    const node = map.get(this.rootIds[0]);
    return node?.contentType === "folder" ? node.id : null;
  }
}

export type OpenedTable = { databaseId: string; table: DataTable; level: "read" | "write" | "owner" };

/**
 * Resolve a database reference (id or exact title) the way chat does, then
 * apply MCP scope and the owner's own access level.
 */
export async function openTable(
  scope: McpScope,
  ref: string,
  need: "read" | "write"
): Promise<OpenedTable | { refusal: string }> {
  const dbRef = await resolveDatabaseRef({ userId: scope.userId }, ref);
  if ("refusal" in dbRef) return { refusal: dbRef.refusal };
  if (!(await scope.tableInScope(dbRef.id))) {
    return {
      refusal:
        "That database is outside this token's reach. Reach covers the token's root folders and databases, plus databases linked to those by relation. Ask the user to widen the token on Settings → MCP.",
    };
  }
  const level = await resolveDataTableAccess(dbRef.id, scope.userId);
  if (!canRead(level)) return { refusal: "You cannot read this database." };
  if (need === "write" && !canWrite(level)) {
    return { refusal: "This database is read-only for you — tell the user." };
  }
  const table = await loadTable(dbRef.id, scope.userId);
  if (!table) return { refusal: "That database could not be loaded." };
  if (need === "write" && table.mode === "query") {
    return { refusal: "Query databases project existing notes — edit the notes, not rows." };
  }
  return { databaseId: dbRef.id, table, level: level as OpenedTable["level"] };
}
