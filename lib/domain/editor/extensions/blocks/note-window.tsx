import { Node } from "@tiptap/core";
import { z } from "zod";

import { createBlockSchema } from "@/lib/domain/blocks/schema";
import { registerBlock } from "@/lib/domain/blocks/registry";
import { blockIdAttr, dataAttr } from "@/lib/domain/blocks/data-attr";

// Server-safe block module.
//
// This file MUST stay free of React, react-dom, and any DOM imports —
// `extensions-server.ts` and `lib/domain/collaboration/extensions.ts`
// pull it in for API routes and the Hocuspocus schema, and Next.js's
// server-component check rejects any client-only transitive import.
// The client NodeView mount lives in note-window-client.tsx.
//
// Reference-only — a Note Window points at another ContentNode's note
// content by id and renders/edits it in place. The block stores just the
// pointer plus per-instance presentation preferences:
//
//   targetContentId   The windowed ContentNode (null while the user is
//                     mid-picking). Notes get the collaboration runtime;
//                     non-note targets ("sidecar notes") are REST-only.
//   targetTitle       Display label for the header. A cached copy of the
//                     target's title — self-healed from GET responses,
//                     same convention as wikiLink's targetTitle.
//   height            Body max-height in px; content scrolls beyond it.
//   showBorder        Wired to the factory's containerAttr.
//
// Markdown source view: deliberately NO codec — the block round-trips
// as a base64 `dg-block` fence, which preserves every attr verbatim.
// Per-instance history lives OUTSIDE the node attrs, in the host note's
// Y.Doc under `noteWindowSubMapKey(blockId)` — attrs travel with
// copy/paste, history must not (see block-id-paste-hygiene.ts).
const { schema: noteWindowSchema, defaults: noteWindowDefaults } =
  createBlockSchema("noteWindow", {
    targetContentId: z
      .string()
      .nullable()
      .default(null)
      .describe("ContentNode id being windowed; null = unassigned"),
    targetTitle: z
      .string()
      .default("")
      .describe("Cached display title of the target (self-healing label)"),
    height: z
      .number()
      .int()
      .min(160)
      .max(1200)
      .default(245)
      .describe("Body max-height in px; content scrolls beyond it"),
    showBorder: z.boolean().default(true).describe("Show border"),
  });

export type NoteWindowAttrs = z.infer<typeof noteWindowSchema>;
export { noteWindowSchema, noteWindowDefaults };

/**
 * Key for this window's per-instance state (retarget history) inside the
 * HOST note's Y.Doc. Kept in one exported helper so client code and any
 * future server consumer agree on the key format — same convention as
 * `excalidrawEmbedSubMapKey` / `mermaidEmbedSubTextKey`.
 */
export function noteWindowSubMapKey(blockId: string): string {
  return `blockNoteWindow:${blockId}`;
}

// registerBlock is server-safe (the registry is just a Map). Calling it
// here means both server and client bundles see the registration.
registerBlock({
  type: "noteWindow",
  ttsSkip: true, // interactive embedded editor — not narratable prose
  label: "Note Window",
  description:
    "Window another note's content in place — view, edit, retarget, or create a new note",
  aiHint:
    "Reference block: set targetContentId to an EXISTING ContentNode id " +
    "(search first; never invent ids) or leave attrs empty so the user can " +
    "pick a target. The window renders the target's content itself — do not " +
    "duplicate the target's content into the document.",
  iconName: "AppWindow",
  family: "content",
  group: "display",
  contentModel: null,
  atom: true,
  attrsSchema: noteWindowSchema,
  defaultAttrs: noteWindowDefaults(),
  slashCommand: "/window",
  searchTerms: [
    "window",
    "note window",
    "embed",
    "mirror",
    "portal",
    "note",
    "transclude",
    "transclusion",
  ],
  hiddenFields: ["targetContentId"],
});

// ─── Shared attribute spec ──────────────────────────────────────────────
//
// Exported as a function so both the client and server Node.create calls
// use exactly the same attrs definitions — drift between client and
// server schemas is one of the few ways to break TipTap/Y.Doc round-trip.
export function noteWindowAttrSpec(): Record<string, unknown> {
  return {
    blockId: blockIdAttr,
    blockType: { default: "noteWindow" },
    targetContentId: dataAttr<string | null>("targetContentId", {
      default: null,
    }),
    // Database targets (DATABASE-CONTENT-TYPE-PLAN B7/O16). Reserved from
    // the first schema bump even though nothing renders them until Phase 2:
    // a TipTap attr added later costs a second version bump plus a second
    // Hocuspocus redeploy, and an un-redeployed collab server rewrites
    // unknown content to unsupportedBlock. One node, four targets:
    //   targetContentId → note        today's window (unchanged)
    //   targetContentId → database    the table at its default view
    //   + targetViewId                one saved view (linked-view case)
    //   + targetRowId                 one row page, embedded
    // PUBLIC-SAFETY: renderHTML below emits only the human-readable title,
    // so these ids inherit the never-reach-published-HTML guarantee.
    targetViewId: dataAttr<string | null>("targetViewId", {
      default: null,
    }),
    targetRowId: dataAttr<string | null>("targetRowId", {
      default: null,
    }),
    targetTitle: dataAttr("targetTitle"),
    height: dataAttr<number>("height", { default: 245, parseAs: "number" }),
    showBorder: dataAttr<boolean>("showBorder", {
      default: true,
      parseAs: "boolean",
    }),
  };
}

// ─── Server-safe Node ───────────────────────────────────────────────────
//
// Used by:
//   - getServerExtensions() for API routes that parse/serialize TipTap
//     docs (markdown export, search indexing, sanitization)
//   - getCollaborationServerExtensions() for the Hocuspocus server's
//     Y.Doc schema
//
// PUBLIC-SAFETY: this is also the schema used by the public-page renderer
// in `components/public/TipTapContent.tsx`. The windowed content is
// private user data, and the target's UUID must not leak into published
// HTML — so renderHTML deliberately emits only the human-readable title
// the author already placed in their own document. Middle ground between
// ServerFlashcardEmbed (hidden div) and ServerExcalidrawBlock (static
// label). Round-trip safety is unaffected: markdown export carries the
// full attrs through the dg-block base64 fence, never through this HTML.
export const ServerNoteWindow = Node.create({
  name: "noteWindow",
  group: "block",
  atom: true,

  addAttributes() {
    return noteWindowAttrSpec();
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="noteWindow"]' }];
  },

  renderHTML({ node }) {
    const title =
      typeof node.attrs.targetTitle === "string" ? node.attrs.targetTitle : "";
    return [
      "div",
      {
        class: "block-note-window-public",
        "data-block-type": "noteWindow",
      },
      title ? `Windowed note: ${title}` : "Windowed note",
    ];
  },
});
