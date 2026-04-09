/**
 * Tabs Layout Block
 *
 * Tabbed content panels. Parent node (tabs) contains child nodes (tabPanel).
 * Tab headers are rendered by the NodeView, clicking switches the visible panel.
 *
 * Hidden panels use `display: none` — a cursor-jump plugin (appendTransaction)
 * prevents selection from ever landing inside a hidden panel. This approach is
 * endorsed by ProseMirror's author and proven in production (Fidus Writer).
 *
 * Sprint 44: Layout Blocks (rewritten Sprint 44b)
 */

import { Node, mergeAttributes, type CommandProps, type RawCommands } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { useBlockStore } from "@/state/block-store";
import { useRightPanelCollapseStore } from "@/state/right-panel-collapse-store";
import { openBlockInsertMenu, syncAttrsToPanel } from "@/lib/domain/blocks/node-view-factory";

const { schema: tabsSchema, defaults: tabsDefaults } =
  createBlockSchema("tabs", {
    activeTab: z.number().int().min(0).default(0).describe("Index of the active tab"),
    tabStyle: z
      .enum(["underline", "pills", "boxed"])
      .default("underline")
      .describe("Tab header visual style"),
    showContainer: z.boolean().default(false).describe("Show border"),
  });

registerBlock({
  type: "tabs",
  label: "Tabs",
  description: "Tabbed content panels",
  iconName: "PanelTop",
  family: "layout",
  group: "container",
  contentModel: "tabPanel+",
  atom: false,
  attrsSchema: tabsSchema,
  defaultAttrs: tabsDefaults(),
  slashCommand: "/tabs",
  searchTerms: ["tabs", "tabbed", "panels", "switch", "pages"],
});

const tabsCursorJumpKey = new PluginKey("tabsCursorJump");

/**
 * Find the position range of the Nth tabPanel child within a tabs node.
 * Returns { from, to } document positions or null.
 */
function getTabPanelRange(
  tabsNode: ProseMirrorNode,
  tabsPos: number,
  panelIndex: number
): { from: number; to: number } | null {
  let offset = 1; // skip past the tabs node's opening
  for (let i = 0; i < tabsNode.childCount; i++) {
    const child = tabsNode.child(i);
    if (i === panelIndex) {
      return {
        from: tabsPos + offset,
        to: tabsPos + offset + child.nodeSize,
      };
    }
    offset += child.nodeSize;
  }
  return null;
}

/**
 * Tab Panel child node — each tab's content area.
 * Has a label attr for the tab header text.
 */
export const TabPanel = Node.create({
  name: "tabPanel",
  content: "block+",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      label: {
        default: "Tab",
        parseHTML: (el) => el.getAttribute("data-label") || "Tab",
        renderHTML: (attrs) => ({ "data-label": attrs.label }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div.block-tab-panel" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "block-tab-panel" }),
      0,
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      dom.classList.add("block-tab-panel");
      dom.setAttribute("data-label", node.attrs.label || "Tab");

      const contentDOM = document.createElement("div");
      contentDOM.classList.add("block-tab-panel-content");
      dom.appendChild(contentDOM);

      return {
        dom,
        contentDOM,
        update(updatedNode) {
          if (updatedNode.type.name !== "tabPanel") return false;
          dom.setAttribute("data-label", updatedNode.attrs.label || "Tab");
          return true;
        },
        // Ignore our class toggles (display:none switching) so ProseMirror
        // doesn't try to re-parse the DOM when we hide/show panels
        ignoreMutation(mutation) {
          if (mutation.type === "attributes" && mutation.attributeName === "class") {
            return true;
          }
          // Also ignore style attribute changes
          if (mutation.type === "attributes" && mutation.attributeName === "style") {
            return true;
          }
          return false;
        },
      };
    };
  },
});

/**
 * Tabs parent node.
 * Custom NodeView renders tab headers from child tabPanel labels,
 * and shows/hides panels based on active tab.
 *
 * Includes a cursor-jump ProseMirror plugin that redirects selection
 * out of hidden (display:none) panels.
 */
export const Tabs = Node.create({
  name: "tabs",
  group: "block",
  content: "tabPanel+",
  defining: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "tabs" },
      activeTab: {
        default: 0,
        parseHTML: (el) => parseInt(el.getAttribute("data-active-tab") || "0"),
        renderHTML: (attrs) => ({ "data-active-tab": attrs.activeTab }),
      },
      tabStyle: {
        default: "underline",
        parseHTML: (el) => el.getAttribute("data-tab-style") || "underline",
        renderHTML: (attrs) => ({ "data-tab-style": attrs.tabStyle }),
      },
      showContainer: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-show-container") === "true",
        renderHTML: (attrs) => attrs.showContainer ? { "data-show-container": "true" } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="tabs"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-tabs",
        "data-block-type": "tabs",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      insertTabs:
        (tabLabels: string[] = ["Tab 1", "Tab 2"]) =>
        ({ commands }: CommandProps) => {
          const panels = tabLabels.map((label) => ({
            type: "tabPanel",
            attrs: { label },
            content: [{ type: "paragraph" }],
          }));

          return commands.insertContent({
            type: "tabs",
            attrs: { activeTab: 0 },
            content: panels,
          });
        },
    } as Partial<RawCommands>;
  },

  /**
   * Cursor-jump plugin: after every transaction, check if the selection
   * is inside a hidden tabPanel. If so, redirect to the active panel.
   */
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: tabsCursorJumpKey,
        appendTransaction: (transactions: readonly Transaction[], _oldState, newState) => {
          // Only check if selection actually changed
          const selectionChanged = transactions.some((tr) => tr.selectionSet);
          if (!selectionChanged) return null;

          const { selection, doc } = newState;
          const $from = selection.$from;

          // Walk up the resolution to find if we're inside a tabPanel
          for (let depth = $from.depth; depth > 0; depth--) {
            const node = $from.node(depth);
            if (node.type.name === "tabPanel") {
              // Found a tabPanel — check if it's the active one
              const parentDepth = depth - 1;
              const parentNode = $from.node(parentDepth);
              if (parentNode.type.name === "tabs") {
                const activeTab = parentNode.attrs.activeTab || 0;
                // Determine which child index this tabPanel is
                const panelPos = $from.before(depth);
                const tabsPos = $from.before(parentDepth);
                let childIndex = 0;
                let offset = 1;
                for (let i = 0; i < parentNode.childCount; i++) {
                  if (tabsPos + offset === panelPos) {
                    childIndex = i;
                    break;
                  }
                  offset += parentNode.child(i).nodeSize;
                }

                if (childIndex !== activeTab) {
                  // Selection is in a hidden panel — redirect to active panel
                  const activeRange = getTabPanelRange(parentNode, tabsPos, activeTab);
                  if (activeRange) {
                    const tr = newState.tr;
                    const resolvedPos = doc.resolve(activeRange.from + 1);
                    tr.setSelection(TextSelection.near(resolvedPos));
                    return tr;
                  }
                }
              }
              break;
            }
          }
          return null;
        },
      }),
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
      dom.classList.add("block-node", "block-tabs");
      dom.setAttribute("data-block-type", "tabs");
      dom.setAttribute("data-block-id", currentNode.attrs.blockId || "");
      dom.setAttribute("data-tab-style", currentNode.attrs.tabStyle);
      if (!currentNode.attrs.showContainer) dom.classList.add("block-container-hidden");

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

      // Hover-only chrome
      const chrome = document.createElement("div");
      chrome.classList.add("block-chrome");
      chrome.contentEditable = "false";

      const badge = document.createElement("span");
      badge.classList.add("block-type-badge");
      badge.textContent = "Tabs";
      chrome.appendChild(badge);

      const menuBtn = document.createElement("button");
      menuBtn.classList.add("block-menu-btn");
      menuBtn.textContent = "⋯";
      menuBtn.title = "Tab properties";
      menuBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const blockId = currentNode.attrs.blockId || "";
        useBlockStore.getState().setSelectedBlock(blockId, "tabs");
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
            editor
              .chain()
              .focus()
              .deleteRange({ from: pos, to: pos + currentNode.nodeSize })
              .run();
          }
        }
      });
      chrome.appendChild(deleteBtn);
      dom.appendChild(chrome);

      // Tab headers bar
      const tabBar = document.createElement("div");
      tabBar.classList.add("block-tabs-bar");
      tabBar.contentEditable = "false";
      dom.appendChild(tabBar);

      // "+" button to add new tab
      const addTabBtn = document.createElement("button");
      addTabBtn.classList.add("block-tab-add-btn");
      addTabBtn.textContent = "+";
      addTabBtn.title = "Add tab";
      addTabBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof getPos === "function") {
          const pos = getPos();
          if (pos !== undefined) {
            const endPos = pos + currentNode.nodeSize - 1;
            editor.chain().focus().insertContentAt(endPos, {
              type: "tabPanel",
              attrs: { label: `Tab ${currentNode.childCount + 1}` },
              content: [{ type: "paragraph" }],
            }).run();
          }
        }
      });

      // Content area — ProseMirror manages tabPanel children here
      const contentDOM = document.createElement("div");
      contentDOM.classList.add("block-tabs-content");
      dom.appendChild(contentDOM);

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

      let activeTabIndex = currentNode.attrs.activeTab || 0;
      let lastRenderedChildCount = -1;
      let lastRenderedLabels: string[] = [];

      /** Switch to a tab by updating the ProseMirror attr + local state */
      function switchToTab(index: number) {
        activeTabIndex = index;

        // Update the ProseMirror attr so it persists in the document
        if (typeof getPos === "function") {
          const pos = getPos();
          if (pos !== undefined) {
            const { tr } = editor.state;
            tr.setNodeMarkup(pos, undefined, {
              ...currentNode.attrs,
              activeTab: index,
            });
            // Also move cursor into the active panel
            const tabsNode = tr.doc.nodeAt(pos);
            if (tabsNode) {
              const range = getTabPanelRange(tabsNode, pos, index);
              if (range) {
                const $pos = tr.doc.resolve(range.from + 1);
                tr.setSelection(TextSelection.near($pos));
              }
            }
            editor.view.dispatch(tr);
          }
        }

        // Don't force-rebuild tabs here — dispatch(tr) above triggers update()
        // which calls updateTabsUI(). A forced rebuild would destroy DOM elements
        // between mousedown and dblclick, preventing double-click tab rename.
        updatePanelVisibility();
      }

      /** Rename a tab by updating the tabPanel child's label attr */
      function renameTab(index: number, newLabel: string) {
        if (typeof getPos !== "function") return;
        const pos = getPos();
        if (pos === undefined) return;

        // Find the tabPanel child position
        let offset = 1; // skip past the tabs node's opening
        for (let i = 0; i < currentNode.childCount; i++) {
          if (i === index) {
            const childPos = pos + offset;
            const { tr } = editor.state;
            const child = tr.doc.nodeAt(childPos);
            if (child && child.type.name === "tabPanel") {
              tr.setNodeMarkup(childPos, undefined, { ...child.attrs, label: newLabel });
              editor.view.dispatch(tr);
            }
            return;
          }
          offset += currentNode.child(i).nodeSize;
        }
      }

      /** Delete a tab (tabPanel child) at the given index */
      function deleteTab(index: number) {
        if (typeof getPos !== "function") return;
        if (currentNode.childCount <= 1) return; // keep at least 1 tab
        const pos = getPos();
        if (pos === undefined) return;

        const range = getTabPanelRange(currentNode, pos, index);
        if (!range) return;

        // If deleting the active tab, switch to previous (or 0)
        let newActive = activeTabIndex;
        if (index <= activeTabIndex) {
          newActive = Math.max(0, activeTabIndex - 1);
        }

        const { tr } = editor.state;
        tr.delete(range.from, range.to);
        // Update activeTab attr on the tabs node
        const tabsNode = tr.doc.nodeAt(pos);
        if (tabsNode) {
          tr.setNodeMarkup(pos, undefined, { ...tabsNode.attrs, activeTab: newActive });
        }
        editor.view.dispatch(tr);
      }

      /** Rebuild tab header buttons */
      function updateTabsUI(force = false) {
        const panelCount = currentNode.childCount;
        const labels: string[] = [];
        for (let i = 0; i < panelCount; i++) {
          labels.push(currentNode.child(i).attrs.label || `Tab ${i + 1}`);
        }

        // Skip rebuild if nothing changed
        if (
          !force &&
          panelCount === lastRenderedChildCount &&
          labels.every((l, i) => l === lastRenderedLabels[i])
        ) {
          const buttons = tabBar.querySelectorAll(".block-tab-btn");
          buttons.forEach((btn, i) => {
            btn.classList.toggle("block-tab-active", i === activeTabIndex);
          });
          return;
        }

        // Full rebuild
        tabBar.innerHTML = "";
        for (let i = 0; i < panelCount; i++) {
          const tabBtn = document.createElement("button");
          tabBtn.classList.add("block-tab-btn");
          if (i === activeTabIndex) tabBtn.classList.add("block-tab-active");

          // Tab label span (editable on double-click)
          const labelSpan = document.createElement("span");
          labelSpan.classList.add("block-tab-label");
          labelSpan.textContent = labels[i];
          tabBtn.appendChild(labelSpan);

          // Delete button (only if more than 1 tab)
          if (panelCount > 1) {
            const delBtn = document.createElement("span");
            delBtn.classList.add("block-tab-delete");
            delBtn.textContent = "×";
            delBtn.title = "Delete tab";
            const delIndex = i;
            delBtn.addEventListener("mousedown", (e) => {
              e.preventDefault();
              e.stopPropagation();
              deleteTab(delIndex);
            });
            tabBtn.appendChild(delBtn);
          }

          const tabIndex = i;
          tabBtn.addEventListener("mousedown", (e) => {
            // Don't switch tab if clicking delete or editing label
            if ((e.target as HTMLElement).classList.contains("block-tab-delete")) return;
            if (labelSpan.isContentEditable) return;
            e.preventDefault();
            e.stopPropagation();
            switchToTab(tabIndex);
          });

          // Double-click to edit tab name
          labelSpan.addEventListener("dblclick", (e) => {
            e.preventDefault();
            e.stopPropagation();
            labelSpan.contentEditable = "true";
            labelSpan.focus();
            // Select all text
            const range = document.createRange();
            range.selectNodeContents(labelSpan);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
          });

          // Commit rename on blur
          const commitRename = () => {
            labelSpan.contentEditable = "false";
            const newLabel = labelSpan.textContent?.trim() || `Tab ${tabIndex + 1}`;
            labelSpan.textContent = newLabel;
            renameTab(tabIndex, newLabel);
          };

          labelSpan.addEventListener("blur", commitRename);
          labelSpan.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              labelSpan.blur();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              labelSpan.textContent = labels[tabIndex];
              labelSpan.contentEditable = "false";
            }
            e.stopPropagation();
          });
          // Prevent ProseMirror from intercepting input in the label
          labelSpan.addEventListener("beforeinput", (e) => e.stopPropagation());
          labelSpan.addEventListener("input", (e) => e.stopPropagation());
          labelSpan.addEventListener("keypress", (e) => e.stopPropagation());
          labelSpan.addEventListener("paste", (e) => e.stopPropagation());

          tabBar.appendChild(tabBtn);
        }
        tabBar.appendChild(addTabBtn);

        lastRenderedChildCount = panelCount;
        lastRenderedLabels = labels;
      }

      /** Apply display:none / display:block to panels */
      function updatePanelVisibility() {
        const panels = contentDOM.children;
        for (let i = 0; i < panels.length; i++) {
          const panel = panels[i] as HTMLElement;
          if (i === activeTabIndex) {
            panel.classList.remove("block-tab-panel-hidden");
            panel.classList.add("block-tab-panel-active");
          } else {
            panel.classList.add("block-tab-panel-hidden");
            panel.classList.remove("block-tab-panel-active");
          }
        }
      }

      // Click on chrome to select for properties
      chrome.addEventListener("click", () => {
        const blockId = currentNode.attrs.blockId || "";
        useBlockStore.getState().setSelectedBlock(blockId, "tabs");
      });

      // Initial render
      updateTabsUI();
      requestAnimationFrame(() => updatePanelVisibility());

      return {
        dom,
        contentDOM,
        update(updatedNode) {
          if (updatedNode.type.name !== "tabs") return false;
          const prevChildCount = currentNode.childCount;
          currentNode = updatedNode;
          dom.setAttribute("data-block-id", updatedNode.attrs.blockId || "");
          dom.setAttribute("data-tab-style", updatedNode.attrs.tabStyle);
          dom.classList.toggle("block-container-hidden", !updatedNode.attrs.showContainer);

          // Sync activeTabIndex from the attr (handles undo/redo of tab switches)
          activeTabIndex = updatedNode.attrs.activeTab || 0;

          // Clamp to valid range
          if (activeTabIndex >= updatedNode.childCount) {
            activeTabIndex = Math.max(0, updatedNode.childCount - 1);
          }

          updateTabsUI();
          // Always update visibility — the active tab may have changed via attr
          if (updatedNode.childCount !== prevChildCount ||
              updatedNode.attrs.activeTab !== undefined) {
            updatePanelVisibility();
          }
          return true;
        },
        selectNode() {
          dom.classList.add("block-selected", "ProseMirror-selectednode");
        },
        deselectNode() {
          dom.classList.remove("block-selected", "ProseMirror-selectednode");
        },
        // Let tab bar handle its own events (label editing, tab switching, delete)
        stopEvent(event) {
          const target = event.target as HTMLElement;
          if (tabBar.contains(target)) return true;
          return false;
        },
        // Ignore DOM mutations in the tab bar (label text changes, class toggles)
        ignoreMutation(mutation) {
          if (tabBar.contains(mutation.target as HTMLElement)) return true;
          if (mutation.type === "attributes" &&
              (mutation.attributeName === "class" || mutation.attributeName === "style")) {
            return true;
          }
          return false;
        },
      };
    };
  },
});

/** Server-safe versions */
export const ServerTabPanel = Node.create({
  name: "tabPanel",
  content: "block+",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      label: {
        default: "Tab",
        parseHTML: (el) => el.getAttribute("data-label") || "Tab",
        renderHTML: (attrs) => ({ "data-label": attrs.label }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div.block-tab-panel" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "block-tab-panel" }),
      0,
    ];
  },
});

export const ServerTabs = Node.create({
  name: "tabs",
  group: "block",
  content: "tabPanel+",
  defining: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "tabs" },
      activeTab: {
        default: 0,
        parseHTML: (el) => parseInt(el.getAttribute("data-active-tab") || "0"),
        renderHTML: (attrs) => ({ "data-active-tab": attrs.activeTab }),
      },
      tabStyle: {
        default: "underline",
        parseHTML: (el) => el.getAttribute("data-tab-style") || "underline",
        renderHTML: (attrs) => ({ "data-tab-style": attrs.tabStyle }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="tabs"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-tabs",
        "data-block-type": "tabs",
      }),
      0,
    ];
  },
});
