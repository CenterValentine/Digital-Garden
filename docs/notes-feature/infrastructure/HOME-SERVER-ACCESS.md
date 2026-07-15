# Home Server — Access (SSH over Cloudflare Tunnel)

**Goal:** reach `chrome-x-debian` from a laptop (and, during working sessions, Claude Code's shell) to run diagnostics (`docker ps`, logs) and deploys — **without opening any inbound port**. Access rides the existing `home-coolify` Cloudflare Tunnel and is gated by Cloudflare Access, so it's fully revocable.

> **Scope of automated access:** Claude Code runs only when invoked and its shell is on the Mac. Once SSH-over-tunnel is configured on the Mac, it can run `ssh homeserver '<cmd>'` during a session. This is **on-demand diagnostics during our work, not continuous monitoring.** For continuous monitoring use Coolify's built-in health + Cloudflare's tunnel health alerts.

**STATUS: LIVE 2026-07-15.** `ssh homeserver` connects (root, via `cloudflared access ssh`). Mac has cloudflared + key `~/.ssh/id_ed25519_homeserver`; box IP 96.60.13.195; hostname reports `chrome-x-debian`.

## One-time setup

### On the box (Debian)
1. Ensure SSH server is running: `sudo systemctl status ssh` (install `openssh-server` if missing). It only needs to listen on `localhost:22` — the tunnel reaches it locally.
2. Pick the login user. A **dedicated non-root user** is preferable to root. Add the Mac's public key (below) to that user's `~/.ssh/authorized_keys`.

### On Cloudflare (Zero Trust)
3. **Routes → Add → Published application** (or Networks → Tunnels → `home-coolify`): hostname `ssh.davidvalentine.org`, **Service `ssh://localhost:22`**.
4. **Access → Applications → Add → Self-hosted**: domain `ssh.davidvalentine.org`, policy = allow owner email. (For non-interactive/automated connects, also create an **Access Service Token** and add a policy that accepts it — otherwise each new session needs a one-time browser login, which is fine when you're present.)

### On the Mac
5. `brew install cloudflared`
6. Generate a key (if none): `ssh-keygen -t ed25519 -C "davidvalentine-mac" -f ~/.ssh/id_ed25519` — copy `~/.ssh/id_ed25519.pub` to the box (step 2).
7. Add to `~/.ssh/config`:
   ```
   Host homeserver
     HostName ssh.davidvalentine.org
     User <box-user>
     ProxyCommand cloudflared access ssh --hostname %h
     IdentityFile ~/.ssh/id_ed25519
   ```
8. Test: `ssh homeserver 'docker ps'`. First connect opens a browser for Access auth once; the token caches thereafter.

## Revoking access
Any one of: delete the `ssh.davidvalentine.org` route, remove the Access app/service token, or remove the pubkey from `authorized_keys`. All immediate.

## Alternative: Coolify API (lighter, ops-only)
If you'd rather not grant shell access, generate a **Coolify API token**, expose the Coolify dashboard on a tunnel hostname (`coolify.davidvalentine.org` → `localhost:8000`) gated by Access, and query `GET /api/v1/...` for service status/logs/deploys. Narrower than SSH but no shell.
