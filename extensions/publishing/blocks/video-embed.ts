/**
 * VideoEmbed Block — W6 Publishing Block
 *
 * Atom block: embed a YouTube, Vimeo, or raw video URL.
 * Converts watch URLs to embed URLs at render time.
 *
 * Attrs:
 * - url         Video URL (YouTube watch, Vimeo, or direct .mp4)
 * - caption     Optional caption text
 * - aspectRatio 16:9 | 4:3 | 1:1 | 9:16
 * - autoplay    boolean (muted autoplay for direct video files only)
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { z } from "zod";
import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { createBlockNodeView } from "@/lib/domain/blocks/node-view-factory";
import { dataAttr } from "../lib/data-attr";

// ─── Schema ──────────────────────────────────────────────────────────────────

const ASPECT_RATIOS = ["16:9", "4:3", "1:1", "9:16"] as const;

const { schema: videoSchema, defaults: videoDefaults } = createBlockSchema(
  "videoEmbed",
  {
    url: z.string().default("").describe("YouTube, Vimeo, or direct video URL"),
    caption: z.string().default("").describe("Optional caption shown below the video"),
    aspectRatio: z.enum(ASPECT_RATIOS).default("16:9"),
    autoplay: z.boolean().default(false).describe("Autoplay (muted, for direct video files only)"),
  }
);

registerBlock({
  type: "videoEmbed",
  label: "Video",
  description: "Embed a YouTube, Vimeo, or direct video URL",
  iconName: "Play",
  family: "content",
  group: "publishing",
  contentModel: null,
  atom: true,
  attrsSchema: videoSchema,
  defaultAttrs: videoDefaults(),
  slashCommand: "/video",
  searchTerms: ["video", "youtube", "vimeo", "embed", "player", "media"],
});

// ─── URL helpers ──────────────────────────────────────────────────────────────

function toEmbedUrl(url: string): { type: "iframe" | "video"; src: string } | null {
  if (!url) return null;

  // YouTube
  const yt = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  if (yt) {
    return { type: "iframe", src: `https://www.youtube.com/embed/${yt[1]}?rel=0` };
  }

  // Vimeo
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) {
    return { type: "iframe", src: `https://player.vimeo.com/video/${vimeo[1]}` };
  }

  // Direct video
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) {
    return { type: "video", src: url };
  }

  return null;
}

function aspectPaddingBottom(ratio: string): string {
  const map: Record<string, string> = {
    "16:9": "56.25%",
    "4:3": "75%",
    "1:1": "100%",
    "9:16": "177.78%",
  };
  return map[ratio] ?? "56.25%";
}

function editorHtml(url: string, caption: string, aspectRatio: string): string {
  if (!url) {
    return `
      <div style="padding:20px;border:1px dashed #d1d5db;border-radius:8px;text-align:center">
        <p style="margin:0 0 4px;font-size:13px;font-weight:500;color:#374151">Video Embed</p>
        <p style="margin:0;font-size:12px;color:#9ca3af">Paste a YouTube, Vimeo, or .mp4 URL via Properties (⋯)</p>
      </div>
    `;
  }

  const embed = toEmbedUrl(url);
  const pb = aspectPaddingBottom(aspectRatio);

  if (!embed) {
    return `
      <div style="padding:12px;background:#fef2f2;border-radius:6px;border:1px solid #fecaca">
        <p style="margin:0;font-size:12px;color:#dc2626">Unrecognised URL: ${url}</p>
      </div>
    `;
  }

  const preview =
    embed.type === "iframe"
      ? `<div style="position:relative;padding-bottom:${pb};height:0;background:#111;border-radius:6px;overflow:hidden">
           <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
             <p style="margin:0;font-size:12px;color:#9ca3af">▶ ${url}</p>
           </div>
         </div>`
      : `<video src="${embed.src}" style="width:100%;border-radius:6px" controls muted></video>`;

  return `
    ${preview}
    ${caption ? `<p style="margin:6px 0 0;font-size:12px;color:#6b7280;text-align:center">${caption}</p>` : ""}
    <p style="margin:4px 0 0;font-size:11px;color:#9ca3af">${aspectRatio}</p>
  `;
}

// ─── Shared attrs ─────────────────────────────────────────────────────────────

function videoAttrs() {
  return {
    blockId: { default: null },
    blockType: { default: "videoEmbed" },
    url: dataAttr("url"),
    caption: dataAttr("caption"),
    aspectRatio: dataAttr("aspectRatio", { default: "16:9" }),
    autoplay: dataAttr<boolean>("autoplay", { default: false, parseAs: "boolean" }),
  };
}

// ─── Client extension ─────────────────────────────────────────────────────────

export const VideoEmbed = Node.create({
  name: "videoEmbed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes: videoAttrs,

  parseHTML() {
    return [{ tag: 'figure[data-block-type="videoEmbed"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "figure",
      mergeAttributes(HTMLAttributes, {
        class: "block-video",
        "data-block-type": "videoEmbed",
      }),
    ];
  },

  addNodeView() {
    return createBlockNodeView({
      blockType: "videoEmbed",
      label: "Video",
      iconName: "Play",
      atom: true,
      renderContent(node, contentDom) {
        contentDom.className = "block-video-editor";
        contentDom.innerHTML = editorHtml(
          node.attrs.url as string,
          node.attrs.caption as string,
          node.attrs.aspectRatio as string,
        );
      },
      updateContent(node, contentDom) {
        contentDom.innerHTML = editorHtml(
          node.attrs.url as string,
          node.attrs.caption as string,
          node.attrs.aspectRatio as string,
        );
        return true;
      },
    });
  },
});

// ─── Server extension ─────────────────────────────────────────────────────────

export const ServerVideoEmbed = Node.create({
  name: "videoEmbed",
  group: "block",
  atom: true,

  addAttributes: videoAttrs,

  parseHTML() {
    return [{ tag: 'figure[data-block-type="videoEmbed"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const url = (HTMLAttributes["data-url"] as string) || "";
    const caption = (HTMLAttributes["data-caption"] as string) || "";
    const aspectRatio = (HTMLAttributes["data-aspect-ratio"] as string) || "16:9";
    const autoplay = HTMLAttributes["data-autoplay"] === true || HTMLAttributes["data-autoplay"] === "true";
    const pb = aspectPaddingBottom(aspectRatio);

    const embed = toEmbedUrl(url);

    const mediaEl = !embed
      ? ["p", { class: "block-video-error" }, "Video could not be loaded."]
      : embed.type === "iframe"
      ? [
          "div",
          {
            class: "block-video-wrapper",
            style: `position:relative;padding-bottom:${pb};height:0;overflow:hidden`,
          },
          [
            "iframe",
            {
              src: embed.src,
              class: "block-video-iframe",
              style: "position:absolute;top:0;left:0;width:100%;height:100%",
              frameborder: "0",
              allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
              allowfullscreen: "",
              loading: "lazy",
            },
          ],
        ]
      : [
          "video",
          {
            src: embed.src,
            class: "block-video-native",
            controls: "",
            // If the URL 404s or the file is unplayable, swap the broken
            // native player UI for the styled error markup. Without this,
            // a stale .mp4 URL on a published page shows the user a
            // broken-looking video player instead of a graceful error.
            // The handler guards via this.dataset.errored so loops can't
            // re-fire if the swap itself somehow triggers another error.
            onerror:
              "if(!this.dataset.errored){this.dataset.errored='1';this.outerHTML='<p class=\"block-video-error\">Video could not be loaded.</p>';}",
            ...(autoplay ? { autoplay: "", muted: "", playsinline: "" } : {}),
          },
        ];

    return [
      "figure",
      mergeAttributes(HTMLAttributes, {
        class: `block-video block-video--${aspectRatio.replace(":", "-")}`,
        "data-block-type": "videoEmbed",
      }),
      mediaEl,
      ...(caption ? [["figcaption", { class: "block-video-caption" }, caption]] : []),
    ];
  },
});
