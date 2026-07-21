import { workflowsExtensionRuntime } from "./client";
import { workflowsExtensionManifest } from "./manifest";
import type { BuiltInExtension } from "@/lib/extensions/types";

export const workflowsBuiltInExtension: BuiltInExtension = {
  manifest: workflowsExtensionManifest,
  runtime: workflowsExtensionRuntime,
};
