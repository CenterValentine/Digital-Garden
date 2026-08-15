"use client";

/**
 * PaneTabAddButton — the "+" at the right end of a pane's tab strip.
 *
 * Click → ContentTreePicker (the canonical tree-browse picker):
 *   - click a row → open that content as a tab in THIS pane (containers:
 *     single click expands, double-click opens)
 *   - every row carries an always-visible "+ New Note" button → a blank
 *     note with a default name lands inline at that placement (top of a
 *     folder, sibling right after a file; the pinned Root row covers
 *     top-level) and opens in the pane; the user renames it later
 *     through the app's existing rename affordances (tab double-click,
 *     tree rename, note title, Note Window header).
 */

import { useState } from "react";
import { Plus } from "lucide-react";

import {
  ContentTreePicker,
  useWorkspaceViewOptions,
  type PickerTarget,
} from "@/components/content/pickers/ContentTreePicker";

export function PaneTabAddButton({
  onOpen,
}: {
  onOpen: (target: PickerTarget) => void;
}) {
  const { views, defaultViewId } = useWorkspaceViewOptions();
  // The anchor element is captured in state at click time (from the
  // event) rather than read from a ref during render — the React
  // Compiler forbids render-time ref access, and state doubles as the
  // open/closed flag.
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const handlePick = (target: PickerTarget) => {
    setAnchorEl(null);
    onOpen(target);
  };

  return (
    <>
      <button
        type="button"
        aria-label="Add content to this pane"
        title="Add content to this pane"
        onClick={(e) => {
          const el = e.currentTarget;
          setAnchorEl((current) => (current ? null : el));
        }}
        className="my-auto ml-1 mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center self-center rounded text-gray-500 transition-colors hover:bg-black/[0.05] hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-gray-200"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {anchorEl ? (
        <ContentTreePicker
          anchorEl={anchorEl}
          onPick={handlePick}
          onClose={() => setAnchorEl(null)}
          quickCreate={{ defaultTitle: "Untitled", onCreated: handlePick }}
          views={views}
          defaultViewId={defaultViewId}
          searchPlaceholder="Search content… or browse below"
        />
      ) : null}
    </>
  );
}
