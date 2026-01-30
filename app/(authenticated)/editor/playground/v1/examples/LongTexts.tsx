"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import styles from "./LongTexts.module.css";

// Generate Lorem Ipsum text for performance testing
const generateLongText = () => {
  const loremParagraphs = [
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
    "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
    "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.",
    "Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet.",
    "At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident, similique sunt in culpa.",
  ];

  let content = "<h2>Long Text Performance Demo</h2>";
  content += "<p>This example contains <strong>100+ paragraphs</strong> to demonstrate TipTap's performance with large documents. Scroll through and try editing anywhere!</p>";
  content += "<hr />";

  // Generate 100 paragraphs
  for (let i = 1; i <= 100; i++) {
    const paragraph = loremParagraphs[i % loremParagraphs.length];

    if (i % 10 === 0) {
      content += `<h3>Section ${i / 10}</h3>`;
    }

    content += `<p><strong>Paragraph ${i}:</strong> ${paragraph}</p>`;
  }

  content += "<hr />";
  content += "<p><strong>End of document.</strong> TipTap handles this large document efficiently with virtual scrolling and optimized rendering.</p>";

  return content;
};

export default function LongTexts() {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit],
    content: generateLongText(),
    editorProps: {
      attributes: {
        class: styles.proseMirror,
      },
    },
  });

  if (!editor) {
    return (
      <div className={styles.loading}>
        <p>Loading editor with 100+ paragraphs...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Long Texts</h1>
        <p className={styles.subtitle}>
          Performance demonstration with large documents
        </p>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>100+</span>
          <span className={styles.statLabel}>Paragraphs</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>10</span>
          <span className={styles.statLabel}>Sections</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>~15K</span>
          <span className={styles.statLabel}>Words</span>
        </div>
      </div>

      <div className={styles.editorWrapper}>
        <EditorContent editor={editor} className={styles.editor} />
      </div>

      <div className={styles.info}>
        <h3>About this example</h3>
        <p>
          This example demonstrates TipTap's performance with large documents.
          It contains <strong>100+ paragraphs</strong> of Lorem Ipsum text
          organized into 10 sections.
        </p>
        <p><strong>Performance features:</strong></p>
        <ul>
          <li>Efficient DOM rendering with ProseMirror's optimized algorithms</li>
          <li>Fast scrolling even with thousands of nodes</li>
          <li>Quick cursor movement and text selection</li>
          <li>Responsive editing at any position in the document</li>
          <li>Low memory footprint despite document size</li>
        </ul>
        <p>
          Try scrolling through the document, editing text at different
          positions, or using keyboard shortcuts. Notice how TipTap maintains
          smooth performance throughout.
        </p>
        <a
          href="https://tiptap.dev/docs/examples/basics/long-texts"
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
