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
  /**
   * The editor's Y state, when it is bound to a collaborative copy with no
   * live connection (collaboration-local — a note open by one person). Its
   * edits then reach the server only through this REST save; the route merges
   * this copy into the stored one so the two never drift apart. Without it, a
   * collaborator arriving later got the same edits twice (the server's own
   * catch-up, then this editor's copy). See `collaboration/lineage.ts`.
   */
  collaborationUpdate?: Uint8Array;
}

/**
 * Largest Y state a save carries, in base64 characters — leaves room for the
 * document JSON beside it under the platform's 4.5 MB request limit. A larger
 * copy is left out (the save itself must never fail for it); it reaches the
 * server when the editor connects.
 */
export const COLLABORATION_UPDATE_MAX_CHARS = 2_500_000;

/** Browsers refuse a keepalive request whose body is over 64 KiB. */
const KEEPALIVE_BODY_MAX_CHARS = 60_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let at = 0; at < bytes.length; at += chunk) {
    binary += String.fromCharCode(...bytes.subarray(at, at + chunk));
  }
  return btoa(binary);
}

/**
 * The JSON body of a note save (`PATCH /api/content/content/[id]`): the
 * document, the user-intent fields, and the editor's Y state when it fits.
 * One builder so the main editor and Note Windows cannot drift.
 */
export function noteSaveBody(content: unknown, meta?: SaveMeta): string {
  const body: Record<string, unknown> = {
    tiptapJson: content,
    ...(meta?.userInitiated === true && { userInitiated: true }),
    ...(typeof meta?.secondsSinceInput === "number" && {
      secondsSinceInput: meta.secondsSinceInput,
    }),
  };
  const withoutUpdate = JSON.stringify(body);
  if (!meta?.collaborationUpdate || meta.collaborationUpdate.length === 0) return withoutUpdate;

  const encoded = bytesToBase64(meta.collaborationUpdate);
  const fits = meta.keepalive
    ? withoutUpdate.length + encoded.length + 32 <= KEEPALIVE_BODY_MAX_CHARS
    : encoded.length <= COLLABORATION_UPDATE_MAX_CHARS;
  return fits ? JSON.stringify({ ...body, collaborationUpdate: encoded }) : withoutUpdate;
}
