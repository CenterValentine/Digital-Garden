import type { SlashCommand } from "@/lib/domain/editor/commands/slash-commands";

function getDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function getCalendarSlashCommands(): SlashCommand[] {
  return [
    {
      title: "Create Event",
      description: "Draft a calendar event from this note or selected text",
      icon: "📅",
      command: ({ editor, range }) => {
        const selection = editor.state.selection;
        const selectedText = editor.state.doc
          .textBetween(selection.from, selection.to, " ")
          .trim();
        editor.chain().focus().deleteRange(range).run();
        window.dispatchEvent(
          new CustomEvent("dg:create-calendar-event", {
            detail: { text: selectedText || "" },
          })
        );
      },
      aliases: ["calendar", "meeting", "schedule", "event"],
    },
    {
      title: "Calendar View",
      description: "Insert a mini calendar block with month, week, day, and agenda views",
      icon: "🗓️",
      command: ({ editor, range }) => {
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .insertContent({
            type: "calendarViewBlock",
            attrs: {
              blockId: crypto.randomUUID(),
              blockType: "calendarViewBlock",
              title: "Calendar",
              view: "month",
              date: getDateKey(),
              agendaRange: "day",
              sourceIds: [],
              heightPx: 420,
              showWeekends: true,
              showEvents: true,
              showBorder: false,
            },
          })
          .run();
      },
      aliases: ["calendar-block", "calendar-view", "calendar-month", "calendar-week", "agenda"],
    },
  ];
}
