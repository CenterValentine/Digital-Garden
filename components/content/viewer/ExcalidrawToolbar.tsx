/**
 * Excalidraw Toolbar Component
 *
 * Features:
 * - Export dropdown (PNG, SVG, JSON)
 * - Full view button (opens new browser tab)
 * - Collaboration button (disabled stub)
 * - Auto-save indicator
 * - Element count display
 */

"use client";

import { Download, ExternalLink, Users } from "lucide-react";
import { Button } from "@/components/ui/glass/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/client/ui/dropdown-menu";

interface ExcalidrawToolbarProps {
  elementCount: number;
  onExport: (format: "png" | "svg" | "json") => void;
  onFullView: () => void;
  onStartCollaboration: () => void;
  isModified: boolean;
  isSaving: boolean;
}

export function ExcalidrawToolbar({
  elementCount,
  onExport,
  onFullView,
  onStartCollaboration,
  isModified,
  isSaving,
}: ExcalidrawToolbarProps) {
  return (
    <div className="flex items-center justify-between border-t px-4 py-3 bg-gray-50">
      <div className="flex items-center gap-2">
        {/* Element count */}
        <span className="text-sm text-gray-600">
          {elementCount} element{elementCount !== 1 ? "s" : ""}
        </span>

        {/* Auto-save status (text) */}
        <span className="text-xs text-gray-500 hidden md:inline">
          {isSaving && "• Saving..."}
          {!isSaving && isModified && "• Unsaved changes"}
          {!isSaving && !isModified && "• All changes saved"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* Export Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <Download className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onExport("png")}>
              <span className="mr-2">🖼️</span>
              Export as PNG
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport("svg")}>
              <span className="mr-2">🎨</span>
              Export as SVG
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport("json")}>
              <span className="mr-2">💾</span>
              Export as JSON (Backup)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Full View Button */}
        <Button onClick={onFullView} variant="ghost" size="sm" type="button">
          <ExternalLink className="h-4 w-4 mr-2" />
          <span className="hidden sm:inline">Full View</span>
        </Button>

        {/* Collaboration Button (disabled stub) */}
        <Button
          onClick={onStartCollaboration}
          disabled
          variant="ghost"
          size="sm"
          title="Real-time collaboration coming soon"
        >
          <Users className="h-4 w-4 mr-2" />
          <span className="hidden sm:inline">Collaborate</span>
        </Button>
      </div>
    </div>
  );
}
