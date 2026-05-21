// Client-side observability primitives. Server-side logger lives at
// `@/lib/core/logger`.
//
// Mount these alongside any high-traffic route to wire it into the trace
// pipeline. They're cheap (no-op when no errors fire) and trace-id-aware.

export { PageLifecycle } from "./PageLifecycle";
export type { PageLifecycleProps } from "./PageLifecycle";
export { WebVitalsReporter } from "./WebVitalsReporter";
export type { WebVitalsReporterProps } from "./WebVitalsReporter";
