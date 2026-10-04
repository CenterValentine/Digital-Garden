import type { LucideIcon } from "lucide-react";
import type { WorkspaceTabState } from "@/state/content-store";
import {
  getTabIcon,
  getTabIconGroupKey,
} from "@/components/content/headers/tab-icons";

/**
 * Target math for the clear-tabs menu — pure, so the component stays a
 * rendering concern and each rule is readable on its own.
 *
 * Every target carries the tab ids it would close and the count is derived
 * from that same list, so a row can never advertise a number it won't act on.
 * Empty targets are dropped by the builders rather than rendered disabled:
 * the menu is a set of offers, and an offer that does nothing isn't one.
 */

export interface ClearTarget {
  key: string;
  /** Compact chip text ("3h", "1d") or row label ("Others"). */
  label: string;
  /** Full sentence for the tooltip / aria-label. */
  description: string;
  tabIds: string[];
}

export interface TypeClearTarget extends ClearTarget {
  icon: LucideIcon;
}

/** Ascending, so each bucket is a subset of the one before it. */
const IDLE_BUCKET_HOURS = [1, 3, 8, 24, 48] as const;

const HOUR_MS = 60 * 60 * 1000;

function formatBucket(hours: number): string {
  return hours >= 24 ? `${hours / 24}d` : `${hours}h`;
}

function pluralizeTabs(count: number): string {
  return count === 1 ? "1 tab" : `${count} tabs`;
}

/**
 * Idle buckets: tabs untouched for at least N hours.
 *
 * Two rules keep the row short (the whole point of a chip row rather than a
 * submenu). Buckets with nothing in them are dropped, and a bucket whose
 * membership is identical to the previous one is dropped too — "8h" and "1d"
 * offering the same five tabs is one choice wearing two labels. What survives
 * is the set of thresholds that actually decide something, typically two or
 * three chips.
 *
 * Tabs with no activity signal at all sit out entirely; see
 * `resolveLastTouchedAt`.
 */
export function buildIdleTargets(
  tabs: WorkspaceTabState[],
  lastTouchedAt: (contentId: string) => number | null,
  now: number
): ClearTarget[] {
  const targets: ClearTarget[] = [];
  let previousCount: number | null = null;

  for (const hours of IDLE_BUCKET_HOURS) {
    const cutoff = now - hours * HOUR_MS;
    const tabIds = tabs
      .filter((tab) => {
        const touchedAt = lastTouchedAt(tab.contentId);
        return touchedAt !== null && touchedAt <= cutoff;
      })
      .map((tab) => tab.id);

    if (tabIds.length === 0) continue;
    if (tabIds.length === previousCount) continue;
    previousCount = tabIds.length;

    const label = formatBucket(hours);
    targets.push({
      key: `idle:${hours}`,
      label,
      description: `Close ${pluralizeTabs(tabIds.length)} untouched for ${label} or longer`,
      tabIds,
    });
  }

  return targets;
}

/**
 * One target per tab-icon group, mirroring the filter chips that sit beside
 * this control — same grouping key, same icons, so "the notes" means the same
 * thing in both places. Rendered only when more than one type is open; a
 * single-type strip already has "All tabs".
 */
export function buildTypeTargets(tabs: WorkspaceTabState[]): TypeClearTarget[] {
  const byKey = new Map<
    string,
    { icon: LucideIcon; types: Set<string>; tabIds: string[] }
  >();

  for (const tab of tabs) {
    const key = getTabIconGroupKey(tab.contentType);
    let group = byKey.get(key);
    if (!group) {
      group = { icon: getTabIcon(tab.contentType), types: new Set(), tabIds: [] };
      byKey.set(key, group);
    }
    group.types.add((tab.contentType ?? "file").replace(/-/g, " "));
    group.tabIds.push(tab.id);
  }

  if (byKey.size < 2) return [];

  return Array.from(byKey.entries())
    .map(([key, group]) => {
      const label = Array.from(group.types).join(" / ");
      return {
        key: `type:${key}`,
        label,
        description: `Close ${pluralizeTabs(group.tabIds.length)} — ${label}`,
        icon: group.icon,
        tabIds: group.tabIds,
      };
    })
    .sort((left, right) => left.key.localeCompare(right.key));
}

/** Every tab except the one the user is looking at. */
export function buildOthersTarget(
  tabs: WorkspaceTabState[],
  activeTabId: string | null
): ClearTarget | null {
  if (!activeTabId || tabs.length < 2) return null;
  const tabIds = tabs
    .filter((tab) => tab.id !== activeTabId)
    .map((tab) => tab.id);
  if (tabIds.length === 0) return null;

  return {
    key: "others",
    label: "Others",
    description: `Close ${pluralizeTabs(tabIds.length)}, keeping the active one`,
    tabIds,
  };
}
