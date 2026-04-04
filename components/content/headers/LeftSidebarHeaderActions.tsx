/**
 * Left Sidebar Header Actions (Client Component)
 *
 * Interactive buttons for creating folders and notes inline.
 * Uses shared menu configuration from new-content-menu.tsx
 */

"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Plus, ChevronRight } from "lucide-react";
import { calculateMenuPosition, calculateSubmenuPosition } from "@/lib/core/menu-positioning";
import {
  getNewContentMenuItems,
  type NewContentCallbacks,
  type NewContentMenuItem,
} from "@/components/content/menu-items/new-content-menu";

interface LeftSidebarHeaderActionsProps extends NewContentCallbacks {
  disabled?: boolean;
}

/**
 * MenuItem Component - Renders individual menu item with optional submenu
 */
function MenuItem({
  item,
  index,
  totalItems,
  onSubmenuOpen,
  isSubmenuOpen,
  openSubmenuData,
  onMenuClose,
  onSubmenuMouseEnter,
  onSubmenuMouseLeave,
}: {
  item: NewContentMenuItem;
  index: number;
  totalItems: number;
  onSubmenuOpen: (itemId: string, rect: DOMRect) => void;
  isSubmenuOpen: boolean;
  openSubmenuData: { id: string; position: { x: number; y: number }; maxHeight: number } | null;
  onMenuClose: () => void;
  onSubmenuMouseEnter: () => void;
  onSubmenuMouseLeave: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hasSubmenu = item.submenu && item.submenu.length > 0;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => {
          if (!hasSubmenu && item.onClick) {
            item.onClick();
          }
        }}
        onMouseEnter={() => {
          if (hasSubmenu && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            onSubmenuOpen(item.id, rect);
          }
        }}
        disabled={item.disabled && !hasSubmenu}
        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-sm text-left text-white hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          index === 0 ? "first:rounded-t-md" : "border-t border-white/5"
        } ${index === totalItems - 1 ? "last:rounded-b-md" : ""}`}
      >
        <div className="flex items-center gap-2">
          {item.icon}
          <span>{item.label}</span>
        </div>

        {/* Show chevron or shortcut */}
        {hasSubmenu ? (
          <ChevronRight className="h-3 w-3 text-gray-400" />
        ) : item.shortcut ? (
          <span className="text-[11px] text-gray-400">{item.shortcut}</span>
        ) : null}
      </button>

      {/* Render submenu if this item has one and it's open */}
      {hasSubmenu && isSubmenuOpen && openSubmenuData && (
        <SubMenu
          items={item.submenu!}
          position={openSubmenuData.position}
          maxHeight={openSubmenuData.maxHeight}
          onClose={onMenuClose}
          onMouseEnter={onSubmenuMouseEnter}
          onMouseLeave={onSubmenuMouseLeave}
        />
      )}
    </div>
  );
}

/**
 * SubMenu Component - Renders submenu items in a portal
 */
function SubMenu({
  items,
  position,
  maxHeight,
  onClose,
  onMouseEnter,
  onMouseLeave,
}: {
  items: NewContentMenuItem[];
  position: { x: number; y: number };
  maxHeight: number;
  onClose: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const submenuRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const submenuContent = (
    <div
      ref={submenuRef}
      className="fixed z-[120] min-w-[180px] rounded-md border border-white/10 bg-[#1a1a1a] shadow-lg overflow-y-auto"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        maxHeight: `${maxHeight}px`,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {items.map((subItem, index) => (
        <button
          key={subItem.id}
          onClick={() => {
            if (subItem.onClick) {
              subItem.onClick();
              onClose();
            }
          }}
          disabled={subItem.disabled}
          className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-left text-white hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            index === 0 ? "first:rounded-t-md" : "border-t border-white/5"
          } ${index === items.length - 1 ? "last:rounded-b-md" : ""}`}
        >
          {subItem.icon}
          <span>{subItem.label}</span>
          {subItem.shortcut && (
            <span className="ml-auto text-[11px] text-gray-400">{subItem.shortcut}</span>
          )}
        </button>
      ))}
    </div>
  );

  // Render submenu in a portal to bypass any parent positioning issues
  if (!mounted) return null;
  return createPortal(submenuContent, document.body);
}

export function LeftSidebarHeaderActions({
  disabled = false,
  ...callbacks
}: LeftSidebarHeaderActionsProps) {
  const [showMenu, setShowMenu] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number; maxHeight: number } | null>(null);
  const [openSubmenu, setOpenSubmenu] = useState<{ id: string; position: { x: number; y: number }; maxHeight: number } | null>(null);
  const submenuCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [mounted, setMounted] = useState(false);

  // Set mounted state for portal rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate menu position when menu opens
  useEffect(() => {
    if (!showMenu || !buttonRef.current || !menuRef.current) return;

    const buttonRect = buttonRef.current.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();

    const calculatedPosition = calculateMenuPosition({
      triggerPosition: {
        x: buttonRect.right, // Align to right edge of button
        y: buttonRect.bottom + 4, // Position below button with 4px gap
      },
      menuDimensions: {
        width: menuRect.width,
        height: menuRect.height,
      },
      viewportPadding: 8,
      preferredPlacementX: "left", // Prefer left alignment (so right edge aligns with button)
      preferredPlacementY: "bottom", // Prefer below button
    });

    setMenuPosition(calculatedPosition);
  }, [showMenu]);

  // Reset position and submenu when menu closes
  useEffect(() => {
    if (!showMenu) {
      setMenuPosition(null);
      setOpenSubmenu(null);
      // Clear any pending submenu close timeout
      if (submenuCloseTimeoutRef.current) {
        clearTimeout(submenuCloseTimeoutRef.current);
        submenuCloseTimeoutRef.current = null;
      }
    }
  }, [showMenu]);

  // Submenu handlers
  const handleSubmenuOpen = (itemId: string, buttonRect: DOMRect) => {
    const menuRect = menuRef.current?.getBoundingClientRect();
    if (!menuRect) return;

    // Find the submenu items
    const item = menuItems.find(i => i.id === itemId);
    if (!item || !item.submenu || item.submenu.length === 0) return;

    // Estimate submenu dimensions
    const estimatedHeight = Math.min(item.submenu.length * 32 + 8, 400);
    const estimatedWidth = 180;

    const calculatedPosition = calculateSubmenuPosition({
      parentMenuRect: menuRect,
      parentItemRect: buttonRect,
      submenuDimensions: {
        width: estimatedWidth,
        height: estimatedHeight,
      },
      viewportPadding: 8,
    });

    setOpenSubmenu({
      id: itemId,
      position: {
        x: calculatedPosition.x,
        y: calculatedPosition.y,
      },
      maxHeight: calculatedPosition.maxHeight,
    });
  };

  const handleSubmenuClose = () => {
    // Don't immediately close - give time to move mouse to submenu
    submenuCloseTimeoutRef.current = setTimeout(() => {
      setOpenSubmenu(null);
    }, 200);
  };

  const handleSubmenuMouseEnter = () => {
    // Cancel any pending close timeout when mouse enters submenu
    if (submenuCloseTimeoutRef.current) {
      clearTimeout(submenuCloseTimeoutRef.current);
      submenuCloseTimeoutRef.current = null;
    }
  };

  // Generate menu items from shared configuration
  // Wrap callbacks to close menu after action
  const wrappedCallbacks: NewContentCallbacks = Object.fromEntries(
    Object.entries(callbacks).map(([key, callback]) => [
      key,
      callback
        ? (parentId: string | null) => {
            setShowMenu(false);
            return callback(parentId);
          }
        : undefined,
    ])
  ) as NewContentCallbacks;

  const menuItems = getNewContentMenuItems(wrappedCallbacks, null);

  // Initial render without positioning (to measure dimensions)
  const menuStyle = !menuPosition
    ? {
        left: 0,
        top: 0,
        visibility: "hidden" as const,
      }
    : {
        left: `${menuPosition.x}px`,
        top: `${menuPosition.y}px`,
        maxHeight: `${menuPosition.maxHeight}px`,
      };

  const menuContent = showMenu && !disabled && (
    <>
      {/* Backdrop - higher z-index to cover all panels */}
      <div
        className="fixed inset-0 z-[100]"
        onClick={() => setShowMenu(false)}
      />

      {/* Menu - even higher z-index to appear above backdrop */}
      <div
        ref={menuRef}
        className="fixed z-[110] min-w-[180px] max-h-[400px] rounded-md border border-white/10 bg-[#1a1a1a] shadow-lg overflow-y-auto"
        style={menuStyle}
        onMouseLeave={handleSubmenuClose}
      >
        {menuItems.map((item, index) => (
          <MenuItem
            key={item.id}
            item={item}
            index={index}
            totalItems={menuItems.length}
            onSubmenuOpen={handleSubmenuOpen}
            isSubmenuOpen={openSubmenu?.id === item.id}
            openSubmenuData={openSubmenu}
            onMenuClose={() => setShowMenu(false)}
            onSubmenuMouseEnter={handleSubmenuMouseEnter}
            onSubmenuMouseLeave={handleSubmenuClose}
          />
        ))}
      </div>
    </>
  );

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => !disabled && setShowMenu(!showMenu)}
        disabled={disabled}
        className="rounded p-1 transition-colors hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
        title={disabled ? "Cannot create when multiple items are selected" : "New file or folder"}
      >
        <Plus className="h-4 w-4" />
      </button>

      {/* Render menu in portal to avoid clipping */}
      {mounted && menuContent && createPortal(menuContent, document.body)}
    </>
  );
}
