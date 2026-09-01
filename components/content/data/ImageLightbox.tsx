"use client";

/**
 * Minimal image lightbox for Images columns — the click-to-zoom half of
 * the thumbnail contract. Portaled to <body> above every panel (z-[140]);
 * click anywhere or Escape closes. The full-size image streams through
 * the authed download route; the hydrated thumbnail is only the preview.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function imageDownloadUrl(contentId: string, version?: number): string {
  // ?stream=true is load-bearing: the route's DEFAULT response is a JSON
  // presigned-URL envelope (what FileViewer fetches client-side); only the
  // stream mode returns bytes with an inline disposition an <img> can eat.
  // Served with Cache-Control: private, max-age=3600 — `version` busts that
  // hour after an in-place overwrite, else the OLD image survives its own
  // replacement in every open view.
  return `/api/content/content/${contentId}/download?stream=true${
    version ? `&v=${version}` : ""
  }`;
}

export function ImageLightbox({
  contentId,
  title,
  version,
  onClose,
}: {
  contentId: string;
  title: string;
  /** Cache-bust token after an in-place overwrite. */
  version?: number;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    // Capture phase so the grid's own Escape handling (cell selection)
    // doesn't also fire underneath the lightbox.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/80 p-6"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white/80 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary-size user upload streamed from the authed download route; next/image adds nothing here */}
      <img
        src={imageDownloadUrl(contentId, version)}
        alt={title}
        className="max-h-[90vh] max-w-[90vw] rounded-md object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded bg-black/50 px-2 py-1 text-xs text-white/90">
        {title}
      </p>
    </div>,
    document.body
  );
}
