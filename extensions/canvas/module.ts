import type { BuiltInExtension } from "@/lib/extensions/types";
import { canvasExtensionRuntime } from "./client";
import { canvasExtensionManifest } from "./manifest";

export const canvasBuiltInExtension: BuiltInExtension = {
  manifest: canvasExtensionManifest,
  runtime: canvasExtensionRuntime,
};
