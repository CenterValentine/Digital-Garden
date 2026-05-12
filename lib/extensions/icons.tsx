import {
  Bookmark,
  Briefcase,
  CalendarCheck,
  CalendarDays,
  Layers,
  Puzzle,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ReactElement } from "react";

const EXTENSION_ICONS: Record<string, LucideIcon> = {
  Bookmark,
  Briefcase,
  CalendarCheck,
  CalendarDays,
  Layers,
  Puzzle,
  Users,
};

export function getExtensionIcon(iconName: string): LucideIcon {
  return EXTENSION_ICONS[iconName] ?? Puzzle;
}

export function renderExtensionIcon(
  iconName: string,
  className: string
): ReactElement {
  const Icon = getExtensionIcon(iconName);
  return <Icon className={className} />;
}
