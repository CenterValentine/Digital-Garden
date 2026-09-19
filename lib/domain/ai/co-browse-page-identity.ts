/**
 * Page identity for co-browse snapshot deltas (AI-CONTEXT-ECONOMICS-PLAN B2).
 *
 * A delta is only meaningful against a base of the SAME document. The base
 * used to be keyed on the full URL, so any query-string change forced a full
 * keyframe — and on LinkedIn every job-card click rewrites `?currentJobId=`
 * without loading a new document. Measured: 55 of 65 act results were full
 * snapshots (417 kB of unchanged page chrome) and only 10 were deltas.
 *
 * Identity is origin + pathname. A query string or hash is STATE within a
 * document, not a new document; when a same-path change really does replace
 * the page, the churn ratio in coBrowseSnapshotOrDelta still forces a
 * keyframe. Pure and client-safe — imported by the engine and by the
 * context-diet gate.
 */
export function coBrowsePageIdentity(url: string): string {
  try {
    const u = new URL(url);
    // Opaque origins (about:, data:, blob:) serialize as "null" — fall
    // through to the textual strip rather than keying every such page alike.
    if (u.origin !== "null") return `${u.origin}${u.pathname}`;
  } catch {
    // Not an absolute URL (a relative path, garbage) — handled below.
  }
  // Strip query and hash textually so the comparison still ignores state.
  return url.replace(/[?#].*$/, "");
}
