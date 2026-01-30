"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextAlign } from "@tiptap/extension-text-align";
import styles from "./TextDirection.module.css";

export default function TextDirection() {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
    ],
    content: `
      <h2>Text Direction Example</h2>
      <p>This example demonstrates text direction support for left-to-right (LTR) and right-to-left (RTL) languages.</p>

      <h3>English (LTR)</h3>
      <p>This is a paragraph in English, which reads from left to right. English, Spanish, French, and most European languages use LTR direction.</p>

      <h3 dir="rtl">العربية (RTL)</h3>
      <p dir="rtl">هذا نص باللغة العربية يُقرأ من اليمين إلى اليسار. اللغة العربية والعبرية والفارسية تستخدم الاتجاه من اليمين إلى اليسار.</p>

      <h3 dir="rtl">עברית (RTL)</h3>
      <p dir="rtl">זהו טקסט בעברית הנקרא מימין לשמאל. עברית, ערבית ופרסית משתמשות בכיוון מימין לשמאל.</p>

      <h3>Mixed Content (Bi-directional)</h3>
      <p>You can mix LTR and RTL text: Hello مرحبا Shalom שלום!</p>

      <h3 dir="rtl">محتوى مختلط (ثنائي الاتجاه)</h3>
      <p dir="rtl">يمكنك مزج النص من اليسار إلى اليمين ومن اليمين إلى اليسار: مرحبا Hello שלום Shalom!</p>
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
        <h1 className={styles.title}>Text Direction</h1>
        <p className={styles.subtitle}>
          Support for LTR, RTL, and bi-directional text
        </p>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <button
            onClick={() => {
              const { view, state } = editor;
              const { from } = state.selection;
              const node = view.domAtPos(from).node as HTMLElement;
              if (node.nodeType === Node.ELEMENT_NODE) {
                const element = node as HTMLElement;
                element.setAttribute("dir", "ltr");
              }
            }}
            className={styles.button}
            title="Set LTR direction"
          >
            LTR →
          </button>
          <button
            onClick={() => {
              const { view, state } = editor;
              const { from } = state.selection;
              const node = view.domAtPos(from).node as HTMLElement;
              if (node.nodeType === Node.ELEMENT_NODE) {
                const element = node as HTMLElement;
                element.setAttribute("dir", "rtl");
              }
            }}
            className={styles.button}
            title="Set RTL direction"
          >
            ← RTL
          </button>
          <button
            onClick={() => {
              const { view, state } = editor;
              const { from } = state.selection;
              const node = view.domAtPos(from).node as HTMLElement;
              if (node.nodeType === Node.ELEMENT_NODE) {
                const element = node as HTMLElement;
                element.removeAttribute("dir");
              }
            }}
            className={styles.button}
            title="Auto direction"
          >
            Auto
          </button>
        </div>
      </div>

      <div className={styles.editorWrapper}>
        <EditorContent editor={editor} className={styles.editor} />
      </div>

      <div className={styles.info}>
        <h3>About this example</h3>
        <p>
          This example demonstrates text direction support in TipTap. While
          TipTap doesn't have a dedicated TextDirection extension, you can
          control text direction using the standard HTML <code>dir</code>{" "}
          attribute.
        </p>
        <p><strong>Supported directions:</strong></p>
        <ul>
          <li>
            <strong>LTR (Left-to-Right)</strong> - Default for English,
            Spanish, French, German, and most languages
          </li>
          <li>
            <strong>RTL (Right-to-Left)</strong> - For Arabic, Hebrew, Persian,
            Urdu, and other RTL languages
          </li>
          <li>
            <strong>Auto</strong> - Browser automatically detects direction
            based on content
          </li>
        </ul>
        <p>
          The toolbar buttons above allow you to set the text direction for the
          current paragraph. You can also manually add <code>dir="rtl"</code>{" "}
          or <code>dir="ltr"</code> attributes to elements.
        </p>
        <p>
          <strong>Note:</strong> For production RTL support, you may want to
          create a custom extension that properly handles direction as a mark
          or node attribute, allowing undo/redo and better integration with
          TipTap's command system.
        </p>
        <a
          href="https://tiptap.dev/docs/examples/basics/text-direction"
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
