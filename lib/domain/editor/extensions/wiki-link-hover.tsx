"use client";

/**
 * Wiki-link hover — rest the pointer on a link and a compact chooser
 * appears: Link · Chip · Card · Window, plus Open, plus the editable label.
 *
 * A ProseMirror plugin (injected through WikiLink's `hover` option so the
 * node file stays React-free) that listens on the editor's DOM, finds the
 * `[data-type="wiki-link"]` under the pointer, and after a short dwell
 * shows one tippy popover (one instance per editor, re-anchored per link)
 * holding a LinkViewChooser. The choice goes through `applyLinkView`
 * (lib/domain/editor/link-views.ts) — the same conversion the window
 * header and the context menu use.
 *
 * The chooser renders on its OWN React root (not TipTap's ReactRenderer):
 * the label input must keep its focus and state across editor updates,
 * and a root of its own cannot be touched by the editor's portal
 * re-renders. The popover also ignores scrolls and keystrokes that happen
 * inside itself — the input's own caret scroll used to count as "the page
 * moved" and hid the popover under the user's fingers, one character at a
 * time.
 *
 * Only on editable surfaces: a viewer has nothing to choose.
 */

import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { LinkViewChooser, type LinkViewChooserProps } from "@/components/content/editor/LinkViewChooser";
import { useSettingsStore } from "@/state/settings-store";
import {
  applyLinkView,
  canWindowLink,
  linkViewOfNode,
  wikiLinkPosFromElement,
  type LinkView,
} from "../link-views";
import { resolveWikiLinkTarget } from "../wiki-link-resolve";

const SHOW_DELAY_MS = 350;
const HIDE_DELAY_MS = 220;

export const wikiLinkHoverPluginKey = new PluginKey("wikiLinkHover");

function windowDisabledReasonFor(el: Element): string | null {
  if (el.getAttribute("data-heading-slug") && !el.getAttribute("data-target-id")) {
    return "A heading link points inside this note";
  }
  if (el.getAttribute("data-anchor")) return "An anchored link points inside its note";
  const targetId = el.getAttribute("data-target-id");
  if (targetId && !canWindowLink({ targetId })) return "This target cannot be windowed";
  return null;
}

export function createWikiLinkHoverPlugin(editor: Editor): Plugin | null {
  if (typeof window === "undefined") return null;

  return new Plugin({
    key: wikiLinkHoverPluginKey,
    view(editorView) {
      let popup: TippyInstance | null = null;
      let root: Root | null = null;
      let content: HTMLElement | null = null;
      let anchor: HTMLElement | null = null;
      let showTimer: number | null = null;
      let hideTimer: number | null = null;
      let overPopup = false;
      // The label input is open — the popover must not hide under a
      // pointer that wandered off while the user is typing.
      let editing = false;
      // Bumped per show so a re-shown popover never resumes a stale edit.
      let session = 0;

      const clearTimers = () => {
        if (showTimer !== null) window.clearTimeout(showTimer);
        if (hideTimer !== null) window.clearTimeout(hideTimer);
        showTimer = null;
        hideTimer = null;
      };

      const hide = () => {
        clearTimers();
        editing = false;
        popup?.hide();
        anchor = null;
      };

      const scheduleHide = () => {
        if (hideTimer !== null) window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(() => {
          if (!overPopup && !editing) hide();
        }, HIDE_DELAY_MS);
      };

      const openTarget = (el: HTMLElement) => {
        window.dispatchEvent(
          new CustomEvent("open-wiki-link", {
            detail: {
              targetId: el.getAttribute("data-target-id"),
              targetTitle: el.getAttribute("data-target-title") ?? "",
              headingSlug: el.getAttribute("data-heading-slug"),
              anchor: el.getAttribute("data-anchor"),
            },
          }),
        );
        hide();
      };

      const choose = async (el: HTMLElement, view: LinkView) => {
        const pos = wikiLinkPosFromElement(editor, el);
        if (pos === null) return;
        const windowHeight = useSettingsStore.getState().editor?.noteWindowDefaultHeight ?? null;

        // A window needs the target's id. A hand-typed link may not carry
        // one yet — resolve by title (the click rule), stamp it, then convert.
        if (view === "window") {
          const node = editor.state.doc.nodeAt(pos);
          if (node && !node.attrs.targetId && node.attrs.targetTitle) {
            const resolved = await resolveWikiLinkTarget({ targetId: null, targetTitle: node.attrs.targetTitle });
            if (!resolved) {
              el.classList.add("wiki-link-broken");
              return;
            }
            const livePos = wikiLinkPosFromElement(editor, el) ?? pos;
            const live = editor.state.doc.nodeAt(livePos);
            if (!live || live.type.name !== "wikiLink") return;
            editor.view.dispatch(
              editor.state.tr.setNodeMarkup(livePos, undefined, { ...live.attrs, targetId: resolved.id }),
            );
            applyLinkView(editor, livePos, view, { windowHeight });
            hide();
            return;
          }
        }
        applyLinkView(editor, pos, view, { windowHeight });
        hide();
      };

      // The label: the alias when the author set one, else the target's
      // title. Committing a label equal to the title (or empty) clears the
      // alias, so the link follows renames again.
      const relabel = (el: HTMLElement, next: string) => {
        const pos = wikiLinkPosFromElement(editor, el);
        if (pos === null) return;
        const node = editor.state.doc.nodeAt(pos);
        if (!node || node.type.name !== "wikiLink") return;
        const targetTitle = typeof node.attrs.targetTitle === "string" ? node.attrs.targetTitle : "";
        const displayText = next && next !== targetTitle ? next : null;
        if ((node.attrs.displayText ?? null) === displayText) return;
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, displayText }));
        hide();
      };

      const propsFor = (el: HTMLElement): LinkViewChooserProps => {
        const pos = wikiLinkPosFromElement(editor, el);
        const node = pos !== null ? editor.state.doc.nodeAt(pos) : null;
        const current = node ? linkViewOfNode(node) : null;
        const targetTitle = el.getAttribute("data-target-title");
        return {
          value: current ?? "link",
          sessionKey: session,
          title: el.getAttribute("data-display-text") || targetTitle,
          labelPlaceholder: targetTitle,
          onLabelChange: editorView.editable ? (label) => relabel(el, label) : undefined,
          onEditingChange: (next) => {
            editing = next;
            if (!next) scheduleHide();
          },
          windowDisabledReason: windowDisabledReasonFor(el),
          onChange: (view) => void choose(el, view),
          onOpen: () => openTarget(el),
        };
      };

      const render = (el: HTMLElement) => {
        root?.render(createElement(LinkViewChooser, propsFor(el)));
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
            placement: "top-start",
            offset: [0, 6],
            animation: false,
            hideOnClick: false,
            theme: "link-view-chooser",
          });
        } else {
          popup?.setProps({ getReferenceClientRect: () => el.getBoundingClientRect() });
        }
        render(el);
      };

      const show = (el: HTMLElement) => {
        if (!editorView.editable) return;
        anchor = el;
        session += 1;
        ensurePopup(el);
        popup?.show();
      };

      const insidePopup = (target: EventTarget | null) =>
        Boolean(content && target instanceof Node && content.contains(target));

      const onMouseOver = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null;
        const el = target?.closest?.('[data-type="wiki-link"]') as HTMLElement | null;
        if (!el || !editorView.dom.contains(el)) return;
        if (hideTimer !== null) {
          window.clearTimeout(hideTimer);
          hideTimer = null;
        }
        if (anchor === el && popup?.state.isVisible) return;
        if (editing) return;
        if (showTimer !== null) window.clearTimeout(showTimer);
        showTimer = window.setTimeout(() => show(el), SHOW_DELAY_MS);
      };

      const onMouseOut = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null;
        const el = target?.closest?.('[data-type="wiki-link"]');
        if (!el) return;
        const to = event.relatedTarget as Node | null;
        if (to && el.contains(to)) return;
        if (showTimer !== null) {
          window.clearTimeout(showTimer);
          showTimer = null;
        }
        if (anchor === el) scheduleHide();
      };

      // A click outside the popover, a keystroke in the editor, or a scroll
      // of the page ends the hover — the chooser is a resting affordance,
      // not a mode. Events that originate INSIDE the popover (typing in the
      // label, the input scrolling its own text) are its own business.
      const onDocMouseDown = (event: MouseEvent) => {
        if (!popup?.state.isVisible) return;
        if (insidePopup(event.target)) return;
        hide();
      };
      const onKeyDown = () => {
        if (popup?.state.isVisible && !editing) hide();
      };
      const onScroll = (event: Event) => {
        if (!popup?.state.isVisible) return;
        if (insidePopup(event.target)) return;
        if (editing) return;
        hide();
      };

      editorView.dom.addEventListener("mouseover", onMouseOver);
      editorView.dom.addEventListener("mouseout", onMouseOut);
      document.addEventListener("mousedown", onDocMouseDown, true);
      editorView.dom.addEventListener("keydown", onKeyDown);
      window.addEventListener("scroll", onScroll, true);

      return {
        destroy() {
          clearTimers();
          editorView.dom.removeEventListener("mouseover", onMouseOver);
          editorView.dom.removeEventListener("mouseout", onMouseOut);
          document.removeEventListener("mousedown", onDocMouseDown, true);
          editorView.dom.removeEventListener("keydown", onKeyDown);
          window.removeEventListener("scroll", onScroll, true);
          popup?.destroy();
          popup = null;
          const r = root;
          root = null;
          content = null;
          // React forbids unmounting a root during a render pass; the
          // editor can be destroyed from inside one (the NodeView teardown
          // precedent in note-window-client.tsx).
          if (r) queueMicrotask(() => r.unmount());
        },
      };
    },
  });
}
