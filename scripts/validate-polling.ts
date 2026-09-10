/**
 * Polling discipline gate.
 *
 * Invariant: **the page goes cold when nobody is looking at it.**
 *
 * Every client-side recurring timer must be declared here. Timers that make
 * network calls must skip their tick while `document.visibilityState !== "visible"`,
 * unless they carry an explicit `background: true` justification.
 *
 * Why this exists: on metered infrastructure a background poll is billed twice —
 * once for the function that serves it and once for the database that never
 * reaches its autosuspend threshold. In September 2026 an ungated 10 s session
 * poll plus a 10 s presence stream kept a 61 MB database awake ~85% of the
 * month. See docs/notes-feature/infrastructure/PLATFORM-PORTABILITY.md.
 *
 * Run: pnpm polling:check
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = process.cwd();
// `state/` is included deliberately. It was omitted in the first version of
// this gate, which is exactly how state/conversation-cache-store.ts — holding a
// second, refcounted EventSource on the same endpoint — went unnoticed. Any
// directory that can contain client code belongs here.
const SCAN_ROOTS = ["app", "components", "lib", "extensions", "state"].map((d) =>
  join(REPO_ROOT, d)
);
const SOURCE_FILE_RE = /\.(ts|tsx)$/;

/** How a declared timer is permitted to behave. */
type Policy =
  /** Network timer that correctly skips ticks while the tab is hidden. */
  | "pause-when-hidden"
  /**
   * Network timer permitted to keep running while hidden. Requires
   * `estimatedMonthlyCostUsd` — the expensive case is the one that has to
   * justify itself in writing. See D14 in POLLING-DISCIPLINE-PLAN.md.
   */
  | "background-allowed"
  /** Purely local timer (animation, clock, local state) — no network, exempt. */
  | "ui-only"
  /** Runs on the server (SSE heartbeats etc.) — visibility is meaningless. */
  | "server"
  /** Known network timer not yet audited. Warns; does not fail. */
  | "unreviewed";

interface Declared {
  file: string;
  policy: Policy;
  note: string;
  /**
   * Required when policy is "background-allowed". State the dominant meter and
   * why. Reference figures live in D14; the short version is that Neon
   * autosuspends after 5 minutes, so ANY ungated sub-5-minute poll costs about
   * the same (~$19/mo per always-open tab) regardless of its interval —
   * continuity dominates frequency.
   */
  estimatedMonthlyCostUsd?: number;
}

/**
 * The registry. A timer site in a file not listed here is a hard failure —
 * that is the point of the gate: new pollers cannot land unexamined.
 */
const REGISTRY: Declared[] = [
  // ── Network pollers: must pause when hidden ────────────────────────────────
  // components/content/AuthSessionSync.tsx was REMOVED from this registry when it
  // migrated to registerPollingTask(). That is the intended end state: the
  // registry audits RAW timers, and a scheduler-registered task declares its own
  // policy in code (whenHidden / whenIdle / keepAliveWhile), which the type
  // system enforces far better than a string in a list.

  // ── Server-side timers ─────────────────────────────────────────────────────
  {
    file: "app/api/collaboration/presence/stream/route.ts",
    policy: "server",
    note: "SSE refresh loop. Cost is the held-open stream itself, not the timer.",
  },
  {
    file: "app/api/conversations/events/route.ts",
    policy: "server",
    note: "SSE heartbeat that keeps proxies from idling the stream out.",
  },

  // ── Purely local timers: no network, exempt ────────────────────────────────
  { file: "app/(public)/layout.tsx", policy: "ui-only", note: "4s hero carousel advance." },
  { file: "components/client/app-nav/app-nav.tsx", policy: "ui-only", note: "16ms animation frame driving nav rotation." },
  { file: "components/content/ai/CoBrowseIndicator.tsx", policy: "ui-only", note: "1s elapsed-time display tick." },
  { file: "components/content/ai/reasoning/reasoning-disclosure.ts", policy: "ui-only", note: "Local disclosure animation." },
  { file: "components/content/folder-views/MediaLightbox.tsx", policy: "ui-only", note: "Slideshow advance." },
  { file: "lib/domain/editor/extensions/blocks/stopwatch.ts", policy: "ui-only", note: "33ms stopwatch tick, local block state." },
  {
    file: "lib/core/polling/scheduler.ts",
    policy: "pause-when-hidden",
    note:
      "THE app's polling timer — one base tick driving every registered task. Gating lives here rather than in each " +
      "call site, so adding a task adds no timers. Engagement is pulled at tick time; hidden is authoritative and " +
      "keepAliveWhile cannot override it.",
  },
  {
    file: "lib/core/engagement/index.ts",
    policy: "ui-only",
    note:
      "The engagement core's own 5s transition check — the ONLY timer it owns. Never touches the network; exists so " +
      "streams can be told when the user goes idle. Runs only while subscribed. Pull-based consumers should call " +
      "getEngagement() at their own tick and cost nothing.",
  },

  // ── Known, not yet audited ─────────────────────────────────────────────────
  // These files contain BOTH timers and network calls, so they cannot be
  // blanket-exempted, but their timers have not been individually traced.
  // Owned by the collaboration/AI surfaces; audit alongside the Hocuspocus
  // presence delegation rather than here.
  {
    file: "lib/domain/collaboration/runtime.ts",
    policy: "unreviewed",
    note: "Presence heartbeat scheduling + browser-session sweep. Tiered cadence already exists (45s active / 5min dormant). Audit with the awareness delegation.",
  },
  {
    file: "components/content/editor/MarkdownEditor.tsx",
    policy: "unreviewed",
    note: "1s syncRemoteCollaborators + 500ms scheduleRefresh — believed local Y.js awareness reads, unverified.",
  },
  {
    file: "components/content/ai/ChatMessage.tsx",
    policy: "unreviewed",
    note: "Timer purpose untraced; file also performs fetches.",
  },
  {
    file: "lib/domain/ai/use-conversation-binding.ts",
    policy: "pause-when-hidden",
    note:
      "Per-viewer EventSource on /api/conversations/events. Closed while hidden, reopened on return (D12 = close-and-refetch). " +
      "Vercel bills provisioned memory for an SSE request's entire lifetime, so a held-open stream is ~1,460 GB-hrs/month per tab.",
  },
  {
    file: "state/conversation-cache-store.ts",
    policy: "pause-when-hidden",
    note:
      "The SECOND EventSource on the same endpoint — refcounted and shared across surfaces. Closed while hidden; " +
      "refetchAllCached reconciles on return via both `focus` and `visibilitychange`. This file was missed by the " +
      "first version of this gate because `state/` was not in SCAN_ROOTS.",
  },
];

// Deliberately matches `window.setInterval(`, `this.x = window.setInterval(`
// and bare `setInterval(` alike. A type position such as
// `ReturnType<typeof setInterval>` has no following paren, so it cannot match.
const CALL_RE = /setInterval\s*\(/g;
const EVENTSOURCE_RE = /new\s+EventSource\s*\(/g;
/**
 * What counts as being gated.
 *
 * Two accepted forms, and both must be recognised:
 *
 *   - a direct check   `document.visibilityState` / `document.hidden`
 *   - **delegation**   to the engagement core (`getEngagement`, `isEngaged`,
 *                      `subscribeEngagement`)
 *
 * The second matters increasingly: the whole point of the scheduler is that
 * individual call sites stop writing visibility checks and declare a policy
 * instead. A gate that only recognised the literal form would flag correctly
 * architected code and, worse, pressure people back toward hand-rolled checks.
 */
const VISIBILITY_RE =
  /visibilityState|document\.hidden|getEngagement|isEngaged|subscribeEngagement|registerPollingTask/;

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "generated" || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out = out.concat(walk(path));
    else if (SOURCE_FILE_RE.test(path)) out.push(path);
  }
  return out;
}

function countMatches(source: string, re: RegExp): number {
  return (source.match(new RegExp(re.source, "g")) ?? []).length;
}

function main() {
  const declaredByFile = new Map(REGISTRY.map((d) => [d.file, d]));
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  const files = SCAN_ROOTS.filter((root) => {
    try {
      return statSync(root).isDirectory();
    } catch {
      return false;
    }
  }).flatMap(walk);

  for (const abs of files) {
    const rel = relative(REPO_ROOT, abs);
    const source = readFileSync(abs, "utf8");

    const timers = countMatches(source, CALL_RE) + countMatches(source, EVENTSOURCE_RE);
    if (timers === 0) continue;

    seen.add(rel);
    const declared = declaredByFile.get(rel);

    if (!declared) {
      errors.push(
        `UNREGISTERED  ${rel}\n` +
          `    Contains ${timers} recurring timer(s) but is not declared in scripts/validate-polling.ts.\n` +
          `    Add a REGISTRY entry with a policy and a one-line justification.\n` +
          `    If it makes network calls it must skip ticks while the tab is hidden —\n` +
          `    see extensions/workplaces/state/workspace-sync.ts for the reference pattern.`
      );
      continue;
    }

    if (declared.policy === "pause-when-hidden" && !VISIBILITY_RE.test(source)) {
      errors.push(
        `NOT GATED     ${rel}\n` +
          `    Declared "pause-when-hidden" but contains no visibilityState check.\n` +
          `    ${declared.note}`
      );
    }

    if (
      declared.policy === "background-allowed" &&
      typeof declared.estimatedMonthlyCostUsd !== "number"
    ) {
      errors.push(
        `NO COST       ${rel}\n` +
          `    Declared "background-allowed" — it runs while the tab is hidden — but carries no\n` +
          `    estimatedMonthlyCostUsd. Anything that keeps running unattended must state what it\n` +
          `    costs (D14 in docs/notes-feature/work-tracking/POLLING-DISCIPLINE-PLAN.md).\n` +
          `    Reference: Neon autosuspends after 5 min, so ANY ungated sub-5-minute poll runs\n` +
          `    ~$19/mo per always-open tab whatever its interval — continuity dominates frequency.\n` +
          `    A held SSE stream adds ~$15/mo of Vercel provisioned memory on top.`
      );
    }

    if (declared.policy === "unreviewed") {
      warnings.push(`UNREVIEWED    ${rel}\n    ${declared.note}`);
    }
  }

  // A registry entry whose file lost its timers is stale — flag it so the
  // registry cannot silently drift into fiction.
  for (const d of REGISTRY) {
    if (!seen.has(d.file)) {
      errors.push(
        `STALE ENTRY   ${d.file}\n` +
          `    Declared in the registry but no raw timer found.\n` +
          `    If this file MIGRATED to registerPollingTask(), that is expected — remove the\n` +
          `    entry. A scheduler-registered task declares its own policy in code, which the\n` +
          `    type system enforces better than this list can.\n` +
          `    Otherwise the file moved, was renamed, or lost its timer.`
      );
    }
  }

  if (warnings.length > 0) {
    console.warn(`\n⚠  ${warnings.length} timer file(s) awaiting audit:\n`);
    for (const w of warnings) console.warn(`  ${w}\n`);
  }

  if (errors.length > 0) {
    console.error(`\n✖ polling:check failed — ${errors.length} problem(s):\n`);
    for (const e of errors) console.error(`  ${e}\n`);
    process.exit(1);
  }

  const gated = REGISTRY.filter((d) => d.policy === "pause-when-hidden").length;
  console.log(
    `✓ polling:check — ${seen.size} timer file(s): ${gated} gated, ` +
      `${REGISTRY.filter((d) => d.policy === "ui-only").length} ui-only, ` +
      `${REGISTRY.filter((d) => d.policy === "server").length} server, ` +
      `${warnings.length} awaiting audit`
  );
}

main();
