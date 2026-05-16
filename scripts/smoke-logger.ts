// Smoke test for the Phase 1 logger module. Run with:
//   pnpm tsx scripts/smoke-logger.ts
//
// Exercises: trace context, nested spans, leaf events with explicit layer,
// span fail path, summary updates mid-span, payload sidecar, end-of-trace
// summary block.

import {
  logger,
  withSpan,
  withTrace,
  writePayload,
} from "../lib/core/logger";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function happyPath() {
  await withTrace("smoke-happy-abcdef12", async () => {
    await withSpan(
      { layer: "route", name: "request" },
      { attrs: { method: "GET" }, summary: "GET /api/content/content/node_987" },
      async (rootSpan) => {
        await withSpan(
          { layer: "auth", name: "session" },
          { summary: "session lookup" },
          async (s) => {
            await sleep(8);
            s.attr("user_id_hash", "uh_abc123").summary("user_abc123");
          },
        );

        await withSpan(
          { layer: "content", name: "payload" },
          { attrs: { content_id: "node_987" }, summary: "node_987" },
          async (s) => {
            await sleep(20);
            const payloadRef = await writePayload(
              "smoke-happy-abcdef12",
              "content_payload",
              { id: "node_987", kind: "note", blocks: 38 },
            );
            if (payloadRef) {
              logger.info({
                event: "payload:dumped",
                summary: "sidecar written",
                payload_ref: payloadRef,
              });
            }
            await withSpan(
              { layer: "storage", name: "fetch" },
              { attrs: { provider: "r2" }, summary: "r2://bucket/..." },
              async (sg) => {
                await sleep(6);
                sg.attr("bytes", 1024);
              },
            );
            s.attr("block_count", 38).summary("38 blocks");
          },
        );

        // Cross-layer leaf event — uses explicit layer override.
        logger.info({
          layer: "editor",
          event: "tiptap:initialized",
          summary: "tab_notes",
        });

        // Leaf event scoped to the route layer (implicit, inherits from rootSpan).
        rootSpan.event("tags:resolved", {
          summary: "12 tags",
          attrs: { count: 12 },
        });

        rootSpan.summary("200 OK");
      },
    );
  });
}

async function failPath() {
  await withTrace("smoke-fail-deadbeef", async () => {
    try {
      await withSpan(
        { layer: "external", name: "google_drive_call" },
        { attrs: { method: "POST" }, summary: "POST /files/123" },
        async () => {
          await sleep(4);
          throw new Error("rate limited by Google Drive");
        },
      );
    } catch {
      // expected
    }
  });
}

async function leafGuards() {
  await withTrace("smoke-leaf-cafebabe", async () => {
    // Without layer and without an active span → must throw.
    let threwAsExpected = false;
    try {
      logger.warn({ event: "no_layer_no_span" });
    } catch {
      threwAsExpected = true;
    }
    logger.warn({
      layer: "route",
      event: "guard_check",
      summary: threwAsExpected ? "guard fired" : "guard MISSED",
      attrs: { passed: threwAsExpected },
    });
  });
}

async function main() {
  process.stdout.write("\n--- HAPPY PATH ---\n");
  await happyPath();
  process.stdout.write("\n--- FAIL PATH ---\n");
  await failPath();
  process.stdout.write("\n--- LEAF GUARDS ---\n");
  await leafGuards();
  process.stdout.write("\n--- DONE ---\n");
}

main().catch((err) => {
  process.stderr.write(`smoke test crashed: ${String(err)}\n`);
  process.exit(1);
});
