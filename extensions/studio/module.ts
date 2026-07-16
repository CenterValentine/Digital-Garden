import type { BuiltInExtension } from "@/lib/extensions/types";
import { studioExtensionRuntime } from "./client";
import { studioExtensionManifest } from "./manifest";
import { studioExtensionServerRuntime } from "./server-runtime";

export const studioBuiltInExtension: BuiltInExtension = {
  manifest: studioExtensionManifest,
  runtime: studioExtensionRuntime,
  serverRuntime: studioExtensionServerRuntime,
};
