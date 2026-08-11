import {
  ExternalLink,
  File,
  FileCode,
  FileText,
  Folder,
  MessageCircle,
  MessagesSquare,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Canonical content-type → icon mapping for workspace tabs.
 *
 * This is the single source of truth: the tab strip and the workspace
 * tab-filter affordances both render from it, so changing an icon here
 * changes it everywhere at once.
 */
export function getTabIcon(contentType: string | null): LucideIcon {
  switch (contentType) {
    case "note":
    case "page-template":
      return FileText;
    case "folder":
      return Folder;
    case "code":
    case "html":
      return FileCode;
    case "external":
      return ExternalLink;
    case "chat":
      return MessageCircle;
    case "dm-thread":
      return MessagesSquare;
    default:
      return File;
  }
}

/**
 * Stable key for the icon a content type renders with. Content types that
 * share an icon (note/page-template, code/html) share a key, so the filter
 * bar shows one affordance per visually distinct icon — grouping follows
 * the mapping above automatically if it ever changes.
 */
export function getTabIconGroupKey(contentType: string | null): string {
  return getTabIcon(contentType).displayName ?? "file";
}
