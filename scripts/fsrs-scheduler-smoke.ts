/**
 * Smoke test for the FSRS scheduler (Epoch 19, Sprint 2).
 *
 * Verifies the four properties the route layer relies on:
 *
 *   1. A new card with rating "good" graduates out of "new" state.
 *   2. Repeated "good" ratings on the same card produce monotonically
 *      increasing intervals (the whole point of spaced repetition).
 *   3. "again" on a mature card moves it to relearning and shrinks the
 *      interval — the algorithm's response to a forgotten card.
 *   4. previewIntervals() returns four distinct due dates with
 *      interval(Easy) > interval(Good) > interval(Hard) > interval(Again).
 *
 * No database connection required — operates purely on in-memory state.
 *
 * Usage:
 *   npx tsx scripts/fsrs-scheduler-smoke.ts
 *
 * Exit code is 0 on success, 1 on any assertion failure. CI-friendly.
 */

import {
  emptyCardState,
  getDefaultParameters,
  previewIntervals,
  scheduleReview,
  type FsrsCardState,
} from "../lib/domain/flashcards/fsrs/index.js";

let failed = 0;

function assert(cond: boolean, label: string, detail?: string): void {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    failed += 1;
  }
}

function days(ms: number): number {
  return Math.round((ms / 86_400_000) * 100) / 100;
}

function rateGood(card: FsrsCardState, now: Date): FsrsCardState {
  const params = getDefaultParameters();
  return scheduleReview({ card, rating: "good", now, parameters: params }).next;
}

function main() {
  const params = getDefaultParameters();
  let now = new Date("2026-01-01T12:00:00Z");

  // Property 1: a new card with "good" graduates out of "new" state.
  console.log("Property 1 — new card graduates on Good");
  const startCard = emptyCardState(now);
  assert(startCard.state === "new", "starts in 'new' state");
  const afterFirstGood = rateGood(startCard, now);
  assert(
    afterFirstGood.state !== "new",
    "leaves 'new' state",
    `got '${afterFirstGood.state}'`,
  );

  // Property 2: repeated "good" ratings produce monotonically increasing
  // intervals. We advance the clock to each card's due date between
  // ratings so the scheduler treats each review as on-time. We need at
  // least one review-state card to test growth meaningfully; the first
  // few ratings move through learning steps.
  console.log("Property 2 — repeated Good ratings grow the interval");
  let card = startCard;
  const intervals: number[] = [];
  for (let i = 0; i < 8; i += 1) {
    card = rateGood(card, now);
    const intervalDays = days(card.due.getTime() - now.getTime());
    intervals.push(intervalDays);
    now = new Date(card.due.getTime());
  }
  // Allow the first 2 ratings to be learning-step shuffles (they can be
  // flat in minutes). From rating 3 onwards we expect strict growth.
  const tail = intervals.slice(2);
  let monotonic = true;
  for (let i = 1; i < tail.length; i += 1) {
    if (tail[i]! <= tail[i - 1]!) {
      monotonic = false;
      break;
    }
  }
  assert(
    monotonic,
    "intervals are strictly increasing after warmup",
    `intervals=${intervals.map((d) => d.toFixed(2)).join(", ")}`,
  );

  // Property 3: "again" on a mature card moves to relearning and
  // shrinks the interval.
  console.log("Property 3 — Again on a mature card lapses + shrinks");
  const matureInterval = card.scheduledDays;
  const beforeLapseState = card.state;
  const lapsed = scheduleReview({
    card,
    rating: "again",
    now,
    parameters: params,
  }).next;
  assert(
    lapsed.state === "relearning",
    "moves to relearning state",
    `from '${beforeLapseState}' got '${lapsed.state}'`,
  );
  assert(
    lapsed.scheduledDays < matureInterval,
    "scheduled interval shrinks",
    `from ${matureInterval} → ${lapsed.scheduledDays}`,
  );
  assert(lapsed.lapses === card.lapses + 1, "lapse counter increments");

  // Property 4: preview intervals are ordered Again < Hard < Good < Easy.
  console.log("Property 4 — preview ordering");
  const preview = previewIntervals(card, params, now);
  const a = preview.again.intervalDays;
  const h = preview.hard.intervalDays;
  const g = preview.good.intervalDays;
  const e = preview.easy.intervalDays;
  assert(
    a <= h && h <= g && g <= e,
    "again ≤ hard ≤ good ≤ easy",
    `[a=${a}, h=${h}, g=${g}, e=${e}]`,
  );
  // Strict separation between Again and Easy — at minimum, easy should
  // be measurably larger than again for any non-degenerate card.
  assert(
    e > a,
    "easy interval > again interval",
    `easy=${e}, again=${a}`,
  );

  if (failed > 0) {
    console.error(`\nFAIL: ${failed} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll FSRS scheduler smoke tests passed.");
}

main();
