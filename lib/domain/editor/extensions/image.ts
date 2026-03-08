/**
 * Custom Image Extension
 *
 * Extends TipTap's built-in Image extension with:
 * - contentId: links to the ContentNode holding the FilePayload
 * - source: provenance tracking (user-uploaded, ai-generated, url)
 * - uploading: shows placeholder while upload is in progress
 *
 * Sprint 37: Images in TipTap + Referenced Content Lifecycle
 */

import Image from "@tiptap/extension-image";

export const EditorImage = Image.extend({
  // atom: true enables NodeSelection on click (blue outline, delete via backspace)
  atom: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      contentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-content-id"),
        renderHTML: (attributes) => {
          if (!attributes.contentId) return {};
          return { "data-content-id": attributes.contentId };
        },
      },
      source: {
        default: "user-uploaded",
        parseHTML: (element) => element.getAttribute("data-source") || "user-uploaded",
        renderHTML: (attributes) => {
          if (!attributes.source || attributes.source === "user-uploaded") return {};
          return { "data-source": attributes.source };
        },
      },
      uploading: {
        default: false,
        // Always starts as false when loading from HTML (transient state)
        parseHTML: () => false,
        // Render to DOM so CSS can show the upload pulse animation
        renderHTML: (attributes) => {
          if (!attributes.uploading) return {};
          return { "data-uploading": "true" };
        },
      },
      width: {
        default: null, // null = auto (100% from CSS max-width)
        parseHTML: (element) => element.style.width || null,
        renderHTML: (attributes) => {
          if (!attributes.width) return {};
          return { style: `width: ${attributes.width}` };
        },
      },
    };
  },
});

/**
 * Server-safe Image extension (no React NodeView).
 * Used in API routes for JSON parsing/serialization.
 */
export const ServerImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      contentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-content-id"),
        renderHTML: (attributes) => {
          if (!attributes.contentId) return {};
          return { "data-content-id": attributes.contentId };
        },
      },
      source: {
        default: "user-uploaded",
        parseHTML: (element) => element.getAttribute("data-source") || "user-uploaded",
        renderHTML: (attributes) => {
          if (!attributes.source || attributes.source === "user-uploaded") return {};
          return { "data-source": attributes.source };
        },
      },
      width: {
        default: null,
        parseHTML: (element) => element.style.width || null,
        renderHTML: (attributes) => {
          if (!attributes.width) return {};
          return { style: `width: ${attributes.width}` };
        },
      },
    };
  },
});
