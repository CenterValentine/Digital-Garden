import { workflowsExtensionManifest } from "./manifest";
import type { BuiltInExtension } from "@/lib/extensions/types";

// Runtime (run list/detail UI, gate cards) arrives in Session 4.
export const workflowsBuiltInExtension: BuiltInExtension = {
  manifest: workflowsExtensionManifest,
};
