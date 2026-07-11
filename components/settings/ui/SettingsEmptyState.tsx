import type { ReactNode } from "react";

import { cn } from "@/lib/core/utils";

interface SettingsEmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Honest empty/placeholder state for settings surfaces: coming-soon pages,
 * preview tabs running on sample data, and disabled-extension pages.
 */
export function SettingsEmptyState({
  icon,
  title,
  description,
  action,
  className,
}: SettingsEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-black/15 px-6 py-12 text-center dark:border-white/15",
        className
      )}
    >
      {icon && (
        <div className="text-muted-foreground [&_svg]:h-8 [&_svg]:w-8">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
