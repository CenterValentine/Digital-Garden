import type { ExtensionManifest } from "@/lib/extensions/types";

export const READER_EXTENSION_ID = "reader";
/** Synthetic content id namespace for reader tabs (library, future corpora). */
export const READER_VIRTUAL_PREFIX = "reader:";
export const READER_LIBRARY_CONTENT_ID = "reader:library";
/** The scripture catalog (traditions → collections to install / enable). */
export const READER_SCRIPTURES_CONTENT_ID = "reader:scriptures";
export const READER_VIRTUAL_CONTENT_TYPE = "reader";

export const readerExtensionManifest: ExtensionManifest = {
  id: READER_EXTENSION_ID,
  label: "Reader",
  description:
    "Read and mark up e-books inside Digital Garden. Find free books (Project Gutenberg, Open Library, Standard Ebooks, Wikisource, OAPEN), connect your own OPDS library, and import Kindle/Readwise highlights.",
  iconName: "BookOpen",
  enabledByDefault: true,
  canDisable: true,
  navItems: [],
  surfaces: ["content-viewer"],
  settings: {
    path: "/settings/extensions/reader",
    label: "Reader",
    title: "Reader",
    description: "Reading defaults, connected services and highlight imports.",
    order: 85,
  },
};
