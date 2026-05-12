"use client";

import { useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, ZoomIn, Download } from "lucide-react";
import { cn } from "@/lib/core/utils";

export interface LightboxItem {
  src: string;
  alt?: string;
  caption?: string;
  credit?: string;
  downloadUrl?: string;
}

interface MediaLightboxProps {
  items: LightboxItem[];
  activeIndex: number;
  onClose: () => void;
  onNavigate?: (index: number) => void;
}

export function MediaLightbox({
  items,
  activeIndex,
  onClose,
  onNavigate,
}: MediaLightboxProps) {
  const item = items[activeIndex];
  const hasPrev = activeIndex > 0;
  const hasNext = activeIndex < items.length - 1;

  const handlePrev = useCallback(() => {
    if (hasPrev && onNavigate) onNavigate(activeIndex - 1);
  }, [hasPrev, onNavigate, activeIndex]);

  const handleNext = useCallback(() => {
    if (hasNext && onNavigate) onNavigate(activeIndex + 1);
  }, [hasNext, onNavigate, activeIndex]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, handlePrev, handleNext]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Dismiss button */}
      <button
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        onClick={onClose}
        aria-label="Close lightbox"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Prev/next */}
      {hasPrev && (
        <button
          className="absolute left-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          onClick={(e) => { e.stopPropagation(); handlePrev(); }}
          aria-label="Previous"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}
      {hasNext && (
        <button
          className="absolute right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          onClick={(e) => { e.stopPropagation(); handleNext(); }}
          aria-label="Next"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Image */}
      <div
        className="relative max-w-[90vw] max-h-[80vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.src}
          alt={item.alt ?? ""}
          className="max-w-full max-h-[80vh] object-contain rounded-md shadow-2xl"
          draggable={false}
        />
      </div>

      {/* Caption / credit / actions */}
      {(item.caption || item.credit || item.downloadUrl) && (
        <div
          className="absolute bottom-0 left-0 right-0 px-6 py-4 bg-gradient-to-t from-black/70 to-transparent flex items-end justify-between gap-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col gap-0.5">
            {item.caption && (
              <span className="text-white/90 text-sm">{item.caption}</span>
            )}
            {item.credit && (
              <span className="text-white/50 text-xs">{item.credit}</span>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            {item.downloadUrl && (
              <a
                href={item.downloadUrl}
                download
                className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                aria-label="Download"
              >
                <Download className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* Counter */}
      {items.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-1.5">
          {items.map((_, i) => (
            <button
              key={i}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-colors",
                i === activeIndex ? "bg-white" : "bg-white/30"
              )}
              onClick={(e) => { e.stopPropagation(); onNavigate?.(i); }}
              aria-label={`Go to item ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
