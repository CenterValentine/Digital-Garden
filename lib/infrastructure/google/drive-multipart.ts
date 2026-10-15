/**
 * Google Drive `multipart/related` upload body.
 *
 * Every line break is built from BYTES, never from a string literal.
 * The route used `[…].join("\r\n")`; the production minifier folded that
 * into a template literal with raw line breaks, which JavaScript
 * normalizes to bare LF — so the part headers reached Google without
 * their CRs and every upload failed "Malformed multipart body." while
 * the same code worked unminified in dev (2026-10-14; the compiled chunk
 * held zero CR bytes). A Buffer of 13, 10 is a value the minifier cannot
 * rewrite. `pnpm google:multipart:check` pins this.
 *
 * Server-only (Node Buffer).
 */

const CRLF = Buffer.from([13, 10]);

/** RFC 2046 boundary: printable, cannot occur in the parts we send. */
export const DRIVE_MULTIPART_BOUNDARY = "-------314159265358979323846";

export interface DriveMultipartInput {
  /** File metadata Drive reads first (name, target mimeType, parents…). */
  metadata: Record<string, unknown>;
  /** The file's own mime type, as stored. */
  mimeType: string;
  file: ArrayBuffer | Uint8Array;
  boundary?: string;
}

export function buildDriveMultipartBody(input: DriveMultipartInput): {
  body: Buffer<ArrayBuffer>;
  contentType: string;
} {
  const boundary = input.boundary ?? DRIVE_MULTIPART_BOUNDARY;
  const text = (value: string) => Buffer.from(value, "utf8");
  const file = input.file instanceof Uint8Array ? Buffer.from(input.file) : Buffer.from(new Uint8Array(input.file));
  const body = Buffer.concat([
    text(`--${boundary}`),
    CRLF,
    text("Content-Type: application/json; charset=UTF-8"),
    CRLF,
    CRLF,
    text(JSON.stringify(input.metadata)),
    CRLF,
    text(`--${boundary}`),
    CRLF,
    text(`Content-Type: ${input.mimeType}`),
    CRLF,
    CRLF,
    file,
    CRLF,
    text(`--${boundary}--`),
  ]);
  return { body, contentType: `multipart/related; boundary=${boundary}` };
}
