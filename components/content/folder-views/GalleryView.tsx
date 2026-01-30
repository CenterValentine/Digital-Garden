/**
 * Gallery View
 *
 * Media-focused grid view for images and videos.
 * Filters to show only media files from folder contents.
 * M9 Phase 2: FolderPayload support
 */

"use client";

import { useState, useEffect } from "react";
import { Image as ImageIcon, Video, FileImage, Play } from "lucide-react";
import { toast } from "sonner";
import { getSurfaceStyles } from "@/lib/design/system";
import type { FolderViewProps } from "./FolderViewContainer";
import { MediaLightbox } from "./MediaLightbox";
import { Button } from "@/components/ui/glass/button";
import { getDisplayExtension } from "@/lib/domain/content/file-extension-utils";

interface ContentChild {
  id: string;
  title: string;
  contentType: string;
  displayOrder: number;
  file?: {
    mimeType: string;
    url?: string | null;
    thumbnailUrl?: string | null;
  };
}

export function GalleryView({
  folderId,
  folderTitle,
  sortMode,
  viewPrefs = {},
}: FolderViewProps) {
  const glass0 = getSurfaceStyles("glass-0");
  const [mediaItems, setMediaItems] = useState<ContentChild[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [startSlideshow, setStartSlideshow] = useState(false);
  const [downloadUrls, setDownloadUrls] = useState<Record<string, string>>({});

  // Gallery view preferences
  const gridSize = viewPrefs.gridSize || "medium"; // "small" | "medium" | "large"
  const showTitles = viewPrefs.showTitles !== false; // Default: true

  useEffect(() => {
    loadMediaItems();
  }, [folderId, sortMode]);

  // Fetch download URLs in batches for performance
  const fetchDownloadUrls = async (items: ContentChild[]) => {
    const BATCH_SIZE = 20; // Fetch 20 URLs at a time

    // Process items in batches to avoid overwhelming the server
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      const batchUrls: Record<string, string> = {};

      await Promise.all(
        batch.map(async (item) => {
          try {
            const response = await fetch(`/api/content/content/${item.id}/download`);
            if (response.ok) {
              const result = await response.json();
              batchUrls[item.id] = result.data.url;
            }
          } catch (error) {
            console.error(`[GalleryView] Failed to fetch URL for ${item.id}:`, error);
          }
        })
      );

      // Update state after each batch for progressive loading
      setDownloadUrls((prev) => ({ ...prev, ...batchUrls }));
    }
  };

  const loadMediaItems = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/content/content?parentId=${folderId}&type=file`
      );

      if (!response.ok) {
        throw new Error("Failed to load folder contents");
      }

      const data = await response.json();
      let items = data.data?.items || data.items || [];

      // Filter for media files only (images and videos)
      items = items.filter((item: ContentChild) => {
        if (item.contentType !== "file" || !item.file) return false;
        const mimeType = item.file.mimeType.toLowerCase();
        return mimeType.startsWith("image/") || mimeType.startsWith("video/");
      });

      // Apply sorting
      if (sortMode === "asc") {
        items = items.sort((a: ContentChild, b: ContentChild) =>
          a.title.localeCompare(b.title)
        );
      } else if (sortMode === "desc") {
        items = items.sort((a: ContentChild, b: ContentChild) =>
          b.title.localeCompare(a.title)
        );
      } else {
        // null = manual order via displayOrder
        items = items.sort((a: ContentChild, b: ContentChild) =>
          a.displayOrder - b.displayOrder
        );
      }

      setMediaItems(items);

      // Fetch download URLs for all items
      if (items.length > 0) {
        fetchDownloadUrls(items);
      }
    } catch (error) {
      console.error("[GalleryView] Error loading media items:", error);
      toast.error("Failed to load media items");
    } finally {
      setLoading(false);
    }
  };

  const handleItemClick = (index: number) => {
    setLightboxIndex(index);
    setStartSlideshow(false); // User clicked specific image, don't auto-start
  };

  const startSlideshowMode = () => {
    if (mediaItems.length === 0) {
      toast.error("No media files to show");
      return;
    }
    setLightboxIndex(0); // Start with first image
    setStartSlideshow(true); // Auto-start slideshow
  };

  const getGridClass = () => {
    switch (gridSize) {
      case "small":
        return "grid-cols-6";
      case "large":
        return "grid-cols-2";
      case "medium":
      default:
        return "grid-cols-4";
    }
  };

  const getAspectClass = () => {
    return "aspect-square"; // Square thumbnails for gallery view
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-gray-600">Loading gallery...</div>
      </div>
    );
  }

  if (mediaItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <ImageIcon className="h-16 w-16 text-gray-400 mb-4" />
        <p className="text-sm text-gray-600 mb-2">No media files in this folder</p>
        <p className="text-xs text-gray-500">
          Upload images or videos to see them in gallery view
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Gallery Header with Slideshow Button */}
      <div className="flex-none px-6 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="text-sm text-gray-400">
          {mediaItems.length} {mediaItems.length === 1 ? "item" : "items"}
        </div>
        <Button
          onClick={startSlideshowMode}
          variant="glass"
          size="sm"
          disabled={mediaItems.length === 0}
        >
          <Play className="h-4 w-4 mr-2" />
          Start Slideshow
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className={`grid ${getGridClass()} gap-4`}>
          {mediaItems.map((item, index) => {
            const isVideo = item.file?.mimeType.startsWith("video/");
            const thumbnailUrl = item.file?.thumbnailUrl || downloadUrls[item.id];
            const displayExtension = getDisplayExtension(item);

            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(index)}
                className="group relative rounded-lg border border-white/10 overflow-hidden hover:ring-2 hover:ring-primary/50 transition-all"
                style={{
                  background: glass0.background,
                  backdropFilter: glass0.backdropFilter,
                }}
              >
              {/* Media preview */}
              <div className={`${getAspectClass()} bg-black/5 relative`}>
                {thumbnailUrl ? (
                  <>
                    <img
                      src={thumbnailUrl}
                      alt={item.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                    {isVideo && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <Video className="h-12 w-12 text-white/80" />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {/* Loading skeleton with subtle pulse */}
                    <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 animate-pulse" />
                    <FileImage className="h-12 w-12 text-gray-400 relative z-10" />
                  </div>
                )}
              </div>

              {/* Title overlay */}
              {showTitles && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                  <p className="text-xs font-medium text-white truncate">
                    {item.title}
                    {displayExtension && (
                      <span className="text-white/80">{displayExtension}</span>
                    )}
                  </p>
                </div>
              )}
            </button>
          );
        })}
        </div>
      </div>

      {/* Media Lightbox */}
      {lightboxIndex !== null && (
        <MediaLightbox
          items={mediaItems
            .filter((item) => downloadUrls[item.id]) // Only items with download URLs
            .map((item) => ({
              id: item.id,
              title: item.title,
              url: downloadUrls[item.id],
              isVideo: item.file!.mimeType.startsWith("video/"),
            }))}
          initialIndex={lightboxIndex}
          autoStartSlideshow={startSlideshow}
          onClose={() => {
            setLightboxIndex(null);
            setStartSlideshow(false);
          }}
        />
      )}
    </>
  );
}
