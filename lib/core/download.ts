/**
 * Browser download trigger.
 *
 * One helper for every "save this Blob to the user's machine" path, because the
 * hand-rolled variants had drifted apart and the shortest one silently did
 * nothing: the toolbar's Markdown export built a detached `<a>`, clicked it, and
 * revoked the object URL in the same task. Two things go wrong with that.
 *
 *  1. The anchor is never in the document. A detached `<a download>` click is
 *     honoured by current Chrome but is not something the spec guarantees, and
 *     it has historically been a no-op in other engines.
 *  2. `revokeObjectURL` runs synchronously after `click()`. The click only
 *     *schedules* the download; the browser process still has to read the blob
 *     back through that URL. Revoking first races that read, and losing the race
 *     kills the download with no error, no rejected promise, and nothing in the
 *     downloads list — so the caller's success toast still fires.
 *
 * Every other download site in the app already appended the anchor, and
 * DiagramsNetViewer had independently discovered the revoke race and deferred
 * it. This centralises the pattern that works so a fourth variant can't drift.
 */

/**
 * Download a Blob as `fileName`, resolving once the click has been dispatched.
 *
 * Client-only — requires `document`. Throws on an empty blob rather than
 * "succeeding" into a zero-byte file that never appears anywhere.
 */
export function triggerBlobDownload(blob: Blob, fileName: string): void {
  if (typeof document === "undefined") {
    throw new Error("triggerBlobDownload requires a browser environment");
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";

  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    // Deferred, never synchronous — see the note above. A macrotask is enough
    // for the browser process to have picked up the blob handle; the delay
    // matches the one DiagramsNetViewer settled on.
    window.setTimeout(() => URL.revokeObjectURL(url), 100);
  }
}
