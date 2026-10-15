/**
 * ⇧⌘V (Ctrl+Shift+V) — "paste as text", extended to images. OCR-PASTE-PLAN.md D1.
 *
 * Two paths, because browsers disagree about what ⇧⌘V delivers:
 *
 * 1. **A paste event with the image** (browsers that pass files on a Shift
 *    paste). A ClipboardEvent carries no modifier state, so `isPasteAsText()`
 *    reports the last key event's Shift; the editor's paste handler OCRs the
 *    image instead of uploading it.
 *
 * 2. **No usable paste event** — Chrome on macOS (owner report 2026-10-08:
 *    ⇧⌘V with a screenshot did nothing, so the paste handler never saw the
 *    image — either no event fired or it arrived without the file). So the
 *    editor watches the chord itself (`handlePasteAsTextChord` from its
 *    keydown): it waits a moment for a paste event that carried content; if
 *    one arrived, the paste handler owns it; if none did, the editor does the
 *    "paste as text" itself — an image goes to OCR, plain text is inserted as
 *    plain text. (Headless Chromium cannot reproduce the real chord: Playwright
 *    maps only ⌘V to a paste on macOS, so this path is tested by simulating
 *    both outcomes, not by pressing the keys.)
 *
 * Reading only when no paste arrived matters: Chrome asks for clipboard
 * permission on the first read, and that prompt must never interrupt an
 * ordinary plain-text paste.
 */
import { toast } from "sonner";

let shiftHeld = false;
let installed = false;
/** performance.now() of the last paste event any editor saw. */
let lastPasteEventAt = Number.NEGATIVE_INFINITY;

/** How long to wait for the browser's own paste event before reading the clipboard. */
const PASTE_EVENT_GRACE_MS = 80;

export function installPasteModifierTracker(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const update = (event: KeyboardEvent) => {
    shiftHeld = event.shiftKey;
  };
  // Capture phase: an editor's own key handling cannot hide the event.
  window.addEventListener("keydown", update, true);
  window.addEventListener("keyup", update, true);
  // A keyup lost to another window must not leave Shift "stuck".
  window.addEventListener("blur", () => {
    shiftHeld = false;
  });
}

export function isPasteAsText(): boolean {
  return shiftHeld;
}

/**
 * Editors call this first thing in their paste handler. Only a paste that
 * carried something counts — an empty one (a browser that stripped the image)
 * must not stop the chord watcher from reading the clipboard.
 */
export function notePasteEvent(event: ClipboardEvent): void {
  const data = event.clipboardData;
  if (data && (data.types.length > 0 || data.files.length > 0)) {
    lastPasteEventAt = performance.now();
  }
}

/** ⇧⌘V / Ctrl+Shift+V (no Alt — ⌥⇧⌘V is macOS "Paste and Match Style"). */
export function isPasteAsTextChord(event: KeyboardEvent): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    event.shiftKey &&
    !event.altKey &&
    event.key.toLowerCase() === "v"
  );
}

/**
 * Call from the editor's keydown when `isPasteAsTextChord(event)`. Never
 * prevents the default. Only when no paste with content follows is the
 * clipboard read: an image goes to `onImage` (OCR), otherwise plain text goes
 * to `onText`. Image wins when both are present — ⇧⌘V on an image is a request
 * for its words.
 */
export function handlePasteAsTextChord(handlers: {
  onImage: (image: Blob) => void;
  onText: (text: string) => void;
}): void {
  const pressedAt = performance.now();
  setTimeout(() => {
    if (lastPasteEventAt >= pressedAt) return; // the browser delivered a paste — its handler owns it
    if (!navigator.clipboard?.read) return;
    void (async () => {
      let items: ClipboardItems;
      try {
        items = await navigator.clipboard.read();
      } catch {
        toast.error(
          "The browser blocked reading the clipboard. Allow clipboard access for this site (the icon at the left of the address bar), then press ⇧⌘V again.",
          { duration: 8000 },
        );
        return;
      }
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith("image/"));
        if (type) {
          handlers.onImage(await item.getType(type));
          return;
        }
      }
      for (const item of items) {
        if (item.types.includes("text/plain")) {
          const text = await (await item.getType("text/plain")).text();
          if (text) handlers.onText(text);
          return;
        }
      }
    })();
  }, PASTE_EVENT_GRACE_MS);
}

/**
 * ⌥⌘V (Ctrl+Alt+V) — read the clipboard image with the user's AI model
 * (OCR-PASTE-PLAN.md D13). "Paste Special" is Ctrl+Alt+V in Office, so the
 * meaning carries over; nothing in the app or the browsers binds it.
 *
 * Matched on the PHYSICAL key: on a Mac, Option changes `event.key` to "√".
 * Skipped when the OS reports AltGr — on several European Windows layouts
 * Ctrl+Alt *is* AltGr, and AltGr+V types a character there.
 */
export function isAiPasteChord(event: KeyboardEvent): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    event.altKey &&
    !event.shiftKey &&
    event.code === "KeyV" &&
    !event.getModifierState?.("AltGraph")
  );
}

/**
 * Call from the editor's keydown when `isAiPasteChord(event)`, after
 * `event.preventDefault()`. Reads the clipboard at once — inside the gesture,
 * since no browser delivers a paste for this chord — and hands an image to
 * `onImage`.
 */
export function handleAiPasteChord(onImage: (image: Blob) => void): void {
  if (!navigator.clipboard?.read) {
    toast.error("This browser cannot read images from the clipboard.");
    return;
  }
  void (async () => {
    let items: ClipboardItems;
    try {
      items = await navigator.clipboard.read();
    } catch {
      toast.error(
        "The browser blocked reading the clipboard. Allow clipboard access for this site, then press ⌥⌘V (Ctrl+Alt+V) again.",
        { duration: 8000 },
      );
      return;
    }
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith("image/"));
      if (type) {
        onImage(await item.getType(type));
        return;
      }
    }
    toast("⌥⌘V reads an image with AI — the clipboard has no image.");
  })();
}
