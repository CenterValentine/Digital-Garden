/**
 * Prompt Input Block
 *
 * AI-powered input: user enters a prompt, selects a snippet for context,
 * and gets an AI-generated response with configurable length limits.
 * Atom node — interactive form element.
 *
 * Sprint 47: Input Blocks
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";

const { schema: promptInputSchema, defaults: promptInputDefaults } =
  createBlockSchema("promptInput", {
    label: z.string().default("").describe("Field label"),
    prompt: z.string().default("").describe("User prompt text"),
    response: z.string().default("").describe("AI-generated response"),
    maxResponseLength: z
      .number()
      .int()
      .min(0)
      .max(10000)
      .default(500)
      .describe("Max response characters (0 = no limit)"),
    snippetCategoryId: z
      .string()
      .default("")
      .describe("Snippet category ID for AI context"),
    snippetId: z.string().default("").describe("Specific snippet ID for AI context"),
    isLoading: z.boolean().default(false).describe("Loading state"),
  });

registerBlock({
  type: "promptInput",
  label: "AI Prompt",
  description: "AI-powered input with snippet context",
  iconName: "Sparkles",
  family: "form",
  group: "input",
  contentModel: null,
  atom: true,
  attrsSchema: promptInputSchema,
  defaultAttrs: promptInputDefaults(),
  slashCommand: "/prompt",
  searchTerms: ["prompt", "ai", "generate", "llm", "assistant", "form"],
  hiddenFields: ["prompt", "response", "isLoading"],
});

function renderPromptInput(
  node: Parameters<Parameters<typeof createBlockNodeView>[0]["renderContent"]>[0],
  contentDom: HTMLElement,
  editor: Parameters<Parameters<typeof createBlockNodeView>[0]["renderContent"]>[2]
) {
  contentDom.classList.add("input-block-content", "input-block-prompt");

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

  if (node.attrs.label) {
    const labelEl = document.createElement("div");
    labelEl.className = "input-block-label";
    labelEl.textContent = node.attrs.label;
    contentDom.appendChild(labelEl);
  }

  // Prompt textarea
  const promptWrapper = document.createElement("div");
  promptWrapper.className = "input-block-prompt-input-wrapper";

  const promptLabel = document.createElement("div");
  promptLabel.className = "input-block-prompt-section-label";
  promptLabel.textContent = "Prompt";
  promptWrapper.appendChild(promptLabel);

  const promptEl = document.createElement("textarea");
  promptEl.className = "input-block-field";
  promptEl.placeholder = "Enter your prompt...";
  promptEl.value = node.attrs.prompt || "";
  promptEl.rows = 2;
  promptEl.style.resize = "none";
  promptEl.style.overflow = "hidden";

  const autoResize = () => {
    promptEl.style.height = "auto";
    promptEl.style.height = promptEl.scrollHeight + "px";
  };
  promptEl.addEventListener("input", () => {
    autoResize();
    updateAttr({ prompt: promptEl.value });
  });
  requestAnimationFrame(autoResize);
  promptWrapper.appendChild(promptEl);
  contentDom.appendChild(promptWrapper);

  // Generate button
  const btnRow = document.createElement("div");
  btnRow.className = "input-block-prompt-actions";

  const generateBtn = document.createElement("button");
  generateBtn.className = "input-block-prompt-generate-btn";
  generateBtn.textContent = node.attrs.isLoading ? "Generating..." : "Generate";
  generateBtn.disabled = !!node.attrs.isLoading;

  generateBtn.addEventListener("click", () => {
    if (!node.attrs.prompt?.trim()) return;

    updateAttr({ isLoading: true });

    // Dispatch event for AI generation — handled by the chat/AI system
    window.dispatchEvent(
      new CustomEvent("dg:prompt-input-generate", {
        detail: {
          prompt: node.attrs.prompt,
          maxResponseLength: node.attrs.maxResponseLength || 500,
          snippetCategoryId: node.attrs.snippetCategoryId || "",
          snippetId: node.attrs.snippetId || "",
          // Pass a callback ID so the handler can update this specific block
          callbackId: node.attrs.blockId || "",
          updateResponse: (response: string) => {
            updateAttr({ response, isLoading: false });
          },
        },
      })
    );
  });

  btnRow.appendChild(generateBtn);
  contentDom.appendChild(btnRow);

  // Response area
  if (node.attrs.response) {
    const responseWrapper = document.createElement("div");
    responseWrapper.className = "input-block-prompt-response-wrapper";

    const responseLabel = document.createElement("div");
    responseLabel.className = "input-block-prompt-section-label";
    responseLabel.textContent = "Response";
    responseWrapper.appendChild(responseLabel);

    const responseEl = document.createElement("div");
    responseEl.className = "input-block-prompt-response";
    responseEl.textContent = node.attrs.response;
    responseWrapper.appendChild(responseEl);

    if (node.attrs.maxResponseLength > 0) {
      const counter = document.createElement("div");
      counter.className = "input-block-counter";
      counter.textContent = `${node.attrs.response.length}/${node.attrs.maxResponseLength}`;
      responseWrapper.appendChild(counter);
    }

    contentDom.appendChild(responseWrapper);
  }

  if (node.attrs.isLoading) {
    const loadingEl = document.createElement("div");
    loadingEl.className = "input-block-prompt-loading";
    loadingEl.textContent = "Generating response...";
    contentDom.appendChild(loadingEl);
  }
}

export const PromptInput = Node.create({
  name: "promptInput",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "promptInput" },
      label: { default: "", parseHTML: (el) => el.getAttribute("data-label") || "", renderHTML: (attrs) => attrs.label ? { "data-label": attrs.label } : {} },
      prompt: { default: "", parseHTML: (el) => el.getAttribute("data-prompt") || "", renderHTML: (attrs) => attrs.prompt ? { "data-prompt": attrs.prompt } : {} },
      response: { default: "", parseHTML: (el) => el.getAttribute("data-response") || "", renderHTML: (attrs) => attrs.response ? { "data-response": attrs.response } : {} },
      maxResponseLength: { default: 500, parseHTML: (el) => parseInt(el.getAttribute("data-max-response-length") || "500", 10), renderHTML: (attrs) => ({ "data-max-response-length": String(attrs.maxResponseLength) }) },
      snippetCategoryId: { default: "", parseHTML: (el) => el.getAttribute("data-snippet-category-id") || "", renderHTML: (attrs) => attrs.snippetCategoryId ? { "data-snippet-category-id": attrs.snippetCategoryId } : {} },
      snippetId: { default: "", parseHTML: (el) => el.getAttribute("data-snippet-id") || "", renderHTML: (attrs) => attrs.snippetId ? { "data-snippet-id": attrs.snippetId } : {} },
      isLoading: { default: false, parseHTML: (el) => el.getAttribute("data-is-loading") === "true", renderHTML: (attrs) => attrs.isLoading ? { "data-is-loading": "true" } : {} },
    };
  },

  parseHTML() { return [{ tag: 'div[data-block-type="promptInput"]' }]; },
  renderHTML({ HTMLAttributes }) { return ["div", mergeAttributes(HTMLAttributes, { class: "block-prompt-input", "data-block-type": "promptInput" })]; },

  addNodeView() {
    return createBlockNodeView({
      blockType: "promptInput",
      label: "AI Prompt",
      iconName: "Sparkles",
      atom: true,
      renderContent: renderPromptInput,
      updateContent(node, contentDom, editor) {
        contentDom.innerHTML = "";
        renderPromptInput(node, contentDom, editor);
        return true;
      },
    });
  },
});

export const ServerPromptInput = Node.create({
  name: "promptInput",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      blockId: { default: null },
      blockType: { default: "promptInput" },
      label: { default: "", parseHTML: (el) => el.getAttribute("data-label") || "", renderHTML: (attrs) => attrs.label ? { "data-label": attrs.label } : {} },
      prompt: { default: "", parseHTML: (el) => el.getAttribute("data-prompt") || "", renderHTML: (attrs) => attrs.prompt ? { "data-prompt": attrs.prompt } : {} },
      response: { default: "", parseHTML: (el) => el.getAttribute("data-response") || "", renderHTML: (attrs) => attrs.response ? { "data-response": attrs.response } : {} },
      maxResponseLength: { default: 500, parseHTML: (el) => parseInt(el.getAttribute("data-max-response-length") || "500", 10), renderHTML: (attrs) => ({ "data-max-response-length": String(attrs.maxResponseLength) }) },
      snippetCategoryId: { default: "", parseHTML: (el) => el.getAttribute("data-snippet-category-id") || "", renderHTML: (attrs) => attrs.snippetCategoryId ? { "data-snippet-category-id": attrs.snippetCategoryId } : {} },
      snippetId: { default: "", parseHTML: (el) => el.getAttribute("data-snippet-id") || "", renderHTML: (attrs) => attrs.snippetId ? { "data-snippet-id": attrs.snippetId } : {} },
      isLoading: { default: false, parseHTML: (el) => el.getAttribute("data-is-loading") === "true", renderHTML: (attrs) => attrs.isLoading ? { "data-is-loading": "true" } : {} },
    };
  },

  parseHTML() { return [{ tag: 'div[data-block-type="promptInput"]' }]; },
  renderHTML({ HTMLAttributes }) { return ["div", mergeAttributes(HTMLAttributes, { class: "block-prompt-input", "data-block-type": "promptInput" })]; },
});
