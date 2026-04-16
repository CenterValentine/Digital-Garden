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
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import type { Doc } from "yjs";
import { common, createLowlight } from "lowlight";
import { SlashCommands } from "./commands/slash-commands";
import { TaskListInputRule } from "./extensions/task-list";
import { BulletListBackspace } from "./extensions/bullet-list";
import { BlockBoundaryInsert } from "./extensions/block-boundary-insert";
import { BlockSpacerGuard } from "./extensions/block-spacer-guard";
import { HeadingBackspace } from "./extensions/heading-backspace";
import { HeadingHardbreakSplit } from "./extensions/heading-hardbreak-split";
import { BlockquoteLineOnly } from "./extensions/blockquote-line-only";
import { Callout } from "./extensions/callout";
import { WikiLink } from "./extensions/wiki-link";
import { createWikiLinkSuggestion } from "./extensions/wiki-link-suggestion";
import { Tag } from "./extensions/tag";
import { PersonMention } from "./extensions/person-mention";
import { EditorImage } from "./extensions/image";
import { AiHighlight } from "./extensions/ai-highlight";
import { BlockFocusExtension } from "./extensions/block-focus-ext";

// Sprint 43-47: Block extensions (import triggers registerBlock() side effect)
import { SectionHeader } from "./extensions/blocks/section-header";
import { CardPanel } from "./extensions/blocks/card-panel";
import { BlockDivider } from "./extensions/blocks/divider";
import { Accordion } from "./extensions/blocks/accordion";
import { Column, Columns } from "./extensions/blocks/columns";
import { BlockColumn, BlockColumns } from "./extensions/blocks/block-columns";
import { TabPanel, Tabs } from "./extensions/blocks/tabs";
import { ListContainer } from "./extensions/blocks/list-container";
import { TextInput } from "./extensions/blocks/text-input";
import { SelectInput } from "./extensions/blocks/select-input";
import { CheckboxInput } from "./extensions/blocks/checkbox-input";
import { DateInput } from "./extensions/blocks/date-input";
import { NumberInput } from "./extensions/blocks/number-input";
import { RatingInput } from "./extensions/blocks/rating-input";
import { PromptInput } from "./extensions/blocks/prompt-input";
import { Timestamp } from "./extensions/blocks/timestamp";
import { InlineTimestamp } from "./extensions/inline-timestamp";
import { ExcalidrawBlock } from "./extensions/blocks/excalidraw-block";
import { MermaidBlock } from "./extensions/blocks/mermaid-block";
import { getExtensionClientEditorExtensions } from "@/lib/extensions/editor-client-registry";

// Create lowlight instance with common languages
const lowlight = createLowlight(common);

/**
 * Options for configuring editor extensions
 */
export interface EditorExtensionsOptions {
  collaboration?: {
    document: Doc;
    provider?: HocuspocusProvider | null;
    field?: string;
    user: {
      name: string;
      color: string;
    };
  };
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
  /** Fetch people for @ mentions */
  fetchPeopleMentions?: (query: string) => Promise<Array<{ id: string; personId: string; label: string; slug: string; email: string | null; phone: string | null; avatarUrl: string | null }>>;
  /** Callback when a person mention is clicked */
  onPersonMentionClick?: (personId: string) => void;
}

/**
 * Get configured editor extensions for rich text editing
 *
 * @param options - Optional configuration
 * @returns TipTap extensions array
 */
export function getEditorExtensions(options?: EditorExtensionsOptions): Extensions {
  const collaboration = options?.collaboration;

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
      link: false,
      undoRedo: collaboration ? false : {},
    }),

    ...(collaboration
      ? [
          Collaboration.configure({
            document: collaboration.document,
            field: collaboration.field ?? "default",
          }),
          ...(collaboration.provider
            ? [
                CollaborationCaret.configure({
                  provider: collaboration.provider,
                  user: collaboration.user,
                  render: (user, clientId?: number) => {
                    const cursor = document.createElement("span");
                    cursor.classList.add("dg-collaboration-caret");
                    cursor.style.setProperty("--collaborator-color", user.color);
                    if (clientId !== undefined) {
                      cursor.dataset.collaborationClientId = String(clientId);
                    }
                    cursor.title = user.name;
                    return cursor;
                  },
                  selectionRender: (user) => ({
                    nodeName: "span",
                    class: "dg-collaboration-selection",
                    style: `background-color: ${user.color}24`,
                  }),
                }),
              ]
            : []),
        ]
      : []),

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
    BlockBoundaryInsert, // Enter/Shift+Enter from selected block creates editable space after/before it
    BlockSpacerGuard, // Empty spacer paragraphs next to custom blocks delete themselves, not the block
    HeadingBackspace, // Backspace in empty heading → paragraph with # chain

    // M6: External links
    // Note: Link mark is inclusive: false by default in TipTap —
    // cursor adjacent to a link does not inherit link formatting.
    Link.configure({
      openOnClick: false, // Don't open links while editing
      HTMLAttributes: {
        class: "external-link",
        target: "_blank",
        rel: "noopener noreferrer",
      },
    }),

    // Tables — rebuilt from TipTap docs (Sprint 36)
    Table.configure({
      resizable: true,
    }),
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
      onClickLink: options?.onWikiLinkClick || (() => {}),
      suggestion: options?.fetchNotesForWikiLink
        ? createWikiLinkSuggestion(options.fetchNotesForWikiLink)
        : undefined,
    }),

    // Heading + hardBreak split (only text before break becomes heading)
    HeadingHardbreakSplit,

    // Blockquote line-only (only current line becomes quoted, not content after hardBreak)
    BlockquoteLineOnly,

    // Sprint 37: Images in TipTap
    EditorImage.configure({
      inline: false,
      allowBase64: true, // Allow blob URLs during upload
    }),

    // Sprint 40: AI content highlighting
    AiHighlight,

    // Sprint 43-47: Block extensions
    BlockFocusExtension,
    SectionHeader,
    CardPanel,
    BlockDivider,
    Accordion,
    Column,
    Columns,
    BlockColumn,
    BlockColumns,
    TabPanel,
    Tabs,
    ListContainer,
    TextInput,
    SelectInput,
    CheckboxInput,
    DateInput,
    NumberInput,
    RatingInput,
    PromptInput,
    Timestamp,
    InlineTimestamp,
    ExcalidrawBlock,
    MermaidBlock,
    ...getExtensionClientEditorExtensions(),

    // M6: Tags with autocomplete
    Tag.configure({
      fetchTags: options?.fetchTags || (async () => []),
      createTag: options?.createTag,
      onTagClick: options?.onTagClick,
      onTagSelect: options?.onTagSelect,
    }),

    PersonMention.configure({
      fetchPeople: options?.fetchPeopleMentions || (async () => []),
      onPersonClick: options?.onPersonMentionClick,
    }),
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
