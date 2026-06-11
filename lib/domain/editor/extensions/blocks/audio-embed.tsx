import { Node } from "@tiptap/core";
import { z } from "zod";

import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";

// Server-safe block module (Audio Block, Session 1).
//
// Must stay React-free / DOM-free — extensions-server.ts and the
// collab schema both pull this in. The client NodeView with the React
// player UI lives in audio-embed-client.tsx; extensions-client.ts
// imports `AudioEmbed` from there.
//
// Attribute shape:
//   src              null until upload completes; non-null storage URL after
//   filename         original filename for display & a11y label
//   durationSeconds  detected client-side from <audio>.duration
//   mimeType         uploaded MIME (audio/mpeg, audio/mp4, etc.)
//   fileSize         bytes; informational
//   autoplayOnFlip   honored by FlashcardReviewOverlay when this block
//                    appears on a card's revealed side (Phase 2)
//   showBackground   container chrome toggle
const { schema: audioEmbedSchema, defaults: audioEmbedDefaults } =
  createBlockSchema("audioEmbed", {
    src: z
      .string()
      .url()
      .nullable()
      .default(null)
      .describe("Storage URL of the uploaded audio file"),
    filename: z
      .string()
      .nullable()
      .default(null)
      .describe("Original filename for display"),
    durationSeconds: z
      .number()
      .nullable()
      .default(null)
      .describe("Audio duration in seconds"),
    mimeType: z
      .string()
      .nullable()
      .default(null)
      .describe("MIME type of the source file"),
    fileSize: z
      .number()
      .nullable()
      .default(null)
      .describe("File size in bytes"),
    autoplayOnFlip: z
      .boolean()
      .default(false)
      .describe("Auto-play when revealed on a flashcard"),
    showBackground: z
      .boolean()
      .default(true)
      .describe("Show container background"),
  });

export type AudioEmbedAttrs = z.infer<typeof audioEmbedSchema>;
export { audioEmbedSchema, audioEmbedDefaults };

registerBlock({
  type: "audioEmbed",
  ttsSkip: true, // audio player embed — has its own playback
  label: "Audio",
  description: "Embed an audio file with an inline player",
  iconName: "Music",
  family: "content",
  group: "media",
  contentModel: null,
  atom: true,
  attrsSchema: audioEmbedSchema,
  defaultAttrs: audioEmbedDefaults(),
  slashCommand: "/audio",
  searchTerms: [
    "audio",
    "sound",
    "mp3",
    "music",
    "voice",
    "podcast",
    "recording",
    "pronunciation",
  ],
});

// Shared attribute spec — used by both client and server Node.create
// calls. Keeping a single source of truth here means client and server
// can never drift on attr names or HTML serialization, which would
// silently break TipTap/Y.Doc round-trip.
export function audioEmbedAttrSpec(): Record<string, unknown> {
  return {
    blockId: { default: null },
    blockType: { default: "audioEmbed" },
    src: {
      default: null,
      parseHTML: (el: HTMLElement) =>
        el.getAttribute("data-src") ||
        el.querySelector("audio")?.getAttribute("src") ||
        null,
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.src ? { "data-src": attrs.src as string } : {},
    },
    filename: {
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute("data-filename") || null,
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.filename ? { "data-filename": attrs.filename as string } : {},
    },
    durationSeconds: {
      default: null,
      parseHTML: (el: HTMLElement) => {
        const raw = el.getAttribute("data-duration");
        return raw ? Number(raw) : null;
      },
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.durationSeconds != null
          ? { "data-duration": String(attrs.durationSeconds) }
          : {},
    },
    mimeType: {
      default: null,
      parseHTML: (el: HTMLElement) =>
        el.getAttribute("data-mime-type") || null,
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.mimeType ? { "data-mime-type": attrs.mimeType as string } : {},
    },
    fileSize: {
      default: null,
      parseHTML: (el: HTMLElement) => {
        const raw = el.getAttribute("data-file-size");
        return raw ? Number(raw) : null;
      },
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.fileSize != null
          ? { "data-file-size": String(attrs.fileSize) }
          : {},
    },
    autoplayOnFlip: {
      default: false,
      parseHTML: (el: HTMLElement) =>
        el.getAttribute("data-autoplay-on-flip") === "true",
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.autoplayOnFlip === true
          ? { "data-autoplay-on-flip": "true" }
          : {},
    },
    showBackground: {
      default: true,
      parseHTML: (el: HTMLElement) =>
        el.getAttribute("data-show-background") !== "false",
      renderHTML: (attrs: Record<string, unknown>) =>
        attrs.showBackground === false
          ? { "data-show-background": "false" }
          : {},
    },
  };
}

// Server-safe Node — used by API routes (markdown export, search
// indexing) and the Hocuspocus server's Y.Doc schema.
//
// Unlike flashcards, audio is NOT private user data — a published note
// that embeds audio should still play. renderHTML emits a real <audio>
// element when `src` is set; for empty-state (src=null) nodes we emit
// a marker div so the serializer round-trips without a broken <audio>
// element with empty src (which logs noisy errors in browsers).
export const ServerAudioEmbed = Node.create({
  name: "audioEmbed",
  group: "block",
  atom: true,

  addAttributes() {
    return audioEmbedAttrSpec();
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="audioEmbed"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const src = HTMLAttributes["data-src"];
    if (!src) {
      return [
        "div",
        {
          class: "block-audio-embed block-audio-embed-empty",
          "data-block-type": "audioEmbed",
          ...HTMLAttributes,
        },
      ];
    }
    return [
      "div",
      {
        class: "block-audio-embed",
        "data-block-type": "audioEmbed",
        ...HTMLAttributes,
      },
      [
        "audio",
        {
          src: src as string,
          controls: "true",
          preload: "metadata",
        },
      ],
    ];
  },
});
