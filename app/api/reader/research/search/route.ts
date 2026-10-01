/**
 * POST /api/reader/research/search — federated search across a scope's
 * sources, streamed as NDJSON (RESEARCH-READER-PLAN.md §2.3): one line per
 * event — `{"type":"source",...}` as each source answers and
 * `{"type":"works",...}` with the merged list so far — then `{"type":"done"}`.
 * A slow source never holds back a fast one.
 *
 * A whole-query identifier ("10.1038/…", "arXiv:2401.01234") is NOT handled
 * here; the client sends those to /resolve (the identifier jump).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { readerRoute } from "@/lib/domain/reader/server/route";
import { searchWorks } from "@/lib/domain/research/server/service";
import type { FederationEvent } from "@/lib/domain/research/federate";

const body = z.object({
  scope: z.string().min(1).max(40),
  query: z.object({
    text: z.string().trim().min(1, "Type something to search").max(500),
    yearFrom: z.number().int().min(1000).max(3000).optional(),
    yearTo: z.number().int().min(1000).max(3000).optional(),
    openAccess: z.boolean().optional(),
    types: z.array(z.string().max(40)).max(20).optional(),
    field: z.string().max(40).optional(),
    venue: z.string().max(300).optional(),
    author: z.string().max(300).optional(),
    sort: z.enum(["relevance", "recent", "cited"]).optional(),
  }),
  include: z.array(z.string().max(40)).max(40).optional(),
  exclude: z.array(z.string().max(40)).max(40).optional(),
  cursors: z.record(z.string(), z.string().max(2000).nullable()).optional(),
});

export const POST = readerRoute("/api/reader/research/search", async ({ ownerId, request }) => {
  const input = body.parse(await request.json());
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: FederationEvent | { type: "done" } | { type: "error"; message: string }) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        await searchWorks({
          ownerId,
          scopeId: input.scope,
          query: input.query,
          include: input.include,
          exclude: input.exclude,
          cursors: input.cursors,
          onEvent: send,
        });
        send({ type: "done" });
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : "Search failed" });
      } finally {
        controller.close();
      }
    },
  });
  return new NextResponse(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
});
