/**
 * TipTap Server Extensions
 *
 * Server-safe extensions (no React components).
 * Use this in API routes and markdown processing.
 */

import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import CharacterCount from "@tiptap/extension-character-count";
import { common, createLowlight } from "lowlight";

// Create lowlight instance with common languages
const lowlight = createLowlight(common);

/**
 * Get extensions for server-side use (markdown conversion, API routes, etc.)
 *
 * Excludes client-only extensions like SlashCommands that use React components.
 */
export function getServerExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3, 4, 5, 6],
      },
      codeBlock: false,
      blockquote: {},
      bulletList: {
        keepMarks: true,
        keepAttributes: false,
      },
      orderedList: {
        keepMarks: true,
        keepAttributes: false,
      },
      listItem: {
        HTMLAttributes: {},
      },
      hardBreak: {
        keepMarks: false,
      },
      horizontalRule: {},
    }),

    CodeBlockLowlight.configure({
      lowlight,
      defaultLanguage: "plaintext",
    }),

    Placeholder.configure({
      placeholder: ({ node }) => {
        if (node.type.name === "heading") {
          const level = node.attrs.level || 1;
          return `H${level} Header`;
        }
        return "Start writing...";
      },
    }),

    TaskList,
    TaskItem.configure({
      nested: true,
    }),

    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        class: "external-link",
        target: "_blank",
        rel: "noopener noreferrer",
      },
    }),

    Table.configure({
      resizable: true,
      allowTableNodeSelection: true,
    }),
    TableRow.extend({
      content: "tableCell*",
    }),
    TableCell,
    // Note: TableHeader excluded to prevent header rows

    CharacterCount,

    // Note: SlashCommands excluded - it uses React components
  ];
}
