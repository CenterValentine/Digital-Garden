/**
 * StatBlock Block — W4 Publishing Block
 *
 * Atom block: a single large metric / statistic display.
 * For a row of multiple stats use MetricsStrip.
 *
 * Attrs:
 * - value       display value (string — allows "2.4M", "$42k", etc.)
 * - label       metric label
 * - prefix      text before the value (e.g. "$", "+")
 * - suffix      text after the value (e.g. "%", "k")
 * - description optional sub-label
 * - animation   none | count-up | pulse
 * - variant     default | card | minimal | featured
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { blockIdAttr } from "@/lib/domain/blocks/data-attr";
import {
  BACKGROUND_SCHEMA_SHAPE,
  backgroundAttrs,
} from "../lib/background-attrs";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";
import { makeWrapAttrs } from "@/lib/domain/blocks/wrap-size";
import { makeEditableField, syncEditableField } from "@/lib/domain/blocks/inline-edit";

// ─── Schema ──────────────────────────────────────────────────────────────────

const { schema: statBlockSchema, defaults: statBlockDefaults } = createBlockSchema(
  "statBlock",
  {
    value: z.string().default("0").describe("Displayed metric value — can be any string like '2.4M', '99%', '$42k'"),
    label: z.string().default("").describe("Metric label shown below the value"),
    prefix: z.string().default("").describe("Text shown before the value (e.g. $ or +)"),
    suffix: z.string().default("").describe("Text shown after the value (e.g. % or k)"),
    description: z.string().default("").describe("Optional sub-label / context sentence"),
    animation: z.enum(["none", "count-up", "pulse"]).default("none"),
    variant: z.enum(["default", "card", "minimal", "featured"]).default("default"),
    ...BACKGROUND_SCHEMA_SHAPE,
  }
);

registerBlock({
  type: "statBlock",
  label: "Stat Block",
  description: "Single large metric display with optional animation",
  iconName: "Hash",
  family: "content",
  group: "publishing",
  contentModel: null,
  atom: true,
  attrsSchema: statBlockSchema,
  defaultAttrs: statBlockDefaults(),
  slashCommand: "/stat",
  searchTerms: ["stat", "metric", "number", "kpi", "counter", "analytics"],
});

// ─── Shared attrs ─────────────────────────────────────────────────────────────

function statBlockAttrs() {
  const str = (key: string) => ({
    default: "",
    parseHTML: (el: Element) => el.getAttribute(`data-${key}`) ?? "",
    renderHTML: (attrs: Record<string, unknown>) =>
      attrs[key] ? { [`data-${key}`]: attrs[key] } : {},
  });

  return {
    blockId: blockIdAttr,
    blockType: { default: "statBlock" },
    value: {
      default: "0",
      parseHTML: (el: Element) => el.getAttribute("data-value") ?? "0",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-value": attrs.value }),
    },
    label: str("label"),
    prefix: str("prefix"),
    suffix: str("suffix"),
    description: str("description"),
    animation: {
      default: "none",
      parseHTML: (el: Element) => el.getAttribute("data-animation") ?? "none",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-animation": attrs.animation }),
    },
    variant: {
      default: "default",
      parseHTML: (el: Element) => el.getAttribute("data-variant") ?? "default",
      renderHTML: (attrs: Record<string, unknown>) => ({ "data-variant": attrs.variant }),
    },
    ...backgroundAttrs(),
    ...makeWrapAttrs(),
  };
}

// ─── Editor DOM refs ──────────────────────────────────────────────────────────

interface StatEditorRefs {
  prefixEl: HTMLElement;
  valueEl: HTMLElement;
  suffixEl: HTMLElement;
  labelEl: HTMLElement;
  descEl: HTMLElement;
}
const statRefs = new WeakMap<HTMLElement, StatEditorRefs>();

function buildStatDom(
  contentDom: HTMLElement,
  value: string, label: string, prefix: string, suffix: string,
  description: string, variant: string,
  bgColor?: string, bgGradient?: string,
): StatEditorRefs {
  contentDom.className = `block-stat block-stat--${variant} block-stat-editor`;
  contentDom.innerHTML = "";
  const bgStyle = bgGradient ? `background:${bgGradient}` : bgColor ? `background:${bgColor}` : "";
  contentDom.setAttribute("style", bgStyle);

  const valueWrap = document.createElement("span");
  valueWrap.className = "block-stat-value";

  const prefixEl = makeEditableField("span", "block-stat-prefix", prefix, "prefix", "$");
  const valueEl = makeEditableField("span", "block-stat-number", value || "0", "value", "0");
  const suffixEl = makeEditableField("span", "block-stat-suffix", suffix, "suffix", "%");

  valueWrap.appendChild(prefixEl);
  valueWrap.appendChild(valueEl);
  valueWrap.appendChild(suffixEl);

  const labelEl = makeEditableField("p", "block-stat-label", label, "label", "Metric label");
  const descEl = makeEditableField("p", "block-stat-description", description, "description", "Optional description");

  contentDom.appendChild(valueWrap);
  contentDom.appendChild(labelEl);
  contentDom.appendChild(descEl);

  return { prefixEl, valueEl, suffixEl, labelEl, descEl };
}

// ─── Client extension ─────────────────────────────────────────────────────────

export const StatBlock = Node.create({
  name: "statBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes: statBlockAttrs,

  parseHTML() {
    return [{ tag: 'div[data-block-type="statBlock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "block-stat", "data-block-type": "statBlock" }),
    ];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "statBlock",
      label: "Stat Block",
      iconName: "Hash",
      atom: true,
      supportWrap: true,
      renderContent(node, contentDom) {
        const a = node.attrs as Record<string, string>;
        const refs = buildStatDom(
          contentDom, a.value, a.label, a.prefix, a.suffix, a.description, a.variant, a.bgColor, a.bgGradient,
        );
        statRefs.set(contentDom, refs);
      },
      updateContent(node, contentDom) {
        const refs = statRefs.get(contentDom);
        if (!refs) return false;
        const a = node.attrs as Record<string, string>;

        contentDom.className = `block-stat block-stat--${a.variant || "default"} block-stat-editor`;
        const bgStyle = a.bgGradient ? `background:${a.bgGradient}` : a.bgColor ? `background:${a.bgColor}` : "";
        contentDom.setAttribute("style", bgStyle);
        syncEditableField(refs.prefixEl, a.prefix);
        syncEditableField(refs.valueEl, a.value || "0");
        syncEditableField(refs.suffixEl, a.suffix);
        syncEditableField(refs.labelEl, a.label);
        syncEditableField(refs.descEl, a.description);
        return true;
      },
    });
  },
});

// ─── Server extension ─────────────────────────────────────────────────────────

export const ServerStatBlock = Node.create({
  name: "statBlock",
  group: "block",
  atom: true,

  addAttributes: statBlockAttrs,

  parseHTML() {
    return [{ tag: 'div[data-block-type="statBlock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const value = (HTMLAttributes["data-value"] ?? "0") as string;
    const label = (HTMLAttributes["data-label"] ?? "") as string;
    const prefix = (HTMLAttributes["data-prefix"] ?? "") as string;
    const suffix = (HTMLAttributes["data-suffix"] ?? "") as string;
    const description = (HTMLAttributes["data-description"] ?? "") as string;
    const animation = (HTMLAttributes["data-animation"] ?? "none") as string;
    const variant = (HTMLAttributes["data-variant"] ?? "default") as string;
    const bgColor = (HTMLAttributes["data-bg-color"] ?? "") as string;
    const bgGradient = (HTMLAttributes["data-bg-gradient"] ?? "") as string;
    const bgStyle = bgGradient ? `background:${bgGradient}` : bgColor ? `background:${bgColor}` : "";

    // Extract numeric part from value for count-up animation
    const numericMatch = value.match(/^(-?[\d.]+)/);
    const numericPart = numericMatch ? numericMatch[1] : null;
    const numericSuffix = numericPart ? value.slice(numericPart.length) : "";
    const countable = animation === "count-up" && numericPart !== null;

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: `block-stat block-stat--${variant}`,
        "data-block-type": "statBlock",
        "data-animation": animation,
        ...(bgStyle ? { style: bgStyle } : {}),
      }),
      [
        "span",
        { class: "block-stat-value", "aria-label": `${prefix}${value}${suffix}` },
        ...(prefix ? [["span", { class: "block-stat-prefix", "aria-hidden": "true" }, prefix]] : []),
        [
          "span",
          {
            class: "block-stat-number",
            ...(countable ? {
              "data-count-target": numericPart!,
              "data-count-value-suffix": numericSuffix,
            } : {}),
          },
          value,
        ],
        ...(suffix ? [["span", { class: "block-stat-suffix", "aria-hidden": "true" }, suffix]] : []),
      ],
      ...(label ? [["p", { class: "block-stat-label" }, label]] : []),
      ...(description ? [["p", { class: "block-stat-description" }, description]] : []),
    ];
  },
});
