"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import styles from "./MarkdownShortcuts.module.css";

export default function MarkdownShortcuts() {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit],
    content: `
      <h2>Try Markdown Shortcuts!</h2>
      <p>Type these at the start of a new line:</p>
      <ul>
        <li><code>#</code> followed by space → Heading 1</li>
        <li><code>##</code> followed by space → Heading 2</li>
        <li><code>###</code> followed by space → Heading 3</li>
        <li><code>-</code> or <code>*</code> followed by space → Bullet list</li>
        <li><code>1.</code> followed by space → Ordered list</li>
        <li><code>&gt;</code> followed by space → Blockquote</li>
        <li><code>\`\`\`</code> followed by space → Code block</li>
        <li><code>---</code> → Horizontal rule</li>
      </ul>
      <p>Wrap text with markdown syntax:</p>
      <ul>
        <li><code>**text**</code> → <strong>bold</strong></li>
        <li><code>*text*</code> or <code>_text_</code> → <em>italic</em></li>
        <li><code>~~text~~</code> → <s>strikethrough</s></li>
        <li><code>\`text\`</code> → <code>inline code</code></li>
      </ul>
      <blockquote>
        <p>Start typing above to test these shortcuts!</p>
      </blockquote>
    `,
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
        <h1 className={styles.title}>Markdown Shortcuts</h1>
        <p className={styles.subtitle}>
          Type markdown syntax for instant formatting
        </p>
      </div>

      <div className={styles.editorWrapper}>
        <EditorContent editor={editor} className={styles.editor} />
      </div>

      <div className={styles.info}>
        <h3>About this example</h3>
        <p>
          This example uses <strong>StarterKit</strong> which includes
          automatic markdown input rules. These rules transform markdown syntax
          into formatted content as you type.
        </p>
        <div className={styles.shortcuts}>
          <div className={styles.shortcutSection}>
            <h4>Block Shortcuts</h4>
            <ul>
              <li><code>#</code> + <code>Space</code> → H1</li>
              <li><code>##</code> + <code>Space</code> → H2</li>
              <li><code>###</code> + <code>Space</code> → H3</li>
              <li><code>-</code> + <code>Space</code> → Bullet list</li>
              <li><code>1.</code> + <code>Space</code> → Ordered list</li>
              <li><code>&gt;</code> + <code>Space</code> → Blockquote</li>
              <li><code>\`\`\`</code> + <code>Space</code> → Code block</li>
            </ul>
          </div>
          <div className={styles.shortcutSection}>
            <h4>Inline Shortcuts</h4>
            <ul>
              <li><code>**text**</code> → Bold</li>
              <li><code>*text*</code> → Italic</li>
              <li><code>_text_</code> → Italic</li>
              <li><code>~~text~~</code> → Strikethrough</li>
              <li><code>`text`</code> → Inline code</li>
              <li><code>---</code> → Horizontal rule</li>
            </ul>
          </div>
        </div>
        <a
          href="https://tiptap.dev/docs/examples/basics/markdown-shortcuts"
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
