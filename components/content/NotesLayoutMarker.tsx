"use client";

import { useEffect } from "react";

/**
 * NotesLayoutMarker - Marks the body element when in notes layout
 *
 * This component adds a data attribute to the body tag to signal
 * that we're in the notes layout, which triggers CSS to hide the
 * default navbar and adjust padding.
 */
export function NotesLayoutMarker() {
  useEffect(() => {
    // Add data attribute to body when notes layout mounts
    document.body.setAttribute("data-notes-route", "true");

    // Remove it when unmounting (navigating away from notes)
    return () => {
      document.body.removeAttribute("data-notes-route");
    };
  }, []);

  return null; // This component doesn't render anything
}
