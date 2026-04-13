import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import CharacterCount from "@tiptap/extension-character-count";

import { AiHighlight } from "@/lib/domain/editor/extensions/ai-highlight";
import { Callout } from "@/lib/domain/editor/extensions/callout";
import { ServerImage } from "@/lib/domain/editor/extensions/image";
import { BlockquoteLineOnly } from "@/lib/domain/editor/extensions/blockquote-line-only";
import { HeadingHardbreakSplit } from "@/lib/domain/editor/extensions/heading-hardbreak-split";
import { ServerSectionHeader } from "@/lib/domain/editor/extensions/blocks/section-header";
import { ServerCardPanel } from "@/lib/domain/editor/extensions/blocks/card-panel";
import { ServerBlockDivider } from "@/lib/domain/editor/extensions/blocks/divider";
import { ServerAccordion } from "@/lib/domain/editor/extensions/blocks/accordion";
import { ServerColumn, ServerColumns } from "@/lib/domain/editor/extensions/blocks/columns";
import { ServerBlockColumn, ServerBlockColumns } from "@/lib/domain/editor/extensions/blocks/block-columns";
import { ServerTabPanel, ServerTabs } from "@/lib/domain/editor/extensions/blocks/tabs";
import { ServerListContainer } from "@/lib/domain/editor/extensions/blocks/list-container";
import { ServerTextInput } from "@/lib/domain/editor/extensions/blocks/text-input";
import { ServerSelectInput } from "@/lib/domain/editor/extensions/blocks/select-input";
import { ServerCheckboxInput } from "@/lib/domain/editor/extensions/blocks/checkbox-input";
import { ServerDateInput } from "@/lib/domain/editor/extensions/blocks/date-input";
import { ServerNumberInput } from "@/lib/domain/editor/extensions/blocks/number-input";
import { ServerRatingInput } from "@/lib/domain/editor/extensions/blocks/rating-input";
import { ServerPromptInput } from "@/lib/domain/editor/extensions/blocks/prompt-input";
import { ServerTimestamp } from "@/lib/domain/editor/extensions/blocks/timestamp";
import { ServerPersonMention } from "@/lib/domain/editor/extensions/person-mention-server";
import { ServerTag } from "@/lib/domain/editor/extensions/tag-server";
import { ServerWikiLink } from "@/lib/domain/editor/extensions/wiki-link-server";
import { getExtensionServerEditorExtensions } from "@/lib/extensions/server-registry";

export function getCollaborationServerExtensions(): Extensions {
  return [
    StarterKit.configure({
      codeBlock: {},
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      bulletList: { keepMarks: true, keepAttributes: false },
      orderedList: { keepMarks: true, keepAttributes: false },
      hardBreak: { keepMarks: false },
      blockquote: {},
      horizontalRule: {},
      link: false,
      undoRedo: false,
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
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
    Callout,
    HeadingHardbreakSplit,
    BlockquoteLineOnly,
    ServerImage,
    AiHighlight,
    ServerSectionHeader,
    ServerCardPanel,
    ServerBlockDivider,
    ServerAccordion,
    ServerColumn,
    ServerColumns,
    ServerBlockColumn,
    ServerBlockColumns,
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
    ServerTimestamp,
    ...getExtensionServerEditorExtensions(),
    ServerTag,
    ServerPersonMention,
    ServerWikiLink,
  ];
}
