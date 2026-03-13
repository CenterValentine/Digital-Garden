/**
 * AI Highlight Mark — Sprint 40
 *
 * ProseMirror mark that identifies text inserted by AI.
 * Applied automatically during AI edit operations (orchestrator).
 *
 * Behaviors:
 *   - Renders as <span class="ai-highlight" data-source="ai">
 *   - Subtle background tint (toggleable in settings)
 *   - inclusive: false — typing at boundaries doesn't inherit the mark
 *   - Preserved on internal paste, stripped on external copy
 */

import { Mark, mergeAttributes } from "@tiptap/core";

export interface AiHighlightOptions {
  /** HTML attributes applied to the mark's wrapper element */
  HTMLAttributes: Record<string, string>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    aiHighlight: {
      /** Apply AI highlight mark to the current selection */
      setAiHighlight: () => ReturnType;
      /** Remove AI highlight mark from the current selection */
      unsetAiHighlight: () => ReturnType;
    };
  }
}

export const AiHighlight = Mark.create<AiHighlightOptions>({
  name: "aiHighlight",

  // Don't extend the mark when typing at boundaries
  inclusive: false,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      source: {
        default: "ai",
        parseHTML: (element) => element.getAttribute("data-source") || "ai",
        renderHTML: (attributes) => ({
          "data-source": attributes.source,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-source="ai"]',
      },
      {
        tag: "span.ai-highlight",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: "ai-highlight",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setAiHighlight:
        () =>
        ({ commands }) => {
          return commands.setMark(this.name);
        },
      unsetAiHighlight:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});
