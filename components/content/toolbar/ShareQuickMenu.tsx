"use client";

/**
 * The share button's first-click menu: the essentials, anchored to the
 * button (owner, 2026-10-15). Copy link (what the old toolbar copy button
 * did), the public link switch and its copy, and a way into the full Share
 * dialog for collaborators and access levels. Presentational only — every
 * action is a handler MainPanelContent already had.
 */

import { Copy, Globe, Link2, Users } from "lucide-react";

export interface ShareQuickMenuProps {
  /** The content's title, for orientation. */
  title?: string | null;
  isPublished: boolean;
  /** A public-link toggle is in flight. */
  isSharing: boolean;
  publicUrl: string;
  onCopyAppLink: () => void;
  onTogglePublic: (next: boolean) => void;
  onCopyPublicLink: () => void;
  onMoreOptions: () => void;
}

const rowClass =
  "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

export function ShareQuickMenu({
  title,
  isPublished,
  isSharing,
  publicUrl,
  onCopyAppLink,
  onTogglePublic,
  onCopyPublicLink,
  onMoreOptions,
}: ShareQuickMenuProps) {
  return (
    <div className="space-y-1" role="menu" aria-label="Share">
      <div className="px-2 pb-1">
        <p className="text-xs font-medium text-muted-foreground">Share</p>
        {title && <p className="truncate text-sm font-medium text-foreground" title={title}>{title}</p>}
      </div>

      <button type="button" role="menuitem" className={rowClass} onClick={onCopyAppLink} autoFocus>
        <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block">Copy link</span>
          <span className="block text-[11px] text-muted-foreground">Opens in the app — for you and collaborators</span>
        </span>
      </button>

      <div className="my-1 border-t border-border" />

      <div className="flex items-center gap-2.5 px-2 py-1.5">
        <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-foreground">Public link</span>
          <span className="block text-[11px] text-muted-foreground">
            {isPublished ? "Anyone with the link can view" : "Off — only people you invite"}
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={isPublished}
          aria-label={isPublished ? "Turn the public link off" : "Turn the public link on"}
          disabled={isSharing}
          onClick={() => onTogglePublic(!isPublished)}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
            isPublished ? "bg-primary" : "bg-muted-foreground/30"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-background shadow transition-transform ${
              isPublished ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {isPublished && (
        <button type="button" role="menuitem" className={rowClass} onClick={onCopyPublicLink} disabled={isSharing}>
          <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block">Copy public link</span>
            <span className="block truncate text-[11px] text-muted-foreground" title={publicUrl}>{publicUrl}</span>
          </span>
        </button>
      )}

      <div className="my-1 border-t border-border" />

      <button type="button" role="menuitem" className={rowClass} onClick={onMoreOptions}>
        <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1">More sharing options…</span>
      </button>
    </div>
  );
}
