"use client";

/**
 * LinkViewChooser — the compact "display as" control for a link to a note:
 * Link · Chip · Card · Window, plus Open, plus the link's label.
 *
 * Each option is a SKELETON of what the link would look like — a text line
 * with an underlined word, a pill in a line, a bordered card with a title
 * and excerpt lines, a framed window with a header strip — rather than an
 * icon with a label (owner, 2026-10-03: previews over icons and text). The
 * words survive as tooltips and accessible names.
 *
 * The leading title doubles as the label editor when `onLabelChange` is
 * given: click → input, Enter/blur commits, Escape cancels. The parent
 * decides what a committed label means (for a wiki-link: the alias, or
 * none when it equals the note's title).
 *
 * One component, three mounts: the wiki-link hover popover, the Note
 * Window's header, and (as a label list) the context menu — so the four
 * displays are always the same four, in the same order
 * (lib/domain/editor/link-views.ts owns the vocabulary).
 *
 * Buttons preventDefault on mousedown: the host ProseMirror editor must not
 * steal focus or collapse the selection when a display is picked (the
 * BubbleMenu rule). The label input is the one element allowed to take
 * focus.
 */

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { LINK_VIEW_OPTIONS, type LinkView } from "@/lib/domain/editor/link-views";

/** Pure-CSS thumbnail of a display (styles: `.lvs-*` in globals.css). */
function LinkViewSkeleton({ view }: { view: LinkView }) {
  switch (view) {
    case "link":
      return (
        <span className="lvs" aria-hidden>
          <span className="lvs-row"><i className="lvs-bar" style={{ width: "100%" }} /></span>
          <span className="lvs-row">
            <i className="lvs-bar" style={{ width: "22%" }} />
            <i className="lvs-bar lvs-bar--link" style={{ width: "42%" }} />
            <i className="lvs-bar" style={{ width: "20%" }} />
          </span>
          <span className="lvs-row"><i className="lvs-bar" style={{ width: "70%" }} /></span>
        </span>
      );
    case "chip":
      return (
        <span className="lvs" aria-hidden>
          <span className="lvs-row"><i className="lvs-bar" style={{ width: "100%" }} /></span>
          <span className="lvs-row">
            <i className="lvs-bar" style={{ width: "18%" }} />
            <i className="lvs-pill" style={{ width: "48%" }}><i className="lvs-pill-dot" /><i className="lvs-pill-bar" /></i>
            <i className="lvs-bar" style={{ width: "18%" }} />
          </span>
          <span className="lvs-row"><i className="lvs-bar" style={{ width: "70%" }} /></span>
        </span>
      );
    case "card":
      return (
        <span className="lvs" aria-hidden>
          <span className="lvs-frame lvs-frame--card">
            <i className="lvs-bar lvs-bar--gold" style={{ width: "55%" }} />
            <i className="lvs-bar" style={{ width: "92%" }} />
            <i className="lvs-bar" style={{ width: "74%" }} />
          </span>
        </span>
      );
    case "window":
      return (
        <span className="lvs" aria-hidden>
          <span className="lvs-frame lvs-frame--window">
            <span className="lvs-window-header">
              <i className="lvs-bar lvs-bar--gold" style={{ width: "48%" }} />
              <i className="lvs-window-dot" />
            </span>
            <i className="lvs-bar" style={{ width: "90%" }} />
            <i className="lvs-bar" style={{ width: "66%" }} />
            <i className="lvs-bar" style={{ width: "80%" }} />
          </span>
        </span>
      );
  }
}

export interface LinkViewChooserProps {
  value: LinkView;
  onChange: (view: LinkView) => void;
  /** Open the target in the pane (omit to hide the Open button). */
  onOpen?: () => void;
  /** Shown as a leading label (the link's current text). */
  title?: string | null;
  /** Makes the title editable; receives the trimmed new label on commit. */
  onLabelChange?: (label: string) => void;
  /** Hint inside the empty input (the note's own title). */
  labelPlaceholder?: string | null;
  /** Fires when the label editor opens/closes — a host popover must not hide mid-edit. */
  onEditingChange?: (editing: boolean) => void;
  /** Why "Window" is unavailable (heading links, anchors, virtual targets). */
  windowDisabledReason?: string | null;
  className?: string;
}

export function LinkViewChooser({
  value,
  onChange,
  onOpen,
  title,
  onLabelChange,
  labelPlaceholder,
  onEditingChange,
  windowDisabledReason,
  className,
}: LinkViewChooserProps) {
  // The title being edited and its draft. Keyed by the title so a popover
  // re-anchored to a different link shows that link's label, not a stale
  // editor (no effect needed — a changed title simply stops matching).
  const [editing, setEditing] = useState<{ of: string; draft: string } | null>(null);
  const isEditing = editing !== null && editing.of === (title ?? "");

  const beginEdit = () => {
    if (!onLabelChange) return;
    setEditing({ of: title ?? "", draft: title ?? "" });
    onEditingChange?.(true);
  };
  const endEdit = (commit: boolean) => {
    if (!isEditing || !editing) return;
    const next = editing.draft.trim();
    setEditing(null);
    onEditingChange?.(false);
    if (commit && next !== (title ?? "")) onLabelChange?.(next);
  };

  return (
    <div
      role="toolbar"
      aria-label="Display as"
      className={`link-view-chooser ${className ?? ""}`}
      onMouseDown={(e) => {
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
      }}
    >
      {isEditing && editing ? (
        <input
          className="link-view-chooser-title link-view-chooser-title-input"
          value={editing.draft}
          placeholder={labelPlaceholder ?? undefined}
          aria-label="Link label"
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setEditing({ of: editing.of, draft: e.target.value })}
          onBlur={() => endEdit(true)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              endEdit(true);
            } else if (e.key === "Escape") {
              e.preventDefault();
              endEdit(false);
            }
          }}
        />
      ) : title ? (
        onLabelChange ? (
          <button
            type="button"
            className="link-view-chooser-title link-view-chooser-title-edit"
            title="Edit the link's label"
            onClick={beginEdit}
          >
            {title}
          </button>
        ) : (
          <span className="link-view-chooser-title">{title}</span>
        )
      ) : null}
      <div className="link-view-chooser-group" role="radiogroup" aria-label="Display as">
        {LINK_VIEW_OPTIONS.map((option) => {
          const disabled = option.id === "window" && Boolean(windowDisabledReason);
          const active = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={option.label}
              disabled={disabled}
              title={disabled ? windowDisabledReason ?? option.description : `${option.label} — ${option.description}`}
              onClick={() => {
                if (!disabled && !active) onChange(option.id);
              }}
              className="link-view-chooser-tile"
              data-active={active ? "true" : undefined}
            >
              <LinkViewSkeleton view={option.id} />
            </button>
          );
        })}
      </div>
      {onOpen ? (
        <button
          type="button"
          title="Open"
          aria-label="Open"
          onClick={onOpen}
          className="link-view-chooser-button link-view-chooser-open"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
