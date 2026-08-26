"use client";

/**
 * useAnchoredMenu — the mechanics behind a trigger-anchored dropdown that is
 * portaled to <body>.
 *
 * Why a portal + fixed position: the chat header, extension side panel and
 * main-panel title header all live inside `overflow-hidden` ancestors (and
 * some transformed ones), which clip or mis-offset an in-flow absolute menu.
 * The convention across the app's context menus is: read the trigger rect at
 * open time, run it through `calculateMenuPosition` (flip + shift into the
 * viewport), and render the menu with `position: fixed` under document.body.
 *
 * This hook only owns open state, position, refs and dismissal
 * (outside-mousedown / Escape). Callers render the trigger + menu themselves
 * — see `AssociatedContentChips` and `ContentPathBreadcrumb` for the shape.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { calculateMenuPosition, type CalculatedPosition } from "./menu-positioning";

interface UseAnchoredMenuOptions {
  /** Rendered menu width in px — used for viewport flip/shift math. */
  width: number;
  /** Upper bound for the menu height; the real height may be shorter. */
  maxHeight: number;
  /** Gap between the trigger's bottom edge and the menu (default 4px). */
  offset?: number;
}

export function useAnchoredMenu<
  TTrigger extends HTMLElement = HTMLButtonElement,
  TMenu extends HTMLElement = HTMLDivElement,
>({ width, maxHeight, offset = 4 }: UseAnchoredMenuOptions) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CalculatedPosition | null>(null);
  const triggerRef = useRef<TTrigger | null>(null);
  const menuRef = useRef<TMenu | null>(null);

  const close = useCallback(() => setOpen(false), []);

  // Position is computed in the event handler (not an effect): it's only
  // needed at the moment the menu opens, from the trigger's live rect.
  const openMenu = useCallback(() => {
    const trigger = triggerRef.current;
    if (trigger) {
      const rect = trigger.getBoundingClientRect();
      setPosition(
        calculateMenuPosition({
          triggerPosition: { x: rect.left, y: rect.bottom + offset },
          menuDimensions: { width, height: maxHeight },
          preferredPlacementX: "right",
          preferredPlacementY: "bottom",
        }),
      );
    }
    setOpen(true);
  }, [width, maxHeight, offset]);

  const toggle = useCallback(() => {
    if (open) close();
    else openMenu();
  }, [open, close, openMenu]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const menuStyle: CSSProperties | undefined = position
    ? {
        position: "fixed",
        left: position.x,
        top: position.y,
        width,
        maxHeight: position.maxHeight,
      }
    : undefined;

  return { open, toggle, close, triggerRef, menuRef, menuStyle };
}
