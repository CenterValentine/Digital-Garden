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
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { useBlockStore } from "@/state/block-store";
import { openBlockInsertMenu, syncAttrsToPanel } from "@/lib/domain/blocks/node-view-factory";

const { schema: accordionSchema, defaults: accordionDefaults } =
  createBlockSchema("accordion", {
    headerText: z.string().default("").describe("Summary header text"),
    headerLevel: z
      .enum(["1", "2", "3"])
      .default("2")
      .describe("Header size (H1, H2, H3)"),
    defaultOpen: z.boolean().default(true).describe("Start expanded"),
    showContainer: z
      .boolean()
      .default(false)
      .describe("Show outer container border"),
    showDivider: z
      .boolean()
      .default(true)
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

/**
 * Accordion parent node.
 * Custom NodeView with inline-editable title and collapsible body.
 */
export const Accordion = Node.create({
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
      defaultOpen: {
        default: true,
        parseHTML: (el) => el.getAttribute("data-open") !== "false",
        renderHTML: (attrs) => ({ "data-open": String(attrs.defaultOpen) }),
      },
      showContainer: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-show-container") === "true",
        renderHTML: (attrs) => ({ "data-show-container": String(attrs.showContainer) }),
      },
      showDivider: {
        default: true,
        parseHTML: (el) => el.getAttribute("data-show-divider") !== "false",
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
        if (e.key === "Enter") {
          e.preventDefault();
          // Move focus into the body content
          const firstP = contentDOM.querySelector("p, [contenteditable]");
          if (firstP instanceof HTMLElement) firstP.focus();
          else title.blur();
        }
        e.stopPropagation();
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
      let isOpen = currentNode.attrs.defaultOpen !== false;
      if (isOpen) {
        chevron.classList.add("block-accordion-chevron-open");
      }

      const toggleAccordion = () => {
        isOpen = !isOpen;
        chevron.classList.toggle("block-accordion-chevron-open", isOpen);
        contentDOM.classList.toggle("block-accordion-open", isOpen);
        contentDOM.classList.toggle("block-accordion-closed", !isOpen);
      };

      // Chevron click toggles
      chevron.style.cursor = "pointer";
      chevron.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleAccordion();
      });

      // Click on summary background (not title) toggles
      summary.addEventListener("mousedown", (e) => {
        if (e.target === summary) {
          e.preventDefault();
          e.stopPropagation();
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

      // Click chrome to select
      chrome.addEventListener("click", () => {
        const blockId = currentNode.attrs.blockId || "";
        useBlockStore.getState().setSelectedBlock(blockId, "accordion");
      });

      // Focus the title on first render if it's empty (new accordion)
      if (!currentNode.attrs.headerText) {
        requestAnimationFrame(() => title.focus());
      }

      return {
        dom,
        contentDOM,
        update(updatedNode) {
          if (updatedNode.type.name !== "accordion") return false;
          currentNode = updatedNode;
          dom.setAttribute("data-block-id", updatedNode.attrs.blockId || "");
          dom.classList.toggle("block-container-hidden", !updatedNode.attrs.showContainer);
          summary.classList.toggle("block-accordion-no-divider", !updatedNode.attrs.showDivider);

          // Sync header level
          title.setAttribute("data-header-level", updatedNode.attrs.headerLevel || "2");

          // Update title only if not being edited
          if (document.activeElement !== title) {
            title.textContent = updatedNode.attrs.headerText || "";
          }
          return true;
        },
        selectNode() {
          dom.classList.add("block-selected", "ProseMirror-selectednode");
          const blockId = currentNode.attrs.blockId || "";
          useBlockStore.getState().setSelectedBlock(blockId, "accordion");
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
      defaultOpen: {
        default: true,
        parseHTML: (el) => el.getAttribute("data-open") !== "false",
        renderHTML: (attrs) => ({ "data-open": String(attrs.defaultOpen) }),
      },
      showContainer: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-show-container") === "true",
        renderHTML: (attrs) => ({ "data-show-container": String(attrs.showContainer) }),
      },
      showDivider: {
        default: true,
        parseHTML: (el) => el.getAttribute("data-show-divider") !== "false",
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
