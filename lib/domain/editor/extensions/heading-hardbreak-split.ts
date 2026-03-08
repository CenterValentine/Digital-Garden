/**
 * Heading HardBreak Split
 *
 * When a heading node contains a hardBreak, splits the heading so that
 * only content before the hardBreak stays as a heading. Content after
 * the hardBreak becomes a new paragraph.
 *
 * This fixes the bug where typing `## ` at the start of a paragraph
 * with a Shift+Enter line break converts ALL text (before and after
 * the break) to a heading.
 *
 * Uses appendTransaction to run reactively after StarterKit's heading
 * input rule has already converted the block.
 *
 * Sprint 36 (BF-036-HARDBREAK)
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export const HeadingHardbreakSplit = Extension.create({
  name: "headingHardbreakSplit",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("headingHardbreakSplit"),
        appendTransaction: (_transactions, _oldState, newState) => {
          const { doc, tr } = newState;
          let modified = false;

          doc.descendants((node, pos) => {
            // Only process heading nodes
            if (node.type.name !== "heading") return;

            // Check if this heading contains a hardBreak
            let hardBreakOffset = -1;
            node.forEach((child, offset) => {
              if (hardBreakOffset === -1 && child.type.name === "hardBreak") {
                hardBreakOffset = offset;
              }
            });

            if (hardBreakOffset === -1) return;

            // Found a hardBreak in a heading — split it.
            // Collect content before and after the hardBreak.
            const beforeContent: any[] = [];
            const afterContent: any[] = [];
            let pastBreak = false;
            let breakNodeSize = 0;

            node.forEach((child, offset) => {
              if (!pastBreak && child.type.name === "hardBreak") {
                pastBreak = true;
                breakNodeSize = child.nodeSize;
                return;
              }
              if (pastBreak) {
                afterContent.push(child);
              } else {
                beforeContent.push(child);
              }
            });

            // Only split if there's content after the hardBreak
            if (afterContent.length === 0) return;

            // Build the replacement: heading with before-content + paragraph with after-content
            const headingNode = newState.schema.nodes.heading.create(
              { level: node.attrs.level },
              beforeContent.length > 0 ? beforeContent : undefined
            );
            const paragraphNode = newState.schema.nodes.paragraph.create(
              null,
              afterContent
            );

            // Replace the original heading with heading + paragraph
            // pos is the position before the heading, pos + node.nodeSize is after
            tr.replaceWith(pos, pos + node.nodeSize, [headingNode, paragraphNode]);
            modified = true;

            // Don't descend into children
            return false;
          });

          return modified ? tr : null;
        },
      }),
    ];
  },
});
