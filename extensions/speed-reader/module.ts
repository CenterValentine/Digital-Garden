import type { BuiltInExtension } from "@/lib/extensions/types";
import { speedReaderExtensionRuntime } from "./client";
import { speedReaderExtensionManifest } from "./manifest";

export const speedReaderBuiltInExtension: BuiltInExtension = {
  manifest: speedReaderExtensionManifest,
  runtime: speedReaderExtensionRuntime,
};
