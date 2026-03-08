/**
 * Blockquote Line-Only
 *
 * When a blockquote's child paragraph contains a hardBreak, splits
 * the blockquote so that only content before the hardBreak stays
 * quoted. Content after the hardBreak becomes a sibling paragraph
 * outside the blockquote.
 *
 * This fixes the bug where typing `> ` at the start of a paragraph
 * with a Shift+Enter line break wraps ALL text in a blockquote.
 *
 * Uses appendTransaction to run reactively after StarterKit's
 * blockquote input rule has already wrapped the block.
 *
 * Sprint 36 (BF-036-BLOCKQUOTE)
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export const BlockquoteLineOnly = Extension.create({
  name: "blockquoteLineOnly",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("blockquoteLineOnly"),
        appendTransaction: (_transactions, _oldState, newState) => {
          const { doc, tr } = newState;
          let modified = false;

          doc.descendants((node, pos) => {
            // Only process blockquote nodes
            if (node.type.name !== "blockquote") return;

            // Check the first child paragraph for hardBreaks
            const firstChild = node.firstChild;
            if (!firstChild || firstChild.type.name !== "paragraph") return;

            // Does this paragraph contain a hardBreak?
            let hardBreakFound = false;
            firstChild.forEach((child) => {
              if (child.type.name === "hardBreak") {
                hardBreakFound = true;
              }
            });

            if (!hardBreakFound) return;

            // Split the paragraph at the hardBreak
            const beforeContent: any[] = [];
            const afterContent: any[] = [];
            let pastBreak = false;

            firstChild.forEach((child) => {
              if (!pastBreak && child.type.name === "hardBreak") {
                pastBreak = true;
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

            // Build replacement nodes:
            // 1. Blockquote containing only the before-content paragraph
            // 2. Paragraph with after-content (outside blockquote)
            const quotedParagraph = newState.schema.nodes.paragraph.create(
              null,
              beforeContent.length > 0 ? beforeContent : undefined
            );

            // Keep any other children of the blockquote (additional paragraphs)
            const blockquoteChildren = [quotedParagraph];
            for (let i = 1; i < node.childCount; i++) {
              blockquoteChildren.push(node.child(i));
            }

            const blockquoteNode = newState.schema.nodes.blockquote.create(
              null,
              blockquoteChildren
            );
            const afterParagraph = newState.schema.nodes.paragraph.create(
              null,
              afterContent
            );

            // Replace the original blockquote with blockquote + paragraph
            tr.replaceWith(pos, pos + node.nodeSize, [blockquoteNode, afterParagraph]);
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
