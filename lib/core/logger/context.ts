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
