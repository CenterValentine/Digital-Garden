/**
 * dev.ts — entry point for `pnpm dev`.
 *
 *   pnpm dev                    this checkout on :3015, runs until stopped (unchanged behaviour)
 *   pnpm dev -wt <name>         serve .claude/worktrees/<name> (or `main`) without cd-ing;
 *                               first free port in 3015–3025, stops itself after 15 min
 *   pnpm dev -wt <name> -t 45   same, lasting 45 min (`90m`, `2h`; `-t 0` = no expiry)
 *   pnpm dev -wt                list worktrees (same as `pnpm wt`)
 *
 * Readiness: before serving, a worktree is checked and made ready — a missing
 * or partial install runs `pnpm install`, a missing `.env.local` is copied
 * from main. An install this command performed is marked, and when the server
 * stops its `node_modules` and `.next` are removed again, so idle worktrees
 * don't hold gigabytes. A worktree you installed yourself (or with
 * `pnpm wt:install <name>`) is never cleaned.
 *
 * Any other args go to `next dev`. The pre-steps (trace archive, Postgres
 * auto-start, OCR assets) run inside the served checkout using that
 * checkout's own scripts, so an older worktree runs its own versions.
 *
 * A worktree server records its port and expiry in `<worktree>/.local/dev-server.json`,
 * which `pnpm wt` reads to show what is being served.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  LEASE_FILE,
  PORT_FIRST,
  PORT_LAST,
  cleanUpTemporaryInstall,
  ensureReady,
  firstFreePort,
  listWorktrees,
  printWorktrees,
  resolveWorktree,
  type DevLease,
} from "./lib/worktrees";

const DEFAULT_TTL_MINUTES = 15;

interface Args {
  /** undefined = no -wt flag; null = -wt without a name */
  worktree: string | null | undefined;
  /** minutes; 0 = no expiry; undefined = default */
  ttl: number | undefined;
  rest: string[];
}

/** `30`, `30m`, `1.5h`, `0`/`none` → minutes. */
function parseDuration(raw: string | undefined): number {
  const m = /^(\d+(?:\.\d+)?)\s*(m|min|h|hr)?$/i.exec(raw ?? "");
  if (raw === "none") return 0;
  if (!m) {
    console.error(`\n  -t needs a duration like 30, 90m or 2h (or 0 for no expiry); got "${raw ?? ""}".\n`);
    process.exit(1);
  }
  const n = Number(m[1]);
  return m[2]?.toLowerCase().startsWith("h") ? n * 60 : n;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { worktree: undefined, ttl: undefined, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const eq = argv[i].indexOf("=");
    const flag = eq === -1 ? argv[i] : argv[i].slice(0, eq);
    const inline = eq === -1 ? undefined : argv[i].slice(eq + 1);
    const takeValue = (): string | undefined => {
      if (inline !== undefined) return inline;
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("-")) return undefined;
      i++;
      return next;
    };
    if (flag === "-wt" || flag === "--wt" || flag === "--worktree") {
      args.worktree = takeValue() ?? null;
    } else if (flag === "-t" || flag === "--ttl") {
      args.ttl = parseDuration(takeValue());
    } else {
      args.rest.push(argv[i]);
    }
  }
  return args;
}

/** The old `predev` + `dev` chain, run inside `cwd`. Stops at the first failure. */
function runPreSteps(cwd: string): void {
  const steps: string[][] = [["pnpm", "run", "--if-present", "clean:traces"]];
  if (existsSync(join(cwd, "scripts/predev.ts"))) {
    steps.push(["pnpm", "exec", "tsx", "scripts/predev.ts"]);
  }
  steps.push(["pnpm", "run", "--if-present", "ocr:assets"]);
  for (const [cmd, ...args] of steps) {
    const r = spawnSync(cmd, args, { cwd, stdio: "inherit" });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
}

function clock(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

async function main(): Promise<void> {
  const { worktree, ttl, rest } = parseArgs(process.argv.slice(2));

  // ── Plain `pnpm dev`: unchanged — this checkout, :3015, no expiry ──
  if (worktree === undefined) {
    if (ttl !== undefined) {
      console.error("\n  -t only applies with -wt <name> (plain `pnpm dev` runs until stopped).\n");
      process.exit(1);
    }
    runPreSteps(process.cwd());
    const child = spawn("next", ["dev", "--port", String(PORT_FIRST), ...rest], {
      stdio: "inherit",
    });
    child.on("exit", (code, signal) => process.exit(code ?? (signal ? 0 : 1)));
    return;
  }

  const trees = listWorktrees();
  if (worktree === null) {
    await printWorktrees(trees);
    return;
  }

  const target = resolveWorktree(trees, worktree);
  if (!target) {
    console.error(`\n  No worktree named "${worktree}".`);
    await printWorktrees(trees, null); // a typo'd name may be an old worktree — show them all
    process.exit(1);
  }

  const port = await firstFreePort();
  if (port === null) {
    console.error(`\n  Every port from ${PORT_FIRST} to ${PORT_LAST} is in use.`);
    console.error("  Run `pnpm wt` to see what is serving, and stop one.\n");
    process.exit(1);
  }

  console.log("");
  ensureReady(target, trees[0], { temporary: true });
  runPreSteps(target.path);

  const ttlMinutes = ttl ?? DEFAULT_TTL_MINUTES;
  const startedAt = new Date();
  const expiresAt = ttlMinutes > 0 ? new Date(startedAt.getTime() + ttlMinutes * 60_000) : null;

  console.log("");
  console.log(`  ▶ Serving "${target.name}"${target.branch ? ` (${target.branch})` : ""}`);
  console.log(`    http://localhost:${port}${port !== PORT_FIRST ? `   (${PORT_FIRST} was taken)` : ""}`);
  console.log(
    expiresAt
      ? `    Stops at ${clock(expiresAt)} (${ttlMinutes} min). Ctrl+C to stop sooner.`
      : "    No expiry (-t 0). Ctrl+C to stop.",
  );
  console.log("");

  // Own process group, so the expiry can take down next dev AND its workers.
  const child = spawn(join(target.path, "node_modules/.bin/next"), ["dev", "--port", String(port), ...rest], {
    cwd: target.path,
    stdio: "inherit",
    detached: true,
  });

  const leasePath = join(target.path, LEASE_FILE);
  const lease: DevLease = {
    pid: process.pid,
    port,
    startedAt: startedAt.toISOString(),
    expiresAt: expiresAt?.toISOString() ?? null,
  };
  mkdirSync(dirname(leasePath), { recursive: true });
  writeFileSync(leasePath, JSON.stringify(lease, null, 2));

  let stopping = false;
  const stopGroup = (signal: NodeJS.Signals) => {
    if (child.pid === undefined || child.exitCode !== null) return;
    try {
      process.kill(-child.pid, signal);
    } catch {
      // group already gone
    }
  };

  const timers: NodeJS.Timeout[] = [];
  if (expiresAt) {
    const ms = ttlMinutes * 60_000;
    timers.push(
      setTimeout(() => {
        console.log(`\n  ⏳ "${target.name}" on :${port} stops at ${clock(expiresAt)}.\n`);
      }, Math.max(0, ms - 60_000)),
      setTimeout(() => {
        stopping = true;
        console.log(`\n  ⏹ ${ttlMinutes} min up — stopping "${target.name}" on :${port}.`);
        console.log(`    Restart with: pnpm dev -wt ${target.name}\n`);
        stopGroup("SIGTERM");
        setTimeout(() => stopGroup("SIGKILL"), 5_000).unref();
      }, ms),
    );
  }

  // The child is in its own group, so terminal Ctrl+C reaches only us — forward it.
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(sig, () => {
      stopping = true;
      stopGroup(sig === "SIGHUP" ? "SIGTERM" : sig);
    });
  }

  child.on("exit", (code) => {
    timers.forEach(clearTimeout);
    rmSync(leasePath, { force: true });
    cleanUpTemporaryInstall(target);
    process.exit(stopping ? 0 : (code ?? 1));
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
