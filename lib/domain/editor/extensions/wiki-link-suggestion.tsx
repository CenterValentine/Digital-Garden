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
import { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import tippy, { Instance as TippyInstance, GetReferenceClientRect } from "tippy.js";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { computeHeadingIds } from "@/lib/domain/content/heading-ids";

// Extends the fetcher's shape because note items are built by spreading it
// (`{ kind: "note", ...note }`) — new fetcher fields flow through untouched.
interface WikiLinkNoteItem extends WikiLinkSuggestionItem {
  kind: "note";
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
  /**
   * Present on UN-promoted database rows (plan Phase 5): `id` is then a
   * `row:` sentinel, not a ContentNode id, and selecting the item promotes
   * the row (role "referenced") before the link is inserted. The command
   * refuses to insert the sentinel — a row item without a promote callback
   * degrades to plain text, never to a dead link.
   */
  row?: { rowId: string; tableId: string; tableTitle: string };
}

/** Resolves a row suggestion to a real node — injected beside `fetchNotes`. */
export type WikiLinkRowPromoter = (row: {
  rowId: string;
  tableId: string;
}) => Promise<{ contentId: string } | null>;

type WikiLinkSearchStatus = "loading" | "ready" | "error";

interface WikiLinkListProps {
  items: WikiLinkItem[];
  command: (item: WikiLinkItem) => void;
  status: WikiLinkSearchStatus;
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
    if (props.status === "loading") {
      return (
        <div className="rounded-lg border border-white/10 bg-gray-900/95 p-3 shadow-xl backdrop-blur-sm">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span
              aria-hidden
              className="h-3 w-3 animate-spin rounded-full border border-gray-500 border-t-transparent"
            />
            Searching notes…
          </div>
        </div>
      );
    }

    if (props.status === "error") {
      return (
        <div className="rounded-lg border border-white/10 bg-gray-900/95 p-3 shadow-xl backdrop-blur-sm">
          <div className="text-sm text-amber-300">
            Unable to search notes — check your connection and try again.
          </div>
        </div>
      );
    }

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
                {item.row ? (
                  <span className="max-w-[10rem] shrink-0 truncate rounded border border-white/15 px-1 py-px text-[9px] uppercase tracking-wide text-gray-400">
                    {item.row.tableTitle}
                  </span>
                ) : item.contentType === "folder" ? (
                  <span className="shrink-0 rounded border border-white/15 px-1 py-px text-[9px] uppercase tracking-wide text-gray-400">
                    folder
                  </span>
                ) : null}
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
  fetchNotes: (query: string) => Promise<WikiLinkSuggestionItem[]>,
  promoteRow?: WikiLinkRowPromoter
): Omit<SuggestionOptions, "editor"> {
  // Only the newest request may set the settled status — a slow stale
  // response must not overwrite what the latest query reported.
  let requestSeq = 0;
  let latestSettled = true;
  let latestFailed = false;

  const currentStatus = (): WikiLinkSearchStatus =>
    !latestSettled ? "loading" : latestFailed ? "error" : "ready";

  return {
    char: "[[",

    allowSpaces: true,

    items: async ({ query, editor }): Promise<WikiLinkItem[]> => {
      // [[# → in-document heading mode: list the current doc's headings by
      // derived slug. No fetch — the document is already in memory, so the
      // search state settles immediately and can never be the failed one.
      if (query.startsWith("#")) {
        latestSettled = true;
        latestFailed = false;
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

      // Sequence the fetches so a slow earlier request can't overwrite a
      // later one's status: only the most recent request may settle it.
      const requestId = ++requestSeq;
      latestSettled = false;
      try {
        const notes = await fetchNotes(query);
        if (requestId === requestSeq) {
          latestSettled = true;
          latestFailed = false;
        }
        return notes.map((note) => ({ kind: "note" as const, ...note }));
      } catch {
        if (requestId === requestSeq) {
          latestSettled = true;
          latestFailed = true;
        }
        return [];
      }
    },

    render: () => {
      let component: ReactRenderer<WikiLinkListRef> | undefined;
      let popup: TippyInstance[] | undefined;

      const destroyPopup = () => {
        popup?.[0]?.destroy();
        popup = undefined;
        component?.destroy();
        component = undefined;
      };

      const createPopup = (props: SuggestionProps, status: WikiLinkSearchStatus) => {
        component = new ReactRenderer(WikiLinkList, {
          props: { ...props, status },
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
      };

      return {
        // Fires before the first fetch resolves, so the popup opens on its
        // loading surface instead of waiting silently for the response.
        onBeforeStart: (props) => {
          destroyPopup();
          createPopup(props, "loading");
        },

        onStart: (props) => {
          // A moved+changed cycle runs onExit between onBeforeStart and here.
          if (!component) {
            createPopup(props, currentStatus());
            return;
          }

          component.updateProps({ ...props, status: currentStatus() });

          if (props.clientRect) {
            popup?.[0]?.setProps({
              getReferenceClientRect: props.clientRect as GetReferenceClientRect,
            });
          }
        },

        // Keep the previous results visible while the next fetch is in
        // flight; only the status flips, so an empty list reads as
        // searching rather than "No notes found".
        onBeforeUpdate: () => {
          component?.updateProps({ status: "loading" });
        },

        // `component`/`popup` only exist once onStart has run — but the
        // suggestion plugin can deliver onUpdate/onKeyDown before that
        // (items() is async) or after onExit tore them down. Guard every
        // access (live crash: "Cannot read properties of undefined
        // (reading 'ref')" on a keydown that raced onStart).
        onUpdate(props) {
          component?.updateProps({ ...props, status: currentStatus() });

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
          destroyPopup();
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

      // Un-promoted database row (plan Phase 5): there is no node to point
      // at until promotion (role "referenced") returns one. The trigger text
      // is consumed SYNCHRONOUSLY, then the link inserts at the current
      // selection when promotion resolves — selection-anchored rather than
      // range-anchored, because the captured range positions are dead
      // numbers a concurrent collab step would shift, while the selection
      // maps through remote steps correctly. On failure the row's title
      // lands as plain text: the user's intent stays visible, never a
      // sentinel-id link that resolves to nothing.
      if (item.row) {
        chain.run();
        const rowMeta = item.row;
        void (async () => {
          if (promoteRow) {
            try {
              const promoted = await promoteRow(rowMeta);
              if (promoted) {
                editor
                  .chain()
                  .focus()
                  .insertContent({
                    type: "wikiLink",
                    attrs: {
                      targetId: promoted.contentId,
                      targetTitle: item.title,
                    },
                  })
                  .run();
                return;
              }
            } catch {
              // fall through to the plain-text fallback
            }
          }
          editor.chain().focus().insertContent(item.title).run();
        })();
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
