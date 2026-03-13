/**
 * Custom Image Extension
 *
 * Extends TipTap's built-in Image extension with:
 * - contentId: links to the ContentNode holding the FilePayload
 * - source: provenance tracking (user-uploaded, ai-generated, url)
 * - uploading: shows placeholder while upload is in progress
 * - width: resizable via bubble menu presets or drag handles
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

  // Vanilla DOM NodeView with resize handles (no React — stays in ProseMirror's DOM layer)
  addNodeView() {
    return ({ node, getPos, editor }) => {
      // Container
      const wrapper = document.createElement("div");
      wrapper.classList.add("image-resize-wrapper");
      wrapper.style.display = "inline-block";
      wrapper.style.position = "relative";
      wrapper.style.maxWidth = "100%";
      if (node.attrs.width) {
        wrapper.style.width = node.attrs.width;
      }

      // Image element
      const img = document.createElement("img");
      img.src = node.attrs.src || "";
      img.alt = node.attrs.alt || "";
      if (node.attrs.title) img.title = node.attrs.title;
      if (node.attrs.uploading) img.setAttribute("data-uploading", "true");
      if (node.attrs.contentId) img.setAttribute("data-content-id", node.attrs.contentId);
      if (node.attrs.source && node.attrs.source !== "user-uploaded") {
        img.setAttribute("data-source", node.attrs.source);
      }
      img.style.width = "100%";
      img.style.height = "auto";
      img.draggable = false; // Prevent native image drag interfering with resize

      wrapper.appendChild(img);

      // Resize handle (bottom-right corner only for simplicity)
      const handle = document.createElement("div");
      handle.classList.add("image-resize-handle");
      handle.contentEditable = "false";
      wrapper.appendChild(handle);

      // Resize logic
      let startX = 0;
      let startWidth = 0;

      const onMouseMove = (e: MouseEvent) => {
        const dx = e.clientX - startX;
        const newWidth = Math.max(50, startWidth + dx);
        wrapper.style.width = `${newWidth}px`;
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";

        const finalWidth = wrapper.offsetWidth;
        const pos = getPos();
        if (typeof pos !== "number") return;

        // Store as pixel value
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            width: `${finalWidth}px`,
          })
        );
      };

      handle.addEventListener("mousedown", (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        startX = e.clientX;
        startWidth = wrapper.offsetWidth;
        document.body.style.cursor = "nwse-resize";
        document.body.style.userSelect = "none";
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      });

      return {
        dom: wrapper,
        // Explicit selection management — ProseMirror doesn't always auto-apply
        // ProseMirror-selectednode class to custom NodeView dom elements.
        selectNode() {
          wrapper.classList.add("ProseMirror-selectednode");
        },
        deselectNode() {
          wrapper.classList.remove("ProseMirror-selectednode");
        },
        // Update when node attrs change (e.g., after upload swaps src)
        update(updatedNode) {
          if (updatedNode.type.name !== "image") return false;

          img.src = updatedNode.attrs.src || "";
          img.alt = updatedNode.attrs.alt || "";
          if (updatedNode.attrs.title) {
            img.title = updatedNode.attrs.title;
          } else {
            img.removeAttribute("title");
          }
          if (updatedNode.attrs.uploading) {
            img.setAttribute("data-uploading", "true");
          } else {
            img.removeAttribute("data-uploading");
          }
          if (updatedNode.attrs.contentId) {
            img.setAttribute("data-content-id", updatedNode.attrs.contentId);
          } else {
            img.removeAttribute("data-content-id");
          }
          if (updatedNode.attrs.source && updatedNode.attrs.source !== "user-uploaded") {
            img.setAttribute("data-source", updatedNode.attrs.source);
          } else {
            img.removeAttribute("data-source");
          }
          if (updatedNode.attrs.width) {
            wrapper.style.width = updatedNode.attrs.width;
          } else {
            wrapper.style.width = "";
          }

          // Keep node reference up to date for the resize handler
          node = updatedNode;
          return true;
        },
        destroy() {
          // Clean up any dangling listeners (mouseup handler removes them,
          // but this covers edge cases like rapid node deletion during drag)
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
        },
      };
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
