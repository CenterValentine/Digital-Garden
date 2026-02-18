"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { Document } from "@tiptap/extension-document";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import styles from "./MinimalSetup.module.css";

export default function MinimalSetup() {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [Document, Paragraph, Text],
    content: "<p>This is the most minimal setup possible. Only Document, Paragraph, and Text extensions are loaded. Try typing...</p>",
    editorProps: {
      attributes: {
        class: styles.proseMirror,
      },
    },
  });

  if (!editor) {
    return (
      <div className={styles.loading}>
        <p>Loading editor...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Minimal Setup</h1>
        <p className={styles.subtitle}>
          Bare minimum editor configuration - Document, Paragraph, and Text only
        </p>
      </div>

      <div className={styles.editorWrapper}>
        <EditorContent editor={editor} className={styles.editor} />
      </div>

      <div className={styles.info}>
        <h3>About this example</h3>
        <p>
          This example uses only <strong>three extensions</strong>:
        </p>
        <ul>
          <li><code>Document</code> - Top-level node</li>
          <li><code>Paragraph</code> - Block-level text container</li>
          <li><code>Text</code> - Inline text node</li>
        </ul>
        <p>
          No formatting (bold, italic), no headings, no lists. Just plain text
          in paragraphs. Perfect for comments or simple input fields.
        </p>
        <a
          href="https://tiptap.dev/docs/examples/basics/minimal-setup"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.docLink}
        >
          View official docs →
        </a>
      </div>
    </div>
  );
}
