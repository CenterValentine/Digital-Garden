"use client";

/**
 * LinkViewChooser — the compact "display as" control for a link to a note:
 * Link · Chip · Card · Window, plus Open.
 *
 * One component, three mounts: the wiki-link hover popover, the Note
 * Window's header, and (as a label list) the context menu — so the four
 * displays are always the same four, in the same order, with the same
 * words (lib/domain/editor/link-views.ts owns the vocabulary).
 *
 * Buttons preventDefault on mousedown: the host ProseMirror editor must not
 * steal focus or collapse the selection when a display is picked (the
 * BubbleMenu rule).
 */

import { AppWindow, CreditCard, ExternalLink, Link, Tag } from "lucide-react";
import type { ComponentType } from "react";
import { LINK_VIEW_OPTIONS, type LinkView } from "@/lib/domain/editor/link-views";

const ICONS: Record<LinkView, ComponentType<{ className?: string }>> = {
  link: Link,
  chip: Tag,
  card: CreditCard,
  window: AppWindow,
};

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
          const Icon = ICONS[option.id];
          const disabled = option.id === "window" && Boolean(windowDisabledReason);
          const active = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              title={disabled ? windowDisabledReason ?? option.description : `${option.label} — ${option.description}`}
              onClick={() => {
                if (!disabled && !active) onChange(option.id);
              }}
              className="link-view-chooser-button"
              data-active={active ? "true" : undefined}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="link-view-chooser-label">{option.label}</span>
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
