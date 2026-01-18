/**
 * Slash Commands Extension
 *
 * Provides a command menu when user types "/" in the editor.
 * Built using @tiptap/suggestion extension.
 *
 * M6: Slash commands for quick content insertion (tables, images, etc.)
 * M7: Callout commands (note, tip, warning, danger, info)
 */

import { Extension } from "@tiptap/core";
import type { Editor, Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import tippy, { Instance as TippyInstance } from "tippy.js";
import { SlashCommandsList, type SlashCommandsListRef } from "./slash-commands-menu";

// Plugin key for slash commands
export const slashCommandsPluginKey = new PluginKey("slashCommands");

// Available slash commands
export interface SlashCommand {
  title: string;
  description: string;
  icon: string;
  command: ({ editor, range }: { editor: Editor; range: Range }) => void;
  aliases?: string[];
}

/**
 * Get available slash commands
 *
 * TODO: You can customize this list based on your needs.
 * Add/remove commands, change descriptions, or add new shortcuts.
 */
export function getSlashCommands(editor: Editor): SlashCommand[] {
  return [
    {
      title: "Heading 1",
      description: "Large section heading",
      icon: "H1",
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setNode("heading", { level: 1 })
          .run();
      },
      aliases: ["h1", "title"],
    },
    {
      title: "Heading 2",
      description: "Medium section heading",
      icon: "H2",
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setNode("heading", { level: 2 })
          .run();
      },
      aliases: ["h2", "subtitle"],
    },
    {
      title: "Heading 3",
      description: "Small section heading",
      icon: "H3",
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setNode("heading", { level: 3 })
          .run();
      },
      aliases: ["h3"],
    },
    {
      title: "Table",
      description: "Insert a 3x3 table with header row",
      icon: "⊞",
      command: ({ editor, range }) => {
        // Manually construct a proper 3x3 table with header row
        const tableContent = {
          type: "table",
          content: [
            // Header row
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", content: [{ type: "paragraph" }] },
                { type: "tableHeader", content: [{ type: "paragraph" }] },
                { type: "tableHeader", content: [{ type: "paragraph" }] },
              ],
            },
            // Data row 1
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [{ type: "paragraph" }] },
                { type: "tableCell", content: [{ type: "paragraph" }] },
                { type: "tableCell", content: [{ type: "paragraph" }] },
              ],
            },
            // Data row 2
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [{ type: "paragraph" }] },
                { type: "tableCell", content: [{ type: "paragraph" }] },
                { type: "tableCell", content: [{ type: "paragraph" }] },
              ],
            },
          ],
        };

        // Delete slash command first
        editor.chain().focus().deleteRange(range).run();

        // Insert table
        editor.chain().insertContent(tableContent).run();

        // Try to focus first cell to stabilize rendering
        setTimeout(() => {
          editor.chain().focus().run();
        }, 0);
      },
      aliases: ["grid"],
    },
    {
      title: "Add Row Below",
      description: "Add a row below current cell",
      icon: "↓",
      command: ({ editor, range }) => {
        // Only work if inside a table
        if (!editor.isActive("table")) {
          editor.chain().focus().deleteRange(range).run();
          return;
        }
        editor.chain().focus().deleteRange(range).addRowAfter().run();
      },
      aliases: ["row", "addrow"],
    },
    {
      title: "Add Column Right",
      description: "Add a column to the right",
      icon: "→",
      command: ({ editor, range }) => {
        // Only work if inside a table
        if (!editor.isActive("table")) {
          editor.chain().focus().deleteRange(range).run();
          return;
        }
        editor.chain().focus().deleteRange(range).addColumnAfter().run();
      },
      aliases: ["column", "addcol"],
    },
    {
      title: "Delete Row",
      description: "Delete current row",
      icon: "⌫",
      command: ({ editor, range }) => {
        // Only work if inside a table
        if (!editor.isActive("table")) {
          editor.chain().focus().deleteRange(range).run();
          return;
        }
        editor.chain().focus().deleteRange(range).deleteRow().run();
      },
      aliases: ["removerow", "delrow"],
    },
    {
      title: "Delete Column",
      description: "Delete current column",
      icon: "⌦",
      command: ({ editor, range }) => {
        // Only work if inside a table
        if (!editor.isActive("table")) {
          editor.chain().focus().deleteRange(range).run();
          return;
        }
        editor.chain().focus().deleteRange(range).deleteColumn().run();
      },
      aliases: ["removecol", "delcol"],
    },
    {
      title: "Task List",
      description: "Create a checklist",
      icon: "☑",
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .toggleTaskList()
          .run();
      },
      aliases: ["todo", "checklist", "checkbox"],
    },
    {
      title: "Bullet List",
      description: "Create a bulleted list",
      icon: "•",
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .toggleBulletList()
          .run();
      },
      aliases: ["ul", "unordered"],
    },
    {
      title: "Numbered List",
      description: "Create a numbered list",
      icon: "1.",
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .toggleOrderedList()
          .run();
      },
      aliases: ["ol", "ordered", "number"],
    },
    {
      title: "Quote",
      description: "Insert a blockquote",
      icon: '"',
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .toggleBlockquote()
          .run();
      },
      aliases: ["blockquote"],
    },
    {
      title: "Code Block",
      description: "Insert a code block",
      icon: "</",
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .toggleCodeBlock()
          .run();
      },
      aliases: ["codeblock", "pre"],
    },
    {
      title: "Divider",
      description: "Insert a horizontal rule",
      icon: "―",
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setHorizontalRule()
          .run();
      },
      aliases: ["hr", "horizontal", "line", "separator"],
    },
    // M7: Callout commands
    {
      title: "Callout: Note",
      description: "Blue informational callout",
      icon: "ℹ",
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setCallout({ type: "note" })
          .run();
      },
      aliases: ["note", "info-note"],
    },
    {
      title: "Callout: Tip",
      description: "Green helpful tip callout",
      icon: "💡",
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setCallout({ type: "tip" })
          .run();
      },
      aliases: ["tip", "hint", "suggestion"],
    },
    {
      title: "Callout: Warning",
      description: "Yellow warning callout",
      icon: "⚠",
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setCallout({ type: "warning" })
          .run();
      },
      aliases: ["warning", "caution", "attention"],
    },
    {
      title: "Callout: Danger",
      description: "Red critical danger callout",
      icon: "🔴",
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setCallout({ type: "danger" })
          .run();
      },
      aliases: ["danger", "error", "critical"],
    },
    {
      title: "Callout: Info",
      description: "Purple informational callout",
      icon: "📘",
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setCallout({ type: "info" })
          .run();
      },
      aliases: ["information", "details"],
    },
    // M6: Tag insertion
    {
      title: "Tag",
      description: "Insert a tag (or type # directly)",
      icon: "#",
      command: ({ editor, range }) => {
        // Insert # character to trigger tag autocomplete
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent("#")
          .run();
      },
      aliases: ["hashtag", "label"],
    },
    // Report Issue - Always at the bottom
    {
      title: "Report an Issue",
      description: "Report a bug or request a feature",
      icon: "🐛",
      command: ({ editor, range }) => {
        // Delete the slash command text
        editor.chain().focus().deleteRange(range).run();
        // Open GitHub issues in a new tab
        window.open("https://github.com/CenterValentine/Digital-Garden/issues/new", "_blank", "noopener,noreferrer");
      },
      aliases: ["bug", "issue", "feedback", "report"],
    },
  ];
}

/**
 * Slash Commands Extension
 *
 * Triggers a command menu when "/" is typed.
 */
export const SlashCommands = Extension.create({
  name: "slashCommands",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        pluginKey: slashCommandsPluginKey,
        command: ({ editor, range, props }: any) => {
          props.command({ editor, range });
        },
        items: ({ query, editor }: { query: string; editor: any }) => {
          const commands = getSlashCommands(editor);

          return commands.filter((item) => {
            // Search in title, description, and aliases
            const searchText = `${item.title} ${item.description} ${item.aliases?.join(" ") || ""}`.toLowerCase();
            return searchText.includes(query.toLowerCase());
          });
        },
        render: () => {
          let component: ReactRenderer<SlashCommandsListRef>;
          let popup: TippyInstance[];

          return {
            onStart: (props: any) => {
              component = new ReactRenderer(SlashCommandsList, {
                props,
                editor: props.editor,
              });

              if (!props.clientRect) {
                return;
              }

              popup = tippy("body", {
                getReferenceClientRect: props.clientRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: "manual",
                placement: "bottom-start",
              });
            },

            onUpdate(props: any) {
              component.updateProps(props);

              if (!props.clientRect) {
                return;
              }

              popup[0].setProps({
                getReferenceClientRect: props.clientRect,
              });
            },

            onKeyDown(props: any) {
              if (props.event.key === "Escape") {
                popup?.[0]?.hide();
                return true;
              }

              return component.ref?.onKeyDown(props);
            },

            onExit() {
              popup?.[0]?.destroy();
              component?.destroy();
            },
          };
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
