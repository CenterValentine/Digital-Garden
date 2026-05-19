/**
 * FaqAccordion Block — W7 Publishing Block
 *
 * Atom block: a list of question/answer pairs rendered as a native
 * <details>/<summary> accordion (zero JavaScript required in the
 * published view). Different from the editor's Accordion block — this
 * one is page-level FAQ content.
 *
 * Attrs:
 * - items    JSON string: [{question, answer}]
 * - variant  default | bordered | card | flush | compact
 * - openAll  Start with all items expanded
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";
import { dataAttr } from "@/lib/domain/blocks/data-attr";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FaqItem {
  question: string;
  answer: string;
}

function parseItems(raw: string): FaqItem[] {
  try { return JSON.parse(raw) as FaqItem[]; } catch { return []; }
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const VARIANTS = ["default", "bordered", "card", "flush", "compact"] as const;

const { schema: faqSchema, defaults: faqDefaults } = createBlockSchema(
  "faqAccordion",
  {
    items: z
      .string()
      .default("[]")
      .describe('JSON array of FAQ items. Each item: {"question":"...","answer":"..."}')
      .meta({
        fieldType: "json-array",
        addLabel: "Add question",
        emptyMessage: "No questions yet — click Add question",
        jsonArraySchema: [
          { key: "question", label: "Question", type: "text", placeholder: "What is...", required: true },
          { key: "answer", label: "Answer", type: "textarea", placeholder: "The answer is...", required: true },
        ],
      }),
    variant: z.enum(VARIANTS).default("default"),
    openAll: z.boolean().default(false).describe("Start with all items expanded"),
  }
);

registerBlock({
  type: "faqAccordion",
  label: "FAQ",
  description: "Question/answer accordion — uses native <details> for zero-JS collapsing",
  iconName: "HelpCircle",
  family: "content",
  group: "publishing",
  contentModel: null,
  atom: true,
  attrsSchema: faqSchema,
  defaultAttrs: faqDefaults(),
  slashCommand: "/faq",
  searchTerms: ["faq", "accordion", "questions", "answers", "help", "support"],
});

// ─── Shared attrs ─────────────────────────────────────────────────────────────

function faqAttrs() {
  return {
    blockId: { default: null },
    blockType: { default: "faqAccordion" },
    items: dataAttr("items", { default: "[]" }),
    variant: dataAttr("variant", { default: "default" }),
    openAll: dataAttr<boolean>("openAll", { default: false, parseAs: "boolean" }),
  };
}

function editorHtml(items: FaqItem[], variant: string): string {
  if (items.length === 0) {
    return `
      <div style="padding:20px;border:1px dashed #d1d5db;border-radius:8px;text-align:center">
        <p style="margin:0 0 4px;font-size:13px;font-weight:500;color:#374151">FAQ Accordion</p>
        <p style="margin:0;font-size:12px;color:#9ca3af">Add questions via Properties (⋯)</p>
        <p style="margin:6px 0 0;font-size:11px;color:#d1d5db;font-family:monospace">{"question":"...","answer":"..."}</p>
      </div>
    `;
  }

  const rows = items
    .map(
      (item) => `
      <div style="border-bottom:1px solid #e5e7eb;padding:10px 0">
        <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#111827">▸ ${item.question}</p>
        <p style="margin:0;font-size:12px;color:#6b7280">${item.answer}</p>
      </div>
    `
    )
    .join("");

  return `
    <div>
      ${rows}
      <p style="margin:6px 0 0;font-size:11px;color:#9ca3af">${items.length} item${items.length === 1 ? "" : "s"} · ${variant}</p>
    </div>
  `;
}

// ─── Client extension ─────────────────────────────────────────────────────────

export const FaqAccordion = Node.create({
  name: "faqAccordion",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes: faqAttrs,

  parseHTML() {
    return [{ tag: 'div[data-block-type="faqAccordion"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-faq",
        "data-block-type": "faqAccordion",
      }),
    ];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "faqAccordion",
      label: "FAQ",
      iconName: "HelpCircle",
      atom: true,
      renderContent(node, contentDom) {
        contentDom.className = "block-faq-editor";
        contentDom.innerHTML = editorHtml(
          parseItems(node.attrs.items as string),
          node.attrs.variant as string,
        );
      },
      updateContent(node, contentDom) {
        contentDom.innerHTML = editorHtml(
          parseItems(node.attrs.items as string),
          node.attrs.variant as string,
        );
        return true;
      },
    });
  },
});

// ─── Server extension ─────────────────────────────────────────────────────────

export const ServerFaqAccordion = Node.create({
  name: "faqAccordion",
  group: "block",
  atom: true,

  addAttributes: faqAttrs,

  parseHTML() {
    return [{ tag: 'div[data-block-type="faqAccordion"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const items = parseItems(HTMLAttributes["data-items"] ?? "[]");
    const variant = (HTMLAttributes["data-variant"] as string) || "default";
    const openAll = HTMLAttributes["data-open-all"] === true || HTMLAttributes["data-open-all"] === "true";

    const detailsItems = items.map((item) => [
      "details",
      {
        class: "block-faq-item",
        ...(openAll ? { open: "" } : {}),
      },
      ["summary", { class: "block-faq-question" }, item.question],
      ["div", { class: "block-faq-answer" }, ["p", {}, item.answer]],
    ]);

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: `block-faq block-faq--${variant}`,
        "data-block-type": "faqAccordion",
      }),
      ...(items.length > 0
        ? detailsItems
        : [["p", { class: "block-faq-empty" }, "No FAQ items"]]),
    ];
  },
});
