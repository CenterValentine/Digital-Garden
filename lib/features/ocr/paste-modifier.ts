/**
 * Was Shift held for this paste? OCR-PASTE-PLAN.md D1.
 *
 * Cmd/Ctrl+Shift+V is "paste as text" everywhere; for an image, the text is
 * its OCR. A ClipboardEvent carries no modifier state, so the last keyboard
 * event decides. One window-level tracker serves every editor (the main
 * editor and the flashcards editor), installed once by whichever mounts
 * first. ProseMirror tracks the same thing internally (`view.input.shiftKey`),
 * but that field is not public API.
 */

let shiftHeld = false;
let installed = false;

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
