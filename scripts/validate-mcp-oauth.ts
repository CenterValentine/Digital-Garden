/**
 * Gate: MCP OAuth discovery resolves end to end (MCP-DATABASE-REACH-PLAN §8.1).
 *
 * THE REGRESSION (2026-11): POST /api/mcp answered 401 advertising
 * `resource_metadata=https://davidvalentine.org/.well-known/oauth-protected-resource`,
 * but no route served that path, so it fell through to the public
 * `app/(public)/[...path]` catch-all and 307'd to `/`. Hosted clients
 * (claude.ai, ChatGPT, `codex mcp login`) could never discover the issuer.
 *
 * Pins, without a database or a server:
 *   A. CHALLENGE — the URL `withMcpAuth` advertises is built from the shared
 *      constant, and the MCP route still requires a bearer through the ONE
 *      verifier (PATs, Codex included, keep working).
 *   B. ROUTING — every path in the discovery chain (the advertised URL, its
 *      RFC 9728 path-suffixed form, the issuer metadata, the authorize page,
 *      token and registration endpoints) resolves to its OWN route file, not
 *      the catch-all. A self-test proves the resolver does see a fall-through.
 *      The proxy passes `/.well-known/oauth-*` through untouched.
 *   C. DOCUMENTS — an anonymous GET of the advertised URL returns 200
 *      application/json with `resource` = <origin>/api/mcp and
 *      `authorization_servers` = [<origin>]; that issuer's RFC 8414 metadata
 *      names itself, S256, public clients, and endpoints that resolve (B).
 *      Forwarded-host requests keep challenge, resource and issuer on one host.
 *   D. POLICY — redirect-URI rules and consent-grant parsing; a malformed
 *      stored grant never widens to "whole garden".
 *   E. ONE TOKEN — an OAuth exchange mints an McpToken through the same
 *      constructor as Settings → MCP, tagged issuedVia "oauth".
 *
 * Live mode walks the same chain over HTTP against a running deployment:
 *   pnpm mcp:oauth:check -- --live https://davidvalentine.org
 *
 * Usage: pnpm mcp:oauth:check
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { withMcpAuth } from "mcp-handler";
import {
  AUTHORIZATION_SERVER_METADATA_PATH,
  AUTHORIZE_DECISION_PATH,
  AUTHORIZE_PATH,
  MCP_RESOURCE_PATH,
  PROTECTED_RESOURCE_METADATA_PATH,
  PROTECTED_RESOURCE_METADATA_SUFFIXED_PATH,
  REGISTRATION_PATH,
  TOKEN_PATH,
} from "../lib/domain/mcp/oauth/discovery";
import {
  authorizationServerMetadataGet,
  protectedResourceMetadataGet,
} from "../lib/domain/mcp/oauth/metadata-routes";
import { grantFromJson, isAllowedRedirectUri, parseConsentGrant } from "../lib/domain/mcp/oauth/policy";

const ROOT = process.cwd();
const APP = resolve(ROOT, "app");
const CATCH_ALL = "app/(public)/[...path]/page.tsx";

let failures = 0;
let passes = 0;
function check(ok: boolean, message: string): void {
  if (ok) {
    passes += 1;
    return;
  }
  failures += 1;
  console.error(`✗ ${message}`);
}
function src(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

// ── App Router resolution (static > dynamic > catch-all; groups transparent) ──

const LEAF_FILES = ["page.tsx", "page.ts", "route.ts", "route.tsx"];

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}
function leaf(dir: string): string | null {
  for (const f of LEAF_FILES) if (existsSync(join(dir, f))) return join(dir, f);
  return null;
}
/** The dir plus every route group under it, recursively — one routing level. */
function level(dir: string): string[] {
  const out = [dir];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (/^\(.+\)$/.test(name) && !name.startsWith("(.") && isDir(p)) out.push(...level(p));
  }
  return out;
}
function children(dirs: string[], test: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const d of dirs) {
    for (const name of readdirSync(d)) {
      if (name.startsWith("_") || name.startsWith("@") || name.endsWith(" 2")) continue;
      const p = join(d, name);
      if (isDir(p) && test(name)) out.push(p);
    }
  }
  return out;
}
function match(dir: string, segs: string[]): string | null {
  const dirs = level(dir);
  if (segs.length === 0) {
    for (const d of dirs) {
      const l = leaf(d);
      if (l) return l;
    }
    for (const c of children(dirs, (n) => /^\[\[\.\.\..+\]\]$/.test(n))) {
      const l = leaf(c);
      if (l) return l;
    }
    return null;
  }
  const [seg, ...rest] = segs;
  for (const c of children(dirs, (n) => n === seg)) {
    const m = match(c, rest);
    if (m) return m;
  }
  for (const c of children(dirs, (n) => /^\[[^.[\]][^\]]*\]$/.test(n))) {
    const m = match(c, rest);
    if (m) return m;
  }
  for (const c of children(dirs, (n) => /^\[\[?\.\.\..+\]\]?$/.test(n))) {
    const l = leaf(c);
    if (l) return l;
  }
  return null;
}
function resolveRoute(pathname: string): string | null {
  const m = match(APP, pathname.split("/").filter(Boolean));
  return m ? relative(ROOT, m) : null;
}

// ── A. the challenge ────────────────────────────────────────────────────

const ORIGIN = "https://davidvalentine.org";

async function advertisedUrl(req: Request): Promise<string | null> {
  const authed = withMcpAuth(async () => new Response("ok"), async () => undefined, {
    required: true,
    resourceMetadataPath: PROTECTED_RESOURCE_METADATA_PATH,
  });
  const res = await authed(req);
  check(res.status === 401, `challenge: anonymous POST /api/mcp → 401 (got ${res.status})`);
  const header = res.headers.get("www-authenticate") ?? "";
  return /resource_metadata="([^"]+)"/.exec(header)?.[1] ?? null;
}

async function main(): Promise<void> {
  const route = src("app/api/mcp/route.ts");
  check(/withMcpAuth\(\s*handler\s*,\s*verifyMcpBearer\s*,/.test(route), "challenge: /api/mcp wraps the handler with withMcpAuth(handler, verifyMcpBearer, …)");
  check(/required:\s*true/.test(route), "challenge: /api/mcp still requires a bearer (required: true)");
  check(/resourceMetadataPath:\s*PROTECTED_RESOURCE_METADATA_PATH/.test(route), "challenge: /api/mcp advertises PROTECTED_RESOURCE_METADATA_PATH (the path the route below serves)");
  check(/validateMcpToken\(/.test(src("lib/domain/mcp/auth.ts")), "challenge: verifyMcpBearer still verifies through validateMcpToken (PATs — Codex, Claude Code — unchanged)");

  const advertised = await advertisedUrl(new Request(`${ORIGIN}${MCP_RESOURCE_PATH}`, { method: "POST" }));
  check(advertised === `${ORIGIN}${PROTECTED_RESOURCE_METADATA_PATH}`, `challenge: resource_metadata is ${ORIGIN}${PROTECTED_RESOURCE_METADATA_PATH} (got ${advertised})`);

  // ── B. routing ─────────────────────────────────────────────────────────

  check(resolveRoute("/.well-known/oauth-not-a-real-document") === CATCH_ALL, `routing self-test: an unserved well-known path DOES resolve to the catch-all (got ${resolveRoute("/.well-known/oauth-not-a-real-document")})`);
  check(resolveRoute("/api/mcp") === "app/api/mcp/route.ts", `routing self-test: /api/mcp → app/api/mcp/route.ts (got ${resolveRoute("/api/mcp")})`);

  const expected: Array<[string, string, string[]]> = [
    [advertised ? new URL(advertised).pathname : PROTECTED_RESOURCE_METADATA_PATH, "app/.well-known/oauth-protected-resource/route.ts", ["GET", "OPTIONS"]],
    [PROTECTED_RESOURCE_METADATA_SUFFIXED_PATH, "app/.well-known/oauth-protected-resource/api/mcp/route.ts", ["GET", "OPTIONS"]],
    [AUTHORIZATION_SERVER_METADATA_PATH, "app/.well-known/oauth-authorization-server/route.ts", ["GET", "OPTIONS"]],
    [AUTHORIZE_PATH, "app/oauth/authorize/page.tsx", []],
    [AUTHORIZE_DECISION_PATH, "app/api/mcp/oauth/authorize/route.ts", ["POST"]],
    [TOKEN_PATH, "app/api/mcp/oauth/token/route.ts", ["POST", "OPTIONS"]],
    [REGISTRATION_PATH, "app/api/mcp/oauth/register/route.ts", ["POST", "OPTIONS"]],
  ];
  for (const [path, file, methods] of expected) {
    const got = resolveRoute(path);
    check(got !== CATCH_ALL, `routing: ${path} does NOT fall through to the /[...path] catch-all`);
    check(got === file, `routing: ${path} → ${file} (got ${got})`);
    if (got === file) {
      const body = src(file);
      for (const m of methods) {
        check(new RegExp(`\\b(as ${m}\\b|function ${m}\\b|const ${m}\\b)`).test(body), `routing: ${file} exports ${m}`);
      }
    }
  }
  check(/pathname\.startsWith\("\/\.well-known\/oauth-"\)/.test(src("proxy.ts")), "routing: proxy.ts passes /.well-known/oauth-* through untouched");

  // ── C. documents ───────────────────────────────────────────────────────

  async function readJson(res: Response, label: string): Promise<Record<string, unknown>> {
    check(res.status === 200, `${label}: 200 (got ${res.status})`);
    check((res.headers.get("content-type") ?? "").startsWith("application/json"), `${label}: application/json (got ${res.headers.get("content-type")})`);
    check(res.headers.get("access-control-allow-origin") === "*", `${label}: CORS open for browser clients`);
    return (await res.json()) as Record<string, unknown>;
  }

  const prm = await readJson(protectedResourceMetadataGet(new Request(`${ORIGIN}${PROTECTED_RESOURCE_METADATA_PATH}`)), "protected-resource metadata");
  check(prm.resource === `${ORIGIN}${MCP_RESOURCE_PATH}`, `protected-resource metadata: resource = ${ORIGIN}${MCP_RESOURCE_PATH} (got ${String(prm.resource)})`);
  const servers = prm.authorization_servers as unknown;
  check(Array.isArray(servers) && servers.length === 1 && servers[0] === ORIGIN, `protected-resource metadata: authorization_servers = ["${ORIGIN}"] (got ${JSON.stringify(servers)})`);
  const suffixed = await readJson(protectedResourceMetadataGet(new Request(`${ORIGIN}${PROTECTED_RESOURCE_METADATA_SUFFIXED_PATH}`)), "protected-resource metadata (suffixed)");
  check(JSON.stringify(suffixed) === JSON.stringify(prm), "protected-resource metadata: the suffixed form serves the same document");

  const issuer = Array.isArray(servers) ? String(servers[0]) : ORIGIN;
  const asm = await readJson(authorizationServerMetadataGet(new Request(`${issuer}${AUTHORIZATION_SERVER_METADATA_PATH}`)), "authorization-server metadata");
  check(asm.issuer === issuer, `authorization-server metadata: issuer equals the listed authorization server (RFC 8414 §3.3) (got ${String(asm.issuer)})`);
  for (const [key, path] of [["authorization_endpoint", AUTHORIZE_PATH], ["token_endpoint", TOKEN_PATH], ["registration_endpoint", REGISTRATION_PATH]] as const) {
    check(asm[key] === `${issuer}${path}`, `authorization-server metadata: ${key} = ${issuer}${path} (got ${String(asm[key])})`);
  }
  check(JSON.stringify(asm.code_challenge_methods_supported) === '["S256"]', "authorization-server metadata: PKCE S256 only");
  check(JSON.stringify(asm.response_types_supported) === '["code"]', "authorization-server metadata: response_type code");
  check(JSON.stringify(asm.token_endpoint_auth_methods_supported) === '["none"]', "authorization-server metadata: public clients (auth method none)");

  // Behind a proxy: the challenge, the resource and the issuer stay on the public host.
  const fwd = { "x-forwarded-host": "davidvalentine.org", "x-forwarded-proto": "https" };
  const fwdAdvertised = await advertisedUrl(new Request("http://10.0.0.7:3000/api/mcp", { method: "POST", headers: fwd }));
  const fwdPrm = (await protectedResourceMetadataGet(new Request(`http://10.0.0.7:3000${PROTECTED_RESOURCE_METADATA_PATH}`, { headers: fwd })).json()) as Record<string, unknown>;
  check(fwdAdvertised === `${ORIGIN}${PROTECTED_RESOURCE_METADATA_PATH}`, `forwarded host: challenge names the public host (got ${fwdAdvertised})`);
  check(fwdPrm.resource === `${ORIGIN}${MCP_RESOURCE_PATH}` && JSON.stringify(fwdPrm.authorization_servers) === JSON.stringify([ORIGIN]), `forwarded host: resource and issuer name the public host (got ${JSON.stringify(fwdPrm)})`);

  // ── D. policy ──────────────────────────────────────────────────────────

  for (const ok of ["https://claude.ai/api/mcp/auth_callback", "https://chatgpt.com/connector_platform_oauth_redirect", "http://localhost:33418/callback", "http://127.0.0.1:5173/cb", "cursor.anysphere://oauth/callback"]) {
    check(isAllowedRedirectUri(ok), `policy: redirect URI allowed — ${ok}`);
  }
  for (const bad of ["http://evil.example/cb", "javascript:alert(1)", "data:text/html,hi", "https://claude.ai/cb#frag", "https://user:pw@claude.ai/cb", "myapp://cb", "", 42]) {
    check(!isAllowedRedirectUri(bad), `policy: redirect URI refused — ${String(bad)}`);
  }
  const g = parseConsentGrant({ capabilities: ["garden:write-rows"], rootIds: ["a", "a"], allChats: true, expiresInDays: "30" });
  check(g.ok && JSON.stringify(g.grant?.capabilities) === '["garden:read","garden:write-rows"]' && g.grant?.rootIds.length === 1 && g.grant?.expiresInDays === 30, "policy: consent grant parses (read always on, roots deduped, days numeric)");
  check(parseConsentGrant({ capabilities: ["garden:root"] }).ok === false, "policy: an unknown capability is refused by name");
  check(parseConsentGrant({ expiresInDays: "-1" }).ok === false, "policy: a negative expiry is refused");
  check(parseConsentGrant({ expiresInDays: "" }).grant?.expiresInDays === null, "policy: blank expiry = never");
  check(grantFromJson(null) === null && grantFromJson({}) === null && grantFromJson({ capabilities: ["x"], rootIds: [] }) === null, "policy: a malformed stored grant is null, never a default (empty roots = whole garden)");

  // ── E. one token ───────────────────────────────────────────────────────

  const server = src("lib/domain/mcp/oauth/server.ts");
  check(/createMcpTokenRecord\(/.test(server) && /issuedVia:\s*"oauth"/.test(server), "one token: the exchange mints through createMcpTokenRecord with issuedVia \"oauth\"");
  check(/requirePKCE:\s*true/.test(server), "one token: the issuer requires PKCE");
  check(!/refreshToken:\s*token\.refreshToken/.test(server), "one token: no refresh token is returned");
  check(/count === 1/.test(server), "one token: authorization codes are single-use (the delete is the claim)");
  check(/getSession\(\)/.test(src("app/api/mcp/oauth/authorize/route.ts")) && /callerOrigin !== origin/.test(src("app/api/mcp/oauth/authorize/route.ts")), "one token: consent requires a session and a same-origin caller");

  // ── live ───────────────────────────────────────────────────────────────

  const liveIdx = process.argv.indexOf("--live");
  if (liveIdx !== -1) await live(process.argv[liveIdx + 1] ?? "");

  if (failures > 0) {
    console.error(`\nmcp:oauth:check — ${failures} failure(s), ${passes} passed`);
    process.exit(1);
  }
  console.log(`mcp:oauth:check — OK (${passes} checks${liveIdx !== -1 ? ", live included" : ""})`);
}

/** The same chain over HTTP. Never follows redirects: a 307 IS the bug. */
async function live(base: string): Promise<void> {
  if (!/^https?:\/\//.test(base)) {
    check(false, "live: pass a base URL, e.g. --live https://davidvalentine.org");
    return;
  }
  const origin = base.replace(/\/+$/, "");
  const get = (url: string, init: RequestInit = {}) => fetch(url, { redirect: "manual", ...init });

  const challenge = await get(`${origin}${MCP_RESOURCE_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
  check(challenge.status === 401, `live: anonymous POST /api/mcp → 401 (got ${challenge.status})`);
  const url = /resource_metadata="([^"]+)"/.exec(challenge.headers.get("www-authenticate") ?? "")?.[1];
  check(Boolean(url), "live: the 401 advertises resource_metadata");
  if (!url) return;

  const prmRes = await get(url);
  const matched = prmRes.headers.get("x-matched-path");
  check(prmRes.status === 200, `live: GET ${url} → 200 (got ${prmRes.status}${prmRes.headers.get("location") ? ` → ${prmRes.headers.get("location")}` : ""})`);
  check(matched !== "/[...path]", `live: ${url} is not served by the /[...path] catch-all (x-matched-path: ${matched})`);
  check((prmRes.headers.get("content-type") ?? "").startsWith("application/json"), `live: ${url} is application/json`);
  if (prmRes.status !== 200) return;
  const prm = (await prmRes.json()) as { resource?: string; authorization_servers?: string[] };
  check(prm.resource === `${origin}${MCP_RESOURCE_PATH}`, `live: resource = ${origin}${MCP_RESOURCE_PATH} (got ${prm.resource})`);
  const issuer = prm.authorization_servers?.[0];
  check(Boolean(issuer), "live: authorization_servers lists an issuer");
  if (!issuer) return;

  const asRes = await get(`${issuer.replace(/\/+$/, "")}${AUTHORIZATION_SERVER_METADATA_PATH}`);
  check(asRes.status === 200, `live: issuer metadata → 200 (got ${asRes.status})`);
  if (asRes.status !== 200) return;
  const asm = (await asRes.json()) as Record<string, string>;
  check(asm.issuer === issuer, `live: issuer metadata names itself (got ${asm.issuer})`);

  // The endpoints are reachable and answer as OAuth endpoints, not the catch-all.
  const authz = await get(`${asm.authorization_endpoint}?client_id=dgmcpc_gate_probe&response_type=code`);
  check(authz.status === 200 && authz.headers.get("x-matched-path") !== "/[...path]", `live: authorization_endpoint renders (got ${authz.status}, x-matched-path ${authz.headers.get("x-matched-path")})`);
  const tok = await get(asm.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=authorization_code&code=gate-probe&client_id=dgmcpc_gate_probe&code_verifier=" + "a".repeat(43) + "&redirect_uri=http://localhost/cb",
  });
  const tokBody = (await tok.json().catch(() => ({}))) as { error?: string };
  check(tok.status >= 400 && tok.status < 500 && typeof tokBody.error === "string", `live: token_endpoint answers an OAuth error for a bogus code (got ${tok.status} ${tokBody.error})`);
  const reg = await get(asm.registration_endpoint, { method: "OPTIONS" });
  check(reg.status === 204 || reg.status === 200, `live: registration_endpoint answers CORS preflight (got ${reg.status})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
