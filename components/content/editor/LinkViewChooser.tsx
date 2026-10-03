"use client";

/**
 * LinkViewChooser — the compact "display as" control for a link to a note:
 * Link · Chip · Card · Window, plus Open.
 *
 * Each option is a SKELETON of what the link would look like — a text line
 * with an underlined word, a pill in a line, a bordered card with a title
 * and excerpt lines, a framed window with a header strip — rather than an
 * icon with a label (owner, 2026-10-03: previews over icons and text). The
 * words survive as tooltips and accessible names.
 *
 * One component, three mounts: the wiki-link hover popover, the Note
 * Window's header, and (as a label list) the context menu — so the four
 * displays are always the same four, in the same order
 * (lib/domain/editor/link-views.ts owns the vocabulary).
 *
 * Buttons preventDefault on mousedown: the host ProseMirror editor must not
 * steal focus or collapse the selection when a display is picked (the
 * BubbleMenu rule).
 */

import { ExternalLink } from "lucide-react";
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
  /** Shown as a leading label (the target's title). */
  title?: string | null;
  /** Why "Window" is unavailable (heading links, anchors, virtual targets). */
  windowDisabledReason?: string | null;
  className?: string;
}

export function LinkViewChooser({
  value,
  onChange,
  onOpen,
  title,
  windowDisabledReason,
  className,
}: LinkViewChooserProps) {
  return (
    <div
      role="toolbar"
      aria-label="Display as"
      className={`link-view-chooser ${className ?? ""}`}
      onMouseDown={(e) => e.preventDefault()}
    >
      {title ? <span className="link-view-chooser-title">{title}</span> : null}
      <div className="link-view-chooser-group">
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
