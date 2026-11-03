/**
 * Canvas archive — where a course's content comes from (server-only).
 *
 * The REST API and a Common Cartridge file both implement this; the importer
 * (apply.ts) only ever talks to the interface.
 */

import "server-only";
import type { CanvasRefResolver, RefTarget } from "../html";
import type { CanvasSourceKind, CourseSnapshot, SnapshotItem } from "../types";
import { CanvasError } from "./http";

export interface FileBody {
  body: Buffer;
  mimeType: string;
  fileName: string;
}

/** Stores one file (a submission attachment) next to the note being written. */
export type StoreAttachment = (file: FileBody) => Promise<RefTarget | null>;

export interface CanvasSource {
  kind: CanvasSourceKind;
  /** "https://school.instructure.com" or "a course export (.imscc)". */
  sourceLabel: string;
  resolver: CanvasRefResolver;
  snapshot(): Promise<CourseSnapshot>;
  syllabusHtml(): Promise<string>;
  /** The note's HTML, composed, with Canvas URLs still in it (apply.ts rewrites them). */
  noteHtml(item: SnapshotItem, storeAttachment: StoreAttachment): Promise<string>;
  file(item: SnapshotItem): Promise<FileBody>;
  /** Bytes behind an image URL inside course HTML, or null when it can't be fetched. */
  fileForUrl(src: string): Promise<FileBody | null>;
}

/** A file over the size limit: the importer links to it instead of copying it. */
export class CanvasFileTooLarge extends CanvasError {
  constructor(
    readonly fileName: string,
    readonly size: number
  ) {
    super(`${fileName} is ${Math.round(size / 1024 / 1024)} MB, over the download limit`, 413);
  }
}

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain",
  md: "text/markdown",
  html: "text/html",
  htm: "text/html",
  json: "application/json",
  zip: "application/zip",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  epub: "application/epub+zip",
};

export function extensionOf(fileName: string): string {
  const match = /\.([a-z0-9]{1,10})$/i.exec(fileName);
  return match ? match[1].toLowerCase() : "";
}

/** The declared type when it's specific, else one inferred from the name. */
export function mimeTypeFor(fileName: string, declared?: string | null): string {
  const base = (declared ?? "").split(";")[0].trim().toLowerCase();
  if (base && base !== "application/octet-stream" && base !== "binary/octet-stream") return base;
  return MIME_BY_EXTENSION[extensionOf(fileName)] ?? "application/octet-stream";
}
