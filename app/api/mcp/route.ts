/**
 * The garden's MCP endpoint (MCP-DATABASE-REACH-PLAN §6, MCP-PLAN §3.1).
 *
 * Streamable HTTP, stateless, mounted here; the handler serves both the
 * 2026-07-28 protocol and 2025-era clients from one route. Bearer auth
 * through `withMcpAuth` with ONE verifier (`verifyMcpBearer`): a personal
 * access token from Settings → MCP and an OAuth-issued token (M3) are the
 * same row. `proxy.ts` already passes every `/api/` path through, so no
 * session cookie is involved.
 *
 * Connect: Claude Code — `claude mcp add --transport http garden <origin>/api/mcp --header "Authorization: Bearer dgmcp_…"`.
 */

import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyMcpBearer } from "@/lib/domain/mcp/auth";
import { createGardenMcpServer, SERVER_INFO, SERVER_INSTRUCTIONS } from "@/lib/domain/mcp/server";

const handler = createMcpHandler(createGardenMcpServer, {
  serverInfo: { ...SERVER_INFO },
  instructions: SERVER_INSTRUCTIONS,
  capabilities: { tools: {}, resources: {}, prompts: {} },
});

const authed = withMcpAuth(handler, verifyMcpBearer, { required: true });

export { authed as GET, authed as POST, authed as DELETE };
