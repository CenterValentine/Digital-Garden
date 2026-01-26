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
import { useContextMenuStore } from "@/stores/context-menu-store";
import type { ContextMenuActionProvider, ContextMenuAction } from "./types";

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
 * SubMenu Component - Renders submenu items
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
  position: { x: number; y: number };
  onClose: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  submenuRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const localSubmenuRef = useRef<HTMLDivElement>(null);
  const refToUse = submenuRef || localSubmenuRef;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);


  const submenuContent = (
    <div
      ref={refToUse}
      className="fixed z-[60] min-w-[180px] rounded-md border border-white/20 bg-white/95 shadow-lg backdrop-blur-sm dark:bg-gray-900/95"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="py-0.5">
        {actions.map((subAction) => (
          <button
            key={subAction.id}
            onClick={async () => {
              console.log("[SubMenu] Button clicked:", subAction.id, "hasOnClick:", !!subAction.onClick);
              if (subAction.onClick) {
                await subAction.onClick();
                onClose();
              }
            }}
            disabled={subAction.disabled}
            className={`
              flex w-full items-center justify-between gap-3 px-2.5 py-1 text-left text-sm transition-colors
              ${subAction.disabled
                ? "cursor-not-allowed opacity-40"
                : subAction.destructive
                  ? "text-gray-900 hover:bg-red-500/10 hover:text-red-600 dark:text-gray-100 dark:hover:text-red-400"
                  : "text-gray-900 hover:bg-primary/10 hover:text-primary dark:text-gray-100"
              }
            `}
          >
            {/* Left: Icon + Label */}
            <div className="flex items-center gap-2">
              {subAction.icon && <span className="flex-shrink-0 text-current opacity-70">{subAction.icon}</span>}
              <span className={subAction.destructive ? "text-red-600 dark:text-red-400" : ""}>
                {subAction.label}
              </span>
            </div>

            {/* Right: Keyboard shortcut */}
            {subAction.shortcut && (
              <span className="text-[11px] text-gray-400 dark:text-gray-500">
                {subAction.shortcut}
              </span>
            )}
          </button>
        ))}
      </div>
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
  const [openSubmenu, setOpenSubmenu] = useState<{ id: string; position: { x: number; y: number } } | null>(null);
  const submenuCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
      // Clear any pending submenu close timeout
      if (submenuCloseTimeoutRef.current) {
        clearTimeout(submenuCloseTimeoutRef.current);
        submenuCloseTimeoutRef.current = null;
      }
    }
  }, [isOpen]);

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

    // Position submenu directly to the right of parent menu container
    // Use parent menu's right edge (not button's right edge)
    const submenuX = menuRect.right + 4; // 4px gap
    const submenuY = buttonRect.top;     // Align with button vertically

    setOpenSubmenu({
      id: actionId,
      position: {
        x: submenuX,
        y: submenuY,
      },
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

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] rounded-md border border-white/20 bg-white/95 shadow-lg backdrop-blur-sm dark:bg-gray-900/95"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
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
}
