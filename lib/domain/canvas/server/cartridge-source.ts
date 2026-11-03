/**
 * Canvas archive — the Common Cartridge source (server-only).
 *
 * For a course you can no longer reach through Canvas: an instructor's
 * `.imscc` export, already parsed (cartridge.ts). Everything is local to the
 * zip, so nothing here touches the network.
 */

import "server-only";
import { composeAssignmentHtml, composeDiscussionHtml, composeQuizHtml } from "../compose";
import { cartridgeFilePath, cartridgeItemHtml, type ParsedCartridge } from "../cartridge";
import { createCartridgeRefResolver } from "../refs";
import { CANVAS_FILE_SIZE_LIMIT } from "../types";
import { CanvasError } from "./http";
import { CanvasFileTooLarge, mimeTypeFor, type CanvasSource, type FileBody } from "./source";

const NOT_IN_EXPORTS =
  "A course export doesn't include your submissions, grades or feedback. Import the course from Canvas directly (while you still have access) to bring those in.";
const NO_REPLIES_IN_EXPORTS =
  "A course export doesn't include discussion replies. Import the course from Canvas directly (while you still have access) to bring yours in.";

export function createCartridgeSource(cartridge: ParsedCartridge): CanvasSource {
  async function readFile(path: string): Promise<FileBody | null> {
    const bytes = await cartridge.readBinary(path);
    if (!bytes) return null;
    const fileName = decodeURIComponent(path.split("/").pop() || "file");
    if (bytes.byteLength > CANVAS_FILE_SIZE_LIMIT) throw new CanvasFileTooLarge(fileName, bytes.byteLength);
    return { body: Buffer.from(bytes), fileName, mimeType: mimeTypeFor(fileName) };
  }

  return {
    kind: "cartridge",
    sourceLabel: "a course export (.imscc)",
    resolver: createCartridgeRefResolver(),

    async snapshot() {
      return cartridge.snapshot;
    },

    async syllabusHtml() {
      return cartridge.syllabusHtml ?? "";
    },

    async noteHtml(item) {
      const content = await cartridgeItemHtml(cartridge, item);
      switch (item.type) {
        case "page":
          return content.html;
        case "assignment":
          return composeAssignmentHtml({
            descriptionHtml: content.html,
            dueAt: content.dueAt,
            pointsPossible: content.pointsPossible,
            submission: null,
            comments: [],
            submissionUnavailable: NOT_IN_EXPORTS,
          });
        case "discussion":
          return composeDiscussionHtml({
            promptHtml: content.html,
            postedAt: null,
            author: null,
            myReplies: [],
            repliesUnavailable: NO_REPLIES_IN_EXPORTS,
          });
        case "quiz":
          return composeQuizHtml({
            descriptionHtml: content.html,
            dueAt: content.dueAt,
            pointsPossible: content.pointsPossible,
            score: null,
          });
        default:
          throw new CanvasError(`${item.title} isn't a note`, 400);
      }
    },

    async file(item) {
      const file = item.ref ? await readFile(item.ref) : null;
      if (!file) throw new CanvasError(`${item.title} isn't in the export`, 404);
      return file;
    },

    async fileForUrl(src) {
      const refKey = createCartridgeRefResolver().refKeyOf(src);
      const path = refKey ? cartridgeFilePath(refKey) : null;
      try {
        return path ? await readFile(path) : null;
      } catch {
        return null;
      }
    },
  };
}
