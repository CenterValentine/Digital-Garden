"use client";

/**
 * Wiki-link hover — rest the pointer on a link and a compact chooser
 * appears: Link · Chip · Card · Window, plus Open, plus the editable label.
 *
 * A consumer of the shared hover card (lib/domain/editor/hover-card.ts),
 * injected through WikiLink's `hover` option so the node file stays
 * React-free. The choice goes through `applyLinkView`
 * (lib/domain/editor/link-views.ts) — the same conversion the window header
 * and the context menu use. While the label input is being typed in, the
 * card is `hold`ed so a pointer that wanders off cannot hide it.
 *
 * Only on editable surfaces: a viewer has nothing to choose.
 */

import type { Editor } from "@tiptap/core";
import { PluginKey, type Plugin } from "@tiptap/pm/state";
import { createElement } from "react";
import { LinkViewChooser, type LinkViewChooserProps } from "@/components/content/editor/LinkViewChooser";
import { useSettingsStore } from "@/state/settings-store";
import { createHoverCardPlugin, type HoverCardController } from "../hover-card";
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
  // Bumped per show so a re-shown chooser never resumes a stale edit.
  let session = 0;

  const openTarget = (el: HTMLElement, ctl: HoverCardController) => {
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
    ctl.hide();
  };

  const choose = async (el: HTMLElement, view: LinkView, ctl: HoverCardController) => {
    const pos = wikiLinkPosFromElement(editor, el);
    if (pos === null) return;
    const windowHeight = useSettingsStore.getState().editor?.noteWindowDefaultHeight ?? null;

    // A window needs the target's id. A hand-typed link may not carry one
    // yet — resolve by title (the click rule), stamp it, then convert.
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
        ctl.hide();
        return;
      }
    }
    applyLinkView(editor, pos, view, { windowHeight });
    ctl.hide();
  };

  // The label: the alias when the author set one, else the target's title.
  // Committing a label equal to the title (or empty) clears the alias, so
  // the link follows renames again.
  const relabel = (el: HTMLElement, next: string, ctl: HoverCardController) => {
    const pos = wikiLinkPosFromElement(editor, el);
    if (pos === null) return;
    const node = editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== "wikiLink") return;
    const targetTitle = typeof node.attrs.targetTitle === "string" ? node.attrs.targetTitle : "";
    const displayText = next && next !== targetTitle ? next : null;
    if ((node.attrs.displayText ?? null) === displayText) return;
    editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, displayText }));
    ctl.hide();
  };

  const propsFor = (el: HTMLElement, ctl: HoverCardController): LinkViewChooserProps => {
    const pos = wikiLinkPosFromElement(editor, el);
    const node = pos !== null ? editor.state.doc.nodeAt(pos) : null;
    const current = node ? linkViewOfNode(node) : null;
    const targetTitle = el.getAttribute("data-target-title");
    return {
      value: current ?? "link",
      sessionKey: session,
      title: el.getAttribute("data-display-text") || targetTitle,
      labelPlaceholder: targetTitle,
      onLabelChange: editor.isEditable ? (label) => relabel(el, label, ctl) : undefined,
      onEditingChange: (next) => ctl.hold(next),
      windowDisabledReason: windowDisabledReasonFor(el),
      onChange: (view) => void choose(el, view, ctl),
      onOpen: () => openTarget(el, ctl),
    };
  };

  return createHoverCardPlugin(editor, {
    key: wikiLinkHoverPluginKey,
    selector: '[data-type="wiki-link"]',
    showDelayMs: SHOW_DELAY_MS,
    hideDelayMs: HIDE_DELAY_MS,
    editableOnly: true,
    placement: "top-start",
    offset: [0, 6],
    theme: "link-view-chooser",
    onShow: () => {
      session += 1;
    },
    render: (el, ctl) => createElement(LinkViewChooser, propsFor(el, ctl)),
  });
}
