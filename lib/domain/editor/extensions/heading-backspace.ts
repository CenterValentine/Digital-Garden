/**
 * Heading Backspace Escape
 *
 * Backspace on an empty heading reverts to paragraph with # chain:
 * - Empty H1 → paragraph with `#`
 * - Empty H2 → paragraph with `##`
 * - Empty H3 → paragraph with `###`
 *
 * From the # chain, typing space re-enters heading mode via StarterKit input rules.
 * Backspace in the # chain deletes # characters one at a time (default text behavior).
 *
 * Sprint 35 (BF-035-006)
 */

import { Extension } from "@tiptap/core";

export const HeadingBackspace = Extension.create({
  name: "headingBackspace",

  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { state } = this.editor;
        const { selection } = state;
        const { $from, empty } = selection;

        if (!empty) return false;

        // Only handle in heading nodes
        if ($from.parent.type.name !== "heading") return false;

        // Only handle empty headings (no text content)
        if ($from.parent.textContent.length > 0) return false;

        // Only handle at start of heading
        if ($from.parentOffset !== 0) return false;

        const level = $from.parent.attrs.level as number;
        const hashes = "#".repeat(level);

        // Convert heading to paragraph with # chain
        this.editor
          .chain()
          .setNode("paragraph")
          .insertContent(hashes)
          .run();

        return true;
      },
    };
  },
});
