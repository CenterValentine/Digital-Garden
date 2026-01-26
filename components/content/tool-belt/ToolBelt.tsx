"use client";

/**
 * ToolBelt Component
 *
 * A context-aware action bar for file viewers.
 * Provides file-type-specific actions (save, format, export, etc.)
 * with flexible positioning and styling.
 *
 * Usage:
 * ```tsx
 * <ToolBelt
 *   config={{
 *     position: "center",
 *     style: "compact",
 *     groups: [...]
 *   }}
 * />
 * ```
 */

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/glass/button";
import type { ToolBeltProps, ToolAction } from "./types";

export function ToolBelt({ config, onActionTriggered }: ToolBeltProps) {
  const { position, style, groups, alwaysVisible = false, className } = config;

  // Filter out hidden actions
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      actions: group.actions.filter((action) => !action.hidden),
    }))
    .filter((group) => group.actions.length > 0);

  if (visibleGroups.length === 0 && !alwaysVisible) {
    return null;
  }

  const handleActionClick = (action: ToolAction) => {
    if (action.disabled) return;
    action.onClick();
    onActionTriggered?.(action.id);
  };

  // Position-based container classes
  const containerClasses = cn(
    "tool-belt",
    {
      // Top position (below header)
      "absolute top-0 left-0 right-0 z-10": position === "top",
      // Bottom position (above status bar)
      "absolute bottom-0 left-0 right-0 z-10": position === "bottom",
      // Center floating (like JSON save button)
      "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20":
        position === "center",
      // Floating (positioned by parent)
      "relative z-10": position === "floating",
    },
    className
  );

  // Style-based layout classes
  const contentClasses = cn("flex items-center gap-2", {
    "gap-1": style === "compact",
    "gap-3": style === "expanded",
    "gap-0.5": style === "minimal",
  });

  return (
    <div className={containerClasses}>
      <div className={contentClasses}>
        {visibleGroups.map((group, groupIdx) => (
          <div key={group.id} className="flex items-center gap-2">
            {/* Separator before group (except first) */}
            {groupIdx > 0 && group.separator && (
              <div className="h-6 w-px bg-white/10" />
            )}

            {/* Group label (optional) */}
            {group.label && style === "expanded" && (
              <span className="text-xs text-gray-400 font-medium">
                {group.label}
              </span>
            )}

            {/* Actions in this group */}
            {group.actions.map((action) => (
              <ToolBeltAction
                key={action.id}
                action={action}
                style={style}
                onClick={() => handleActionClick(action)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Individual action button in the tool belt
 */
function ToolBeltAction({
  action,
  style,
  onClick,
}: {
  action: ToolAction;
  style: "compact" | "expanded" | "minimal";
  onClick: () => void;
}) {
  const { label, icon, disabled, variant = "default", tooltip, shortcut } = action;

  // For minimal style, render as icon-only button
  if (style === "minimal") {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        title={tooltip || label}
        className={cn(
          "p-1.5 rounded hover:bg-white/10 transition-colors",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        {icon}
      </button>
    );
  }

  // For compact style, render as small button
  if (style === "compact") {
    return (
      <Button
        onClick={onClick}
        disabled={disabled}
        variant="glass"
        size="sm"
        title={tooltip}
        className={cn(
          variant === "primary" && "bg-blue-500/20 hover:bg-blue-500/30",
          variant === "danger" && "bg-red-500/20 hover:bg-red-500/30",
          variant === "warning" && "bg-yellow-500/20 hover:bg-yellow-500/30",
          variant === "success" && "bg-green-500/20 hover:bg-green-500/30"
        )}
      >
        {icon && <span className="mr-2">{icon}</span>}
        {label}
      </Button>
    );
  }

  // For expanded style, render as full button with label and shortcut
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      variant="glass"
      title={tooltip}
      className={cn(
        variant === "primary" && "bg-blue-500/20 hover:bg-blue-500/30",
        variant === "danger" && "bg-red-500/20 hover:bg-red-500/30",
        variant === "warning" && "bg-yellow-500/20 hover:bg-yellow-500/30",
        variant === "success" && "bg-green-500/20 hover:bg-green-500/30"
      )}
    >
      {icon && <span className="mr-2">{icon}</span>}
      {label}
      {shortcut && (
        <span className="ml-2 text-xs text-gray-500 font-mono">{shortcut}</span>
      )}
    </Button>
  );
}
