import { dailyNotesExtensionRuntime } from "./client";
import { dailyNotesExtensionManifest } from "./manifest";
import type { BuiltInExtension } from "@/lib/extensions/types";

export const dailyNotesBuiltInExtension: BuiltInExtension = {
  manifest: dailyNotesExtensionManifest,
  runtime: dailyNotesExtensionRuntime,
};
