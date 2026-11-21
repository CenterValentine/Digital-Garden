/**
 * End-to-end smoke of the garden's OAuth issuer, the way a hosted MCP client
 * walks it: discover → register → consent → code → token → MCP calls.
 *
 *   GARDEN_URL=http://localhost:3019 GARDEN_SESSION_TOKEN=<session_token cookie> pnpm mcp:oauth:smoke
 *
 * The session token stands in for the owner clicking Approve (it is the
 * signed-in browser). Also proves the bearer path is unchanged: a personal
 * access token minted on Settings → MCP (what Codex and Claude Code send)
 * still connects. Both tokens are revoked at the end.
 */

import crypto from "node:crypto";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const base = (process.env.GARDEN_URL ?? "http://localhost:3015").replace(/\/+$/, "");
const session = process.env.GARDEN_SESSION_TOKEN;
const REDIRECT = "http://localhost:33418/callback";

let failures = 0;
function expect(ok: boolean, message: string): void {
  console.log(`${ok ? "✓" : "✗"} ${message}`);
  if (!ok) failures += 1;
}
const b64url = (b: Buffer) => b.toString("base64url");

async function mcpToolCount(token: string): Promise<number> {
  const client = new Client({ name: "garden-oauth-smoke", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/api/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  const tools = await client.listTools();
  await client.close();
  return tools.tools.length;
}

async function main() {
  if (!session) {
    console.error("GARDEN_SESSION_TOKEN is required (a session_token cookie for the approving owner)");
    process.exit(2);
  }
  const cookie = `session_token=${session}`;

  // 1. Discover.
  const challenge = await fetch(`${base}/api/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const prmUrl = /resource_metadata="([^"]+)"/.exec(challenge.headers.get("www-authenticate") ?? "")?.[1];
  expect(challenge.status === 401 && Boolean(prmUrl), `401 advertises ${prmUrl}`);
  const prm = (await (await fetch(prmUrl!, { redirect: "manual" })).json()) as { resource: string; authorization_servers: string[] };
  const asm = (await (await fetch(`${prm.authorization_servers[0]}/.well-known/oauth-authorization-server`)).json()) as Record<string, string>;
  expect(Boolean(asm.registration_endpoint && asm.token_endpoint && asm.authorization_endpoint), "issuer metadata lists registration, authorization and token endpoints");

  // 2. Register (RFC 7591).
  const bad = await fetch(asm.registration_endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "evil", redirect_uris: ["http://evil.example/cb"] }) });
  expect(bad.status === 400, `registration refuses a non-loopback http redirect (got ${bad.status})`);
  const reg = await fetch(asm.registration_endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "OAuth smoke", redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_post" }) });
  const client = (await reg.json()) as { client_id: string; token_endpoint_auth_method: string };
  expect(reg.status === 201 && client.client_id?.startsWith("dgmcpc_") && client.token_endpoint_auth_method === "none", `registered ${client.client_id} as a public client`);

  // 3. Authorize request.
  const verifier = b64url(crypto.randomBytes(32));
  const challengeS256 = b64url(crypto.createHash("sha256").update(verifier).digest());
  const params: Record<string, string> = {
    client_id: client.client_id,
    redirect_uri: REDIRECT,
    response_type: "code",
    code_challenge: challengeS256,
    code_challenge_method: "S256",
    state: "smoke-state",
    scope: "garden:read garden:write-rows",
    resource: prm.resource,
  };
  const authorizeUrl = `${asm.authorization_endpoint}?${new URLSearchParams(params)}`;
  const anon = await fetch(authorizeUrl, { redirect: "manual" });
  const loc = anon.headers.get("location") ?? "";
  expect(anon.status >= 300 && anon.status < 400 && loc.includes("/sign-in?redirect=") && decodeURIComponent(loc).includes(client.client_id), `signed-out authorize → sign-in, keeping the query (${anon.status})`);
  const page = await fetch(authorizeUrl, { redirect: "manual", headers: { cookie } });
  const html = await page.text();
  expect(page.status === 200 && html.includes("OAuth smoke"), `signed-in authorize renders the consent screen (${page.status})`);
  const unknownRedirect = await fetch(`${asm.authorization_endpoint}?${new URLSearchParams({ ...params, redirect_uri: "http://localhost:1/other" })}`, { redirect: "manual", headers: { cookie } });
  expect(unknownRedirect.status === 200 && !unknownRedirect.headers.get("location"), "an unregistered redirect_uri is shown as an error, never followed");

  const decide = (decision: string, grant: Record<string, unknown>, origin = base) =>
    fetch(`${base}/api/mcp/oauth/authorize`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie, origin },
      body: JSON.stringify({ params, decision, grant }),
    });

  // 4. Consent: cross-origin refused, deny → access_denied, allow → code.
  expect((await decide("allow", {}, "https://evil.example")).status === 403, "consent from another origin is refused");
  const denied = (await (await decide("deny", {})).json()) as { data: { redirectUrl: string } };
  expect(new URL(denied.data.redirectUrl).searchParams.get("error") === "access_denied", "deny → redirect with error=access_denied");
  const approve = async (): Promise<string | null> => {
    const allowRes = await decide("allow", { capabilities: ["garden:read"], rootIds: [], allChats: false, expiresInDays: "1" });
    const allowed = (await allowRes.json()) as { data?: { redirectUrl: string } };
    const back = new URL(allowed.data?.redirectUrl ?? "http://x/");
    const c = back.searchParams.get("code");
    expect(allowRes.status === 200 && back.origin + back.pathname === REDIRECT && Boolean(c) && back.searchParams.get("state") === "smoke-state", "approve → redirect to the client with code and state");
    return c;
  };

  // 5. Token exchange.
  const exchange = (code: string | null, verifierValue: string) =>
    fetch(asm.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code: code ?? "", client_id: client.client_id, redirect_uri: REDIRECT, code_verifier: verifierValue }).toString(),
    });
  // A failed PKCE attempt CONSUMES the code (the library revokes before it
  // verifies), so a stolen code can't be brute-forced against the verifier.
  const attacked = await approve();
  const wrong = await exchange(attacked, b64url(crypto.randomBytes(32)));
  expect(wrong.status === 400 && ((await wrong.json()) as { error: string }).error === "invalid_grant", "a wrong PKCE verifier → invalid_grant");
  expect((await exchange(attacked, verifier)).status === 400, "…and that code is burned: the right verifier afterwards is refused too");

  const code = await approve();
  const ok = await exchange(code, verifier);
  const tok = (await ok.json()) as { access_token?: string; token_type?: string; expires_in?: number; scope?: string; refresh_token?: string };
  expect(ok.status === 200 && Boolean(tok.access_token?.startsWith("dgmcp_")) && tok.token_type === "Bearer", `token exchange → Bearer ${tok.access_token?.slice(0, 12)}…`);
  expect(tok.scope === "garden:read", `the token carries the CONSENTED scope, not the requested one (got ${tok.scope})`);
  expect(typeof tok.expires_in === "number" && tok.expires_in > 86_000 && tok.expires_in <= 86_400, `expires_in follows the consent expiry (got ${tok.expires_in})`);
  expect(!tok.refresh_token, "no refresh token");
  const replay = await exchange(code, verifier);
  expect(replay.status === 400, `a replayed code is refused (got ${replay.status})`);

  // 6. The OAuth token works on /api/mcp — and so does a PAT, unchanged.
  const oauthTools = await mcpToolCount(tok.access_token!);
  expect(oauthTools > 0, `OAuth token: MCP tools/list → ${oauthTools} tools`);
  const pat = await fetch(`${base}/api/mcp/tokens`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ name: "OAuth smoke PAT" }) });
  const patJson = (await pat.json()) as { data: { token: string; record: { id: string } } };
  const patTools = await mcpToolCount(patJson.data.token);
  expect(patTools === oauthTools, `PAT (Codex / Claude Code path): tools/list → ${patTools} tools`);

  // 7. Both tokens are rows on Settings → MCP; revoke them.
  const list = (await (await fetch(`${base}/api/mcp/tokens`, { headers: { cookie } })).json()) as { data: { tokens: Array<{ id: string; name: string; issuedVia: string; tokenPrefix: string }> } };
  const oauthRow = list.data.tokens.find((t) => t.issuedVia === "oauth" && tok.access_token!.startsWith(t.tokenPrefix));
  expect(Boolean(oauthRow) && oauthRow!.name === "OAuth smoke (OAuth)", `the OAuth token is listed on Settings → MCP as "${oauthRow?.name}" (issuedVia oauth)`);
  for (const id of [oauthRow?.id, patJson.data.record.id]) {
    if (id) await fetch(`${base}/api/mcp/tokens/${id}`, { method: "DELETE", headers: { cookie } });
  }
  const after = await fetch(`${base}/api/mcp`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok.access_token}` }, body: "{}" });
  expect(after.status === 401, `a revoked OAuth token → 401 (got ${after.status})`);

  if (failures > 0) {
    console.error(`\nmcp:oauth:smoke — ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("\nmcp:oauth:smoke — OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
