"use client";

/**
 * Hover card — rest the pointer on an element inside the editor and a card
 * appears beside it; click it (when the consumer says so) and the card
 * stays, pinned, until Esc or a click elsewhere.
 *
 * ONE implementation of the plumbing every in-editor hover shares, extracted
 * from the wiki-link chooser (its first consumer) so the comment thread card
 * (its second) could not grow a rival copy:
 *
 *   - delegated mouseover/mouseout on the editor's DOM, a dwell before show
 *     and a grace period before hide, held open while the pointer is on it;
 *   - one tippy instance per editor, re-anchored per element;
 *   - the content on its OWN React root (not TipTap's ReactRenderer), so an
 *     input inside keeps focus and state across editor updates;
 *   - dismissal on a mousedown outside, a keystroke in the editor, or a page
 *     scroll — except while the consumer `hold`s it (an input is being typed
 *     in) or it is pinned (a pinned card follows its anchor on scroll and
 *     ignores editor keystrokes; Esc and an outside click still close it).
 *
 * The consumer supplies the selector, the delays, what to render and what a
 * click means; it gets a controller to hide, hold, pin and re-render.
 */

import type { Editor } from "@tiptap/core";
import { Plugin, type PluginKey } from "@tiptap/pm/state";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import tippy, { type Instance as TippyInstance, type Placement } from "tippy.js";

export interface HoverCardController {
  /** Close the card now. */
  hide(): void;
  /** While held, nothing but `hide()` closes the card (an input is live). */
  hold(flag: boolean): void;
  /** Open the card on `el` and keep it open until Esc or an outside click. */
  pin(el: HTMLElement): void;
  isPinned(): boolean;
  /** Render again for the current anchor (the consumer's data changed). */
  rerender(): void;
}

export interface HoverCardOptions {
  key: PluginKey;
  /** CSS selector for the elements that carry a card. */
  selector: string;
  showDelayMs?: number;
  hideDelayMs?: number;
  /** Only on editable surfaces (a viewer has nothing to choose). */
  editableOnly?: boolean;
  placement?: Placement;
  offset?: [number, number];
  /** tippy theme — the consumer styles `.tippy-box[data-theme~=…]`. */
  theme?: string;
  /** What to show for `el`. Return null to show nothing (and hide). */
  render(el: HTMLElement, controller: HoverCardController, pinned: boolean): ReactElement | null;
  /** Called before each show (hover or pin) — e.g. to bump a session key. */
  onShow?(el: HTMLElement, pinned: boolean): void;
  /** Called after each hide; `wasPinned` tells a pinned card from a hover. */
  onHide?(wasPinned: boolean): void;
  /**
   * A click on a matching element. Return "pin" to open the card pinned,
   * "ignore" to leave the click to the editor. Default: ignore.
   */
  onClick?(el: HTMLElement, controller: HoverCardController): "pin" | "ignore";
  /** The controller, once the plugin's view exists (for out-of-band opens). */
  onReady?(controller: HoverCardController): void;
}

export function createHoverCardPlugin(editor: Editor, options: HoverCardOptions): Plugin | null {
  if (typeof window === "undefined") return null;
  const showDelay = options.showDelayMs ?? 350;
  const hideDelay = options.hideDelayMs ?? 220;

  return new Plugin({
    key: options.key,
    view(editorView) {
      let popup: TippyInstance | null = null;
      let root: Root | null = null;
      let content: HTMLElement | null = null;
      let anchor: HTMLElement | null = null;
      let showTimer: number | null = null;
      let hideTimer: number | null = null;
      let overPopup = false;
      let held = false;
      let pinned = false;
      let destroyed = false;

      const clearTimers = () => {
        if (showTimer !== null) window.clearTimeout(showTimer);
        if (hideTimer !== null) window.clearTimeout(hideTimer);
        showTimer = null;
        hideTimer = null;
      };

      const hide = () => {
        clearTimers();
        const wasPinned = pinned;
        const wasVisible = Boolean(popup?.state.isVisible);
        held = false;
        pinned = false;
        popup?.hide();
        anchor = null;
        if (wasVisible) options.onHide?.(wasPinned);
      };

      const scheduleHide = () => {
        if (hideTimer !== null) window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(() => {
          if (!overPopup && !held && !pinned) hide();
        }, hideDelay);
      };

      const controller: HoverCardController = {
        hide,
        hold(flag) {
          held = flag;
          if (!flag) scheduleHide();
        },
        pin(el) {
          if (destroyed) return;
          if (options.editableOnly && !editorView.editable) return;
          clearTimers();
          pinned = true;
          show(el);
        },
        isPinned: () => pinned,
        rerender() {
          if (anchor && popup?.state.isVisible) render(anchor);
        },
      };

      const render = (el: HTMLElement) => {
        const element = options.render(el, controller, pinned);
        if (!element) {
          hide();
          return false;
        }
        root?.render(element);
        return true;
      };

      const ensurePopup = (el: HTMLElement) => {
        if (!content) {
          content = document.createElement("div");
          content.addEventListener("mouseenter", () => {
            overPopup = true;
            if (hideTimer !== null) window.clearTimeout(hideTimer);
          });
          content.addEventListener("mouseleave", () => {
            overPopup = false;
            scheduleHide();
          });
          root = createRoot(content);
          popup = tippy(document.body, {
            getReferenceClientRect: () => el.getBoundingClientRect(),
            appendTo: () => document.body,
            content,
            trigger: "manual",
            interactive: true,
            placement: options.placement ?? "top-start",
            offset: options.offset ?? [0, 6],
            animation: false,
            hideOnClick: false,
            maxWidth: "none",
            theme: options.theme,
          });
        } else {
          popup?.setProps({ getReferenceClientRect: () => el.getBoundingClientRect() });
        }
      };

      const show = (el: HTMLElement) => {
        if (options.editableOnly && !editorView.editable) return;
        anchor = el;
        options.onShow?.(el, pinned);
        ensurePopup(el);
        if (render(el)) popup?.show();
      };

      const insidePopup = (target: EventTarget | null) =>
        Boolean(content && target instanceof Node && content.contains(target));

      const elementFor = (target: EventTarget | null): HTMLElement | null => {
        const el = (target as HTMLElement | null)?.closest?.(options.selector) as HTMLElement | null;
        return el && editorView.dom.contains(el) ? el : null;
      };

      const onMouseOver = (event: MouseEvent) => {
        if (pinned) return;
        const el = elementFor(event.target);
        if (!el) return;
        if (hideTimer !== null) {
          window.clearTimeout(hideTimer);
          hideTimer = null;
        }
        if (anchor === el && popup?.state.isVisible) return;
        if (held) return;
        if (showTimer !== null) window.clearTimeout(showTimer);
        showTimer = window.setTimeout(() => show(el), showDelay);
      };

      const onMouseOut = (event: MouseEvent) => {
        if (pinned) return;
        const el = (event.target as HTMLElement | null)?.closest?.(options.selector);
        if (!el) return;
        // A node ProseMirror just replaced (a decoration changed under the
        // pointer) fires mouseout on its way out; the pointer never left.
        if (!el.isConnected) return;
        const to = event.relatedTarget as Node | null;
        if (to && el.contains(to)) return;
        if (showTimer !== null) {
          window.clearTimeout(showTimer);
          showTimer = null;
        }
        if (anchor === el) scheduleHide();
      };

      const onClick = (event: MouseEvent) => {
        if (!options.onClick) return;
        // The element under the pointer, not only the event target: when a
        // decoration under the pointer changed between mousedown and mouseup
        // (the hover class clearing), ProseMirror swapped the span and the
        // browser fired `click` on the common ancestor instead.
        const el =
          elementFor(event.target) ??
          elementFor(document.elementFromPoint(event.clientX, event.clientY));
        if (!el) return;
        if (options.onClick(el, controller) === "pin") controller.pin(el);
      };

      // A click outside the card, a keystroke in the editor, or a scroll of
      // the page ends a hover — a resting affordance, not a mode. A pinned
      // card survives keystrokes and scrolls (it follows its anchor) but not
      // an outside click or Esc. Events INSIDE the card are its own business,
      // and a mousedown on the card's own anchor is the click that follows —
      // hiding here would churn the decorations under the pointer first.
      const onDocMouseDown = (event: MouseEvent) => {
        if (!popup?.state.isVisible) return;
        if (insidePopup(event.target)) return;
        if (!pinned && anchor && elementFor(event.target) === anchor) return;
        hide();
      };
      const onEditorKeyDown = () => {
        if (popup?.state.isVisible && !held && !pinned) hide();
      };
      const onDocKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape" && popup?.state.isVisible) {
          hide();
          editorView.focus();
        }
      };
      const onScroll = (event: Event) => {
        if (!popup?.state.isVisible) return;
        if (insidePopup(event.target)) return;
        if (held || pinned) return;
        hide();
      };

      editorView.dom.addEventListener("mouseover", onMouseOver);
      editorView.dom.addEventListener("mouseout", onMouseOut);
      editorView.dom.addEventListener("click", onClick);
      editorView.dom.addEventListener("keydown", onEditorKeyDown);
      document.addEventListener("mousedown", onDocMouseDown, true);
      document.addEventListener("keydown", onDocKeyDown, true);
      window.addEventListener("scroll", onScroll, true);

      options.onReady?.(controller);

      return {
        destroy() {
          destroyed = true;
          clearTimers();
          editorView.dom.removeEventListener("mouseover", onMouseOver);
          editorView.dom.removeEventListener("mouseout", onMouseOut);
          editorView.dom.removeEventListener("click", onClick);
          editorView.dom.removeEventListener("keydown", onEditorKeyDown);
          document.removeEventListener("mousedown", onDocMouseDown, true);
          document.removeEventListener("keydown", onDocKeyDown, true);
          window.removeEventListener("scroll", onScroll, true);
          popup?.destroy();
          popup = null;
          const r = root;
          root = null;
          content = null;
          // React forbids unmounting a root during a render pass; the editor
          // can be destroyed from inside one (the NodeView teardown precedent).
          if (r) queueMicrotask(() => r.unmount());
        },
      };
    },
  });
}
