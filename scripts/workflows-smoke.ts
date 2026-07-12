/**
 * Workflows smoke script — exercises the dispatch path end-to-end at the
 * service level (below route auth). Grows with each session; Session 1
 * scope: dispatch → queued run + run.dispatched event → list/detail reads.
 *
 * Run:  set -a; source .env.local; set +a; npx tsx scripts/workflows-smoke.ts
 */
import { prisma } from "@/lib/database/client";
import {
  dispatchWorkflow,
  isDispatchFailure,
} from "@/extensions/workflows/server/dispatch";
import {
  getRunDetailForOwner,
  listRunsForOwner,
} from "@/extensions/workflows/server/runs";

async function main() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) {
    throw new Error(
      "No user in the dev database — sign in once before running the smoke script."
    );
  }

  console.log(`dispatching as ${user.username} (${user.id})`);
  const result = await dispatchWorkflow(user.id, "job-application", {
    pageUrl: "https://example.com/jobs/staff-engineer",
    pageText: "Smoke-test job listing body.",
  });
  if (isDispatchFailure(result)) {
    throw new Error(`dispatch failed — ${result.code}: ${result.message}`);
  }
  console.log(
    `run ${result.run.id} status=${result.run.status} engine=${result.run.engine}`
  );

  const detail = await getRunDetailForOwner(result.run.id, user.id);
  if (!detail) throw new Error("run detail lookup returned null");
  console.log(
    `events: ${detail.events.map((e) => `${e.seq}:${e.type}`).join(", ") || "(none)"}`
  );
  if (detail.status !== "queued") {
    throw new Error(`expected queued run, got ${detail.status}`);
  }
  if (!detail.events.some((e) => e.type === "run.dispatched")) {
    throw new Error("missing run.dispatched event");
  }

  const invalid = await dispatchWorkflow(user.id, "job-application", {});
  if (!isDispatchFailure(invalid) || invalid.code !== "VALIDATION_ERROR") {
    throw new Error("expected VALIDATION_ERROR for empty input");
  }
  console.log(`input validation rejects empty input: ok`);

  const unknown = await dispatchWorkflow(user.id, "does-not-exist", {});
  if (!isDispatchFailure(unknown) || unknown.code !== "UNKNOWN_WORKFLOW") {
    throw new Error("expected UNKNOWN_WORKFLOW for bad slug");
  }
  console.log(`unknown slug rejected: ok`);

  const runs = await listRunsForOwner(user.id, { limit: 5 });
  console.log(`recent runs: ${runs.length}`);
  console.log("SMOKE PASS");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("SMOKE FAIL:", error);
    process.exit(1);
  });
