/**
 * TipTap Editor Extensions
 *
 * Central configuration for TipTap editor extensions.
 * M5 implementation (Content Editors & Viewers).
 * M6 implementation (Additional extensions: placeholder, tasks, links, tables, character count).
 * M7 implementation (Callouts with Obsidian-style syntax).
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
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import CharacterCount from "@tiptap/extension-character-count";
import { common, createLowlight } from "lowlight";
import { SlashCommands } from "./commands/slash-commands";
import { TaskListInputRule } from "./extensions/task-list";
import { BulletListBackspace } from "./extensions/bullet-list";
import { Callout } from "./extensions/callout";
import { WikiLink } from "./extensions/wiki-link";
import { createWikiLinkSuggestion } from "./extensions/wiki-link-suggestion";
import { Tag } from "./extensions/tag";

// Create lowlight instance with common languages
const lowlight = createLowlight(common);

/**
 * Options for configuring editor extensions
 */
export interface EditorExtensionsOptions {
  /** Callback when a wiki-link is clicked */
  onWikiLinkClick?: (targetTitle: string) => void;
  /** Fetch notes for wiki-link autocomplete */
  fetchNotesForWikiLink?: (query: string) => Promise<Array<{ id: string; title: string; slug: string }>>;
  /** Callback when a tag is clicked */
  onTagClick?: (tagId: string, tagName: string) => void;
  /** Fetch tags for tag autocomplete */
  fetchTags?: (query: string) => Promise<Array<{ id: string; name: string; slug: string; color: string | null; usageCount: number }>>;
  /** Create a new tag (returns created tag data) */
  createTag?: (tagName: string) => Promise<{ id: string; name: string; slug: string; color: string | null; usageCount: number }>;
  /** Callback when a tag is selected from autocomplete */
  onTagSelect?: (tag: { id: string; name: string; slug: string; color: string | null }) => void;
}

/**
 * Get configured editor extensions for rich text editing
 *
 * @param options - Optional configuration
 * @returns TipTap extensions array
 */
export function getEditorExtensions(options?: EditorExtensionsOptions): Extensions {
  return [
    StarterKit.configure({
      // Heading levels with markdown shortcuts (# ## ###)
      heading: {
        levels: [1, 2, 3, 4, 5, 6],
      },
      // Disable default code block (we use CodeBlockLowlight)
      codeBlock: false,
      // Enable blockquote with > markdown shortcut
      blockquote: {},
      // Enable lists with - and 1. markdown shortcuts
      bulletList: {
        keepMarks: true,
        keepAttributes: false,
      },
      orderedList: {
        keepMarks: true,
        keepAttributes: false,
      },
      listItem: {
        // Allow nested lists
        HTMLAttributes: {},
      },
      // Enable hard break with Shift+Enter
      hardBreak: {
        keepMarks: false,
      },
      // Enable horizontal rule with ---
      horizontalRule: {},
    }),

    // Syntax-highlighted code blocks
    CodeBlockLowlight.configure({
      lowlight,
      defaultLanguage: "plaintext",
    }),

    // M6: Placeholder text for empty nodes
    Placeholder.configure({
      placeholder: ({ node }) => {
        if (node.type.name === "heading") {
          const level = node.attrs.level || 1;
          return `H${level} Header`;
        }
        return "Start writing...";
      },
      emptyEditorClass: "is-editor-empty",
      emptyNodeClass: "is-empty",
      showOnlyWhenEditable: true,
      includeChildren: true, // Ensure placeholder renders even with child nodes
    }),

    // M6: Task lists with checkboxes
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    TaskListInputRule, // Auto-format `- [ ]` to task list

    // M6: Bullet list backspace behavior (Obsidian-style)
    BulletListBackspace, // Backspace in empty bullet → plain text "-"

    // M6: External links
    Link.configure({
      openOnClick: false, // Don't open links while editing
      HTMLAttributes: {
        class: "external-link",
        target: "_blank",
        rel: "noopener noreferrer",
      },
    }),

    // M6: Tables (minimal configuration to prevent auto-row issues)
    Table,
    TableRow,
    TableHeader,
    TableCell,

    // M6: Character count for word/character tracking
    CharacterCount,

    // M6: Slash commands for quick content insertion
    SlashCommands,

    // M7: Callouts (Obsidian-style with markdown input rules)
    Callout,

    // M6: Wiki-style links [[Note Title]]
    WikiLink.configure({
      onClickLink: options?.onWikiLinkClick || ((targetTitle: string) => {
        console.log('[WikiLink] Clicked link to:', targetTitle);
        console.warn('[WikiLink] No onWikiLinkClick handler provided');
      }),
      suggestion: options?.fetchNotesForWikiLink
        ? createWikiLinkSuggestion(options.fetchNotesForWikiLink)
        : undefined,
    }),

    // M6: Tags with autocomplete
    Tag.configure({
      fetchTags: options?.fetchTags || (async () => []),
      createTag: options?.createTag,
      onTagClick: options?.onTagClick,
      onTagSelect: options?.onTagSelect,
    }),
  ];
}

/**
 * Get extensions for server-side use (markdown conversion, API routes, etc.)
 *
 * Excludes client-only extensions like SlashCommands that use React components.
 * Use this in API routes and server-side markdown processing.
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
          return "Heading...";
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

    Table,
    TableRow,
    TableHeader,
    TableCell,

    CharacterCount,

    // M7: Callouts (server-side markdown parsing)
    Callout,

    // Note: SlashCommands excluded - it uses React components
  ];
}

/**
 * Get extensions for read-only display
 *
 * Same as editor extensions but editor will be set to editable: false
 */
export function getViewerExtensions(): Extensions {
  return getEditorExtensions();
}

/**
 * Get extensions for plain text mode (no rich formatting)
 *
 * For future markdown toggle mode implementation
 */
export function getPlainTextExtensions(): Extensions {
  return getEditorExtensions();
}
