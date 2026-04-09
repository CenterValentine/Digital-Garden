/**
 * Checkbox Input Block
 *
 * Single checkbox toggle or checkbox group.
 * Atom node — interactive form element.
 *
 * Sprint 47: Input Blocks
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";

const { schema: checkboxInputSchema, defaults: checkboxInputDefaults } =
  createBlockSchema("checkboxInput", {
    label: z.string().default("").describe("Field label"),
    checked: z.boolean().default(false).describe("Checked state (single mode)"),
    groupMode: z.boolean().default(false).describe("Group mode (multiple checkboxes)"),
    options: z.array(z.string()).default(["Option 1", "Option 2"]).describe("Options (group mode)"),
    selectedValues: z.array(z.string()).default([]).describe("Selected values (group mode)"),
    showContainer: z.boolean().default(false).describe("Show border"),
  });

registerBlock({
  type: "checkboxInput",
  label: "Checkbox",
  description: "Single checkbox or checkbox group",
  iconName: "CheckSquare",
  family: "form",
  group: "input",
  contentModel: null,
  atom: true,
  attrsSchema: checkboxInputSchema,
  defaultAttrs: checkboxInputDefaults(),
  slashCommand: "/checkbox",
  searchTerms: ["checkbox", "check", "toggle", "boolean", "form"],
  hiddenFields: ["checked", "selectedValues"],
});

function renderCheckboxInput(
  node: Parameters<Parameters<typeof createBlockNodeView>[0]["renderContent"]>[0],
  contentDom: HTMLElement,
  editor: Parameters<Parameters<typeof createBlockNodeView>[0]["renderContent"]>[2]
) {
  contentDom.classList.add("input-block-content");

  const updateAttr = (updates: Record<string, unknown>) => {
    const pos = editor.view.posAtDOM(contentDom, 0);
    if (pos !== undefined) {
      const resolved = editor.state.doc.resolve(pos);
      const nodePos = resolved.before(resolved.depth);
      const { tr } = editor.state;
      tr.setNodeMarkup(nodePos, undefined, { ...node.attrs, ...updates });
      editor.view.dispatch(tr);
    }
  };

  if (node.attrs.groupMode) {
    // Group mode: label + multiple checkboxes
    if (node.attrs.label) {
      const labelEl = document.createElement("div");
      labelEl.className = "input-block-label";
      labelEl.textContent = node.attrs.label;
      contentDom.appendChild(labelEl);
    }

    const container = document.createElement("div");
    container.className = "input-block-checkbox-group";
    const options: string[] = node.attrs.options || [];
    const selectedValues: string[] = node.attrs.selectedValues || [];

    for (const opt of options) {
      const row = document.createElement("label");
      row.className = "input-block-checkbox-row";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selectedValues.includes(opt);
      cb.addEventListener("change", () => {
        const current = [...(node.attrs.selectedValues || [])];
        if (cb.checked) {
          if (!current.includes(opt)) current.push(opt);
        } else {
          const idx = current.indexOf(opt);
          if (idx >= 0) current.splice(idx, 1);
        }
        updateAttr({ selectedValues: current });
      });
      const span = document.createElement("span");
      span.textContent = opt;
      row.appendChild(cb);
      row.appendChild(span);
      container.appendChild(row);
    }
    contentDom.appendChild(container);
  } else {
    // Single mode: one checkbox with label
    const row = document.createElement("label");
    row.className = "input-block-checkbox-row input-block-checkbox-single";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!node.attrs.checked;
    cb.addEventListener("change", () => {
      updateAttr({ checked: cb.checked });
    });
    const span = document.createElement("span");
    span.textContent = node.attrs.label || "Checkbox";
    row.appendChild(cb);
    row.appendChild(span);
    contentDom.appendChild(row);
  }
}

export const CheckboxInput = Node.create({
  name: "checkboxInput",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "checkboxInput" },
      label: { default: "", parseHTML: (el) => el.getAttribute("data-label") || "", renderHTML: (attrs) => attrs.label ? { "data-label": attrs.label } : {} },
      checked: { default: false, parseHTML: (el) => el.getAttribute("data-checked") === "true", renderHTML: (attrs) => attrs.checked ? { "data-checked": "true" } : {} },
      groupMode: { default: false, parseHTML: (el) => el.getAttribute("data-group-mode") === "true", renderHTML: (attrs) => attrs.groupMode ? { "data-group-mode": "true" } : {} },
      options: { default: ["Option 1", "Option 2"], parseHTML: (el) => { try { return JSON.parse(el.getAttribute("data-options") || "[]"); } catch { return []; } }, renderHTML: (attrs) => ({ "data-options": JSON.stringify(attrs.options) }) },
      selectedValues: { default: [], parseHTML: (el) => { try { return JSON.parse(el.getAttribute("data-selected-values") || "[]"); } catch { return []; } }, renderHTML: (attrs) => { if (!attrs.selectedValues?.length) return {}; return { "data-selected-values": JSON.stringify(attrs.selectedValues) }; } },
      showContainer: { default: false, parseHTML: (el) => el.getAttribute("data-show-container") === "true", renderHTML: (attrs) => attrs.showContainer ? { "data-show-container": "true" } : {} },
    };
  },

  parseHTML() { return [{ tag: 'div[data-block-type="checkboxInput"]' }]; },
  renderHTML({ HTMLAttributes }) { return ["div", mergeAttributes(HTMLAttributes, { class: "block-checkbox-input", "data-block-type": "checkboxInput" })]; },

  addNodeView() {
    return createBlockNodeView({
      blockType: "checkboxInput",
      label: "Checkbox",
      iconName: "CheckSquare",
      atom: true,
      containerAttr: "showContainer",
      renderContent: renderCheckboxInput,
      updateContent(node, contentDom, editor) {
        contentDom.innerHTML = "";
        renderCheckboxInput(node, contentDom, editor);
        return true;
      },
    });
  },
});

export const ServerCheckboxInput = Node.create({
  name: "checkboxInput",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "checkboxInput" },
      label: { default: "", parseHTML: (el) => el.getAttribute("data-label") || "", renderHTML: (attrs) => attrs.label ? { "data-label": attrs.label } : {} },
      checked: { default: false, parseHTML: (el) => el.getAttribute("data-checked") === "true", renderHTML: (attrs) => attrs.checked ? { "data-checked": "true" } : {} },
      groupMode: { default: false, parseHTML: (el) => el.getAttribute("data-group-mode") === "true", renderHTML: (attrs) => attrs.groupMode ? { "data-group-mode": "true" } : {} },
      options: { default: ["Option 1", "Option 2"], parseHTML: (el) => { try { return JSON.parse(el.getAttribute("data-options") || "[]"); } catch { return []; } }, renderHTML: (attrs) => ({ "data-options": JSON.stringify(attrs.options) }) },
      selectedValues: { default: [], parseHTML: (el) => { try { return JSON.parse(el.getAttribute("data-selected-values") || "[]"); } catch { return []; } }, renderHTML: (attrs) => { if (!attrs.selectedValues?.length) return {}; return { "data-selected-values": JSON.stringify(attrs.selectedValues) }; } },
      showContainer: { default: false, parseHTML: (el) => el.getAttribute("data-show-container") === "true", renderHTML: (attrs) => attrs.showContainer ? { "data-show-container": "true" } : {} },
    };
  },

  parseHTML() { return [{ tag: 'div[data-block-type="checkboxInput"]' }]; },
  renderHTML({ HTMLAttributes }) { return ["div", mergeAttributes(HTMLAttributes, { class: "block-checkbox-input", "data-block-type": "checkboxInput" })]; },
});
