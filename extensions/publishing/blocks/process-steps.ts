/**
 * ProcessSteps Block — W4 Publishing Block
 *
 * Atom block: step-by-step process or how-to list.
 * Items stored as JSON string.
 *
 * Attrs:
 * - steps    JSON string: [{number?, title, description?, icon?}]
 * - variant  numbered | dotted | arrow | cards | minimal | icon
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { blockIdAttr } from "@/lib/domain/blocks/data-attr";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";
import { dataAttr } from "@/lib/domain/blocks/data-attr";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProcessStep {
  number?: number;
  title: string;
  description?: string;
  icon?: string;
}

function parseSteps(raw: string): ProcessStep[] {
  try { return JSON.parse(raw) as ProcessStep[]; } catch { return []; }
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const VARIANTS = ["numbered", "dotted", "arrow", "cards", "minimal", "icon"] as const;

const { schema: processStepsSchema, defaults: processStepsDefaults } = createBlockSchema(
  "processSteps",
  {
    steps: z
      .string()
      .default("[]")
      .describe('JSON array of steps. Each step: {"title":"Step name","description":"What to do","number":1}')
      .meta({
        fieldType: "json-array",
        addLabel: "Add step",
        emptyMessage: "No steps yet — click Add step",
        jsonArraySchema: [
          { key: "title", label: "Step title", type: "text", placeholder: "Install dependencies", required: true },
          { key: "description", label: "Description", type: "textarea", placeholder: "Run npm install in the project root" },
          { key: "number", label: "Step # (auto)", type: "number", min: 1, placeholder: "Leave blank to auto-number" },
        ],
      }),
    variant: z.enum(VARIANTS).default("numbered"),
  }
);

registerBlock({
  type: "processSteps",
  label: "Process Steps",
  description: "Step-by-step process or how-to list — 6 visual variants",
  iconName: "ListOrdered",
  family: "content",
  group: "publishing",
  contentModel: null,
  atom: true,
  attrsSchema: processStepsSchema,
  defaultAttrs: processStepsDefaults(),
  slashCommand: "/steps",
  searchTerms: ["steps", "process", "how-to", "guide", "workflow", "numbered", "list"],
});

// ─── Shared attrs ─────────────────────────────────────────────────────────────

function processStepsAttrs() {
  return {
    blockId: blockIdAttr,
    blockType: { default: "processSteps" },
    steps: dataAttr("steps", { default: "[]" }),
    variant: dataAttr("variant", { default: "numbered" }),
  };
}

function editorHtml(steps: ProcessStep[], variant: string): string {
  if (steps.length === 0) {
    return `
      <div style="padding:20px;border:1px dashed #d1d5db;border-radius:8px;text-align:center">
        <p style="margin:0 0 4px;font-size:13px;font-weight:500;color:#374151">Process Steps</p>
        <p style="margin:0;font-size:12px;color:#9ca3af">Add steps via Properties (⋯)</p>
        <p style="margin:6px 0 0;font-size:11px;color:#d1d5db;font-family:monospace">{"title":"Step name","description":"What to do"}</p>
      </div>
    `;
  }

  return `
    <div style="display:flex;flex-direction:column;gap:10px">
      ${steps.map((step, i) => `
        <div style="display:flex;align-items:flex-start;gap:12px">
          <div style="flex-shrink:0;width:28px;height:28px;border-radius:50%;background:#eff6ff;border:2px solid #bfdbfe;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;color:#1d4ed8">
            ${step.number ?? i + 1}
          </div>
          <div style="flex:1;padding-top:3px">
            <p style="margin:0;font-size:13px;font-weight:600;color:#111827">${step.title}</p>
            ${step.description ? `<p style="margin:2px 0 0;font-size:12px;color:#6b7280">${step.description}</p>` : ""}
          </div>
        </div>
      `).join("")}
    </div>
    <p style="margin:8px 0 0;font-size:11px;color:#9ca3af">${steps.length} step${steps.length === 1 ? "" : "s"} · ${variant} variant</p>
  `;
}

// ─── Client extension ─────────────────────────────────────────────────────────

export const ProcessSteps = Node.create({
  name: "processSteps",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes: processStepsAttrs,

  parseHTML() {
    return [{ tag: 'div[data-block-type="processSteps"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "block-process-steps", "data-block-type": "processSteps" }),
    ];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "processSteps",
      label: "Process Steps",
      iconName: "ListOrdered",
      atom: true,
      renderContent(node, contentDom) {
        contentDom.className = "block-process-steps-editor";
        contentDom.innerHTML = editorHtml(
          parseSteps(node.attrs.steps as string),
          node.attrs.variant as string,
        );
      },
      updateContent(node, contentDom) {
        contentDom.innerHTML = editorHtml(
          parseSteps(node.attrs.steps as string),
          node.attrs.variant as string,
        );
        return true;
      },
    });
  },
});

// ─── Server extension ─────────────────────────────────────────────────────────

export const ServerProcessSteps = Node.create({
  name: "processSteps",
  group: "block",
  atom: true,

  addAttributes: processStepsAttrs,

  parseHTML() {
    return [{ tag: 'div[data-block-type="processSteps"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const steps = parseSteps(HTMLAttributes["data-steps"] ?? "[]");
    const variant = (HTMLAttributes["data-variant"] ?? "numbered") as string;

    const items = steps.map((step, i) => [
      "li",
      { class: "block-process-steps-item", "data-step": step.number ?? i + 1 },
      ["span", { class: "block-process-steps-number", "aria-hidden": "true" }, String(step.number ?? i + 1)],
      [
        "div",
        { class: "block-process-steps-content" },
        ["h3", { class: "block-process-steps-title" }, step.title],
        ...(step.description ? [["p", { class: "block-process-steps-description" }, step.description]] : []),
      ],
    ]);

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: `block-process-steps block-process-steps--${variant}`,
        "data-block-type": "processSteps",
      }),
      steps.length > 0
        ? ["ol", { class: "block-process-steps-list" }, ...items]
        : ["p", { class: "block-process-steps-empty" }, "No steps"],
    ];
  },
});
