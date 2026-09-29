import {
  BookMarked,
  BookOpen,
  Bookmark,
  Briefcase,
  CalendarCheck,
  CalendarDays,
  FlaskConical,
  Globe,
  LampDesk,
  Layers,
  Library,
  Puzzle,
  ScrollText,
  Users,
  Waypoints,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ReactElement } from "react";

const EXTENSION_ICONS: Record<string, LucideIcon> = {
  BookMarked,
  BookOpen,
  Bookmark,
  Briefcase,
  CalendarCheck,
  CalendarDays,
  FlaskConical,
  Globe,
  LampDesk,
  Layers,
  Library,
  Puzzle,
  ScrollText,
  Users,
  Waypoints,
  Workflow,
  Zap,
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
