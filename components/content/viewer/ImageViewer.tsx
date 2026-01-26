/**
 * Enhanced Image Viewer
 *
 * Features:
 * - Zoom in/out with mouse wheel and buttons
 * - Pan with click-and-drag
 * - Fullscreen mode
 * - Rotate image (90° increments)
 * - Fit-to-screen and actual size modes
 * - Keyboard shortcuts
 */

"use client";

import { useState, useRef, useEffect } from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize,
  Minimize,
  RotateCw,
  Download,
  Maximize2,
} from "lucide-react";
import { Button } from "@/components/ui/glass/button";
import { toast } from "sonner";

interface ImageViewerProps {
  downloadUrl: string;
  fileName: string;
  title: string;
  onDownload: () => void;
}

export function ImageViewer({ downloadUrl, fileName, title, onDownload }: ImageViewerProps) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fitMode, setFitMode] = useState<"fit" | "actual">("fit");

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Zoom functions
  const zoomIn = () => {
    setScale((prev) => Math.min(prev + 0.25, 5));
    setFitMode("actual");
  };

  const zoomOut = () => {
    setScale((prev) => Math.max(prev - 0.25, 0.25));
    setFitMode("actual");
  };

  const resetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
    setFitMode("fit");
  };

  const actualSize = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setFitMode("actual");
  };

  // Rotation
  const rotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      zoomIn();
    } else {
      zoomOut();
    }
  };

  // Drag to pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1 && fitMode === "fit") return; // Don't allow drag if image fits
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts when this viewer is visible
      if (!containerRef.current) return;

      switch (e.key) {
        case "+":
        case "=":
          e.preventDefault();
          zoomIn();
          break;
        case "-":
          e.preventDefault();
          zoomOut();
          break;
        case "0":
          e.preventDefault();
          resetZoom();
          break;
        case "1":
          e.preventDefault();
          actualSize();
          break;
        case "r":
        case "R":
          e.preventDefault();
          rotate();
          break;
        case "f":
        case "F":
          e.preventDefault();
          toggleFullscreen();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [scale, rotation]);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  return (
    <div ref={containerRef} className="h-full flex flex-col bg-black/20">
      {/* Toolbar */}
      <div className="flex-none p-3 border-b border-white/10 bg-black/40 backdrop-blur-sm flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <Button onClick={zoomOut} variant="glass" size="sm" disabled={scale <= 0.25}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm text-gray-300 min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button onClick={zoomIn} variant="glass" size="sm" disabled={scale >= 5}>
            <ZoomIn className="h-4 w-4" />
          </Button>

          <div className="h-6 w-px bg-white/10 mx-1" />

          {/* Fit/Actual size */}
          <Button
            onClick={resetZoom}
            variant="glass"
            size="sm"
            title="Fit to screen (0)"
          >
            <Minimize className="h-4 w-4" />
          </Button>
          <Button
            onClick={actualSize}
            variant="glass"
            size="sm"
            title="Actual size (1)"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>

          <div className="h-6 w-px bg-white/10 mx-1" />

          {/* Rotate */}
          <Button onClick={rotate} variant="glass" size="sm" title="Rotate 90° (R)">
            <RotateCw className="h-4 w-4" />
          </Button>

          {/* Fullscreen */}
          <Button
            onClick={toggleFullscreen}
            variant="glass"
            size="sm"
            title="Fullscreen (F)"
          >
            {isFullscreen ? (
              <Minimize className="h-4 w-4" />
            ) : (
              <Maximize className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {/* Download */}
          <Button onClick={onDownload} variant="glass" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
      </div>

      {/* Image container */}
      <div
        className="flex-1 overflow-hidden flex items-center justify-center relative"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isDragging ? "grabbing" : scale > 1 || fitMode === "actual" ? "grab" : "default" }}
      >
        <img
          ref={imageRef}
          src={downloadUrl}
          alt={title}
          className="max-w-full max-h-full object-contain select-none transition-transform duration-200"
          style={{
            transform: `scale(${fitMode === "fit" ? 1 : scale}) rotate(${rotation}deg) translate(${position.x}px, ${position.y}px)`,
            transformOrigin: "center",
          }}
          draggable={false}
        />
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="flex-none p-2 border-t border-white/10 bg-black/40 backdrop-blur-sm">
        <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
          <span>+/- Zoom</span>
          <span>0 Fit</span>
          <span>1 Actual</span>
          <span>R Rotate</span>
          <span>F Fullscreen</span>
          <span>Drag to Pan</span>
          <span>Wheel to Zoom</span>
        </div>
      </div>
    </div>
  );
}
