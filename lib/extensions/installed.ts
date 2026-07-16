/**
 * Runtime registry of built-in extensions (client + server contributions).
 *
 * KEEP IN SYNC with ALL_EXTENSION_MANIFESTS in manifests.ts. Adding an
 * extension here alone gives it a working runtime but a 404 settings page —
 * the /settings/extensions/[id] route validates ids against that server-safe
 * manifest list, not this one (this module bundles client runtimes and can't
 * be imported from Server Components).
 */

import { browserBookmarksBuiltInExtension } from "@/extensions/browser-bookmarks/module";
import { calendarBuiltInExtension } from "@/extensions/calendar/module";
import { dailyNotesBuiltInExtension } from "@/extensions/daily-notes/module";
import { flashcardsBuiltInExtension } from "@/extensions/flashcards/module";
import { peopleBuiltInExtension } from "@/extensions/people/module";
import { speedReaderBuiltInExtension } from "@/extensions/speed-reader/module";
import { workplacesBuiltInExtension } from "@/extensions/workplaces/module";
import { publishingBuiltInExtension } from "@/extensions/publishing/module";
import { workflowsBuiltInExtension } from "@/extensions/workflows/module";
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
  workflowsBuiltInExtension,
];
