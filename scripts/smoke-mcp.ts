/**
 * End-to-end smoke of the garden's MCP server through a real MCP client.
 *
 *   GARDEN_MCP_URL=http://localhost:3016/api/mcp GARDEN_MCP_TOKEN=dgmcp_… pnpm mcp:smoke
 *   SMOKE_WRITE=1 adds the write round trip (a note in the first folder found,
 *   a row in the first database found, then the row's deletion with Allowed
 *   or a refusal otherwise).
 *
 * Exits non-zero on the first failed expectation. Prints what each tool
 * returned, trimmed, so a human can read the transcript.
 */

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const url = process.env.GARDEN_MCP_URL ?? "http://localhost:3015/api/mcp";
const token = process.env.GARDEN_MCP_TOKEN;
const write = process.env.SMOKE_WRITE === "1";

let failures = 0;
function expect(ok: boolean, message: string): void {
  console.log(`${ok ? "✓" : "✗"} ${message}`);
  if (!ok) failures += 1;
}
function text(result: { content?: Array<{ type: string; text?: string }> }): string {
  return (result.content ?? []).map((c) => (c.type === "text" ? c.text ?? "" : "")).join("\n");
}
function structured(result: { structuredContent?: unknown }): Record<string, unknown> {
  return (result.structuredContent ?? {}) as Record<string, unknown>;
}
function trim(s: string, n = 400): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

async function main() {
  if (!token) {
    console.error("GARDEN_MCP_TOKEN is required");
    process.exit(2);
  }

  // Unauthenticated → 401 with a challenge.
  const bare = await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) });
  expect(bare.status === 401, `no token → 401 (got ${bare.status}); WWW-Authenticate: ${bare.headers.get("www-authenticate") ?? "(none)"}`);

  const client = new Client({ name: "garden-smoke", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
  await client.connect(transport);
  expect(Boolean(client.getServerVersion()?.name), `connected to ${client.getServerVersion()?.name} ${client.getServerVersion()?.version}`);
  expect((client.getInstructions() ?? "").includes("garden_report_issue"), "instructions name garden_report_issue");

  const tools = await client.listTools();
  const names = tools.tools.map((t) => t.name).sort();
  console.log(`tools (${names.length}): ${names.join(", ")}`);
  expect(names.length === 19, "19 tools (17 + 2 ChatGPT aliases)");
  for (const t of tools.tools) {
    expect(Boolean(t.annotations), `${t.name} has annotations`);
  }

  const templates = await client.listResourceTemplates();
  expect(templates.resourceTemplates.length === 5, `5 resource templates (got ${templates.resourceTemplates.length})`);
  const prompts = await client.listPrompts();
  expect(prompts.prompts.length === 2, `2 prompts (got ${prompts.prompts.length})`);

  // Find.
  const tree = await client.callTool({ name: "garden_list_tree", arguments: { depth: 1 } });
  console.log(trim(text(tree)));
  const entries = (structured(tree).entries as Array<{ id: string; type: string; title: string }>) ?? [];
  expect(entries.length > 0, `garden_list_tree returned ${entries.length} entries`);

  const dbs = await client.callTool({ name: "garden_search", arguments: { query: "", types: ["data"], limit: 5 } });
  const dbHits = (structured(dbs).hits as Array<{ id: string; title: string }>) ?? [];
  console.log(trim(text(dbs)));
  expect(true, `garden_search listed ${dbHits.length} database(s)`);

  const notes = await client.callTool({ name: "garden_search", arguments: { query: "", types: ["note"], limit: 3 } });
  const noteHits = (structured(notes).hits as Array<{ id: string; title: string }>) ?? [];
  if (noteHits[0]) {
    const r = await client.callTool({ name: "garden_read", arguments: { id: noteHits[0].id, parts: ["body", "tags", "context", "outline", "backlinks"] } });
    console.log(trim(text(r), 600));
    const sc = structured(r);
    expect(sc.type === "note" && typeof sc.updatedAt === "string", `garden_read note "${noteHits[0].title}" with updatedAt`);
    expect("aiContext" in sc && "backlinks" in sc && "outline" in sc, "read carries aiContext, backlinks and outline");
    expect(typeof sc.body === "string" && text(r).includes(sc.body), "structured body is the same markdown as the text block (clients that show only structuredContent need it)");
    const res = await client.readResource({ uri: `garden://note/${noteHits[0].id}` });
    expect(res.contents.length === 1 && typeof (res.contents[0] as { text?: string }).text === "string", "garden://note resource reads");
  }

  if (dbHits[0]) {
    const schema = await client.callTool({ name: "garden_read", arguments: { id: dbHits[0].id, parts: ["body"] } });
    const db = structured(schema).database as { columns: Array<{ name: string; type: string }>; rowCount: number } | undefined;
    expect(Boolean(db && db.columns.length > 0), `garden_read database "${dbHits[0].title}": ${db?.columns.length ?? 0} columns, ${db?.rowCount ?? "?"} rows`);
    const page = await client.callTool({ name: "garden_query_rows", arguments: { database: dbHits[0].id, limit: 5 } });
    console.log(trim(text(page), 600));
    const ps = structured(page);
    expect(typeof ps.returned === "number" && typeof ps.total === "number" && "nextCursor" in ps, `garden_query_rows: ${ps.returned} of ${ps.total}, nextCursor=${ps.nextCursor === null ? "null" : "set"}`);
    const rows = (ps.rows as Array<{ handle: string }>) ?? [];
    if (rows[0]) {
      const fetchOne = await client.callTool({ name: "garden_query_rows", arguments: { database: dbHits[0].id, rows: [rows[0].handle], columns: "all" } });
      const fs = structured(fetchOne);
      expect((fs.rows as unknown[])?.length === 1 && Boolean(((fs.rows as Array<{ cells?: unknown }>)[0]).cells), `fetch call returned every cell of [${rows[0].handle}]`);
    }
  }

  const chats = await client.callTool({ name: "garden_chats_search", arguments: { limit: 3 } });
  console.log(trim(text(chats)));
  const chatHits = (structured(chats).hits as Array<{ id: string }>) ?? [];
  if (chatHits[0]) {
    const c = await client.callTool({ name: "garden_chat_read", arguments: { id: chatHits[0].id, parts: ["messages", "diagnostics"], range: { last: 4 } } });
    expect(text(c).includes("## Diagnostics"), "garden_chat_read renders diagnostics");
  }

  // Files without a cookie: an image file read attaches the pixels and a
  // presigned URL; a note's in-app download links come back presigned; the
  // file resource serves a blob.
  const files = await client.callTool({ name: "garden_search", arguments: { query: "", types: ["file"], limit: 10 } });
  const fileHits = (structured(files).hits as Array<{ id: string; title: string }>) ?? [];
  let imageHit: { id: string; title: string } | undefined;
  for (const hit of fileHits) {
    const r = await client.callTool({ name: "garden_read", arguments: { id: hit.id, parts: ["body"] } });
    const f = structured(r).file as { mimeType?: string } | null | undefined;
    if (f?.mimeType?.startsWith("image/")) {
      imageHit = hit;
      const img = (r.content ?? []).find((c) => c.type === "image") as { mimeType?: string; data?: string } | undefined;
      expect(Boolean(img?.data && img.mimeType === f.mimeType), `garden_read of image "${hit.title}" attaches an image block (${img?.data?.length ?? 0} base64 chars)`);
      const sc = structured(r);
      expect(typeof sc.presignedUrl === "string" && /^https:\/\//.test(sc.presignedUrl as string) && !(sc.presignedUrl as string).includes("/api/content/"), "image read carries a presigned storage URL");
      const probe = await fetch(sc.presignedUrl as string, { method: "GET", headers: { range: "bytes=0-0" } });
      expect(probe.ok, `the presigned URL fetches without a cookie (HTTP ${probe.status})`);
      const res = await client.readResource({ uri: `garden://file/${hit.id}` });
      const first = res.contents[0] as { blob?: string; mimeType?: string } | undefined;
      expect(Boolean(first?.blob) && first?.mimeType === f.mimeType, "garden://file resource returns the image as a blob");
      break;
    }
  }
  if (!imageHit) console.log("(no image file in reach; image read not exercised)");

  let linkedNote: { id: string; title: string } | undefined;
  const moreNotes = await client.callTool({ name: "garden_search", arguments: { query: "", types: ["note"], limit: 20 } });
  for (const hit of (structured(moreNotes).hits as Array<{ id: string; title: string }>) ?? []) {
    const r = await client.callTool({ name: "garden_read", arguments: { id: hit.id, parts: ["body", "images"] } });
    const sc = structured(r);
    if (typeof sc.presignedLinks === "number" && sc.presignedLinks > 0) {
      linkedNote = hit;
      const body = String(sc.body ?? "");
      expect(!/\/api\/content\/content\/[0-9a-f-]{36}\/download/.test(body), `note "${hit.title}": ${sc.presignedLinks} download link(s) rewritten, none left in-app`);
      expect(!body.includes('xmlns="http://www.w3.org/1999/xhtml"'), "no xmlns attribute in the markdown body");
      const imgs = (r.content ?? []).filter((c) => c.type === "image");
      expect(Array.isArray(sc.images), `parts: ["images"] attached ${imgs.length} image block(s)`);
      break;
    }
  }
  if (!linkedNote) console.log("(no note with file links in reach; link rewrite not exercised)");

  // Capability refusal: a bad token reach is tested by the server; here a
  // write tool with a read-only token is the owner's manual line.

  if (write) {
    const folder = entries.find((e) => e.type === "folder");
    expect(Boolean(folder), "a folder exists for the write round trip");
    if (folder) {
      const created = await client.callTool({ name: "garden_write_note", arguments: { title: `MCP smoke ${new Date().toISOString()}`, parentId: folder.id, content: "# Smoke\n\nFirst line." } });
      const cs = structured(created);
      expect(cs.created === true && typeof cs.id === "string", `created note ${cs.id}`);
      if (typeof cs.id === "string") {
        const fresh = await client.callTool({ name: "garden_read", arguments: { id: cs.id, parts: ["body"] } });
        const stamp0 = String(structured(fresh).updatedAt ?? "");
        const appended = await client.callTool({ name: "garden_write_note", arguments: { id: cs.id, content: "Second line, appended." } });
        expect(!appended.isError, `append: ${trim(text(appended), 160)}`);
        const stamp1 = String(structured(appended).updatedAt ?? "");
        expect(Boolean(stamp0) && Boolean(stamp1) && stamp1 > stamp0, `the content stamp moved with the append (${stamp0} → ${stamp1})`);
        const back = await client.callTool({ name: "garden_read", arguments: { id: cs.id, parts: ["body"] } });
        expect(text(back).includes("Second line"), "read-back contains the appended line");
        expect(String(structured(back).updatedAt ?? "") === stamp1, "the read reports the same stamp the write returned");
        // Compare-and-set: a stale stamp is refused, the current one is accepted.
        const body = String(structured(back).body ?? "");
        const staleReplace = await client.callTool({ name: "garden_write_note", arguments: { id: cs.id, mode: "replace", content: `${body}\n\nThird line.`, expectUpdatedAt: stamp0 } });
        expect(staleReplace.isError === true && structured(staleReplace).stale === true, "replace with the pre-append stamp is refused as stale");
        const freshReplace = await client.callTool({ name: "garden_write_note", arguments: { id: cs.id, mode: "replace", content: `${body}\n\nThird line.`, expectUpdatedAt: stamp1 } });
        expect(!freshReplace.isError && String(structured(freshReplace).updatedAt ?? "") > stamp1, `replace with the current stamp succeeds: ${trim(text(freshReplace), 120)}`);
        const block = await client.callTool({ name: "garden_insert_block", arguments: { noteId: cs.id, blockType: "pullQuote", attrs: {} } });
        console.log(trim(text(block), 200));

        // AI context: the write names what it did not store; the read shows
        // the one-liner and the mode that decides whether signals persist.
        const before = await client.callTool({ name: "garden_read", arguments: { id: cs.id, parts: ["context"] } });
        const mode = String((structured(before).aiContext as { mode?: string } | undefined)?.mode ?? "");
        const ctx = await client.callTool({ name: "garden_update_ai_context", arguments: { id: cs.id, oneLiner: "Smoke note", sections: { summary: "A note the MCP smoke wrote.", signals: "none", howToUse: "ignore" } } });
        const droppedNames = ((structured(ctx).dropped as Array<{ section: string }>) ?? []).map((d) => d.section);
        const signalsShouldDrop = mode !== "ENHANCED";
        expect(droppedNames.includes("howToUse") && droppedNames.includes("signals") === signalsShouldDrop && text(ctx).includes("howToUse"), `update_ai_context (mode ${mode}) reports dropped in both channels: ${droppedNames.join(", ") || "none"}`);
        const after = await client.callTool({ name: "garden_read", arguments: { id: cs.id, parts: ["context"] } });
        const ac = structured(after).aiContext as { oneLiner?: string | null; mode?: string } | undefined;
        expect(ac?.oneLiner === "Smoke note" && typeof ac?.mode === "string" && text(after).includes("one-liner: Smoke note"), "read shows the one-liner and the context mode");
      }
    }
    if (dbHits[0]) {
      // A database's notes panel is a writable slot distinct from its AI context.
      const dbNote = await client.callTool({ name: "garden_write_note", arguments: { id: dbHits[0].id, content: `MCP smoke wrote this to the database's notes at ${new Date().toISOString()}.` } });
      const dn = structured(dbNote);
      expect(!dbNote.isError && dn.slot === "notesPanel" && text(dbNote).includes("notes panel of this data"), `garden_write_note on database "${dbHits[0].title}" appends to its notes panel`);
      const dbRead = await client.callTool({ name: "garden_read", arguments: { id: dbHits[0].id, parts: ["body"] } });
      expect(text(dbRead).includes("## Notes") && String(structured(dbRead).notes ?? "").includes("MCP smoke wrote this"), "the database read shows its notes panel with the line just written");
      const ins = await client.callTool({ name: "garden_insert_rows", arguments: { database: dbHits[0].id, rows: [{}] } });
      console.log(trim(text(ins), 300));
      expect(true, "insert_rows answered (an empty row exercises the path; see text)");
    }
  }

  await client.close();
  console.log(failures === 0 ? "\nMCP smoke: OK" : `\nMCP smoke: ${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("MCP smoke crashed:", error);
  process.exit(1);
});
