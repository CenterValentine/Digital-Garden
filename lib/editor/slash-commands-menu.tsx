/**
 * Slash Commands Menu Component
 *
 * Displays the dropdown menu when user types "/" in the editor.
 * Shows available commands with search/filter capability.
 */

"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import type { SlashCommand } from "./slash-commands";

export interface SlashCommandsListProps {
  items: SlashCommand[];
  command: (item: SlashCommand) => void;
}

export interface SlashCommandsListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const SlashCommandsList = forwardRef<SlashCommandsListRef, SlashCommandsListProps>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: number) => {
    const item = props.items[index];
    if (item) {
      props.command(item);
    }
  };

  const upHandler = () => {
    setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
  };

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  useEffect(() => setSelectedIndex(0), [props.items]);

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

      return false;
    },
  }));

  if (props.items.length === 0) {
    return (
      <div className="slash-commands-menu">
        <div className="slash-command-item-empty">No results</div>
      </div>
    );
  }

  return (
    <div className="slash-commands-menu">
      {props.items.map((item, index) => (
        <button
          className={`slash-command-item ${index === selectedIndex ? "is-selected" : ""}`}
          key={item.title}
          onClick={() => selectItem(index)}
          type="button"
        >
          <span className="slash-command-icon">{item.icon}</span>
          <div className="slash-command-text">
            <div className="slash-command-title">{item.title}</div>
            <div className="slash-command-description">{item.description}</div>
          </div>
        </button>
      ))}
    </div>
  );
});

SlashCommandsList.displayName = "SlashCommandsList";
