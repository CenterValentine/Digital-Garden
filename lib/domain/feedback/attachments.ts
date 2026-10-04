/**
 * Screenshots in feedback, GitHub-style: paste or drop an image into a field
 * and it becomes `![name](url)` in the issue body.
 *
 * GitHub's own paste-upload endpoint isn't in its public API, so the app
 * hosts the image itself. A pasted screenshot is an ordinary file in the
 * user's tree (root folder "Feedback attachments", the structure they
 * already own and can prune), and the issue links it through the #227
 * capability URL `/f/<token>`. GitHub's image proxy follows that redirect
 * to a short-lived presigned URL, so the bucket stays private. Deleting the
 * file revokes the image.
 *
 * Client-safe pure helpers; the browser orchestration lives in
 * components/client/feedback/upload-screenshot.ts. Pinned by feedback:check.
 */

export const FEEDBACK_ATTACHMENTS_FOLDER = "Feedback attachments";

/** Under Vercel's 4.5 MB request-body cap, with room for the multipart envelope. */
export const FEEDBACK_IMAGE_MAX_BYTES = 4_000_000;

export const FEEDBACK_IMAGE_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

const EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/**
 * Clipboard screenshots all arrive as "image.png"; give each a distinct,
 * sortable name. A real file name (dropped from disk) is kept, with its
 * extension corrected to the bytes actually sent.
 */
export function screenshotFileName(original: string, mime: string, now: Date): string {
  const ext = EXTENSION[mime] ?? "png";
  const base = original.replace(/\.[A-Za-z0-9]+$/, "").trim();
  if (base && !/^image$/i.test(base)) {
    return `${base.replace(/[^\w .()-]+/g, "-").slice(0, 80)}.${ext}`;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `screenshot-${stamp}.${ext}`;
}

/** `![alt](url)`, with the characters that would break the markdown removed from the alt text. */
export function imageMarkdown(alt: string, url: string): string {
  const safeAlt = alt.replace(/[[\]\n\r]/g, " ").trim() || "screenshot";
  return `![${safeAlt}](${url})`;
}

/** GitHub's placeholder shape; the sequence number keeps concurrent uploads apart. */
export function uploadPlaceholder(seq: number, name: string): string {
  return `![Uploading ${name.replace(/[[\]\n\r]/g, " ")} (#${seq})…]()`;
}

/** Insert `text` over the selection, on its own line(s) like GitHub does. */
export function insertAtSelection(
  value: string,
  start: number,
  end: number,
  text: string,
): { value: string; cursor: number } {
  const before = value.slice(0, start);
  const after = value.slice(end);
  const lead = before && !before.endsWith("\n") ? "\n" : "";
  const trail = after && !after.startsWith("\n") ? "\n" : "";
  const inserted = `${lead}${text}${trail}`;
  return { value: before + inserted + after, cursor: before.length + lead.length + text.length };
}

/** GitHub can't fetch an image from a dev server; the dialog says so. */
export function isLocalOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return (
      host === "localhost" ||
      host.endsWith(".local") ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host === "[::1]"
    );
  } catch {
    return true;
  }
}
