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
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import CharacterCount from "@tiptap/extension-character-count";
import { common, createLowlight } from "lowlight";
import { Callout } from "./extensions/callout";
import { HeadingHardbreakSplit } from "./extensions/heading-hardbreak-split";
import { BlockquoteLineOnly } from "./extensions/blockquote-line-only";
import { ServerImage } from "./extensions/image";
import { AiHighlight } from "./extensions/ai-highlight";
import { ServerSectionHeader } from "./extensions/blocks/section-header";
import { ServerCardPanel } from "./extensions/blocks/card-panel";
import { ServerBlockDivider } from "./extensions/blocks/divider";
import { ServerAccordion } from "./extensions/blocks/accordion";
import { ServerColumn, ServerColumns } from "./extensions/blocks/columns";
import { ServerTabPanel, ServerTabs } from "./extensions/blocks/tabs";
import { ServerListContainer } from "./extensions/blocks/list-container";
import { ServerTextInput } from "./extensions/blocks/text-input";
import { ServerSelectInput } from "./extensions/blocks/select-input";
import { ServerCheckboxInput } from "./extensions/blocks/checkbox-input";
import { ServerDateInput } from "./extensions/blocks/date-input";
import { ServerNumberInput } from "./extensions/blocks/number-input";
import { ServerRatingInput } from "./extensions/blocks/rating-input";
import { ServerPromptInput } from "./extensions/blocks/prompt-input";

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

    // Heading + hardBreak split (only text before break becomes heading)
    HeadingHardbreakSplit,

    // Blockquote line-only (only current line becomes quoted)
    BlockquoteLineOnly,

    // Sprint 37: Server-safe image extension (no React NodeView)
    ServerImage,

    // Sprint 40: AI content highlighting
    AiHighlight,

    // Sprint 43-47: Server-safe block extensions
    ServerSectionHeader,
    ServerCardPanel,
    ServerBlockDivider,
    ServerAccordion,
    ServerColumn,
    ServerColumns,
    ServerTabPanel,
    ServerTabs,
    ServerListContainer,
    ServerTextInput,
    ServerSelectInput,
    ServerCheckboxInput,
    ServerDateInput,
    ServerNumberInput,
    ServerRatingInput,
    ServerPromptInput,

    // Note: SlashCommands excluded - it uses React components
  ];
}
