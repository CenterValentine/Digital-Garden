import { AsyncLocalStorage } from "node:async_hooks";
import type { ActiveSpan } from "./types";

// AsyncLocalStorage scopes trace context to the async chain that owns it.
// Required for correctness under Fluid Compute, which reuses function
// instances across concurrent requests — module-level state would
// cross-contaminate traces.

type TraceContext = {
  trace_id: string;
  spanStack: ActiveSpan[];
};

const als = new AsyncLocalStorage<TraceContext>();

export function withTrace<T>(
  trace_id: string,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return als.run({ trace_id, spanStack: [] }, fn);
}

export function getActiveTrace(): TraceContext | undefined {
  return als.getStore();
}

export function getActiveSpan(): ActiveSpan | undefined {
  const ctx = als.getStore();
  if (!ctx || ctx.spanStack.length === 0) return undefined;
  return ctx.spanStack[ctx.spanStack.length - 1];
}

export function pushSpan(span: ActiveSpan): void {
  const ctx = als.getStore();
  if (!ctx) {
    throw new Error(
      "[logger] pushSpan called outside withTrace — instrumentation.ts must wrap requests",
    );
  }
  ctx.spanStack.push(span);
}

export function popSpan(): ActiveSpan | undefined {
  const ctx = als.getStore();
  if (!ctx) return undefined;
  return ctx.spanStack.pop();
}

/**
 * Fork the trace context for a parallel branch.
 *
 * Why this exists: `Promise.all([withSpan(A), withSpan(B)])` puts both
 * spans on the same `ctx.spanStack` because Promise.all does not isolate
 * AsyncLocalStorage between its branches. The synchronous `startSpan`
 * calls both run before either await resumes, so B sees A on top of the
 * stack and gets recorded as A's child. Wall-clock duration is still
 * correct (both run in parallel), but the parent_span_id and stack
 * ordering are wrong — sub-spans inside fnA might see B as their parent.
 *
 * `forkTraceContext` runs its callback inside a new ALS scope whose
 * spanStack is a *snapshot* of the parent's stack at fork time. Push/pop
 * inside the branch don't touch the parent's stack or sibling branches.
 * Trace_id is preserved so all events still land in the same trace file.
 *
 * Usage:
 *   const [a, b] = await Promise.all([
 *     forkTraceContext(() => withSpan("auth:session", ..., () => fnA())),
 *     forkTraceContext(() => withSpan("content:payload", ..., () => fnB())),
 *   ]);
 *
 * Outside a trace context, this is a no-op (just invokes fn).
 */
export function forkTraceContext<T>(
  fn: () => T | Promise<T>,
): T | Promise<T> {
  const ctx = als.getStore();
  if (!ctx) return fn();
  return als.run(
    { trace_id: ctx.trace_id, spanStack: [...ctx.spanStack] },
    fn,
  );
}
