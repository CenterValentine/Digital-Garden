/**
 * ContextMenu Component
 *
 * Universal context menu that adapts based on which panel triggered it.
 * Uses action providers to dynamically generate menu items.
 *
 * Features:
 * - Panel-aware (file-tree, main-editor, right-sidebar)
 * - Sub-menu support (hover to expand)
 * - Keyboard shortcuts display
 * - Destructive action styling
 * - Section dividers
 * - Click-outside to close
 * - Escape key to close
 *
 * M4: File Tree Completion - Context Menu Infrastructure
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";
import { useContextMenuStore } from "@/state/context-menu-store";
import type { ContextMenuActionProvider, ContextMenuAction } from "./types";
import { calculateMenuPosition, calculateSubmenuPosition } from "@/lib/core/menu-positioning";

interface ContextMenuProps {
  /** Action providers for each panel type */
  actionProviders: Partial<Record<string, ContextMenuActionProvider>>;
}

/**
 * MenuAction Component - Renders individual menu action with optional submenu
 */
function MenuAction({
  action,
  onClose,
  onSubmenuOpen,
  onSubmenuClose,
  openSubmenuId,
}: {
  action: ContextMenuAction;
  onClose: () => void;
  onSubmenuOpen: (actionId: string, rect: DOMRect) => void;
  onSubmenuClose: () => void;
  openSubmenuId: string | null;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hasSubmenu = action.submenu && action.submenu.length > 0;
  const isSubmenuOpen = openSubmenuId === action.id;

  const handleMouseEnter = () => {
    if (hasSubmenu && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      onSubmenuOpen(action.id, rect);
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={async () => {
          if (!hasSubmenu && action.onClick) {
            await action.onClick();
            onClose();
          }
        }}
        onMouseEnter={handleMouseEnter}
        disabled={action.disabled && !hasSubmenu}
        className={`
          flex w-full items-center justify-between gap-3 px-2.5 py-1 text-left text-sm transition-colors
          ${action.disabled && !hasSubmenu
            ? "cursor-not-allowed opacity-40"
            : action.destructive
              ? "text-gray-900 hover:bg-red-500/10 hover:text-red-600 dark:text-gray-100 dark:hover:text-red-400"
              : "text-gray-900 hover:bg-primary/10 hover:text-primary dark:text-gray-100"
          }
        `}
      >
        {/* Left: Icon + Label */}
        <div className="flex items-center gap-2">
          {action.icon && <span className="flex-shrink-0 text-current opacity-70">{action.icon}</span>}
          <span className={action.destructive ? "text-red-600 dark:text-red-400" : ""}>
            {action.label}
          </span>
        </div>

        {/* Right: Keyboard shortcut or chevron for submenu */}
        {hasSubmenu ? (
          <ChevronRight className="h-3 w-3 text-gray-400 dark:text-gray-500" />
        ) : action.shortcut ? (
          <span className="text-[11px] text-gray-400 dark:text-gray-500">
            {action.shortcut}
          </span>
        ) : null}
      </button>

      {/* Divider after item */}
      {action.divider && (
        <div className="my-0.5 border-t border-gray-200/50 dark:border-gray-700/50" />
      )}
    </div>
  );
}

/**
 * SubMenu Component - Renders submenu items (supports nested submenus)
 */
function SubMenu({
  actions,
  position,
  onClose,
  onMouseEnter,
  onMouseLeave,
  submenuRef,
}: {
  actions: ContextMenuAction[];
  position: { x: number; y: number; maxHeight?: number };
  onClose: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  submenuRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const localSubmenuRef = useRef<HTMLDivElement>(null);
  const refToUse = submenuRef || localSubmenuRef;
  const [mounted, setMounted] = useState(false);
  const [nestedSubmenu, setNestedSubmenu] = useState<{
    id: string;
    position: { x: number; y: number };
    maxHeight?: number;
  } | null>(null);
  const nestedSubmenuCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleNestedSubmenuOpen = (actionId: string, buttonRect: DOMRect) => {
    // Cancel any pending close
    if (nestedSubmenuCloseTimeoutRef.current) {
      clearTimeout(nestedSubmenuCloseTimeoutRef.current);
      nestedSubmenuCloseTimeoutRef.current = null;
    }

    // Find nested submenu actions
    const action = actions.find(a => a.id === actionId);
    if (!action || !action.submenu || action.submenu.length === 0) return;

    // Calculate nested submenu position
    const parentRect = refToUse.current?.getBoundingClientRect();
    if (!parentRect) return;

    const estimatedHeight = Math.min(action.submenu.length * 32 + 8, 400);
    const estimatedWidth = 180;

    const calculatedPosition = calculateSubmenuPosition({
      parentMenuRect: parentRect,
      parentItemRect: buttonRect,
      submenuDimensions: {
        width: estimatedWidth,
        height: estimatedHeight,
      },
      viewportPadding: 8,
    });

    setNestedSubmenu({
      id: actionId,
      position: {
        x: calculatedPosition.x,
        y: calculatedPosition.y,
      },
      maxHeight: calculatedPosition.maxHeight,
    });
  };

  const handleNestedSubmenuClose = () => {
    nestedSubmenuCloseTimeoutRef.current = setTimeout(() => {
      setNestedSubmenu(null);
    }, 200);
  };

  const handleNestedSubmenuMouseEnter = () => {
    if (nestedSubmenuCloseTimeoutRef.current) {
      clearTimeout(nestedSubmenuCloseTimeoutRef.current);
      nestedSubmenuCloseTimeoutRef.current = null;
    }
  };

  const submenuContent = (
    <div
      ref={refToUse}
      className="fixed z-[130] min-w-[180px] rounded-md border border-white/20 bg-white/95 shadow-lg backdrop-blur-sm dark:bg-gray-900/95 overflow-y-auto"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        maxHeight: `${position.maxHeight || 400}px`,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="py-0.5">
        {actions.map((subAction) => (
          <MenuAction
            key={subAction.id}
            action={subAction}
            onClose={onClose}
            onSubmenuOpen={handleNestedSubmenuOpen}
            onSubmenuClose={handleNestedSubmenuClose}
            openSubmenuId={nestedSubmenu?.id || null}
          />
        ))}
      </div>

      {/* Render nested submenu if open */}
      {nestedSubmenu && (() => {
        const action = actions.find(a => a.id === nestedSubmenu.id);
        if (!action || !action.submenu) return null;

        return (
          <SubMenu
            actions={action.submenu}
            position={nestedSubmenu.position}
            onClose={onClose}
            onMouseEnter={handleNestedSubmenuMouseEnter}
            onMouseLeave={handleNestedSubmenuClose}
          />
        );
      })()}
    </div>
  );

  // Render submenu in a portal to bypass any parent positioning issues
  if (!mounted) return null;
  return createPortal(submenuContent, document.body);
}

export function ContextMenu({ actionProviders }: ContextMenuProps) {
  const { isOpen, position, panel, context, closeMenu } = useContextMenuStore();
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const [openSubmenu, setOpenSubmenu] = useState<{ id: string; position: { x: number; y: number }; maxHeight: number } | null>(null);
  const submenuCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number; maxHeight: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const isClickInMenu = menuRef.current?.contains(target);
      const isClickInSubmenu = submenuRef.current?.contains(target);

      // Only close if click is outside BOTH the menu and submenu
      if (!isClickInMenu && !isClickInSubmenu) {
        closeMenu();
      }
    };

    // Small delay to prevent immediate closing when menu opens
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, closeMenu]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeMenu();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, closeMenu]);

  // Reset submenu state when menu closes
  useEffect(() => {
    if (!isOpen) {
      setOpenSubmenu(null);
      setMenuPosition(null);
      // Clear any pending submenu close timeout
      if (submenuCloseTimeoutRef.current) {
        clearTimeout(submenuCloseTimeoutRef.current);
        submenuCloseTimeoutRef.current = null;
      }
    }
  }, [isOpen]);

  // Calculate menu position when menu opens or when dimensions change
  useEffect(() => {
    if (!isOpen || !position || !menuRef.current) return;

    // Wait for menu to render and get dimensions
    const timeoutId = setTimeout(() => {
      if (!menuRef.current) return;

      const menuRect = menuRef.current.getBoundingClientRect();
      const calculatedPosition = calculateMenuPosition({
        triggerPosition: position,
        menuDimensions: {
          width: menuRect.width,
          height: menuRect.height,
        },
        viewportPadding: 8,
        preferredPlacementX: "right",
        preferredPlacementY: "bottom",
      });

      setMenuPosition(calculatedPosition);
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [isOpen, position]);

  // Set mounted state for portal rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render if closed or no position
  if (!isOpen || !position || !panel) return null;

  // Get action provider for current panel
  const provider = actionProviders[panel];
  if (!provider) return null;

  // Get sections from provider
  const sections = provider(context || {});
  if (sections.length === 0) return null;

  const handleSubmenuOpen = (actionId: string, buttonRect: DOMRect) => {
    // Get parent menu container's position
    const menuRect = menuRef.current?.getBoundingClientRect();
    if (!menuRect) return;

    // Find the submenu actions to get dimensions
    const provider = actionProviders[panel || ""];
    if (!provider) return;
    const sections = provider(context || {});

    // Find the action with submenu
    let submenuActions: ContextMenuAction[] = [];
    for (const section of sections) {
      const action = section.actions.find(a => a.id === actionId);
      if (action && action.submenu) {
        submenuActions = action.submenu;
        break;
      }
    }

    if (submenuActions.length === 0) return;

    // Estimate submenu dimensions (will be refined after render)
    const estimatedHeight = Math.min(submenuActions.length * 32 + 8, 400);
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
      id: actionId,
      position: {
        x: calculatedPosition.x,
        y: calculatedPosition.y,
      },
      maxHeight: calculatedPosition.maxHeight,
    });
  };

  const handleSubmenuClose = () => {
    // Don't immediately close - give time to move mouse to submenu (200ms delay)
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

  // Initial render without positioning (to measure dimensions)
  const initialMenuStyle = !menuPosition
    ? {
        left: `${position.x}px`,
        top: `${position.y}px`,
        visibility: "hidden" as const,
      }
    : {
        left: `${menuPosition.x}px`,
        top: `${menuPosition.y}px`,
        maxHeight: `${menuPosition.maxHeight}px`,
      };

  const menuContent = (
    <div
      ref={menuRef}
      className="fixed z-[120] min-w-[180px] rounded-md border border-white/20 bg-white/95 shadow-lg backdrop-blur-sm dark:bg-gray-900/95 overflow-y-auto"
      style={initialMenuStyle}
      onMouseLeave={handleSubmenuClose}
    >
      {sections.map((section, sectionIndex) => (
        <div key={sectionIndex}>
          {/* Section title (optional) - compact styling */}
          {section.title && (
            <div className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {section.title}
            </div>
          )}

          {/* Section actions */}
          <div className="py-0.5">
            {section.actions.map((action) => (
              <div key={action.id}>
                <MenuAction
                  action={action}
                  onClose={closeMenu}
                  onSubmenuOpen={handleSubmenuOpen}
                  onSubmenuClose={handleSubmenuClose}
                  openSubmenuId={openSubmenu?.id || null}
                />

                {/* Render submenu if this action has one and it's open */}
                {action.submenu &&
                  action.submenu.length > 0 &&
                  openSubmenu?.id === action.id && (
                    <SubMenu
                      actions={action.submenu}
                      position={openSubmenu.position}
                      onClose={closeMenu}
                      onMouseEnter={handleSubmenuMouseEnter}
                      onMouseLeave={handleSubmenuClose}
                      submenuRef={submenuRef}
                    />
                  )}
              </div>
            ))}
          </div>

          {/* Divider between sections (except last) */}
          {sectionIndex < sections.length - 1 && (
            <div className="my-0.5 border-t border-gray-200/50 dark:border-gray-700/50" />
          )}
        </div>
      ))}
    </div>
  );

  // Render in portal to avoid clipping by parent containers
  if (!mounted) return null;
  return createPortal(menuContent, document.body);
}
