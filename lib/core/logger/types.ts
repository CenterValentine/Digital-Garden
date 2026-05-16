// Closed-set types form the logger's vocabulary. Adding to these sets is a
// deliberate decision recorded in OBSERVABILITY-CLEANUP-PLAN.md, not an
// inline change.

export type Level = "debug" | "info" | "warn" | "error" | "fatal";

export type Layer =
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
