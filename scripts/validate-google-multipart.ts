/**
 * google:multipart:check — the Drive upload body survives minification.
 *
 * Every production upload to Google Drive failed "Malformed multipart
 * body." (2026-06 → 2026-10-14) because the route built CRLF line breaks
 * from string literals, and the production minifier folded
 * `[…].join("\r\n")` into a template literal whose raw line breaks
 * JavaScript normalizes to bare LF. Unminified dev worked, so no local
 * test could see it. The fix builds line breaks from bytes
 * (lib/infrastructure/google/drive-multipart.ts); this gate pins:
 *
 *   1. the exact bytes the builder emits, against a hand-built reference;
 *   2. no bare LF anywhere in the part headers (every header line is CRLF);
 *   3. the builder module contains no string-literal CRLF and no `.join(`
 *      — the shapes a minifier can fold;
 *   4. the upload route builds its body through the builder only.
 *
 * Run: pnpm google:multipart:check (in `build` and quality.yml).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

async function main(): Promise<void> {
  const { buildDriveMultipartBody, DRIVE_MULTIPART_BOUNDARY } = await import(
    "@/lib/infrastructure/google/drive-multipart"
  );

  const file = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x0a, 0x0d, 0x0a, 0xff, 0x00]); // includes LF/CR bytes on purpose
  const mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const metadata = { name: "Résumé (loops) copy 2.docx", mimeType: "application/vnd.google-apps.document" };
  const { body, contentType } = buildDriveMultipartBody({ metadata, mimeType, file });

  // 1. Exact bytes vs a hand-built reference (this script is never minified).
  const b = DRIVE_MULTIPART_BOUNDARY;
  const reference = Buffer.concat([
    Buffer.from(
      `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${b}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      "utf8",
    ),
    Buffer.from(file),
    Buffer.from(`\r\n--${b}--`, "utf8"),
  ]);
  assert.ok(body.equals(reference), "the builder's bytes match the RFC 2046 reference exactly");
  assert.equal(contentType, `multipart/related; boundary=${b}`);

  // 2. Every header line ends in CRLF: no LF without a CR before it in the
  //    header region (everything before the file bytes) or the trailer.
  const headerEnd = body.indexOf(Buffer.from(file));
  assert.ok(headerEnd > 0, "file bytes located");
  const checkCrlf = (region: Buffer, label: string) => {
    for (let i = 0; i < region.length; i++) {
      if (region[i] === 0x0a) assert.equal(region[i - 1], 0x0d, `${label}: bare LF at offset ${i}`);
    }
  };
  checkCrlf(body.subarray(0, headerEnd), "part headers");
  checkCrlf(body.subarray(headerEnd + file.length), "closing delimiter");
  const crlfCount = (buf: Buffer) => {
    let n = 0;
    for (let i = 1; i < buf.length; i++) if (buf[i] === 0x0a && buf[i - 1] === 0x0d) n++;
    return n;
  };
  assert.equal(crlfCount(body.subarray(0, headerEnd)), 7, "seven CRLFs before the file (4 metadata part + 3 file part)");
  assert.ok(body.subarray(body.length - b.length - 6).toString("utf8").startsWith("\r\n--"), "trailer opens with CRLF");

  // ArrayBuffer input (what fetch().arrayBuffer() returns) gives the same bytes.
  const fromArrayBuffer = buildDriveMultipartBody({ metadata, mimeType, file: file.slice().buffer }).body;
  assert.ok(fromArrayBuffer.equals(body), "ArrayBuffer and Uint8Array inputs build identical bodies");

  // 3. The builder has no minifier-foldable CRLF shapes.
  const builderSrc = read("lib/infrastructure/google/drive-multipart.ts");
  const code = builderSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /\\r|\\n/, "drive-multipart.ts builds no line break from a string escape");
  assert.doesNotMatch(code, /\.join\(/, "drive-multipart.ts joins no strings");
  assert.match(code, /Buffer\.from\(\[13, 10\]\)/, "CRLF is a byte Buffer");

  // 4. The route assembles its body only through the builder.
  const route = read("app/api/google-drive/upload/route.ts");
  assert.match(route, /buildDriveMultipartBody\(/, "the upload route uses the builder");
  assert.doesNotMatch(route.replace(/\/\/.*$/gm, ""), /\\r\\n/, "the upload route builds no CRLF of its own");

  console.log(
    "✓ google:multipart:check — the Drive upload body matches the RFC 2046 reference byte for byte, every header line is CRLF, and no minifier-foldable CRLF literal exists in the builder or the route",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
