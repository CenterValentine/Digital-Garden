import { peopleExtensionRuntime } from "./client";
import { peopleExtensionManifest } from "./manifest";
import type { BuiltInExtension } from "@/lib/extensions/types";

export const peopleBuiltInExtension: BuiltInExtension = {
  manifest: peopleExtensionManifest,
  runtime: peopleExtensionRuntime,
};
