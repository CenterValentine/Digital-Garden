/**
 * Mobile keyboard warm-up.
 *
 * iOS (WebKit) only raises the on-screen keyboard when an input is focused
 * *inside the tap's user-activation window*. Our inline-create flow mounts the
 * rename input asynchronously (react-arborist renders the temp node, then
 * FileTree's 50ms timer calls node.edit()), so its autoFocus lands outside
 * that window — the input gets DOM focus but the keyboard stays down and the
 * user has to tap the field again.
 *
 * The fix is the standard "focus transfer" trick: synchronously focus an
 * invisible input during the original tap (keyboard rises), then when the real
 * input mounts and autoFocuses, focus *transfers* — iOS keeps the keyboard up
 * across a transfer even outside user activation.
 *
 * Call warmUpMobileKeyboard() synchronously inside the tap/click handler that
 * kicks off an async flow ending in an input autofocus. No-op on fine-pointer
 * (desktop) devices and during SSR.
 */

let warmupInput: HTMLInputElement | null = null;
let cleanupTimer: ReturnType<typeof setTimeout> | undefined;

function removeWarmupInput(): void {
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    cleanupTimer = undefined;
  }
  if (warmupInput) {
    warmupInput.remove();
    warmupInput = null;
  }
}

export function warmUpMobileKeyboard(timeoutMs = 3000): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  // Touch devices only — desktop focus works fine outside activation windows.
  if (!window.matchMedia?.("(pointer: coarse)").matches) return;

  if (!warmupInput) {
    const input = document.createElement("input");
    input.type = "text";
    // NOTE: must NOT be readOnly — iOS suppresses the keyboard for readOnly
    // inputs, which would defeat the whole warm-up.
    input.setAttribute("aria-hidden", "true");
    input.tabIndex = -1;
    input.style.cssText =
      "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;border:0;padding:0;font-size:16px;";
    // Once focus moves to the real input (or anywhere else), clean up.
    input.addEventListener("blur", removeWarmupInput);
    document.body.appendChild(input);
    warmupInput = input;
  }

  warmupInput.focus({ preventScroll: true });

  // Fallback: if the real input never mounts (create flow failed), drop focus
  // so the keyboard doesn't linger over a dead flow.
  if (cleanupTimer) clearTimeout(cleanupTimer);
  cleanupTimer = setTimeout(() => {
    if (warmupInput && document.activeElement === warmupInput) {
      warmupInput.blur(); // blur listener performs removal
    } else {
      removeWarmupInput();
    }
  }, timeoutMs);
}
