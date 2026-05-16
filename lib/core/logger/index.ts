// Public API for the logger module.
//
// Server-only — imports node:async_hooks. Do not import from "use client"
// components. Frontend has its own client-safe entry point (Phase 5,
// per FRONTEND-LOG-CHARTER.md).
//
// See docs/notes-feature/work-tracking/OBSERVABILITY-CLEANUP-PLAN.md for
// the decisions encoded here (event shape, layer set, span model).

export { logger } from "./emit";
export { startSpan, withSpan } from "./span";
export type { SpanHandle, SpanOptions } from "./span";
export { getActiveSpan, getActiveTrace, withTrace } from "./context";
export { withRouteTrace } from "./route-trace";
export type { RouteTraceOptions } from "./route-trace";
export { writePayload } from "./payload-sidecar";
export type {
  Attrs,
  AttrValue,
  Layer,
  Level,
  LogError,
  LogEvent,
  Marker,
  SpanName,
} from "./types";
