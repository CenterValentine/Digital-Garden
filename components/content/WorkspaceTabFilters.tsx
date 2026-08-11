"use client";

import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import { useContentStore } from "@/state/content-store";
import {
  collectPaneAttachedTabs,
  getEffectiveTabFilters,
  isTabGroupVisible,
  selectActiveTabFilters,
  useWorkspaceTabFilterStore,
} from "@/state/workspace-tab-filter-store";
import { getTabIcon, getTabIconGroupKey } from "./headers/tab-icons";

/**
 * Per-content-type filter toggles for the workspace bar.
 *
 * One affordance per icon group with a tab open in the ACTIVE workspace's
 * panes — a type open only in some other workspace shows no button here.
 * Icons are inherited from the canonical tab-icon mapping
 * (headers/tab-icons.ts), never redeclared here.
 *
 * Click cycles each type: off → show only → hide → off. All active filters
 * are honored together (strict AND), so contradictory choices simply leave
 * the tab strip empty. The filter is view-only: hidden tabs stay open.
 * Filters are per-workspace and persisted (see workspace-tab-filter-store).
 */

interface TabIconGroup {
  key: string;
  icon: LucideIcon;
  label: string;
  count: number;
}

function humanizeContentType(contentType: string | null): string {
  if (!contentType) return "file";
  return contentType.replace(/-/g, " ");
}

export function WorkspaceTabFilters() {
  const tabsById = useContentStore((state) => state.tabs);
  const panes = useContentStore((state) => state.panes);
  const filters = useWorkspaceTabFilterStore(selectActiveTabFilters);
  const cycleFilter = useWorkspaceTabFilterStore((state) => state.cycleFilter);

  const groups = useMemo<TabIconGroup[]>(() => {
    const byKey = new Map<
      string,
      { icon: LucideIcon; types: Set<string | null>; count: number }
    >();
    for (const tab of collectPaneAttachedTabs(panes, tabsById)) {
      const key = getTabIconGroupKey(tab.contentType);
      let group = byKey.get(key);
      if (!group) {
        group = { icon: getTabIcon(tab.contentType), types: new Set(), count: 0 };
        byKey.set(key, group);
      }
      group.types.add(tab.contentType);
      group.count += 1;
    }
    return Array.from(byKey.entries())
      .map(([key, group]) => ({
        key,
        icon: group.icon,
        label: Array.from(
          new Set(Array.from(group.types).map(humanizeContentType))
        ).join(" / "),
        count: group.count,
      }))
      .sort((left, right) => left.key.localeCompare(right.key));
  }, [panes, tabsById]);

  // A saved filter whose type has no open tab here is inert (not deleted):
  // it neither renders an affordance nor hides anything, and it re-applies
  // visibly the next time a tab of its type opens.
  const effectiveFilters = useMemo(
    () =>
      getEffectiveTabFilters(
        filters,
        new Set(groups.map((group) => group.key))
      ),
    [filters, groups]
  );

  if (groups.length === 0) return null;

  const visibleGroupCount = groups.filter((group) =>
    isTabGroupVisible(effectiveFilters, group.key)
  ).length;

  return (
    <div
      role="group"
      aria-label="Filter open tabs by content type"
      title={
        visibleGroupCount === 0
          ? "Tab filters (contradictory — all tabs hidden)"
          : undefined
      }
      className="inline-flex items-center gap-0.5 rounded-md border border-white/10 p-0.5"
    >
      {groups.map(({ key, icon: Icon, label, count }) => {
        const mode = effectiveFilters[key];
        const title =
          mode === undefined
            ? `Show only ${label} tabs (${count} open)`
            : mode === "only"
              ? `Showing only ${label} tabs — click to hide them`
              : `Hiding ${label} tabs — click to clear`;

        return (
          <button
            key={key}
            type="button"
            onClick={() => cycleFilter(key)}
            aria-pressed={mode !== undefined}
            aria-label={title}
            title={title}
            className={`rounded p-1 transition-colors ${
              mode === "only"
                ? "bg-gold-primary/15 text-gold-primary"
                : mode === "hidden"
                  ? "bg-black/5 text-gray-400 dark:bg-white/5 dark:text-gray-500"
                  : "text-gray-500 hover:bg-black/5 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
            }`}
          >
            <span className="relative flex items-center justify-center">
              <Icon
                className={`h-3.5 w-3.5 ${mode === "hidden" ? "opacity-40" : ""}`}
                aria-hidden="true"
              />
              {mode === "hidden" ? (
                <span
                  aria-hidden="true"
                  className="absolute h-[1.5px] w-4 -rotate-45 rounded-full bg-red-500/80 dark:bg-red-400/80"
                />
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
