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
// `.js` is included for the browser extension, whose source is plain JavaScript.
// It was omitted in the first two versions of this gate, and that is exactly how
// three ungated chrome.alarms — reaching the database every 1, 5 and 20 minutes
// with no tab open, no side panel and the browser minimized — went unaudited
// while this gate reported all-clear. `extensions/` was already a scan root; the
// FILE EXTENSION was the hole. Same failure as the `state/` miss above, one
// layer out: check what the walker skips, not just where it starts.
const SOURCE_FILE_RE = /\.(ts|tsx|js)$/;
/**
 * Build output. `dist/` holds the esbuild bundle of the extension source, so
 * without this every extension timer is counted twice — once in the source it
 * lives in, once in the bundle — and the bundle's minified path is not something
 * anyone can register or fix.
 */
const SKIP_DIRS = new Set(["node_modules", "generated", "dist", ".next"]);

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
  /**
   * Set on a "ui-only" entry whose FILE contains network calls that have been
   * traced and confirmed unrelated to its timer — an event handler, a form
   * submit, a one-shot load.
   *
   * This exists so the ui-only check keeps its teeth. Without it the check would
   * be either too blunt (flagging legitimate files and training people to
   * reclassify reflexively) or absent (letting a network poller hide behind the
   * one policy that skips every other check). Requiring an explicit flag means
   * somebody had to look.
   */
  networkUnrelated?: true;
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
    file: "app/api/conversations/events/route.ts",
    policy: "server",
    note: "SSE heartbeat that keeps proxies from idling the stream out.",
  },

  // ── Purely local timers: no network, exempt ────────────────────────────────
  {
    file: "app/(public)/layout.tsx",
    policy: "ui-only",
    networkUnrelated: true,
    note:
      "4s hero carousel advance (goTo). The file's one fetch is an email-form submit handler — " +
      "event-driven, unrelated to the timer. Traced 2026-09-09.",
  },
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
    file: "lib/domain/collaboration/runtime.ts",
    policy: "background-allowed",
    estimatedMonthlyCostUsd: 4,
    note:
      "AUDITED in Phase 1 (was unreviewed). Three timers: a 2s browser-session announce and a 1s session sweep, both " +
      "BroadcastChannel/in-memory with NO network; and the presence heartbeat, which is a real network write and the " +
      "reason this is background-allowed rather than pause-when-hidden. It cannot simply stop: the server prunes a " +
      "record that stops beating (STALE_AFTER_MS 45s active / DORMANT_STALE_AFTER_MS 8min), so pausing it deletes a " +
      "live user's badge for everyone else. Tiered instead — 20s active (D5, halved in Phase 1; two beats land inside " +
      "the 45s window so one drop is survivable), 30s hidden/idle, 5min deep-dormant. The dedicated presence SSE this " +
      "file used to hold was DELETED in Phase 1; it now subscribes to the shared presence poller instead. " +
      "⚠ The 5min dormant tier still sits on Neon's 5-minute autosuspend boundary — see D26.",
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
    file: "components/content/editor/MarkdownEditor.tsx",
    policy: "ui-only",
    networkUnrelated: true,
    note:
      "AUDITED in Phase 1 (was unreviewed, and the suspicion was right). Two timers, both local: 1s " +
      "syncRemoteCollaborators reads Y.js awareness off the in-memory provider — no network, which is precisely the " +
      "delegation Phase 1 is about; 500ms scheduleRefresh is a DOM layout recompute alongside scroll/resize/ " +
      "MutationObserver. The file's two fetches are NodeView event handlers that create a visualization on user " +
      "action. Traced 2026-09-10.",
  },
  {
    file: "components/content/ai/ChatMessage.tsx",
    policy: "ui-only",
    networkUnrelated: true,
    note:
      "AUDITED in Phase 1 (was unreviewed). One timer: WorkingIndicator's 1s elapsed-seconds counter, local setState, " +
      "mounted only for the duration of a thinking segment. The single fetch is the reply-to-note action handler. " +
      "Traced 2026-09-10.",
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
      "The SECOND EventSource on the same endpoint — refcounted and shared across surfaces. Closed whenever engagement " +
      "leaves `active`; refetchAllCached reconciles on return. This file was missed by the first version of this gate " +
      "because `state/` was not in SCAN_ROOTS.",
  },

  // ── Browser extension ──────────────────────────────────────────────────────
  // Plain JavaScript, and invisible to this gate until SOURCE_FILE_RE was
  // widened to `.js`. The background worker in particular is the most expensive
  // poller in the system: chrome.alarms fire with no tab open and the browser
  // minimized, so nothing DOM-based could ever have gated them.
  {
    file: "extensions/browser-bookmarks/browser-extension/src/background/index.js",
    policy: "pause-when-hidden",
    note:
      "Three persistent chrome.alarms, all reaching the database. Gated on the extension's own engagement core " +
      "(src/background/engagement.js — chrome.idle + window focus, since a service worker has no DOM). The badge alarm " +
      "fires every minute but only FETCHES when engaged and either a run is live (60s) or the discovery backstop is due " +
      "(15min); pull-sync is engagement-gated and moved off the 5-minute autosuspend boundary to 15; the embed-session " +
      "refresh is gated on the panel being open, not on engagement, because its 30-minute token TTL makes a skipped " +
      "refresh a correctness bug rather than a saving.",
  },
  {
    file: "extensions/browser-bookmarks/browser-extension/src/overlay/index.js",
    policy: "ui-only",
    networkUnrelated: true,
    note:
      "Two timers, neither of them a poll. (1) A 1s location.href check for SPA navigations, now skipped while the tab " +
      "is hidden — it runs in EVERY open tab, so the cost is the user's battery rather than the meter, and it only " +
      "reaches the network when the URL actually changed with the associations popover open. (2) A bounded per-run " +
      "workflow pill that stops at DG_WF_POLL_MAX or on a terminal status, and goes through the background worker " +
      "rather than fetching directly.",
  },
  {
    file: "extensions/browser-bookmarks/browser-extension/src/agentic/cdp/actions.js",
    policy: "ui-only",
    note:
      "1s countdown tick rendered into a co-browse banner on the page being driven. Local DOM text only; the CDP " +
      "session it belongs to is user-initiated and bounded by the session itself.",
  },
];

// Deliberately matches `window.setInterval(`, `this.x = window.setInterval(`
// and bare `setInterval(` alike. A type position such as
// `ReturnType<typeof setInterval>` has no following paren, so it cannot match.
const CALL_RE = /setInterval\s*\(/g;
const EVENTSOURCE_RE = /new\s+EventSource\s*\(/g;
/**
 * `chrome.alarms.create` is a recurring timer that looks nothing like one.
 *
 * It is the browser extension's `setInterval`, and it is STRICTLY worse for
 * cost: alarms are persistent, so they survive service-worker eviction and
 * browser restarts, and they fire with every tab closed, the side panel shut and
 * the window minimized. A 1-minute alarm reaching the database held Neon above
 * its 5-minute autosuspend threshold for every hour the browser was running —
 * the entire compute bill, with the app itself completely idle.
 *
 * A `periodInMinutes` alarm recurs; a `when`/`delayInMinutes` one-shot does not,
 * so only the recurring form is counted.
 */
const ALARM_RE = /periodInMinutes/g;
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
/**
 * Network activity. Used to verify a "ui-only" declaration is telling the truth.
 * Deliberately broad — a false positive costs one reclassification; a false
 * negative hides a poller behind the one policy that skips every other check.
 */
const NETWORK_RE = /\bfetch\s*\(|new\s+EventSource|new\s+WebSocket|XMLHttpRequest|navigator\.sendBeacon/;

const VISIBILITY_RE =
  /visibilityState|document\.hidden|getEngagement|isEngaged|subscribeEngagement|registerPollingTask/;

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out = out.concat(walk(path));
    else if (SOURCE_FILE_RE.test(path)) out.push(path);
  }
  return out;
}

/**
 * Self-rescheduling `setTimeout` — a recurring timer that never says
 * `setInterval`.
 *
 *   const schedule = () => {
 *     timer = setTimeout(async () => { await poll(); schedule(); }, MS);
 *   };
 *
 * This is the THIRD spelling of "recurring" to get past this gate, after `.js`
 * files and `chrome.alarms`. It hid a 10s data-rows poll that was hidden-gated
 * but not idle-gated, so an open table polled forever while nobody touched it —
 * found by the owner in a network tab, not by CI.
 *
 * Matching is deliberately narrow, because precision matters more here than in
 * the setInterval check: `setInterval` is ALWAYS recurring, whereas `setTimeout`
 * is overwhelmingly one-shots and debounces (59 files pair it with a fetch).
 * Three conditions must hold together:
 *
 *   1. a named function/method containing a `setTimeout` within ~1200 chars,
 *   2. that same name called again inside the ~600 chars after it (the
 *      recursion — and NOT a fresh `const`/`let` binding of the name, which is
 *      shadowing, e.g. `const blob = await res.blob()`),
 *   3. the file reaches the network at all.
 *
 * False positives remain (an AbortController timeout near a same-named call).
 * They cost one line in REVIEWED_RECURRING_TIMEOUTS; a false negative costs a
 * poller nobody sees until it shows up on an invoice.
 */
const RECURRING_KEYWORDS = new Set([
  "if", "for", "while", "switch", "catch", "return",
  "function", "constructor", "typeof", "await", "new", "do", "else",
]);
const RECURRING_NETWORK_RE = /\bfetch\s*\(|navigator\.sendBeacon|XMLHttpRequest/;

function findSelfReschedulingTimers(source: string): string[] {
  const found: string[] = [];
  if (!RECURRING_NETWORK_RE.test(source)) return found;
  const decl =
    /(?:function\s+(\w+)\s*\(|(?:const|let|var)\s+(\w+)\s*=|^[ \t]*(?:private|protected|public)?[ \t]*(?:static[ \t]+)?(?:async[ \t]+)?(\w+)[ \t]*\([^)]*\)[ \t]*[:{])/gm;
  let match: RegExpExecArray | null;
  while ((match = decl.exec(source))) {
    const name = match[1] ?? match[2] ?? match[3];
    if (!name || RECURRING_KEYWORDS.has(name)) continue;
    const timeoutAt = source.indexOf("setTimeout(", match.index);
    if (timeoutAt === -1 || timeoutAt - match.index > 1200) continue;
    const body = source.slice(timeoutAt, timeoutAt + 600);
    if (!new RegExp(`\\b${name}\\s*\\(`).test(body)) continue;
    if (new RegExp(`(?:const|let|var)\\s+${name}\\b`).test(body)) continue;
    found.push(name);
  }
  return [...new Set(found)];
}

/**
 * Files whose self-rescheduling timers have been traced. One line each: what
 * the timer is, and why it is not an ungated poll.
 */
const REVIEWED_RECURRING_TIMEOUTS: Record<string, string> = {
  "lib/domain/collaboration/runtime.ts":
    "schedulePresenceHeartbeat — THE recurring one, tiered and audited in the registry above. shouldReconnectProvider is reconnect backoff, bounded by PROVIDER_RECONNECT_MAX_MS.",
  "components/content/ai/ChatMessage.tsx":
    "dispatch — false positive; the only timer is WorkingIndicator's 1s display counter (registered above as ui-only).",
  "extensions/workplaces/state/workspace-sync.ts":
    "fetchAndApply — already on the scheduler via registerPollingTask; the setTimeout is a retry, not the cadence.",
  "lib/core/logger/client.ts":
    "scheduleFlush — DEBOUNCED batch flush, not a poll: it only arms when a log event is queued, returns early if a timer already exists, and flushBeacon returns early on an empty queue. No events, no timer, no request.",
  "extensions/daily-notes/components/PeriodicNotesShellController.tsx":
    "scheduleNextRun — genuinely recurring, but the delay is getNextPeriodicRolloverDelay(): it fires at the next DAILY rollover. One request per day.",
  "components/content/ai-context/ContextAiPanel.tsx":
    "saveDirectives — debounced save, armed by user edits.",
  "components/settings/ui/save-state.ts":
    "send / clearTimer — the settings autosave debounce.",
  "lib/domain/ai/acquisition/server-fetch.ts":
    "fetchOnce — server-side retry with backoff, bounded by attempt count.",
  "lib/domain/ai/image/generate.ts":
    "json — false positive; a poll-for-result loop bounded by a deadline, server-side.",
  "lib/domain/tenancy/use-user-tenants.ts":
    "fetchUserTenants — false positive. The setTimeout is `inflight = null` at delay 0, an in-flight dedup reset.",
  "extensions/workplaces/state/workspace-store.ts":
    "fetchWorkspaceMutation — false positive. The setTimeout is an AbortController request timeout.",
  "extensions/flashcards/components/FlashcardReviewOverlay.tsx":
    "goToIndex — false positive; card-advance animation timing.",
  "extensions/browser-bookmarks/browser-extension/src/background/index.js":
    "finish — false positive; a co-browse operation timeout.",
};

function countMatches(source: string, re: RegExp): number {
  return (source.match(new RegExp(re.source, "g")) ?? []).length;
}

function main() {
  const declaredByFile = new Map(REGISTRY.map((d) => [d.file, d]));
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const reschedulingSeen = new Set<string>();

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

    // Self-rescheduling setTimeout is checked SEPARATELY from the timer count,
    // against its own reviewed list. It has lower precision than the other
    // matchers, so folding it into the main registry would flood a list whose
    // value depends on every entry being worth reading.
    const rescheduling = findSelfReschedulingTimers(source);
    if (rescheduling.length > 0) {
      reschedulingSeen.add(rel);
      if (!(rel in REVIEWED_RECURRING_TIMEOUTS)) {
        errors.push(
          `RECURRING     ${rel}\n` +
            `    Self-rescheduling setTimeout: ${rescheduling.join(", ")}\n` +
            `    A setTimeout that re-arms itself is a recurring timer, and this file\n` +
            `    reaches the network. Route it through registerPollingTask() so it\n` +
            `    inherits hidden AND idle gating, or add a line to\n` +
            `    REVIEWED_RECURRING_TIMEOUTS saying why it is not a poll.`
        );
      }
    }

    const timers =
      countMatches(source, CALL_RE) +
      countMatches(source, EVENTSOURCE_RE) +
      countMatches(source, ALARM_RE);
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

    // "ui-only" is the one policy that skips every other check, which makes it
    // the obvious place to hide a network poller — deliberately or by drift, when
    // someone adds a fetch to a file that used to be a pure animation. Asserting
    // the file has no network calls at all is a blunt proxy, but a correct one:
    // a file whose timers are genuinely local has no reason to contain any.
    if (
      declared.policy === "ui-only" &&
      !declared.networkUnrelated &&
      NETWORK_RE.test(source)
    ) {
      errors.push(
        `UI-ONLY LIES  ${rel}\n` +
          `    Declared "ui-only" but the file makes network calls.\n` +
          `    Either its timer does network work — in which case it belongs on the\n` +
          `    scheduler via registerPollingTask() — or the calls are unrelated to the\n` +
          `    timer, in which case trace them and set networkUnrelated: true with a note\n` +
          `    saying what they are.\n` +
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

  for (const file of Object.keys(REVIEWED_RECURRING_TIMEOUTS)) {
    if (reschedulingSeen.has(file)) continue;
    errors.push(
      `STALE RECURRING  ${file}\n` +
        `    Listed in REVIEWED_RECURRING_TIMEOUTS but no self-rescheduling timer\n` +
        `    was found. If it moved to registerPollingTask(), remove the entry.`
    );
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
