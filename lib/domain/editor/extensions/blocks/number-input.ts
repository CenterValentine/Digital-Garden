/**
 * Number Input Block
 *
 * Numeric input with min/max/step and optional unit display.
 * Atom node — interactive form element.
 *
 * Sprint 47: Input Blocks
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";

const { schema: numberInputSchema, defaults: numberInputDefaults } =
  createBlockSchema("numberInput", {
    label: z.string().default("").describe("Field label"),
    value: z.number().default(0).describe("Current value"),
    min: z.number().default(0).describe("Minimum value"),
    max: z.number().default(100).describe("Maximum value"),
    step: z.number().default(1).describe("Step increment"),
    unit: z.string().default("").describe("Unit suffix (e.g., kg, %, $)"),
    required: z.boolean().default(false).describe("Required field"),
    showContainer: z.boolean().default(false).describe("Show border"),
  });

registerBlock({
  type: "numberInput",
  label: "Number Input",
  description: "Numeric input with min, max, and step",
  iconName: "Hash",
  family: "form",
  group: "input",
  contentModel: null,
  atom: true,
  attrsSchema: numberInputSchema,
  defaultAttrs: numberInputDefaults(),
  slashCommand: "/number-input",
  searchTerms: ["number", "numeric", "counter", "quantity", "amount", "form"],
  hiddenFields: ["value"],
});

function renderNumberInput(
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

  const wrapper = document.createElement("div");
  wrapper.className = "input-block-number-wrapper";

  const input = document.createElement("input");
  input.className = "input-block-field";
  input.type = "number";
  input.value = String(node.attrs.value ?? 0);
  input.min = String(node.attrs.min ?? "");
  input.max = String(node.attrs.max ?? "");
  input.step = String(node.attrs.step ?? 1);

  input.addEventListener("change", () => {
    const val = parseFloat(input.value) || 0;
    const pos = editor.view.posAtDOM(contentDom, 0);
    if (pos !== undefined) {
      const resolved = editor.state.doc.resolve(pos);
      const nodePos = resolved.before(resolved.depth);
      const { tr } = editor.state;
      tr.setNodeMarkup(nodePos, undefined, { ...node.attrs, value: val });
      editor.view.dispatch(tr);
    }
  });

  wrapper.appendChild(input);

  if (node.attrs.unit) {
    const unitEl = document.createElement("span");
    unitEl.className = "input-block-unit";
    unitEl.textContent = node.attrs.unit;
    wrapper.appendChild(unitEl);
  }

  contentDom.appendChild(wrapper);
}

export const NumberInput = Node.create({
  name: "numberInput",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "numberInput" },
      label: { default: "", parseHTML: (el) => el.getAttribute("data-label") || "", renderHTML: (attrs) => attrs.label ? { "data-label": attrs.label } : {} },
      value: { default: 0, parseHTML: (el) => parseFloat(el.getAttribute("data-value") || "0"), renderHTML: (attrs) => ({ "data-value": String(attrs.value) }) },
      min: { default: 0, parseHTML: (el) => parseFloat(el.getAttribute("data-min") || "0"), renderHTML: (attrs) => ({ "data-min": String(attrs.min) }) },
      max: { default: 100, parseHTML: (el) => parseFloat(el.getAttribute("data-max") || "100"), renderHTML: (attrs) => ({ "data-max": String(attrs.max) }) },
      step: { default: 1, parseHTML: (el) => parseFloat(el.getAttribute("data-step") || "1"), renderHTML: (attrs) => ({ "data-step": String(attrs.step) }) },
      unit: { default: "", parseHTML: (el) => el.getAttribute("data-unit") || "", renderHTML: (attrs) => attrs.unit ? { "data-unit": attrs.unit } : {} },
      required: { default: false, parseHTML: (el) => el.getAttribute("data-required") === "true", renderHTML: (attrs) => attrs.required ? { "data-required": "true" } : {} },
      showContainer: { default: false, parseHTML: (el) => el.getAttribute("data-show-container") === "true", renderHTML: (attrs) => attrs.showContainer ? { "data-show-container": "true" } : {} },
    };
  },

  parseHTML() { return [{ tag: 'div[data-block-type="numberInput"]' }]; },
  renderHTML({ HTMLAttributes }) { return ["div", mergeAttributes(HTMLAttributes, { class: "block-number-input", "data-block-type": "numberInput" })]; },

  addNodeView() {
    return createBlockNodeView({
      blockType: "numberInput",
      label: "Number Input",
      iconName: "Hash",
      atom: true,
      containerAttr: "showContainer",
      renderContent: renderNumberInput,
      updateContent(node, contentDom, editor) {
        contentDom.innerHTML = "";
        renderNumberInput(node, contentDom, editor);
        return true;
      },
    });
  },
});

export const ServerNumberInput = Node.create({
  name: "numberInput",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "numberInput" },
      label: { default: "", parseHTML: (el) => el.getAttribute("data-label") || "", renderHTML: (attrs) => attrs.label ? { "data-label": attrs.label } : {} },
      value: { default: 0, parseHTML: (el) => parseFloat(el.getAttribute("data-value") || "0"), renderHTML: (attrs) => ({ "data-value": String(attrs.value) }) },
      min: { default: 0, parseHTML: (el) => parseFloat(el.getAttribute("data-min") || "0"), renderHTML: (attrs) => ({ "data-min": String(attrs.min) }) },
      max: { default: 100, parseHTML: (el) => parseFloat(el.getAttribute("data-max") || "100"), renderHTML: (attrs) => ({ "data-max": String(attrs.max) }) },
      step: { default: 1, parseHTML: (el) => parseFloat(el.getAttribute("data-step") || "1"), renderHTML: (attrs) => ({ "data-step": String(attrs.step) }) },
      unit: { default: "", parseHTML: (el) => el.getAttribute("data-unit") || "", renderHTML: (attrs) => attrs.unit ? { "data-unit": attrs.unit } : {} },
      required: { default: false, parseHTML: (el) => el.getAttribute("data-required") === "true", renderHTML: (attrs) => attrs.required ? { "data-required": "true" } : {} },
      showContainer: { default: false, parseHTML: (el) => el.getAttribute("data-show-container") === "true", renderHTML: (attrs) => attrs.showContainer ? { "data-show-container": "true" } : {} },
    };
  },

  parseHTML() { return [{ tag: 'div[data-block-type="numberInput"]' }]; },
  renderHTML({ HTMLAttributes }) { return ["div", mergeAttributes(HTMLAttributes, { class: "block-number-input", "data-block-type": "numberInput" })]; },
});
