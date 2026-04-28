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

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Check, X } from "lucide-react";
import { useContextMenuStore } from "@/state/context-menu-store";
import type { ContextMenuActionProvider, ContextMenuAction } from "./types";
import { calculateMenuPosition, calculateSubmenuPosition } from "@/lib/core/menu-positioning";

interface ContextMenuProps {
  /** Action providers for each panel type */
  actionProviders: Partial<Record<string, ContextMenuActionProvider>>;
}

const SUBMENU_HOVER_BRIDGE_PX = 12;

/**
 * MenuAction Component - Renders individual menu action with optional submenu.
 * Supports inline input mode: clicking an action with `inlineInput` transforms
 * it into a text input + confirm button without closing the menu.
 */
function MenuAction({
  action,
  onClose,
  onSubmenuOpen,
  onSubmenuClose,
  openSubmenuId,
  onReplaceActions,
}: {
  action: ContextMenuAction;
  onClose: () => void;
  onSubmenuOpen: (actionId: string, rect: DOMRect) => void;
  onSubmenuClose: () => void;
  openSubmenuId: string | null;
  /** When inline submit returns new actions, replace the parent submenu's items */
  onReplaceActions?: (actions: ContextMenuAction[]) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasSubmenu = action.submenu && action.submenu.length > 0;
  const [isInputMode, setIsInputMode] = useState(action.inlineInput?.autoFocus ?? false);
  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleMouseEnter = () => {
    if (hasSubmenu && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      onSubmenuOpen(action.id, rect);
    }
  };

  // Pre-fill and select input when entering input mode
  useEffect(() => {
    if (isInputMode && action.inlineInput) {
      // Pre-fill with placeholder value so user can accept as-is
      if (!inputValue && action.inlineInput.placeholder) {
        setInputValue(action.inlineInput.placeholder);
      }
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select(); // Select all so user can type to replace
      }, 50);
    }
  }, [isInputMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInlineSubmit = useCallback(async () => {
    const val = inputValue.trim();
    if (!val || !action.inlineInput || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const result = await action.inlineInput.onSubmit(val);
      // If onSubmit returns new actions, replace the submenu instead of closing
      if (Array.isArray(result) && onReplaceActions) {
        onReplaceActions(result);
        setIsSubmitting(false);
        setIsInputMode(false);
        setInputValue("");
        return;
      }
      // Normal flow — close menu
      setIsSubmitting(false);
      setIsInputMode(false);
      setInputValue("");
      onClose();
    } catch {
      setIsSubmitting(false);
      setIsInputMode(false);
      setInputValue("");
      onClose();
    }
  }, [inputValue, action.inlineInput, isSubmitting, onClose, onReplaceActions]);

  // Divider-only item — render as a clean horizontal line
  if (action.divider && !action.label) {
    return <div className="my-1 mx-2 border-t border-gray-200 dark:border-gray-700" />;
  }

  // Section label above the action
  const sectionLabelEl = action.sectionLabel ? (
    <div className="px-2.5 pt-1.5 pb-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
      {action.sectionLabel}
    </div>
  ) : null;

  // Inline input mode rendering
  if (isInputMode && action.inlineInput) {
    return (
      <>
        {sectionLabelEl}
        {action.inlineInput.inputLabel && (
          <>
            <div className="mx-2 mt-1 border-t border-gray-200 dark:border-gray-700" />
            <div className="px-2.5 pt-1.5 pb-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {action.inlineInput.inputLabel}
            </div>
          </>
        )}
        <div className="px-1.5 py-1">
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") handleInlineSubmit();
                if (e.key === "Escape") {
                  setIsInputMode(false);
                  setInputValue("");
                }
              }}
              placeholder={action.inlineInput.placeholder}
              disabled={isSubmitting}
              className="flex-1 min-w-0 px-2 py-1 text-xs rounded bg-gray-100 border border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none dark:bg-white/10 dark:border-white/20 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-white/40 disabled:opacity-50"
            />
            <button
              onClick={handleInlineSubmit}
              disabled={!inputValue.trim() || isSubmitting}
              className="flex-shrink-0 p-1 rounded hover:bg-gray-200 dark:hover:bg-white/10 text-green-600 dark:text-green-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
    {sectionLabelEl}
    <div className="relative group/action">
      <div className="flex items-center">
        <button
          ref={buttonRef}
          onClick={async () => {
            // If this action has inline input config, enter input mode instead
            if (action.inlineInput) {
              setIsInputMode(true);
              return;
            }
            if (!hasSubmenu && action.onClick) {
              await action.onClick();
              onClose();
            }
          }}
          onMouseEnter={handleMouseEnter}
          disabled={action.disabled && !hasSubmenu}
          className={`
            flex flex-1 min-w-0 items-center justify-between gap-3 px-2.5 py-1 text-left text-sm transition-colors
            ${action.disabled && !hasSubmenu
              ? "cursor-not-allowed opacity-40"
              : action.destructive
                ? "text-gray-900 hover:bg-red-500/10 hover:text-red-600 dark:text-gray-100 dark:hover:text-red-400"
                : "text-gray-900 hover:bg-primary/10 hover:text-primary dark:text-gray-100"
            }
          `}
        >
          {/* Left: Icon + Label */}
          <div className="flex items-center gap-2 min-w-0">
            {action.icon && <span className="flex-shrink-0 text-current opacity-70">{action.icon}</span>}
            <span className={`truncate ${action.destructive ? "text-red-600 dark:text-red-400" : ""}`}>
              {action.label}
            </span>
          </div>

          {/* Right: Keyboard shortcut or chevron for submenu */}
          {hasSubmenu ? (
            <ChevronRight className="h-3 w-3 flex-shrink-0 text-gray-400 dark:text-gray-500" />
          ) : action.shortcut ? (
            <span className="text-[11px] flex-shrink-0 text-gray-400 dark:text-gray-500">
              {action.shortcut}
            </span>
          ) : null}
        </button>

        {/* Secondary action (e.g., delete "x") — shown on hover */}
        {action.secondaryAction && (
          <button
            onClick={async (e) => {
              e.stopPropagation();
              await action.secondaryAction!.onClick();
              // Don't close — allow back-to-back deletes. Store refresh will update the menu.
            }}
            className="flex-shrink-0 p-1 mr-1 rounded opacity-0 group-hover/action:opacity-100 hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-all"
            title={action.secondaryAction.confirmLabel || "Remove"}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Divider after item */}
      {action.divider && (
        <div className="my-0.5 border-t border-gray-200/50 dark:border-gray-700/50" />
      )}
    </div>
    </>
  );
}

/**
 * SubMenu Component - Renders submenu items (supports nested submenus)
 */
function SubMenu({
  actions: initialActions,
  position,
  onClose,
  onMouseEnter,
  submenuRef,
  searchable,
}: {
  actions: ContextMenuAction[];
  position: { x: number; y: number; maxHeight?: number };
  onClose: () => void;
  onMouseEnter: () => void;
  submenuRef?: React.RefObject<HTMLDivElement | null>;
  searchable?: boolean;
}) {
  const localSubmenuRef = useRef<HTMLDivElement>(null);
  const refToUse = submenuRef || localSubmenuRef;
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const [dynamicActions, setDynamicActions] = useState<ContextMenuAction[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const rawActions = dynamicActions || initialActions;

  // Filter actions by search query
  const actions = (() => {
    if (!searchable || !searchQuery.trim()) return rawActions;
    const q = searchQuery.toLowerCase();
    return rawActions.flatMap((action) => {
      // Skip dividers/disabled headers
      if (action.divider && !action.label) return [action];
      // If action has a submenu, filter its children
      if (action.submenu && action.submenu.length > 0) {
        const filtered = action.submenu.filter((sub) =>
          sub.label.toLowerCase().includes(q),
        );
        if (filtered.length === 0) return [];
        return [{ ...action, submenu: filtered }];
      }
      // Direct action — match label
      if (action.label.toLowerCase().includes(q)) return [action];
      return [];
    });
  })();

  // Auto-focus search input when searchable
  useEffect(() => {
    if (searchable && mounted) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [searchable, mounted]);

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
      data-context-menu
      className="fixed z-[130] overflow-visible"
      style={{
        left: `${position.x - SUBMENU_HOVER_BRIDGE_PX}px`,
        top: `${position.y}px`,
        paddingLeft: `${SUBMENU_HOVER_BRIDGE_PX}px`,
      }}
      onMouseEnter={onMouseEnter}
    >
      <div
        ref={refToUse}
        data-context-menu
        className="min-w-[180px] rounded-md border border-white/20 bg-white/95 shadow-lg backdrop-blur-sm dark:bg-gray-900/95 overflow-y-auto"
        style={{
          maxHeight: `${position.maxHeight || 400}px`,
        }}
      >
        {searchable && (
          <div className="px-1.5 pt-1.5 pb-1">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Search..."
              className="w-full px-2 py-1 text-xs rounded bg-gray-100 border border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none dark:bg-white/10 dark:border-white/20 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-white/40"
            />
          </div>
        )}
        <div className="py-0.5">
          {actions.map((subAction) => (
            <MenuAction
              key={subAction.id}
              action={subAction}
              onClose={onClose}
              onSubmenuOpen={handleNestedSubmenuOpen}
              onSubmenuClose={handleNestedSubmenuClose}
              openSubmenuId={nestedSubmenu?.id || null}
              onReplaceActions={setDynamicActions}
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
              searchable={action.searchable}
            />
          );
        })()}
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
  const [openSubmenu, setOpenSubmenu] = useState<{ id: string; position: { x: number; y: number }; maxHeight: number } | null>(null);
  const submenuCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number; maxHeight: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element;

      // Check if click is inside ANY context menu portal (main menu or nested submenus)
      if (target.closest?.("[data-context-menu]")) {
        return;
      }

      closeMenu();
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
      data-context-menu
      className="fixed z-[120] min-w-[180px] rounded-md border border-white/20 bg-white/95 shadow-lg backdrop-blur-sm dark:bg-gray-900/95 overflow-y-auto"
      style={initialMenuStyle}
    >
      {sections.map((section, sectionIndex) => (
        <div key={sectionIndex}>
          {/* Section title (optional) - compact styling */}
          {section.title && (
            <div className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
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
                      submenuRef={submenuRef}
                      searchable={action.searchable}
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
