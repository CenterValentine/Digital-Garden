import { publishingExtensionManifest } from "./manifest";
import { publishingExtensionRuntime } from "./client";
import { publishingExtensionServerRuntime } from "./server-runtime";
import type { BuiltInExtension } from "@/lib/extensions/types";

export const publishingBuiltInExtension: BuiltInExtension = {
  manifest: publishingExtensionManifest,
  runtime: publishingExtensionRuntime,
  serverRuntime: publishingExtensionServerRuntime,
};
