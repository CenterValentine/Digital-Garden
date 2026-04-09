import { workplacesExtensionRuntime } from "./client";
import { workplacesExtensionManifest } from "./manifest";
import type { BuiltInExtension } from "@/lib/extensions/types";

export const workplacesBuiltInExtension: BuiltInExtension = {
  manifest: workplacesExtensionManifest,
  runtime: workplacesExtensionRuntime,
};
