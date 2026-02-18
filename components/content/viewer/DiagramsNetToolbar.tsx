/**
 * Diagrams.net Toolbar Component
 *
 * Features:
 * - Theme selector (4 themes: kennedy, atlas, dark, minimal)
 * - Export dropdown (PNG, SVG, PDF, XML)
 * - Full view button (opens new browser tab)
 * - Collaboration button (disabled stub)
 * - Auto-save indicator
 */

"use client";

import { Download, ExternalLink, Users, Palette } from "lucide-react";
import { Button } from "@/components/ui/glass/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/client/ui/dropdown-menu";
import type { DiagramsNetTheme } from "@/lib/domain/visualization/types";

interface DiagramsNetToolbarProps {
  theme: DiagramsNetTheme;
  onThemeChange: (theme: DiagramsNetTheme) => void;
  onExport: (format: "png" | "svg" | "pdf" | "xml") => void;
  onFullView: () => void;
  isModified: boolean;
  isSaving: boolean;
  collaborators: Array<{ userId: string; name: string; color: string }>;
  onStartCollaboration: () => void;
}

// Theme labels for display
const THEME_LABELS: Record<DiagramsNetTheme, string> = {
  kennedy: "Kennedy (Default)",
  atlas: "Atlas",
  dark: "Dark",
  minimal: "Minimal",
};

export function DiagramsNetToolbar({
  theme,
  onThemeChange,
  onExport,
  onFullView,
  isModified,
  isSaving,
  collaborators,
  onStartCollaboration,
}: DiagramsNetToolbarProps) {
  return (
    <div className="flex items-center justify-between border-t px-4 py-3 bg-gray-50">
      <div className="flex items-center gap-2">
        {/* Theme Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="flex items-center gap-2 px-3">
              <Palette className="h-4 w-4" />
              <span className="hidden sm:inline">Theme:</span>
              <span className="font-medium capitalize">{theme}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {(Object.keys(THEME_LABELS) as DiagramsNetTheme[]).map((t) => (
              <DropdownMenuItem
                key={t}
                onClick={() => onThemeChange(t)}
                className={theme === t ? "bg-primary/10" : ""}
              >
                {THEME_LABELS[t]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Auto-save status (text) */}
        <span className="text-xs text-gray-500 hidden md:inline">
          {isSaving && "Saving..."}
          {!isSaving && isModified && "Unsaved changes"}
          {!isSaving && !isModified && "All changes saved"}
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
            <DropdownMenuItem onClick={() => onExport("pdf")}>
              <span className="mr-2">📄</span>
              Export as PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport("xml")}>
              <span className="mr-2">💾</span>
              Export as XML (Backup)
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
          {collaborators.length > 0 && (
            <span className="ml-1 text-xs">({collaborators.length})</span>
          )}
        </Button>
      </div>
    </div>
  );
}
