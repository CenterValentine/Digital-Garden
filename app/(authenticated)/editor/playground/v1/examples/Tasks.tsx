"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import styles from "./Tasks.module.css";

export default function Tasks() {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        bulletList: {
          keepMarks: true,
        },
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
    ],
    content: `
      <h2>Task Lists Example</h2>
      <p>Click the checkboxes below to mark tasks as complete:</p>
      <ul data-type="taskList">
        <li data-type="taskItem" data-checked="true">Create TipTap playground</li>
        <li data-type="taskItem" data-checked="true">Implement all 9 examples</li>
        <li data-type="taskItem" data-checked="false">Test isolation between examples</li>
        <li data-type="taskItem" data-checked="false">Deploy to production</li>
      </ul>
      <p>Try creating a new task list by typing <code>- [ ]</code> followed by space:</p>
      <ul data-type="taskList">
        <li data-type="taskItem" data-checked="false">Type your own task here</li>
      </ul>
      <p>You can also nest tasks:</p>
      <ul data-type="taskList">
        <li data-type="taskItem" data-checked="false">
          <p>Main task</p>
          <ul data-type="taskList">
            <li data-type="taskItem" data-checked="false">Subtask 1</li>
            <li data-type="taskItem" data-checked="false">Subtask 2</li>
          </ul>
        </li>
      </ul>
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
        <h1 className={styles.title}>Tasks</h1>
        <p className={styles.subtitle}>
          Interactive task lists with checkboxes
        </p>
      </div>

      <div className={styles.editorWrapper}>
        <EditorContent editor={editor} className={styles.editor} />
      </div>

      <div className={styles.info}>
        <h3>About this example</h3>
        <p>
          This example demonstrates task lists using the <strong>TaskList</strong> and{" "}
          <strong>TaskItem</strong> extensions. Features include:
        </p>
        <ul>
          <li>Interactive checkboxes that toggle task completion</li>
          <li>Markdown shortcut: Type <code>- [ ]</code> + space to create a task</li>
          <li>Nested task lists for subtasks</li>
          <li>Visual strike-through for completed tasks</li>
          <li>Accessible keyboard navigation</li>
        </ul>
        <p>
          Tasks are stored as <code>data-type="taskItem"</code> with{" "}
          <code>data-checked</code> attributes in the HTML, making them perfect
          for todo lists, project management, or checklists.
        </p>
        <a
          href="https://tiptap.dev/docs/examples/basics/tasks"
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
