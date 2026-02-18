"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import styles from "./Tables.module.css";

export default function Tables() {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: `
      <h2>Tables Example</h2>
      <p>Use the toolbar below to create and modify tables:</p>
      <table>
        <thead>
          <tr>
            <th>Feature</th>
            <th>Status</th>
            <th>Priority</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Add row</td>
            <td>✅ Done</td>
            <td>High</td>
          </tr>
          <tr>
            <td>Add column</td>
            <td>✅ Done</td>
            <td>High</td>
          </tr>
          <tr>
            <td>Delete row</td>
            <td>✅ Done</td>
            <td>Medium</td>
          </tr>
          <tr>
            <td>Delete column</td>
            <td>✅ Done</td>
            <td>Medium</td>
          </tr>
        </tbody>
      </table>
      <p>Try clicking inside the table and using the toolbar buttons to add or delete rows and columns.</p>
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
        <h1 className={styles.title}>Tables</h1>
        <p className={styles.subtitle}>
          Create and edit tables with rows and columns
        </p>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <button
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
          className={styles.button}
        >
          Insert Table (3×3)
        </button>

        <div className={styles.toolbarSeparator} />

        <button
          onClick={() => editor.chain().focus().addRowBefore().run()}
          disabled={!editor.can().addRowBefore()}
          className={styles.button}
        >
          Add Row Above
        </button>
        <button
          onClick={() => editor.chain().focus().addRowAfter().run()}
          disabled={!editor.can().addRowAfter()}
          className={styles.button}
        >
          Add Row Below
        </button>
        <button
          onClick={() => editor.chain().focus().deleteRow().run()}
          disabled={!editor.can().deleteRow()}
          className={styles.button}
        >
          Delete Row
        </button>

        <div className={styles.toolbarSeparator} />

        <button
          onClick={() => editor.chain().focus().addColumnBefore().run()}
          disabled={!editor.can().addColumnBefore()}
          className={styles.button}
        >
          Add Column Left
        </button>
        <button
          onClick={() => editor.chain().focus().addColumnAfter().run()}
          disabled={!editor.can().addColumnAfter()}
          className={styles.button}
        >
          Add Column Right
        </button>
        <button
          onClick={() => editor.chain().focus().deleteColumn().run()}
          disabled={!editor.can().deleteColumn()}
          className={styles.button}
        >
          Delete Column
        </button>

        <div className={styles.toolbarSeparator} />

        <button
          onClick={() => editor.chain().focus().deleteTable().run()}
          disabled={!editor.can().deleteTable()}
          className={styles.buttonDanger}
        >
          Delete Table
        </button>
      </div>

      <div className={styles.editorWrapper}>
        <EditorContent editor={editor} className={styles.editor} />
      </div>

      <div className={styles.info}>
        <h3>About this example</h3>
        <p>
          This example demonstrates table creation and editing using these extensions:
        </p>
        <ul>
          <li><strong>Table</strong> - Main table container with resize support</li>
          <li><strong>TableRow</strong> - Table rows</li>
          <li><strong>TableHeader</strong> - Header cells (&lt;th&gt;)</li>
          <li><strong>TableCell</strong> - Data cells (&lt;td&gt;)</li>
        </ul>
        <p>
          Features include adding/deleting rows and columns, resizable columns,
          and header row support. Click inside a table to enable the toolbar buttons.
        </p>
        <a
          href="https://tiptap.dev/docs/examples/basics/tables"
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
