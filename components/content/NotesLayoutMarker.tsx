"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** sessionStorage key for the last non-settings route the user visited.
 * Read by the Settings sidebar's back button so "Back" returns to where
 * the user actually came from, instead of stepping through internal
 * settings navigation history. */
export const LAST_CONTENT_ROUTE_KEY = "dg:last-content-route";

/**
 * NotesLayoutMarker - Marks the body element when in notes layout
 *
 * This component adds a data attribute to the body tag to signal
 * that we're in the notes layout, which triggers CSS to hide the
 * default navbar and adjust padding.
 *
 * Also: tracks the last non-settings pathname in sessionStorage so the
 * settings "Back" button can return the user to whatever content they
 * were viewing (a note, the home page, etc.) regardless of how many
 * settings sub-routes they navigated through.
 */
export function NotesLayoutMarker() {
  const pathname = usePathname();

  useEffect(() => {
    // Add data attribute to body when notes layout mounts
    document.body.setAttribute("data-notes-route", "true");

    // Remove it when unmounting (navigating away from notes)
    return () => {
      document.body.removeAttribute("data-notes-route");
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !pathname) return;
    // Only record routes outside the settings tree. The settings sidebar
    // back button reads this to return to the previous content view
    // rather than walking back through settings sub-pages.
    if (pathname.startsWith("/settings")) return;
    try {
      window.sessionStorage.setItem(LAST_CONTENT_ROUTE_KEY, pathname);
    } catch {
      // sessionStorage can throw in private mode / quota — silent OK,
      // we just fall back to `/` on next read.
    }
  }, [pathname]);

  return null; // This component doesn't render anything
}
