import { calendarExtensionManifest } from "@/extensions/calendar/manifest";
import { calendarExtensionServerRuntime } from "@/extensions/calendar/server-runtime";
import { peopleExtensionManifest } from "@/extensions/people/manifest";
import { workplacesExtensionManifest } from "@/extensions/workplaces/manifest";
import type { BuiltInExtension } from "./types";

/**
 * Server-only extension list.
 *
 * Do not import extension client modules here. Collaboration, API routes, and
 * markdown processing use this path where React components and browser-only
 * editor code must not be loaded just to discover server-safe editor schema.
 */
export const SERVER_BUILT_IN_EXTENSIONS: BuiltInExtension[] = [
  {
    manifest: peopleExtensionManifest,
  },
  {
    manifest: calendarExtensionManifest,
    serverRuntime: calendarExtensionServerRuntime,
  },
  {
    manifest: workplacesExtensionManifest,
  },
];
