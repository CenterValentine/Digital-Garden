/**
 * Slash Commands Menu Component
 *
 * Displays the dropdown menu when user types "/" in the editor.
 * Shows available commands with search/filter capability.
 *
 * Tab affordance: All / Editor / Published filters the command list by kind.
 * Defaults to "all" each time the menu opens — keeps behavior predictable.
 * Tab key cycles tabs forward, Shift+Tab cycles backward.
 */

"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import type { SlashCommand, SlashCommandKind } from "./slash-commands";

export interface SlashCommandsListProps {
  items: SlashCommand[];
  command: (item: SlashCommand) => void;
}

export interface SlashCommandsListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

type TabId = "all" | "editor" | "published";

const TABS: ReadonlyArray<{ id: TabId; label: string; kind: SlashCommandKind | null }> = [
  { id: "all", label: "All", kind: null },
  { id: "editor", label: "Editor", kind: "editor" },
  { id: "published", label: "Published", kind: "published" },
];

function commandKind(cmd: SlashCommand): SlashCommandKind {
  return cmd.kind ?? "editor";
}

export const SlashCommandsList = forwardRef<SlashCommandsListRef, SlashCommandsListProps>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<TabId>("all");

  // Filter the incoming items (already query-filtered upstream) by active tab
  const filteredItems = useMemo(() => {
    const tab = TABS.find((t) => t.id === activeTab);
    if (!tab || tab.kind === null) return props.items;
    return props.items.filter((item) => commandKind(item) === tab.kind);
  }, [props.items, activeTab]);

  // Per-tab counts for badges
  const tabCounts = useMemo(() => {
    const counts: Record<TabId, number> = { all: props.items.length, editor: 0, published: 0 };
    for (const item of props.items) {
      counts[commandKind(item)]++;
    }
    return counts;
  }, [props.items]);

  const selectItem = (index: number) => {
    const item = filteredItems[index];
    if (item) {
      props.command(item);
    }
  };

  const upHandler = () => {
    if (filteredItems.length === 0) return;
    setSelectedIndex((selectedIndex + filteredItems.length - 1) % filteredItems.length);
  };

  const downHandler = () => {
    if (filteredItems.length === 0) return;
    setSelectedIndex((selectedIndex + 1) % filteredItems.length);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  const cycleTab = (direction: 1 | -1) => {
    const idx = TABS.findIndex((t) => t.id === activeTab);
    const next = (idx + direction + TABS.length) % TABS.length;
    setActiveTab(TABS[next]!.id);
  };

  // Reset selection when the underlying items or active tab changes
  useEffect(() => setSelectedIndex(0), [props.items, activeTab]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowUp") {
        upHandler();
        return true;
      }

      if (event.key === "ArrowDown") {
        downHandler();
        return true;
      }

      if (event.key === "Enter") {
        enterHandler();
        return true;
      }

      if (event.key === "Tab") {
        // Tab cycles forward, Shift+Tab cycles backward
        cycleTab(event.shiftKey ? -1 : 1);
        return true;
      }

      return false;
    },
  }));

  return (
    <div className="slash-commands-menu">
      <div className="slash-commands-tabs" role="tablist" aria-label="Filter commands">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`slash-commands-tab ${activeTab === tab.id ? "is-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
            // Prevent the editor from stealing focus when clicking a tab
            onMouseDown={(e) => e.preventDefault()}
          >
            <span className="slash-commands-tab-label">{tab.label}</span>
            <span className="slash-commands-tab-count">{tabCounts[tab.id]}</span>
          </button>
        ))}
      </div>

      <div className="slash-commands-items">
        {filteredItems.length === 0 ? (
          <div className="slash-command-item-empty">No results in this tab</div>
        ) : (
          filteredItems.map((item, index) => (
            <button
              className={`slash-command-item ${index === selectedIndex ? "is-selected" : ""}`}
              key={`${item.title}-${index}`}
              onClick={() => selectItem(index)}
              type="button"
            >
              <span className="slash-command-icon">{item.icon}</span>
              <div className="slash-command-text">
                <div className="slash-command-title">{item.title}</div>
                <div className="slash-command-description">{item.description}</div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
});

SlashCommandsList.displayName = "SlashCommandsList";
