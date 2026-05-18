// Closed-set types form the logger's vocabulary. Adding to these sets is a
// deliberate decision recorded in OBSERVABILITY-CLEANUP-PLAN.md, not an
// inline change.

export type Level = "debug" | "info" | "warn" | "error" | "fatal";

// Server runtime layers. Used by every emit on the Node side.
export type ServerLayer =
  | "route"
  | "auth"
  | "tree"
  | "content"
  | "editor"
  | "collab"
  | "storage"
  | "ai"
  | "export"
  | "external"
  | "browser_ext"
  | "periodic"
  | "admin";

// Browser runtime layers. Used by client.ts emits. Per FRONTEND-LOG-CHARTER.md.
// `route` and `editor` overlap with ServerLayer keys but mean different things
// in context: on the server it's a request handler / TipTap server-safe
// extensions; on the client it's an App Router transition / TipTap editor view.
export type FrontendLayer =
  | "page"
  | "route"
  | "ui"
  | "editor"
  | "store"
  | "fetch"
  | "error";

// Unified Layer type. Server emits will only ever use ServerLayer values,
// client emits will only ever use FrontendLayer values. The type stays open
// enough to deserialize both shapes through the beacon endpoint.
export type Layer = ServerLayer | FrontendLayer;

export type Marker =
  | "requested"
  | "resolved"
  | "started"
  | "completed"
  | "failed"
  | "skipped"
  | "retried"
  | "promoted"
  | "demoted";

// Scalar-only attribute values — the PII firewall by type. Any non-scalar
// would have to be turned into a sidecar payload reference via writePayload.
export type AttrValue = string | number | boolean;
export type Attrs = Readonly<Record<string, AttrValue>>;

export type LogError = {
  name: string;
  message: string;
  code?: string;
};

export type LogEvent = {
  trace_id: string;
  span_id?: string;
  parent_span_id?: string;
  ts: string;
  level: Level;
  layer: Layer;
  event: string;
  duration_ms?: number;
  status?: "ok" | "error" | "skipped";
  summary?: string;
  attrs?: Attrs;
  payload_ref?: string;
  error?: LogError;
};

// Argument shape for startSpan / withSpan.
export type SpanName = {
  layer: Layer;
  name: string;
};

// Internal mutable span record held in the AsyncLocalStorage stack.
// Not exported from index.ts — consumers see SpanHandle instead.
export type ActiveSpan = {
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  layer: Layer;
  name: string;
  depth: number;
  startedAt: number; // performance.now()
  attrs: Map<string, AttrValue>;
};
