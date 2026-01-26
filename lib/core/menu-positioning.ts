/**
 * Menu Positioning Utility
 *
 * Provides boundary-aware positioning for context menus and dropdowns.
 * Implements flip + shift strategy to keep menus within viewport.
 *
 * Strategy:
 * 1. Try initial placement (e.g., bottom-right of click point)
 * 2. If clipping detected, flip placement (e.g., top-left)
 * 3. If still clipping, shift position to fit
 * 4. Apply padding from viewport edges
 *
 * Usage Pattern:
 * ```typescript
 * // 1. Portal rendering (to bypass parent overflow)
 * const menuContent = <div ref={menuRef}>...</div>;
 * return createPortal(menuContent, document.body);
 *
 * // 2. Two-phase rendering (measure then position)
 * useEffect(() => {
 *   if (!isOpen || !menuRef.current) return;
 *   const menuRect = menuRef.current.getBoundingClientRect();
 *   const position = calculateMenuPosition({
 *     triggerPosition: { x: clickX, y: clickY },
 *     menuDimensions: { width: menuRect.width, height: menuRect.height },
 *   });
 *   setMenuPosition(position);
 * }, [isOpen]);
 *
 * // 3. Apply position with max-height fallback
 * <div style={{
 *   left: `${menuPosition.x}px`,
 *   top: `${menuPosition.y}px`,
 *   maxHeight: `${menuPosition.maxHeight}px`,
 *   overflow: 'auto'
 * }} />
 * ```
 *
 * See: components/content/context-menu/ContextMenu.tsx for full example
 */

export interface MenuDimensions {
  width: number;
  height: number;
}

export interface MenuPosition {
  x: number;
  y: number;
}

export interface CalculatePositionOptions {
  /** Click/trigger position */
  triggerPosition: MenuPosition;
  /** Menu dimensions (width, height) */
  menuDimensions: MenuDimensions;
  /** Padding from viewport edges (default: 8px) */
  viewportPadding?: number;
  /** Preferred horizontal placement (default: "right") */
  preferredPlacementX?: "left" | "right";
  /** Preferred vertical placement (default: "bottom") */
  preferredPlacementY?: "top" | "bottom";
}

export interface CalculatedPosition {
  x: number;
  y: number;
  maxHeight: number;
}

/**
 * Calculate optimal menu position with boundary detection
 *
 * Returns final position with flip + shift applied to keep menu in viewport.
 * Also returns maxHeight to enable scrolling when vertical space is limited.
 */
export function calculateMenuPosition({
  triggerPosition,
  menuDimensions,
  viewportPadding = 8,
  preferredPlacementX = "right",
  preferredPlacementY = "bottom",
}: CalculatePositionOptions): CalculatedPosition {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let x = triggerPosition.x;
  let y = triggerPosition.y;

  // --- Horizontal positioning with flip ---
  if (preferredPlacementX === "right") {
    // Try placing to the right of cursor
    x = triggerPosition.x;

    // Check if menu would overflow right edge
    if (x + menuDimensions.width + viewportPadding > viewportWidth) {
      // Flip to left side
      x = triggerPosition.x - menuDimensions.width;

      // If still clipping on left, shift right to fit
      if (x < viewportPadding) {
        x = viewportPadding;
      }
    }
  } else {
    // Try placing to the left of cursor
    x = triggerPosition.x - menuDimensions.width;

    // Check if menu would overflow left edge
    if (x < viewportPadding) {
      // Flip to right side
      x = triggerPosition.x;

      // If still clipping on right, shift left to fit
      if (x + menuDimensions.width + viewportPadding > viewportWidth) {
        x = viewportWidth - menuDimensions.width - viewportPadding;
      }
    }
  }

  // --- Vertical positioning with flip ---
  if (preferredPlacementY === "bottom") {
    // Try placing below cursor
    y = triggerPosition.y;

    // Check if menu would overflow bottom edge
    if (y + menuDimensions.height + viewportPadding > viewportHeight) {
      // Flip to top side
      y = triggerPosition.y - menuDimensions.height;

      // If still clipping on top, shift down to fit
      if (y < viewportPadding) {
        y = viewportPadding;
      }
    }
  } else {
    // Try placing above cursor
    y = triggerPosition.y - menuDimensions.height;

    // Check if menu would overflow top edge
    if (y < viewportPadding) {
      // Flip to bottom side
      y = triggerPosition.y;

      // If still clipping on bottom, shift up to fit
      if (y + menuDimensions.height + viewportPadding > viewportHeight) {
        y = viewportHeight - menuDimensions.height - viewportPadding;
      }
    }
  }

  // --- Calculate max height to enable scrolling ---
  // Menu should never exceed viewport height minus padding on both sides
  const availableHeight = viewportHeight - y - viewportPadding;
  const maxHeight = Math.min(
    availableHeight,
    viewportHeight - viewportPadding * 2
  );

  return {
    x: Math.max(viewportPadding, x),
    y: Math.max(viewportPadding, y),
    maxHeight: Math.max(100, maxHeight), // Minimum 100px height
  };
}

/**
 * Calculate submenu position (positioned to the right of parent menu item)
 *
 * Special case for submenus that appear to the right of parent menu.
 */
export function calculateSubmenuPosition({
  parentMenuRect,
  parentItemRect,
  submenuDimensions,
  viewportPadding = 8,
}: {
  parentMenuRect: DOMRect;
  parentItemRect: DOMRect;
  submenuDimensions: MenuDimensions;
  viewportPadding?: number;
}): CalculatedPosition {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Default: Position to the right of parent menu, aligned with clicked item
  let x = parentMenuRect.right + 4; // 4px gap
  let y = parentItemRect.top;

  // Check if submenu would overflow right edge
  if (x + submenuDimensions.width + viewportPadding > viewportWidth) {
    // Flip to left side of parent menu
    x = parentMenuRect.left - submenuDimensions.width - 4;

    // If still clipping on left, position at viewport edge
    if (x < viewportPadding) {
      x = viewportPadding;
    }
  }

  // Check if submenu would overflow bottom edge
  if (y + submenuDimensions.height + viewportPadding > viewportHeight) {
    // Shift up to fit
    y = viewportHeight - submenuDimensions.height - viewportPadding;

    // Ensure not clipping top
    if (y < viewportPadding) {
      y = viewportPadding;
    }
  }

  // Calculate max height
  const availableHeight = viewportHeight - y - viewportPadding;
  const maxHeight = Math.min(
    availableHeight,
    viewportHeight - viewportPadding * 2
  );

  return {
    x: Math.max(viewportPadding, x),
    y: Math.max(viewportPadding, y),
    maxHeight: Math.max(100, maxHeight),
  };
}
