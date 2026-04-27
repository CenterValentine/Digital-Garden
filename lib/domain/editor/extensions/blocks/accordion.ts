/**
 * Accordion Block
 *
 * Collapsible content section with an inline-editable summary header.
 * Custom NodeView with ignoreMutation to prevent ProseMirror from
 * fighting DOM class changes during open/close toggle.
 *
 * Sprint 44: Content Blocks (rewritten Sprint 44b: custom NodeView)
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { useBlockStore } from "@/state/block-store";
import { useRightPanelCollapseStore } from "@/state/right-panel-collapse-store";
import {
  openBlockInsertMenu,
  selectBlockNode,
  syncAttrsToPanel,
} from "@/lib/domain/blocks/node-view-factory";

const { schema: accordionSchema, defaults: accordionDefaults } =
  createBlockSchema("accordion", {
    headerText: z.string().default("").describe("Summary header text"),
    headerLevel: z
      .enum(["1", "2", "3"])
      .default("2")
      .describe("Header size (H1, H2, H3)"),
    openBehavior: z
      .enum(["expanded", "collapsed", "lastInteraction"])
      .default("lastInteraction")
      .describe(
        "Controls how the accordion opens by default. Last Interaction keeps the last state you left it in."
      ),
    openState: z.boolean().default(true).describe("Persisted open state"),
    showContainer: z
      .boolean()
      .default(false)
      .describe("Show border"),
    showDivider: z
      .boolean()
      .default(false)
      .describe("Show line between header and content"),
  });

registerBlock({
  type: "accordion",
  label: "Accordion",
  description: "Collapsible content section",
  iconName: "ChevronsUpDown",
  family: "content",
  group: "container",
  contentModel: "block+",
  atom: false,
  attrsSchema: accordionSchema,
  defaultAttrs: accordionDefaults(),
  slashCommand: "/accordion",
  searchTerms: ["accordion", "collapse", "expand", "toggle", "spoiler", "details"],
  hiddenFields: ["headerText"],
});

function isEmptyParagraphNode(node: { type: { name: string }; content: { size: number }; textContent: string } | null | undefined) {
  return Boolean(
    node &&
      node.type.name === "paragraph" &&
      node.content.size === 0 &&
      node.textContent.length === 0
  );
}

function focusAccordionTitleById(blockId: string) {
  if (!blockId) return false;

  const attempt = () => {
    const title = document.querySelector(
      `[data-block-id="${CSS.escape(blockId)}"] .block-accordion-title`
    ) as HTMLElement | null;
    if (!title) return false;

    title.focus({ preventScroll: true });
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(title);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
    return true;
  };

  if (attempt()) return true;
  requestAnimationFrame(() => {
    if (!attempt()) {
      setTimeout(() => {
        attempt();
      }, 0);
    }
  });
  return true;
}

/**
 * Accordion parent node.
 * Custom NodeView with inline-editable title and collapsible body.
 */
export const Accordion = Node.create({
  name: "accordion",
  group: "block",
  content: "block+",
  defining: true,

  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        // Don't fire if a non-PM contenteditable (e.g., accordion title) has focus.
        // The title lives inside editor.view.dom but is outside ProseMirror's
        // managed contentDOM — a NodeSelection on the accordion would otherwise
        // cause this handler to delete content while the title is being edited.
        const active = document.activeElement as HTMLElement | null;
        if (
          active &&
          active !== this.editor.view.dom &&
          active.getAttribute("contenteditable") === "true"
        ) {
          return false;
        }

        const { state, view } = this.editor;
        const { selection } = state;
        if (!selection.empty) return false;

        const { $from } = selection;
        if ($from.parent.type.name !== "paragraph" || $from.parentOffset !== 0) {
          return false;
        }

        for (let depth = $from.depth; depth > 0; depth--) {
          const node = $from.node(depth);
          if (node.type.name !== "accordion") continue;

          const topLevelChildIndex = $from.index(depth);
          if (topLevelChildIndex !== 0) {
            return false;
          }

          const accordionPos = $from.before(depth);
          const firstChild = node.child(0);
          const firstChildFrom = accordionPos + 1;
          const firstChildTo = firstChildFrom + firstChild.nodeSize;
          const emptyParagraph = state.schema.nodes.paragraph?.create();
          if (!emptyParagraph) return false;
          const blockId = String(node.attrs.blockId || "");

          if (node.childCount === 1 && isEmptyParagraphNode(firstChild)) {
            focusAccordionTitleById(blockId);
            return true;
          }

          const tr =
            node.childCount > 1
              ? state.tr.delete(firstChildFrom, firstChildTo)
              : state.tr.replaceWith(firstChildFrom, firstChildTo, emptyParagraph);

          if (node.childCount > 1) {
            const targetPos = Math.min(accordionPos + 2, tr.doc.content.size);
            tr.setSelection(TextSelection.near(tr.doc.resolve(targetPos), 1));
            view.dispatch(tr);
            view.focus();
            return true;
          }

          view.dispatch(tr);
          if (blockId) {
            focusAccordionTitleById(blockId);
          }
          return true;
        }

        return false;
      },
    };
  },

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "accordion" },
      headerText: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-header") || "",
        renderHTML: (attrs) => ({ "data-header": attrs.headerText }),
      },
      headerLevel: {
        default: "2",
        parseHTML: (el) => el.getAttribute("data-header-level") || "2",
        renderHTML: (attrs) => ({ "data-header-level": attrs.headerLevel }),
      },
      openBehavior: {
        default: "lastInteraction",
        parseHTML: (el) =>
          el.getAttribute("data-open-behavior") ||
          (el.getAttribute("data-open") === "false" ? "collapsed" : "lastInteraction"),
        renderHTML: (attrs) => ({ "data-open-behavior": attrs.openBehavior }),
      },
      openState: {
        default: true,
        parseHTML: (el) => el.getAttribute("data-open-state") !== "false",
        renderHTML: (attrs) => ({ "data-open-state": String(attrs.openState) }),
      },
      showContainer: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-show-container") === "true",
        renderHTML: (attrs) => ({ "data-show-container": String(attrs.showContainer) }),
      },
      showDivider: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-show-divider") === "true",
        renderHTML: (attrs) => ({ "data-show-divider": String(attrs.showDivider) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="accordion"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-accordion",
        "data-block-type": "accordion",
      }),
      0,
    ];
  },

  addNodeView() {
    return ({ node: initialNode, getPos, editor }) => {
      let currentNode = initialNode;

      // Auto-assign blockId if missing
      if (!currentNode.attrs.blockId && typeof getPos === "function") {
        const pos = getPos();
        if (pos !== undefined) {
          const newId = crypto.randomUUID();
          const { tr } = editor.state;
          tr.setNodeMarkup(pos, undefined, { ...currentNode.attrs, blockId: newId });
          editor.view.dispatch(tr);
        }
      }

      const dom = document.createElement("div");
      dom.classList.add("block-node", "block-accordion");
      dom.setAttribute("data-block-type", "accordion");
      dom.setAttribute("data-block-id", currentNode.attrs.blockId || "");
      if (!currentNode.attrs.showContainer) {
        dom.classList.add("block-container-hidden");
      }
      const getNodePos = typeof getPos === "function" ? getPos : undefined;
      const syncBlockSelection = () => {
        const blockId = currentNode.attrs.blockId || "";
        useBlockStore.getState().setSelectedBlock(blockId, "accordion");
        syncAttrsToPanel(blockId, currentNode.attrs);
      };

      const cursorBefore = document.createElement("button");
      cursorBefore.classList.add("block-cursor-anchor", "block-cursor-anchor-before");
      cursorBefore.type = "button";
      cursorBefore.title = "Place cursor above";
      cursorBefore.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectBlockNode(editor, getNodePos);
      });
      dom.appendChild(cursorBefore);

      // "+" button ABOVE block
      const insertAbove = document.createElement("button");
      insertAbove.classList.add("block-insert-btn", "block-insert-above");
      insertAbove.contentEditable = "false";
      insertAbove.innerHTML = "+";
      insertAbove.title = "Insert block above";
      insertAbove.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof getPos === "function") {
          const pos = getPos();
          if (pos !== undefined) openBlockInsertMenu(editor, pos, insertAbove);
        }
      });
      dom.appendChild(insertAbove);

      // Block chrome
      const chrome = document.createElement("div");
      chrome.classList.add("block-chrome");
      chrome.contentEditable = "false";

      const badge = document.createElement("span");
      badge.classList.add("block-type-badge");
      badge.textContent = "Accordion";
      chrome.appendChild(badge);

      const menuBtn = document.createElement("button");
      menuBtn.classList.add("block-menu-btn");
      menuBtn.textContent = "⋯";
      menuBtn.title = "Accordion properties";
      menuBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const blockId = currentNode.attrs.blockId || "";
        useBlockStore.getState().setSelectedBlock(blockId, "accordion");
        useBlockStore.getState().openProperties();
        useRightPanelCollapseStore.getState().setCollapsed(false);
        syncAttrsToPanel(blockId, currentNode.attrs);
      });
      chrome.appendChild(menuBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.classList.add("block-delete-btn");
      deleteBtn.innerHTML = "×";
      deleteBtn.title = "Delete block";
      deleteBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof getPos === "function") {
          const pos = getPos();
          if (pos !== undefined) {
            editor.chain().focus()
              .deleteRange({ from: pos, to: pos + currentNode.nodeSize })
              .run();
          }
        }
      });
      chrome.appendChild(deleteBtn);
      dom.appendChild(chrome);

      // Summary header — inline-editable title
      const summary = document.createElement("div");
      summary.classList.add("block-accordion-summary");
      summary.contentEditable = "false";

      const chevron = document.createElement("span");
      chevron.classList.add("block-accordion-chevron");
      chevron.textContent = "▶";
      summary.appendChild(chevron);

      const title = document.createElement("span");
      title.classList.add("block-accordion-title");
      title.contentEditable = "true";
      title.textContent = currentNode.attrs.headerText || "";
      title.setAttribute("data-placeholder", "Accordion title...");
      title.setAttribute("data-header-level", currentNode.attrs.headerLevel || "2");

      // Sync title edits back to node attrs.
      // Also detect leading "#" characters as heading-level shorthand:
      // "# Title" → H1, "## Title" → H2, "### Title" → H3
      title.addEventListener("input", () => {
        const blockId = currentNode.attrs.blockId || "";
        let text = title.textContent || "";

        // Detect "# ", "## ", "### " prefix → set heading level + strip prefix
        const headingMatch = text.match(/^(#{1,3})\s+/);
        if (headingMatch && blockId) {
          const level = String(headingMatch[1].length);
          text = text.slice(headingMatch[0].length);
          title.textContent = text;
          title.setAttribute("data-header-level", level);
          // Move cursor to end after text replacement
          const range = document.createRange();
          range.selectNodeContents(title);
          range.collapse(false);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
          // Update headerLevel attr
          window.dispatchEvent(
            new CustomEvent("block-attrs-change", {
              detail: { blockId, key: "headerLevel", value: level },
            })
          );
        }

        if (blockId) {
          window.dispatchEvent(
            new CustomEvent("block-attrs-change", {
              detail: { blockId, key: "headerText", value: text },
            })
          );
        }
      });

      // Prevent ProseMirror from stealing focus or processing title input.
      // We must stop propagation on ALL event types ProseMirror listens to,
      // not just keydown — modern browsers use beforeinput for text entry,
      // and TipTap's input rules / suggestion plugins can fire on those.
      title.addEventListener("mousedown", (e) => {
        e.stopPropagation();
      });
      title.addEventListener("keydown", (e) => {
        if (e.key === "Backspace") {
          const selection = window.getSelection();
          const atStart =
            selection?.rangeCount &&
            selection.isCollapsed &&
            selection.getRangeAt(0).startOffset === 0 &&
            selection.getRangeAt(0).endOffset === 0;
          if (atStart) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          // Open accordion if closed, then move ProseMirror cursor into content
          if (!isOpen) toggleAccordion();
          if (typeof getPos === "function") {
            const pos = getPos();
            if (pos !== undefined) {
              requestAnimationFrame(() => {
                try {
                  // accordion content starts at pos+1 (inside node), first block at pos+2
                  const contentStart = pos + 2;
                  const $pos = editor.state.doc.resolve(
                    Math.min(contentStart, editor.state.doc.content.size - 1)
                  );
                  const sel = TextSelection.near($pos);
                  editor.view.dispatch(editor.state.tr.setSelection(sel).scrollIntoView());
                  editor.view.focus();
                } catch { /* ignore if position is invalid */ }
              });
            }
          }
          return;
        }
        e.stopPropagation();
      });
      // Final sync on blur — ensures headerText attr is up-to-date before
      // ProseMirror fires update() from the subsequent selection-change transaction.
      title.addEventListener("focusout", () => {
        const text = title.textContent || "";
        const blockId = currentNode.attrs.blockId || "";
        if (blockId) {
          window.dispatchEvent(new CustomEvent("block-attrs-change", {
            detail: { blockId, key: "headerText", value: text },
          }));
        }
      });
      // Stop beforeinput/input from reaching ProseMirror's input handler
      title.addEventListener("beforeinput", (e) => {
        e.stopPropagation();
      });
      title.addEventListener("input", (e) => {
        e.stopPropagation();
      });
      title.addEventListener("keypress", (e) => {
        e.stopPropagation();
      });
      // Prevent paste from being intercepted by ProseMirror
      title.addEventListener("paste", (e) => {
        e.stopPropagation();
      });
      // Prevent composition events (IME) from leaking
      title.addEventListener("compositionstart", (e) => {
        e.stopPropagation();
      });
      title.addEventListener("compositionend", (e) => {
        e.stopPropagation();
      });

      summary.appendChild(title);
      dom.appendChild(summary);

      // Toggle state
      const resolveOpenState = (attrs: typeof currentNode.attrs) => {
        if (attrs.openBehavior === "expanded") return true;
        if (attrs.openBehavior === "collapsed") return false;
        return attrs.openState !== false;
      };
      let isOpen = resolveOpenState(currentNode.attrs);
      if (isOpen) {
        chevron.classList.add("block-accordion-chevron-open");
      }

      const toggleAccordion = () => {
        isOpen = !isOpen;
        chevron.classList.toggle("block-accordion-chevron-open", isOpen);
        contentDOM.classList.toggle("block-accordion-open", isOpen);
        contentDOM.classList.toggle("block-accordion-closed", !isOpen);
        if (currentNode.attrs.openBehavior === "lastInteraction") {
          const blockId = currentNode.attrs.blockId || "";
          if (blockId) {
            window.dispatchEvent(
              new CustomEvent("block-attrs-change", {
                detail: { blockId, key: "openState", value: isOpen },
              })
            );
          }
        }
      };

      // Chevron click toggles
      chevron.style.cursor = "pointer";
      chevron.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        syncBlockSelection();
        toggleAccordion();
      });

      // Click on summary background (not title) toggles
      summary.addEventListener("mousedown", (e) => {
        if (e.target === summary) {
          e.preventDefault();
          e.stopPropagation();
          syncBlockSelection();
          toggleAccordion();
        }
      });

      // Content area — ProseMirror manages block+ children here
      const contentDOM = document.createElement("div");
      contentDOM.classList.add(
        "block-accordion-body",
        isOpen ? "block-accordion-open" : "block-accordion-closed"
      );
      dom.appendChild(contentDOM);

      // Apply divider style
      if (!currentNode.attrs.showDivider) {
        summary.classList.add("block-accordion-no-divider");
      }

      // "+" button BELOW block
      const insertBelow = document.createElement("button");
      insertBelow.classList.add("block-insert-btn", "block-insert-below");
      insertBelow.contentEditable = "false";
      insertBelow.innerHTML = "+";
      insertBelow.title = "Insert block below";
      insertBelow.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof getPos === "function") {
          const pos = getPos();
          if (pos !== undefined) {
            const after = pos + currentNode.nodeSize;
            openBlockInsertMenu(editor, after, insertBelow);
          }
        }
      });
      dom.appendChild(insertBelow);

      const cursorAfter = document.createElement("button");
      cursorAfter.classList.add("block-cursor-anchor", "block-cursor-anchor-after");
      cursorAfter.type = "button";
      cursorAfter.title = "Place cursor below";
      cursorAfter.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectBlockNode(editor, getNodePos);
      });
      dom.appendChild(cursorAfter);

      dom.addEventListener(
        "mousedown",
        (event) => {
          const target = event.target as HTMLElement;
          const interactive =
            target.closest(".block-menu-btn") ||
            target.closest(".block-delete-btn") ||
            target.closest(".block-insert-btn") ||
            // Don't set NodeSelection when clicking the inline-editable title.
            // The capture-phase listener fires before the title's own mousedown
            // handler, so without this guard every title click would put a
            // NodeSelection on the accordion — and the PM Backspace shortcut
            // would then fire against it while the title is being edited.
            target.closest(".block-accordion-title");
          if (interactive) return;
          selectBlockNode(editor, getNodePos);
          syncBlockSelection();
        },
        true
      );

      chrome.addEventListener("click", syncBlockSelection);

      // Focus the title on first render if it's empty (new accordion)
      if (!currentNode.attrs.headerText) {
        requestAnimationFrame(() => title.focus());
      }

      return {
        dom,
        contentDOM,
        update(updatedNode) {
          if (updatedNode.type.name !== "accordion") return false;
          const previousNode = currentNode;
          currentNode = updatedNode;
          dom.setAttribute("data-block-id", updatedNode.attrs.blockId || "");
          dom.classList.toggle("block-container-hidden", !updatedNode.attrs.showContainer);
          summary.classList.toggle("block-accordion-no-divider", !updatedNode.attrs.showDivider);

          // Sync header level
          title.setAttribute("data-header-level", updatedNode.attrs.headerLevel || "2");
          if (
            updatedNode.attrs.openBehavior !== previousNode.attrs.openBehavior ||
            updatedNode.attrs.openState !== previousNode.attrs.openState
          ) {
            isOpen = resolveOpenState(updatedNode.attrs);
            chevron.classList.toggle("block-accordion-chevron-open", isOpen);
            contentDOM.classList.toggle("block-accordion-open", isOpen);
            contentDOM.classList.toggle("block-accordion-closed", !isOpen);
          }

          // Update title only if not being edited
          if (document.activeElement !== title) {
            const nextHeaderText =
              updatedNode.attrs.headerText ||
              title.textContent ||
              "";
            title.textContent = nextHeaderText;
          }
          return true;
        },
        selectNode() {
          dom.classList.add("block-selected", "ProseMirror-selectednode");
          syncBlockSelection();
        },
        deselectNode() {
          dom.classList.remove("block-selected", "ProseMirror-selectednode");
        },
        // Prevent ProseMirror from re-parsing when we toggle classes
        ignoreMutation(mutation) {
          if (mutation.type === "attributes" &&
              (mutation.attributeName === "class" || mutation.attributeName === "style")) {
            return true;
          }
          // Ignore mutations inside the summary (title editing)
          if (summary.contains(mutation.target)) {
            return true;
          }
          return false;
        },
        stopEvent(event) {
          const target = event.target as HTMLElement;
          // Let the title handle its own events
          if (title.contains(target)) return true;
          // Let chevron/summary handle clicks
          if (summary.contains(target) && (event.type === "mousedown" || event.type === "click")) {
            return true;
          }
          return false;
        },
        destroy() {
          const store = useBlockStore.getState();
          if (store.selectedBlockId === currentNode.attrs.blockId) {
            store.clearSelection();
          }
        },
      };
    };
  },
});

/** Server-safe version */
export const ServerAccordion = Node.create({
  name: "accordion",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "accordion" },
      headerText: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-header") || "",
        renderHTML: (attrs) => ({ "data-header": attrs.headerText }),
      },
      headerLevel: {
        default: "2",
        parseHTML: (el) => el.getAttribute("data-header-level") || "2",
        renderHTML: (attrs) => ({ "data-header-level": attrs.headerLevel }),
      },
      openBehavior: {
        default: "lastInteraction",
        parseHTML: (el) =>
          el.getAttribute("data-open-behavior") ||
          (el.getAttribute("data-open") === "false" ? "collapsed" : "lastInteraction"),
        renderHTML: (attrs) => ({ "data-open-behavior": attrs.openBehavior }),
      },
      openState: {
        default: true,
        parseHTML: (el) => el.getAttribute("data-open-state") !== "false",
        renderHTML: (attrs) => ({ "data-open-state": String(attrs.openState) }),
      },
      showContainer: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-show-container") === "true",
        renderHTML: (attrs) => ({ "data-show-container": String(attrs.showContainer) }),
      },
      showDivider: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-show-divider") === "true",
        renderHTML: (attrs) => ({ "data-show-divider": String(attrs.showDivider) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="accordion"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-accordion",
        "data-block-type": "accordion",
      }),
      0,
    ];
  },
});
