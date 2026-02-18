"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import styles from "./DefaultTextEditor.module.css";

export default function DefaultTextEditor() {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit],
    content: `
      <h2>Welcome to the Default Text Editor</h2>
      <p>This is a basic editor using the <strong>StarterKit</strong> extension bundle.</p>
      <p>Try these features:</p>
      <ul>
        <li>Type <strong>bold</strong> and <em>italic</em> text</li>
        <li>Create headings with <code>#</code>, <code>##</code>, <code>###</code></li>
        <li>Make lists with <code>-</code> or <code>1.</code></li>
        <li>Use <code>&gt;</code> for blockquotes</li>
      </ul>
      <blockquote>
        <p>The StarterKit includes 20+ extensions out of the box!</p>
      </blockquote>
      <p>Press <strong>Ctrl+B</strong> (or <strong>Cmd+B</strong> on Mac) for bold.</p>
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
        <h1 className={styles.title}>Default Text Editor</h1>
        <p className={styles.subtitle}>
          Basic editor with StarterKit (bold, italic, headings, lists, and more)
        </p>
      </div>

      <div className={styles.editorWrapper}>
        <EditorContent editor={editor} className={styles.editor} />
      </div>

      <div className={styles.info}>
        <h3>About this example</h3>
        <p>
          This example uses the <strong>StarterKit</strong> extension, which
          bundles 20+ common extensions including:
        </p>
        <div className={styles.columns}>
          <ul>
            <li>Document</li>
            <li>Paragraph</li>
            <li>Text</li>
            <li>Bold</li>
            <li>Italic</li>
            <li>Strike</li>
            <li>Code</li>
          </ul>
          <ul>
            <li>Heading</li>
            <li>Blockquote</li>
            <li>CodeBlock</li>
            <li>BulletList</li>
            <li>OrderedList</li>
            <li>ListItem</li>
            <li>HardBreak, HorizontalRule, History</li>
          </ul>
        </div>
        <p>
          All markdown shortcuts work automatically (try <code>#</code> for
          headings or <code>-</code> for lists).
        </p>
        <a
          href="https://tiptap.dev/docs/examples/basics/default-text-editor"
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
