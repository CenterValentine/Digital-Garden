"use client";

/**
 * Editor QA fixture mount.
 *
 * Mounts the actual TipTap editor (with full getEditorExtensions(),
 * including NodeViews, chrome, drag handles, badges) loaded with a
 * fixture JSON. Used by /test/editor-fixtures/[block] to give testers
 * a per-block surface to visually inspect editor rendering — separate
 * from the publisher surface (.public-prose) covered by TipTapContent.
 *
 * Renders the editor in editable mode so NodeViews mount their full
 * chrome (insert "+" buttons, drag handles, type badges, menu). The
 * editing affordances are the point of this surface — testers should
 * see exactly what authors see while editing.
 *
 * No persistence: edits don't save anywhere. The mount is for visual
 * inspection only. Playwright snapshots capture the editor view at
 * initial mount.
 */

import { useEditor, EditorContent } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import { getEditorExtensions } from "@/lib/domain/editor/extensions-client";

interface EditorFixtureMountProps {
  bodyJson: JSONContent;
}

export function EditorFixtureMount({ bodyJson }: EditorFixtureMountProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: getEditorExtensions(),
    content: bodyJson,
    editable: true,
    editorProps: {
      attributes: {
        class: "ProseMirror block-editing-active focus:outline-none",
      },
    },
  });

  if (!editor) {
    return <div data-editor-fixture-state="loading">Loading editor…</div>;
  }

  return (
    <div data-editor-fixture-state="ready">
      <EditorContent editor={editor} />
    </div>
  );
}
