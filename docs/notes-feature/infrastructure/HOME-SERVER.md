# Home Server — Coolify Runbook

**Last updated:** 2026-07-15
**Purpose:** Self-hosted home server for Digital Garden's companion services — first tenant is **n8n** (Trellis Plan 3 execution spoke). Documents the box, networking, running services, hard-won gotchas, and planned moves. Read this before touching the box or debugging why a service is unreachable.

---

## The box

| | |
|---|---|
| Hostname | `chrome-x-debian` |
| Hardware | Repurposed i7 Chromebook |
| OS | Debian 13 |
| Disk | 400 GB |
| RAM | **TBD** — fill in (`free -h`); constrains how many always-on services fit |
| Public IP | `96.60.13.195` (home connection) |
| Inbound ports | **None open.** No port forwarding. All ingress is via the Cloudflare Tunnel only. |

## Platform: Coolify

- **Coolify 4.1.2** (`coollabsio/coolify`) — the PaaS layer. Dashboard container publishes `0.0.0.0:8000->8080`.
- Supporting containers: `coolify-db` (postgres:15), `coolify-redis` (redis:7), `coolify-realtime` (soketi, `6001-6002`), `coolify-sentinel`, and **`coolify-proxy`** (Traefik v3.6) on `0.0.0.0:80/443/8080`.
- **Key behavior:** Coolify *Services* (docker-compose templates) do **NOT** publish container ports to the host by default — they route internally via `coolify-proxy` (Traefik). To reach a service from a host-level process (like `cloudflared`), you must add an explicit `ports:` mapping. There is **no UI field** for this on template services — use **"Edit Compose File."**

## Networking: Cloudflare Tunnel

- Tunnel name: **`home-coolify`**. Connector origin IP `96.60.13.195`.
- **`cloudflared` runs as a host systemd service** (NOT a container — it does not appear in `docker ps`). Therefore its `localhost` **is** the box's `localhost`, so tunnel origins use `http://localhost:<published-port>`.
- Zone `davidvalentine.org` is on Cloudflare (DNS-only A record → Vercel for the apex; subdomains free to route through the tunnel).
- **Routes UI:** Cloudflare renamed things — the old "Public Hostname" is now **"Published application"** under Zero Trust → Networks → Routes (or the tunnel's config). Add/edit/**delete** a route via the **`⋯` menu at the far right of the route row** (scroll the table right if it's cut off), or Networks → Tunnels → `home-coolify` → Public Hostname.
- TLS terminates at Cloudflare's edge; services run **plain HTTP** internally. Do **not** let Coolify try to issue Let's Encrypt certs for tunneled hostnames — the ACME challenge can't reach the box (no inbound :80/:443 from the internet).

## Running services (2026-07-15)

**n8n stack** — Coolify "N8N With Postgresql" template:
- `n8n-…` (`n8nio/n8n:2.10.2`) — the app. **Port published to host via compose `ports: ["5678:5678"]`.** Reachable at `http://localhost:5678` on the box.
- `task-runners-…` (`n8nio/runners:2.10.2`) — Code-node execution isolation (n8n's modern default; NOT queue-mode workers). Internal `5680/tcp`.
- `postgresql-…` (`postgres:16-alpine`) — n8n's DB. User `dg-v1`, database `n8n`. Internal `5432/tcp`.
- **Public URL:** https://n8n.davidvalentine.org (tunnel route → `http://localhost:5678`).
- Owner account created; **free community license** key issued (still Sustainable Use License — personal/invite-only use is fine).

## Gotchas learned the hard way

1. **`N8N_ENCRYPTION_KEY` mismatch → crash-loop.** n8n auto-generates + persists an encryption key on first boot. Adding a *different* key via env later makes n8n refuse to start ("Mismatching encryption keys", `Restarting (1)`). **Fix:** remove the env key (uses the persisted one), OR wipe the n8n data volume so it adopts the env key. Set a stable env-managed key **before** storing any credentials, then never change it.
2. **Coolify services don't host-publish ports.** `curl localhost:5678` failing was this, not the tunnel. Add `ports:` in the compose file (`Edit Compose File`), redeploy, confirm `docker ps` shows `0.0.0.0:5678->5678/tcp`.
3. **`cloudflared` is a host service here**, so `localhost` works as an origin. If it were a container, `localhost` would be the container — you'd use the host IP or a shared Docker network.
4. **Coolify magic var `${SERVICE_URL_N8N}`** resolves to the auto-assigned `sslip.io` URL, not your real domain. Fine for the UI to load, but wrong for n8n's generated webhook URLs. Override with literals in the Environment Variables tab (see Outstanding).

## Outstanding config (before Trellis Plan 3 wiring)

- [ ] **Literal hostname env** — set in n8n's Environment Variables tab (overrides the compose magic var): `N8N_HOST=n8n.davidvalentine.org`, `WEBHOOK_URL=https://n8n.davidvalentine.org/`, `N8N_EDITOR_BASE_URL=https://n8n.davidvalentine.org/`. Needed so n8n emits correct webhook URLs.
- [ ] **Cloudflare Access** over `n8n.davidvalentine.org` (Zero Trust → Access → Applications → Self-hosted → allow owner + family-member emails) — gates the UI, whose credential store will hold the Digital Garden PAT + third-party keys. Plus an **Access service token** for app→n8n API calls (interactive Access can't answer programmatic requests).
- [ ] **n8n API key** — Settings → n8n API → create. The Trellis compiler/adapter uses it to push workflows.
- [ ] Record the box's **RAM** here.

## Planned moves

- **Hocuspocus migration (eventual, deferred).** Hocuspocus (collaboration websocket server) currently runs on Google Cloud Run. Moving it here would zero out that Cloud Run bill. **Do NOT rush it:** it's latency-sensitive and production-critical, and this is a home box on home internet (reliability trade vs. Cloud Run). Plan: let n8n soak here for weeks first; then migrate as the *second tenant* with its own subdomain (e.g. `collab.davidvalentine.org`). Cloudflare Tunnel supports websockets, so the transport works. Validate latency/stability before cutting production over. See the daily-notes divergence lesson — Hocuspocus offline windows cause NotePayload↔Y.Doc drift, so uptime matters.
- **Trigger-firing workers** (Trellis deferred trigger firing — cron/periodic/content-event) could live here too once the box is trusted.

## Connecting to the box (for diagnostics/deploys)

See `HOME-SERVER-ACCESS.md` (SSH over the Cloudflare Tunnel — keeps ports closed, gated by Access). Until that's set up, the box is managed via the Coolify web UI (tunneled) and its Terminal tab.
