/**
 * Date Input Block
 *
 * Date/datetime picker with configurable format.
 * Atom node — interactive form element.
 *
 * Sprint 47: Input Blocks
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";

const { schema: dateInputSchema, defaults: dateInputDefaults } =
  createBlockSchema("dateInput", {
    label: z.string().default("").describe("Field label"),
    value: z.string().default("").describe("Date value (ISO string)"),
    includeTime: z.boolean().default(false).describe("Include time picker"),
    required: z.boolean().default(false).describe("Required field"),
  });

registerBlock({
  type: "dateInput",
  label: "Date Input",
  description: "Date or datetime picker",
  iconName: "Calendar",
  family: "form",
  group: "input",
  contentModel: null,
  atom: true,
  attrsSchema: dateInputSchema,
  defaultAttrs: dateInputDefaults(),
  slashCommand: "/date-input",
  searchTerms: ["date", "calendar", "time", "datetime", "picker", "form"],
  hiddenFields: ["value"],
});

function renderDateInput(
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

  const input = document.createElement("input");
  input.className = "input-block-field";
  input.type = node.attrs.includeTime ? "datetime-local" : "date";
  if (node.attrs.value) {
    input.value = node.attrs.value;
  }

  input.addEventListener("change", () => {
    const pos = editor.view.posAtDOM(contentDom, 0);
    if (pos !== undefined) {
      const resolved = editor.state.doc.resolve(pos);
      const nodePos = resolved.before(resolved.depth);
      const { tr } = editor.state;
      tr.setNodeMarkup(nodePos, undefined, { ...node.attrs, value: input.value });
      editor.view.dispatch(tr);
    }
  });

  contentDom.appendChild(input);
}

export const DateInput = Node.create({
  name: "dateInput",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "dateInput" },
      label: { default: "", parseHTML: (el) => el.getAttribute("data-label") || "", renderHTML: (attrs) => attrs.label ? { "data-label": attrs.label } : {} },
      value: { default: "", parseHTML: (el) => el.getAttribute("data-value") || "", renderHTML: (attrs) => attrs.value ? { "data-value": attrs.value } : {} },
      includeTime: { default: false, parseHTML: (el) => el.getAttribute("data-include-time") === "true", renderHTML: (attrs) => attrs.includeTime ? { "data-include-time": "true" } : {} },
      required: { default: false, parseHTML: (el) => el.getAttribute("data-required") === "true", renderHTML: (attrs) => attrs.required ? { "data-required": "true" } : {} },
    };
  },

  parseHTML() { return [{ tag: 'div[data-block-type="dateInput"]' }]; },
  renderHTML({ HTMLAttributes }) { return ["div", mergeAttributes(HTMLAttributes, { class: "block-date-input", "data-block-type": "dateInput" })]; },

  addNodeView() {
    return createBlockNodeView({
      blockType: "dateInput",
      label: "Date Input",
      iconName: "Calendar",
      atom: true,
      renderContent: renderDateInput,
      updateContent(node, contentDom, editor) {
        contentDom.innerHTML = "";
        renderDateInput(node, contentDom, editor);
        return true;
      },
    });
  },
});

export const ServerDateInput = Node.create({
  name: "dateInput",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "dateInput" },
      label: { default: "", parseHTML: (el) => el.getAttribute("data-label") || "", renderHTML: (attrs) => attrs.label ? { "data-label": attrs.label } : {} },
      value: { default: "", parseHTML: (el) => el.getAttribute("data-value") || "", renderHTML: (attrs) => attrs.value ? { "data-value": attrs.value } : {} },
      includeTime: { default: false, parseHTML: (el) => el.getAttribute("data-include-time") === "true", renderHTML: (attrs) => attrs.includeTime ? { "data-include-time": "true" } : {} },
      required: { default: false, parseHTML: (el) => el.getAttribute("data-required") === "true", renderHTML: (attrs) => attrs.required ? { "data-required": "true" } : {} },
    };
  },

  parseHTML() { return [{ tag: 'div[data-block-type="dateInput"]' }]; },
  renderHTML({ HTMLAttributes }) { return ["div", mergeAttributes(HTMLAttributes, { class: "block-date-input", "data-block-type": "dateInput" })]; },
});
