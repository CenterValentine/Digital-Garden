import { Node, mergeAttributes, type Editor } from "@tiptap/core";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";
import { AudioPlayer } from "@/components/content/editor/AudioPlayer";
import {
  audioEmbedAttrSpec,
  type AudioEmbedAttrs,
} from "./audio-embed";

// Client-only Node spec (Audio Block, Session 1).
//
// Kept separate from the server-safe sibling so the server bundle
// never traces `react-dom/client` (Next.js rejects client-only
// transitive imports from server-component code).
//
// extensions-client.ts imports `AudioEmbed` from here.
// extensions-server.ts and collaboration/extensions.ts import
// `ServerAudioEmbed` from ./audio-embed.
//
// Attributes are shared via audioEmbedAttrSpec() so client + server
// can never drift on the schema.

type BlockContentDom = HTMLElement & {
  __reactRoot?: Root;
  __cleanup?: () => void;
  __lastAttrs?: AudioEmbedAttrs;
};

// Shallow attribute comparison — bails the React re-render on
// focus/selection ticks where attrs haven't actually changed.
function attrsEqual(a: AudioEmbedAttrs, b: AudioEmbedAttrs): boolean {
  return (
    a.src === b.src &&
    a.filename === b.filename &&
    a.durationSeconds === b.durationSeconds &&
    a.mimeType === b.mimeType &&
    a.fileSize === b.fileSize &&
    a.autoplayOnFlip === b.autoplayOnFlip &&
    a.showBackground === b.showBackground
  );
}

function renderAudioEmbed(
  attrs: AudioEmbedAttrs,
  contentDom: HTMLElement,
  editor: Editor,
  getPos: () => number | undefined,
) {
  const dom = contentDom as BlockContentDom;

  if (dom.__reactRoot && dom.__lastAttrs && attrsEqual(dom.__lastAttrs, attrs)) {
    return;
  }

  if (!dom.__reactRoot) {
    contentDom.innerHTML = "";
    const mount = document.createElement("div");
    contentDom.appendChild(mount);
    dom.__reactRoot = createRoot(mount);
    dom.__cleanup = () => {
      // React 18 forbids unmount during a render pass; defer to a
      // microtask so unmount lands after the current render completes.
      const root = dom.__reactRoot;
      delete dom.__reactRoot;
      delete dom.__lastAttrs;
      if (root) {
        queueMicrotask(() => {
          try {
            root.unmount();
          } catch {
            // ignore — root may have been GC'd if host node also removed
          }
        });
      }
    };
  }

  dom.__reactRoot.render(
    createElement(AudioPlayer, {
      attrs,
      editor,
      getPos,
    }),
  );
  dom.__lastAttrs = attrs;
}

export const AudioEmbed = Node.create({
  name: "audioEmbed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return audioEmbedAttrSpec();
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="audioEmbed"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "block-audio-embed",
        "data-block-type": "audioEmbed",
      }),
    ];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "audioEmbed",
      label: "Audio",
      iconName: "Music",
      atom: true,
      renderContent(node, contentDom, editor, getPos) {
        renderAudioEmbed(
          node.attrs as AudioEmbedAttrs,
          contentDom,
          editor,
          getPos ?? (() => undefined),
        );
      },
      updateContent(node, contentDom, editor, getPos) {
        // Diff in-place; the attrsEqual fast-path in renderAudioEmbed
        // bails when nothing has changed (keeps the React tree mounted
        // across focus/selection ticks).
        renderAudioEmbed(
          node.attrs as AudioEmbedAttrs,
          contentDom,
          editor,
          getPos ?? (() => undefined),
        );
        return true;
      },
    });
  },
});
