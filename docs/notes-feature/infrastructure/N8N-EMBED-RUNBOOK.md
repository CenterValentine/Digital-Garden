# n8n Same-Origin Embed Runbook (Trellis Plan 3 · Option B)

**Goal:** show n8n's own editor **inside the Digital Garden app** (iframe), and
kill the second login. Today the "n8n Flow" viewer deep-links out to
`n8n.davidvalentine.org` (a new tab + a Cloudflare Access prompt). This runbook
replaces that with an in-app iframe.

**Status:** planned. Prereq done — `notetrellis.com` is now on Cloudflare
(orange-cloud proxied → Vercel; verified `200`, no redirect loop).

---

## Why an iframe is blocked today (the two forces)

1. **Framing headers.** n8n sends `X-Frame-Options: SAMEORIGIN` → only n8n's own
   origin may frame it.
2. **Auth boundary.** n8n sits on a *different site* (`davidvalentine.org`)
   behind *its own* Cloudflare Access. A cross-site iframe (a) can't send n8n's
   cookies (third-party-cookie blocking) and (b) gets redirected to a CF Access
   login page that itself can't be framed.

The fix is to move n8n onto the **app's own registrable domain**
(`notetrellis.com`) and relax the framing header. That makes the iframe
**same-site**, so cookies flow and framing is allowed.

> **Origin vs site:** `n8n.notetrellis.com` is a *different origin* from
> `notetrellis.com` but the *same site* (same registrable domain). Same-site is
> enough to defuse third-party-cookie blocking; framing still needs an explicit
> `frame-ancestors` allow (step 3).

---

## Stage 1 — In-app embed with a single (n8n) login  ← do this first

Outcome: n8n's editor renders in the DG viewer; you log into **n8n once** (its
own login), and the session persists (first-party cookie). The Cloudflare Access
*second* prompt is gone.

**Tradeoff (accept knowingly):** this removes Cloudflare Access from n8n. n8n is
then protected by *its own* login only (as most self-hosted n8n runs). Fine for
personal/invite use; it's less defense-in-depth than CF Access. True zero-login
(DG session → n8n SSO) is Stage 2.

### 1. Give n8n a hostname on the app's domain (tunnel)
Cloudflare Zero Trust → Networks → Tunnels → **`home-coolify`** → Public
Hostname → **Add**:
- Subdomain `n8n`, domain **`notetrellis.com`**, path empty
- Service **`http://localhost:5678`**

(Same tunnel, same Cloudflare account — `notetrellis.com` lives there now.)
Leave the old `n8n.davidvalentine.org` route in place during transition.

### 2. Do NOT put Cloudflare Access on `n8n.notetrellis.com`
Access → Applications: ensure there is **no** self-hosted app covering
`n8n.notetrellis.com`. (If Access intercepts, the iframe hits the un-frameable
CF login page.)

### 3. Allow the app to frame n8n (strip `X-Frame-Options`, set `frame-ancestors`)
Cloudflare (notetrellis.com zone) → Rules → **Transform Rules** → **Modify
Response Header** → Create:
- **When incoming requests match:** `Hostname equals n8n.notetrellis.com`
- **Remove** header: `X-Frame-Options`
- **Set** header `Content-Security-Policy` to:
  `frame-ancestors 'self' https://notetrellis.com https://www.notetrellis.com`

(Cloudflare rewrites n8n's response at the edge; no n8n code change.)

### 4. Point n8n at its new canonical host (Coolify → n8n → Environment Variables)
```
N8N_HOST=n8n.notetrellis.com
N8N_EDITOR_BASE_URL=https://n8n.notetrellis.com/
WEBHOOK_URL=https://n8n.notetrellis.com/
```
Redeploy the n8n service. (These override the sslip magic var; also make
webhook/resume URLs correct — which the Trellis adapter depends on.)

### 5. Point the DG app at the new host
In `.env.local` (dev) and Vercel (prod):
```
N8N_BASE_URL=https://n8n.notetrellis.com
```
CF_ACCESS_CLIENT_ID / SECRET are now unused for n8n (no Access on this host) —
harmless to leave; the client only sends them if set.

### 6. Swap the viewer's deep-link for an iframe (app code — small)
`extensions/workflows/components/N8nFlowView.tsx`: replace the "Open in n8n
editor" `<a>` with an `<iframe src={editorUrl}>` (keep the deep-link as a
"pop out" fallback). `editorUrl` already comes from the GET graph route
(`${n8nBaseUrl()}/workflow/<id>`), so once `N8N_BASE_URL` is the new host it's
automatically `n8n.notetrellis.com`. I'll make this change + gate it.

### 7. Test + the two likely footguns
Open an n8n Flow's viewer:
- **If the iframe is blank / "refused to connect"** → step 3 header transform
  isn't matching. Verify: `curl -sI https://n8n.notetrellis.com/ | grep -i
  x-frame` should show it **removed** and a `content-security-policy:
  frame-ancestors ...` present.
- **If it loads n8n's login but the login won't "stick" in the iframe** → n8n's
  session cookie is `SameSite=Lax`, which browsers don't send to a cross-origin
  (same-site) iframe. Fix options, in order of preference:
  1. n8n cookie config env (check the installed n8n version's docs for a
     SameSite/secure-cookie setting).
  2. A Cloudflare **Snippet/Worker** on `n8n.notetrellis.com` that rewrites
     `Set-Cookie` to add `SameSite=None; Secure`.
  If neither is quick → fall back to **Stage 1b** (true same-origin) below,
  which sidesteps cookies entirely.

---

## Stage 1b — True same-origin path (fallback if cookies fight the iframe)

Serve n8n under `notetrellis.com/n8n/*` (same *origin*, not just same site) so
there are **zero** cookie/frame issues. More infra:

1. n8n subpath: Coolify env `N8N_PATH=/n8n/` (+ the host envs from step 4 using
   `notetrellis.com`). n8n then serves the editor + assets under `/n8n/`.
2. Cloudflare **Worker** on route `notetrellis.com/n8n/*` that reverse-proxies to
   the tunnel origin for n8n (strip nothing — n8n owns `/n8n/`). The app domain's
   `/*` still flows to Vercel.
   - The Worker needs a network path to the box: either fetch a dedicated
     tunnel hostname (`n8n-origin.notetrellis.com`, no Access) or bind the tunnel
     route into the Worker. (This is the fiddly part — websockets must pass, so
     the Worker must forward `Upgrade`/`Connection` headers.)
3. Viewer iframe `src="/n8n/workflow/<id>"` (relative → same origin).

Prefer Stage 1 (subdomain) first; only take 1b if the SameSite cookie can't be
resolved simply.

---

## Stage 2 — Zero-login (DG session → n8n SSO)  ← later

Even same-site, n8n still has *its own* login. To make a DG-authenticated user
land in n8n with no n8n login:
- **Option i:** n8n external auth. n8n's SSO (SAML/OIDC) is an Enterprise/paid
  feature; not available on the community build. ✗ for now.
- **Option ii:** an **auth-injecting reverse proxy** in front of n8n: it verifies
  the DG session (shared cookie/JWT on `.notetrellis.com`) and injects an n8n
  session or forwards as a fixed n8n user. This is real custom infra — a small
  proxy service (could live on the box) that owns n8n's login handshake. Deferred
  until the embed itself is proven valuable.

Until Stage 2, "one n8n login that persists" (Stage 1) is the target.

---

## Rollback
- Remove the `n8n.notetrellis.com` tunnel route + Transform Rule.
- Revert n8n `N8N_HOST` envs to `n8n.davidvalentine.org` (+ re-add CF Access).
- Revert `N8N_BASE_URL` and the viewer iframe → deep-link.

## What I (the app side) own vs what you (infra) own
- **Me:** the viewer iframe swap (step 6), `N8N_BASE_URL` handling, any Worker
  code (Stage 1b), and I can `ssh homeserver` to verify n8n headers/config.
- **You:** Cloudflare UI (tunnel route, Transform Rule, Access removal), Coolify
  env changes, the SameSite decision if it surfaces.
