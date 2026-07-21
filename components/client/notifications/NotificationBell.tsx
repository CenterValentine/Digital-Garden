"use client";

/**
 * Bell icon + unread badge for NotesNavBar.
 *
 * Wraps itself in NotificationTransportProvider so the polling transport
 * lives wherever the navbar does (content, settings, admin, inbox).
 * Opening the popover triggers a list load and an immediate badge refresh.
 */

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useNotificationsStore } from "@/state/notifications-store";
import {
  NotificationTransportProvider,
  useNotificationTransport,
} from "./NotificationTransportProvider";
import { NotificationPopover } from "./NotificationPopover";

function BellButton() {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const unreadCount = useNotificationsStore((state) => state.unreadCount);
  const loadList = useNotificationsStore((state) => state.loadList);
  const transport = useNotificationTransport();

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const toggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) {
      void loadList();
      void transport?.refreshNow();
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={
          unreadCount > 0
            ? `Notifications (${unreadCount} unread)`
            : "Notifications"
        }
        aria-expanded={isOpen}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>
      {isOpen ? <NotificationPopover onClose={() => setIsOpen(false)} /> : null}
    </div>
  );
}

export default function NotificationBell() {
  return (
    <NotificationTransportProvider>
      <BellButton />
    </NotificationTransportProvider>
  );
}
