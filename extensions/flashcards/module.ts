import type { BuiltInExtension } from "@/lib/extensions/types";
import { flashcardsExtensionRuntime } from "./client";
import { flashcardsExtensionManifest } from "./manifest";

export const flashcardsBuiltInExtension: BuiltInExtension = {
  manifest: flashcardsExtensionManifest,
  runtime: flashcardsExtensionRuntime,
};
