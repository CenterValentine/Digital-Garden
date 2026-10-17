/**
 * Shared helpers for `pnpm dev -wt <name>` (scripts/dev.ts), `pnpm worktrees`
 * (scripts/worktrees.ts) and `pnpm wt:install <name>` (scripts/wt-install.ts).
 *
 * Worktrees live at `.claude/worktrees/<name>` (CLAUDE.md). The main checkout
 * is addressable as `main`.
 */

import { execFile, execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { basename, dirname, join, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const PORT_FIRST = 3015;
export const PORT_LAST = 3025;

/** Written by `pnpm dev -wt` into the served checkout; read by `pnpm worktrees`. */
export const LEASE_FILE = ".local/dev-server.json";

/** Present while node_modules exists only because `pnpm dev -wt` installed it. */
export const INSTALL_MARKER = ".local/dev-installed-node-modules";

export interface Worktree {
  /** `main` for the primary checkout, else the folder name under .claude/worktrees. */
  name: string;
  path: string;
  branch: string | null;
  isMain: boolean;
  /** Dependencies fully installed (see isInstalled). */
  installed: boolean;
  /** Installed, but from an older lockfile than the checkout now has (see isUpToDate). */
  stale: boolean;
  /** Installed by `pnpm dev -wt`, so removed again when its server stops. */
  installedByDev: boolean;
  hasEnvLocal: boolean;
}

export interface DevLease {
  pid: number;
  port: number;
  startedAt: string;
  /** null = no expiry (`-t 0`) */
  expiresAt: string | null;
}

export interface Listener {
  pid: number;
  port: number;
  cwd: string | null;
}

/** Every worktree of this repo, main first — works from inside any of them. */
export function listWorktrees(): Worktree[] {
  const out = execFileSync("git", ["worktree", "list", "--porcelain"], {
    encoding: "utf8",
  });
  const trees: Worktree[] = [];
  for (const block of out.trim().split(/\n\n+/)) {
    const path = /^worktree (.+)$/m.exec(block)?.[1];
    if (!path || /^prunable/m.test(block)) continue;
    const ref = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? null;
    const isMain = trees.length === 0; // porcelain lists the main worktree first
    trees.push({
      name: isMain ? "main" : basename(path),
      path,
      branch: ref ?? (/^detached$/m.test(block) ? "(detached)" : null),
      isMain,
      installed: isInstalled(path),
      stale: isInstalled(path) && !isUpToDate(path),
      installedByDev: existsSync(join(path, INSTALL_MARKER)),
      hasEnvLocal: existsSync(join(path, ".env.local")),
    });
  }
  return trees;
}

/**
 * pnpm writes `node_modules/.modules.yaml` when an install completes, so a
 * half-finished or half-deleted node_modules doesn't count; `next` must resolve too.
 */
export function isInstalled(worktreePath: string): boolean {
  return (
    existsSync(join(worktreePath, "node_modules/.modules.yaml")) &&
    existsSync(join(worktreePath, "node_modules/.bin/next"))
  );
}

/**
 * pnpm keeps a copy of the lockfile it installed from at
 * `node_modules/.pnpm/lock.yaml`. If it differs from `pnpm-lock.yaml`, the
 * checkout gained or changed dependencies since its last install (a pull or
 * merge) and imports of the new ones fail at compile time.
 */
export function isUpToDate(worktreePath: string): boolean {
  try {
    return (
      readFileSync(join(worktreePath, "pnpm-lock.yaml"), "utf8") ===
      readFileSync(join(worktreePath, "node_modules/.pnpm/lock.yaml"), "utf8")
    );
  } catch {
    return false;
  }
}

/** Folder name first, then exact branch name. */
export function resolveWorktree(trees: Worktree[], query: string): Worktree | null {
  const q = query.replace(/\/+$/, "");
  return (
    trees.find((t) => t.name === q) ??
    trees.find((t) => t.branch === q) ??
    null
  );
}

/** Live lease for a checkout, or null if absent, stale, or its process is gone. */
export function readLease(worktreePath: string): DevLease | null {
  try {
    const lease = JSON.parse(
      readFileSync(join(worktreePath, LEASE_FILE), "utf8"),
    ) as DevLease;
    if (lease.expiresAt && Date.parse(lease.expiresAt) < Date.now()) return null;
    process.kill(lease.pid, 0); // throws if the process is gone
    return lease;
  } catch {
    return null;
  }
}

/** TCP listeners on the dev port range, with each process's working directory. */
export function findDevListeners(): Listener[] {
  let raw: string;
  try {
    raw = execFileSync(
      "lsof",
      ["-nP", `-iTCP:${PORT_FIRST}-${PORT_LAST}`, "-sTCP:LISTEN", "-Fpn"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
  } catch {
    return []; // lsof exits 1 when nothing matches
  }
  const byPort = new Map<number, number>();
  let pid = 0;
  for (const line of raw.split("\n")) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    const port = /^n.*:(\d+)$/.exec(line)?.[1];
    if (port && pid) byPort.set(Number(port), pid);
  }
  if (byPort.size === 0) return [];

  const cwdByPid = new Map<number, string>();
  try {
    const pids = [...new Set(byPort.values())].join(",");
    const cwdRaw = execFileSync("lsof", ["-a", "-d", "cwd", "-p", pids, "-Fpn"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    let p = 0;
    for (const line of cwdRaw.split("\n")) {
      if (line.startsWith("p")) p = Number(line.slice(1));
      else if (line.startsWith("n") && p) cwdByPid.set(p, line.slice(1));
    }
  } catch {
    // cwd is best-effort; the port is still reported as taken
  }
  return [...byPort].map(([port, p]) => ({ port, pid: p, cwd: cwdByPid.get(p) ?? null }));
}

/** The worktree a listener is serving, matched by longest path prefix. */
export function worktreeForCwd(trees: Worktree[], cwd: string | null): Worktree | null {
  if (!cwd) return null;
  return (
    [...trees]
      .sort((a, b) => b.path.length - a.path.length)
      .find((t) => cwd === t.path || cwd.startsWith(t.path + sep)) ?? null
  );
}

function somethingAnswers(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    const done = (answered: boolean) => {
      socket.destroy();
      resolve(answered);
    };
    socket.setTimeout(300, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

function canBind(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, () => server.close(() => resolve(true)));
  });
}

/**
 * A port is free only if nothing answers on either loopback AND we can bind
 * it. Both checks: macOS lets a wildcard bind succeed beside a listener on a
 * specific address, so binding alone misses a server bound to 127.0.0.1.
 */
export async function isPortFree(port: number): Promise<boolean> {
  if (await somethingAnswers(port, "127.0.0.1")) return false;
  if (await somethingAnswers(port, "::1")) return false;
  return canBind(port);
}

function expiryNote(lease: DevLease | null): string {
  if (!lease) return "";
  if (!lease.expiresAt) return ", no expiry";
  const mins = Math.max(1, Math.ceil((Date.parse(lease.expiresAt) - Date.now()) / 60_000));
  return `, stops in ${mins} min`;
}

/** Default window for `pnpm wt`: there are many worktrees, most of them idle. */
export const DEFAULT_RECENT_DAYS = 7;

/**
 * When a worktree was last worked on: the later of its HEAD commit and the
 * newest uncommitted file, so edits that were never committed still count.
 */
async function lastActivity(path: string): Promise<number> {
  const git = (args: string[]) =>
    execFileAsync("git", ["-C", path, ...args], { maxBuffer: 16 * 1024 * 1024 })
      .then((r) => r.stdout)
      .catch(() => "");
  const [commit, status] = await Promise.all([
    git(["log", "-1", "--format=%ct"]),
    git(["status", "--porcelain", "-z"]),
  ]);
  let latest = Number(commit.trim()) * 1000 || 0;

  // -z entries are "XY <path>"; a rename/copy is followed by its old path.
  const entries = status.split("\0");
  const dirty: string[] = [];
  for (let i = 0; i < entries.length && dirty.length < 500; i++) {
    const e = entries[i];
    if (e.length < 4) continue;
    dirty.push(e.slice(3));
    if (e[0] === "R" || e[0] === "C") i++;
  }
  const mtimes = await Promise.all(
    dirty.map((f) => stat(join(path, f)).then((st) => st.mtimeMs).catch(() => 0)),
  );
  for (const m of mtimes) latest = Math.max(latest, m);
  return latest;
}

function ago(ms: number): string {
  if (!ms) return "—";
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  if (s < 14 * 86_400) return `${Math.round(s / 86_400)}d ago`;
  return `${Math.round(s / (7 * 86_400))}w ago`;
}

/**
 * The plain-terms table shared by `pnpm wt` and a bare `pnpm dev -wt`, newest
 * first. `days` limits it to worktrees active in that window (null = all);
 * main and anything currently serving always show.
 */
export async function printWorktrees(
  trees: Worktree[] = listWorktrees(),
  days: number | null = DEFAULT_RECENT_DAYS,
): Promise<void> {
  const serving = new Map<string, Listener[]>();
  for (const l of findDevListeners()) {
    const tree = worktreeForCwd(trees, l.cwd);
    if (tree) serving.set(tree.path, [...(serving.get(tree.path) ?? []), l]);
  }

  const status = (t: Worktree): string => {
    const lease = readLease(t.path);
    const ports = (serving.get(t.path) ?? []).map((l) => l.port);
    if (lease && !ports.includes(lease.port)) ports.push(lease.port);
    if (ports.length > 0) {
      const where = ports.sort((a, b) => a - b).map((p) => `:${p}`).join(" ");
      return `● serving ${where}${expiryNote(lease)}`;
    }
    // `pnpm dev -wt` fixes both of these itself; shown so the first serve's wait isn't a surprise.
    if (!t.installed) return "not installed (installs on serve)";
    if (t.stale) return "deps out of date (updates on serve)";
    if (!t.hasEnvLocal && !t.isMain) return "ready (copies .env.local on serve)";
    return t.installedByDev ? "ready (temporary install)" : "ready";
  };

  const activity = await Promise.all(trees.map((t) => lastActivity(t.path)));
  const cutoff = days === null ? 0 : Date.now() - days * 86_400_000;
  const all = trees.map((t, i) => ({ t, at: activity[i], status: status(t) }));
  const shown = all
    .filter((r) => r.t.isMain || r.status.startsWith("●") || r.at >= cutoff)
    .sort((a, b) => Number(b.t.isMain) - Number(a.t.isMain) || b.at - a.at);
  const hidden = all.length - shown.length;

  const rows = shown.map((r) => [r.t.name, r.t.branch ?? "", ago(r.at), r.status]);
  const width = (col: number, min: number) => Math.max(min, ...rows.map((r) => r[col].length));
  const [w0, w1, w2] = [width(0, 4), width(1, 6), width(2, 7)];
  const line = (r: string[]) => `  ${r[0].padEnd(w0)}  ${r[1].padEnd(w1)}  ${r[2].padEnd(w2)}  ${r[3]}`;

  console.log("");
  console.log(line(["NAME", "BRANCH", "UPDATED", "STATUS"]));
  for (const r of rows) console.log(line(r));
  console.log("");
  if (hidden > 0) {
    console.log(`  ${hidden} not touched in ${days} days hidden — pnpm wt <days> to widen, pnpm wt all for everything.`);
  }
  console.log("  Serve one:  pnpm dev -wt <name>");
  console.log("");
}

export async function firstFreePort(): Promise<number | null> {
  for (let port = PORT_FIRST; port <= PORT_LAST; port++) {
    if (await isPortFree(port)) return port;
  }
  return null;
}

/**
 * Make a worktree servable: `.env.local` present (copied from main) and
 * dependencies installed. `temporary` marks an install this call makes so
 * `cleanUpTemporaryInstall` removes it later; a kept install (`pnpm wt:install`)
 * clears any marker instead, turning a temporary install into a kept one.
 * Exits the process if the install fails.
 */
export function ensureReady(target: Worktree, main: Worktree, opts: { temporary: boolean }): void {
  if (!target.isMain && !existsSync(join(target.path, ".env.local"))) {
    copyFileSync(join(main.path, ".env.local"), join(target.path, ".env.local"));
    console.log(`  • Copied .env.local from main into "${target.name}".`);
  }
  const marker = join(target.path, INSTALL_MARKER);
  if (!opts.temporary) rmSync(marker, { force: true });
  const installed = isInstalled(target.path);
  if (installed && isUpToDate(target.path)) return;

  // An out-of-date install is updated in place and keeps its ownership: a
  // temporary install stays temporary, one you made yourself stays yours.
  console.log(
    installed
      ? `  • "${target.name}" dependencies are out of date with its lockfile — running pnpm install…\n`
      : opts.temporary
        ? `  • "${target.name}" isn't installed — running pnpm install (removed again when the server stops)…\n`
        : `  • Installing "${target.name}"…\n`,
  );
  if (!installed && opts.temporary && !target.isMain) {
    // Mark before installing so an interrupted install is still ours to clean up.
    mkdirSync(dirname(marker), { recursive: true });
    writeFileSync(marker, new Date().toISOString());
  }
  const r = spawnSync("pnpm", ["install", "--frozen-lockfile", "--prefer-offline"], {
    cwd: target.path,
    stdio: "inherit",
    env: { ...process.env, CI: "true" }, // never prompt (e.g. to purge a modules dir)
  });
  if (r.status !== 0 || !isInstalled(target.path) || !isUpToDate(target.path)) {
    console.error(`\n  pnpm install failed in "${target.name}". Fix it there, then retry.\n`);
    process.exit(r.status || 1);
  }
}

/** Remove node_modules + .next if `ensureReady({ temporary: true })` put them there. */
export function cleanUpTemporaryInstall(target: Worktree): void {
  const marker = join(target.path, INSTALL_MARKER);
  if (target.isMain || !existsSync(marker)) return;
  console.log(`  • Removing node_modules and .next from "${target.name}" to free disk…`);
  rmSync(join(target.path, "node_modules"), { recursive: true, force: true });
  rmSync(join(target.path, ".next"), { recursive: true, force: true });
  rmSync(marker, { force: true });
  console.log("    Done.\n");
}
