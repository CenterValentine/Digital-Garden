import { calendarExtensionRuntime } from "./client";
import { calendarExtensionManifest } from "./manifest";
import { calendarExtensionServerRuntime } from "./server-runtime";
import type { BuiltInExtension } from "@/lib/extensions/types";

export const calendarBuiltInExtension: BuiltInExtension = {
  manifest: calendarExtensionManifest,
  runtime: calendarExtensionRuntime,
  serverRuntime: calendarExtensionServerRuntime,
};
