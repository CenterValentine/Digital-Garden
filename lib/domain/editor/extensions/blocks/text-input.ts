/**
 * Text Input Block
 *
 * Form input for single-line or multi-line text entry.
 * Atom node — interactive form element with label, placeholder, character limit.
 * Auto-expanding textarea for multi-line mode.
 *
 * Sprint 47: Input Blocks
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";

const { schema: textInputSchema, defaults: textInputDefaults } =
  createBlockSchema("textInput", {
    label: z.string().default("").describe("Field label"),
    placeholder: z.string().default("Enter text...").describe("Placeholder text"),
    value: z.string().default("").describe("Current value"),
    inputType: z
      .enum(["text", "email", "url", "textarea"])
      .default("text")
      .describe("Input type"),
    maxLength: z.number().int().min(0).default(0).describe("Character limit (0 = no limit)"),
    required: z.boolean().default(false).describe("Required field"),
  });

registerBlock({
  type: "textInput",
  label: "Text Input",
  description: "Single or multi-line text input field",
  iconName: "Type",
  family: "form",
  group: "input",
  contentModel: null,
  atom: true,
  attrsSchema: textInputSchema,
  defaultAttrs: textInputDefaults(),
  slashCommand: "/text-input",
  searchTerms: ["text", "input", "field", "form", "textarea", "email", "url"],
  hiddenFields: ["value"],
});

function renderTextInput(
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

  const isTextarea = node.attrs.inputType === "textarea";
  const el = document.createElement(isTextarea ? "textarea" : "input") as HTMLInputElement | HTMLTextAreaElement;
  el.className = "input-block-field";
  el.placeholder = node.attrs.placeholder || "";
  el.value = node.attrs.value || "";

  if (!isTextarea && el instanceof HTMLInputElement) {
    el.type = node.attrs.inputType || "text";
  }

  if (node.attrs.maxLength > 0) {
    el.maxLength = node.attrs.maxLength;
  }

  if (isTextarea && el instanceof HTMLTextAreaElement) {
    el.rows = 1;
    el.style.resize = "none";
    el.style.overflow = "hidden";
    const autoResize = () => {
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    };
    el.addEventListener("input", autoResize);
    // Initial resize after mount
    requestAnimationFrame(autoResize);
  }

  el.addEventListener("input", () => {
    const pos = editor.view.posAtDOM(contentDom, 0);
    if (pos !== undefined) {
      const resolved = editor.state.doc.resolve(pos);
      const nodePos = resolved.before(resolved.depth);
      const { tr } = editor.state;
      tr.setNodeMarkup(nodePos, undefined, {
        ...node.attrs,
        value: el.value,
      });
      editor.view.dispatch(tr);
    }
  });

  contentDom.appendChild(el);

  if (node.attrs.maxLength > 0) {
    const counter = document.createElement("div");
    counter.className = "input-block-counter";
    counter.textContent = `${(node.attrs.value || "").length}/${node.attrs.maxLength}`;
    contentDom.appendChild(counter);
  }
}

export const TextInput = Node.create({
  name: "textInput",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "textInput" },
      label: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-label") || "",
        renderHTML: (attrs) => attrs.label ? { "data-label": attrs.label } : {},
      },
      placeholder: {
        default: "Enter text...",
        parseHTML: (el) => el.getAttribute("data-placeholder") || "Enter text...",
        renderHTML: (attrs) => ({ "data-placeholder": attrs.placeholder }),
      },
      value: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-value") || "",
        renderHTML: (attrs) => attrs.value ? { "data-value": attrs.value } : {},
      },
      inputType: {
        default: "text",
        parseHTML: (el) => el.getAttribute("data-input-type") || "text",
        renderHTML: (attrs) => ({ "data-input-type": attrs.inputType }),
      },
      maxLength: {
        default: 0,
        parseHTML: (el) => parseInt(el.getAttribute("data-max-length") || "0", 10),
        renderHTML: (attrs) => attrs.maxLength ? { "data-max-length": String(attrs.maxLength) } : {},
      },
      required: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-required") === "true",
        renderHTML: (attrs) => attrs.required ? { "data-required": "true" } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="textInput"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-text-input",
        "data-block-type": "textInput",
      }),
    ];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "textInput",
      label: "Text Input",
      iconName: "Type",
      atom: true,
      renderContent: renderTextInput,
      updateContent(node, contentDom, editor) {
        contentDom.innerHTML = "";
        renderTextInput(node, contentDom, editor);
        return true;
      },
    });
  },
});

export const ServerTextInput = Node.create({
  name: "textInput",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "textInput" },
      label: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-label") || "",
        renderHTML: (attrs) => attrs.label ? { "data-label": attrs.label } : {},
      },
      placeholder: {
        default: "Enter text...",
        parseHTML: (el) => el.getAttribute("data-placeholder") || "Enter text...",
        renderHTML: (attrs) => ({ "data-placeholder": attrs.placeholder }),
      },
      value: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-value") || "",
        renderHTML: (attrs) => attrs.value ? { "data-value": attrs.value } : {},
      },
      inputType: {
        default: "text",
        parseHTML: (el) => el.getAttribute("data-input-type") || "text",
        renderHTML: (attrs) => ({ "data-input-type": attrs.inputType }),
      },
      maxLength: {
        default: 0,
        parseHTML: (el) => parseInt(el.getAttribute("data-max-length") || "0", 10),
        renderHTML: (attrs) => attrs.maxLength ? { "data-max-length": String(attrs.maxLength) } : {},
      },
      required: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-required") === "true",
        renderHTML: (attrs) => attrs.required ? { "data-required": "true" } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="textInput"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-text-input",
        "data-block-type": "textInput",
      }),
    ];
  },
});
