import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { logger } from "@/lib/core/logger";
import { withRouteTrace } from "@/lib/core/logger/route-trace";
import type { AttrValue, FrontendLayer, LogEvent } from "@/lib/core/logger/types";

export const runtime = "nodejs";

// Per FRONTEND-LOG-CHARTER.md:
// - Only `error` and `fatal` levels are accepted; everything else is silently
//   dropped (defense in depth — the client wrapper already gates, but the
//   server must not trust the client).
// - Rate-limited at 100 events / session / minute.
// - Re-emits through the server logger with `attrs.source = "client"` and
//   `attrs.client_trace_id = <event.trace_id>`. The transport request gets
//   its own server-side trace via withRouteTrace, distinct from the
//   originating client trace.

const ALLOWED_FRONTEND_LAYERS: ReadonlySet<FrontendLayer> = new Set([
  "page",
  "route",
  "ui",
  "editor",
  "store",
  "fetch",
  "error",
]);

const MAX_EVENTS_PER_REQUEST = 50;
const RATE_LIMIT_PER_MINUTE = 100;

// In-memory rate limit bucket keyed by session userId. This is best-effort —
// the app runs on Fluid Compute, so multiple instances each hold their own
// bucket. For "spam protection" semantics that's fine; for hard guarantees
// we'd need a shared store (Redis / DB). The charter scoped this small.
type Bucket = { count: number; windowStartedAt: number };
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const existing = buckets.get(userId);
  if (!existing || now - existing.windowStartedAt > WINDOW_MS) {
    buckets.set(userId, { count: 1, windowStartedAt: now });
    return true;
  }
  if (existing.count >= RATE_LIMIT_PER_MINUTE) {
    return false;
  }
  existing.count += 1;
  return true;
}

type IncomingEvent = Partial<LogEvent> & {
  level?: string;
  layer?: string;
  event?: string;
};

function isAllowedLayer(value: unknown): value is FrontendLayer {
  return typeof value === "string" && ALLOWED_FRONTEND_LAYERS.has(value as FrontendLayer);
}

function sanitizeScalarRecord(input: unknown): Record<string, AttrValue> | undefined {
  if (!input || typeof input !== "object") return undefined;
  const out: Record<string, AttrValue> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    }
    // Drop everything else silently — the redactor on the server-emit will
    // run again, but bad shapes never reach it.
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: "/api/logs/client" }, async () => {
    try {
      const session = await requireAuth();
      const userId = session.user.id;

      if (!checkRateLimit(userId)) {
        logger.warn({
          layer: "route",
          event: "client_beacon:rate_limited",
          summary: "client log beacon dropped",
          attrs: { user_id: userId },
        });
        return NextResponse.json(
          { success: false, error: { code: "RATE_LIMITED", message: "Too many log events" } },
          { status: 429 }
        );
      }

      const body = (await request.json()) as { events?: IncomingEvent[] };
      const events = Array.isArray(body?.events) ? body.events.slice(0, MAX_EVENTS_PER_REQUEST) : [];

      let accepted = 0;
      let dropped = 0;

      for (const ev of events) {
        if (ev.level !== "error" && ev.level !== "fatal") {
          dropped += 1;
          continue;
        }
        if (!isAllowedLayer(ev.layer)) {
          dropped += 1;
          continue;
        }
        if (typeof ev.event !== "string" || ev.event.length === 0) {
          dropped += 1;
          continue;
        }

        const attrs: Record<string, AttrValue> = {
          ...(sanitizeScalarRecord(ev.attrs) ?? {}),
          source: "client",
          client_trace_id: typeof ev.trace_id === "string" ? ev.trace_id : "unknown",
          user_id: userId,
        };

        const emitFn = ev.level === "fatal" ? logger.fatal : logger.error;
        emitFn({
          layer: ev.layer,
          event: ev.event,
          summary: typeof ev.summary === "string" ? ev.summary : undefined,
          attrs,
          error: ev.error,
        });
        accepted += 1;
      }

      return NextResponse.json({
        success: true,
        data: { accepted, dropped },
      });
    } catch (error) {
      logger.error({
        layer: "route",
        event: "client_beacon:caught",
        summary: "POST caught",
        error,
      });
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "SERVER_ERROR",
            message: error instanceof Error ? error.message : "Failed to ingest client logs",
          },
        },
        { status: 500 }
      );
    }
  });
}
