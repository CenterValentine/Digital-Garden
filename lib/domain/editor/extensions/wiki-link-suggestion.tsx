/**
 * Wiki-Link Autocomplete Suggestion
 *
 * Shows a popup menu when typing [[ to select notes to link to.
 * Typing [[# switches to in-document heading mode: the list comes from the
 * current document's derived heading slugs (no fetch), and selecting inserts
 * a heading link ([[#Heading]] — wikiLink with `headingSlug`).
 *
 * M6: Search & Knowledge Features - Wiki Links
 */

"use client";

import { ReactRenderer } from "@tiptap/react";
import { SuggestionOptions } from "@tiptap/suggestion";
import tippy, { Instance as TippyInstance, GetReferenceClientRect } from "tippy.js";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { computeHeadingIds } from "@/lib/domain/content/heading-ids";

interface WikiLinkNoteItem {
  kind: "note";
  id: string;
  title: string;
  slug: string;
}

interface WikiLinkHeadingItem {
  kind: "heading";
  slug: string;
  text: string;
  level: number;
}

type WikiLinkItem = WikiLinkNoteItem | WikiLinkHeadingItem;

/** Item shape the app-layer fetcher returns (kind is added internally). */
export interface WikiLinkSuggestionItem {
  id: string;
  title: string;
  slug: string;
  /** "note" (default) or "folder" — folders link to their capsule-backed view. */
  contentType?: string;
}

interface WikiLinkListProps {
  items: WikiLinkItem[];
  command: (item: WikiLinkItem) => void;
}

interface WikiLinkListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const WikiLinkList = forwardRef<WikiLinkListRef, WikiLinkListProps>((props, ref) => {
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

  // eslint-disable-next-line react-hooks/set-state-in-effect -- audited, see BACKLOG.md
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
      <div className="rounded-lg border border-white/10 bg-gray-900/95 p-3 shadow-xl backdrop-blur-sm">
        <div className="text-sm text-gray-400">No matches found</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 bg-gray-900/95 shadow-xl backdrop-blur-sm overflow-hidden">
      <div className="max-h-60 overflow-y-auto p-1">
        {props.items.map((item, index) => (
          <button
            key={item.kind === "note" ? item.id : `#${item.slug}`}
            onClick={() => selectItem(index)}
            className={`w-full rounded px-3 py-2 text-left text-sm transition-colors ${
              index === selectedIndex
                ? "bg-primary/20 text-primary"
                : "text-gray-300 hover:bg-white/5"
            }`}
          >
            {item.kind === "heading" ? (
              <span
                className="flex items-center gap-2"
                style={{ paddingLeft: `${(item.level - 1) * 8}px` }}
              >
                <span className="shrink-0 text-xs text-gray-500">
                  H{item.level}
                </span>
                <span className="truncate">{item.text}</span>
              </span>
            ) : (
              <span className="flex items-center justify-between gap-2">
                <span className="truncate">{item.title}</span>
                {item.contentType === "folder" && (
                  <span className="shrink-0 rounded border border-white/15 px-1 py-px text-[9px] uppercase tracking-wide text-gray-400">
                    folder
                  </span>
                )}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
});

WikiLinkList.displayName = "WikiLinkList";

export function createWikiLinkSuggestion(
  fetchNotes: (query: string) => Promise<WikiLinkSuggestionItem[]>
): Omit<SuggestionOptions, "editor"> {
  return {
    char: "[[",

    allowSpaces: true,

    items: async ({ query, editor }): Promise<WikiLinkItem[]> => {
      // [[# → in-document heading mode: list the current doc's headings by
      // derived slug. No fetch — the document is already in memory.
      if (query.startsWith("#")) {
        const headingQuery = query.slice(1).toLowerCase();
        return computeHeadingIds(editor.state.doc)
          .filter(
            (heading) =>
              !headingQuery || heading.text.toLowerCase().includes(headingQuery)
          )
          .map((heading) => ({
            kind: "heading" as const,
            slug: heading.slug,
            text: heading.text,
            level: heading.level,
          }));
      }

      const notes = await fetchNotes(query);
      return notes.map((note) => ({ kind: "note" as const, ...note }));
    },

    render: () => {
      let component: ReactRenderer<WikiLinkListRef> | undefined;
      let popup: TippyInstance[] | undefined;

      return {
        onStart: (props) => {
          component = new ReactRenderer(WikiLinkList, {
            props,
            editor: props.editor,
          });

          if (!props.clientRect) {
            return;
          }

          popup = tippy("body", {
            getReferenceClientRect: props.clientRect as GetReferenceClientRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
          });
        },

        // `component`/`popup` only exist once onStart has run — but the
        // suggestion plugin can deliver onUpdate/onKeyDown before that
        // (items() is async) or after onExit tore them down. Guard every
        // access (live crash: "Cannot read properties of undefined
        // (reading 'ref')" on a keydown that raced onStart).
        onUpdate(props) {
          component?.updateProps(props);

          if (!props.clientRect) {
            return;
          }

          popup?.[0]?.setProps({
            getReferenceClientRect: props.clientRect as GetReferenceClientRect,
          });
        },

        onKeyDown(props) {
          if (props.event.key === "Escape") {
            popup?.[0]?.hide();
            return true;
          }

          return component?.ref?.onKeyDown(props) ?? false;
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
      const item = props as WikiLinkItem;

      // Delete the [[ trigger and any text typed
      const chain = editor.chain().focus().deleteRange(range);

      if (item.kind === "heading") {
        chain
          .insertContent({
            type: "wikiLink",
            // In-document link: `headingSlug` is the (live, derived) pointer;
            // `targetTitle` is the label and heals with renames.
            attrs: {
              targetTitle: item.text,
              headingSlug: item.slug,
            },
          })
          .run();
        return;
      }

      chain
        .insertContent({
          type: "wikiLink",
          // `targetId` is the durable pointer (survives renames); `targetTitle`
          // is the label. `slug` used to be passed here too but the node never
          // declared it, so ProseMirror stripped it — dropped rather than
          // revived, since nothing resolves links by slug.
          attrs: {
            targetId: item.id,
            targetTitle: item.title,
          },
        })
        .run();
    },
  };
}
