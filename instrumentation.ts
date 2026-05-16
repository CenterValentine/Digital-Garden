// Next.js instrumentation entry point.
//
// register() runs once per Node runtime when the server starts. We use it as
// the marker for "logger module is loaded" and to confirm the configured
// runtime supports AsyncLocalStorage. Per-request trace context is set up by
// withRouteTrace in lib/core/logger/route-trace.ts, not here — see the
// rationale in that file's header.
//
// Future hook for @vercel/otel: when we wire OpenTelemetry export, the SDK
// initialization goes inside register().

export async function register() {
  // node:async_hooks is not available in the Edge runtime. If a route opts
  // into "edge" and reaches the logger, it will throw on import — by design.
  // No need to test for the runtime here; let the import-time error surface
  // in the affected route.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.stdout.write(
      "[instrumentation] observability logger registered (Node runtime)\n",
    );
  }
}
