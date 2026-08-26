/**
 * Editor Debug Tooling (Development Only)
 *
 * Kept out of `lib/domain/editor/index.ts` on purpose — that barrel already
 * carries an import-graph warning, and nothing server-side should ever pull
 * this in.
 */

export { inputTraceRecorder } from "./input-trace";
export { buildInputTraceMarkdown, buildInputTraceJson } from "./report";
export type {
  InputTraceEvent,
  InputTraceEventKind,
  InputTraceOptions,
  InputTraceSession,
  InputTraceSessionMeta,
  InputTraceSnapshot,
  InputTraceStep,
  InputTraceTransactionInfo,
} from "./types";
