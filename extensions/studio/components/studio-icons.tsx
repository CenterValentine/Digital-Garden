/**
 * Icon resolution for studio tool tiles.
 *
 * Explicit imports (not `import * as lucide`) so tree-shaking keeps only the
 * icons the registry actually names — mirrors lib/extensions/icons.tsx.
 * Client components may use lucide-react per project convention.
 */

"use client";

import {
  AudioLines,
  BookMarked,
  CalendarClock,
  Columns2,
  FileText,
  GraduationCap,
  Image as ImageIcon,
  Layers,
  ListChecks,
  ListTree,
  Mic,
  Network,
  Presentation,
  Sparkles,
  Video,
  type LucideIcon,
} from "lucide-react";

const STUDIO_TOOL_ICONS: Record<string, LucideIcon> = {
  AudioLines,
  BookMarked,
  CalendarClock,
  Columns2,
  FileText,
  GraduationCap,
  Image: ImageIcon,
  Layers,
  ListChecks,
  ListTree,
  Mic,
  Network,
  Presentation,
  Sparkles,
  Video,
};

/** Resolve a registry `iconName` to a component; Sparkles is the fallback. */
export function getStudioToolIcon(iconName: string): LucideIcon {
  return STUDIO_TOOL_ICONS[iconName] ?? Sparkles;
}
