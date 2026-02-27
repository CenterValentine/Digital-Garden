/**
 * Tag Autocomplete Suggestion
 *
 * Shows a popup menu when typing # to select tags
 * Follows the same pattern as wiki-link-suggestion.tsx
 *
 * M6: Search & Knowledge Features - Tags
 */

"use client";

import { ReactRenderer } from "@tiptap/react";
import { SuggestionOptions } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import tippy, { Instance as TippyInstance } from "tippy.js";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

// Unique plugin key to avoid conflicts with other suggestion plugins
export const tagSuggestionPluginKey = new PluginKey("tagSuggestion");

interface TagSuggestionItem {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  usageCount: number;
}

interface TagListProps {
  items: TagSuggestionItem[];
  command: (item: TagSuggestionItem) => void;
  query: string; // Current search query for creating new tags
  createNewTag?: (tagName: string) => void; // Callback to create new tag
}

export const TagList = forwardRef((props: TagListProps, ref) => {
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
    // If items exist, select the current item
    if (props.items.length > 0) {
      selectItem(selectedIndex);
      return true;
    }
    // If no items and query exists, create new tag
    if (props.query.trim() && props.createNewTag) {
      props.createNewTag(props.query.trim());
      return true;
    }
    // Nothing actionable — let the event propagate
    return false;
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
        return enterHandler();
      }

      // Space: only select a tag if the user has typed a non-empty query.
      // When the query is empty (user just typed `#`), Space must propagate
      // to ProseMirror so `# ` triggers the heading input rule.
      if (event.key === " ") {
        if (props.query.trim() && props.items.length > 0) {
          selectItem(selectedIndex);
          return true;
        }
        // Empty query or no items: let space propagate
        return false;
      }

      return false;
    },
  }));

  if (props.items.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-gray-900/95 p-3 shadow-xl backdrop-blur-sm">
        <div className="text-sm text-gray-400">No tags found - press Enter to create</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 bg-gray-900/95 shadow-xl backdrop-blur-sm overflow-hidden">
      <div className="max-h-60 overflow-y-auto p-1">
        {props.items.map((item, index) => (
          <button
            key={item.id}
            onClick={() => selectItem(index)}
            className={`w-full rounded px-3 py-2 text-left text-sm transition-colors flex items-center justify-between ${
              index === selectedIndex
                ? "bg-primary/20 text-primary"
                : "text-gray-300 hover:bg-white/5"
            }`}
          >
            <div className="flex items-center gap-2">
              {item.color && (
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
              )}
              <span>#{item.name}</span>
            </div>
            {item.usageCount > 0 && (
              <span className="text-xs text-gray-500">{item.usageCount}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
});

TagList.displayName = "TagList";

export function createTagSuggestion(
  fetchTags: (query: string) => Promise<TagSuggestionItem[]>,
  onTagSelect?: (tag: TagSuggestionItem) => void,
  createTag?: (tagName: string) => Promise<TagSuggestionItem>
): Omit<SuggestionOptions, "editor"> {
  return {
    pluginKey: tagSuggestionPluginKey,
    char: "#",

    allowSpaces: false, // Tags don't allow spaces

    // Prevent tag suggestion in headings and when preceded by #
    allow: ({ state, range }) => {
      const $from = state.doc.resolve(range.from);

      // Don't allow in heading nodes (## creates heading, not tags)
      if ($from.parent.type.name === "heading") {
        return false;
      }

      // Check if preceded by another # (heading syntax)
      // Look at position BEFORE the trigger # character (range.from is where # was typed)
      const charBefore = state.doc.textBetween(
        Math.max(0, range.from - 1),
        range.from,
        ""
      );

      // If the character immediately before the # is also a #, don't trigger
      if (charBefore === "#") {
        return false;
      }

      return true;
    },

    items: async ({ query }) => {
      const tags = await fetchTags(query);
      return tags;
    },

    render: () => {
      let component: ReactRenderer;
      let popup: TippyInstance[];
      let currentQuery = "";

      return {
        onStart: (props) => {
          currentQuery = props.query || "";

          component = new ReactRenderer(TagList, {
            props: {
              ...props,
              query: currentQuery,
              createNewTag: createTag ? async (tagName: string) => {
                // Create new tag via API
                const newTag = await createTag(tagName);
                // Insert it into the editor
                props.command(newTag);
              } : undefined,
            },
            editor: props.editor,
          });

          if (!props.clientRect) {
            return;
          }

          popup = tippy("body", {
            getReferenceClientRect: props.clientRect as any,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
          });
        },

        onUpdate(props) {
          currentQuery = props.query || "";

          component.updateProps({
            ...props,
            query: currentQuery,
            createNewTag: createTag ? async (tagName: string) => {
              const newTag = await createTag(tagName);
              props.command(newTag);
            } : undefined,
          });

          if (!props.clientRect) {
            return;
          }

          popup[0].setProps({
            getReferenceClientRect: props.clientRect as any,
          });
        },

        onKeyDown(props) {
          if (props.event.key === "Escape") {
            popup?.[0]?.hide();
            return true;
          }

          // Guard: component may not be initialized if onKeyDown fires
          // before onStart completes (race condition in Suggestion plugin)
          if (!component?.ref) return false;
          return (component.ref as any).onKeyDown(props) ?? false;
        },

        onExit() {
          if (popup && popup[0]) {
            popup[0].destroy();
          }
          if (component) {
            component.destroy();
          }
        },
      };
    },

    command: ({ editor, range, props }) => {
      const item = props as TagSuggestionItem;

      // Delete the # trigger and any text typed
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: "tag",
          attrs: {
            tagId: item.id,
            tagName: item.name,
            slug: item.slug,
            color: item.color,
          },
        })
        .run();

      // Callback for tag selection
      if (onTagSelect) {
        onTagSelect(item);
      }
    },
  };
}
