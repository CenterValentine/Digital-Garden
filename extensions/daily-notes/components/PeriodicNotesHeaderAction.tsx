"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import moment from "moment";
import { toast } from "sonner";
import { renderExtensionIcon } from "@/lib/extensions/icons";
import type {
  ExtensionHeaderNavActionProps,
} from "@/lib/extensions/types";
import {
  getPeriodicNotesSettings,
  type PeriodicNoteKind,
} from "@/lib/domain/periodic-notes";
import { useContentStore } from "@/state/content-store";
import { useExtensionsUiStore } from "@/state/extensions-ui-store";
import { useLeftPanelCollapseStore } from "@/state/left-panel-collapse-store";
import { useLeftPanelViewStore } from "@/state/left-panel-view-store";
import { useSettingsStore } from "@/state/settings-store";
import { DAILY_NOTES_EXTENSION_ID } from "../manifest";

const HOLD_TO_OPEN_MS = 550;

// One "period" ahead resolves per kind: +1 day / week / month / year. Months
// and years are variable-length, so we advance by the calendar unit rather than
// a fixed day count.
const PERIOD_UNIT: Record<PeriodicNoteKind, moment.unitOfTime.DurationConstructor> = {
  daily: "days",
  weekly: "weeks",
  monthly: "months",
  quarterly: "quarters",
  yearly: "years",
};

const NEXT_PERIOD_NOUN: Record<PeriodicNoteKind, string> = {
  daily: "tomorrow's note",
  weekly: "next week's note",
  monthly: "next month's note",
  quarterly: "next quarter's note",
  yearly: "next year's note",
};

const CURRENT_PERIOD_NOUN: Record<PeriodicNoteKind, string> = {
  daily: "daily note",
  weekly: "weekly note",
  monthly: "monthly note",
  quarterly: "quarterly note",
  yearly: "yearly note",
};

const PREV_PERIOD_NOUN: Record<PeriodicNoteKind, string> = {
  daily: "yesterday's note",
  weekly: "last week's note",
  monthly: "last month's note",
  quarterly: "last quarter's note",
  yearly: "last year's note",
};

// Per-interval affordance: previous / current / next, only rendered for
// enabled kinds. Each label maps to an offsetPeriods (-1 / 0 / +1).
const PERIOD_NAV: Array<{
  kind: PeriodicNoteKind;
  label: string;
  prev: string;
  current: string;
  next: string;
}> = [
  { kind: "daily", label: "Daily", prev: "Yesterday", current: "Today", next: "Tomorrow" },
  { kind: "weekly", label: "Weekly", prev: "Last Week", current: "To Week", next: "Next Week" },
  { kind: "monthly", label: "Monthly", prev: "Last Month", current: "To Month", next: "Next Month" },
  { kind: "quarterly", label: "Quarterly", prev: "Last Quarter", current: "To Quarter", next: "Next Quarter" },
  { kind: "yearly", label: "Yearly", prev: "Last Year", current: "To Year", next: "Next Year" },
];

interface MenuPosition {
  top: number;
  left: number;
}

export function PeriodicNotesHeaderAction({
  item,
  collapsed = false,
  className,
  iconClassName,
}: ExtensionHeaderNavActionProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const periodicNotes = useSettingsStore((state) => state.periodicNotes);
  const setSelectedContentId = useContentStore((state) => state.setSelectedContentId);
  const setActiveView = useLeftPanelViewStore((state) => state.setActiveView);
  const setLeftPanelMode = useLeftPanelCollapseStore((state) => state.setMode);
  const openExtensionDialog = useExtensionsUiStore(
    (state) => state.openExtensionDialog
  );
  const settings = getPeriodicNotesSettings({ periodicNotes });

  const openMenu = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuWidth = 248;
    const left = collapsed
      ? rect.right + 8
      : rect.left + rect.width / 2 - menuWidth / 2;
    setMenuPosition({
      top: rect.bottom + 2,
      left: Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8)),
    });
    setMenuOpen(true);
  }, [collapsed]);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && buttonRef.current?.contains(target)) return;
      if (target && menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const openPeriodicNote = useCallback(
    async (kind: PeriodicNoteKind, offsetPeriods = 0) => {
      closeMenu();

      if (!settings[kind].enabled) {
        const label = kind.charAt(0).toUpperCase() + kind.slice(1);
        toast.error(`${label} notes are disabled`);
        return;
      }

      // Advance by whole periods. The server subtracts nightOwlHour from this
      // timestamp, so a whole-period offset always lands cleanly in the next
      // period — the shared periodKey + unique DB index dedupes against any
      // auto-generated note.
      const localDateTime = moment()
        .add(offsetPeriods, PERIOD_UNIT[kind])
        .format("YYYY-MM-DDTHH:mm:ss");

      try {
        const response = await fetch("/api/periodic-notes/resolve", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ kind, localDateTime }),
        });
        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(
            result.error?.message || "Failed to open periodic note"
          );
        }

        if (collapsed) setLeftPanelMode("full");
        setActiveView("files");
        setSelectedContentId(result.data.id, {
          title: result.data.title,
          contentType: "note",
        });
        window.dispatchEvent(new CustomEvent("dg:tree-refresh"));
        const noteNoun =
          offsetPeriods > 0
            ? NEXT_PERIOD_NOUN[kind]
            : offsetPeriods < 0
              ? PREV_PERIOD_NOUN[kind]
              : CURRENT_PERIOD_NOUN[kind];
        toast.success(
          result.data.created ? `Created ${noteNoun}` : `Opened ${noteNoun}`
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to open periodic note"
        );
      }
    },
    [
      closeMenu,
      collapsed,
      setActiveView,
      setLeftPanelMode,
      setSelectedContentId,
      settings,
    ]
  );

  const openPrimaryNote = useCallback(() => {
    // Single click opens the highest-cadence enabled note (daily first).
    const primary = (["daily", "weekly", "monthly", "yearly"] as const).find(
      (kind) => settings[kind].enabled
    );
    if (primary) {
      void openPeriodicNote(primary);
      return;
    }
    toast.error("Enable a periodic note kind in extension settings first");
  }, [openPeriodicNote, settings]);

  const openSettings = useCallback(() => {
    closeMenu();
    if (collapsed) setLeftPanelMode("full");
    setActiveView("extensions");
    window.setTimeout(() => openExtensionDialog(DAILY_NOTES_EXTENSION_ID), 0);
  }, [
    closeMenu,
    collapsed,
    openExtensionDialog,
    setActiveView,
    setLeftPanelMode,
  ]);

  const clearHoldTimer = () => {
    if (!holdTimerRef.current) return;
    window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={className}
        title={item.title ?? item.label}
        aria-label={item.title ?? item.label}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          openPrimaryNote();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          openMenu();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            openMenu();
          }
        }}
        onPointerDown={() => {
          clearHoldTimer();
          holdTimerRef.current = window.setTimeout(() => {
            suppressClickRef.current = true;
            openMenu();
          }, HOLD_TO_OPEN_MS);
        }}
        onPointerLeave={clearHoldTimer}
        onPointerCancel={clearHoldTimer}
        onPointerUp={clearHoldTimer}
      >
        {renderExtensionIcon(item.iconName, iconClassName)}
      </button>

      {menuOpen && menuPosition
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className="fixed z-50 w-[248px] rounded-md border border-black/10 bg-white/95 p-1 text-sm text-gray-900 shadow-lg backdrop-blur-sm dark:border-white/10 dark:bg-gray-900/95 dark:text-gray-200"
              style={{ top: menuPosition.top, left: menuPosition.left }}
            >
              {PERIOD_NAV.filter((nav) => settings[nav.kind].enabled).map(
                (nav) => (
                  <div key={nav.kind} className="px-0.5 pb-0.5">
                    <div className="px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-100">
                      {nav.label}
                    </div>
                    <div className="grid grid-cols-3 gap-0.5">
                      {[
                        { rel: nav.prev, offset: -1 },
                        { rel: nav.current, offset: 0 },
                        { rel: nav.next, offset: 1 },
                      ].map((seg) => (
                        <button
                          key={seg.offset}
                          type="button"
                          role="menuitem"
                          className={`rounded px-1 py-1 text-center text-[11px] leading-tight transition-colors hover:bg-primary/10 hover:text-primary dark:hover:bg-white/10 dark:hover:text-gray-100 ${
                            seg.offset === 0
                              ? "bg-primary/5 font-semibold dark:bg-white/[0.06]"
                              : "text-gray-600 dark:text-gray-400"
                          }`}
                          onClick={() => void openPeriodicNote(nav.kind, seg.offset)}
                        >
                          {seg.rel}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              )}
              {PERIOD_NAV.some((nav) => settings[nav.kind].enabled) ? (
                <div className="my-0.5 border-t border-black/10 dark:border-white/10" />
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center rounded px-2 py-1.5 text-left transition-colors hover:bg-primary/10 hover:text-primary dark:hover:bg-white/10 dark:hover:text-gray-100"
                onClick={openSettings}
              >
                Settings
              </button>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
