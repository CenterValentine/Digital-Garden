/**
 * Select Input Block
 *
 * Dropdown or multi-select input with configurable options.
 * Atom node — interactive form element.
 *
 * Sprint 47: Input Blocks
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";

const { schema: selectInputSchema, defaults: selectInputDefaults } =
  createBlockSchema("selectInput", {
    label: z.string().default("").describe("Field label"),
    placeholder: z.string().default("Select an option...").describe("Placeholder text"),
    options: z.array(z.string()).default(["Option 1", "Option 2", "Option 3"]).describe("Available options"),
    selectedValue: z.string().default("").describe("Selected value"),
    selectedValues: z.array(z.string()).default([]).describe("Selected values (multi-select)"),
    allowMultiple: z.boolean().default(false).describe("Allow multiple selections"),
    required: z.boolean().default(false).describe("Required field"),
  });

registerBlock({
  type: "selectInput",
  label: "Select Input",
  description: "Dropdown select with configurable options",
  iconName: "ChevronDown",
  family: "form",
  group: "input",
  contentModel: null,
  atom: true,
  attrsSchema: selectInputSchema,
  defaultAttrs: selectInputDefaults(),
  slashCommand: "/select-input",
  searchTerms: ["select", "dropdown", "choice", "option", "form", "picker"],
  hiddenFields: ["selectedValue", "selectedValues"],
});

function renderSelectInput(
  node: Parameters<Parameters<typeof createBlockNodeView>[0]["renderContent"]>[0],
  contentDom: HTMLElement,
  editor: Parameters<Parameters<typeof createBlockNodeView>[0]["renderContent"]>[2]
) {
  contentDom.classList.add("input-block-content");

  if (node.attrs.label) {
    const labelEl = document.createElement("label");
    labelEl.className = "input-block-label";
    labelEl.textContent = node.attrs.label;
    if (node.attrs.required) {
      const req = document.createElement("span");
      req.className = "input-block-required";
      req.textContent = " *";
      labelEl.appendChild(req);
    }
    contentDom.appendChild(labelEl);
  }

  const options: string[] = node.attrs.options || [];

  if (node.attrs.allowMultiple) {
    // Multi-select: render checkboxes
    const container = document.createElement("div");
    container.className = "input-block-multi-select";
    const selectedValues: string[] = node.attrs.selectedValues || [];

    for (const opt of options) {
      const row = document.createElement("label");
      row.className = "input-block-checkbox-row";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selectedValues.includes(opt);
      cb.addEventListener("change", () => {
        const current: string[] = [...(node.attrs.selectedValues || [])];
        if (cb.checked) {
          if (!current.includes(opt)) current.push(opt);
        } else {
          const idx = current.indexOf(opt);
          if (idx >= 0) current.splice(idx, 1);
        }
        const pos = editor.view.posAtDOM(contentDom, 0);
        if (pos !== undefined) {
          const resolved = editor.state.doc.resolve(pos);
          const nodePos = resolved.before(resolved.depth);
          const { tr } = editor.state;
          tr.setNodeMarkup(nodePos, undefined, { ...node.attrs, selectedValues: current });
          editor.view.dispatch(tr);
        }
      });
      const span = document.createElement("span");
      span.textContent = opt;
      row.appendChild(cb);
      row.appendChild(span);
      container.appendChild(row);
    }
    contentDom.appendChild(container);
  } else {
    // Single select: render native <select>
    const select = document.createElement("select");
    select.className = "input-block-field";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = node.attrs.placeholder || "Select...";
    placeholder.disabled = true;
    if (!node.attrs.selectedValue) placeholder.selected = true;
    select.appendChild(placeholder);

    for (const opt of options) {
      const option = document.createElement("option");
      option.value = opt;
      option.textContent = opt;
      if (node.attrs.selectedValue === opt) option.selected = true;
      select.appendChild(option);
    }

    select.addEventListener("change", () => {
      const pos = editor.view.posAtDOM(contentDom, 0);
      if (pos !== undefined) {
        const resolved = editor.state.doc.resolve(pos);
        const nodePos = resolved.before(resolved.depth);
        const { tr } = editor.state;
        tr.setNodeMarkup(nodePos, undefined, { ...node.attrs, selectedValue: select.value });
        editor.view.dispatch(tr);
      }
    });
    contentDom.appendChild(select);
  }
}

export const SelectInput = Node.create({
  name: "selectInput",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "selectInput" },
      label: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-label") || "",
        renderHTML: (attrs) => attrs.label ? { "data-label": attrs.label } : {},
      },
      placeholder: {
        default: "Select an option...",
        parseHTML: (el) => el.getAttribute("data-placeholder") || "Select an option...",
        renderHTML: (attrs) => ({ "data-placeholder": attrs.placeholder }),
      },
      options: {
        default: ["Option 1", "Option 2", "Option 3"],
        parseHTML: (el) => {
          try { return JSON.parse(el.getAttribute("data-options") || "[]"); } catch { return []; }
        },
        renderHTML: (attrs) => ({ "data-options": JSON.stringify(attrs.options) }),
      },
      selectedValue: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-selected-value") || "",
        renderHTML: (attrs) => attrs.selectedValue ? { "data-selected-value": attrs.selectedValue } : {},
      },
      selectedValues: {
        default: [],
        parseHTML: (el) => {
          try { return JSON.parse(el.getAttribute("data-selected-values") || "[]"); } catch { return []; }
        },
        renderHTML: (attrs) => {
          if (!attrs.selectedValues?.length) return {};
          return { "data-selected-values": JSON.stringify(attrs.selectedValues) };
        },
      },
      allowMultiple: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-allow-multiple") === "true",
        renderHTML: (attrs) => attrs.allowMultiple ? { "data-allow-multiple": "true" } : {},
      },
      required: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-required") === "true",
        renderHTML: (attrs) => attrs.required ? { "data-required": "true" } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="selectInput"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "block-select-input", "data-block-type": "selectInput" })];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "selectInput",
      label: "Select Input",
      iconName: "ChevronDown",
      atom: true,
      renderContent: renderSelectInput,
      updateContent(node, contentDom, editor) {
        contentDom.innerHTML = "";
        renderSelectInput(node, contentDom, editor);
        return true;
      },
    });
  },
});

export const ServerSelectInput = Node.create({
  name: "selectInput",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "selectInput" },
      label: { default: "", parseHTML: (el) => el.getAttribute("data-label") || "", renderHTML: (attrs) => attrs.label ? { "data-label": attrs.label } : {} },
      placeholder: { default: "Select an option...", parseHTML: (el) => el.getAttribute("data-placeholder") || "Select an option...", renderHTML: (attrs) => ({ "data-placeholder": attrs.placeholder }) },
      options: { default: ["Option 1", "Option 2", "Option 3"], parseHTML: (el) => { try { return JSON.parse(el.getAttribute("data-options") || "[]"); } catch { return []; } }, renderHTML: (attrs) => ({ "data-options": JSON.stringify(attrs.options) }) },
      selectedValue: { default: "", parseHTML: (el) => el.getAttribute("data-selected-value") || "", renderHTML: (attrs) => attrs.selectedValue ? { "data-selected-value": attrs.selectedValue } : {} },
      selectedValues: { default: [], parseHTML: (el) => { try { return JSON.parse(el.getAttribute("data-selected-values") || "[]"); } catch { return []; } }, renderHTML: (attrs) => { if (!attrs.selectedValues?.length) return {}; return { "data-selected-values": JSON.stringify(attrs.selectedValues) }; } },
      allowMultiple: { default: false, parseHTML: (el) => el.getAttribute("data-allow-multiple") === "true", renderHTML: (attrs) => attrs.allowMultiple ? { "data-allow-multiple": "true" } : {} },
      required: { default: false, parseHTML: (el) => el.getAttribute("data-required") === "true", renderHTML: (attrs) => attrs.required ? { "data-required": "true" } : {} },
    };
  },

  parseHTML() { return [{ tag: 'div[data-block-type="selectInput"]' }]; },
  renderHTML({ HTMLAttributes }) { return ["div", mergeAttributes(HTMLAttributes, { class: "block-select-input", "data-block-type": "selectInput" })]; },
});
