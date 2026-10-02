import type { BuiltInExtension } from "@/lib/extensions/types";
import { readerExtensionRuntime } from "./client";
import { readerExtensionManifest } from "./manifest";

export const readerBuiltInExtension: BuiltInExtension = {
  manifest: readerExtensionManifest,
  runtime: readerExtensionRuntime,
};
