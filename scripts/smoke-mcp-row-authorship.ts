/**
 * End-to-end smoke for row authorship + row paging (2026-10-21), through a
 * real MCP client and the app's own routes.
 *
 *   GARDEN_ORIGIN=http://localhost:3016 GARDEN_MCP_TOKEN=dgmcp_… \
 *   GARDEN_SESSION=<session_token cookie of the SAME user> pnpm mcp:rows:smoke
 *
 * What it proves (each line is an expectation):
 *   authorship — rows the MCP inserts delete without a confirmation under
 *     "Ask me"; a mixed set deletes the MCP's own and HOLDS the user's,
 *     naming them; a set of only user rows is refused with the remedy;
 *     "Allowed" deletes a user row; the chat-side stamp is the same column.
 *   paging — the table route pages at 100 with an accurate total and a
 *     cursor; the rows route continues it to the end with no duplicates;
 *     a sorted view continues by offset; garden_query_rows follows
 *     nextCursor to completeness in BOTH orders.
 *
 * Creates its own database ("Smoke rows <time>") and leaves it in the
 * trash-free state it found (the table is deleted at the end).
 */

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const origin = process.env.GARDEN_ORIGIN ?? "http://localhost:3015";
const url = `${origin}/api/mcp`;
const token = process.env.GARDEN_MCP_TOKEN;
const session = process.env.GARDEN_SESSION;

let failures = 0;
function expect(ok: boolean, message: string): void {
  console.log(`${ok ? "✓" : "✗"} ${message}`);
  if (!ok) failures += 1;
}
type ToolResult = { content?: Array<{ type: string; text?: string }>; structuredContent?: unknown; isError?: boolean };
function text(result: ToolResult): string {
  return (result.content ?? []).map((c) => (c.type === "text" ? c.text ?? "" : "")).join("\n");
}
function structured(result: ToolResult): Record<string, unknown> {
  return (result.structuredContent ?? {}) as Record<string, unknown>;
}
function trim(s: string, n = 300): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

async function api<T = Record<string, unknown>>(method: string, path: string, body?: unknown): Promise<{ status: number; json: { success?: boolean; data?: T; error?: { message?: string } } }> {
  const res = await fetch(`${origin}${path}`, {
    method,
    headers: { "content-type": "application/json", cookie: `session_token=${session}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as never };
}

async function main() {
  if (!token || !session) {
    console.error("GARDEN_MCP_TOKEN and GARDEN_SESSION are required");
    process.exit(2);
  }

  const client = new Client({ name: "garden-rows-smoke", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
  await client.connect(transport);
  expect(Boolean(client.getServerVersion()?.name), `connected to ${client.getServerVersion()?.name}`);
  const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args }) as Promise<ToolResult>;

  // ── a table of our own ───────────────────────────────────────────────
  const created = await api<{ id: string }>("POST", "/api/content/data", {
    title: `Smoke rows ${new Date().toISOString().slice(11, 19)}`,
    columns: [
      { name: "Name", type: "text", primary: true },
      { name: "Rank", type: "number" },
    ],
  });
  expect(created.status === 200 && Boolean(created.json.data?.id), `created a smoke database (${created.status})`);
  const dbId = created.json.data!.id;

  try {
    // ── authorship ─────────────────────────────────────────────────────
    const ins = await call("garden_insert_rows", { database: dbId, rows: [{ Name: "mcp one", Rank: 1 }, { Name: "mcp two", Rank: 2 }, { Name: "mcp three", Rank: 3 }] });
    expect(!ins.isError && structured(ins).inserted === 3, `garden_insert_rows inserted 3 (${trim(text(ins), 120)})`);

    const q1 = await call("garden_query_rows", { database: dbId, columns: ["Name"] });
    const rows1 = (structured(q1).rows as Array<{ handle: string; id: string; title: string }>) ?? [];
    const mcpHandles = rows1.filter((r) => r.title.startsWith("mcp")).map((r) => r.handle);
    expect(mcpHandles.length === 3, `query sees the 3 MCP rows`);

    const userRow = await api<{ rowIds: string[] }>("POST", `/api/content/data/${dbId}/rows`, { count: 1 });
    const userRowId = userRow.json.data?.rowIds?.[0];
    expect(typeof userRowId === "string", "the user added a row through the app");
    await api("PATCH", `/api/content/data/${dbId}/rows`, { writes: [{ rowId: userRowId, columnKey: (await columnKey("Name")), value: "user one", expect: null, hasExpectation: false }] });

    // 1. The MCP's own rows go without asking (policy is the default, confirm).
    const d1 = await call("garden_delete_rows", { database: dbId, rows: mcpHandles.slice(0, 2), reason: "smoke: the assistant removes its own rows" });
    const s1 = structured(d1);
    expect(!d1.isError && s1.deleted === 2 && s1.policy === "confirm" && Array.isArray(s1.held) && s1.held.length === 0, `own rows deleted without a confirmation under confirm (${trim(text(d1), 160)})`);
    expect(/no confirmation was needed/.test(text(d1)), "the receipt says no confirmation was needed");

    // 2. A mixed set: the MCP's row goes, the user's is held and named.
    const userHandle = userRowId!.slice(0, 8);
    const d2 = await call("garden_delete_rows", { database: dbId, rows: [mcpHandles[2], userHandle], reason: "smoke: mixed set" });
    const s2 = structured(d2);
    expect(!d2.isError && s2.deleted === 1 && Array.isArray(s2.held) && (s2.held as string[]).includes(userHandle), `mixed set: own row deleted, user row held (${trim(text(d2), 200)})`);
    expect(/Held 1 user-written row/.test(text(d2)) && /cannot ask the user/.test(text(d2)), "the receipt names the held row and why");

    // 3. Only the user's row: refused with the remedy, nothing deleted.
    const d3 = await call("garden_delete_rows", { database: dbId, rows: [userHandle], reason: "smoke: user row only" });
    expect(Boolean(d3.isError) && /Nothing deleted/.test(text(d3)) && /Allowed/.test(text(d3)), `user-only set refused with the remedy (${trim(text(d3), 160)})`);
    const still = await api<{ rows: Array<{ id: string }> }>("GET", `/api/content/data/${dbId}/rows?ids=${userRowId}`);
    expect((still.json.data?.rows ?? []).length === 1, "the user's row is still there");

    // 4. "Allowed" deletes the user's row at once.
    const pol = await api("PATCH", `/api/content/data/${dbId}`, { aiPolicy: { delete: "allow" } });
    expect(pol.status === 200, "policy set to allow");
    const d4 = await call("garden_delete_rows", { database: dbId, rows: [userHandle], reason: "smoke: allowed" });
    expect(!d4.isError && structured(d4).deleted === 1 && structured(d4).policy === "allow", `allow deletes the user's row (${trim(text(d4), 120)})`);
    await api("PATCH", `/api/content/data/${dbId}`, { aiPolicy: { delete: "confirm" } });

    // ── paging ─────────────────────────────────────────────────────────
    const batches: Array<Array<Record<string, unknown>>> = [];
    for (let i = 0; i < 130; i += 25) {
      batches.push(Array.from({ length: Math.min(25, 130 - i) }, (_, j) => ({ Name: `row ${String(i + j).padStart(3, "0")}`, Rank: (i + j) % 7 })));
    }
    for (const batch of batches) {
      const r = await call("garden_insert_rows", { database: dbId, rows: batch });
      if (r.isError) expect(false, `insert batch failed: ${trim(text(r))}`);
    }
    const table = await api<{ rows: Array<{ id: string; sortKey: string }>; total: number; nextCursor: { sortKey?: string; id?: string; offset?: number } | null }>("GET", `/api/content/data/${dbId}`);
    const first = table.json.data!;
    expect(first.rows.length === 100 && first.total === 130 && first.nextCursor !== null, `table route: ${first.rows.length} of ${first.total} rows with a cursor`);

    const seen = new Set(first.rows.map((r) => r.id));
    let cursor = first.nextCursor;
    let pages = 0;
    while (cursor && pages < 10) {
      const q = new URLSearchParams({ cursorSortKey: cursor.sortKey ?? "", cursorId: cursor.id ?? "" });
      const page = await api<{ rows: Array<{ id: string }>; nextCursor: typeof cursor }>("GET", `/api/content/data/${dbId}/rows?${q}`);
      for (const r of page.json.data!.rows) {
        if (seen.has(r.id)) expect(false, `duplicate row across pages: ${r.id}`);
        seen.add(r.id);
      }
      cursor = page.json.data!.nextCursor;
      pages += 1;
    }
    expect(seen.size === 130 && pages === 1, `rows route continued to all 130 rows in ${pages} more page(s), no duplicates`);

    const bigger = await api<{ rows: unknown[]; nextCursor: unknown }>("GET", `/api/content/data/${dbId}?limit=130`);
    expect(bigger.json.data!.rows.length === 130 && bigger.json.data!.nextCursor === null, "table route honours limit (a reload keeps what was loaded)");

    // A sorted view continues by offset. A fresh table has no saved view.
    const tbl = await api<{ table: { columns: Array<{ id: string; name: string }> } }>("GET", `/api/content/data/${dbId}`);
    const madeView = await api<{ viewId: string }>("POST", `/api/content/data/${dbId}/views`, { name: "By rank" });
    const viewId = madeView.json.data!.viewId;
    expect(typeof viewId === "string", "created a view to sort");
    const rank = tbl.json.data!.table.columns.find((c) => c.name === "Rank")!.id;
    const sorted = await api("PATCH", `/api/content/data/${dbId}/views`, { viewId, sorts: [{ columnId: rank, direction: "desc" }] });
    expect(sorted.status === 200, "view sorted by Rank desc");
    const s1p = await api<{ rows: Array<{ id: string }>; total: number; nextCursor: { offset?: number } | null }>("GET", `/api/content/data/${dbId}?view=${viewId}`);
    expect(s1p.json.data!.rows.length === 100 && s1p.json.data!.nextCursor?.offset === 100, `sorted view: first page with offset cursor (${JSON.stringify(s1p.json.data!.nextCursor)})`);
    const s2p = await api<{ rows: Array<{ id: string }>; nextCursor: unknown }>("GET", `/api/content/data/${dbId}/rows?view=${viewId}&cursorOffset=100`);
    const sortedIds = new Set([...s1p.json.data!.rows.map((r) => r.id), ...s2p.json.data!.rows.map((r) => r.id)]);
    expect(s2p.json.data!.rows.length === 30 && s2p.json.data!.nextCursor === null && sortedIds.size === 130, "sorted view: offset page completes the set with no duplicates");

    // garden_query_rows follows nextCursor to completeness, both orders.
    for (const [label, args] of [["natural", {}], ["sorted", { sortBy: "Rank", sortDirection: "desc" }]] as const) {
      let next: string | null = null;
      const got = new Set<string>();
      let calls = 0;
      do {
        const r = await call("garden_query_rows", { database: dbId, columns: ["Name"], limit: 60, ...(next ? { cursor: next } : {}), ...args });
        for (const row of (structured(r).rows as Array<{ id: string }>) ?? []) got.add(row.id);
        next = (structured(r).nextCursor as string | null) ?? null;
        calls += 1;
      } while (next && calls < 10);
      expect(got.size === 130 && calls === 3, `garden_query_rows (${label}) reached all 130 rows in ${calls} calls`);
    }
  } finally {
    const del = await api("DELETE", `/api/content/content/${dbId}`);
    console.log(`cleanup: deleted the smoke database (${del.status})`);
    await client.close();
  }

  if (failures > 0) {
    console.error(`\nmcp rows smoke: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("mcp rows smoke: ok");

  async function columnKey(name: string): Promise<string> {
    const t = await api<{ table: { columns: Array<{ key: string; name: string }> } }>("GET", `/api/content/data/${dbId}`);
    return t.json.data!.table.columns.find((c) => c.name === name)!.key;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
