import { PUBLISHING_EXTENSION_ID } from "./manifest";
import type { ExtensionServerRuntime } from "@/lib/extensions/types";

// Publishing blocks' Server variants will be registered here (W2+)
// import { ServerGalleryBlock } from "./blocks/gallery/gallery-block";

export const publishingExtensionServerRuntime: ExtensionServerRuntime = {
  id: PUBLISHING_EXTENSION_ID,
  editorServerExtensions: [
    // populated as blocks are built
  ],
};
