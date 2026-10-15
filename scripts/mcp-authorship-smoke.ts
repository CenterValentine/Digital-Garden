/**
 * mcp:authorship:smoke — MCP-drafted content, end to end over real MCP HTTP.
 *
 * Drives garden_write_note / garden_create_folder / garden_delete_content
 * through a real MCP client against a running dev server, with setup and
 * cleanup straight in the LOCAL dev database, and checks:
 *
 *   - an MCP-created note/folder is stamped draftedBy "mcp" + the token's id;
 *   - the MCP may rewrite its own note to almost nothing (shrink guard
 *     lifted), but a user-written note stays guarded and untouched;
 *   - garden_delete_content refuses the user's note, refuses an MCP folder
 *     holding a user note (naming it), trashes its own note with a TrashBin
 *     row (restorable), and refuses an already-trashed item.
 *
 *   GARDEN_MCP_URL=http://localhost:3017/api/mcp GARDEN_MCP_TOKEN=dgmcp_… \
 *     npx tsx --env-file=.env.local scripts/mcp-authorship-smoke.ts
 *
 * (A direct-call script cannot load the MCP note tools: they reach the
 * server editor extensions, which do not load under tsx.) The token needs
 * garden:write-files + garden:delete-content (scripts/mcp-mint-smoke-token.ts).
 * Everything created lives under one throwaway folder, hard-deleted at the
 * end. Refuses a non-localhost database.
 */

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { prisma } from "@/lib/database/client";

const failures: string[] = [];
function check(condition: boolean, label: string, detail?: unknown): void {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${!condition && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ""}`);
  if (!condition) failures.push(label);
}

type ToolResult = { isError?: boolean; content?: Array<{ type: string; text?: string }>; structuredContent?: Record<string, unknown> };
const text = (r: ToolResult) => (r.content ?? []).map((c) => c.text ?? "").join(" ");
const data = (r: ToolResult) => r.structuredContent ?? {};

async function main(): Promise<number> {
  const url = process.env.GARDEN_MCP_URL ?? "http://localhost:3017/api/mcp";
  const token = process.env.GARDEN_MCP_TOKEN ?? "";
  if (!token) {
    console.error("GARDEN_MCP_TOKEN is required");
    return 2;
  }
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "")) {
    console.error("Refusing: DATABASE_URL is not a localhost database. This smoke writes and deletes rows.");
    return 2;
  }
  const record = await prisma.mcpToken.findFirst({
    where: { tokenPrefix: token.slice(0, 12), revokedAt: null },
    select: { id: true, userId: true, name: true },
  });
  if (!record) {
    console.error("The token is not in the local database.");
    return 2;
  }
  const userId = record.userId;

  // Throwaway root (user-drafted) and a long user-written note, via Prisma.
  const stamp = Date.now();
  const root = await prisma.contentNode.create({
    data: { ownerId: userId, title: `MCP authorship smoke ${stamp}`, slug: `mcp-authorship-smoke-${stamp}`, contentType: "folder", parentId: null },
    select: { id: true },
  });
  const created: string[] = [root.id];
  const longText = "The user wrote this paragraph by hand. ".repeat(30).trim();
  const userNote = await prisma.contentNode.create({
    data: {
      ownerId: userId,
      title: "User note",
      slug: `user-note-${stamp}`,
      contentType: "note",
      parentId: root.id,
      notePayload: {
        create: {
          tiptapJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: longText }] }] },
          searchText: longText,
          metadata: {},
        },
      },
    },
    select: { id: true },
  });
  created.push(userNote.id);

  const client = new Client({ name: "authorship-smoke", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const call = async (name: string, args: Record<string, unknown>) =>
    (await client.callTool({ name, arguments: args })) as ToolResult;
  const stampOf = async (id: string) => {
    const n = await prisma.contentNode.findUnique({ where: { id }, select: { updatedAt: true, notePayload: { select: { updatedAt: true } } } });
    return new Date(Math.max(n?.updatedAt?.getTime() ?? 0, n?.notePayload?.updatedAt?.getTime() ?? 0)).toISOString();
  };

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    check(tools.tools.some((t) => t.name === "garden_delete_content"), "the server exposes garden_delete_content");

    console.log("stamping");
    const mcpNote = await call("garden_write_note", { title: "MCP note", parentId: root.id, content: "MCP draft. ".repeat(80) });
    const mcpNoteId = data(mcpNote).id as string;
    if (mcpNoteId) created.push(mcpNoteId);
    const stamped = await prisma.contentNode.findUnique({ where: { id: mcpNoteId }, select: { draftedBy: true, draftedByRef: true, draftedAt: true } });
    check(stamped?.draftedBy === "mcp" && stamped.draftedByRef === record.id && !!stamped.draftedAt, "an MCP-created note is stamped mcp + this token's id", stamped);
    const userRow = await prisma.contentNode.findUnique({ where: { id: userNote.id }, select: { draftedBy: true } });
    check(userRow?.draftedBy === null, "the user-written note is unstamped", userRow);

    console.log("rewrites");
    const shrinkOwn = await call("garden_write_note", { id: mcpNoteId, mode: "replace", content: "tiny", expectUpdatedAt: await stampOf(mcpNoteId) });
    check(!shrinkOwn.isError, "the MCP may rewrite its OWN note down to almost nothing", text(shrinkOwn));
    const shrinkUser = await call("garden_write_note", { id: userNote.id, mode: "replace", content: "tiny", expectUpdatedAt: await stampOf(userNote.id) });
    check(!!shrinkUser.isError && data(shrinkUser).refusedBy === "shrink-guard", "…but a user-written note is still guarded", text(shrinkUser));
    const userAfter = await prisma.notePayload.findUnique({ where: { contentId: userNote.id }, select: { searchText: true } });
    check((userAfter?.searchText.length ?? 0) >= longText.length - 5, "the user's note is untouched by the refused rewrite", userAfter?.searchText.length);

    console.log("deletes");
    const delUser = await call("garden_delete_content", { id: userNote.id, reason: "smoke" });
    check(!!delUser.isError && /not drafted by the MCP/.test(text(delUser)), "the user's note is refused by name", text(delUser));
    const folder = await call("garden_create_folder", { parentId: root.id, title: "MCP folder" });
    const mcpFolderId = data(folder).id as string;
    if (mcpFolderId) created.push(mcpFolderId);
    const folderRow = await prisma.contentNode.findUnique({ where: { id: mcpFolderId }, select: { draftedBy: true } });
    check(folderRow?.draftedBy === "mcp", "an MCP-created folder is stamped", folderRow);
    const inside = await prisma.contentNode.create({
      data: {
        ownerId: userId,
        title: "User note inside",
        slug: `inside-${stamp}`,
        contentType: "note",
        parentId: mcpFolderId,
        notePayload: { create: { tiptapJson: { type: "doc", content: [] }, searchText: "", metadata: {} } },
      },
      select: { id: true },
    });
    created.push(inside.id);
    const delMixed = await call("garden_delete_content", { id: mcpFolderId, reason: "smoke" });
    check(!!delMixed.isError && /User note inside/.test(text(delMixed)), "an MCP folder holding the user's note is refused, naming it", text(delMixed));
    const delOwn = await call("garden_delete_content", { id: mcpNoteId, reason: "smoke: remove my draft" });
    check(!delOwn.isError && data(delOwn).trashed === true, "the MCP trashes its own note", text(delOwn));
    const trashed = await prisma.contentNode.findUnique({ where: { id: mcpNoteId }, select: { deletedAt: true } });
    const bin = await prisma.trashBin.findUnique({ where: { contentId: mcpNoteId }, select: { scheduledDeletion: true } });
    check(!!trashed?.deletedAt && !!bin, "…soft-deleted with a TrashBin row (restorable for 30 days)", { trashed, bin });
    const again = await call("garden_delete_content", { id: mcpNoteId, reason: "smoke" });
    check(!!again.isError, "an already-trashed item is refused, not deleted twice", text(again));
  } finally {
    await client.close().catch(() => null);
    const ids = [...created].reverse().filter(Boolean);
    await prisma.trashBin.deleteMany({ where: { contentId: { in: ids } } });
    for (const id of ids) await prisma.contentNode.deleteMany({ where: { id } });
    await prisma.activityEvent.deleteMany({ where: { actorLabel: `MCP token "${record.name}"` } }).catch(() => null);
    await prisma.$disconnect();
  }

  console.log();
  if (failures.length) {
    console.log(`${failures.length} failure(s):\n  ${failures.join("\n  ")}`);
    return 1;
  }
  console.log("mcp:authorship:smoke — all checks passed");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
