/**
 * Server-safe aggregated extension manifests.
 *
 * Manifests are plain data modules (no client runtime imports), so this
 * list is importable from server components — unlike installed.ts, whose
 * extension modules bundle client runtimes. Used by the
 * /settings/extensions/[id] route to validate ids at the server boundary.
 *
 * KEEP IN SYNC with BUILT_IN_EXTENSIONS in installed.ts. There is no CI check
 * asserting the two lists match. An extension registered only in installed.ts
 * has a working runtime (panel, viewer, sidebar entry) but a 404 settings page,
 * because EXTENSION_IDS (below) gates the /settings/extensions/[id] route.
 */

import { browserBookmarksExtensionManifest } from "@/extensions/browser-bookmarks/manifest";
import { calendarExtensionManifest } from "@/extensions/calendar/manifest";
import { dailyNotesExtensionManifest } from "@/extensions/daily-notes/manifest";
import { flashcardsExtensionManifest } from "@/extensions/flashcards/manifest";
import { peopleExtensionManifest } from "@/extensions/people/manifest";
import { publishingExtensionManifest } from "@/extensions/publishing/manifest";
import { speedReaderExtensionManifest } from "@/extensions/speed-reader/manifest";
import { workflowsExtensionManifest } from "@/extensions/workflows/manifest";
import { workplacesExtensionManifest } from "@/extensions/workplaces/manifest";
import type { ExtensionManifest } from "./types";

export const ALL_EXTENSION_MANIFESTS: ExtensionManifest[] = [
  browserBookmarksExtensionManifest,
  dailyNotesExtensionManifest,
  peopleExtensionManifest,
  flashcardsExtensionManifest,
  calendarExtensionManifest,
  workplacesExtensionManifest,
  workflowsExtensionManifest,
  publishingExtensionManifest,
  speedReaderExtensionManifest,
];

export const EXTENSION_IDS: string[] = ALL_EXTENSION_MANIFESTS.map(
  (manifest) => manifest.id
);
