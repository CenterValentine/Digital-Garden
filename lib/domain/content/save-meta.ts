/**
 * Metadata the editor attaches to a REST autosave.
 *
 * Shared by MarkdownEditor (produces it), ExpandableEditor (forwards it) and
 * MainPanelContent.handleSave (consumes it), so the three cannot drift.
 */
export interface SaveMeta {
  /**
   * True when a user gesture (keystroke, paste, drop) preceded the save. The
   * content PATCH route lets a user-initiated save past the shrink-refusal
   * guard; an app-state save (editor mount race) gets no such pass.
   */
  userInitiated?: boolean;
  /** Telemetry only — calibrates the recency window behind `userInitiated`. */
  secondsSinceInput?: number;
  /**
   * The save is a FLUSH: the editor is unmounting, the pane is navigating, or
   * the page is going away, and a debounced save was still pending. The
   * editor snapshotted the target id and callback at edit time, so this save
   * is bound to the document the edit came from — the consumer must not
   * re-check "is this still the active document", because by definition it
   * no longer is. That check exists to stop a stale timer writing Doc A over
   * Doc B; the snapshot already guarantees it cannot.
   *
   * Before flushes existed, every one of these saves was silently DROPPED. A
   * continuous edit followed by a tab switch inside the 2s debounce lost the
   * whole edit — the timer had reset on every keystroke and never fired
   * (charter "Career Hunt II", 2026-09-15).
   */
  flush?: boolean;
  /**
   * Use `fetch({ keepalive: true })` so the request survives page unload.
   * Set with `flush` on `pagehide` / `visibilitychange → hidden`.
   */
  keepalive?: boolean;
}
