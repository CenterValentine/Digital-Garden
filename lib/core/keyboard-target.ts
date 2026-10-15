/**
 * Guards for global ("plain") hotkey listeners.
 *
 * The media viewers (image, video, audio, PDF) bind single-key shortcuts on
 * `window` so they work without the viewer itself holding focus — `r` rotates,
 * `f` toggles fullscreen, `0` resets zoom, space plays/pauses. The cost is that
 * *every* keystroke on the page reaches them, including the ones a user types
 * into a file-tree rename field, the search box, or a contenteditable editor.
 * With an image open, typing "F" into a rename input toggled fullscreen and the
 * handler's `preventDefault()` ate the character (minor-bugs, 2026-08-22).
 *
 * Any `window`/`document` keydown handler that reacts to unmodified keys must
 * bail when `shouldIgnorePlainHotkey(e)` is true. Handlers for modifier chords
 * (⌘S save, etc.) should use `isTypingTarget` directly and decide about
 * modifiers themselves.
 */

/** `<input>` types that never accept typed text — hotkeys may pass through. */
const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/**
 * True when the event target is somewhere the user types: a text-like
 * `<input>`, a `<textarea>`, a `<select>`, or any contenteditable host
 * (ProseMirror/TipTap, inline block labels, Monaco's hidden textarea).
 *
 * Browser-only — call from event handlers, never during render or SSR.
 */
export function isTypingTarget(target: EventTarget | null | undefined): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;

  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    return !NON_TEXT_INPUT_TYPES.has((target as HTMLInputElement).type);
  }
  return false;
}

/**
 * True when a single-key (unmodified) hotkey handler should do nothing:
 * the user is typing, an IME composition is in flight, or the key is part
 * of a browser/OS chord (⌘R reload, ⌘F find, ⌘0 / ⌘- zoom, ⌥-letter glyphs).
 * Shift is deliberately allowed so `R` and `r` both reach the handler.
 */
export function shouldIgnorePlainHotkey(e: KeyboardEvent): boolean {
  return (
    e.isComposing ||
    e.metaKey ||
    e.ctrlKey ||
    e.altKey ||
    isTypingTarget(e.target)
  );
}
