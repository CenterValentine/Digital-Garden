"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Image } from "@tiptap/extension-image";
import { useState } from "react";
import styles from "./Images.module.css";

export default function Images() {
  const [imageUrl, setImageUrl] = useState("");

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Image.configure({
        inline: true,
      }),
    ],
    content: `
      <h2>Images Example</h2>
      <p>This example demonstrates image insertion. Use the toolbar below to add images by URL.</p>
      <p>Example image:</p>
      <img src="https://picsum.photos/400/300" alt="Random placeholder image" />
      <p>Images can be inserted inline or as block elements. Try adding your own image using the form below!</p>
    `,
    editorProps: {
      attributes: {
        class: styles.proseMirror,
      },
    },
  });

  const addImage = () => {
    if (imageUrl && editor) {
      editor.chain().focus().setImage({ src: imageUrl }).run();
      setImageUrl("");
    }
  };

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
        <h1 className={styles.title}>Images</h1>
        <p className={styles.subtitle}>
          Insert and display images in the editor
        </p>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <input
          type="text"
          placeholder="Enter image URL..."
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === "Enter") {
              addImage();
            }
          }}
          className={styles.input}
        />
        <button onClick={addImage} className={styles.button}>
          Add Image
        </button>
        <div className={styles.toolbarSeparator} />
        <button
          onClick={() => {
            const url = "https://picsum.photos/400/300?random=" + Date.now();
            editor.chain().focus().setImage({ src: url }).run();
          }}
          className={styles.button}
        >
          Add Random Image
        </button>
      </div>

      <div className={styles.editorWrapper}>
        <EditorContent editor={editor} className={styles.editor} />
      </div>

      <div className={styles.info}>
        <h3>About this example</h3>
        <p>
          This example uses the <strong>Image</strong> extension to insert and
          display images. Features include:
        </p>
        <ul>
          <li>Insert images by URL</li>
          <li>Inline or block-level image display</li>
          <li>Images are responsive and can be styled with CSS</li>
          <li>Click on an image to select it (shows selection border)</li>
        </ul>
        <p>
          <strong>Note:</strong> For production use, you'd typically want to add
          image upload functionality, resize handles, alt text editing, and
          drag-and-drop support. This example shows the basic image insertion.
        </p>
        <p className={styles.tipBox}>
          💡 <strong>Tip:</strong> Try adding images from{" "}
          <a
            href="https://picsum.photos"
            target="_blank"
            rel="noopener noreferrer"
          >
            picsum.photos
          </a>{" "}
          or{" "}
          <a
            href="https://unsplash.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            unsplash.com
          </a>
        </p>
        <a
          href="https://tiptap.dev/docs/examples/basics/images"
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
