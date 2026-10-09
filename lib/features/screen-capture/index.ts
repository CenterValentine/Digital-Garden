/**
 * view_screen — the client executor. AI-VIEW-SCREEN-PLAN.md.
 *
 * Pipeline: capture (the surface decides what) → fit the longest edge to
 * MAX_EDGE_PX and encode JPEG → upload (`purpose=screenshot`: own prefix, no
 * tree node, D7) → a result carrying the image's URL. The model receives the
 * image on the next request (screen-delivery.ts). Never throws: every outcome
 * is a result the model can act on.
 *
 *   side panel  → the web page in the active tab, via the extension (D3)
 *   the app     → the app itself, rasterized in the page (D4)
 */
import { captureVisibleTabImage, isPanelEmbedSurface } from "@/lib/domain/browser-extension/panel-bridge";
import type { ViewScreenInput, ViewScreenResult } from "@/lib/domain/ai/tools/view-screen";

import { captureApp, MAX_EDGE_PX } from "./capture-app";

const JPEG_QUALITY = 0.8;

/** Can this document run the in-app executor? (The `appCaptureAvailable` body flag.) */
export function isAppCaptureSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined" &&
    !isPanelEmbedSurface() &&
    typeof HTMLCanvasElement !== "undefined"
  );
}

async function imageToCanvas(dataUrl: string): Promise<HTMLCanvasElement> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext("2d")!.drawImage(image, 0, 0);
  return canvas;
}

/** Fit the longest edge to MAX_EDGE_PX (never upscale) and encode as JPEG. */
async function encodeForModel(source: HTMLCanvasElement): Promise<{ blob: Blob; width: number; height: number }> {
  const factor = Math.min(1, MAX_EDGE_PX / Math.max(source.width, source.height, 1));
  const width = Math.max(1, Math.round(source.width * factor));
  const height = Math.max(1, Math.round(source.height * factor));
  let canvas = source;
  if (factor < 1) {
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, width, height);
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error("the screenshot could not be encoded");
  return { blob, width, height };
}

async function upload(blob: Blob): Promise<{ url: string; mediaType: string }> {
  const form = new FormData();
  form.append("file", new File([blob], `screen-${Date.now()}.jpg`, { type: "image/jpeg" }));
  form.append("purpose", "screenshot");
  const res = await fetch("/api/ai/attachments/upload", { method: "POST", credentials: "include", body: form });
  const body = (await res.json().catch(() => ({}))) as { url?: string; mediaType?: string; error?: string };
  if (!res.ok || !body.url) throw new Error(body.error || `upload failed (${res.status})`);
  return { url: body.url, mediaType: body.mediaType || "image/jpeg" };
}

export async function viewScreenForModel(input: ViewScreenInput): Promise<ViewScreenResult> {
  try {
    if (isPanelEmbedSurface()) {
      const shot = await captureVisibleTabImage();
      if (!shot.ok || !shot.dataUrl) {
        return { ok: false, error: shot.error ?? "couldn't capture the page" };
      }
      const encoded = await encodeForModel(await imageToCanvas(shot.dataUrl));
      const stored = await upload(encoded.blob);
      return {
        ok: true,
        via: "active-tab",
        url: shot.url,
        title: shot.title,
        imageUrl: stored.url,
        mediaType: stored.mediaType,
        width: encoded.width,
        height: encoded.height,
      };
    }
    if (!isAppCaptureSupported()) {
      return { ok: false, error: "nothing on this surface can take a screenshot" };
    }
    const shot = await captureApp(input.area ?? "content");
    const encoded = await encodeForModel(shot.canvas);
    const stored = await upload(encoded.blob);
    return {
      ok: true,
      via: shot.area === "window" ? "app-window" : "app-content",
      title: shot.title,
      imageUrl: stored.url,
      mediaType: stored.mediaType,
      width: encoded.width,
      height: encoded.height,
      ...(shot.notes.length ? { notes: shot.notes } : {}),
    };
  } catch (err) {
    return { ok: false, error: `the screenshot failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
