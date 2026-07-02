import { browserBookmarksBuiltInExtension } from "@/extensions/browser-bookmarks/module";
import { calendarBuiltInExtension } from "@/extensions/calendar/module";
import { dailyNotesBuiltInExtension } from "@/extensions/daily-notes/module";
import { flashcardsBuiltInExtension } from "@/extensions/flashcards/module";
import { peopleBuiltInExtension } from "@/extensions/people/module";
import { speedReaderBuiltInExtension } from "@/extensions/speed-reader/module";
import { workplacesBuiltInExtension } from "@/extensions/workplaces/module";
import { publishingBuiltInExtension } from "@/extensions/publishing/module";
import type { BuiltInExtension } from "./types";

export const BUILT_IN_EXTENSIONS: BuiltInExtension[] = [
  browserBookmarksBuiltInExtension,
  dailyNotesBuiltInExtension,
  peopleBuiltInExtension,
  flashcardsBuiltInExtension,
  calendarBuiltInExtension,
  workplacesBuiltInExtension,
  publishingBuiltInExtension,
  speedReaderBuiltInExtension,
];
