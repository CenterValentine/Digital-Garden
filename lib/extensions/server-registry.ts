import type { Extensions } from "@tiptap/core";
import { SERVER_BUILT_IN_EXTENSIONS } from "./server-installed";

export function getExtensionServerEditorExtensions(): Extensions {
  return SERVER_BUILT_IN_EXTENSIONS
    .filter((extension) => extension.manifest.enabledByDefault)
    .flatMap((extension) => extension.serverRuntime?.editorServerExtensions ?? []);
}
