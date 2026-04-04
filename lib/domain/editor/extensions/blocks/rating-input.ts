/**
 * Rating Input Block
 *
 * Star/heart/number rating selector.
 * Atom node — interactive form element.
 *
 * Sprint 47: Input Blocks
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";

const { schema: ratingInputSchema, defaults: ratingInputDefaults } =
  createBlockSchema("ratingInput", {
    label: z.string().default("").describe("Field label"),
    value: z.number().int().min(0).default(0).describe("Current rating"),
    maxRating: z.number().int().min(1).max(10).default(5).describe("Maximum rating"),
    style: z
      .enum(["stars", "hearts", "numbers"])
      .default("stars")
      .describe("Rating style"),
  });

registerBlock({
  type: "ratingInput",
  label: "Rating",
  description: "Star, heart, or number rating selector",
  iconName: "Star",
  family: "form",
  group: "input",
  contentModel: null,
  atom: true,
  attrsSchema: ratingInputSchema,
  defaultAttrs: ratingInputDefaults(),
  slashCommand: "/rating",
  searchTerms: ["rating", "stars", "hearts", "score", "review", "form"],
  hiddenFields: ["value"],
});

const STYLE_SYMBOLS: Record<string, { filled: string; empty: string }> = {
  stars: { filled: "★", empty: "☆" },
  hearts: { filled: "♥", empty: "♡" },
  numbers: { filled: "", empty: "" },
};

function renderRatingInput(
  node: Parameters<Parameters<typeof createBlockNodeView>[0]["renderContent"]>[0],
  contentDom: HTMLElement,
  editor: Parameters<Parameters<typeof createBlockNodeView>[0]["renderContent"]>[2]
) {
  contentDom.classList.add("input-block-content");

  if (node.attrs.label) {
    const labelEl = document.createElement("div");
    labelEl.className = "input-block-label";
    labelEl.textContent = node.attrs.label;
    contentDom.appendChild(labelEl);
  }

  const container = document.createElement("div");
  container.className = "input-block-rating";
  container.setAttribute("data-style", node.attrs.style || "stars");

  const maxRating = node.attrs.maxRating || 5;
  const currentValue = node.attrs.value || 0;
  const style = node.attrs.style || "stars";
  const symbols = STYLE_SYMBOLS[style] || STYLE_SYMBOLS.stars;

  const updateValue = (newValue: number) => {
    const pos = editor.view.posAtDOM(contentDom, 0);
    if (pos !== undefined) {
      const resolved = editor.state.doc.resolve(pos);
      const nodePos = resolved.before(resolved.depth);
      const { tr } = editor.state;
      tr.setNodeMarkup(nodePos, undefined, { ...node.attrs, value: newValue });
      editor.view.dispatch(tr);
    }
  };

  if (style === "numbers") {
    // Number-based: render clickable number buttons
    for (let i = 1; i <= maxRating; i++) {
      const btn = document.createElement("button");
      btn.className = `input-block-rating-item ${i <= currentValue ? "active" : ""}`;
      btn.textContent = String(i);
      btn.addEventListener("click", () => updateValue(i === currentValue ? 0 : i));
      container.appendChild(btn);
    }
  } else {
    // Symbol-based: stars or hearts
    for (let i = 1; i <= maxRating; i++) {
      const btn = document.createElement("button");
      btn.className = `input-block-rating-item ${i <= currentValue ? "active" : ""}`;
      btn.textContent = i <= currentValue ? symbols.filled : symbols.empty;
      btn.addEventListener("click", () => updateValue(i === currentValue ? 0 : i));
      container.appendChild(btn);
    }
  }

  contentDom.appendChild(container);
}

export const RatingInput = Node.create({
  name: "ratingInput",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "ratingInput" },
      label: { default: "", parseHTML: (el) => el.getAttribute("data-label") || "", renderHTML: (attrs) => attrs.label ? { "data-label": attrs.label } : {} },
      value: { default: 0, parseHTML: (el) => parseInt(el.getAttribute("data-value") || "0", 10), renderHTML: (attrs) => ({ "data-value": String(attrs.value) }) },
      maxRating: { default: 5, parseHTML: (el) => parseInt(el.getAttribute("data-max-rating") || "5", 10), renderHTML: (attrs) => ({ "data-max-rating": String(attrs.maxRating) }) },
      style: { default: "stars", parseHTML: (el) => el.getAttribute("data-style") || "stars", renderHTML: (attrs) => ({ "data-style": attrs.style }) },
    };
  },

  parseHTML() { return [{ tag: 'div[data-block-type="ratingInput"]' }]; },
  renderHTML({ HTMLAttributes }) { return ["div", mergeAttributes(HTMLAttributes, { class: "block-rating-input", "data-block-type": "ratingInput" })]; },

  addNodeView() {
    return createBlockNodeView({
      blockType: "ratingInput",
      label: "Rating",
      iconName: "Star",
      atom: true,
      renderContent: renderRatingInput,
      updateContent(node, contentDom, editor) {
        contentDom.innerHTML = "";
        renderRatingInput(node, contentDom, editor);
        return true;
      },
    });
  },
});

export const ServerRatingInput = Node.create({
  name: "ratingInput",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "ratingInput" },
      label: { default: "", parseHTML: (el) => el.getAttribute("data-label") || "", renderHTML: (attrs) => attrs.label ? { "data-label": attrs.label } : {} },
      value: { default: 0, parseHTML: (el) => parseInt(el.getAttribute("data-value") || "0", 10), renderHTML: (attrs) => ({ "data-value": String(attrs.value) }) },
      maxRating: { default: 5, parseHTML: (el) => parseInt(el.getAttribute("data-max-rating") || "5", 10), renderHTML: (attrs) => ({ "data-max-rating": String(attrs.maxRating) }) },
      style: { default: "stars", parseHTML: (el) => el.getAttribute("data-style") || "stars", renderHTML: (attrs) => ({ "data-style": attrs.style }) },
    };
  },

  parseHTML() { return [{ tag: 'div[data-block-type="ratingInput"]' }]; },
  renderHTML({ HTMLAttributes }) { return ["div", mergeAttributes(HTMLAttributes, { class: "block-rating-input", "data-block-type": "ratingInput" })]; },
});
