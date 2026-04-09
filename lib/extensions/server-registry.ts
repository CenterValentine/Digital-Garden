import type { Extensions } from "@tiptap/core";
import { getEnabledExtensionServerRuntimes } from "./registry";

export function getExtensionServerEditorExtensions(): Extensions {
  return getEnabledExtensionServerRuntimes().flatMap(
    (runtime) => runtime.editorServerExtensions ?? []
  );
}
