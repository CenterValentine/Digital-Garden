"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  OverlayScrollbarsComponent,
  type OverlayScrollbarsComponentRef,
} from "overlayscrollbars-react";
import "overlayscrollbars/overlayscrollbars.css";

export interface GlassyScrollProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /**
   * Control which axes are scrollable.
   * - "y" (default) — vertical only (horizontal hidden)
   * - "x" — horizontal only (vertical hidden)
   * - "both" — both axes
   */
  axis?: "y" | "x" | "both";
  /**
   * Visibility behavior of the scrollbar.
   * - "scroll" (default) — visible only while scrolling, fades out after idle
   * - "hover" — also visible on container hover
   * - "leave" — visible always until pointer leaves the host
   */
  visibility?: "scroll" | "hover" | "leave";
  /**
   * Make the wrapper expose a native scroll interface to children. Defaults to true.
   * Set false only if you need the legacy DOM exactly preserved.
   */
  defer?: boolean;
}

export interface GlassyScrollHandle {
  /** The element that actually scrolls (use for `.scrollIntoView()`, scroll listeners, etc.) */
  getScrollElement: () => HTMLElement | null;
  /** Force the library to recompute layout (e.g. after dynamic content insertion). */
  update: () => void;
}

/**
 * GlassyScroll
 *
 * Surgical wrapper around OverlayScrollbars that hides the native scrollbar and
 * renders a custom glassy thumb that fades in on scroll, animates a sheen, and
 * fades out when idle. Apply only to surfaces where the polish matters — the
 * default native scrollbar is fine elsewhere.
 *
 * The host element gets `flex-1 min-h-0` semantics by default — wrap inside a
 * flex parent for it to size correctly.
 */
export const GlassyScroll = forwardRef<GlassyScrollHandle, GlassyScrollProps>(
  function GlassyScroll(
    { children, className = "", style, axis = "y", visibility = "scroll", defer = true },
    ref
  ) {
    const osRef = useRef<OverlayScrollbarsComponentRef | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        getScrollElement: () => osRef.current?.osInstance()?.elements().viewport ?? null,
        update: () => {
          osRef.current?.osInstance()?.update(true);
        },
      }),
      []
    );

    return (
      <OverlayScrollbarsComponent
        ref={osRef}
        defer={defer}
        className={`os-theme-glassy ${className}`}
        style={style}
        options={{
          scrollbars: {
            theme: "os-theme-glassy",
            visibility: "auto",
            autoHide: visibility === "leave" ? "leave" : visibility === "hover" ? "move" : "scroll",
            autoHideDelay: 600,
            autoHideSuspend: true,
            dragScroll: true,
            clickScroll: false,
            pointers: ["mouse", "touch", "pen"],
          },
          overflow: {
            x: axis === "y" ? "hidden" : "scroll",
            y: axis === "x" ? "hidden" : "scroll",
          },
        }}
      >
        {children}
      </OverlayScrollbarsComponent>
    );
  }
);
