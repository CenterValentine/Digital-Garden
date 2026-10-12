/**
 * Browser half of feedback screenshots: shrink if needed, upload into the
 * user's "Feedback attachments" folder through the ordinary upload route,
 * then mint the public `/f/<token>` link (#227) that the issue embeds.
 * Every step reuses an existing route; only the folder lookup is new.
 */

"use client";

import {
  FEEDBACK_IMAGE_MAX_BYTES,
  FEEDBACK_IMAGE_TYPES,
  screenshotFileName,
} from "@/lib/domain/feedback/attachments";

export interface UploadedScreenshot {
  name: string;
  url: string;
}

let folderIdPromise: Promise<string> | null = null;

async function attachmentsFolderId(): Promise<string> {
  // One lookup per page session; a failure clears it so the next paste retries.
  folderIdPromise ??= fetch("/api/feedback/attachments-folder", {
    method: "POST",
    credentials: "include",
  })
    .then((r) => r.json())
    .then((json: { success?: boolean; data?: { folderId?: string }; error?: { message?: string } }) => {
      if (!json.success || !json.data?.folderId) {
        throw new Error(json.error?.message ?? "Couldn't prepare the attachments folder.");
      }
      return json.data.folderId;
    })
    .catch((error: unknown) => {
      folderIdPromise = null;
      throw error;
    });
  return folderIdPromise;
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Re-encode an over-size image until it fits the upload cap: WebP where the
 * browser can encode it (Safari falls back to JPEG), scaling down 25% a step.
 */
async function fitUnderCap(file: File): Promise<Blob> {
  if (file.size <= FEEDBACK_IMAGE_MAX_BYTES) return file;
  const bitmap = await createImageBitmap(file);
  let scale = 1;
  for (let step = 0; step < 6; step++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let blob = await canvasBlob(canvas, "image/webp", 0.85);
    if (!blob || blob.type !== "image/webp") blob = await canvasBlob(canvas, "image/jpeg", 0.85);
    if (blob && blob.size <= FEEDBACK_IMAGE_MAX_BYTES) return blob;
    scale *= 0.75;
  }
  throw new Error("The image is too large even after shrinking. Attach it on GitHub after filing.");
}

export async function uploadFeedbackScreenshot(file: File): Promise<UploadedScreenshot> {
  if (!FEEDBACK_IMAGE_TYPES.has(file.type)) {
    throw new Error("Only PNG, JPEG, GIF and WebP images can be attached.");
  }
  const blob = await fitUnderCap(file);
  const name = screenshotFileName(file.name, blob.type || file.type, new Date());
  const folderId = await attachmentsFolderId();

  const form = new FormData();
  form.append("file", new File([blob], name, { type: blob.type || file.type }));
  form.append("parentId", folderId);
  const uploadRes = await fetch("/api/content/content/upload/simple", {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const upload = (await uploadRes.json().catch(() => ({}))) as {
    success?: boolean;
    data?: { contentId?: string; fileName?: string };
    error?: { message?: string };
  };
  const contentId = upload.data?.contentId;
  if (!uploadRes.ok || !upload.success || !contentId) {
    throw new Error(upload.error?.message ?? `Upload failed (${uploadRes.status}).`);
  }

  const linkRes = await fetch("/api/content/share-links", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentIds: [contentId] }),
  });
  const link = (await linkRes.json().catch(() => ({}))) as {
    data?: { links?: Record<string, string> };
  };
  const path = link.data?.links?.[contentId];
  if (!linkRes.ok || !path) throw new Error("Uploaded, but couldn't create a public link.");

  return { name: upload.data?.fileName ?? name, url: `${window.location.origin}${path}` };
}
