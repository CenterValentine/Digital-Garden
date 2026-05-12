"use client";

import { useEffect } from "react";

/**
 * Prewarm target for the browser extension iframe.
 * No auth needed — this page exists solely to cache Next.js chunks and
 * establish a warm connection to the app server before the user clicks "Edit".
 * Posts {type:"prewarm-ready"} so the overlay knows the iframe is warm.
 */
export default function EmbedBlankPage() {
  useEffect(() => {
    window.parent.postMessage({ type: "prewarm-ready" }, "*");
  }, []);

  return null;
}
