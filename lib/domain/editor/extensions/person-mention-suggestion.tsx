"use client";

import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import tippy, { Instance as TippyInstance } from "tippy.js";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { User } from "lucide-react";

export const personMentionSuggestionPluginKey = new PluginKey("personMentionSuggestion");

export interface PersonMentionSuggestionItem {
  id: string;
  personId: string;
  label: string;
  slug: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
}

interface PersonMentionListProps {
  items: PersonMentionSuggestionItem[];
  command: (item: PersonMentionSuggestionItem) => void;
}

interface PersonMentionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const PersonMentionList = forwardRef<PersonMentionListRef, PersonMentionListProps>(
  (props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selectItem = (index: number) => {
      const item = props.items[index];
      if (item) {
        props.command(item);
      }
    };

    useEffect(() => setSelectedIndex(0), [props.items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((index) => (index + props.items.length - 1) % props.items.length);
          return true;
        }

        if (event.key === "ArrowDown") {
          setSelectedIndex((index) => (index + 1) % props.items.length);
          return true;
        }

        if (event.key === "Enter") {
          selectItem(selectedIndex);
          return true;
        }

        return false;
      },
    }));

    if (props.items.length === 0) {
      return (
        <div className="rounded-lg border border-white/10 bg-gray-900/95 p-3 shadow-xl backdrop-blur-sm">
          <div className="text-sm text-gray-400">No people found</div>
        </div>
      );
    }

    return (
      <div className="overflow-hidden rounded-lg border border-white/10 bg-gray-900/95 shadow-xl backdrop-blur-sm">
        <div className="max-h-60 overflow-y-auto p-1">
          {props.items.map((item, index) => (
            <button
              key={item.personId}
              onClick={() => selectItem(index)}
              className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors ${
                index === selectedIndex
                  ? "bg-primary/20 text-primary"
                  : "text-gray-300 hover:bg-white/5"
              }`}
            >
              <User className="h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate">{item.label}</div>
                <div className="truncate text-xs text-gray-500">
                  {item.email || item.phone || "Person"}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }
);

PersonMentionList.displayName = "PersonMentionList";

export function createPersonMentionSuggestion(
  fetchPeople: (query: string) => Promise<PersonMentionSuggestionItem[]>
): Omit<SuggestionOptions, "editor"> {
  return {
    pluginKey: personMentionSuggestionPluginKey,
    char: "@",
    allowSpaces: true,
    items: async ({ query }) => fetchPeople(query),
    render: () => {
      let component: ReactRenderer<PersonMentionListRef>;
      let popup: TippyInstance[];

      return {
        onStart: (props) => {
          component = new ReactRenderer(PersonMentionList, {
            props,
            editor: props.editor,
          });

          if (!props.clientRect) {
            return;
          }

          popup = tippy("body", {
            getReferenceClientRect: props.clientRect as never,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
          });
        },
        onUpdate: (props) => {
          component.updateProps(props);
          if (!props.clientRect) {
            return;
          }
          popup[0].setProps({
            getReferenceClientRect: props.clientRect as never,
          });
        },
        onKeyDown: (props) => {
          if (props.event.key === "Escape") {
            popup[0].hide();
            return true;
          }

          return component.ref?.onKeyDown(props) ?? false;
        },
        onExit: () => {
          if (popup?.[0]) {
            popup[0].destroy();
          }
          component?.destroy();
        },
      };
    },
    command: ({ editor, range, props }) => {
      const item = props as PersonMentionSuggestionItem;
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: "personMention",
          attrs: {
            personId: item.personId,
            label: item.label,
            slug: item.slug,
          },
        })
        .insertContent(" ")
        .run();
    },
  };
}
