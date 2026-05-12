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
import { PluginKey, type EditorState } from "@tiptap/pm/state";
import tippy, { Instance as TippyInstance } from "tippy.js";
import { SlashCommandsList, type SlashCommandsListRef } from "./slash-commands-menu";
import { getExtensionSlashCommands } from "@/lib/extensions/editor-client-registry";
import { useTimestampFormatStore } from "@/state/timestamp-format-store";
import { getDefaultPeriodicSummaryDate } from "@/lib/domain/periodic-summary";
import { createDefaultStopwatchAttrs } from "@/lib/domain/stopwatch";
import { createDefaultHabitTrackerAttrs } from "../extensions/blocks/habit-tracker";

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

interface SlashAllowProps {
  state: EditorState;
  range: Range;
}

interface SlashSuggestionCommandProps {
  editor: Editor;
  range: Range;
  props: SlashCommand;
}

interface SlashSuggestionItemsProps {
  query: string;
  editor: Editor;
}

interface SlashSuggestionRenderProps {
  editor: Editor;
  clientRect?: (() => DOMRect | null) | null;
  event: KeyboardEvent;
}

/**
 * Get available slash commands
 *
 * TODO: You can customize this list based on your needs.
 * Add/remove commands, change descriptions, or add new shortcuts.
 */
export function getSlashCommands(): SlashCommand[] {
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
      title: "Pull Quote",
      description: "Styled quote block — 7 visual variants (bordered, card, featured…)",
      icon: "❝",
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({ type: "pullQuote", attrs: { variant: "bordered" } })
          .run();
      },
      aliases: ["pullquote", "highlight", "featured", "citation", "pull"],
    },
    {
      title: "Table of Contents",
      description: "Auto-generated outline of document headings",
      icon: "≡",
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({ type: "tableOfContents", attrs: {} })
          .run();
      },
      aliases: ["toc", "contents", "outline", "navigation", "index", "headings"],
    },
    {
      title: "Gallery",
      description: "Image gallery — grid, masonry, or carousel",
      icon: "⊞",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range)
          .insertContent({ type: "gallery", attrs: {} }).run();
      },
      aliases: ["gallery", "images", "photos", "grid", "carousel"],
    },
    {
      title: "Hero Image",
      description: "Full-width banner with headline and optional CTA",
      icon: "▬",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range)
          .insertContent({ type: "heroImage", attrs: {} }).run();
      },
      aliases: ["hero", "banner", "header", "cover", "fullwidth"],
    },
    {
      title: "Post Card",
      description: "Blog post preview card with cover, title, and tags",
      icon: "▭",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range)
          .insertContent({ type: "postCard", attrs: {} }).run();
      },
      aliases: ["postcard", "post", "blog", "article", "preview"],
    },
    {
      title: "Project Card",
      description: "Project showcase card with tech stack and links",
      icon: "◱",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range)
          .insertContent({ type: "projectCard", attrs: {} }).run();
      },
      aliases: ["projectcard", "project", "portfolio", "showcase"],
    },
    {
      title: "Recent Posts",
      description: "Dynamic list of recent posts from a publishing path",
      icon: "≋",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range)
          .insertContent({ type: "recentPosts", attrs: {} }).run();
      },
      aliases: ["recentposts", "recent", "feed", "posts", "dynamic"],
    },
    {
      title: "Timeline",
      description: "Ordered chronology of events — 10 visual variants",
      icon: "⊢",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range)
          .insertContent({ type: "timeline", attrs: {} }).run();
      },
      aliases: ["timeline", "history", "events", "chronology", "milestones"],
    },
    {
      title: "Stat Block",
      description: "Single large metric display with optional animation",
      icon: "#",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range)
          .insertContent({ type: "statBlock", attrs: {} }).run();
      },
      aliases: ["stat", "metric", "number", "kpi", "counter"],
    },
    {
      title: "Metrics Strip",
      description: "Horizontal row of multiple metrics and KPIs",
      icon: "≣",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range)
          .insertContent({ type: "metricsStrip", attrs: {} }).run();
      },
      aliases: ["metrics", "kpi", "stats", "strip", "numbers"],
    },
    {
      title: "Process Steps",
      description: "Step-by-step process or how-to list — 6 variants",
      icon: "①",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range)
          .insertContent({ type: "processSteps", attrs: {} }).run();
      },
      aliases: ["steps", "process", "how-to", "guide", "workflow", "numbered"],
    },
    // ── W5 ──────────────────────────────────────────────────────────────────
    {
      title: "Testimonial",
      description: "Quote from a person with avatar, name, title, and star rating",
      icon: "❝",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range)
          .insertContent({ type: "testimonialCard", attrs: {} }).run();
      },
      aliases: ["testimonial", "quote", "review", "feedback", "star"],
    },
    {
      title: "CTA Banner",
      description: "Call-to-action section with headline and buttons",
      icon: "⚡",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range)
          .insertContent({ type: "ctaBanner", attrs: {} }).run();
      },
      aliases: ["cta", "call to action", "banner", "button", "conversion"],
    },
    // ── W6 ──────────────────────────────────────────────────────────────────
    {
      title: "Video",
      description: "Embed a YouTube, Vimeo, or direct video URL",
      icon: "▶",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range)
          .insertContent({ type: "videoEmbed", attrs: {} }).run();
      },
      aliases: ["video", "youtube", "vimeo", "embed", "player", "media"],
    },
    // ── W7 ──────────────────────────────────────────────────────────────────
    {
      title: "FAQ",
      description: "Collapsible question/answer accordion",
      icon: "?",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range)
          .insertContent({ type: "faqAccordion", attrs: {} }).run();
      },
      aliases: ["faq", "questions", "accordion", "help", "support"],
    },
    {
      title: "Feature List",
      description: "Grid of features/benefits with icon and description",
      icon: "⊞",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range)
          .insertContent({ type: "featureList", attrs: {} }).run();
      },
      aliases: ["features", "benefits", "grid", "icons", "services"],
    },
    // ── W8 ──────────────────────────────────────────────────────────────────
    {
      title: "Person Card",
      description: "Profile card with photo, name, bio, and social links",
      icon: "👤",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range)
          .insertContent({ type: "personCard", attrs: {} }).run();
      },
      aliases: ["person", "profile", "team", "author", "bio", "about"],
    },
    {
      title: "Newsletter Signup",
      description: "Email capture form with configurable endpoint",
      icon: "✉",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range)
          .insertContent({ type: "newsletterSignup", attrs: {} }).run();
      },
      aliases: ["newsletter", "email", "subscribe", "signup", "form"],
    },
    // ── W9 ──────────────────────────────────────────────────────────────────
    {
      title: "Logo Strip",
      description: "Horizontal row of partner or client logos",
      icon: "◫",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range)
          .insertContent({ type: "logoStrip", attrs: {} }).run();
      },
      aliases: ["logos", "brand", "partner", "client", "sponsor"],
    },
    {
      title: "Social Links",
      description: "Row of social media profile links",
      icon: "⇢",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range)
          .insertContent({ type: "socialLinks", attrs: {} }).run();
      },
      aliases: ["social", "links", "twitter", "github", "linkedin", "follow"],
    },
    {
      title: "Pricing Card",
      description: "Single pricing tier with features and CTA button",
      icon: "$",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range)
          .insertContent({ type: "pricingCard", attrs: {} }).run();
      },
      aliases: ["pricing", "plan", "tier", "price", "subscription"],
    },
    // ── W10 ─────────────────────────────────────────────────────────────────
    {
      title: "Spacer",
      description: "Invisible vertical space for layout control",
      icon: "↕",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range)
          .insertContent({ type: "spacer", attrs: {} }).run();
      },
      aliases: ["spacer", "space", "gap", "padding", "blank"],
    },
    {
      title: "Skill Badges",
      description: "Grid of technology/skill pill badges",
      icon: "⬡",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range)
          .insertContent({ type: "skillBadges", attrs: {} }).run();
      },
      aliases: ["skills", "tech", "stack", "badges", "technologies", "expertise"],
    },
    {
      title: "Bookmark Card",
      description: "Styled link card with title, description, and preview image",
      icon: "⊡",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range)
          .insertContent({ type: "bookmarkCard", attrs: {} }).run();
      },
      aliases: ["bookmark", "link", "card", "preview", "resource", "reading"],
    },
    {
      title: "Tag Cloud",
      description: "Browsable topic tags with optional links and sizing",
      icon: "#",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range)
          .insertContent({ type: "tagCloud", attrs: {} }).run();
      },
      aliases: ["tags", "cloud", "topics", "categories", "browse"],
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
    {
      title: "Daily Summary",
      description: "Files created or edited during one workday",
      icon: "☑",
      command: ({ editor, range }) => {
        const blockId = crypto.randomUUID();
        editor.chain().focus().deleteRange(range).insertContent({
          type: "dailySummary",
          attrs: {
            blockId,
            blockType: "dailySummary",
            summaryDate: getDefaultPeriodicSummaryDate("daily"),
            workdayCutoffHour: 0,
            autoBorrowDurationMinutes: 60,
            pathOrder: "Root > File",
            showBackground: true,
            showBorder: true,
          },
        }).run();
      },
      aliases: ["daily summary", "day summary", "activity", "worklog"],
    },
    {
      title: "Weekly Summary",
      description: "Files created or edited during one ISO week",
      icon: "☑",
      command: ({ editor, range }) => {
        const blockId = crypto.randomUUID();
        editor.chain().focus().deleteRange(range).insertContent({
          type: "weeklySummary",
          attrs: {
            blockId,
            blockType: "weeklySummary",
            weekStartDate: getDefaultPeriodicSummaryDate("weekly"),
            workdayCutoffHour: 0,
            autoBorrowDurationMinutes: 60,
            pathOrder: "Root > File",
            showBackground: true,
            showBorder: true,
          },
        }).run();
      },
      aliases: ["weekly summary", "week summary", "activity", "worklog"],
    },
    {
      title: "Habit Tracker",
      description: "Track habits in monthly, weekly, or streak layouts",
      icon: "✓",
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({
            type: "habitTracker",
            attrs: createDefaultHabitTrackerAttrs(),
          })
          .run();
      },
      aliases: ["habit", "tracker", "streak", "checkins", "routine"],
    },
    {
      title: "Stopwatch",
      description: "Persisted stopwatch with laps and style variants",
      icon: "⏱",
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({
            type: "stopwatch",
            attrs: createDefaultStopwatchAttrs(),
          })
          .run();
      },
      aliases: ["stopwatch", "timer", "lap", "elapsed", "clock"],
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
    // upnext: Inline timestamp — flows inside text, click to set format/mode
    {
      title: "Timestamp",
      description: "Insert today's date inline — click to set format & mode",
      icon: "🕐",
      command: ({ editor, range }) => {
        const { defaultFormat, defaultMode } = useTimestampFormatStore.getState();
        const d = new Date();
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        editor.chain().focus().deleteRange(range).insertContent({
          type: "inlineTimestamp",
          attrs: { isoDate: iso, format: defaultFormat, mode: defaultMode },
        }).run();
      },
      aliases: ["date", "today", "now", "stamp", "datestamp"],
    },
    {
      title: "Drawing",
      description: "Embed a hand-drawn whiteboard canvas",
      icon: "✏️",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertContent({
          type: "excalidrawBlock",
          attrs: { title: "Untitled Drawing", expanded: false },
        }).run();
      },
      aliases: ["excalidraw", "drawing", "canvas", "whiteboard", "sketch", "freehand"],
    },
    {
      title: "Mermaid Diagram",
      description: "Embed a text-based flowchart or diagram",
      icon: "📊",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertContent({
          type: "mermaidBlock",
          attrs: { title: "Untitled Diagram", expanded: false },
        }).run();
      },
      aliases: ["mermaid", "diagram", "flowchart", "graph", "chart", "sequence"],
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
        allow: ({ state, range }: SlashAllowProps) => {
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
        command: ({ editor, range, props }: SlashSuggestionCommandProps) => {
          props.command({ editor, range });
        },
        items: ({ query }: SlashSuggestionItemsProps) => {
          const commands = getSlashCommands();

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
            onStart: (props: SlashSuggestionRenderProps) => {
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

            onUpdate(props: SlashSuggestionRenderProps) {
              component.updateProps(props);

              if (!props.clientRect) {
                return;
              }

              popup[0].setProps({
                getReferenceClientRect: props.clientRect,
              });
            },

            onKeyDown(props: SlashSuggestionRenderProps) {
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
