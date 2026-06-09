/**
 * Global host for the image preview lightbox. Mounted once; renders the
 * shared MediaLightbox whenever `useImagePreviewStore` is open. Lets any
 * clickable image open a preview without mounting its own lightbox.
 */

"use client";

import { MediaLightbox } from "./MediaLightbox";
import { useImagePreviewStore } from "@/state/image-preview-store";

export function ImagePreviewHost() {
  const isOpen = useImagePreviewStore((s) => s.isOpen);
  const items = useImagePreviewStore((s) => s.items);
  const index = useImagePreviewStore((s) => s.index);
  const close = useImagePreviewStore((s) => s.close);
  const setIndex = useImagePreviewStore((s) => s.setIndex);

  if (!isOpen || items.length === 0) return null;

  return (
    <MediaLightbox
      items={items}
      activeIndex={index}
      onClose={close}
      onNavigate={setIndex}
    />
  );
}
