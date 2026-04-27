"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const dailyEnabled = settings.daily.enabled;
  const weeklyEnabled = settings.weekly.enabled;

  const openMenu = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuWidth = 176;
    const left = collapsed
      ? rect.right + 8
      : rect.left + rect.width / 2 - menuWidth / 2;
    setMenuPosition({
      top: rect.bottom + 6,
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
    async (kind: PeriodicNoteKind) => {
      closeMenu();

      if (!settings[kind].enabled) {
        toast.error(`${kind === "daily" ? "Daily" : "Weekly"} notes are disabled`);
        return;
      }

      try {
        const response = await fetch("/api/periodic-notes/resolve", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            kind,
            localDateTime: moment().format("YYYY-MM-DDTHH:mm:ss"),
          }),
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
        toast.success(
          result.data.created
            ? `Created ${kind === "daily" ? "daily" : "weekly"} note`
            : `Opened ${kind === "daily" ? "daily" : "weekly"} note`
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
    if (dailyEnabled) {
      void openPeriodicNote("daily");
      return;
    }
    if (weeklyEnabled) {
      void openPeriodicNote("weekly");
      return;
    }
    toast.error("Enable daily or weekly notes in extension settings first");
  }, [dailyEnabled, openPeriodicNote, weeklyEnabled]);

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

      {menuOpen && menuPosition ? (
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-50 min-w-40 rounded-md border border-white/10 bg-[#111318] p-1 text-sm text-gray-200 shadow-xl"
          style={{ top: menuPosition.top, left: menuPosition.left }}
        >
          {dailyEnabled ? (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center rounded px-3 py-2 text-left transition-colors hover:bg-white/10"
              onClick={() => void openPeriodicNote("daily")}
            >
              Today
            </button>
          ) : null}
          {weeklyEnabled ? (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center rounded px-3 py-2 text-left transition-colors hover:bg-white/10"
              onClick={() => void openPeriodicNote("weekly")}
            >
              This Week
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center rounded px-3 py-2 text-left transition-colors hover:bg-white/10"
            onClick={openSettings}
          >
            Settings
          </button>
        </div>
      ) : null}
    </>
  );
}
