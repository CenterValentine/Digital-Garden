import type { BuiltInExtension } from "@/lib/extensions/types";
import { crmExtensionRuntime } from "./client";
import { crmExtensionManifest } from "./manifest";

export const crmBuiltInExtension: BuiltInExtension = {
  manifest: crmExtensionManifest,
  runtime: crmExtensionRuntime,
};
