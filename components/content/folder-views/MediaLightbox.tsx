/**
 * Media Lightbox Component
 *
 * Full-screen viewer for images and videos with:
 * - Navigation (left/right arrows, keyboard)
 * - Slideshow mode with auto-advance
 * - Click anywhere to close
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Play, Pause } from "lucide-react";

interface MediaItem {
  id: string;
  title: string;
  url: string;
  isVideo: boolean;
}

interface MediaLightboxProps {
  items: MediaItem[];
  initialIndex: number;
  autoStartSlideshow?: boolean;
  onClose: () => void;
}

export function MediaLightbox({ items, initialIndex, autoStartSlideshow = false, onClose }: MediaLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isSlideshow, setIsSlideshow] = useState(autoStartSlideshow);
  const [slideshowInterval, setSlideshowInterval] = useState<NodeJS.Timeout | null>(null);

  const currentItem = items[currentIndex];
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < items.length - 1;

  // Navigation handlers
  const goToPrevious = useCallback(() => {
    if (hasPrevious) {
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex, hasPrevious]);

  const goToNext = useCallback(() => {
    if (hasNext) {
      setCurrentIndex(currentIndex + 1);
    } else if (isSlideshow) {
      // Loop back to start in slideshow mode
      setCurrentIndex(0);
    }
  }, [currentIndex, hasNext, isSlideshow]);

  // Slideshow toggle
  const toggleSlideshow = useCallback(() => {
    setIsSlideshow(!isSlideshow);
  }, [isSlideshow]);

  // Stop slideshow on any interaction
  const stopSlideshow = useCallback(() => {
    if (isSlideshow) {
      setIsSlideshow(false);
    }
  }, [isSlideshow]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        stopSlideshow();
        goToPrevious();
      } else if (e.key === "ArrowRight") {
        stopSlideshow();
        goToNext();
      } else if (e.key === " ") {
        e.preventDefault();
        toggleSlideshow();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToPrevious, goToNext, toggleSlideshow, stopSlideshow, onClose]);

  // Slideshow auto-advance
  useEffect(() => {
    if (isSlideshow) {
      const interval = setInterval(() => {
        goToNext();
      }, 3000); // 3 seconds per slide
      setSlideshowInterval(interval);
      return () => clearInterval(interval);
    } else if (slideshowInterval) {
      clearInterval(slideshowInterval);
      setSlideshowInterval(null);
    }
  }, [isSlideshow, goToNext]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (slideshowInterval) {
        clearInterval(slideshowInterval);
      }
    };
  }, [slideshowInterval]);

  const handleBackdropClick = () => {
    stopSlideshow();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onClick={handleBackdropClick}
    >
      {/* Close button */}
      <button
        onClick={() => {
          stopSlideshow();
          onClose();
        }}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
        aria-label="Close"
      >
        <X className="h-6 w-6" />
      </button>

      {/* Slideshow toggle */}
      <button
        onClick={toggleSlideshow}
        className="absolute top-4 left-4 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
        aria-label={isSlideshow ? "Pause slideshow" : "Start slideshow"}
      >
        {isSlideshow ? (
          <Pause className="h-6 w-6" />
        ) : (
          <Play className="h-6 w-6" />
        )}
      </button>

      {/* Previous button */}
      {hasPrevious && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            stopSlideshow();
            goToPrevious();
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
          aria-label="Previous"
        >
          <ChevronLeft className="h-8 w-8" />
        </button>
      )}

      {/* Next button */}
      {hasNext && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            stopSlideshow();
            goToNext();
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
          aria-label="Next"
        >
          <ChevronRight className="h-8 w-8" />
        </button>
      )}

      {/* Media content */}
      <div className="max-w-7xl max-h-full w-full h-full flex items-center justify-center p-12">
        {currentItem.isVideo ? (
          <video
            key={currentItem.id}
            src={currentItem.url}
            controls
            autoPlay
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()} // Keep video controls working
          />
        ) : (
          <img
            key={currentItem.id}
            src={currentItem.url}
            alt={currentItem.title}
            className="max-w-full max-h-full object-contain cursor-pointer"
            // No stopPropagation - clicking image closes lightbox
          />
        )}
      </div>

      {/* Image info */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
        <p className="text-white text-center text-lg font-medium">
          {currentItem.title}
        </p>
        <p className="text-white/60 text-center text-sm mt-1">
          {currentIndex + 1} / {items.length}
        </p>
      </div>
    </div>
  );
}
