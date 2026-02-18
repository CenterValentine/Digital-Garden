"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { TextAlign } from "@tiptap/extension-text-align";
import styles from "./Formatting.module.css";

export default function Formatting() {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
    ],
    content: `
      <h2>Text Formatting Example</h2>
      <p>Use the toolbar below to format text. Try selecting text and clicking the formatting buttons.</p>
      <p><strong>Bold text</strong>, <em>italic text</em>, <u>underlined text</u>, and <s>strikethrough text</s>.</p>
      <p style="text-align: center">Center-aligned paragraph</p>
      <p style="text-align: right">Right-aligned paragraph</p>
      <p>You can also use keyboard shortcuts: <strong>Ctrl/Cmd+B</strong> for bold, <strong>Ctrl/Cmd+I</strong> for italic, <strong>Ctrl/Cmd+U</strong> for underline.</p>
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
        <h1 className={styles.title}>Formatting</h1>
        <p className={styles.subtitle}>
          Text formatting tools with toolbar controls
        </p>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={editor.isActive("bold") ? styles.active : ""}
            title="Bold (Ctrl+B)"
          >
            <strong>B</strong>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={editor.isActive("italic") ? styles.active : ""}
            title="Italic (Ctrl+I)"
          >
            <em>I</em>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={editor.isActive("underline") ? styles.active : ""}
            title="Underline (Ctrl+U)"
          >
            <u>U</u>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={editor.isActive("strike") ? styles.active : ""}
            title="Strikethrough"
          >
            <s>S</s>
          </button>
        </div>

        <div className={styles.toolbarSeparator} />

        <div className={styles.toolbarGroup}>
          <button
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            className={editor.isActive({ textAlign: "left" }) ? styles.active : ""}
            title="Align Left"
          >
            ≡ Left
          </button>
          <button
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            className={editor.isActive({ textAlign: "center" }) ? styles.active : ""}
            title="Align Center"
          >
            ≡ Center
          </button>
          <button
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            className={editor.isActive({ textAlign: "right" }) ? styles.active : ""}
            title="Align Right"
          >
            ≡ Right
          </button>
        </div>

        <div className={styles.toolbarSeparator} />

        <div className={styles.toolbarGroup}>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={editor.isActive("heading", { level: 1 }) ? styles.active : ""}
            title="Heading 1"
          >
            H1
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={editor.isActive("heading", { level: 2 }) ? styles.active : ""}
            title="Heading 2"
          >
            H2
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={editor.isActive("heading", { level: 3 }) ? styles.active : ""}
            title="Heading 3"
          >
            H3
          </button>
        </div>
      </div>

      <div className={styles.editorWrapper}>
        <EditorContent editor={editor} className={styles.editor} />
      </div>

      <div className={styles.info}>
        <h3>About this example</h3>
        <p>
          This example demonstrates text formatting with a custom toolbar. It
          uses the following extensions:
        </p>
        <ul>
          <li><strong>StarterKit</strong> - Includes Bold, Italic, Strike, and Heading</li>
          <li><strong>Underline</strong> - Adds underline formatting</li>
          <li><strong>TextAlign</strong> - Provides text alignment options</li>
        </ul>
        <p>
          The toolbar buttons use <code>editor.chain().focus()</code> to keep
          the cursor position and apply formatting. The <code>isActive()</code>
          method highlights the active button.
        </p>
        <a
          href="https://tiptap.dev/docs/examples/basics/formatting"
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
