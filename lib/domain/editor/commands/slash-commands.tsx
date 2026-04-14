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
import { getExtensionSlashCommands } from "@/lib/extensions/editor-client-registry";

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
      description: "Insert a 3×3 table with header row",
      icon: "⊞",
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run();
      },
      aliases: ["grid"],
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
    // Sprint 37: Image insert
    {
      title: "Image",
      description: "Upload or insert an image",
      icon: "🖼",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        window.dispatchEvent(new CustomEvent("editor-image-upload"));
      },
      aliases: ["img", "picture", "photo"],
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
    // Sprint 44: Layout blocks
    {
      title: "Text Columns",
      description: "Multi-column text layout (2-4 columns)",
      icon: "▦",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertContent({
          type: "columns",
          attrs: { columnCount: 2 },
          content: [
            { type: "column", content: [{ type: "paragraph" }] },
            { type: "column", content: [{ type: "paragraph" }] },
          ],
        }).run();
      },
      aliases: ["col", "columns", "layout", "grid", "split", "side"],
    },
    {
      title: "Block Column",
      description: "Multi-column layout for inserting blocks",
      icon: "⊞",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertContent({
          type: "blockColumns",
          attrs: { columnCount: 2 },
          content: [
            { type: "blockColumn", content: [{ type: "paragraph" }] },
            { type: "blockColumn", content: [{ type: "paragraph" }] },
          ],
        }).run();
      },
      aliases: ["block-columns", "bcol", "block col", "blocks layout"],
    },
    {
      title: "Tabs",
      description: "Tabbed content panels",
      icon: "⊟",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertContent({
          type: "tabs",
          attrs: { tabLabels: ["Tab 1", "Tab 2"] },
          content: [
            { type: "tabPanel", attrs: { label: "Tab 1" }, content: [{ type: "paragraph" }] },
            { type: "tabPanel", attrs: { label: "Tab 2" }, content: [{ type: "paragraph" }] },
          ],
        }).run();
      },
      aliases: ["tab", "tabs", "panel", "panels"],
    },
    {
      title: "Accordion",
      description: "Collapsible content section",
      icon: "▼",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertContent({
          type: "accordion",
          attrs: {
            headerText: "",
            headerLevel: "2",
            openBehavior: "lastInteraction",
            openState: true,
            showContainer: false,
            showDivider: false,
          },
          content: [{ type: "paragraph" }],
        }).run();
      },
      aliases: ["accordion", "collapse", "expand", "toggle"],
    },
    {
      title: "Card",
      description: "Styled content card panel",
      icon: "▭",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertContent({
          type: "cardPanel",
          attrs: {},
          content: [{ type: "paragraph" }],
        }).run();
      },
      aliases: ["card", "panel", "box", "container"],
    },
    {
      title: "Section Header",
      description: "Section heading with divider",
      icon: "§",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertContent({
          type: "sectionHeader",
          attrs: { level: 1 },
        }).run();
      },
      aliases: ["section", "header", "sectionheader", "sh"],
    },
    {
      title: "Block Divider",
      description: "Decorative block separator",
      icon: "—",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertContent({
          type: "blockDivider",
          attrs: {},
        }).run();
      },
      aliases: ["divider", "blockdivider", "separator", "line"],
    },
    // Sprint 46: Form/input blocks
    {
      title: "Text Input",
      description: "Single-line or multi-line text field",
      icon: "Aa",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertContent({
          type: "textInput",
          attrs: { label: "Label", placeholder: "Enter text..." },
        }).run();
      },
      aliases: ["input", "text", "field", "textinput"],
    },
    {
      title: "Select / Dropdown",
      description: "Dropdown selection field",
      icon: "▾",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertContent({
          type: "selectInput",
          attrs: { label: "Choose", options: ["Option 1", "Option 2"] },
        }).run();
      },
      aliases: ["select", "dropdown", "choice", "options"],
    },
    {
      title: "Checkbox",
      description: "Checkbox or checkbox group",
      icon: "☑",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertContent({
          type: "checkboxInput",
          attrs: { label: "Check this" },
        }).run();
      },
      aliases: ["checkbox", "check", "boolean"],
    },
    {
      title: "Date Input",
      description: "Date or date-time field",
      icon: "📅",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertContent({
          type: "dateInput",
          attrs: { label: "Date" },
        }).run();
      },
      aliases: ["date", "datepicker", "calendar", "time"],
    },
    {
      title: "Number Input",
      description: "Numeric input field",
      icon: "#",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertContent({
          type: "numberInput",
          attrs: { label: "Value" },
        }).run();
      },
      aliases: ["number", "numeric", "quantity", "count"],
    },
    {
      title: "Rating",
      description: "Star rating or score field",
      icon: "★",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertContent({
          type: "ratingInput",
          attrs: { label: "Rating", maxRating: 5 },
        }).run();
      },
      aliases: ["rating", "stars", "score", "review"],
    },
    {
      title: "Prompt / AI Prompt",
      description: "AI prompt or instruction block",
      icon: "✦",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertContent({
          type: "promptInput",
          attrs: {},
        }).run();
      },
      aliases: ["prompt", "ai", "instruction", "template"],
    },
    // Epoch 11 Sprint 45: Template + Snippet insertion
    {
      title: "Template",
      description: "Insert a saved content template",
      icon: "📄",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        window.dispatchEvent(new CustomEvent("open-template-picker"));
      },
      aliases: ["tpl", "templates"],
    },
    {
      title: "Snippet",
      description: "Insert a reusable text snippet",
      icon: "✂",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        window.dispatchEvent(new CustomEvent("open-snippet-picker"));
      },
      aliases: ["snip", "snippets", "reusable"],
    },
    // Sprint 65: Timestamp block
    {
      title: "Timestamp",
      description: "Insert today's date as a frozen timestamp",
      icon: "🕐",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertContent({
          type: "timestamp",
          attrs: { isoDate: new Date().toISOString().slice(0, 10) },
        }).run();
      },
      aliases: ["date", "today", "now", "stamp", "datestamp"],
    },
    ...getExtensionSlashCommands(),
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
        // Only trigger on first character of an empty line
        allow: ({ state, range }: any) => {
          const $from = state.doc.resolve(range.from);
          // Trigger must be at the beginning of the parent node
          if ($from.parentOffset !== 0) {
            return false;
          }
          // Parent must only contain the suggestion text (was empty before /)
          const suggestionText = state.doc.textBetween(range.from, range.to, "");
          if ($from.parent.textContent !== suggestionText) {
            return false;
          }
          return true;
        },
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
